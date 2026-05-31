import type {
  BarStockItem,
  FnbMenuItem,
  KitchenStockItem,
  ProductionBatch,
  PurchaseOrder,
  Recipe,
  StoreItem,
} from './types'

export const MOCK_STORE_ITEMS: StoreItem[] = [
  { id: 'stk-chicken', name: 'Chicken', unit: 'kg', dept: 'kitchen', quantityInStore: 15, reorderLevel: 5, lastPrice: 4700, benchmarkPrice: 4500 },
  { id: 'stk-beef', name: 'Beef', unit: 'kg', dept: 'kitchen', quantityInStore: 8, reorderLevel: 3, lastPrice: 6000, benchmarkPrice: 5800 },
  { id: 'stk-goat', name: 'Goat Meat', unit: 'kg', dept: 'kitchen', quantityInStore: 10, reorderLevel: 3, lastPrice: 5500, benchmarkPrice: 5400 },
  { id: 'stk-rice-bag', name: 'Rice', unit: 'bag', dept: 'kitchen', quantityInStore: 12, reorderLevel: 4, lastPrice: 38000, benchmarkPrice: 37500 },
  { id: 'stk-tomato', name: 'Tomatoes', unit: 'kg', dept: 'kitchen', quantityInStore: 6, reorderLevel: 2, lastPrice: 800, benchmarkPrice: 800 },
  { id: 'stk-pepper-dry', name: 'Dry Pepper', unit: 'kg', dept: 'kitchen', quantityInStore: 3, reorderLevel: 1, lastPrice: 2500, benchmarkPrice: 2400 },
  { id: 'stk-oil', name: 'Vegetable Oil', unit: 'litre', dept: 'kitchen', quantityInStore: 20, reorderLevel: 8, lastPrice: 1800, benchmarkPrice: 1750 },
  { id: 'stk-stout', name: 'Guinness Stout (big)', unit: 'bottle', dept: 'bar', quantityInStore: 12, reorderLevel: 36, lastPrice: 1200, benchmarkPrice: 1150 },
  { id: 'stk-chapman-mix', name: 'Chapman Mix', unit: 'litre', dept: 'bar', quantityInStore: 0, reorderLevel: 5, lastPrice: 3500, benchmarkPrice: 3400 },
  { id: 'stk-ago', name: 'AGO Fuel', unit: 'litre', dept: 'maintenance', quantityInStore: 200, reorderLevel: 50, lastPrice: 1200, benchmarkPrice: 1200 },
  { id: 'stk-detergent', name: 'Ariel Detergent', unit: 'pack', dept: 'housekeeping', quantityInStore: 24, reorderLevel: 15, lastPrice: 2200, benchmarkPrice: 2100 },
  { id: 'stk-notepad', name: 'Guest Notepad', unit: 'piece', dept: 'front_office', quantityInStore: 50, reorderLevel: 20, lastPrice: 350, benchmarkPrice: 350 },
]

/** Pepper chicken case study: 1 chicken ₦4,700 + tomato ₦1,000 + overhead ₦1,300 = ₦7,000 → 4 portions @ ₦7,000 sell = ₦28,000 revenue */
export const MOCK_RECIPES: Recipe[] = [
  {
    id: 'rcp-pepper-chicken',
    name: 'Peppered Chicken',
    category: 'Main Course',
    yieldPortions: 4,
    yieldLabel: '4 x 1 plate',
    ingredients: [
      { stockItemId: 'stk-chicken', name: 'Chicken (1 full)', quantity: 1, unit: 'kg', cost: 4700 },
      { stockItemId: 'stk-tomato', name: 'Tomatoes', quantity: 1, unit: 'kg', cost: 1000 },
    ],
    overheadCost: 1300,
    sellingPricePerPortion: 7000,
  },
  {
    id: 'rcp-jollof',
    name: 'Jollof Rice',
    category: 'Main Course',
    yieldPortions: 50,
    yieldLabel: '50 x 1 plate',
    ingredients: [
      { stockItemId: 'stk-rice-bag', name: 'Rice', quantity: 1, unit: 'bag', cost: 38000 },
      { stockItemId: 'stk-chicken', name: 'Chicken', quantity: 3, unit: 'kg', cost: 13500 },
      { stockItemId: 'stk-tomato', name: 'Tomatoes', quantity: 2, unit: 'kg', cost: 1600 },
      { stockItemId: 'stk-oil', name: 'Oil', quantity: 2, unit: 'litre', cost: 3600 },
    ],
    overheadCost: 5000,
    sellingPricePerPortion: 3500,
  },
  {
    id: 'rcp-egusi',
    name: 'Egusi Soup + Eba',
    category: 'Main Course',
    yieldPortions: 30,
    yieldLabel: '30 x 1 bowl',
    ingredients: [
      { stockItemId: 'stk-beef', name: 'Beef', quantity: 4, unit: 'kg', cost: 24000 },
    ],
    overheadCost: 11000,
    sellingPricePerPortion: 4500,
  },
]

export const MOCK_KITCHEN_STOCK: KitchenStockItem[] = [
  { id: 'ks-pepper', name: 'Peppered Chicken', source: 'produced', availablePortions: 0, reorderLevel: 2, linkedRecipeId: 'rcp-pepper-chicken' },
  { id: 'ks-jollof', name: 'Jollof Rice', source: 'produced', availablePortions: 30, reorderLevel: 10, linkedRecipeId: 'rcp-jollof' },
  { id: 'ks-egusi', name: 'Egusi Soup + Eba', source: 'produced', availablePortions: 15, reorderLevel: 5, linkedRecipeId: 'rcp-egusi' },
]

