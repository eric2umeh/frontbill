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
  'made',
  'make',
  'get',
  'got',
  'use',
  'using',
])

const MONTHS = new Set([
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
])

/** Intent topics inferred from the user question. */
type Intent =
  | 'view_payments'
  | 'daily_book'
  | 'transactions'
  | 'create_booking'
  | 'checkout'
  | 'reservation'
  | 'extend'
  | 'night_audit'
  | 'outlet'
  | 'payment_account'
  | 'city_ledger'
  | 'expense'
  | 'report'
  | 'refund'
  | 'cashback'
  | 'room'
  | 'housekeeping'
  | 'maintenance'
  | 'supply'
  | 'users'
  | 'settings'
  | 'guest'
  | 'bulk'
  | 'event'
  | 'dashboard'
  | 'folio_payment'

const INTENT_RULES: { intent: Intent; re: RegExp }[] = [
  {
    intent: 'view_payments',
    re: /\b(check|see|view|find|look\s*up|list|show)\b.{0,40}\bpayments?\b|\bpayments?\b.{0,40}\b(made|received|taken|collected|for|on|by|date|yesterday|today|history)\b|\bpayment\s+history\b|\bmoney\s+(collected|received)\b/i,
  },
  {
    intent: 'daily_book',
    re: /\bdaily\s*book\b|\bsales\s*collection\b|\broom\s+revenue\b|\bfront\s*desk\s*pack\b/i,
  },
  {
    intent: 'transactions',
    re: /\btransactions?\b|\bledger\b|\ball\s+payments\b|\bpayment\s+list\b/i,
  },
  {
    intent: 'create_booking',
    re: /\b(make|create|new|add)\b.{0,20}\bbookings?\b|\bcheck[\s-]?in\b|\bbook\s+(a\s+)?(guest|room|stay)\b|\bwalk[\s-]?in\b/i,
  },
  { intent: 'checkout', re: /\bcheck[\s-]?out\b|\bleave\b.{0,15}\bguest\b/i },
  {
    intent: 'reservation',
    re: /\breservations?\b|\breserve\b|\badvance\b|\bdeposit\b|\bno[\s-]?show\b/i,
  },
  { intent: 'extend', re: /\bextend\b|\bextra\s+night|\bstay\s+longer\b/i },
  { intent: 'night_audit', re: /\bnight\s*audit\b|\bbackdate\b|\baudit\s*trail/i },
  { intent: 'outlet', re: /\boutlets?\b|\bpos\b|\brestaurant\b|\bbar\b|\blaundry\b|\bgym\b/i },
  {
    intent: 'payment_account',
    re: /\bpayment\s+accounts?\b|\bbank\s+account\b|\bpos\s+terminal\b|\bdestination\b/i,
  },
  { intent: 'city_ledger', re: /\bcity\s*ledger\b|\bcharge\s+to\s+(company|org)/i },
  { intent: 'expense', re: /\bexpenses?\b|\bbudget\b|\bexpenditure\b|\bmarket\s+retirement/i },
  { intent: 'report', re: /\breports?\b|\bp&l\b|\boccupancy\s+report\b/i },
  { intent: 'refund', re: /\brefunds?\b/i },
  { intent: 'cashback', re: /\bcashbacks?\b/i },
  { intent: 'room', re: /\brooms?\b|\broom\s+status\b|\booo\b/i },
  { intent: 'housekeeping', re: /\bhousekeeping\b|\bcleaning\b|\btask\s+board\b/i },
  { intent: 'maintenance', re: /\bmaintenance\b|\bwork\s*order\b/i },
  {
    intent: 'supply',
    re: /\bcentral\s*store\b|\bpurchasing\b|\bissue\s*out\b|\bkitchen\b|\bf&b\b|\bsupply\b/i,
  },
  { intent: 'users', re: /\busers?\b|\broles?\b|\bstaff\b|\bpermissions?\b/i },
  { intent: 'settings', re: /\bsettings?\b|\bcheckout\s+time\b|\bhotel\s+info\b|\blogo\b/i },
  { intent: 'guest', re: /\bguests?\b|\borgani[sz]ations?\b|\bguest\s*\/?\s*org\b/i },
  { intent: 'bulk', re: /\bbulk\b|\bgroup\s+booking\b/i },
  { intent: 'event', re: /\bevents?\b|\bhall\b|\bballroom\b/i },
  { intent: 'dashboard', re: /\bdashboard\b|\bquick\s+actions?\b/i },
  {
    intent: 'folio_payment',
    re: /\b(add|record|take)\b.{0,20}\b(payment|credit)\b|\bpay\s+(on\s+)?(folio|booking)\b/i,
  },
]

