import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  computeFileHashes,
  execCommand,
  LARGE_PATCH_BYTES,
  parseJson,
  pathExists,
  registryArg,
  sanitizeOutput,
  UserError,
  writeJson,
} from './core.ts'
import { downloadRegistryTarball, fetchPackagePackument } from './registry.ts'
import { selectBaselineVersion } from './semver.ts'
import type {
  FileInventory,
  FileInventoryItem,
  JsonRecord,
  StageRecord,
} from './types.ts'

export function packageDirectoryKey(stage: StageRecord): string {
  const clean = `${stage.packageName}-${stage.version}`
    .replace(/^@/, '')
    .replaceAll(/[^\w.-]+/g, '-')
    .slice(0, 100)
  return `${clean}-${createHash('sha256').update(stage.id).digest('hex').slice(0, 8)}`
}

function stageTarballFilename(stage: StageRecord): string {
  const safeName = stage.packageName.replace('@', '').replace('/', '-')
  return `${safeName}-${stage.version}-${stage.id}.tgz`
}

function baselineTarballFilename(stage: StageRecord, version: string): string {
  const safeName = stage.packageName.replace('@', '').replace('/', '-')
  return `${safeName}-${version}.tgz`
}

export function integrityMatches(expected: unknown, actual: string): boolean {
  if (typeof expected !== 'string' || !expected.trim()) return false
  return expected.trim().split(/\s+/).includes(actual)
}

function validateTarPath(path: unknown): asserts path is string {
  if (
    typeof path !== 'string' ||
    !path ||
    path.startsWith('/') ||
    path.includes('\0') ||
    /[\r\n]/.test(path) ||
    path.split('/').includes('..')
  ) {
    throw new UserError(`Unsafe tar entry path: ${JSON.stringify(path)}`)
  }
}

async function readTarEntryBuffer(
  tarball: string,
  path: string,
  maxOutput: number,
): Promise<Buffer> {
  validateTarPath(path)
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('tar', ['-xOf', tarball, '--', `package/${path}`], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let size = 0
    let exceeded = false
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxOutput) {
        exceeded = true
        child.kill('SIGTERM')
      } else {
        stdout.push(chunk)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (exceeded) {
        rejectPromise(
          new UserError(`Tar entry exceeds extraction limit: ${path}`),
        )
        return
      }
      if (code !== 0) {
        rejectPromise(
          new UserError(
            `Unable to read tar entry ${path}: ${sanitizeOutput(Buffer.concat(stderr))}`,
          ),
        )
        return
      }
      resolvePromise(Buffer.concat(stdout))
    })
  })
}

async function readManifestFromTarball(tarball: string): Promise<JsonRecord> {
  const buffer = await readTarEntryBuffer(
    tarball,
    'package.json',
    2 * 1024 * 1024,
  )
  return parseJson(buffer.toString('utf8'), `${tarball}:package/package.json`)
}

function inventoryMap(files: unknown): FileInventory {
  const result = new Map<string, FileInventoryItem>()
  for (const item of Array.isArray(files) ? files : []) {
    if (!item || typeof item.path !== 'string') continue
    const path = item.path.replace(/^package\//, '')
    validateTarPath(path)
    result.set(path, {
      path,
      size: Number(item.size) || 0,
      mode: Number(item.mode) || 0,
    })
  }
  return result
}

async function inventoryFromTarball(tarball: string): Promise<FileInventory> {
  const output = (await execCommand('tar', ['-tf', tarball])).stdout
  const result: FileInventory = new Map()
  for (const rawPath of output.split(/\r?\n/)) {
    if (!rawPath || rawPath === 'package' || rawPath === 'package/') continue
    if (!rawPath.startsWith('package/')) {
      throw new UserError(`Unexpected tar entry outside package/: ${rawPath}`)
    }
    const path = rawPath.slice('package/'.length)
    validateTarPath(path)
    if (path.endsWith('/')) continue
    result.set(path, { path, size: 0, mode: 0 })
  }
  return result
}

function extractDownloadInfo(json: any, packageName: string): JsonRecord {
  if (!json || typeof json !== 'object')
    throw new UserError('npm stage download returned no data')
  if (json[packageName]) return json[packageName]
  const values = Object.values(json)
  if (values.length === 1) return values[0] as JsonRecord
  throw new UserError(
    `Unable to identify npm stage download metadata for ${packageName}`,
  )
}

async function locateOnlyTarball(
  directory: string,
  preferredName: string,
): Promise<string> {
  const preferred = join(directory, preferredName)
  if (await pathExists(preferred)) return preferred
  const matches = (await readdir(directory))
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => join(directory, name))
  if (matches.length !== 1) {
    throw new UserError(
      `Expected exactly one downloaded tarball in ${directory}`,
    )
  }
  return matches[0]
}

export async function downloadStagedTarball(
  stage: StageRecord,
  packageDir: string,
  registry: string,
): Promise<JsonRecord> {
  const args = ['stage', 'download', stage.id, '--json', registryArg(registry)]
  const result = await execCommand('npm', args, { cwd: packageDir })
  const metadata = extractDownloadInfo(
    parseJson(result.stdout, 'npm stage download'),
    stage.packageName,
  )
  const tarball = await locateOnlyTarball(
    packageDir,
    stageTarballFilename(stage),
  )
  const hashes = await computeFileHashes(tarball)
  const automaticApprovalBlockers: string[] = []
  if (!stage.shasum)
    automaticApprovalBlockers.push('STAGED_REGISTRY_SHASUM_MISSING')
  if (
    metadata.name !== stage.packageName ||
    metadata.version !== stage.version
  ) {
    automaticApprovalBlockers.push('STAGED_DOWNLOAD_IDENTITY_MISMATCH')
  }
  if (stage.shasum && hashes.sha1 !== stage.shasum) {
    automaticApprovalBlockers.push('STAGED_SHASUM_MISMATCH')
  }
  if (metadata.shasum && hashes.sha1 !== metadata.shasum) {
    automaticApprovalBlockers.push('STAGED_DOWNLOAD_SHASUM_MISMATCH')
  }
  const manifest = await readManifestFromTarball(tarball)
  if (
    manifest.name !== stage.packageName ||
    manifest.version !== stage.version
  ) {
    automaticApprovalBlockers.push('STAGED_MANIFEST_IDENTITY_MISMATCH')
  }
  return {
    tarball,
    metadata,
    hashes,
    manifest,
    inventory: inventoryMap(metadata.files),
    automaticApprovalBlockers,
  }
}

