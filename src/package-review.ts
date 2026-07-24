import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { BUNDLED_FIELDS, INSTALLABLE_FIELDS, writeJson } from './core.ts'
import {
  classifyFileChanges,
  downloadBaselineTarball,
  downloadStagedTarball,
  packageDirectoryKey,
  produceDiff,
} from './tarballs.ts'
import type { JsonRecord, PackageReview, StageRecord } from './types.ts'

function bundledNames(manifest: JsonRecord): string[] {
  for (const field of BUNDLED_FIELDS) {
    if (Array.isArray(manifest?.[field])) {
      return manifest[field].filter(
        (name: unknown): name is string => typeof name === 'string',
      )
    }
  }
  return []
}

export function installableDependencyMap(
  manifest: JsonRecord,
): Map<string, JsonRecord> {
  const map = new Map<string, JsonRecord>()
  for (const field of INSTALLABLE_FIELDS) {
    const values = manifest?.[field]
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue
    for (const [name, spec] of Object.entries(values)) {
      const existing = map.get(name) || {
        name,
        spec: String(spec),
        fields: [],
      }
      existing.spec = String(spec)
      existing.fields.push(field)
      map.set(name, existing)
    }
  }
  for (const name of bundledNames(manifest)) {
    const existing = map.get(name) || { name, spec: null, fields: [] }
    existing.fields.push('bundledDependencies')
    map.set(name, existing)
  }
  return map
}

export function fieldDependencyMap(
  manifest: JsonRecord,
  field: string,
): JsonRecord {
  const value = manifest?.[field]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
}

function diffNamedSpecs(base: JsonRecord, target: JsonRecord): JsonRecord {
  const added: JsonRecord[] = []
  const removed: JsonRecord[] = []
  const updated: JsonRecord[] = []
  for (const [name, spec] of Object.entries(target)) {
    if (!(name in base)) added.push({ name, spec })
    else if (String(base[name]) !== String(spec)) {
      updated.push({ name, before: String(base[name]), after: String(spec) })
    }
  }
  for (const [name, spec] of Object.entries(base)) {
    if (!(name in target)) removed.push({ name, spec })
  }
  const byName = (a: JsonRecord, b: JsonRecord) =>
    a.name.localeCompare(b.name, 'en')
  return {
    added: added.toSorted(byName),
    removed: removed.toSorted(byName),
    updated: updated.toSorted(byName),
  }
}

export function classifyDependencyDelta(
  baseManifest: JsonRecord,
  targetManifest: JsonRecord,
): JsonRecord {
  const baseInstallable = installableDependencyMap(baseManifest)
  const targetInstallable = installableDependencyMap(targetManifest)
  const added: JsonRecord[] = []
  const removed: JsonRecord[] = []
  const updated: JsonRecord[] = []
  for (const [name, entry] of targetInstallable) {
    const before = baseInstallable.get(name)
    if (!before) added.push(entry)
    else if (
      before.spec !== entry.spec ||
      before.fields.join('\0') !== entry.fields.join('\0')
    ) {
      updated.push({
        name,
        before: { spec: before.spec, fields: before.fields },
        after: { spec: entry.spec, fields: entry.fields },
      })
    }
  }
  for (const [name, entry] of baseInstallable) {
    if (!targetInstallable.has(name)) removed.push(entry)
  }
  const byName = (a: JsonRecord, b: JsonRecord) =>
    a.name.localeCompare(b.name, 'en')
  return {
    installable: {
      added: added.toSorted(byName),
      removed: removed.toSorted(byName),
      updated: updated.toSorted(byName),
    },
    peerDependencies: diffNamedSpecs(
      fieldDependencyMap(baseManifest, 'peerDependencies'),
      fieldDependencyMap(targetManifest, 'peerDependencies'),
    ),
    devDependencies: diffNamedSpecs(
      fieldDependencyMap(baseManifest, 'devDependencies'),
      fieldDependencyMap(targetManifest, 'devDependencies'),
    ),
  }
}

export async function collectPackage(
  stage: StageRecord,
  reviewDir: string,
  registry: string,
): Promise<PackageReview> {
  const key = packageDirectoryKey(stage)
  const packageDir = join(reviewDir, 'packages', key)
  await mkdir(packageDir, { recursive: true, mode: 0o700 })
  const stagedDir = join(packageDir, 'staged')
  const baselineDir = join(packageDir, 'baseline')
  await Promise.all([
    mkdir(stagedDir, { recursive: true, mode: 0o700 }),
    mkdir(baselineDir, { recursive: true, mode: 0o700 }),
  ])
  const [staged, baseline] = await Promise.all([
    downloadStagedTarball(stage, stagedDir, registry),
    downloadBaselineTarball(stage, baselineDir, registry),
  ])
  await writeJson(join(packageDir, 'staged-package.json'), staged.manifest)
  await writeJson(join(packageDir, 'baseline-package.json'), baseline.manifest)

  const diff = await produceDiff(baseline.tarball, staged.tarball, packageDir)
  const fileChanges = classifyFileChanges(
    baseline.inventory,
    staged.inventory,
    diff.changedNames,
  )
  const dependencyDelta = classifyDependencyDelta(
    baseline.manifest,
    staged.manifest,
  )
  const automaticApprovalBlockers = [
    ...staged.automaticApprovalBlockers,
    ...baseline.automaticApprovalBlockers,
  ]

  return {
    key,
    packageDir,
    stage,
    baseline: {
      version: baseline.version,
      synthetic: baseline.synthetic,
      integrity: baseline.integrity,
    },
    staged: {
      integrity: {
        stageShasum: stage.shasum,
        downloadShasum: staged.metadata.shasum ?? null,
        local: staged.hashes,
      },
    },
    targetManifest: staged.manifest,
    baselineManifest: baseline.manifest,
    artifacts: {
      packageDir,
      patch: diff.patchPath,
      changedFiles: diff.namesPath,
      stagedManifest: join(packageDir, 'staged-package.json'),
      baselineManifest: join(packageDir, 'baseline-package.json'),
      stagedTarball: staged.tarball,
      baselineTarball: baseline.tarball,
      audit: join(packageDir, 'dependency-audit.json'),
    },
    patch: {
      bytes: diff.bytes,
      sha256: diff.sha256,
      large: diff.large,
    },
    fileChanges,
    dependencyDelta,
    dependencyReview: null,
    automaticApprovalBlockers: [
      ...new Set(automaticApprovalBlockers),
    ].toSorted(),
  }
}
