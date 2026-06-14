# Supply Chain Revamp (branch `revamp`)

Mock-first accountable F&B flow aligned with UI reference screenshots in `docs/store`, `docs/kitchen`, `docs/food n beverage`.

## Flow

```
Low stock (F&B sales) → Central Store basket → PO → Accountant → Manager → Market
  → Retirement → Central store stock ↑

Store issues raw materials (batch open) → Kitchen produces portions → F&B kitchen stock ↑
  → Guest order → Kitchen stock ↓ (auto) → Activity log

Pepper Chicken example: ₦7,000 batch cost → 4 portions @ ₦7,000 sell = ₦28,000 revenue, ₦21,000 profit
```

## Routes

| Path | Screenshot reference |
|------|---------------------|
| `/supply/store` | Central Store — stock, raise PR, PO, history |
| `/supply/kitchen` | Kitchen — stock, production, recipe master, open batch |
| `/supply/fnb` | F&B Sales — orders, 86 alerts, auto deduct |
| `/supply/purchasing` | Market retirement |
| `/supply/activity` | Audit log |

## Demo (admin)

1. **Store** → Raise Purchase Request → add chicken → basket → submit PO
2. **Purchasing** → accountant/manager approve
3. **Kitchen** → Recipe Master → Peppered Chicken → Open Batch (deducts store stock)
4. Close batch → 4 portions to F&B kitchen stock
5. **F&B Sales** → New Order → Peppered Chicken × 4 → stock depletes
6. **Supply Log** → see full trail

Legacy `/store` redirects to `/supply/store`. Old Store/Outlets sidebar entries removed on this branch.
