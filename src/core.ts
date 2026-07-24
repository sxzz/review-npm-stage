import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { x } from 'tinyexec'
import { compare, tryParse } from 'verkit'
import type { JsonRecord } from './types.ts'
import type { Buffer } from 'node:buffer'

export const REVIEW_PREFIX = 'review-npm-stage-'
export const SENTINEL_NAME = '.review-npm-stage.json'
export const REVIEW_FILE = 'review.json'
export const MAX_COMMAND_OUTPUT = 256 * 1024 * 1024
export const LARGE_PATCH_BYTES = 200 * 1024
export const DEFAULT_TIMEOUT_SECONDS = 600
export const DEFAULT_INTERVAL_SECONDS = 1
export const INSTALL_SCRIPT_NAMES = [
  'preinstall',
  'install',
  'postinstall',
] as const
export const INSTALLABLE_FIELDS = [
  'dependencies',
  'optionalDependencies',
] as const
export const BUNDLED_FIELDS = [
  'bundledDependencies',
  'bundleDependencies',
] as const
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class UserError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UserError'
  }
}

export class CommandError extends Error {
  command: string
  args: string[]
  result: CommandOutput

  // eslint-disable-next-line unicorn/custom-error-definition
  constructor(command: string, args: string[], result: CommandOutput) {
    const rendered = [command, ...args].map(renderArg).join(' ')
    const detail = sanitizeOutput(result.stderr || result.stdout).trim()
    super(
      `Command failed (${result.exitCode}): ${rendered}${detail ? `\n${detail}` : ''}`,
    )
    this.name = 'CommandError'
    this.command = command
    this.args = args
    this.result = result
  }
}

export interface CommandOutput {
  exitCode: number
  stdout: string
  stderr: string
}

export interface ExecCommandOptions {
  cwd?: string
  allowFailure?: boolean
  maxOutput?: number
  env?: Record<string, string | undefined>
}

export function renderArg(value: unknown): string {
  const text = String(value)
  return /^[\w./:@=,+-]+$/.test(text) ? text : JSON.stringify(text)
}

export function sanitizeOutput(value: unknown): string {
  return String(value || '')
    .replaceAll(/(npm_[A-Za-z0-9]{20,})/g, '[REDACTED_NPM_TOKEN]')
    .replaceAll(/(Bearer\s+)[\w.~+/=-]+/gi, '$1[REDACTED]')
    .replaceAll(/((?:_authToken|npm-otp)\s*[=:]\s*)\S+/gi, '$1[REDACTED]')
}

export async function execCommand(
  command: string,
  args: string[],
  {
    cwd = process.cwd(),
    allowFailure = false,
    maxOutput = MAX_COMMAND_OUTPUT,
    env = process.env,
  }: ExecCommandOptions = {},
): Promise<CommandOutput> {
  const child = x(command, args, {
    nodePath: false,
    nodeOptions: {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  })

  let outputSize = 0
  let outputExceeded = false
  const capture = (chunk: Buffer) => {
    outputSize += chunk.length
    if (outputSize > maxOutput && !outputExceeded) {
      outputExceeded = true
      child.kill('SIGTERM')
    }
  }
  child.process?.stdout?.on('data', capture)
  child.process?.stderr?.on('data', capture)

  const output = await child
  if (outputExceeded) {
    throw new UserError(
      `Command output exceeded ${maxOutput} bytes: ${command} ${args.map(renderArg).join(' ')}`,
    )
  }
  const result: CommandOutput = {
    exitCode: output.exitCode ?? 1,
    stdout: output.stdout,
    stderr: output.stderr,
  }
  if (!allowFailure && result.exitCode !== 0) {
    throw new CommandError(command, args, result)
  }
  return result
}

export function parseJson(text: string, label: string): any {
  try {
    return JSON.parse(text)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new UserError(`${label} did not return valid JSON: ${message}`)
  }
}

export function normalizeRegistry(raw: string): string {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new UserError(`Invalid registry URL: ${raw}`)
  }
  if (parsed.username || parsed.password) {
    throw new UserError(
      'Do not place registry credentials in the registry URL; use npm configuration',
    )
  }
  return parsed.href
}

export function registryArg(registry: string): string {
  return `--registry=${registry}`
}

export function numericVersionAtLeast(raw: string, minimum: number[]): boolean {
  const version = tryParse(raw.replace(/^v/, ''))
  const target = {
    major: minimum[0] ?? 0,
    minor: minimum[1] ?? 0,
    patch: minimum[2] ?? 0,
  }
  return version ? compare(version, target) >= 0 : false
}

export async function ensureRequirements({
  workspaceMode = false,
}: { workspaceMode?: boolean } = {}): Promise<JsonRecord> {
  if (!numericVersionAtLeast(process.versions.node, [22, 18, 0])) {
    throw new UserError(
      `Node.js 22.18 or newer is required; found ${process.version}`,
    )
  }
  const npmVersion = (await execCommand('npm', ['--version'])).stdout.trim()
  if (!numericVersionAtLeast(npmVersion, [11, 15, 0])) {
    throw new UserError(`npm 11.15 or newer is required; found ${npmVersion}`)
  }
  await execCommand('tar', ['--version'])
  let pnpmVersion: string | null = null
  if (workspaceMode)
    pnpmVersion = (await execCommand('pnpm', ['--version'])).stdout.trim()
  return { node: process.version, npm: npmVersion, pnpm: pnpmVersion }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function readPackageManifest(path: string): Promise<JsonRecord> {
  const value = parseJson(await readFile(path, 'utf8'), path)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UserError(`${path} must contain a JSON object`)
  }
  return value
}

export async function createReviewDirectory(
  outputRoot: string | null = null,
): Promise<string> {
  const parent = outputRoot ? resolve(outputRoot) : tmpdir()
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(join(parent, REVIEW_PREFIX))
  await chmod(directory, 0o700)
  return await realpath(directory)
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

export async function computeFileHashes(path: string): Promise<JsonRecord> {
  const hashes = ['sha1', 'sha256', 'sha512'].map((algorithm) =>
    createHash(algorithm),
  )
  let size = 0
  for await (const chunk of createReadStream(path)) {
    size += chunk.length
    for (const hash of hashes) hash.update(chunk)
  }
  const [sha1, sha256, sha512] = hashes.map((hash) => hash.digest())
  return {
    size,
    sha1: sha1.toString('hex'),
    sha256: sha256.toString('hex'),
    sha512: sha512.toString('hex'),
    integrity: `sha512-${sha512.toString('base64')}`,
  }
}
