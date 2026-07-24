import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { sanitizeOutput, UserError } from './core.ts'
import type { JsonRecord } from './types.ts'

const PACKUMENT_ACCEPT =
  'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'
const REGISTRY_TIMEOUT_MS = 60_000
const TARBALL_TIMEOUT_MS = 10 * 60_000

interface RegistryResponse {
  response: Response
  close: () => void
}

function encodedPackageName(name: string): string {
  return name.startsWith('@')
    ? `@${encodeURIComponent(name.slice(1))}`
    : encodeURIComponent(name)
}

function packageUrl(registry: string, name: string, version?: string): URL {
  const path = version
    ? `${encodedPackageName(name)}/${encodeURIComponent(version)}`
    : encodedPackageName(name)
  return new URL(path, registry)
}

async function registryResponse(
  url: URL,
  {
    accept = 'application/json',
    allowNotFound = false,
    timeoutMs = REGISTRY_TIMEOUT_MS,
  }: {
    accept?: string
    allowNotFound?: boolean
    timeoutMs?: number
  } = {},
): Promise<RegistryResponse | null> {
  let response: Response
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    response = await fetch(url, {
      headers: { accept },
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeout)
    const message = error instanceof Error ? error.message : String(error)
    throw new UserError(
      `Registry request failed for ${url}: ${sanitizeOutput(message)}`,
    )
  }

  if (allowNotFound && response.status === 404) {
    clearTimeout(timeout)
    return null
  }
  if (!response.ok) {
    let body: string
    try {
      body = sanitizeOutput(await response.text())
        .replaceAll(/\s+/g, ' ')
        .trim()
        .slice(0, 500)
    } finally {
      clearTimeout(timeout)
    }
    throw new UserError(
      `Registry request failed (${response.status}) for ${url}${body ? `: ${body}` : ''}`,
    )
  }
  return {
    response,
    close: () => clearTimeout(timeout),
  }
}

async function registryJson(
  url: URL,
  {
    accept = 'application/json',
    allowNotFound = false,
  }: { accept?: string; allowNotFound?: boolean } = {},
): Promise<JsonRecord | null> {
  const result = await registryResponse(url, { accept, allowNotFound })
  if (!result) return null

  let value: unknown
  try {
    value = await result.response.json()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new UserError(
      `Registry returned invalid JSON for ${url}: ${sanitizeOutput(message)}`,
    )
  } finally {
    result.close()
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UserError(`Registry returned invalid metadata for ${url}`)
  }
  return value as JsonRecord
}

function tarballUrl(rawUrl: unknown): URL {
  let url: URL
  try {
    url = new URL(String(rawUrl))
  } catch {
    throw new UserError(`Invalid registry tarball URL: ${rawUrl}`)
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new UserError(`Unsafe registry tarball URL: ${url}`)
  }
  return url
}

export async function fetchPackagePackument(
  name: string,
  registry: string,
): Promise<JsonRecord> {
  const value = await registryJson(packageUrl(registry, name), {
    accept: PACKUMENT_ACCEPT,
  })
  if (!value || (value.name && value.name !== name)) {
    throw new UserError(`Registry metadata identity mismatch for ${name}`)
  }
  return value
}

export async function fetchPackageVersion(
  name: string,
  version: string,
  registry: string,
  { allowNotFound = false }: { allowNotFound?: boolean } = {},
): Promise<JsonRecord | null> {
  const value = await registryJson(packageUrl(registry, name, version), {
    allowNotFound,
  })
  if (
    value &&
    ((value.name && value.name !== name) ||
      (value.version && value.version !== version))
  ) {
    throw new UserError(
      `Registry metadata identity mismatch for ${name}@${version}`,
    )
  }
  return value
}

export async function downloadRegistryTarball(
  rawUrl: unknown,
  destination: string,
): Promise<string> {
  const url = tarballUrl(rawUrl)
  const result = await registryResponse(url, {
    accept: 'application/octet-stream',
    timeoutMs: TARBALL_TIMEOUT_MS,
  })
  if (!result?.response.body) {
    result?.close()
    throw new UserError(
      `Registry returned an empty tarball response for ${url}`,
    )
  }
  try {
    await pipeline(
      Readable.fromWeb(result.response.body),
      createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
    )
  } catch (error) {
    await rm(destination, { force: true })
    const message = error instanceof Error ? error.message : String(error)
    throw new UserError(
      `Unable to download registry tarball ${url}: ${sanitizeOutput(message)}`,
    )
  } finally {
    result.close()
  }
  return destination
}
