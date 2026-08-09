export type HelpFaqItem = {
  id: string
  category: string
  question: string
  answer: string
  /** Strong match terms — preferred over answer body text. */
  keywords?: string[]
  /** Extra phrases users type (e.g. "how do i make a booking"). */
  aliases?: string[]
}

/** Built-in product help — keyword match only; no AI backend. */
export const HELP_FAQ: HelpFaqItem[] = [
  // —— Getting started ——
  {
    id: 'getting-started',
    category: 'Getting started',
    question: 'I’m new — where should I start each day?',
    answer:
      '1) Open Bookings for today’s in-house guests.\n2) Take payments with the correct method (and bank/POS account for POS or Transfer).\n3) Check Daily book for yesterday/today before Night Audit.\n4) Run Night Audit when you close the business date.',
    keywords: ['new', 'start', 'daily', 'workflow', 'begin', 'first'],
    aliases: ['i am new', "i'm new", 'where do i start', 'getting started'],
  },
  {
    id: 'what-is-frontbill',
    category: 'Getting started',
    question: 'What is FrontBill?',
    answer:
      'FrontBill is your hotel front-office and accounting system: bookings, reservations, payments, outlets (POS), night audit, reports, and owner Daily book — in Nigerian Naira.',
    keywords: ['frontbill', 'what is', 'app', 'software', 'hotel'],
    aliases: ['what is this app', 'what does frontbill do'],
  },
  {
    id: 'mobile-tables',
    category: 'Getting started',
    question: 'Why do tables look different on my phone?',
    answer:
      'On mobile, Bookings, Transactions, and Daily book keep guest and amount visible, and put method, account, and dates under the guest name so the screen stays readable. That is normal.',
    keywords: ['mobile', 'phone', 'responsive', 'table'],
    aliases: ['phone view', 'small screen'],
  },

  // —— Bookings ——
  {
    id: 'how-make-booking',
    category: 'Bookings',
    question: 'How do I make a booking / check a guest in?',
    answer:
      '1) Go to Front Office → Bookings.\n2) Tap + New Booking (or use Check-in from the Dashboard).\n3) Enter guest details, room, check-in / check-out dates, and rate.\n4) Choose payment method. For POS or Transfer you must select a Payment account (bank/POS destination).\n5) Save — the guest appears as in-house on Bookings.',
    keywords: ['booking', 'bookings', 'checkin', 'check-in', 'walk-in', 'new booking'],
    aliases: [
      'how do i make bookings',
      'how do i make a booking',
      'how to book a guest',
      'how to check in',
      'create booking',
      'new booking',
      'walk in guest',
    ],
  },
  {
    id: 'bulk-booking',
    category: 'Bookings',
    question: 'How do I do a bulk booking (group)?',
    answer:
      'On Bookings, use Bulk Booking. Add multiple rooms/guests for the same group, set payment, then save. Group rooms can be managed together and opened from the bulk group page.',
    keywords: ['bulk', 'group', 'multiple rooms'],
    aliases: ['bulk booking', 'group booking', 'many rooms'],
  },
  {
    id: 'bookings-stay-date',
    category: 'Bookings',
    question: 'Why does Bookings show fewer guests than my manual list for a date?',
    answer:
      'Use the Stay date picker. It lists everyone in-house that hotel night (arrivals + stayovers), not only people who checked in that day. Clear the date to return to today’s in-house list.',
    keywords: ['stay date', 'in-house', 'stayovers', 'arrivals', 'manual', 'fewer'],
    aliases: ['missing guests', 'only 4 guests', 'not showing all guests'],
  },
  {
    id: 'extend-stay-how',
    category: 'Bookings',
    question: 'How do I extend a guest’s stay?',
    answer:
      'Open the booking (or use Extend Stay on the Bookings row). Choose the new check-out date and payment for the extra night(s). For POS/Transfer, pick the Payment account. The payment appears under Daily book → Additional (Extend stay etc), often with an EXT- reference.',
    keywords: ['extend', 'extension', 'extra night', 'prolong'],
    aliases: ['extend stay', 'add nights', 'extend guest'],
  },
  {
    id: 'extend-stay-where',
    category: 'Bookings',
    question: 'Where do extend-stay payments appear?',
    answer:
      'In Transactions (ledger) and in Daily book under “Additional (Extend stay etc)”. References often start with EXT-.',
    keywords: ['extend', 'additional', 'ext'],
    aliases: ['extend payment', 'additional extend'],
  },
  {
    id: 'checkout-guest',
    category: 'Bookings',
    question: 'How do I check a guest out?',
    answer:
      'On Bookings, open the guest folio or use the Out / Check out action. Clear any balance (cash, POS, transfer, or city ledger), then confirm checkout. The room becomes available after checkout.',
    keywords: ['checkout', 'check-out', 'check out', 'depart'],
    aliases: ['how to checkout', 'how do i check out', 'guest leaving'],
  },
  {
    id: 'add-charge',
    category: 'Bookings',
    question: 'How do I add a charge to a guest folio?',
    answer:
      'Open the booking → Add charge (or Charge). Enter description and amount. If the guest pays now with POS/Transfer, select the Payment account. The charge posts to the folio and can appear in Transactions.',
    keywords: ['charge', 'folio', 'add charge', 'incidentals'],
    aliases: ['post charge', 'extra charge on room'],
  },
  {
    id: 'room-change',
    category: 'Bookings',
    question: 'How do I change a guest’s room?',
    answer:
      'Open the booking and use the room change flow (may require Night Audit approval depending on your hotel rules). Pick the new room and confirm. Approvals appear under Night Audit if required.',
    keywords: ['room change', 'move room', 'switch room'],
    aliases: ['change room', 'move guest to another room'],
  },

  // —— Reservations ——
  {
    id: 'how-make-reservation',
    category: 'Reservations',
    question: 'How do I make a reservation?',
    answer:
      '1) Go to Front Office → Reservations / Events.\n2) Create a new reservation with guest, room type/room, and future check-in / check-out.\n3) Record any advance deposit (POS/Transfer needs a Payment account).\n4) On arrival day, check the guest in to convert the reservation into an in-house booking.',
    keywords: ['reservation', 'reservations', 'reserve', 'future', 'deposit', 'advance'],
    aliases: [
      'how do i make reservations',
      'how do i make a reservation',
      'how to reserve',
      'create reservation',
      'new reservation',
      'book for later',
    ],
  },
  {
    id: 'reservation-checkin',
    category: 'Reservations',
    question: 'How do I check in a reservation?',
    answer:
      'Open Reservations, find the reserved guest, then Check in. Confirm room and payment. The stay moves to Bookings as checked-in.',
    keywords: ['check in reservation', 'convert reservation', 'arrive'],
    aliases: ['checkin reservation', 'reservation to booking'],
  },
  {
    id: 'reservations-vs-bookings',
    category: 'Reservations',
    question: 'What is the difference between Reservations and Bookings?',
    answer:
      'Reservations = future stay (not yet in-house). Bookings = live folio while the guest is staying. Advance money taken on a reservation shows as Advance payment in Daily book on the day it was collected.',
    keywords: ['difference', 'reservation', 'booking'],
    aliases: ['reservation vs booking', 'reserved vs checked in'],
  },
  {
    id: 'events',
    category: 'Reservations',
    question: 'How do I book a hall / event?',
    answer:
      'Under Reservations / Events, open Events. Create the event with client, date, and payment. POS/Transfer requires a Payment account. Event payments appear in Transactions.',
    keywords: ['event', 'events', 'hall', 'banquet'],
    aliases: ['book hall', 'event booking', 'wedding hall'],
  },
  {
    id: 'cancel-reservation',
    category: 'Reservations',
    question: 'How do I cancel a reservation?',
    answer:
      'Open the reservation and use Cancel (if your role allows). Cancelled reservations do not stay on the in-house Bookings list. No-show fees may apply depending on Settings → billing policy.',
    keywords: ['cancel', 'cancellation', 'no-show', 'noshow'],
    aliases: ['cancel booking reservation', 'no show'],
  },

  // —— Payments & accounts ——
  {
    id: 'payment-methods',
    category: 'Payments',
    question: 'Which payment methods can I use?',
    answer:
      'Common methods: Cash, POS, Transfer (bank transfer), and City Ledger. For POS and Transfer you must select a saved Payment account so owners know which bank received the money.',
    keywords: ['payment method', 'cash', 'pos', 'transfer', 'methods'],
    aliases: ['how to pay', 'payment options', 'accept payment'],
  },
  {
    id: 'payment-accounts-why',
    category: 'Payments',
    question: 'Why must I choose an account for POS or Transfer?',
    answer:
      'Settings → Payment accounts stores destinations like “Fidelity Bank 908472842 Hotel Limited”. Staff must pick one on POS/Transfer so managers can audit where money landed. Cash and city ledger do not need an account.',
    keywords: ['account', 'pos', 'transfer', 'bank', 'destination', 'fidelity', 'ecobank'],
    aliases: ['select account', 'bank account required', 'why account'],
  },
  {
    id: 'add-payment-account',
    category: 'Payments',
    question: 'How do I add a bank or POS account?',
    answer:
      'Settings → Payment accounts → enter Bank name, Account number, Account name → choose POS, Transfer, or both → Add. Needs Settings manage permission (usually Admin / Superadmin).',
    keywords: ['add account', 'payment accounts', 'settings', 'bank name'],
    aliases: ['create bank account', 'add ecobank', 'company account'],
  },
  {
    id: 'city-ledger',
    category: 'Payments',
    question: 'What is City Ledger?',
    answer:
      'City ledger is credit: the guest or organization owes the hotel (or holds credit). It is not cash in hand that day, so Daily book excludes it from Sales collection total (shown separately).',
    keywords: ['city ledger', 'credit', 'debt', 'organization account'],
    aliases: ['bill to company', 'post to ledger'],
  },
  {
    id: 'settle-city-ledger',
    category: 'Payments',
    question: 'How do I settle a city ledger balance?',
    answer:
      'Open Guest / Org or the city ledger account, record a ledger payment (cash/POS/transfer). For POS/Transfer pick the Payment account. That recovery can show as debt recovery in Daily book when categorized that way.',
    keywords: ['settle', 'ledger payment', 'debt recovery'],
    aliases: ['pay city ledger', 'clear ledger balance'],
  },
  {
    id: 'see-payments',
    category: 'Payments',
    question: 'Where can I see all payments?',
    answer:
      'Accounting → Transactions / Analytics → Transactions tab is the payment ledger. Daily book shows the same day’s money in owner-report categories. Tap a row to open receipt details.',
    keywords: ['see payments', 'payment history', 'receipts', 'ledger'],
    aliases: ['view transactions', 'payment list'],
  },

  // —— Daily book & Transactions ——
  {
    id: 'what-is-daily-book',
    category: 'Daily book & Transactions',
    question: 'What is the Daily book?',
    answer:
      'Owner/manager report for one hotel night: in-house guest list (room revenue = sum of rates) plus sales collection (cash/POS/transfer) by category — POS, cash, advance, Additional (Extend stay etc), extra charges, debt recovery. City ledger is listed separately.',
    keywords: ['daily book', 'owner report', 'sales collection', 'room revenue'],
    aliases: ['dailybook', 'daily report', 'manual book'],
  },
  {
    id: 'daily-book-vs-transactions',
    category: 'Daily book & Transactions',
    question: 'How is Daily book different from Transactions?',
    answer:
      'Transactions = every receipt line. Daily book = that date’s in-house guests + collections grouped like the front-desk manual book. Use Daily book for directors; use Transactions to inspect one payment.',
    keywords: ['difference', 'transactions', 'daily book', 'vs'],
    aliases: ['daily book vs transactions', 'why two menus'],
  },
  {
    id: 'daily-book-zero',
    category: 'Daily book & Transactions',
    question: 'Why is Daily book showing ₦0 when Transactions has cash?',
    answer:
      'Pick the same hotel date on both screens (Yesterday / custom). Daily book sales collection is cash/POS/transfer only (not city ledger). Refresh Daily book after payments post. If still wrong, tell an admin — ledger date windows use Africa/Lagos hotel time.',
    keywords: ['zero', '0', 'naira', 'mismatch', 'wrong total'],
    aliases: ['daily book zero', 'not showing cash', 'sales collection 0'],
  },
  {
    id: 'analytics',
    category: 'Daily book & Transactions',
    question: 'What is the Analytics tab?',
    answer:
      'Under Transactions / Analytics → Analytics you get Revenue charts and Profitability analysis for a period. It can take a moment to load — wait for the spinner.',
    keywords: ['analytics', 'revenue', 'profitability', 'charts'],
    aliases: ['revenue tab', 'profitability'],
  },

  // —— Night Audit ——
  {
    id: 'night-audit-what',
    category: 'Night Audit',
    question: 'What does Run Night Audit do?',
    answer:
      'It closes a business date: snapshots occupancy and that day’s collections, then rolls the hotel business date forward. Run it after the day’s work. Totals should line up with Daily book for that closing date.',
    keywords: ['night audit', 'run audit', 'close day', 'business date'],
    aliases: ['run night audit', 'close business day'],
  },
  {
    id: 'backdate',
    category: 'Night Audit',
    question: 'How do backdated check-ins work?',
    answer:
      'To check in with a past date, send a backdate request. Managers approve under Night Audit. Until approved, the system may block the backdated stay.',
    keywords: ['backdate', 'past date', 'approval'],
    aliases: ['back dated', 'yesterday checkin'],
  },
  {
    id: 'night-audit-approvals',
    category: 'Night Audit',
    question: 'What approvals are in Night Audit?',
    answer:
      'Night Audit can hold backdate, room change, move dates, and extend-stay discount requests for Admin/Manager approval, with optional email alerts when configured.',
    keywords: ['approval', 'pending', 'discount', 'room change'],
    aliases: ['pending requests', 'approve request'],
  },

  // —— Outlets ——
  {
    id: 'outlet-pos',
    category: 'Outlets',
    question: 'How do I take an outlet (restaurant/bar) order?',
    answer:
      'Open Outlets (POS), choose the outlet, add menu items, then settle with cash, POS, transfer, room charge, or complimentary. POS/Transfer needs a Payment account. Settled sales show in Transactions.',
    keywords: ['outlet', 'restaurant', 'bar', 'order', 'menu'],
    aliases: ['how to use pos outlet', 'sell food', 'bar sale'],
  },
  {
    id: 'room-charge-outlet',
    category: 'Outlets',
    question: 'How do I post an outlet bill to a guest room?',
    answer:
      'When settling the outlet order, choose room charge / city ledger style posting to the in-house guest. The amount hits that guest’s folio for payment at checkout or earlier.',
    keywords: ['room charge', 'post to room', 'folio outlet'],
    aliases: ['charge to room', 'bill to room'],
  },

  // —— Guests & orgs ——
  {
    id: 'guest-database',
    category: 'Guests & organizations',
    question: 'Where is the guest database?',
    answer:
      'Front Office → Guest / Org (and Guest Database where available). Open a guest for history, cashback, and linked bookings.',
    keywords: ['guest', 'database', 'profile', 'guest list'],
    aliases: ['find guest', 'guest history'],
  },
  {
    id: 'organizations',
    category: 'Guests & organizations',
    question: 'How do company / organization accounts work?',
    answer:
      'Under Guest / Org you can manage organization counterparts used with city ledger and corporate stays. Link bookings or settle balances from those accounts.',
    keywords: ['organization', 'company', 'corporate'],
    aliases: ['company account', 'corporate guest'],
  },

  // —— Rooms & property ——
  {
    id: 'rooms',
    category: 'Rooms & property',
    question: 'How do I manage rooms?',
    answer:
      'Property → Rooms: set room numbers, types, and status (available, occupied, maintenance). Occupancy on Bookings reflects live in-house folios.',
    keywords: ['rooms', 'room type', 'maintenance', 'inventory'],
    aliases: ['add room', 'room status'],
  },
  {
    id: 'housekeeping',
    category: 'Rooms & property',
    question: 'What is Housekeeping for?',
    answer:
      'Property → Housekeeping tracks cleaning status for rooms after checkout and during the day so front desk knows which rooms are ready.',
    keywords: ['housekeeping', 'cleaning', 'dirty', 'ready'],
    aliases: ['clean room', 'hk'],
  },

  // —— Accounting other ——
  {
    id: 'expenses',
    category: 'Accounting',
    question: 'How do I record an expense?',
    answer:
      'Accounting → Expenses. Add an expense with category, amount, and payment method. Approvals may apply depending on role.',
    keywords: ['expense', 'expenses', 'spending', 'cost'],
    aliases: ['add expense', 'operating expense'],
  },
  {
    id: 'reports',
    category: 'Accounting',
    question: 'Where are financial reports?',
    answer:
      'Accounting → Reports: Daily revenue, Daily book, Sales collection, occupancy, refunds, expenditure, and more. Daily book is also under Transactions / Analytics.',
    keywords: ['reports', 'financial', 'revenue report'],
    aliases: ['print report', 'owner report'],
  },
  {
    id: 'refunds',
    category: 'Accounting',
    question: 'Where do refunds show?',
    answer:
      'Accounting → Refunds. Refunds reduce guest balance and net sales collection in Reports; they are separate from room revenue in Daily book.',
    keywords: ['refund', 'refunds', 'money back'],
    aliases: ['give refund', 'reverse payment'],
  },
  {
    id: 'cashback',
    category: 'Accounting',
    question: 'What is guest cashback?',
    answer:
      'Loyalty balance earned on eligible payments. Guests can apply it as a discount later. Configure percent in Settings; review under Cashback or the guest profile.',
    keywords: ['cashback', 'loyalty', 'reward'],
    aliases: ['cash back', 'guest points'],
  },

  // —— Supply / kitchen ——
  {
    id: 'supply-chain',
    category: 'Supply & kitchen',
    question: 'What is Supply Chain for?',
    answer:
      'Central store, purchasing, and supply activity log for hotel inventory. Kitchen and F&B Store are under Kitchen. Roles control who can approve purchase orders.',
    keywords: ['supply', 'store', 'purchasing', 'inventory', 'po'],
    aliases: ['stock', 'purchase order'],
  },
  {
    id: 'kitchen',
    category: 'Supply & kitchen',
    question: 'How do Kitchen and F&B Store work?',
    answer:
      'Kitchen and F&B Store track food & beverage inventory linked to outlets. Use them to manage stock movements for restaurant/bar operations.',
    keywords: ['kitchen', 'f&b', 'fnb', 'food'],
    aliases: ['fnb store', 'kitchen store'],
  },

  // —— Users & settings ——
  {
    id: 'users-roles',
    category: 'Users & access',
    question: 'How do I add a staff user?',
    answer:
      'Administration → Users & Roles. An admin invites/adds staff and assigns a role (front desk, cashier, manager, etc.). Permissions control which menus they see.',
    keywords: ['user', 'staff', 'role', 'invite', 'permission'],
    aliases: ['add user', 'create staff', 'users and roles'],
  },
  {
    id: 'who-settings',
    category: 'Users & access',
    question: 'Who can change Settings and Payment accounts?',
    answer:
      'Users with Settings manage permission (typically Admin / Superadmin). Front desk takes payments and selects accounts, but usually cannot edit the account list.',
    keywords: ['settings', 'admin', 'superadmin', 'permission'],
    aliases: ['who can edit settings'],
  },
  {
    id: 'settings-hotel',
    category: 'Users & access',
    question: 'What can I change in Settings?',
    answer:
      'Hotel information, checkout policy, no-show/cashback billing policy, Payment accounts (POS/bank destinations), password, and (superadmin) hotel logo.',
    keywords: ['settings', 'checkout time', 'logo', 'policy'],
    aliases: ['hotel settings', 'configure hotel'],
  },
]

export const HELP_CATEGORIES = Array.from(new Set(HELP_FAQ.map((f) => f.category)))

export function filterHelpFaq(query: string): HelpFaqItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return HELP_FAQ
  return HELP_FAQ.filter((item) => {
    const hay = [
      item.question,
      item.answer,
      item.category,
      ...(item.keywords || []),
      ...(item.aliases || []),
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}
