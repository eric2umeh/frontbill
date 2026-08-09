import { HELP_FAQ, type HelpFaqItem } from '@/lib/help/help-faq'

const STOP = new Set([
  'a',
  'an',
  'the',
  'i',
  'im',
  "i'm",
  'me',
  'my',
  'we',
  'you',
  'your',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'is',
  'are',
  'was',
  'be',
  'do',
  'does',
  'did',
  'how',
  'what',
  'where',
  'when',
  'why',
  'which',
  'can',
  'could',
  'should',
  'please',
  'help',
  'tell',
  'show',
  'about',
  'with',
  'from',
  'this',
  'that',
  'it',
  'at',
  'as',
  'so',
  'if',
])

function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[^a-z0-9'/\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokensOf(q: string): string[] {
  return q
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP.has(t))
}

function stemish(t: string): string {
  // Light stemming for plurals / common suffixes
  if (t.endsWith('ings') && t.length > 6) return t.slice(0, -1) // bookings → booking
  if (t.endsWith('ies') && t.length > 5) return `${t.slice(0, -3)}y`
  if (t.endsWith('ses') && t.length > 5) return t.slice(0, -2)
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1)
  return t
}

/** Score a user question against built-in FAQ (keyword match — no AI). */
export function matchHelpQuestion(raw: string): HelpFaqItem | null {
  const q = normalize(raw)
  if (!q) return null

  const tokens = tokensOf(q).map(stemish)
  if (tokens.length === 0) return null

  let best: HelpFaqItem | null = null
  let bestScore = 0

  for (const item of HELP_FAQ) {
    const aliases = (item.aliases || []).map(normalize)
    const keywords = (item.keywords || []).map((k) => normalize(k))
    const question = normalize(item.question)

    let score = 0

    // Exact / near-exact alias match wins strongly
    for (const alias of aliases) {
      if (!alias) continue
      if (q === alias || q.includes(alias) || alias.includes(q)) {
        score += 100
      } else {
        const aliasTokens = tokensOf(alias).map(stemish)
        const overlap = aliasTokens.filter((t) => tokens.includes(t)).length
        if (aliasTokens.length > 0 && overlap === aliasTokens.length) score += 80
        else if (overlap >= 2) score += 20 * overlap
      }
    }

    // Keyword hits (high weight)
    for (const kw of keywords) {
      const kwTokens = tokensOf(kw).map(stemish)
      if (kwTokens.length === 0) continue
      if (kwTokens.every((t) => tokens.includes(t) || q.includes(t))) {
        score += 25 * kwTokens.length
      } else {
        for (const t of kwTokens) {
          if (tokens.includes(t)) score += 12
        }
      }
    }

    // Question title token overlap
    const qTokens = tokensOf(question).map(stemish)
    for (const t of tokens) {
      if (qTokens.includes(t)) score += 8
    }

    // Weak body match only if we already have some signal (avoid "how/do/make" noise)
    if (score >= 12) {
      const body = normalize(`${item.answer} ${item.category}`)
      for (const t of tokens) {
        if (body.includes(t)) score += 1
      }
    }

    // Intent boosts for common verbs + topic
    if (tokens.includes('booking') || tokens.includes('book')) {
      if (item.id.startsWith('how-make-booking') || item.id.includes('booking')) score += 15
      if (item.id.includes('extend') || item.id.includes('refund')) score -= 20
    }
    if (tokens.includes('reservation') || tokens.includes('reserve')) {
      if (item.category === 'Reservations' || item.id.includes('reservation')) score += 20
      if (item.id.includes('refund') || item.id.includes('extend')) score -= 25
    }
    if (tokens.includes('refund')) {
      if (item.id.includes('refund')) score += 30
    }

    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }

  // Require a real topical hit (alias/keyword), not stop-word noise
  return bestScore >= 20 ? best : null
}

export const HELP_SUGGESTION_CHIPS = [
  'How do I make a booking?',
  'How do I make a reservation?',
  'What is the Daily book?',
  'Why must I choose an account for POS or Transfer?',
  'How do I extend a guest’s stay?',
  'What does Run Night Audit do?',
  'How do I check a guest out?',
  'How do I add a bank or POS account?',
] as const
