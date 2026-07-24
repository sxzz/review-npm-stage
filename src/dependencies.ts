import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  execCommand,
  INSTALL_SCRIPT_NAMES,
  INSTALLABLE_FIELDS,
  registryArg,
  sanitizeOutput,
  writeJson,
} from './core.ts'
import { fieldDependencyMap } from './package-review.ts'
import { fetchPackageVersion } from './registry.ts'
import { aliasTarget, simpleRangeSatisfies } from './semver.ts'
import type { JsonRecord, PackageReview, WorkspaceProject } from './types.ts'

export function isRegistryDependencySpec(spec: unknown): boolean {
  if (typeof spec !== 'string' || !spec.trim()) return false
  return !/^(?:workspace:|file:|link:|git(?:\+|:)|https?:|github:|gitlab:|bitbucket:|\.{0,2}\/)/i.test(
    spec.trim(),
  )
}

function installLifecycleScripts(scripts: unknown): JsonRecord {
  if (!scripts || typeof scripts !== 'object') return {}
  const record = scripts as JsonRecord
  return Object.fromEntries(
    INSTALL_SCRIPT_NAMES.filter((name) => typeof record[name] === 'string').map(
      (name) => [name, record[name]],
    ),
  )
}

export async function packageVersionPublished(
  name: string,
  version: string,
  registry: string,
): Promise<boolean> {
  try {
    return Boolean(
      await fetchPackageVersion(name, version, registry, {
        allowNotFound: true,
      }),
    )
  } catch {
    return false
  }
}

function auditVulnerabilityCount(audit: JsonRecord): number | null {
  const vulnerabilities = audit?.metadata?.vulnerabilities
  if (!vulnerabilities || typeof vulnerabilities !== 'object') return null
  return Object.entries(vulnerabilities)
    .filter(([key]) => key !== 'total')
    .reduce((sum, [, value]) => sum + (Number(value) || 0), 0)
}

export function dependencyAuditBlockers(
  audit: JsonRecord,
  exitCode: number,
): string[] {
  const vulnerabilityCount = auditVulnerabilityCount(audit)
  if (audit?.error) return ['DEPENDENCY_AUDIT_FAILED']
  if (vulnerabilityCount === null) return ['DEPENDENCY_AUDIT_INCOMPLETE']
  if (vulnerabilityCount > 0) return ['DEPENDENCY_VULNERABILITIES_FOUND']
  if (exitCode !== 0) return ['DEPENDENCY_AUDIT_FAILED']
  return []
}

async function collectDependencyMetadata(
  name: string,
  version: string,
  registry: string,
): Promise<JsonRecord> {
  let metadata: JsonRecord | null
  try {
    metadata = await fetchPackageVersion(name, version, registry, {
      allowNotFound: true,
    })
  } catch (error) {
    return {
      error: sanitizeOutput(
        error instanceof Error ? error.message : String(error),
      ).trim(),
    }
  }
  if (!metadata) {
    return { error: `Registry metadata not found for ${name}@${version}` }
  }
  return {
    name: metadata.name ?? name,
    version: metadata.version ?? version,
    description: metadata.description ?? null,
    license: metadata.license ?? null,
    deprecated: metadata.deprecated ?? null,
    repository: metadata.repository ?? null,
    maintainers: metadata.maintainers ?? [],
    dist: metadata.dist ?? null,
    scripts: metadata.scripts ?? {},
    installLifecycleScripts: installLifecycleScripts(metadata?.scripts),
  }
}

