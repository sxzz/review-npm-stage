import { cac } from 'cac'
import { approve, cleanup } from './approval.ts'
import { collect } from './collect.ts'
import {
  DEFAULT_INTERVAL_SECONDS,
  DEFAULT_TIMEOUT_SECONDS,
  UserError,
} from './core.ts'
import type { ApproveOptions, CleanupOptions, CollectOptions } from './types.ts'

type RawOptions = Record<string, any>

function stringList(value: unknown): string[] {
  if (value === undefined) return []
  return (Array.isArray(value) ? value : [value]).map(String)
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function positiveNumber(
  raw: unknown,
  name: string,
  { allowZero = false }: { allowZero?: boolean } = {},
): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new UserError(
      `${name} must be ${allowZero ? 'a non-negative' : 'a positive'} number`,
    )
  }
  return value
}

export function collectOptionsFromCli(options: RawOptions): CollectOptions {
  const result: CollectOptions = {
    pnpmFilters: stringList(options.pnpmFilter),
    timeout: positiveNumber(
      options.timeout ?? DEFAULT_TIMEOUT_SECONDS,
      '--timeout',
    ),
    interval: positiveNumber(
      options.interval ?? DEFAULT_INTERVAL_SECONDS,
      '--interval',
    ),
    workspaceRoot: optionalString(options.pnpmWorkspace),
    registry: optionalString(options.registry),
    outputDir: optionalString(options.outputDir),
  }

  if (result.pnpmFilters.length > 0 && result.workspaceRoot === null) {
    throw new UserError('--pnpm-filter requires --pnpm-workspace')
  }
  return result
}

function approveOptionsFromCli(options: RawOptions): ApproveOptions {
  const result: ApproveOptions = {
    reviewDir: optionalString(options.reviewDir),
    verdict: optionalString(options.verdict),
    manualConfirmed: options.manualConfirmed === true,
  }
  if (!result.reviewDir || !result.verdict) {
    throw new UserError('approve requires --review-dir and --verdict')
  }
  return result
}

function cleanupOptionsFromCli(options: RawOptions): CleanupOptions {
  const result: CleanupOptions = {
    reviewDir: optionalString(options.reviewDir),
  }
  if (!result.reviewDir) {
    throw new UserError('cleanup requires --review-dir')
  }
  return result
}

export function createReviewCli() {
  const cli = cac('review-stage')

  cli
    .command('collect', 'Collect and verify staged package review artifacts')
    .option(
      '--pnpm-workspace <path>',
      'Discover packages from a pnpm workspace',
    )
    .option(
      '--pnpm-filter <selector>',
      'pnpm workspace filter; repeat as needed',
    )
    .option('--registry <url>', 'npm registry URL')
    .option('--timeout <seconds>', 'Total stage wait timeout', {
      default: DEFAULT_TIMEOUT_SECONDS,
    })
    .option('--interval <seconds>', 'Stage polling interval', {
      default: DEFAULT_INTERVAL_SECONDS,
    })
    .option(
      '--output-dir <path>',
      'Parent directory for private review artifacts',
    )
    .action(async (options: RawOptions) => {
      await collect(collectOptionsFromCli(options))
    })

  cli
    .command('approve', 'Approve a completely reviewed staged package batch')
    .option('--review-dir <path>', 'Collector review directory')
    .option('--verdict <file>', 'Schema-valid verdict JSON file')
    .option(
      '--manual-confirmed',
      'Record explicit user confirmation when automatic approval is unavailable',
    )
    .action(async (options: RawOptions) => {
      await approve(approveOptionsFromCli(options))
    })

  cli
    .command('cleanup', 'Remove a validated private review directory')
    .option('--review-dir <path>', 'Collector review directory')
    .action(async (options: RawOptions) => {
      await cleanup(cleanupOptionsFromCli(options))
    })

  cli.usage('<command> [options]')
  cli.help()
  return cli
}

export async function runCli(argv: string[]): Promise<void> {
  const cli = createReviewCli()
  if (argv.length === 2) {
    cli.outputHelp()
    return
  }

  const parsed = cli.parse(argv, { run: false })
  if (!cli.matchedCommand && parsed.args[0]) {
    throw new UserError(`Unknown command: ${parsed.args[0]}`)
  }
  await cli.runMatchedCommand()
}