/** Issued from central store bar dept → main bar / pool bar POS. */
export const MOCK_BAR_STOCK: BarStockItem[] = [
  {
    id: 'bar-stout',
    storeItemId: 'stk-stout',
    name: 'Guinness Stout (big)',
    quantityOnHand: 36,
    reorderLevel: 12,
    unitsPerSale: 1,
    unit: 'bottle',
  },
  {
    id: 'bar-chapman',
    storeItemId: 'stk-chapman-mix',
    name: 'Chapman Mix',
    quantityOnHand: 0,
    reorderLevel: 5,
    unitsPerSale: 1,
    unit: 'litre',
  },
]

export const MOCK_FNB_MENU: FnbMenuItem[] = [
  { id: 'mnu-pepper', name: 'Peppered Chicken', category: 'food', sellingPrice: 7000, kitchenStockId: 'ks-pepper', portionsPerSale: 1 },
  { id: 'mnu-jollof', name: 'Jollof Rice', category: 'food', sellingPrice: 3500, kitchenStockId: 'ks-jollof', portionsPerSale: 1 },
  { id: 'mnu-egusi', name: 'Egusi Soup + Eba', category: 'food', sellingPrice: 4500, kitchenStockId: 'ks-egusi', portionsPerSale: 1 },
  { id: 'mnu-fried', name: 'Fried Rice', category: 'food', sellingPrice: 3800, kitchenStockId: 'ks-jollof', portionsPerSale: 1 },
  { id: 'mnu-club', name: 'Club Sandwich', category: 'food', sellingPrice: 3200, kitchenStockId: 'ks-egusi', portionsPerSale: 1 },
  { id: 'mnu-coke', name: 'Coca-Cola', category: 'drink', sellingPrice: 700, kitchenStockId: 'ks-jollof', portionsPerSale: 0 },
  { id: 'mnu-chapman', name: 'Chapman', category: 'drink', sellingPrice: 2500, kitchenStockId: 'ks-jollof', portionsPerSale: 1 },
]

export const MOCK_BATCHES: ProductionBatch[] = [
  {
    id: 'bat-jollof-1',
    recipeId: 'rcp-jollof',
    recipeName: 'Jollof Rice',
    shift: 'Morning',
    status: 'in_progress',
    plannedPortions: 50,
    actualPortions: 0,
    foodCostPct: 0,
    variancePct: 0,
    materialsUsed: ['1 bag Rice', '3 kg Chicken', '2 kg Tomatoes', '2 litre Oil'],
    openedAt: '2026-05-24T06:00:00Z',
    openedBy: 'Mama Ngozi',
  },
  {
    id: 'bat-breakfast-1',
    recipeId: 'rcp-egusi',
    recipeName: 'Continental Breakfast',
    shift: 'Morning',
    status: 'completed',
    plannedPortions: 15,
    actualPortions: 15,
    foodCostPct: 32,
    variancePct: 0,
    materialsUsed: ['Assorted'],
    openedAt: '2026-05-19T06:00:00Z',
    openedBy: 'Mama Ngozi',
    closedAt: '2026-05-19T10:00:00Z',
    disposition: { sold: 12, staff: 2, waste: 1, returned: 0 },
  },
]

export const MOCK_POS: PurchaseOrder[] = [
  {
    id: 'po-w23',
    poNumber: 'PO-W2026-23',
    weekLabel: 'Week of 2026-05-23',
    status: 'retirement_pending',
    createdBy: 'store-1',
    createdByName: 'Alhaji Musa',
    createdAt: '2026-05-23T08:00:00Z',
    cashDisbursed: 196500,
    totalAmount: 196500,
    lines: [
      { id: 'l1', stockItemId: 'stk-detergent', name: 'Toilet Paper', dept: 'housekeeping', unit: 'pack', quantityOrdered: 15, unitPrice: 3500, lineTotal: 52500 },
      { id: 'l2', stockItemId: 'stk-notepad', name: 'Shampoo', dept: 'front_office', unit: 'bottle', quantityOrdered: 30, unitPrice: 800, lineTotal: 24000 },
      { id: 'l3', stockItemId: 'stk-ago', name: 'AGO Fuel', dept: 'maintenance', unit: 'litre', quantityOrdered: 100, unitPrice: 1200, lineTotal: 120000 },
    ],
  },
  {
    id: 'po-w17',
    poNumber: 'PO-W2026-17',
    weekLabel: 'Week of 2026-05-17',
    status: 'retired',
    createdBy: 'store-1',
    createdByName: 'Alhaji Musa',
    createdAt: '2026-05-17T08:00:00Z',
    cashDisbursed: 437500,
    totalAmount: 437500,
    lines: [],
  },
  {
    id: 'po-draft',
    poNumber: 'PO-DRAFT-001',
    weekLabel: 'Week of 2026-05-30',
    status: 'pending_accountant',
    createdBy: 'store-1',
    createdByName: 'Alhaji Musa',
    createdAt: '2026-05-30T07:00:00Z',
    cashDisbursed: 661000,
    totalAmount: 661000,
    lines: [
      { id: 'l4', stockItemId: 'stk-chicken', name: 'Chicken', dept: 'kitchen', unit: 'kg', quantityOrdered: 40, unitPrice: 4500, lineTotal: 180000 },
      { id: 'l5', stockItemId: 'stk-pepper-dry', name: 'Dry Pepper', dept: 'kitchen', unit: 'kg', quantityOrdered: 50, unitPrice: 2500, lineTotal: 125000 },
    ],
  },
]
