import { createHash } from 'node:crypto'
import { join } from 'node:path'
import process from 'node:process'
import { file as findUpFile } from 'empathic/find'
import {
  computeFileHashes,
  createReviewDirectory,
  ensureRequirements,
  execCommand,
  normalizeRegistry,
  REVIEW_FILE,
  sanitizeOutput,
  SENTINEL_NAME,
  writeJson,
} from './core.ts'
import {
  analyzePackageDependencies,
  buildApprovalOrder,
} from './dependencies.ts'
import { ensureNpmLogin } from './npm-auth.ts'
import { collectPackage } from './package-review.ts'
import { determineCollectMode, pollForStages } from './stages.ts'
import type { CollectOptions, JsonRecord, PackageReview } from './types.ts'

function serializablePackage(pkg: PackageReview): JsonRecord {
  return {
    key: pkg.key,
    stage: pkg.stage,
    baseline: pkg.baseline,
    staged: pkg.staged,
    artifacts: pkg.artifacts,
    patch: pkg.patch,
    fileChanges: pkg.fileChanges,
    dependencyDelta: pkg.dependencyDelta,
    dependencyReview: pkg.dependencyReview,
    automaticApprovalChecksPassed: pkg.automaticApprovalBlockers.length === 0,
    automaticApprovalBlockers: pkg.automaticApprovalBlockers,
  }
}

export async function collect(options: CollectOptions): Promise<JsonRecord> {
  const initialModeHint =
    options.workspaceRoot !== null || Boolean(findUpFile('pnpm-workspace.yaml'))
  const runtimes = await ensureRequirements({ workspaceMode: initialModeHint })
  const mode = await determineCollectMode(options)
  const registry = normalizeRegistry(
    options.registry ||
      (await execCommand('npm', ['config', 'get', 'registry'])).stdout.trim(),
  )
  await ensureNpmLogin(registry)
  const stages = await pollForStages(mode, registry, options)
  const reviewDir = await createReviewDirectory(options.outputDir)
  const reviewId = createHash('sha256')
    .update(
      `${Date.now()}\0${reviewDir}\0${stages.map((stage) => stage.id).join('\0')}`,
    )
    .digest('hex')
    .slice(0, 24)
  const sentinelPath = join(reviewDir, SENTINEL_NAME)
  const baseSentinel = {
    kind: 'review-npm-stage',
    reviewId,
    reviewDir,
    registry,
    status: 'collecting',
    createdAt: new Date().toISOString(),
  }
  await writeJson(sentinelPath, baseSentinel)

  try {
    const packages: PackageReview[] = []
    for (const stage of stages) {
      packages.push(await collectPackage(stage, reviewDir, registry))
    }
    const packageByName = new Map(
      packages.map((pkg) => [pkg.stage.packageName, pkg]),
    )
    const workspaceProjects =
      mode.kind === 'workspace' ? mode.workspace.all : []
    const workspaceByName = new Map(
      workspaceProjects
        .filter((project) => project.name)
        .map((project) => [project.name!, project]),
    )
    for (const pkg of packages) {
      await analyzePackageDependencies(
        pkg,
        packageByName,
        workspaceByName,
        registry,
      )
    }

    const graph = buildApprovalOrder(packages)
    const automaticApprovalBlockers: string[] = []
    if (graph.cycle)
      automaticApprovalBlockers.push('WORKSPACE_DEPENDENCY_CYCLE')
    for (const edge of graph.edges) {
      if (edge.rangeSatisfied !== true) {
        automaticApprovalBlockers.push(
          `${edge.to}:${
            edge.rangeSatisfied === false
              ? 'INTERNAL_DEPENDENCY_RANGE_MISMATCH'
              : 'INTERNAL_DEPENDENCY_RANGE_UNVERIFIED'
          }:${edge.from}`,
        )
      }
    }
    for (const pkg of packages) {
      for (const reason of pkg.automaticApprovalBlockers) {
        automaticApprovalBlockers.push(`${pkg.stage.packageName}:${reason}`)
      }
    }
    const warnings = [
      ...(mode.kind === 'workspace' ? mode.workspace.warnings : []),
      ...packages
        .filter((pkg) => pkg.patch.large)
        .map(
          (pkg) =>
            `${pkg.stage.packageName} patch is ${pkg.patch.bytes} bytes; coverage must be explicitly complete`,
        ),
    ]
    const review = {
      reviewId,
      createdAt: baseSentinel.createdAt,
      reviewDir,
      registry,
      runtimes,
      mode: mode.kind,
      warnings,
      automaticApprovalChecksPassed: automaticApprovalBlockers.length === 0,
      automaticApprovalBlockers: [
        ...new Set(automaticApprovalBlockers),
      ].toSorted(),
      dependencyGraph: graph,
      approvalOrder: graph.order,
      packages: packages.map(serializablePackage),
    }
    const reviewFile = join(reviewDir, REVIEW_FILE)
    await writeJson(reviewFile, review)
    const reviewHashes = await computeFileHashes(reviewFile)
    await writeJson(sentinelPath, {
      ...baseSentinel,
      status: 'ready',
      reviewFile,
      reviewSha256: reviewHashes.sha256,
      packageStageIds: stages.map((stage) => stage.id),
    })
    process.stdout.write(
      `${JSON.stringify({
        reviewDir,
        reviewFile,
        packageCount: packages.length,
        automaticApprovalChecksPassed: review.automaticApprovalChecksPassed,
        warnings,
      })}\n`,
    )
    return review
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await writeJson(sentinelPath, {
      ...baseSentinel,
      status: 'collection-failed',
      error: sanitizeOutput(message),
    })
    process.stderr.write(
      `${JSON.stringify({ status: 'collection-failed', reviewDir, sentinelPath })}\n`,
    )
    throw error
  }
}