/** FAQ ids preferred for each intent (boost). */
const INTENT_FAQ_BOOST: Partial<Record<Intent, string[]>> = {
  view_payments: [
    'how-check-payments-by-date',
    'how-pick-date-daily-book',
    'what-is-daily-book',
    'daily-book-vs-transactions',
    'see-payments',
  ],
  daily_book: [
    'what-is-daily-book',
    'daily-book-vs-transactions',
    'how-pick-date-daily-book',
    'how-check-payments-by-date',
    'daily-book-zero',
    'room-vs-sales-collection',
  ],
  transactions: ['see-payments', 'daily-book-vs-transactions', 'how-check-payments-by-date'],
  create_booking: ['how-make-booking', 'reservations-vs-bookings', 'bulk-booking'],
  checkout: ['checkout-guest'],
  reservation: [
    'how-make-reservation',
    'reservations-vs-bookings',
    'reservation-checkin',
    'cancel-reservation',
    'advance-payment',
  ],
  extend: ['extend-stay-how', 'extend-stay-where'],
  night_audit: ['night-audit-what', 'backdate', 'night-audit-approvals'],
  outlet: ['outlet-pos', 'outlet-menu', 'room-charge-outlet'],
  payment_account: ['payment-accounts-why', 'add-payment-account'],
  city_ledger: ['city-ledger', 'settle-city-ledger'],
  expense: ['expenses', 'expense-categories'],
  report: ['reports'],
  refund: ['refunds'],
  cashback: ['cashback'],
  room: ['rooms'],
  housekeeping: ['housekeeping'],
  maintenance: ['maintenance'],
  supply: ['supply-chain', 'central-store', 'purchasing', 'kitchen'],
  users: ['users-roles'],
  settings: ['settings-hotel', 'who-settings', 'add-payment-account'],
  guest: ['guest-database', 'organizations'],
  bulk: ['bulk-booking'],
  event: ['events'],
  dashboard: ['what-is-dashboard', 'how-make-booking', 'getting-started'],
  folio_payment: ['add-payment-folio', 'add-charge', 'payment-methods', 'payment-accounts-why'],
}

/** FAQ ids to penalize hard when an intent is active. */
const INTENT_FAQ_PENALTY: Partial<Record<Intent, string[]>> = {
  view_payments: ['how-make-booking', 'how-make-reservation', 'bulk-booking', 'reservation-checkin'],
  daily_book: ['how-make-booking', 'how-make-reservation'],
  transactions: ['how-make-booking', 'how-make-reservation'],
  create_booking: ['refunds', 'extend-stay-how', 'how-check-payments-by-date'],
  reservation: ['refunds', 'extend-stay-how'],
}

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
  if (t.endsWith('ings') && t.length > 6) return t.slice(0, -1)
  if (t.endsWith('ies') && t.length > 5) return `${t.slice(0, -3)}y`
  if (t.endsWith('ses') && t.length > 5) return t.slice(0, -2)
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1)
  return t
}