async function auditExternalDependencies(
  pkg: PackageReview,
  dependencies: JsonRecord[],
  registry: string,
): Promise<{ result: JsonRecord; automaticApprovalBlockers: string[] }> {
  const auditDir = join(pkg.packageDir, 'dependency-audit')
  await mkdir(auditDir, { recursive: true, mode: 0o700 })
  const dependencyObject = Object.fromEntries(
    dependencies.map((item) => [item.name, item.spec]),
  )
  await writeJson(join(auditDir, 'package.json'), {
    name: 'review-npm-stage-dependency-audit',
    version: '0.0.0',
    private: true,
    dependencies: dependencyObject,
  })

  const installArgs = [
    'install',
    '--package-lock-only',
    '--ignore-scripts',
    '--no-fund',
    '--no-audit',
    '--package-lock=true',
    registryArg(registry),
  ]
  const install = await execCommand('npm', installArgs, {
    cwd: auditDir,
    allowFailure: true,
  })
  const result: JsonRecord = {
    install: {
      succeeded: install.exitCode === 0,
      error:
        install.exitCode === 0
          ? null
          : sanitizeOutput(install.stderr || install.stdout).trim(),
    },
    audit: null,
    dependencies: [],
  }
  const automaticApprovalBlockers: string[] = []
  if (install.exitCode !== 0) {
    automaticApprovalBlockers.push('DEPENDENCY_RESOLUTION_FAILED')
    return { result, automaticApprovalBlockers }
  }

  const lock = JSON.parse(
    await readFile(join(auditDir, 'package-lock.json'), 'utf8'),
  )
  const auditCommand = await execCommand(
    'npm',
    ['audit', '--json', registryArg(registry)],
    {
      cwd: auditDir,
      allowFailure: true,
    },
  )
  try {
    result.audit = JSON.parse(auditCommand.stdout)
  } catch (error) {
    result.audit = {
      error: error instanceof Error ? error.message : String(error),
    }
  }
  automaticApprovalBlockers.push(
    ...dependencyAuditBlockers(result.audit, auditCommand.exitCode),
  )

  for (const dependency of dependencies) {
    const lockEntry = lock.packages?.[`node_modules/${dependency.name}`]
    if (!lockEntry?.version) {
      result.dependencies.push({
        ...dependency,
        error: 'Direct dependency was not found in package-lock.json',
      })
      automaticApprovalBlockers.push(
        `DEPENDENCY_LOCK_ENTRY_MISSING:${dependency.name}`,
      )
      continue
    }
    const target = aliasTarget(dependency.name, dependency.spec)
    const resolvedName = lockEntry.name || target.packageName
    const metadata = await collectDependencyMetadata(
      resolvedName,
      lockEntry.version,
      registry,
    )
    if (metadata.error)
      automaticApprovalBlockers.push(
        `DEPENDENCY_METADATA_FAILED:${dependency.name}`,
      )
    if (metadata.deprecated)
      automaticApprovalBlockers.push(`DEPENDENCY_DEPRECATED:${dependency.name}`)
    if (
      metadata.installLifecycleScripts &&
      Object.keys(metadata.installLifecycleScripts).length > 0
    ) {
      automaticApprovalBlockers.push(
        `DEPENDENCY_INSTALL_SCRIPT_REQUIRES_REVIEW:${dependency.name}`,
      )
    }
    result.dependencies.push({
      ...dependency,
      resolvedName,
      resolvedVersion: lockEntry.version,
      integrity: lockEntry.integrity ?? null,
      metadata,
    })
  }
  return { result, automaticApprovalBlockers }
}

function allRuntimeDependencyEntries(manifest: JsonRecord): JsonRecord[] {
  const entries: JsonRecord[] = []
  for (const field of [...INSTALLABLE_FIELDS, 'peerDependencies']) {
    const values = fieldDependencyMap(manifest, field)
    for (const [name, spec] of Object.entries(values)) {
      entries.push({ name, spec: String(spec), field })
    }
  }
  return entries
}

