# Bulk CSV Templates

Use these templates when onboarding a new hotel or moving setup data between staging and production.

## Store Items

Template:

`docs/store-items-template.csv`

Use this in Central Store when bulk adding catalogue items.

Required columns:

- `name`
- `unit`
- `depts` or `dept`

Useful optional columns:

- `quantityInStore`
- `reorderLevel`
- `lastPrice`
- `kitchenCategory`
- `conversionUnit`
- `qtyPerPack`

Download the template, edit the full example item list for the hotel, delete rows that are not needed, then upload from the Central Store bulk CSV upload.

## Kitchen Batches / Recipes

Template:

`docs/frontbill-kitchen-batches-template.csv`

The same file is served in the app at `public/templates/frontbill-kitchen-batches-template.csv` (download from **Kitchen → New batch → Bulk CSV → Download full template CSV**).

Use this in Kitchen bulk CSV upload for batch standards and recipes. The template is pre-filled with the hotel’s full recipe list (Fruit Salad, Bitter Leaf Soup, Jollof Rice, etc.). Edit names, quantities, prices, and ingredients as needed, then re-upload.

### Columns (header row)

| Column | Required | Notes |
|--------|----------|--------|
| `batch / menu name` | First row per recipe | Blank on continuation ingredient rows |
| `store items` | Yes (per ingredient) | e.g. `0.5 pack Watermelon`, `1 kg Rice` |
| `main category` | First row per recipe | e.g. `Salad`, `African Soups`, `Rice` |
| `planned portions` | First row per recipe | Standard yield count |
| `yield unit` | First row per recipe | Usually `portion`; use `l`, `ml`, `kg` for prep stock |
| `selling price / portion` | Optional | Outlet selling price in ₦ |
| `labour`, `gas`, `other` | Optional | Overhead per batch |
| `outlet` | Optional | `restaurant`, `none`, etc. |
| `ingredient source` | Optional | `raw` (store) or `kitchen_stock` (prep) |
| `optional` | Optional | `yes` for garnish-only lines |
| `line cost` | Optional | Hint cost per ingredient line |

### Rules

- Put the batch or recipe name on the **first ingredient row only**.
- Leave `batch / menu name` blank for the remaining ingredients under the same recipe.
- Use `yield unit` as `portion` for finished dishes, or units like `l`, `ml`, `kg` for prep stock.
- Use `ingredient source` as `raw` for Central Store items.
- Use `ingredient source` as `kitchen_stock` when the ingredient is a produced prep item like Chicken Stock.
- Mark `optional` as `yes` only for items that should appear on the recipe but not affect production cost.

After editing the template, upload it from Kitchen bulk CSV. The imported batch standards will appear in Kitchen → All Batches.
