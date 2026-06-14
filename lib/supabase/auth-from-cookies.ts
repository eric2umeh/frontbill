import { stringFromBase64URL } from '@supabase/ssr'

/** Read auth user from Supabase SSR cookies — no network round-trip. */

type CookieLike = { name: string; value: string }

const BASE64_PREFIX = 'base64-'

function decodeBase64Url(value: string): string {
  try {
    return stringFromBase64URL(value)
  } catch {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const pad = normalized.length % 4
    const padded = pad ? normalized + '='.repeat(4 - pad) : normalized
    return Buffer.from(padded, 'base64').toString('utf8')
  }
}

function parseJwtPayload(
  token: string,
): { sub?: string; email?: string; exp?: number } | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    return JSON.parse(decodeBase64Url(parts[1])) as {
      sub?: string
      email?: string
      exp?: number
    }
  } catch {
    return null
  }
}

function combineAuthCookieValue(allCookies: CookieLike[]): string | null {
  const authCookies = allCookies.filter(
    (c) => c.name.startsWith('sb-') && c.name.includes('auth-token'),
  )
  if (!authCookies.length) return null

  const baseKeys = new Set<string>()
  for (const cookie of authCookies) {
    const match = cookie.name.match(/^(.*)\.(\d+)$/)
    baseKeys.add(match ? match[1] : cookie.name)
  }

  for (const key of baseKeys) {
    let value = authCookies.find((c) => c.name === key)?.value ?? null

    if (!value) {
      const chunks: string[] = []
      for (let i = 0; ; i += 1) {
        const chunk = authCookies.find((c) => c.name === `${key}.${i}`)?.value
        if (!chunk) break
        chunks.push(chunk)
      }
      value = chunks.length ? chunks.join('') : null
    }

    if (!value) continue

    if (value.startsWith(BASE64_PREFIX)) {
      return decodeBase64Url(value.slice(BASE64_PREFIX.length))
    }
    return value
  }

  return null
}

export type CookieAuthUser = { id: string; email: string }

/** Returns user id/email when a non-expired access token is present in cookies. */
export function getAuthUserFromCookies(
  allCookies: CookieLike[],
): CookieAuthUser | null {
  const raw = combineAuthCookieValue(allCookies)
  if (!raw) return null

  try {
    const session = JSON.parse(raw) as {
      access_token?: string
      user?: { id?: string; email?: string }
    }
    const token = session?.access_token
    if (token && typeof token === 'string') {
      const payload = parseJwtPayload(token)
      if (payload?.sub) {
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          return null
        }
        return {
          id: payload.sub,
          email: typeof payload.email === 'string' ? payload.email : '',
        }
      }
    }

    const id = session?.user?.id
    if (id) {
      return {
        id,
        email: typeof session.user?.email === 'string' ? session.user.email : '',
      }
    }

    return null
  } catch {
    return null
  }
}
