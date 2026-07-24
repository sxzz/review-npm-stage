#!/usr/bin/env node

import process from 'node:process'
import { runCli } from './cli.ts'
import { sanitizeOutput } from './core.ts'

runCli(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${sanitizeOutput(message)}\n`)
  if (
    process.env.REVIEW_NPM_STAGE_DEBUG === '1' &&
    error instanceof Error &&
    error.stack
  ) {
    process.stderr.write(`${sanitizeOutput(error.stack)}\n`)
  }
  process.exitCode = 1
})
