import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { collectOptionsFromCli, createReviewCli } from '../src/cli.ts'
import { execCommand } from '../src/core.ts'
import {
  buildApprovalOrder,
  dependencyAuditBlockers,
  isRegistryDependencySpec,
} from '../src/dependencies.ts'
import { classifyDependencyDelta } from '../src/package-review.ts'
import { fetchPackagePackument, fetchPackageVersion } from '../src/registry.ts'
import {
  compareSemver,
  parseSemver,
  selectBaselineVersion,
  simpleRangeSatisfies,
} from '../src/semver.ts'
import { integrityMatches } from '../src/tarballs.ts'
import { validateVerdict } from '../src/verdict.ts'

const SCRIPT_PATH = process.env.REVIEW_STAGE_SCRIPT
  ? resolve(process.env.REVIEW_STAGE_SCRIPT)
  : fileURLToPath(new URL('../src/review-stage.ts', import.meta.url))

function run(command, args, { cwd = process.cwd(), env = process.env } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      resolvePromise({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      })
    })
  })
}

async function hashFile(path) {
  const buffer = await readFile(path)
  return {
    sha1: createHash('sha1').update(buffer).digest('hex'),
    sha512: createHash('sha512').update(buffer).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(buffer).digest('base64')}`,
  }
}

async function makePackageTarball(root, label, manifest, files) {
  const source = join(root, `${label}-source`)
  const packageRoot = join(source, 'package')
  await mkdir(packageRoot, { recursive: true })
  await writeFile(
    join(packageRoot, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  for (const [path, content] of Object.entries(files)) {
    const target = join(packageRoot, path)
    await mkdir(resolve(target, '..'), { recursive: true })
    await writeFile(target, content)
  }
  const tarball = join(root, `${label}.tgz`)
  const tarResult = await run('tar', ['-czf', tarball, '-C', source, 'package'])
  assert.equal(tarResult.code, 0, tarResult.stderr)
  const inventory = []
  for (const path of ['package.json', ...Object.keys(files)]) {
    const info = await stat(join(packageRoot, path))
    inventory.push({ path, size: info.size, mode: info.mode & 0o777 })
  }
  return { tarball, inventory, hashes: await hashFile(tarball) }
}

test('cac CLI handles help, unknown options, and repeated values', async () => {
  const parsedCli = createReviewCli()
  parsedCli.parse(
    [
      process.execPath,
      'review-stage',
      'collect',
      '--pnpm-workspace',
      '/repo',
      '--pnpm-filter',
      './packages/**',
      '--pnpm-filter',
      '!./packages/private',
    ],
    { run: false },
  )
  assert.deepEqual(parsedCli.options.pnpmFilter, [
    './packages/**',
    '!./packages/private',
  ])

  const options = collectOptionsFromCli({
    pnpmWorkspace: '/repo',
    pnpmFilter: ['./packages/**', '!./packages/private'],
    timeout: '12.5',
    interval: '0.25',
  })
  assert.equal(options.workspaceRoot, '/repo')
  assert.deepEqual(options.pnpmFilters, [
    './packages/**',
    '!./packages/private',
  ])
  assert.equal(options.timeout, 12.5)
  assert.equal(options.interval, 0.25)
  const defaults = collectOptionsFromCli({})
  assert.equal(defaults.interval, 1)
  assert.throws(
    () =>
      collectOptionsFromCli({
        pnpmFilter: ['./packages/**'],
      }),
    /--pnpm-filter requires --pnpm-workspace/,
  )

  const help = await run(process.execPath, [SCRIPT_PATH, 'collect', '--help'])
  assert.equal(help.code, 0, help.stderr)
  assert.doesNotMatch(help.stdout, /--stage-id|--package-spec/)
  assert.doesNotMatch(help.stdout, /--settle/)
  assert.match(help.stdout, /--pnpm-workspace <path>/)
  assert.match(help.stdout, /--pnpm-filter <selector>/)

  const unknown = await run(process.execPath, [
    SCRIPT_PATH,
    'collect',
    '--unknown-option',
  ])
  assert.equal(unknown.code, 1)
  assert.match(unknown.stderr, /Unknown option/)
})

test('tinyexec command execution preserves failures and output limits', async () => {
  const failed = await execCommand(
    process.execPath,
    ['-e', 'process.stderr.write("expected failure"); process.exit(7)'],
    { allowFailure: true },
  )
  assert.equal(failed.exitCode, 7)
  assert.equal(failed.stderr, 'expected failure')

  await assert.rejects(
    execCommand(
      process.execPath,
      ['-e', 'process.stdout.write("x".repeat(4096))'],
      { maxOutput: 32 },
    ),
    /output exceeded 32 bytes/,
  )
})

test('SemVer comparison and baseline selection include prereleases', () => {
  assert.ok(parseSemver('5.0.0-beta.2+build.1'))
  assert.equal(compareSemver('5.0.0-beta.2', '5.0.0-beta.10'), -1)
  assert.equal(compareSemver('5.0.0', '5.0.0-rc.9'), 1)
  assert.equal(
    selectBaselineVersion(
      ['4.9.9', '5.0.0-alpha.1', '5.0.0', '5.2.0-beta.1', '6.0.0'],
      '5.2.0',
    ),
    '5.2.0-beta.1',
  )
  assert.equal(selectBaselineVersion(['4.9.9', '6.0.0'], '5.0.0'), '4.9.9')
  assert.equal(selectBaselineVersion(['6.0.0'], '5.0.0'), null)
})

test('simple internal ranges cover pnpm publish output forms', () => {
  assert.equal(simpleRangeSatisfies('1.5.0', '^1.2.0'), true)
  assert.equal(simpleRangeSatisfies('2.0.0', '^1.2.0'), false)
  assert.equal(simpleRangeSatisfies('0.2.8', '^0.2.1'), true)
  assert.equal(simpleRangeSatisfies('0.3.0', '^0.2.1'), false)
  assert.equal(simpleRangeSatisfies('1.2.9', '~1.2.0'), true)
  assert.equal(simpleRangeSatisfies('1.3.0', '~1.2.0'), false)
  assert.equal(simpleRangeSatisfies('2.1.0', '>=2.0.0 <3.0.0'), true)
  assert.equal(simpleRangeSatisfies('2.0.5', '^1.2.0 || ~2.0.0'), true)
  assert.equal(simpleRangeSatisfies('2.1.0', '^1.2.0 || ~2.0.0'), false)
  assert.equal(simpleRangeSatisfies('2.1.0', 'not-a-range'), null)
  assert.equal(simpleRangeSatisfies('1.0.0', 'workspace:*'), null)
})

test('dependency delta treats peer-to-runtime movement as new', () => {
  const base = {
    dependencies: { existing: '^1.0.0' },
    peerDependencies: { moved: '^2.0.0' },
    devDependencies: { dev: '^1.0.0' },
  }
  const target = {
    dependencies: { existing: '^1.1.0', moved: '^2.0.0', added: '^3.0.0' },
    optionalDependencies: { optional: '^4.0.0' },
    devDependencies: { dev: '^1.1.0' },
  }
  const delta = classifyDependencyDelta(base, target)
  assert.deepEqual(
    delta.installable.added.map((item) => item.name),
    ['added', 'moved', 'optional'],
  )
  assert.deepEqual(
    delta.installable.updated.map((item) => item.name),
    ['existing'],
  )
  assert.deepEqual(
    delta.devDependencies.updated.map((item) => item.name),
    ['dev'],
  )
})

test('dependency audit failures block automatic approval', () => {
  assert.deepEqual(
    dependencyAuditBlockers(
      { error: { code: 'ENETUNREACH', summary: 'network unavailable' } },
      1,
    ),
    ['DEPENDENCY_AUDIT_FAILED'],
  )
  assert.deepEqual(
    dependencyAuditBlockers(
      {
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 1,
            high: 0,
            critical: 0,
            total: 1,
          },
        },
      },
      1,
    ),
    ['DEPENDENCY_VULNERABILITIES_FOUND'],
  )
})

test('approval order is dependency-first and detects cycles', () => {
  const packages = [
    {
      stage: { packageName: 'consumer', version: '2.0.0' },
      targetManifest: { dependencies: { core: '^2.0.0' } },
    },
    {
      stage: { packageName: 'core', version: '2.1.0' },
      targetManifest: {},
    },
  ]
  const ordered = buildApprovalOrder(packages)
  assert.equal(ordered.cycle, false)
  assert.deepEqual(ordered.order, ['core', 'consumer'])
  assert.equal(ordered.edges[0].rangeSatisfied, true)

  const cycle = buildApprovalOrder([
    {
      stage: { packageName: 'a', version: '1.0.0' },
      targetManifest: { dependencies: { b: '^1.0.0' } },
    },
    {
      stage: { packageName: 'b', version: '1.0.0' },
      targetManifest: { dependencies: { a: '^1.0.0' } },
    },
  ])
  assert.equal(cycle.cycle, true)
  assert.deepEqual(cycle.order, ['a', 'b'])
})

test('registry and integrity helpers validate deterministic inputs', () => {
  assert.equal(isRegistryDependencySpec('^1.2.3'), true)
  assert.equal(isRegistryDependencySpec('npm:real-package@^1.0.0'), true)
  assert.equal(isRegistryDependencySpec('https://example.test/pkg.tgz'), false)
  assert.equal(isRegistryDependencySpec('workspace:*'), false)
  assert.equal(
    integrityMatches('sha512-AbCd sha256-other', 'sha512-AbCd'),
    true,
  )
})

test('registry client reads scoped packuments and exact versions directly', async (t) => {
  const requests = []
  const server = createServer((request, response) => {
    requests.push({
      url: request.url,
      accept: request.headers.accept,
    })
    response.setHeader('content-type', 'application/json')
    if (request.url === '/@scope%2Fpkg') {
      response.end(
        JSON.stringify({
          name: '@scope/pkg',
          versions: { '1.0.0': { version: '1.0.0' } },
        }),
      )
      return
    }
    if (request.url === '/@scope%2Fpkg/1.0.0') {
      response.end(JSON.stringify({ name: '@scope/pkg', version: '1.0.0' }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ error: 'not found' }))
  })
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  t.after(
    () =>
      new Promise((resolvePromise, rejectPromise) => {
        server.close((error) =>
          error ? rejectPromise(error) : resolvePromise(),
        )
      }),
  )
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const registry = `http://127.0.0.1:${address.port}/`

  const packument = await fetchPackagePackument('@scope/pkg', registry)
  assert.ok(packument.versions['1.0.0'])
  assert.equal(
    (await fetchPackageVersion('@scope/pkg', '1.0.0', registry))?.version,
    '1.0.0',
  )
  assert.equal(
    await fetchPackageVersion('@scope/pkg', '2.0.0', registry, {
      allowNotFound: true,
    }),
    null,
  )
  assert.deepEqual(
    requests.map((request) => request.url),
    ['/@scope%2Fpkg', '/@scope%2Fpkg/1.0.0', '/@scope%2Fpkg/2.0.0'],
  )
  assert.match(requests[0].accept, /application\/vnd\.npm\.install-v1\+json/)
})