async function createSyntheticBaseline(
  stage: StageRecord,
  packageDir: string,
): Promise<JsonRecord> {
  const root = join(packageDir, 'synthetic-baseline')
  const packageRoot = join(root, 'package')
  await mkdir(packageRoot, { recursive: true, mode: 0o700 })
  await writeJson(join(packageRoot, 'package.json'), {
    name: stage.packageName,
    version: '0.0.0',
  })
  const tarball = join(packageDir, 'synthetic-empty-baseline.tgz')
  await execCommand('tar', ['-czf', tarball, '-C', root, 'package'])
  return {
    version: null,
    tarball,
    manifest: { name: stage.packageName, version: '0.0.0' },
    inventory: new Map([
      ['package.json', { path: 'package.json', size: 0, mode: 0o644 }],
    ]),
    integrity: null,
    synthetic: true,
    automaticApprovalBlockers: ['NO_PUBLISHED_BASELINE'],
  }
}

export async function downloadBaselineTarball(
  stage: StageRecord,
  packageDir: string,
  registry: string,
): Promise<JsonRecord> {
  const packument = await fetchPackagePackument(stage.packageName, registry)
  const versions =
    packument.versions &&
    typeof packument.versions === 'object' &&
    !Array.isArray(packument.versions)
      ? Object.keys(packument.versions)
      : []
  const version = selectBaselineVersion(versions, stage.version)
  if (!version) return await createSyntheticBaseline(stage, packageDir)

  const dist = packument.versions[version]?.dist
  if (!dist || typeof dist.tarball !== 'string') {
    throw new UserError(
      `Registry metadata has no tarball URL for ${stage.packageName}@${version}`,
    )
  }
  const tarball = join(packageDir, baselineTarballFilename(stage, version))
  await downloadRegistryTarball(dist.tarball, tarball)
  const hashes = await computeFileHashes(tarball)
  const automaticApprovalBlockers: string[] = []
  const hasRegistryHash =
    dist &&
    (typeof dist.shasum === 'string' || typeof dist.integrity === 'string')
  if (!hasRegistryHash)
    automaticApprovalBlockers.push('BASELINE_REGISTRY_HASH_MISSING')
  if (dist?.shasum && dist.shasum !== hashes.sha1) {
    automaticApprovalBlockers.push('BASELINE_REGISTRY_SHASUM_MISMATCH')
  }
  if (dist?.integrity && !integrityMatches(dist.integrity, hashes.integrity)) {
    automaticApprovalBlockers.push('BASELINE_REGISTRY_INTEGRITY_MISMATCH')
  }
  const manifest = await readManifestFromTarball(tarball)
  if (manifest.name !== stage.packageName || manifest.version !== version) {
    automaticApprovalBlockers.push('BASELINE_MANIFEST_IDENTITY_MISMATCH')
  }
  const inventory = await inventoryFromTarball(tarball)
  return {
    version,
    tarball,
    manifest,
    inventory,
    integrity: {
      registry: {
        shasum: dist?.shasum ?? null,
        integrity: dist?.integrity ?? null,
        tarball: dist?.tarball ?? null,
      },
      local: hashes,
    },
    synthetic: false,
    automaticApprovalBlockers,
  }
}

export function classifyFileChanges(
  baseInventory: FileInventory,
  targetInventory: FileInventory,
  changedNames: string[],
): { added: string[]; removed: string[]; changed: string[] } {
  const added = [...targetInventory.keys()]
    .filter((path) => !baseInventory.has(path))
    .toSorted()
  const removed = [...baseInventory.keys()]
    .filter((path) => !targetInventory.has(path))
    .toSorted()
  const changed = changedNames
    .filter((path) => baseInventory.has(path) && targetInventory.has(path))
    .toSorted()
  return { added, removed, changed }
}

export async function produceDiff(
  baseTarball: string,
  targetTarball: string,
  packageDir: string,
): Promise<JsonRecord> {
  const common = [`--diff=${baseTarball}`, `--diff=${targetTarball}`]
  const nameResult = await execCommand(
    'npm',
    ['diff', ...common, '--diff-name-only'],
    {
      cwd: packageDir,
    },
  )
  const changedNames = nameResult.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
  const patchResult = await execCommand(
    'npm',
    ['diff', ...common, '--diff-unified=3'],
    {
      cwd: packageDir,
    },
  )
  const patchPath = join(packageDir, 'diff.patch')
  await writeFile(patchPath, patchResult.stdout, { mode: 0o600 })
  const namesPath = join(packageDir, 'changed-files.txt')
  await writeFile(
    namesPath,
    `${changedNames.join('\n')}${changedNames.length ? '\n' : ''}`,
    {
      mode: 0o600,
    },
  )
  const patchBuffer = Buffer.from(patchResult.stdout)
  return {
    changedNames,
    patchPath,
    namesPath,
    bytes: patchBuffer.length,
    sha256: createHash('sha256').update(patchBuffer).digest('hex'),
    large: patchBuffer.length > LARGE_PATCH_BYTES,
  }
}
