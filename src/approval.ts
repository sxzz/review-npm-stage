import { lstat, readFile, realpath, rm } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'

import {
  computeFileHashes,
  parseJson,
  REVIEW_FILE,
  REVIEW_PREFIX,
  SENTINEL_NAME,
  UserError,
  writeJson,
} from './core.ts'
import { packageVersionPublished } from './dependencies.ts'
import { approveNpmStage, ensureNpmLogin } from './npm-auth.ts'
import { stageIdentity } from './stages.ts'
import { validateVerdict } from './verdict.ts'
import type {
  ApproveOptions,
  CleanupOptions,
  JsonRecord,
  StageRecord,
} from './types.ts'

function sameStringSet(left: unknown, right: string[]): boolean {
  if (!Array.isArray(left) || left.some((value) => typeof value !== 'string'))
    return false
  return (
    left.length === right.length &&
    left.toSorted().every((value, index) => value === right.toSorted()[index])
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && item.length > 0)
  )
}

function hasConsistentAutomaticApprovalResult(value: JsonRecord): boolean {
  if (
    typeof value.automaticApprovalChecksPassed !== 'boolean' ||
    !isStringArray(value.automaticApprovalBlockers)
  ) {
    return false
  }
  return value.automaticApprovalChecksPassed
    ? value.automaticApprovalBlockers.length === 0
    : value.automaticApprovalBlockers.length > 0
}

async function assertReviewArtifact(
  root: string,
  inputPath: unknown,
): Promise<string> {
  if (typeof inputPath !== 'string' || !inputPath) {
    throw new UserError('Review artifact path is missing')
  }
  const requested = resolve(inputPath)
  const relativePath = relative(root, requested)
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new UserError(
      `Review artifact escapes the review directory: ${inputPath}`,
    )
  }
  const info = await lstat(requested)
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new UserError(
      `Review artifact must be a regular non-symlink file: ${inputPath}`,
    )
  }
  const actual = await realpath(requested)
  const actualRelative = relative(root, actual)
  if (
    actualRelative === '..' ||
    actualRelative.startsWith(`..${sep}`) ||
    isAbsolute(actualRelative)
  ) {
    throw new UserError(
      `Review artifact resolves outside the review directory: ${inputPath}`,
    )
  }
  return actual
}

async function validateReviewSnapshot(
  actual: string,
  sentinel: JsonRecord,
  review: JsonRecord,
): Promise<void> {
  if (
    review.reviewId !== sentinel.reviewId ||
    review.reviewDir !== actual ||
    review.registry !== sentinel.registry ||
    !hasConsistentAutomaticApprovalResult(review) ||
    !isStringArray(review.approvalOrder) ||
    !Array.isArray(review.packages) ||
    review.packages.length === 0
  ) {
    throw new UserError('review.json does not match the review sentinel')
  }
  const stageIds: string[] = []
  const packageNames = new Set<string>()
  for (const pkg of review.packages) {
    if (
      !pkg?.stage?.id ||
      typeof pkg.stage.packageName !== 'string' ||
      typeof pkg.stage.version !== 'string' ||
      typeof pkg.patch?.sha256 !== 'string' ||
      !hasConsistentAutomaticApprovalResult(pkg)
    ) {
      throw new UserError('review.json contains an invalid package record')
    }
    if (
      stageIds.includes(pkg.stage.id) ||
      packageNames.has(pkg.stage.packageName)
    ) {
      throw new UserError(
        'review.json contains duplicate stage IDs or package names',
      )
    }
    stageIds.push(pkg.stage.id)
    packageNames.add(pkg.stage.packageName)
    const patchPath = await assertReviewArtifact(actual, pkg.artifacts?.patch)
    const hashes = await computeFileHashes(patchPath)
    if (hashes.sha256 !== pkg.patch.sha256) {
      throw new UserError(
        `Stored patch hash mismatch for ${pkg.stage.packageName}`,
      )
    }
  }
  if (!sameStringSet(sentinel.packageStageIds, stageIds)) {
    throw new UserError(
      'review.json package set does not match the review sentinel',
    )
  }
}

async function assertReviewDirectory(
  inputPath: string,
): Promise<{ actual: string; sentinel: JsonRecord; sentinelPath: string }> {
  const requested = resolve(inputPath)
  const info = await lstat(requested)
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new UserError(
      'Review directory must be a real directory, not a symlink',
    )
  }
  const actual = await realpath(requested)
  if (!basename(actual).startsWith(REVIEW_PREFIX)) {
    throw new UserError(`Refusing unsafe review directory: ${actual}`)
  }
  const sentinelPath = await assertReviewArtifact(
    actual,
    join(actual, SENTINEL_NAME),
  )
  const sentinel = parseJson(await readFile(sentinelPath, 'utf8'), sentinelPath)
  if (
    sentinel.kind !== 'review-npm-stage' ||
    sentinel.reviewDir !== actual ||
    !isNonEmptyString(sentinel.reviewId) ||
    !isNonEmptyString(sentinel.registry) ||
    !isNonEmptyString(sentinel.status) ||
    !isNonEmptyString(sentinel.createdAt)
  ) {
    throw new UserError(`Invalid review sentinel in ${actual}`)
  }
  return { actual, sentinel, sentinelPath }
}