test('verdict must match every reviewed patch', () => {
  const review = {
    packages: [
      {
        stage: {
          id: '11111111-1111-4111-8111-111111111111',
          packageName: 'pkg',
          version: '1.0.0',
        },
        patch: { sha256: 'a'.repeat(64) },
      },
    ],
  }
  const verdict = {
    batchDecision: 'high-confidence',
    summary: 'Complete review',
    packages: [
      {
        stageId: '11111111-1111-4111-8111-111111111111',
        packageName: 'pkg',
        version: '1.0.0',
        patchSha256: 'a'.repeat(64),
        coverage: 'complete',
        findings: [],
        breakingVersionCompliant: true,
        apiSummary: { added: [], removed: [], changed: [] },
      },
    ],
  }
  assert.equal(validateVerdict(verdict, review), verdict)
  assert.throws(
    () =>
      validateVerdict(
        {
          ...verdict,
          packages: [{ ...verdict.packages[0], patchSha256: 'b'.repeat(64) }],
        },
        review,
      ),
    /patch hash mismatch/,
  )
  assert.throws(
    () =>
      validateVerdict(
        {
          ...verdict,
          packages: [
            {
              ...verdict.packages[0],
              findings: [
                {
                  severity: 'low',
                  category: 'unknown',
                  title: 'Unknown category',
                  evidence: 'fixture',
                  disposition: 'fixture',
                },
              ],
            },
          ],
        },
        review,
      ),
    /Invalid finding/,
  )
  assert.throws(
    () =>
      validateVerdict(
        {
          ...verdict,
          packages: [
            {
              ...verdict.packages[0],
              findings: [
                {
                  severity: 'critical',
                  category: 'malware',
                  title: 'Remote payload execution',
                  evidence: 'postinstall downloads and executes a payload',
                  disposition: 'Unresolved',
                },
              ],
            },
          ],
        },
        review,
      ),
    /high-confidence verdict cannot contain/,
  )
})

