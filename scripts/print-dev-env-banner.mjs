/**
 * Prints which Supabase project local dev is using (reads .env then .env.local).
 * Run automatically via `pnpm dev`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/** .env.local overrides .env (same as Next.js). */
const env = {
  ...parseEnvFile(join(root, '.env')),
  ...parseEnvFile(join(root, '.env.local')),
}

const url = env.NEXT_PUBLIC_SUPABASE_URL || ''
const projectRef =
  url.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1]?.toLowerCase() || 'not configured'

const envLabel = (env.SUPABASE_ENV || env.NEXT_PUBLIC_SUPABASE_ENV || 'unset').trim().toLowerCase()
const appUrl = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const isProdLabel = envLabel === 'production' || envLabel === 'prod'
const isStagingLabel =
  envLabel === 'staging' || envLabel === 'development' || envLabel === 'dev'

const reset = '\x1b[0m'
const bold = '\x1b[1m'
const dim = '\x1b[2m'
const green = '\x1b[32m'
const yellow = '\x1b[33m'
const red = '\x1b[31m'
const cyan = '\x1b[36m'

let statusColor = yellow
let statusText = 'SUPABASE_ENV not set — add SUPABASE_ENV=staging or production to .env.local'

if (isStagingLabel) {
  statusColor = green
  statusText = 'Development / Staging (safe for local work)'
} else if (isProdLabel) {
  statusColor = red
  statusText = 'PRODUCTION Supabase — changes affect live data'
}

console.log('')
console.log(`${bold}${cyan}══════════════════════════════════════════════════════════════${reset}`)
console.log(`${bold}  FrontBill — local dev server${reset}`)
console.log(`${cyan}══════════════════════════════════════════════════════════════${reset}`)
console.log(`  ${dim}Supabase project${reset}  ${bold}${projectRef}${reset}`)
console.log(`  ${dim}SUPABASE_ENV${reset}       ${statusColor}${bold}${envLabel}${reset}`)
console.log(`  ${dim}Status${reset}            ${statusColor}${statusText}${reset}`)
console.log(`  ${dim}App URL${reset}           ${appUrl}`)
console.log(`${cyan}══════════════════════════════════════════════════════════════${reset}`)
if (isProdLabel) {
  console.log(
    `${red}${bold}  ⚠  Tip: use SUPABASE_ENV=staging and dev project keys in .env.local${reset}`,
  )
  console.log(`${cyan}══════════════════════════════════════════════════════════════${reset}`)
}
console.log('')