export async function approve(options: ApproveOptions): Promise<JsonRecord> {
  if (!options.reviewDir || !options.verdict) {
    throw new UserError('approve requires --review-dir and --verdict')
  }
  const { actual, sentinel, sentinelPath } = await assertReviewDirectory(
    options.reviewDir,
  )
  if (sentinel.status !== 'ready' && sentinel.status !== 'approval-failed') {
    throw new UserError(
      `Review is not ready for approval; current status is ${sentinel.status}`,
    )
  }
  const reviewPath = await assertReviewArtifact(
    actual,
    sentinel.reviewFile || join(actual, REVIEW_FILE),
  )
  const reviewHashes = await computeFileHashes(reviewPath)
  if (
    typeof sentinel.reviewSha256 !== 'string' ||
    reviewHashes.sha256 !== sentinel.reviewSha256
  ) {
    throw new UserError(
      'Stored review.json hash does not match the review sentinel',
    )
  }
  const review = parseJson(await readFile(reviewPath, 'utf8'), reviewPath)
  await validateReviewSnapshot(actual, sentinel, review)
  const verdictPath = isAbsolute(options.verdict)
    ? resolve(options.verdict)
    : resolve(process.cwd(), options.verdict)
  const verdict = validateVerdict(
    parseJson(await readFile(verdictPath, 'utf8'), verdictPath),
    review,
  )
  const automaticEligible =
    verdict.batchDecision === 'high-confidence' &&
    review.automaticApprovalChecksPassed === true &&
    verdict.packages.every(
      (pkg: JsonRecord) =>
        pkg.coverage === 'complete' &&
        pkg.breakingVersionCompliant === true &&
        pkg.findings.every(
          (finding: JsonRecord) =>
            !['high', 'critical'].includes(finding.severity),
        ),
    )
  if (!automaticEligible && !options.manualConfirmed) {
    throw new UserError(
      'Automatic approval checks did not pass. Obtain explicit user confirmation, then rerun with --manual-confirmed.',
    )
  }

  const packageByName = new Map<string, JsonRecord>(
    review.packages.map((pkg: JsonRecord) => [pkg.stage.packageName, pkg]),
  )
  const approvalNames: string[] = review.dependencyGraph?.cycle
    ? [...packageByName.keys()].toSorted((a, b) => a.localeCompare(b, 'en'))
    : review.approvalOrder
  const ordered: JsonRecord[] = approvalNames.map((name: string) => {
    const pkg = packageByName.get(name)
    if (!pkg)
      throw new UserError(`Approval order references unknown package ${name}`)
    return pkg
  })

  await ensureNpmLogin(review.registry)

  const approvalResult: JsonRecord = {
    reviewId: review.reviewId,
    startedAt: new Date().toISOString(),
    automaticEligible,
    manualConfirmed: options.manualConfirmed,
    approved: [],
    remaining: ordered.map((pkg: JsonRecord) => pkg.stage),
    status: 'in-progress',
  }
  const resultPath = join(actual, 'approval-result.json')
  await writeJson(resultPath, approvalResult)
  await writeJson(sentinelPath, { ...sentinel, status: 'approving' })

  for (const pkg of ordered) {
    let approved: boolean
    try {
      await approveNpmStage(pkg.stage.id, review.registry)
      approved = true
    } catch {
      approved = await packageVersionPublished(
        pkg.stage.packageName,
        pkg.stage.version,
        review.registry,
      )
    }
    if (!approved) {
      approvalResult.status = 'failed'
      approvalResult.error = `Approval failed for ${stageIdentity(pkg.stage)}`
      approvalResult.remaining = ordered
        .filter((item: JsonRecord) =>
          approvalResult.approved.every(
            (done: StageRecord) => done.id !== item.stage.id,
          ),
        )
        .map((item: JsonRecord) => item.stage)
      await writeJson(resultPath, approvalResult)
      await writeJson(sentinelPath, { ...sentinel, status: 'approval-failed' })
      throw new UserError(
        `${approvalResult.error}. Stop the batch; do not approve later packages automatically.`,
      )
    }
    approvalResult.approved.push(pkg.stage)
    approvalResult.remaining = ordered
      .filter((item: JsonRecord) =>
        approvalResult.approved.every(
          (done: StageRecord) => done.id !== item.stage.id,
        ),
      )
      .map((item: JsonRecord) => item.stage)
    await writeJson(resultPath, approvalResult)
  }

  approvalResult.status = 'approved'
  approvalResult.completedAt = new Date().toISOString()
  await writeJson(resultPath, approvalResult)
  await writeJson(sentinelPath, {
    ...sentinel,
    status: 'approved',
    approvalResult: resultPath,
  })
  process.stdout.write(
    `${JSON.stringify({
      status: 'approved',
      reviewDir: actual,
      packageCount: approvalResult.approved.length,
      approvalResult: resultPath,
    })}\n`,
  )
  return approvalResult
}

export async function cleanup(options: CleanupOptions): Promise<void> {
  if (!options.reviewDir) throw new UserError('cleanup requires --review-dir')
  const { actual } = await assertReviewDirectory(options.reviewDir)
  await rm(actual, { recursive: true, force: false, maxRetries: 2 })
  process.stdout.write(
    `${JSON.stringify({ status: 'removed', reviewDir: actual })}\n`,
  )
}
