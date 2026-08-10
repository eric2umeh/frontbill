export type HelpFaqItem = {
  id: string
  category: string
  question: string
  answer: string
  /** Strong match terms — preferred over answer body text. */
  keywords?: string[]
  /** Extra phrases users type (e.g. "how do i make a booking"). */
  aliases?: string[]
  /** Intent tags used by the matcher (see match-help.ts). */
  topics?: string[]
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
    topics: ['dashboard'],
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
    id: 'what-is-dashboard',
    category: 'Getting started',
    question: 'What does the Dashboard show?',
    answer:
      'Dashboard (if your role can see it) summarizes occupancy, recent bookings/payments, room status, and Quick Actions such as Check-in. Cashiers may not see Dashboard — use Bookings and Outlets instead.',
    keywords: ['dashboard', 'widgets', 'quick actions', 'occupancy'],
    aliases: ['dashboard overview', 'what is on dashboard'],
    topics: ['dashboard'],
  },
  {
    id: 'sidebar-permissions',
    category: 'Getting started',
    question: 'Why can’t I see some sidebar menus?',
    answer:
      'Menus follow your role permissions (Users & Roles). If a page is missing, ask an Admin to grant the right permission (e.g. reports:view, night_audit:view).',
    keywords: ['sidebar', 'menu', 'permission', 'missing', 'access'],
    aliases: ['missing menu', 'cannot see reports', 'access denied menu'],
    topics: ['users'],
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
  {
    id: 'currency-naira',
    category: 'Getting started',
    question: 'What currency does FrontBill use?',
    answer: 'All amounts are in Nigerian Naira (₦).',
    keywords: ['currency', 'naira', 'ngn'],
    aliases: ['what currency', 'is it naira'],
  },

  // —— Bookings ——
  {
    id: 'how-make-booking',
    category: 'Bookings',
    question: 'How do I make a booking / check a guest in?',
    answer:
      '1) Go to Front Office → Bookings.\n2) Tap + New Booking (or use Check-in from the Dashboard).\n3) Enter guest details, room, check-in / check-out dates, and rate.\n4) Choose payment method. For POS or Transfer you must select a Payment account (bank/POS destination).\n5) Save — the guest appears as in-house on Bookings.\n\nFor a future stay, use Reservations / Events instead (then Check in on arrival).',
    keywords: ['booking', 'bookings', 'checkin', 'check-in', 'walk-in', 'new booking'],
    aliases: [
      'how do i make bookings',
      'how do i make a booking',
      'how do i make bookings/reservations',
      'how do i make bookings and reservations',
      'how to book a guest',
      'how to check in a guest',
      'create booking',
      'new booking',
      'walk in guest',
    ],
    topics: ['create_booking'],
  },
  {
    id: 'bulk-booking',
    category: 'Bookings',
    question: 'How do I do a bulk booking (group)?',
    answer:
      'On Bookings, use Bulk Booking. Add multiple rooms/guests for the same group, set payment, then save. Group rooms can be managed together and opened from the bulk group page. Use Bulk Reservation under Reservations for future group arrivals.',
    keywords: ['bulk', 'group', 'multiple rooms'],
    aliases: ['bulk booking', 'group booking', 'many rooms'],
    topics: ['bulk', 'create_booking'],
  },
  {
    id: 'bookings-stay-date',
    category: 'Bookings',
    question: 'Why does Bookings show fewer guests than my manual list for a date?',
    answer:
      'Use the Stay date picker. It lists everyone in-house that hotel night (arrivals + stayovers), not only people who checked in that day. Clear the date to return to today’s in-house list.',
    keywords: ['stay date', 'in-house', 'stayovers', 'arrivals', 'manual', 'fewer'],
    aliases: ['missing guests', 'only 4 guests', 'not showing all guests', 'stay date'],
    topics: ['create_booking'],
  },
  {
    id: 'extend-stay-how',
    category: 'Bookings',
    question: 'How do I extend a guest’s stay?',
    answer:
      'Open the booking (or use Extend Stay on the Bookings row). Choose the new check-out date and payment for the extra night(s). For POS/Transfer, pick the Payment account. The payment appears under Daily book → Additional (Extend stay etc), often with an EXT- reference.',
    keywords: ['extend', 'extension', 'extra night', 'prolong'],
    aliases: ['extend stay', 'add nights', 'extend guest'],
    topics: ['extend'],
  },
  {
    id: 'extend-stay-where',
    category: 'Bookings',
    question: 'Where do extend-stay payments appear?',
    answer:
      'In Transactions (ledger) and in Daily book under “Additional (Extend stay etc)”. References often start with EXT-.',
    keywords: ['extend', 'additional', 'ext'],
    aliases: ['extend payment', 'additional extend'],
    topics: ['extend', 'daily_book'],
  },
  {
    id: 'checkout-guest',
    category: 'Bookings',
    question: 'How do I check a guest out?',
    answer:
      'On Bookings, open the guest folio or use the Out / Check out action. Clear any balance (cash, POS, transfer, or city ledger), then confirm checkout. The room becomes available after checkout. Checkout may be blocked before your hotel’s checkout cutoff time.',
    keywords: ['checkout', 'check-out', 'check out', 'depart'],
    aliases: ['how to checkout', 'how do i check out', 'guest leaving'],
    topics: ['checkout'],
  },
  {
    id: 'add-charge',
    category: 'Bookings',
    question: 'How do I add a charge to a guest folio?',
    answer:
      'Open the booking → Add charge (or Charge). Enter description and amount. If the guest pays now with POS/Transfer, select the Payment account. The charge posts to the folio and can appear in Transactions.',
    keywords: ['charge', 'folio', 'add charge', 'incidentals'],
    aliases: ['post charge', 'extra charge on room'],
    topics: ['folio_payment'],
  },
  {
    id: 'add-payment-folio',
    category: 'Bookings',
    question: 'How do I record a payment on a guest folio?',
    answer:
      'Open the booking folio → Add payment / Credit. Choose Cash, POS, Transfer, or City Ledger. For POS or Transfer, select the Payment account. The payment posts to Transactions and to Daily book for that hotel date.',
    keywords: ['record payment', 'folio payment', 'credit folio', 'take payment'],
    aliases: [
      'add payment to booking',
      'pay on folio',
      'record payment on booking',
      'take payment from guest',
    ],
    topics: ['folio_payment'],
  },
  {
    id: 'room-change',
    category: 'Bookings',
    question: 'How do I change a guest’s room?',
    answer:
      'Open the booking and use the room change flow (may require Night Audit approval depending on your hotel rules). Pick the new room and confirm. Approvals appear under Night Audit if required.',
    keywords: ['room change', 'move room', 'switch room'],
    aliases: ['change room', 'move guest to another room'],
    topics: ['create_booking', 'night_audit'],
  },
  {
    id: 'move-dates',
    category: 'Bookings',
    question: 'How do I move / reschedule stay dates?',
    answer:
      'Open the booking and use Move dates / reschedule. Some hotels require Night Audit approval before the new dates apply.',
    keywords: ['move dates', 'reschedule', 'change dates'],
    aliases: ['change check in date', 'reschedule booking'],
    topics: ['create_booking', 'night_audit'],
  },
  {
    id: 'print-booking-receipt',
    category: 'Bookings',
    question: 'How do I print a booking payment receipt?',
    answer:
      'Open the booking or the payment in Transactions and use Print / View receipt. You can also open a transaction detail page from the Transactions tab.',
    keywords: ['receipt', 'print receipt', 'booking receipt'],
    aliases: ['print payment receipt', 'guest receipt'],
    topics: ['folio_payment', 'transactions'],
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
    topics: ['reservation'],
  },
  {
    id: 'reservation-checkin',
    category: 'Reservations',
    question: 'How do I check in a reservation?',
    answer:
      'Open Reservations, find the reserved guest, then Check in. Confirm room and payment. The stay moves to Bookings as checked-in.',
    keywords: ['check in reservation', 'convert reservation', 'arrive'],
    aliases: ['checkin reservation', 'reservation to booking'],
    topics: ['reservation', 'create_booking'],
  },
  {
    id: 'reservations-vs-bookings',
    category: 'Reservations',
    question: 'What is the difference between Reservations and Bookings?',
    answer:
      'Reservations = future stay (not yet in-house). Bookings = live folio while the guest is staying. Advance money taken on a reservation shows as Advance payment in Daily book on the day it was collected.',
    keywords: ['difference', 'reservation', 'booking'],
    aliases: ['reservation vs booking', 'reserved vs checked in'],
    topics: ['reservation', 'create_booking'],
  },
  {
    id: 'advance-payment',
    category: 'Reservations',
    question: 'How do I take an advance / deposit on a reservation?',
    answer:
      'Open the reservation and record an advance payment. Choose method; for POS/Transfer pick a Payment account. Advances appear in Daily book under Advance on the collection date.',
    keywords: ['advance', 'deposit', 'reservation payment'],
    aliases: ['take deposit', 'advance payment', 'reservation deposit'],
    topics: ['reservation', 'view_payments'],
  },
  {
    id: 'events',
    category: 'Reservations',
    question: 'How do I book a hall / event?',
    answer:
      'Under Reservations / Events, open Events. Create the event with client, date, and payment. POS/Transfer requires a Payment account. Event payments appear in Transactions and Daily book for that date.',
    keywords: ['event', 'events', 'hall', 'banquet'],
    aliases: ['book hall', 'event booking', 'wedding hall'],
    topics: ['event'],
  },
  {
    id: 'cancel-reservation',
    category: 'Reservations',
    question: 'How do I cancel a reservation or mark no-show?',
    answer:
      'Open the reservation and use Cancel or No-show (if your role allows). No-show billing may create a collectible folio depending on Settings → no-show policy.',
    keywords: ['cancel', 'cancellation', 'no-show', 'noshow'],
    aliases: ['cancel booking reservation', 'no show', 'mark no show'],
    topics: ['reservation'],
  },

  // —— Payments & accounts ——
  {
    id: 'payment-methods',
    category: 'Payments',
    question: 'Which payment methods can I use?',
    answer:
      'Common methods: Cash, POS, Transfer (bank transfer), and City Ledger. For POS and Transfer you must select a saved Payment account so owners know which bank received the money.',
    keywords: ['payment method', 'cash', 'pos', 'transfer', 'methods'],
    aliases: ['payment options', 'accept payment methods', 'which payment methods'],
    topics: ['folio_payment', 'payment_account'],
  },
  {
    id: 'payment-accounts-why',
    category: 'Payments',
    question: 'Why must I choose an account for POS or Transfer?',
    answer:
      'Settings → Payment accounts stores destinations like “Fidelity Bank 908472842 Hotel Limited”. Staff must pick one on POS/Transfer so managers can audit where money landed. Cash and city ledger do not need an account.',
    keywords: ['account', 'pos', 'transfer', 'bank', 'destination', 'fidelity', 'ecobank'],
    aliases: ['select account', 'bank account required', 'why account', 'why must i choose an account'],
    topics: ['payment_account'],
  },
  {
    id: 'add-payment-account',
    category: 'Payments',
    question: 'How do I add a bank or POS account?',
    answer:
      'Settings → Payment accounts → enter Bank name, Account number, Account name → choose POS, Transfer, or both → Add. Needs Settings manage permission (usually Admin / Superadmin).',
    keywords: ['add account', 'payment accounts', 'settings', 'bank name'],
    aliases: ['create bank account', 'add ecobank', 'company account'],
    topics: ['payment_account', 'settings'],
  },
  {
    id: 'city-ledger',
    category: 'Payments',
    question: 'What is City Ledger?',
    answer:
      'City ledger is credit: the guest or organization owes the hotel (or holds credit). It is not cash in hand that day, so Daily book excludes it from Sales collection total (shown separately).',
    keywords: ['city ledger', 'credit', 'debt', 'organization account'],
    aliases: ['bill to company', 'post to ledger'],
    topics: ['city_ledger'],
  },
  {
    id: 'settle-city-ledger',
    category: 'Payments',
    question: 'How do I settle a city ledger balance?',
    answer:
      'Open Guest / Org or the city ledger account, record a ledger payment (cash/POS/transfer). For POS/Transfer pick the Payment account. That recovery can show as debt recovery in Daily book when categorized that way.',
    keywords: ['settle', 'ledger payment', 'debt recovery'],
    aliases: ['pay city ledger', 'clear ledger balance'],
    topics: ['city_ledger'],
  },
  {
    id: 'see-payments',
    category: 'Payments',
    question: 'Where can I see all payments?',
    answer:
      'Accounting → Transactions / Analytics → Transactions tab is the payment ledger. Daily book shows the same day’s money in owner-report categories. Tap a row to open receipt details.',
    keywords: ['see payments', 'payment history', 'receipts', 'ledger', 'all payments'],
    aliases: ['view transactions', 'payment list', 'where are payments'],
    topics: ['view_payments', 'transactions'],
  },

  // —— Daily book & Transactions (critical for date questions) ——
  {
    id: 'how-check-payments-by-date',
    category: 'Daily book & Transactions',
    question: 'How do I check payments made on a specific date?',
    answer:
      '1) Go to Accounting → Transactions / Analytics (opens Daily book).\n2) On Daily book, pick Yesterday or a custom hotel date (e.g. 6 August).\n3) Review Sales collection lines for that night — Cash, POS, Transfer, Advance, Additional, etc.\n4) Or open the Transactions tab and filter/browse payments for that date.\n5) Tap a row for receipt detail (method, Payment account, guest).',
    keywords: [
      'payments by date',
      'payments made',
      'check payments',
      'payment on date',
      'august',
      'yesterday',
      'custom date',
      'history',
    ],
    aliases: [
      'how do i check the payments made on',
      'how do i check payments made on',
      'how do i check payments for a date',
      'check payments for a date',
      'payments made on',
      'payments on august',
      'see payments for yesterday',
      'payments received on',
      'money collected on',
      'what payments came in on',
      'view payments by date',
      'filter payments by date',
    ],
    topics: ['view_payments', 'daily_book', 'transactions'],
  },
  {
    id: 'how-pick-date-daily-book',
    category: 'Daily book & Transactions',
    question: 'How do I pick Yesterday or a custom date on Daily book?',
    answer:
      'On Accounting → Transactions / Analytics → Daily book, use the date controls (Today / Yesterday / custom calendar). The pack reloads for that hotel night in Africa/Lagos time.',
    keywords: ['yesterday', 'custom date', 'pick date', 'calendar', 'hotel date'],
    aliases: [
      'change daily book date',
      'daily book yesterday',
      'select date on daily book',
      'open daily book for a date',
    ],
    topics: ['daily_book', 'view_payments'],
  },
  {
    id: 'what-is-daily-book',
    category: 'Daily book & Transactions',
    question: 'What is the Daily book?',
    answer:
      'Owner/manager report for one hotel night: in-house guest list (room revenue = sum of rates) plus sales collection (cash/POS/transfer) by category — POS, cash, advance, Additional (Extend stay etc), extra charges, debt recovery. City ledger is listed separately. Sales include payments after midnight until Night Audit is run for that night.',
    keywords: ['daily book', 'owner report', 'sales collection', 'room revenue'],
    aliases: ['dailybook', 'daily report', 'manual book', 'what is the daily book'],
    topics: ['daily_book'],
  },
  {
    id: 'daily-book-vs-transactions',
    category: 'Daily book & Transactions',
    question: 'How is Daily book different from Transactions?',
    answer:
      'Transactions = every receipt line. Daily book = that date’s in-house guests + collections grouped like the front-desk manual book. Use Daily book for directors; use Transactions to inspect one payment.',
    keywords: ['difference', 'transactions', 'daily book', 'vs'],
    aliases: ['daily book vs transactions', 'why two menus'],
    topics: ['daily_book', 'transactions'],
  },
  {
    id: 'room-vs-sales-collection',
    category: 'Daily book & Transactions',
    question: 'What is Room revenue vs Sales collection?',
    answer:
      'Room revenue = sum of in-house room rates for that night (earned). Sales collection = cash/POS/transfer actually collected that day (may include advances, extend payments, outlet sales). They are not always equal.',
    keywords: ['room revenue', 'sales collection', 'earned', 'collected'],
    aliases: ['room revenue generated', 'difference room revenue sales'],
    topics: ['daily_book'],
  },
  {
    id: 'daily-book-zero',
    category: 'Daily book & Transactions',
    question: 'Why is Daily book showing ₦0 when Transactions has cash?',
    answer:
      'Pick the same hotel date on both screens (Yesterday / custom). Daily book sales collection is cash/POS/transfer only (not city ledger), from the previous night’s audit (or day start) until this night’s audit click — so post-midnight money still belongs to the night being closed. Refresh after Night Audit. If still wrong, check City ledger (not in total) and Africa/Lagos hotel time.',
    keywords: ['zero', '0', 'naira', 'mismatch', 'wrong total'],
    aliases: ['daily book zero', 'not showing cash', 'sales collection 0'],
    topics: ['daily_book'],
  },
  {
    id: 'daily-book-categories',
    category: 'Daily book & Transactions',
    question: 'What do Advance / Additional / Extra charges mean in Daily book?',
    answer:
      'Advance = deposits on reservations. Additional (Extend stay etc) = extend-stay and similar top-ups. Extra charges = folio extras/outlet-style extras categorized that way. Debt recovery = city-ledger settlements collected as cash/POS/transfer.',
    keywords: ['advance', 'additional', 'extra charges', 'debt recovery', 'categories'],
    aliases: ['daily book categories', 'what is additional extend'],
    topics: ['daily_book'],
  },
  {
    id: 'analytics',
    category: 'Daily book & Transactions',
    question: 'What is the Analytics tab?',
    answer:
      'Under Transactions / Analytics → Analytics you get Revenue charts and Profitability analysis for a period. It can take a moment to load — wait for the spinner.',
    keywords: ['analytics', 'revenue', 'profitability', 'charts'],
    aliases: ['revenue tab', 'profitability', 'analytics revenue'],
    topics: ['transactions', 'report'],
  },
  {
    id: 'totals-mismatch',
    category: 'Daily book & Transactions',
    question: 'Why don’t Daily book, Reports, and Transactions totals match?',
    answer:
      'They answer different questions: Transactions = every line; Daily book = one hotel night’s collections + in-house rates; Reports may use earned revenue or period filters. Align the same date range and exclude city ledger when comparing cash-in.',
    keywords: ['mismatch', 'totals', 'dont match', "don't match", 'reconcile'],
    aliases: ['totals dont match', 'numbers different', 'reconcile daily book'],
    topics: ['daily_book', 'transactions', 'report'],
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
    topics: ['night_audit'],
  },
  {
    id: 'backdate',
    category: 'Night Audit',
    question: 'How do backdated check-ins work?',
    answer:
      'To check in with a past date, send a backdate request. Managers approve under Night Audit. Until approved, the system may block the backdated stay.',
    keywords: ['backdate', 'past date', 'approval'],
    aliases: ['back dated', 'yesterday checkin'],
    topics: ['night_audit'],
  },
  {
    id: 'night-audit-approvals',
    category: 'Night Audit',
    question: 'What approvals are in Night Audit?',
    answer:
      'Night Audit can hold backdate, room change, move dates, and extend-stay discount requests for Admin/Manager approval, with optional email alerts when configured. Also check Expected Arrivals and Pending Checkouts tabs.',
    keywords: ['approval', 'pending', 'discount', 'room change'],
    aliases: ['pending requests', 'approve request', 'approve backdate'],
    topics: ['night_audit'],
  },

  // —— Outlets ——
  {
    id: 'outlet-pos',
    category: 'Outlets',
    question: 'How do I take an outlet (restaurant/bar) order?',
    answer:
      'Open Outlets (POS), choose the outlet, add menu items, then settle with cash, POS, transfer, room charge, or complimentary. POS/Transfer needs a Payment account. Settled sales show in Transactions and Daily book for that date.',
    keywords: ['outlet', 'restaurant', 'bar', 'order', 'menu'],
    aliases: ['how to use pos outlet', 'sell food', 'bar sale'],
    topics: ['outlet'],
  },
  {
    id: 'outlet-menu',
    category: 'Outlets',
    question: 'How do I manage the outlet menu?',
    answer:
      'In Outlets, open menu/categories management for that outlet. Add categories and items with prices. Items can link to kitchen/F&B stock depending on setup.',
    keywords: ['menu', 'categories', 'items', 'outlet menu'],
    aliases: ['edit menu', 'add menu item', 'outlet categories'],
    topics: ['outlet'],
  },
  {
    id: 'room-charge-outlet',
    category: 'Outlets',
    question: 'How do I post an outlet bill to a guest room?',
    answer:
      'When settling the outlet order, choose room charge / city ledger style posting to the in-house guest. The amount hits that guest’s folio for payment at checkout or earlier.',
    keywords: ['room charge', 'post to room', 'folio outlet'],
    aliases: ['charge to room', 'bill to room'],
    topics: ['outlet', 'city_ledger'],
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
    topics: ['guest'],
  },
  {
    id: 'organizations',
    category: 'Guests & organizations',
    question: 'How do company / organization accounts work?',
    answer:
      'Under Guest / Org you can manage organization counterparts used with city ledger and corporate stays. Link bookings or settle balances from those accounts.',
    keywords: ['organization', 'company', 'corporate'],
    aliases: ['company account', 'corporate guest'],
    topics: ['guest', 'city_ledger'],
  },

  // —— Rooms & property ——
  {
    id: 'rooms',
    category: 'Rooms & property',
    question: 'How do I manage rooms?',
    answer:
      'Property → Rooms: set room numbers, types, rates, and status (available, occupied, cleaning, maintenance, reserved). Occupancy on Bookings reflects live in-house folios.',
    keywords: ['rooms', 'room type', 'maintenance', 'inventory'],
    aliases: ['add room', 'room status', 'edit room'],
    topics: ['room'],
  },
  {
    id: 'housekeeping',
    category: 'Rooms & property',
    question: 'How do I use Housekeeping?',
    answer:
      'Property → Housekeeping: create tasks, update the Task Board, and set room cleaning status so front desk knows which rooms are ready. Remarks and daily reports may be available by role.',
    keywords: ['housekeeping', 'cleaning', 'dirty', 'ready', 'task board'],
    aliases: ['clean room', 'hk', 'housekeeping task'],
    topics: ['housekeeping'],
  },
  {
    id: 'maintenance',
    category: 'Rooms & property',
    question: 'How do I use Maintenance?',
    answer:
      'Property → Maintenance: create work orders, update status/assignment, and set rooms to maintenance / OOO when needed. Submit daily reports if your process requires it.',
    keywords: ['maintenance', 'work order', 'ooo', 'out of order'],
    aliases: ['maintenance request', 'work order', 'room out of order'],
    topics: ['maintenance'],
  },

  // —— Accounting other ——
  {
    id: 'expenses',
    category: 'Accounting',
    question: 'How do I record an expense?',
    answer:
      'Accounting → Expenses. Add an expense with category, amount, and payment method. Manage categories/budgets, import sheets, or review store purchase orders and market retirements depending on your tabs and role. A badge can mean pending approvals.',
    keywords: ['expense', 'expenses', 'spending', 'cost', 'budget'],
    aliases: ['add expense', 'operating expense', 'expenditure'],
    topics: ['expense'],
  },
  {
    id: 'expense-categories',
    category: 'Accounting',
    question: 'How do I manage expense categories and budgets?',
    answer:
      'In Expenses, open categories / budgets (role permitting). Create categories and set monthly budgets so spend can be tracked against plan.',
    keywords: ['expense categories', 'monthly budget', 'budgets'],
    aliases: ['expense budget', 'budget categories'],
    topics: ['expense'],
  },
  {
    id: 'reports',
    category: 'Accounting',
    question: 'Where are financial reports?',
    answer:
      'Accounting → Reports: Daily revenue, Daily book, Sales collection, occupancy, guest, city ledger, expenditure, monthly P&L, and more. Daily book is also under Transactions / Analytics. Use print/export where offered.',
    keywords: ['reports', 'financial', 'revenue report', 'p&l', 'occupancy report'],
    aliases: ['print report', 'owner report', 'daily revenue report'],
    topics: ['report'],
  },
  {
    id: 'refunds',
    category: 'Accounting',
    question: 'How do I process a refund?',
    answer:
      'Accounting → Refunds (needs payments:refund permission). Record the guest refund/credit. Refunds reduce guest balance and net sales collection in Reports; they are separate from room revenue in Daily book.',
    keywords: ['refund', 'refunds', 'money back'],
    aliases: ['give refund', 'reverse payment', 'where do refunds show'],
    topics: ['refund'],
  },
  {
    id: 'cashback',
    category: 'Accounting',
    question: 'What is guest cashback?',
    answer:
      'Loyalty balance earned on eligible payments. Guests can apply it as a discount later. Configure percent in Settings; review under Cashback or the guest profile.',
    keywords: ['cashback', 'loyalty', 'reward'],
    aliases: ['cash back', 'guest points', 'enable cashback'],
    topics: ['cashback', 'settings'],
  },

  // —— Supply / kitchen ——
  {
    id: 'supply-chain',
    category: 'Supply & kitchen',
    question: 'What is Supply Chain for?',
    answer:
      'Central store, purchasing, and supply activity log for hotel inventory. Kitchen and F&B Store are under Kitchen. Roles control who can approve purchase orders.',
    keywords: ['supply', 'store', 'purchasing', 'inventory', 'po'],
    aliases: ['stock', 'purchase order', 'supply chain'],
    topics: ['supply'],
  },
  {
    id: 'central-store',
    category: 'Supply & kitchen',
    question: 'How do I use Central Store?',
    answer:
      'Supply Chain → Central Store: add/edit items, approve pending items, Issue Out to departments, view Issue Out Log, raise purchase requests / draft POs, and review stock history / bulk stock in-out.',
    keywords: ['central store', 'issue out', 'stock in', 'stock out'],
    aliases: ['issue out basket', 'store items', 'stock history'],
    topics: ['supply'],
  },
  {
    id: 'purchasing',
    category: 'Supply & kitchen',
    question: 'How do purchase order approvals work?',
    answer:
      'Supply Chain → Purchasing: accountants/managers approve POs per role. Retire/close market purchases when done; use history and comments for audit.',
    keywords: ['purchasing', 'purchase order', 'approve po', 'retire'],
    aliases: ['approve purchase order', 'market retirement', 'po history'],
    topics: ['supply', 'expense'],
  },
  {
    id: 'kitchen',
    category: 'Supply & kitchen',
    question: 'How do Kitchen and F&B Store work?',
    answer:
      'Kitchen and F&B Store track food & beverage inventory linked to outlets — finished/prep stock, recipes/batches, kitchen budget, and stock tickets. Supply Log shows activity.',
    keywords: ['kitchen', 'f&b', 'fnb', 'food', 'recipe', 'batch'],
    aliases: ['fnb store', 'kitchen store', 'production batch'],
    topics: ['supply', 'outlet'],
  },

  // —— Users & settings ——
  {
    id: 'users-roles',
    category: 'Users & access',
    question: 'How do I add a staff user?',
    answer:
      'Administration → Users & Roles. An admin invites/adds staff and assigns a role (front desk, cashier, manager, etc.). Permissions control which menus they see. Only Superadmin manages other Superadmins as configured.',
    keywords: ['user', 'staff', 'role', 'invite', 'permission'],
    aliases: ['add user', 'create staff', 'users and roles', 'change password for staff'],
    topics: ['users'],
  },
  {
    id: 'who-settings',
    category: 'Users & access',
    question: 'Who can change Settings and Payment accounts?',
    answer:
      'Users with Settings manage permission (typically Admin / Superadmin). Front desk takes payments and selects accounts, but usually cannot edit the account list.',
    keywords: ['settings', 'admin', 'superadmin', 'permission'],
    aliases: ['who can edit settings'],
    topics: ['settings', 'users'],
  },
  {
    id: 'settings-hotel',
    category: 'Users & access',
    question: 'What can I change in Settings?',
    answer:
      'Hotel information, checkout policy / late checkout fee, auto-checkout policy, no-show billing, cashback percent, Payment accounts (POS/bank destinations), your password, and (superadmin) hotel logo.',
    keywords: ['settings', 'checkout time', 'logo', 'policy', 'late checkout'],
    aliases: ['hotel settings', 'configure hotel', 'checkout cutoff'],
    topics: ['settings'],
  },
  {
    id: 'login-help',
    category: 'Users & access',
    question: 'Why am I stuck on login or see fetch failed?',
    answer:
      'Staff log in with the email/password an admin created. If you see fetch failed to a local address, the app may be pointed at the wrong Supabase environment — use the correct login URL, clear session (/auth/login or logout), and retry. Staging owners may register at Sign up when public signup is enabled.',
    keywords: ['login', 'fetch failed', 'sign in', 'stuck'],
    aliases: ['cannot login', 'login error', 'fetch failed'],
    topics: ['users'],
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
      ...(item.topics || []),
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}
