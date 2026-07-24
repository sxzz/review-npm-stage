import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import open from 'open'
import {
  CommandError,
  execCommand,
  MAX_COMMAND_OUTPUT,
  pathExists,
  registryArg,
  sanitizeOutput,
  UserError,
  UUID_RE,
  type CommandOutput,
} from './core.ts'
import type { JsonRecord } from './types.ts'

interface RegistryResult {
  body: JsonRecord
  response: Response
}

const REGISTRY_REQUEST_TIMEOUT_MS = 60_000
let npmUserAgentPromise: Promise<string> | null = null

function isNpmAuthenticationFailure(result: CommandOutput): boolean {
  return /\b(?:E401|ENEEDAUTH|401|unauthorized|not logged in|need auth)\b/i.test(
    `${result.stdout}\n${result.stderr}`,
  )
}

function validWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return /^https?:$/.test(new URL(value).protocol)
  } catch {
    return false
  }
}

async function openNpmAuthentication(
  url: string,
  operation: string,
): Promise<void> {
  if (!validWebUrl(url)) {
    throw new UserError(`npm returned an invalid ${operation} URL`)
  }
  const browser = process.env.REVIEW_NPM_STAGE_BROWSER
  await open(url, browser ? { app: { name: browser } } : undefined)
  process.stderr.write(
    `Opened ${operation} in your browser; waiting for completion.\n`,
  )
}

async function runNpmWebLogin(registry: string): Promise<void> {
  const args = [
    'login',
    '--auth-type=web',
    '--browser=false',
    registryArg(registry),
  ]
  const child = spawn('npm', args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let outputSize = 0
  let outputExceeded = false
  let browserOpen: Promise<void> | null = null
  let browserError: unknown = null
  let loginOutput = ''

  const capture = (target: Buffer[], chunk: Buffer) => {
    target.push(chunk)
    outputSize += chunk.length
    if (outputSize > MAX_COMMAND_OUTPUT && !outputExceeded) {
      outputExceeded = true
      child.kill('SIGTERM')
    }
  }
  child.stdout.on('data', (chunk: Buffer) => {
    capture(stdout, chunk)
    if (browserOpen) return
    loginOutput = `${loginOutput}${chunk.toString('utf8')}`.slice(-16_384)
    const match = loginOutput.match(/https?:\/\/\S+/)
    if (!match) return
    browserOpen = openNpmAuthentication(match[0], 'npm login').catch(
      (error) => {
        browserError = error
        child.kill('SIGTERM')
      },
    )
  })
  child.stderr.on('data', (chunk: Buffer) => capture(stderr, chunk))

  const exitCode = await new Promise<number>(
    (resolvePromise, rejectPromise) => {
      child.once('error', rejectPromise)
      child.once('close', (code) => resolvePromise(code ?? 1))
    },
  )
  await browserOpen
  if (browserError) throw browserError
  if (outputExceeded) {
    throw new UserError('npm login output exceeded the allowed size')
  }
  const result: CommandOutput = {
    exitCode,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  }
  if (exitCode !== 0) throw new CommandError('npm', args, result)
  if (!browserOpen) {
    throw new UserError('npm login did not provide a browser URL')
  }
}

export async function ensureNpmLogin(registry: string): Promise<string> {
  const whoamiArgs = ['whoami', registryArg(registry)]
  const current = await execCommand('npm', whoamiArgs, { allowFailure: true })
  const currentUsername = current.stdout.trim()
  if (current.exitCode === 0 && currentUsername) return currentUsername
  if (current.exitCode !== 0 && !isNpmAuthenticationFailure(current)) {
    throw new CommandError('npm', whoamiArgs, current)
  }

  process.stderr.write(
    `npm is not logged in to ${registry}; opening npm login in your browser.\n`,
  )
  await runNpmWebLogin(registry)

  const verified = await execCommand('npm', whoamiArgs, {
    allowFailure: true,
  })
  const username = verified.stdout.trim()
  if (verified.exitCode !== 0) {
    throw new CommandError('npm', whoamiArgs, verified)
  }
  if (!username) {
    throw new UserError(
      `npm login did not establish an authenticated session for ${registry}`,
    )
  }
  return username
}

function interpolateEnvironment(value: string): string {
  return value.replaceAll(/\$\{([^}]+)\}/g, (match, name: string) => {
    const replacement = process.env[name]
    return replacement === undefined ? match : replacement
  })
}

function parseNpmrc(contents: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    result.set(key, interpolateEnvironment(value))
  }
  return result
}

async function findProjectNpmrc(): Promise<string | null> {
  let directory = process.cwd()
  const root = parse(directory).root
  while (true) {
    const candidate = join(directory, '.npmrc')
    if (await pathExists(candidate)) return candidate
    if (directory === root) return null
    directory = dirname(directory)
  }
}

async function loadNpmConfig(): Promise<Map<string, string>> {
  const userConfig = resolve(
    process.env.NPM_CONFIG_USERCONFIG ||
      process.env.npm_config_userconfig ||
      join(homedir(), '.npmrc'),
  )
  const projectConfig = await findProjectNpmrc()
  const paths = [...new Set([userConfig, projectConfig].filter(Boolean))]
  const config = new Map<string, string>()
  for (const path of paths) {
    try {
      const parsed = parseNpmrc(await readFile(path!, 'utf8'))
      for (const [key, value] of parsed) config.set(key, value)
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : null
      if (code !== 'ENOENT') throw error
    }
  }
  return config
}

