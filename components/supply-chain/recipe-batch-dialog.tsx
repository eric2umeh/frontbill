'use client'

import { useEffect, useState } from 'react'
import type { Recipe } from '@/lib/supply-chain/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { OutletCategorySearchField } from '@/components/supply-chain/outlet-category-search-field'

type Props = {
  recipe: Recipe | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (patch: {
    name: string
    category: string
    yieldPortions: number
    sellingPricePerPortion: number
    overheadCost: number
    ingredients: Recipe['ingredients']
  }) => void | Promise<void>
}

export function RecipeBatchDialog({ recipe, open, onOpenChange, onSave }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [yieldPortions, setYieldPortions] = useState('4')
  const [sellingPrice, setSellingPrice] = useState('0')
  const [overhead, setOverhead] = useState('0')
  const [ingredients, setIngredients] = useState<Recipe['ingredients']>([])

  useEffect(() => {
    if (!recipe || !open) return
    setName(recipe.name)
    setCategory(recipe.category)
    setCategoryId(null)
    setYieldPortions(String(recipe.yieldPortions))
    setSellingPrice(String(recipe.sellingPricePerPortion))
    setOverhead(String(recipe.overheadCost))
    setIngredients(recipe.ingredients.map((i) => ({ ...i })))
  }, [recipe, open])

  if (!recipe) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit batch standard</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Batch / menu name</Label>
            <Input className="mt-0.5" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <OutletCategorySearchField
            value={category}
            categoryId={categoryId}
            onChange={(n, id) => {
              setCategory(n)
              setCategoryId(id)
            }}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Standard yield (portions)</Label>
              <Input
                type="number"
                min={1}
                className="mt-0.5"
                value={yieldPortions}
                onChange={(e) => setYieldPortions(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Selling price / portion (₦)</Label>
              <Input
                type="number"
                min={0}
                className="mt-0.5"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Overhead (₦)</Label>
            <Input
              type="number"
              min={0}
              className="mt-0.5"
              value={overhead}
              onChange={(e) => setOverhead(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Ingredients per standard batch</Label>
            <ul className="space-y-2">
              {ingredients.map((ing, idx) => (
                <li key={ing.stockItemId} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{ing.name}</span>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    className="h-8 w-20"
                    value={ing.quantity}
                    onChange={(e) => {
                      const qty = Number(e.target.value) || 0
                      setIngredients((prev) =>
                        prev.map((row, i) => {
                          if (i !== idx) return row
                          const unitCost = row.quantity > 0 ? row.cost / row.quantity : 0
                          return { ...row, quantity: qty, cost: qty * unitCost }
                        }),
                      )
                    }}
                  />
                  <span className="text-xs text-muted-foreground w-10">{ing.unit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={async () =>
              onSave({
                name: name.trim(),
                category: category.trim(),
                yieldPortions: Number(yieldPortions) || 0,
                sellingPricePerPortion: Number(sellingPrice) || 0,
                overheadCost: Number(overhead) || 0,
                ingredients,
              })
            }
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
