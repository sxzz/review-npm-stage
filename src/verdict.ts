import { UserError } from './core.ts'
import type { JsonRecord } from './types.ts'

const FINDING_CATEGORIES = new Set([
  'malware',
  'supply-chain',
  'breaking-change',
  'api-change',
  'coverage',
  'integrity',
])

function assertStringArray(
  value: unknown,
  label: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item)
  ) {
    throw new UserError(`${label} must be an array of non-empty strings`)
  }
}

function assertExactKeys(
  value: JsonRecord,
  allowed: string[],
  label: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unexpected.length > 0) {
    throw new UserError(
      `${label} contains unexpected fields: ${unexpected.join(', ')}`,
    )
  }
}

export function validateVerdict(verdict: any, review: JsonRecord): JsonRecord {
  if (!verdict || typeof verdict !== 'object' || Array.isArray(verdict)) {
    throw new UserError('Verdict must be a JSON object')
  }
  assertExactKeys(verdict, ['batchDecision', 'summary', 'packages'], 'Verdict')
  if (
    !['high-confidence', 'needs-confirmation', 'block'].includes(
      verdict.batchDecision,
    )
  ) {
    throw new UserError('Verdict batchDecision is invalid')
  }
  if (typeof verdict.summary !== 'string' || !verdict.summary.trim()) {
    throw new UserError('Verdict summary must be a non-empty string')
  }
  if (!Array.isArray(verdict.packages)) {
    throw new UserError('Verdict packages must be an array')
  }
  const expectedById = new Map<string, JsonRecord>(
    review.packages.map((pkg: JsonRecord) => [pkg.stage.id, pkg]),
  )
  if (verdict.packages.length !== expectedById.size) {
    throw new UserError(
      'Verdict must contain every reviewed package exactly once',
    )
  }
  const seen = new Set<string>()
  for (const item of verdict.packages) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new UserError('Invalid package verdict')
    }
    assertExactKeys(
      item,
      [
        'stageId',
        'packageName',
        'version',
        'patchSha256',
        'coverage',
        'findings',
        'breakingVersionCompliant',
        'apiSummary',
      ],
      'Package verdict',
    )
    const expected = expectedById.get(item.stageId)
    if (!expected || seen.has(item.stageId)) {
      throw new UserError(
        `Unexpected or duplicate verdict stage ID: ${item.stageId}`,
      )
    }
    seen.add(item.stageId)
    if (
      item.packageName !== expected.stage.packageName ||
      item.version !== expected.stage.version
    ) {
      throw new UserError(`Verdict identity mismatch for stage ${item.stageId}`)
    }
    if (item.patchSha256 !== expected.patch.sha256) {
      throw new UserError(`Verdict patch hash mismatch for ${item.packageName}`)
    }
    if (!['complete', 'incomplete'].includes(item.coverage)) {
      throw new UserError(`Invalid coverage for ${item.packageName}`)
    }
    if (typeof item.breakingVersionCompliant !== 'boolean') {
      throw new UserError(
        `breakingVersionCompliant must be boolean for ${item.packageName}`,
      )
    }
    if (!Array.isArray(item.findings)) {
      throw new UserError(`findings must be an array for ${item.packageName}`)
    }
    for (const finding of item.findings) {
      if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
        throw new UserError(`Invalid finding for ${item.packageName}`)
      }
      assertExactKeys(
        finding,
        ['severity', 'category', 'title', 'evidence', 'disposition'],
        `${item.packageName} finding`,
      )
      if (
        !['info', 'low', 'medium', 'high', 'critical'].includes(
          finding.severity,
        ) ||
        !FINDING_CATEGORIES.has(finding.category) ||
        typeof finding.title !== 'string' ||
        !finding.title ||
        typeof finding.evidence !== 'string' ||
        !finding.evidence ||
        typeof finding.disposition !== 'string' ||
        !finding.disposition
      ) {
        throw new UserError(`Invalid finding for ${item.packageName}`)
      }
    }
    if (
      !item.apiSummary ||
      typeof item.apiSummary !== 'object' ||
      Array.isArray(item.apiSummary)
    ) {
      throw new UserError(`apiSummary is required for ${item.packageName}`)
    }
    assertExactKeys(
      item.apiSummary,
      ['added', 'removed', 'changed'],
      `${item.packageName}.apiSummary`,
    )
    for (const field of ['added', 'removed', 'changed']) {
      assertStringArray(
        item.apiSummary[field],
        `${item.packageName}.apiSummary.${field}`,
      )
    }
  }
  if (
    verdict.batchDecision === 'high-confidence' &&
    verdict.packages.some(
      (item: JsonRecord) =>
        item.coverage !== 'complete' ||
        item.breakingVersionCompliant !== true ||
        item.findings.some((finding: JsonRecord) =>
          ['high', 'critical'].includes(finding.severity),
        ),
    )
  ) {
    throw new UserError(
      'high-confidence verdict cannot contain incomplete coverage, noncompliant breaking changes, or high/critical findings',
    )
  }
  return verdict
}