function detectIntents(q: string): Set<Intent> {
  const found = new Set<Intent>()
  for (const rule of INTENT_RULES) {
    if (rule.re.test(q)) found.add(rule.intent)
  }

  // Date mention + "payment(s)" ⇒ view payments even if phrasing is odd
  const hasMonth = [...MONTHS].some((m) => q.includes(m))
  const hasDayOrdinal = /\b\d{1,2}(st|nd|rd|th)\b/.test(q) || /\b\d{1,2}[\/\-]\d{1,2}/.test(q)
  const hasPaymentWord = /\bpayments?\b/.test(q)
  if (hasPaymentWord && (hasMonth || hasDayOrdinal || /\b(yesterday|today|date)\b/.test(q))) {
    found.add('view_payments')
    found.add('daily_book')
  }

  return found
}

function phraseOverlapScore(query: string, phrase: string): number {
  const p = normalize(phrase)
  if (!p) return 0
  if (query === p) return 120
  // Only count substring if phrase is reasonably long (avoid "on", "pay")
  if (p.length >= 10 && (query.includes(p) || (p.length <= query.length + 8 && p.includes(query)))) {
    return 90
  }
  const aliasTokens = tokensOf(p).map(stemish)
  const qTokens = new Set(tokensOf(query).map(stemish))
  if (aliasTokens.length === 0) return 0
  const overlap = aliasTokens.filter((t) => qTokens.has(t)).length
  if (overlap === aliasTokens.length && aliasTokens.length >= 2) return 70
  if (overlap >= 3) return 18 * overlap
  if (overlap === 2 && aliasTokens.length <= 4) return 28
  return 0
}

/** Score a user question against built-in FAQ (keyword match — no AI). */
export function matchHelpQuestion(raw: string): HelpFaqItem | null {
  const q = normalize(raw)
  if (!q) return null

  const tokens = tokensOf(q).map(stemish)
  if (tokens.length === 0) return null

  const intents = detectIntents(q)
  const tokenSet = new Set(tokens)

  let best: HelpFaqItem | null = null
  let bestScore = 0

  for (const item of HELP_FAQ) {
    const aliases = item.aliases || []
    const keywords = item.keywords || []
    const question = normalize(item.question)

    let score = 0

    for (const alias of aliases) {
      score += phraseOverlapScore(q, alias)
    }

    for (const kw of keywords) {
      const kwTokens = tokensOf(normalize(kw)).map(stemish)
      if (kwTokens.length === 0) continue
      if (kwTokens.every((t) => tokenSet.has(t) || q.includes(t))) {
        score += 22 * kwTokens.length
      } else {
        for (const t of kwTokens) {
          if (tokenSet.has(t)) score += 10
        }
      }
    }

    const qTokens = tokensOf(question).map(stemish)
    for (const t of tokens) {
      if (qTokens.includes(t)) score += 6
    }

    // Intent boosts / penalties (fixes “payments on 6 Aug” → booking)
    for (const intent of intents) {
      const boostIds = INTENT_FAQ_BOOST[intent] || []
      if (boostIds.includes(item.id)) score += 55
      const penIds = INTENT_FAQ_PENALTY[intent] || []
      if (penIds.includes(item.id)) score -= 80
    }

    // Soft topic tags on FAQ items
    if (item.topics?.length) {
      for (const topic of item.topics) {
        if (intents.has(topic as Intent)) score += 25
      }
    }

    // "make bookings/reservations" → create how-tos, not "difference between"
    if (/\b(make|create|new|add)\b/.test(q) && (tokenSet.has('booking') || tokenSet.has('reservation'))) {
      if (item.id === 'reservations-vs-bookings') score -= 50
      if (item.id === 'how-make-booking' || item.id === 'how-make-reservation') score += 25
    }

    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }

  return bestScore >= 28 ? best : null
}

export const HELP_SUGGESTION_CHIPS = [
  'How do I check payments for a date?',
  'What is the Daily book?',
  'How do I make a booking?',
  'How do I make a reservation?',
  'Why must I choose an account for POS?',
  'How do I extend a guest’s stay?',
  'What does Run Night Audit do?',
  'How do I check a guest out?',
] as const
