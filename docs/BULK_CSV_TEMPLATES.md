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

Use this in Kitchen bulk CSV upload for batch standards and recipes.

Rules:

- Put the batch or recipe name on the first ingredient row only.
- Leave `batch / menu name` blank for the remaining ingredients under the same recipe.
- Use `yield unit` as `portion` for finished dishes, or units like `l`, `ml`, `kg` for prep stock.
- Use `ingredient source` as `raw` for Central Store items.
- Use `ingredient source` as `kitchen_stock` when the ingredient is a produced prep item like Chicken Stock.
- Mark `optional` as `yes` only for items that should appear on the recipe but not affect production cost.

After editing the full example batch list, upload it from Kitchen bulk CSV. The imported batch standards will appear in Kitchen > All Batches.
