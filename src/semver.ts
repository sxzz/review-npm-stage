import {
  compare,
  satisfies,
  sortReversed,
  tryParse,
  tryParseRange,
  type SemVer,
} from 'verkit'
import { UserError } from './core.ts'

export function parseSemver(raw: unknown): SemVer | null {
  return typeof raw === 'string' ? tryParse(raw) : null
}

export function compareSemver(
  left: string | SemVer,
  right: string | SemVer,
): number {
  try {
    return compare(left, right)
  } catch {
    throw new UserError('Cannot compare invalid SemVer values')
  }
}

export function selectBaselineVersion(
  versions: unknown[],
  targetVersion: string,
): string | null {
  if (!tryParse(targetVersion)) {
    throw new UserError(`Target version is not valid SemVer: ${targetVersion}`)
  }
  const candidates = versions.filter(
    (version): version is string =>
      typeof version === 'string' &&
      tryParse(version) !== null &&
      compare(version, targetVersion) < 0,
  )
  return sortReversed(candidates)[0] ?? null
}

export function aliasTarget(
  name: string,
  spec: string,
): { declaredName: string; packageName: string; range: string } {
  if (typeof spec !== 'string' || !spec.startsWith('npm:')) {
    return { declaredName: name, packageName: name, range: spec }
  }
  const raw = spec.slice(4)
  const separator = raw.lastIndexOf('@')
  const packageName = separator > 0 ? raw.slice(0, separator) : raw
  const range = separator > 0 ? raw.slice(separator + 1) : '*'
  return { declaredName: name, packageName, range }
}

export function simpleRangeSatisfies(
  version: string,
  rawRange: string,
): boolean | null {
  if (!tryParse(version) || typeof rawRange !== 'string') return null
  const range = rawRange.trim()
  if (!range || range.startsWith('workspace:')) return null
  if (range.startsWith('npm:')) {
    return simpleRangeSatisfies(version, aliasTarget('', range).range)
  }
  const parsedRange = tryParseRange(range)
  return parsedRange ? satisfies(version, parsedRange) : null
}