function registryAuthKey(
  registry: string,
  config: Map<string, string>,
): string | null {
  const parsed = new URL(registry)
  let prefix = `//${parsed.host}${parsed.pathname}`
  while (prefix.length > 2) {
    if (
      config.has(`${prefix}:_authToken`) ||
      config.has(`${prefix}:_auth`) ||
      (config.has(`${prefix}:username`) && config.has(`${prefix}:_password`))
    ) {
      return prefix
    }
    prefix = prefix.replace(/([^/]+|\/)$/, '')
  }
  return null
}

async function npmAuthorization(registry: string): Promise<string | null> {
  const config = await loadNpmConfig()
  const key = registryAuthKey(registry, config)
  if (!key) return null
  const token = config.get(`${key}:_authToken`)
  if (token) return `Bearer ${token}`
  const auth = config.get(`${key}:_auth`)
  if (auth) return `Basic ${auth}`
  const username = config.get(`${key}:username`)
  const encodedPassword = config.get(`${key}:_password`)
  if (!username || !encodedPassword) return null
  const password = Buffer.from(encodedPassword, 'base64').toString('utf8')
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

function npmUserAgent(): Promise<string> {
  npmUserAgentPromise ||= execCommand('npm', ['--version']).then((result) => {
    const npmVersion = result.stdout.trim()
    return `npm/${npmVersion} node/${process.version} ${process.platform} ${process.arch} workspaces/false`
  })
  return npmUserAgentPromise
}

async function registryRequest(
  url: URL,
  {
    authorization,
    method = 'GET',
    otp,
    sendAuthorization = true,
  }: {
    authorization: string | null
    method?: 'GET' | 'POST'
    otp?: string
    sendAuthorization?: boolean
  },
): Promise<RegistryResult> {
  const headers = new Headers({
    accept: 'application/json',
    'npm-auth-type': 'web',
    'npm-command': 'stage',
    'user-agent': await npmUserAgent(),
  })
  if (authorization && sendAuthorization) {
    headers.set('authorization', authorization)
  }
  if (otp) headers.set('npm-otp', otp)
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    REGISTRY_REQUEST_TIMEOUT_MS,
  )
  let response: Response
  try {
    response = await fetch(url, {
      headers,
      method,
      signal: controller.signal,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new UserError(
      `npm registry request failed for ${url}: ${sanitizeOutput(message)}`,
    )
  } finally {
    clearTimeout(timeout)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = {}
  }
  return {
    body:
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as JsonRecord)
        : {},
    response,
  }
}

function webAuthenticationUrls(
  result: RegistryResult,
): { authUrl: string; doneUrl: string } | null {
  if (!isOtpRequired(result)) return null
  if (!validWebUrl(result.body.authUrl) || !validWebUrl(result.body.doneUrl)) {
    return null
  }
  return {
    authUrl: result.body.authUrl,
    doneUrl: result.body.doneUrl,
  }
}

function isOtpRequired(result: RegistryResult): boolean {
  const challenge = result.response.headers.get('www-authenticate') || ''
  const message = [result.body.error, result.body.message]
    .filter((value) => typeof value === 'string')
    .join(' ')
  return (
    result.response.status === 401 &&
    (challenge.split(/,\s*/).some((value) => value.toLowerCase() === 'otp') ||
      /one-time pass/i.test(message))
  )
}

function approvalFailure(stageId: string, result: RegistryResult): UserError {
  const detail =
    typeof result.body.error === 'string'
      ? `: ${sanitizeOutput(result.body.error)}`
      : ''
  return new UserError(
    `npm registry approval failed (${result.response.status}) for stage ${stageId}${detail}`,
  )
}

async function waitForWebAuthentication(
  doneUrl: string,
  registry: string,
  authorization: string | null,
): Promise<string> {
  while (true) {
    const url = new URL(doneUrl)
    const result = await registryRequest(url, {
      authorization,
      sendAuthorization: url.origin === new URL(registry).origin,
    })
    if (result.response.status === 200) {
      if (typeof result.body.token !== 'string' || !result.body.token) {
        throw new UserError(
          'npm web authentication completed without a one-time token',
        )
      }
      return result.body.token
    }
    if (result.response.status !== 202) {
      throw new UserError(
        `npm web authentication returned unexpected status ${result.response.status}`,
      )
    }
    const retryAfter = Number(result.response.headers.get('retry-after')) * 1000
    await delay(retryAfter > 0 ? retryAfter : 1000)
  }
}

export async function approveNpmStage(
  stageId: string,
  registry: string,
): Promise<void> {
  if (!UUID_RE.test(stageId)) {
    throw new UserError(`Invalid npm stage ID: ${stageId}`)
  }
  const authorization = await npmAuthorization(registry)
  const endpoint = new URL(`-/stage/${stageId}/approve`, registry)
  const initial = await registryRequest(endpoint, {
    authorization,
    method: 'POST',
  })
  if (initial.response.ok) return
  const urls = webAuthenticationUrls(initial)
  if (!urls) throw approvalFailure(stageId, initial)

  await openNpmAuthentication(urls.authUrl, 'npm stage approve authentication')
  const otp = await waitForWebAuthentication(
    urls.doneUrl,
    registry,
    authorization,
  )
  const retry = await registryRequest(endpoint, {
    authorization,
    method: 'POST',
    otp,
  })
  if (!retry.response.ok) {
    throw approvalFailure(stageId, retry)
  }
}