test('complete fake-registry flow collects, approves, and cleans up safely', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'review-npm-stage-test-'))
  t.after(async () => {
    await rm(root, { recursive: true, force: true })
  })
  const baselineManifest = {
    name: 'fixture-package',
    version: '1.0.0',
    main: 'index.js',
  }
  const targetManifest = {
    name: 'fixture-package',
    version: '1.1.0',
    main: 'index.js',
  }
  const baseline = await makePackageTarball(
    root,
    'baseline',
    baselineManifest,
    {
      'index.js': 'export const value = 1\n',
    },
  )
  const target = await makePackageTarball(root, 'target', targetManifest, {
    'index.js':
      "export const value = 2\nexport const added = true\nexport const example = 'curl https://example.test/archive.tgz'\n",
  })
  const stage = {
    id: '11111111-1111-4111-8111-111111111111',
    packageName: 'fixture-package',
    version: '1.1.0',
    tag: 'latest',
    createdAt: '2026-07-24T00:00:00.000Z',
    actor: 'fixture',
    actorType: 'user',
    shasum: target.hashes.sha1,
  }
  const baselineTarball = await readFile(baseline.tarball)
  const registryRequests = []
  const baselineDownloadTimes = {}
  const approvalAuthState = join(root, 'npm-approval-auth-state')
  const approvalRequests = []
  const approvalPollRequests = []
  let approvalPolls = 0
  let registry
  const registryServer = createServer((request, response) => {
    registryRequests.push(request.url)
    if (
      request.method === 'POST' &&
      request.url === `/-/stage/${stage.id}/approve`
    ) {
      const otp = request.headers['npm-otp'] ?? null
      approvalRequests.push({
        authorization: request.headers.authorization ?? null,
        npmAuthType: request.headers['npm-auth-type'] ?? null,
        npmCommand: request.headers['npm-command'] ?? null,
        otp,
        userAgent: request.headers['user-agent'] ?? null,
      })
      response.setHeader('content-type', 'application/json')
      if (
        request.headers['npm-auth-type'] !== 'web' ||
        request.headers['npm-command'] !== 'stage'
      ) {
        response.statusCode = 401
        response.end(
          JSON.stringify({
            error:
              'You must provide a one-time pass. You can provide one using the "--otp" flag.',
          }),
        )
      } else if (otp === 'fixture-web-otp') {
        response.statusCode = 201
        response.end(JSON.stringify({ ok: true }))
      } else {
        response.statusCode = 401
        response.setHeader('www-authenticate', 'otp')
        response.end(
          JSON.stringify({
            error: 'one-time password required',
            authUrl: 'https://npm.test/approve/session',
            doneUrl: `${registry}-/npm/v1/approve-auth`,
          }),
        )
      }
      return
    }
    if (request.url === '/-/npm/v1/approve-auth') {
      approvalPollRequests.push(request.headers.authorization ?? null)
      response.setHeader('content-type', 'application/json')
      if (approvalPolls++ === 0 || !existsSync(approvalAuthState)) {
        response.statusCode = 202
        response.setHeader('retry-after', '0.01')
        response.end(JSON.stringify({ pending: true }))
      } else {
        response.end(JSON.stringify({ token: 'fixture-web-otp' }))
      }
      return
    }
    if (request.url === '/fixture-package') {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          name: 'fixture-package',
          versions: {
            '1.0.0': {
              name: 'fixture-package',
              version: '1.0.0',
              dist: {
                shasum: baseline.hashes.sha1,
                integrity: baseline.hashes.integrity,
                tarball: `${registry}fixture-package/-/fixture-package-1.0.0.tgz`,
              },
            },
          },
        }),
      )
      return
    }
    if (request.url === '/fixture-package/-/fixture-package-1.0.0.tgz') {
      baselineDownloadTimes.start = Date.now()
      response.setHeader('content-type', 'application/octet-stream')
      setTimeout(() => {
        response.end(baselineTarball)
        baselineDownloadTimes.end = Date.now()
      }, 500)
      return
    }
    response.setHeader('content-type', 'application/json')
    response.statusCode = 404
    response.end(JSON.stringify({ error: 'not found' }))
  })
  await new Promise((resolvePromise, rejectPromise) => {
    registryServer.once('error', rejectPromise)
    registryServer.listen(0, '127.0.0.1', resolvePromise)
  })
  t.after(
    () =>
      new Promise((resolvePromise, rejectPromise) => {
        registryServer.close((error) =>
          error ? rejectPromise(error) : resolvePromise(),
        )
      }),
  )
  const registryAddress = registryServer.address()
  assert.ok(registryAddress && typeof registryAddress === 'object')
  registry = `http://127.0.0.1:${registryAddress.port}/`
  const userConfig = join(root, '.npmrc')
  await writeFile(
    userConfig,
    `//${new URL(registry).host}/:_authToken=\${FIXTURE_NPM_TOKEN}\n`,
  )

  const realNpm = (await run('sh', ['-c', 'command -v npm'])).stdout.trim()
  assert.ok(realNpm)
  const fakeBin = join(root, 'bin')
  const fakeNpm = join(fakeBin, 'npm')
  const fakeBrowser = join(fakeBin, 'browser-opener')
  const commandLog = join(root, 'commands.log')
  const loginState = join(root, 'npm-login-state')
  await mkdir(fakeBin)
  const scenarioPath = join(root, 'scenario.json')
  await writeFile(
    scenarioPath,
    `${JSON.stringify({
      stage,
      targetTarball: target.tarball,
      targetInventory: target.inventory,
      targetHashes: target.hashes,
      realNpm,
      originalPath: process.env.PATH,
      commandLog,
      loginState,
      approvalAuthState,
      registry,
    })}\n`,
  )
  await writeFile(
    fakeNpm,
    String.raw`#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const s = JSON.parse(fs.readFileSync(process.env.FAKE_NPM_SCENARIO, 'utf8'))
const args = process.argv.slice(2)
const out = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n')
const log = event => fs.appendFileSync(s.commandLog, event + ' ' + Date.now() + '\n')
if (args[0] === '--version') {
  process.stdout.write('11.16.0\n')
} else if (args[0] === 'config' && args[1] === 'get' && args[2] === 'registry') {
  process.stdout.write(s.registry + '\n')
} else if (args[0] === 'whoami') {
  log('whoami')
  if (fs.existsSync(s.loginState)) {
    process.stdout.write('fixture-user\n')
  } else {
    process.stderr.write('npm error code ENEEDAUTH\nnpm error need auth Not logged in\n')
    process.exitCode = 1
  }
} else if (args[0] === 'login') {
  log('login')
  if (
    !args.includes('--auth-type=web') ||
    !args.includes('--browser=false') ||
    !args.includes('--registry=' + s.registry) ||
    process.stdin.isTTY ||
    process.stdout.isTTY
  ) {
    process.stderr.write('Expected non-TTY browser login against the selected registry\n')
    process.exitCode = 2
  } else {
    process.stdout.write('Login at:\nhttps://npm.test/login/session\n')
    const waitForBrowser = () => {
      if (fs.existsSync(s.loginState)) {
        process.stdout.write('Login completed\n')
      } else {
        setTimeout(waitForBrowser, 10)
      }
    }
    waitForBrowser()
  }
} else if (args[0] === 'stage' && args[1] === 'list') {
  log('stage-list')
  if (args[2] !== s.stage.packageName) {
    process.stderr.write('Expected package-scoped stage list\n')
    process.exitCode = 2
  } else {
    out([s.stage])
  }
} else if (args[0] === 'stage' && args[1] === 'download') {
  log('stage-download-start')
  const safeName = s.stage.packageName.replace('@', '').replace('/', '-')
  const filename = safeName + '-' + s.stage.version + '-' + s.stage.id + '.tgz'
  setTimeout(() => {
    fs.copyFileSync(s.targetTarball, path.join(process.cwd(), filename))
    out({
      [s.stage.packageName]: {
        name: s.stage.packageName,
        version: s.stage.version,
        files: s.targetInventory,
        shasum: s.targetHashes.sha1,
        integrity: s.targetHashes.integrity
      }
    })
    log('stage-download-end')
  }, 500)
} else if (args[0] === 'diff') {
  const result = spawnSync(s.realNpm, args, {
    cwd: process.cwd(),
    env: { ...process.env, PATH: s.originalPath },
    stdio: 'inherit'
  })
  process.exitCode = result.status || 0
} else if (args[0] === 'stage' && args[1] === 'approve') {
  log('stage-approve-cli')
  process.stderr.write('npm stage approve CLI must not be called\n')
  process.exitCode = 2
} else {
  process.stderr.write('Unexpected fake npm command: ' + JSON.stringify(args) + '\n')
  process.exitCode = 2
}
`,
    { mode: 0o755 },
  )
  await chmod(fakeNpm, 0o755)
  await writeFile(
    fakeBrowser,
    String.raw`#!/usr/bin/env node
const fs = require('node:fs')
const s = JSON.parse(fs.readFileSync(process.env.FAKE_NPM_SCENARIO, 'utf8'))
const url = process.argv.at(-1)
if (url === 'https://npm.test/login/session') {
  fs.appendFileSync(s.commandLog, 'login-browser-open ' + Date.now() + '\n')
  fs.writeFileSync(s.loginState, 'fixture-user\n')
} else if (url === 'https://npm.test/approve/session') {
  fs.appendFileSync(s.commandLog, 'approval-browser-open ' + Date.now() + '\n')
  fs.writeFileSync(s.approvalAuthState, 'approved\n')
} else {
  process.stderr.write('Unexpected browser URL: ' + url + '\n')
  process.exitCode = 2
}
`,
    { mode: 0o755 },
  )
  await chmod(fakeBrowser, 0o755)
  for (const command of ['open', 'xdg-open', 'gio']) {
    await symlink(fakeBrowser, join(fakeBin, command))
  }

  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    FAKE_NPM_SCENARIO: scenarioPath,
    REVIEW_NPM_STAGE_BROWSER: fakeBrowser,
    NPM_CONFIG_USERCONFIG: userConfig,
    FIXTURE_NPM_TOKEN: 'fixture-registry-token',
  }
  const outputRoot = join(root, 'reviews')
  const collect = await run(
    process.execPath,
    [
      SCRIPT_PATH,
      'collect',
      '--registry',
      registry,
      '--timeout',
      '2',
      '--interval',
      '0.05',
      '--output-dir',
      outputRoot,
    ],
    { cwd: join(root, 'target-source', 'package'), env },
  )
  assert.equal(collect.code, 0, collect.stderr)
  assert.match(collect.stderr, /opening npm login in your browser/)
  assert.match(collect.stderr, /Opened npm login in your browser/)
  const envelope = JSON.parse(collect.stdout)
  const originalReviewJson = await readFile(envelope.reviewFile, 'utf8')
  const review = JSON.parse(originalReviewJson)
  assert.equal(review.automaticApprovalChecksPassed, true)
  assert.equal(review.packages.length, 1)
  assert.equal(review.packages[0].baseline.version, '1.0.0')
  assert.equal('staticScan' in review.packages[0], false)
  assert.deepEqual(registryRequests, [
    '/fixture-package',
    '/fixture-package/-/fixture-package-1.0.0.tgz',
  ])
  assert.deepEqual(review.packages[0].dependencyReview.external, [])
  const commandLines = (await readFile(commandLog, 'utf8')).trim().split('\n')
  assert.deepEqual(
    commandLines.slice(0, 5).map((line) => line.split(' ', 1)[0]),
    ['whoami', 'login', 'login-browser-open', 'whoami', 'stage-list'],
  )
  const commandTimes = Object.fromEntries(
    commandLines.map((line) => {
      const [event, time] = line.split(' ', 2)
      return [event, Number(time)]
    }),
  )
  assert.ok(commandTimes['stage-download-start'] < baselineDownloadTimes.end)
  assert.ok(baselineDownloadTimes.start < commandTimes['stage-download-end'])
  assert.deepEqual(review.packages[0].fileChanges.changed, [
    'index.js',
    'package.json',
  ])
  const originalPatch = await readFile(
    review.packages[0].artifacts.patch,
    'utf8',
  )
  assert.match(originalPatch, /added = true/)
  assert.match(originalPatch, /curl https:\/\/example\.test/)

  const verdictPath = join(envelope.reviewDir, 'verdict.json')
  await writeFile(
    verdictPath,
    `${JSON.stringify(
      {
        batchDecision: 'high-confidence',
        summary: 'Fixture was reviewed completely.',
        packages: [
          {
            stageId: stage.id,
            packageName: stage.packageName,
            version: stage.version,
            patchSha256: review.packages[0].patch.sha256,
            coverage: 'complete',
            findings: [],
            breakingVersionCompliant: true,
            apiSummary: {
              added: ['added export'],
              removed: [],
              changed: ['value changed'],
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
  )

  await writeFile(
    envelope.reviewFile,
    `${JSON.stringify(
      { ...review, automaticApprovalChecksPassed: false },
      null,
      2,
    )}\n`,
  )
  const tamperedReviewApprove = await run(
    process.execPath,
    [
      SCRIPT_PATH,
      'approve',
      '--review-dir',
      envelope.reviewDir,
      '--verdict',
      verdictPath,
    ],
    { env },
  )
  assert.equal(tamperedReviewApprove.code, 1)
  assert.match(tamperedReviewApprove.stderr, /review\.json hash/)
  await writeFile(envelope.reviewFile, originalReviewJson)

  await writeFile(
    review.packages[0].artifacts.patch,
    `${originalPatch}\nTAMPERED\n`,
  )
  const tamperedApprove = await run(
    process.execPath,
    [
      SCRIPT_PATH,
      'approve',
      '--review-dir',
      envelope.reviewDir,
      '--verdict',
      verdictPath,
    ],
    { env },
  )
  assert.equal(tamperedApprove.code, 1)
  assert.match(tamperedApprove.stderr, /Stored patch hash mismatch/)
  await writeFile(review.packages[0].artifacts.patch, originalPatch)

  const approve = await run(
    process.execPath,
    [
      SCRIPT_PATH,
      'approve',
      '--review-dir',
      envelope.reviewDir,
      '--verdict',
      verdictPath,
    ],
    { env },
  )
  assert.equal(approve.code, 0, approve.stderr)
  assert.doesNotMatch(approve.stderr, /allocating a pseudo-terminal/)
  assert.match(
    approve.stderr,
    /Opened npm stage approve authentication in your browser/,
  )
  const approvalCommandEvents = (await readFile(commandLog, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => line.split(' ', 1)[0])
  assert.equal(
    approvalCommandEvents.filter((event) => event === 'stage-view').length,
    0,
  )
  assert.equal(
    approvalCommandEvents.filter((event) => event === 'login').length,
    1,
  )
  assert.equal(
    approvalCommandEvents.filter((event) => event === 'whoami').length,
    3,
  )
  assert.equal(
    approvalCommandEvents.filter((event) => event === 'approval-browser-open')
      .length,
    1,
  )
  assert.equal(
    approvalCommandEvents.filter((event) => event === 'stage-approve-cli')
      .length,
    0,
  )
  const expectedNpmUserAgent = `npm/11.16.0 node/${process.version} ${process.platform} ${process.arch} workspaces/false`
  assert.deepEqual(approvalRequests, [
    {
      authorization: 'Bearer fixture-registry-token',
      npmAuthType: 'web',
      npmCommand: 'stage',
      otp: null,
      userAgent: expectedNpmUserAgent,
    },
    {
      authorization: 'Bearer fixture-registry-token',
      npmAuthType: 'web',
      npmCommand: 'stage',
      otp: 'fixture-web-otp',
      userAgent: expectedNpmUserAgent,
    },
  ])
  assert.ok(approvalPollRequests.length >= 2)
  assert.ok(
    approvalPollRequests.every(
      (authorization) => authorization === 'Bearer fixture-registry-token',
    ),
  )

  const cleanup = await run(
    process.execPath,
    [SCRIPT_PATH, 'cleanup', '--review-dir', envelope.reviewDir],
    { env },
  )
  assert.equal(cleanup.code, 0, cleanup.stderr)
  await assert.rejects(access(envelope.reviewDir))
})
