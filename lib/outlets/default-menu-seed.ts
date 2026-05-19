import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import { outletSlugify } from '@/lib/outlets/slug'

export type SeedCategory = {
  name: string
  tag_label?: string
  sort_order: number
  children?: { name: string; sort_order: number }[]
}

/** Bar / pool bar drink sections (from legacy menu). Items added via CRUD or import. */
export const BAR_MENU_CATEGORIES: SeedCategory[] = [
  { name: 'Beer', tag_label: 'Alcohol', sort_order: 10 },
  { name: 'Brandy & Cognac', tag_label: 'Alcohol', sort_order: 20 },
  { name: 'Champagne & Sparkling Wine', tag_label: 'Alcohol', sort_order: 30 },
  { name: 'Cocktails', tag_label: 'Alcohol', sort_order: 40 },
  { name: 'Energy Drinks', sort_order: 50 },
  { name: 'Gin', tag_label: 'Alcohol', sort_order: 60 },
  { name: 'Liqueurs & Cream', tag_label: 'Alcohol', sort_order: 70 },
  { name: 'Red Wine', tag_label: 'Alcohol', sort_order: 80 },
  { name: 'Rum', tag_label: 'Alcohol', sort_order: 90 },
  { name: 'Soft Drinks', sort_order: 100 },
  { name: 'Sparkling Wine', tag_label: 'Alcohol', sort_order: 110 },
  { name: 'Sweet Dessert Wine', tag_label: 'Alcohol', sort_order: 120 },
  { name: 'Tequila', tag_label: 'Alcohol', sort_order: 130 },
  { name: 'Vodka', tag_label: 'Alcohol', sort_order: 140 },
  { name: 'Water', sort_order: 150 },
  { name: 'Whiskey', tag_label: 'Alcohol', sort_order: 160 },
  { name: 'White Wine', tag_label: 'Alcohol', sort_order: 170 },
]

export const RESTAURANT_MENU_CATEGORIES: SeedCategory[] = [
  { name: 'Breakfast', sort_order: 10 },
  { name: 'Starters', sort_order: 20 },
  { name: 'Soups', sort_order: 30 },
  { name: 'Main Course', sort_order: 40 },
  { name: 'Grill', sort_order: 50 },
  { name: 'Sides', sort_order: 60 },
  { name: 'Desserts', sort_order: 70 },
  { name: 'Hot Beverages', sort_order: 80 },
  { name: 'Soft Drinks', sort_order: 90 },
]

export const LAUNDRY_MENU_TREE: SeedCategory[] = [
  {
    name: 'Gentlemen',
    sort_order: 10,
    children: [
      { name: 'Normal Laundry (Men)', sort_order: 10 },
      { name: 'Ironing (Men)', sort_order: 20 },
      { name: 'Laundry Starched (Men)', sort_order: 30 },
      { name: 'Starched (Men)', sort_order: 40 },
      { name: 'Dry Cleaning (Men)', sort_order: 50 },
    ],
  },
  {
    name: 'Ladies',
    sort_order: 20,
    children: [
      { name: 'Normal Laundry', sort_order: 10 },
      { name: 'Ironing', sort_order: 20 },
      { name: 'Laundry Starched', sort_order: 30 },
      { name: 'Starched', sort_order: 40 },
      { name: 'Dry Cleaning', sort_order: 50 },
    ],
  },
  {
    name: 'Others',
    sort_order: 30,
    children: [
      { name: 'Bedding & Linen', sort_order: 10 },
      { name: 'House Linen', sort_order: 20 },
    ],
  },
]

export const GYM_MENU_CATEGORIES: SeedCategory[] = [
  { name: 'Day Pass', sort_order: 10 },
  { name: 'Membership', sort_order: 20 },
  { name: 'Personal Training', sort_order: 30 },
  { name: 'Retail', sort_order: 40 },
]

export const BANQUETS_MENU_CATEGORIES: SeedCategory[] = [
  { name: 'Hall Hire', sort_order: 10 },
  { name: 'Catering Packages', sort_order: 20 },
  { name: 'Beverage Packages', sort_order: 30, tag_label: 'Alcohol' },
  { name: 'Equipment & AV', sort_order: 40 },
]

export function seedCategoriesForDepartment(department: OutletDepartmentKey): SeedCategory[] {
  switch (department) {
    case 'main_bar':
    case 'pool_bar':
      return BAR_MENU_CATEGORIES
    case 'restaurant':
      return RESTAURANT_MENU_CATEGORIES
    case 'laundry':
      return LAUNDRY_MENU_TREE
    case 'gym':
      return GYM_MENU_CATEGORIES
    case 'banquets':
      return BANQUETS_MENU_CATEGORIES
    default:
      return []
  }
}

export function flattenSeedCategories(
  department: OutletDepartmentKey,
  orgId: string,
  userId: string | null,
): Array<{
  organization_id: string
  department: string
  parent_id: null
  name: string
  slug: string
  sort_order: number
  tag_label: string | null
  created_by: string | null
  updated_by: string | null
  _children?: Array<{
    organization_id: string
    department: string
    name: string
    slug: string
    sort_order: number
    tag_label: string | null
    created_by: string | null
    updated_by: string | null
  }>
}> {
  const tree = seedCategoriesForDepartment(department)
  return tree.map((c) => ({
    organization_id: orgId,
    department,
    parent_id: null,
    name: c.name,
    slug: outletSlugify(c.name),
    sort_order: c.sort_order,
    tag_label: c.tag_label ?? null,
    created_by: userId,
    updated_by: userId,
    _children: c.children?.map((ch) => ({
      organization_id: orgId,
      department,
      name: ch.name,
      slug: outletSlugify(`${c.name}-${ch.name}`),
      sort_order: ch.sort_order,
      tag_label: c.tag_label ?? null,
      created_by: userId,
      updated_by: userId,
    })),
  }))
}
