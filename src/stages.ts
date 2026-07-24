import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { file as findUpFile } from 'empathic/find'
import {
  CommandError,
  execCommand,
  parseJson,
  pathExists,
  readPackageManifest,
  registryArg,
  UserError,
  UUID_RE,
} from './core.ts'
import { parseSemver } from './semver.ts'
import type {
  CollectMode,
  CollectOptions,
  StageRecord,
  WorkspaceInfo,
} from './types.ts'

function isVersionPolicyFailure(result: {
  stdout: string
  stderr: string
}): boolean {
  const text = `${result.stdout}\n${result.stderr}`
  return /pmOnFail|packageManager.*devEngines|configured to use .*pnpm/i.test(
    text,
  )
}

export async function discoverPnpmWorkspace(
  root: string,
  filters: string[],
): Promise<WorkspaceInfo> {
  const workspaceRoot = resolve(root)
  const workspaceFile = join(workspaceRoot, 'pnpm-workspace.yaml')
  if (!(await pathExists(workspaceFile))) {
    throw new UserError(`pnpm-workspace.yaml not found at ${workspaceRoot}`)
  }
  const baseArgs = [
    'list',
    '-r',
    '--depth',
    '-1',
    '--json',
    '--dir',
    workspaceRoot,
  ]
  for (const filter of filters) baseArgs.push('--filter', filter)
  let result = await execCommand('pnpm', baseArgs, { allowFailure: true })
  const warnings: string[] = []
  if (result.exitCode !== 0 && isVersionPolicyFailure(result)) {
    warnings.push(
      'pnpm project package-manager version policy was bypassed for the read-only workspace listing',
    )
    result = await execCommand('pnpm', ['--pm-on-fail=ignore', ...baseArgs], {
      allowFailure: true,
    })
  }
  if (result.exitCode !== 0) throw new CommandError('pnpm', baseArgs, result)
  const projects = parseJson(result.stdout, 'pnpm list')
  if (!Array.isArray(projects))
    throw new UserError('pnpm list did not return an array')

  const all = []
  for (const project of projects) {
    if (!project || typeof project !== 'object' || !project.path) continue
    let manifest
    try {
      manifest = await readPackageManifest(join(project.path, 'package.json'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`Skipped ${project.path}: ${message}`)
      continue
    }
    const name = project.name || manifest.name
    const version = project.version || manifest.version
    all.push({
      name: typeof name === 'string' ? name : null,
      version: typeof version === 'string' ? version : null,
      path: resolve(project.path),
      private: project.private === true || manifest.private === true,
    })
  }
  const candidates = all.filter(
    (project) =>
      project.name && parseSemver(project.version) && !project.private,
  )
  if (candidates.length === 0) {
    throw new UserError(
      'No publishable pnpm workspace packages with valid name and version were found',
    )
  }
  return { root: workspaceRoot, all, candidates, warnings }
}

function validateStageItem(item: any): StageRecord {
  if (!item || typeof item !== 'object')
    throw new UserError('Invalid npm stage item')
  if (!UUID_RE.test(item.id || ''))
    throw new UserError(`Invalid stage ID returned by npm: ${item.id}`)
  if (typeof item.packageName !== 'string' || !item.packageName) {
    throw new UserError(`Stage ${item.id} has no package name`)
  }
  if (!parseSemver(item.version)) {
    throw new UserError(`Stage ${item.id} has invalid SemVer ${item.version}`)
  }
  return {
    id: item.id,
    packageName: item.packageName,
    version: item.version,
    tag: item.tag ?? null,
    createdAt: item.createdAt ?? null,
    actor: item.actor ?? null,
    actorType: item.actorType ?? null,
    shasum: item.shasum ?? null,
  }
}

export async function npmStageList(
  registry: string,
  packageName: string | null = null,
): Promise<StageRecord[]> {
  const args = ['stage', 'list']
  if (packageName) args.push(packageName)
  args.push('--json', registryArg(registry))
  const result = await execCommand('npm', args)
  const items = parseJson(result.stdout, 'npm stage list')
  if (!Array.isArray(items))
    throw new UserError('npm stage list did not return an array')
  return items.map(validateStageItem)
}

export function stageIdentity(item: StageRecord): string {
  return `${item.packageName}@${item.version}`
}

export async function pollForStages(
  mode: CollectMode,
  registry: string,
  { timeout, interval }: Pick<CollectOptions, 'timeout' | 'interval'>,
): Promise<StageRecord[]> {
  const deadline = Date.now() + timeout * 1000

  while (true) {
    if (mode.kind === 'package') {
      const matches = (await npmStageList(registry, mode.target.name)).filter(
        (item) =>
          item.packageName === mode.target.name &&
          item.version === mode.target.version,
      )
      const unique = uniqueStages(matches)
      if (unique.length > 0) return unique
    } else {
      const candidates = new Set(
        mode.workspace.candidates.map(
          (project) => `${project.name}@${project.version}`,
        ),
      )
      const matches = (await npmStageList(registry)).filter((item) =>
        candidates.has(stageIdentity(item)),
      )
      const unique = uniqueStages(matches)
      if (unique.length > 0) return unique
    }
    if (Date.now() >= deadline) break
    await delay(Math.min(interval * 1000, Math.max(0, deadline - Date.now())))
  }
  throw new UserError(
    `Timed out after ${timeout} seconds waiting for the expected npm stage records`,
  )
}

function uniqueStages(items: StageRecord[]): StageRecord[] {
  const byId = new Map<string, StageRecord>()
  const byIdentity = new Map<string, string>()
  for (const item of items) {
    if (byId.has(item.id)) continue
    const identity = stageIdentity(item)
    if (byIdentity.has(identity)) {
      throw new UserError(`Multiple stage IDs matched ${identity}`)
    }
    byId.set(item.id, item)
    byIdentity.set(identity, item.id)
  }
  return [...byId.values()].toSorted((a, b) =>
    stageIdentity(a).localeCompare(stageIdentity(b), 'en'),
  )
}

export async function determineCollectMode(
  options: CollectOptions,
): Promise<CollectMode> {
  if (options.workspaceRoot) {
    const workspace = await discoverPnpmWorkspace(
      options.workspaceRoot,
      options.pnpmFilters,
    )
    return { kind: 'workspace', workspace }
  }

  const workspaceFile = findUpFile('pnpm-workspace.yaml')
  if (workspaceFile) {
    const workspace = await discoverPnpmWorkspace(dirname(workspaceFile), [])
    return { kind: 'workspace', workspace }
  }

  const packagePath = join(process.cwd(), 'package.json')
  if (!(await pathExists(packagePath))) {
    throw new UserError(
      'No pnpm-workspace.yaml or package.json found in the current project',
    )
  }
  const manifest = await readPackageManifest(packagePath)
  if (manifest.private === true)
    throw new UserError('The current package is private')
  if (!manifest.name || !parseSemver(manifest.version)) {
    throw new UserError(
      'The current package.json needs a name and exact SemVer version',
    )
  }
  return {
    kind: 'package',
    target: { name: manifest.name, version: manifest.version },
  }
}