export function buildApprovalOrder(packages: PackageReview[]): JsonRecord {
  const packageByName = new Map(
    packages.map((pkg) => [pkg.stage.packageName, pkg]),
  )
  const names = new Set(packageByName.keys())
  const edges: JsonRecord[] = []
  for (const pkg of packages) {
    for (const dependency of allRuntimeDependencyEntries(pkg.targetManifest)) {
      const target = aliasTarget(dependency.name, dependency.spec)
      if (
        target.packageName !== pkg.stage.packageName &&
        names.has(target.packageName)
      ) {
        const targetPackage = packageByName.get(target.packageName)!
        edges.push({
          from: target.packageName,
          to: pkg.stage.packageName,
          field: dependency.field,
          spec: dependency.spec,
          rangeSatisfied: simpleRangeSatisfies(
            targetPackage.stage.version,
            target.range,
          ),
        })
      }
    }
  }
  const uniqueEdges = [
    ...new Map(
      edges.map((edge) => [`${edge.from}\0${edge.to}`, edge]),
    ).values(),
  ].toSorted((a, b) =>
    `${a.from}\0${a.to}`.localeCompare(`${b.from}\0${b.to}`, 'en'),
  )
  const outgoing = new Map(
    packages.map((pkg) => [pkg.stage.packageName, [] as string[]]),
  )
  const indegree = new Map(packages.map((pkg) => [pkg.stage.packageName, 0]))
  for (const edge of uniqueEdges) {
    outgoing.get(edge.from)!.push(edge.to)
    indegree.set(edge.to, indegree.get(edge.to)! + 1)
  }
  const ready = [...indegree]
    .filter(([, value]) => value === 0)
    .map(([name]) => name)
    .toSorted((a, b) => a.localeCompare(b, 'en'))
  const order: string[] = []
  while (ready.length > 0) {
    const name = ready.shift()!
    order.push(name)
    for (const next of outgoing
      .get(name)!
      .toSorted((a, b) => a.localeCompare(b, 'en'))) {
      indegree.set(next, indegree.get(next)! - 1)
      if (indegree.get(next) === 0) {
        ready.push(next)
        ready.sort((a, b) => a.localeCompare(b, 'en'))
      }
    }
  }
  const cycle = order.length !== packages.length
  const cycleMembers = cycle
    ? [...indegree]
        .filter(([, value]) => value > 0)
        .map(([name]) => name)
        .toSorted((a, b) => a.localeCompare(b, 'en'))
    : []
  return {
    edges: uniqueEdges,
    cycle,
    cycleMembers,
    order: cycle
      ? packages
          .map((pkg) => pkg.stage.packageName)
          .toSorted((a, b) => a.localeCompare(b, 'en'))
      : order,
  }
}

export async function analyzePackageDependencies(
  pkg: PackageReview,
  packageByName: Map<string, PackageReview>,
  workspaceByName: Map<string, WorkspaceProject>,
  registry: string,
): Promise<void> {
  const internal: JsonRecord[] = []
  const external: JsonRecord[] = []
  const workspace: JsonRecord[] = []
  const nonRegistry: JsonRecord[] = []
  const automaticApprovalBlockers: string[] = []

  for (const dependency of pkg.dependencyDelta.installable.added) {
    const target = aliasTarget(dependency.name, dependency.spec)
    if (packageByName.has(target.packageName)) {
      const stagedVersion = packageByName.get(target.packageName)!.stage.version
      const rangeSatisfied = simpleRangeSatisfies(stagedVersion, target.range)
      internal.push({
        ...dependency,
        packageName: target.packageName,
        stagedVersion,
        rangeSatisfied,
      })
      if (rangeSatisfied !== true) {
        automaticApprovalBlockers.push(
          `${rangeSatisfied === false ? 'INTERNAL_DEPENDENCY_RANGE_MISMATCH' : 'INTERNAL_DEPENDENCY_RANGE_UNVERIFIED'}:${dependency.name}`,
        )
      }
      continue
    }
    if (workspaceByName.has(target.packageName)) {
      const project = workspaceByName.get(target.packageName)!
      const published =
        project.version &&
        project.name &&
        (await packageVersionPublished(project.name, project.version, registry))
      workspace.push({
        ...dependency,
        packageName: target.packageName,
        workspaceVersion: project.version,
        published: Boolean(published),
      })
      if (!published) {
        automaticApprovalBlockers.push(
          `UNPUBLISHED_WORKSPACE_DEPENDENCY:${target.packageName}`,
        )
      }
      continue
    }
    if (!isRegistryDependencySpec(dependency.spec)) {
      nonRegistry.push(dependency)
      automaticApprovalBlockers.push(
        `NON_REGISTRY_DEPENDENCY:${dependency.name}`,
      )
      continue
    }
    external.push(dependency)
  }

  let audit: JsonRecord = {
    install: { succeeded: true, error: null },
    audit: { metadata: { vulnerabilities: {} } },
    dependencies: [],
  }
  if (external.length > 0) {
    const auditResult = await auditExternalDependencies(pkg, external, registry)
    audit = auditResult.result
    automaticApprovalBlockers.push(...auditResult.automaticApprovalBlockers)
  }
  const review = { internal, workspace, external, nonRegistry, audit }
  await writeJson(pkg.artifacts.audit, review)
  pkg.dependencyReview = review
  pkg.automaticApprovalBlockers = [
    ...new Set([
      ...pkg.automaticApprovalBlockers,
      ...automaticApprovalBlockers,
    ]),
  ].toSorted()
}
