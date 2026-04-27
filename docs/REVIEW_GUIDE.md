# Quick Reference: PR Review Guide

## 🚀 What This PR Does (In 30 Seconds)

Replaces all hardcoded mock data in dashboard and transaction pages with real-time Supabase queries. The application now displays:
- ✅ Actual today's revenue
- ✅ Real occupancy rates
- ✅ Live payment history
- ✅ Accurate room status

**Files Changed**: 8 | **Lines Changed**: ~850 | **Risk Level**: Low

---

## 📋 Files to Review (In Priority Order)

### Priority 1: Core Pages
1. **`/app/(dashboard)/transactions/page.tsx`** ⭐
   - Most frequently used page
   - Real payment display critical
   - Check: Date filtering, loading states, empty states

2. **`/app/(dashboard)/organizations/page.tsx`**
   - Critical for city ledger tracking
   - Check: Real organization data, form integration

### Priority 2: Key Components
3. **`/components/dashboard/dashboard-stats.tsx`** ⭐
   - Displays on every dashboard load
   - Performance critical
   - Check: Calculation accuracy, data freshness

4. **`/components/dashboard/revenue-chart.tsx`**
   - Data visualization component
   - Check: 7-day calculation logic, chart rendering

### Priority 3: Supporting Components
5. **`/components/dashboard/recent-payments.tsx`**
   - Secondary dashboard component
   - Check: Limit(5) query, sorting

6. **`/components/dashboard/room-status-grid.tsx`**
   - Room inventory display
   - Check: Status colors, scrolling

### Priority 4: Additional Pages
7. **`/app/(dashboard)/reconciliation/page.tsx`**
   - Reconciliation workflow
   - Check: Status counting, ordering

8. **`/app/(dashboard)/night-audit/page.tsx`**
   - Shift-end audit display
   - Check: Occupancy calculation, revenue sum

---

## 🔍 Key Things to Look For

### Data Fetching
```typescript
✅ Check that organization_id filtering is present
✅ Verify error handling with try/catch
✅ Confirm loading state management
✅ Ensure no hardcoded mock data remains
```

### User Experience
```typescript
✅ Loading spinners appear during fetch
✅ Empty states display when no data
✅ Error messages are helpful
✅ Currency formatting preserved (₦)
```

### Performance
```typescript
✅ useEffect dependency arrays correct (empty = mount only)
✅ No infinite loops or excessive renders
✅ Queries are optimized with filters
✅ Limits applied where appropriate
```

### Security
```typescript
✅ User authentication checked
✅ Organization filtering present
✅ No hardcoded credentials
✅ Error messages don't leak sensitive info
```

---

## ✅ Testing Scenarios

### Scenario 1: Normal Operation
```
1. Login with valid account
2. Navigate to dashboard
3. Wait for data to load
4. Verify real numbers display
Expected: Stats show actual values, not mock
```

### Scenario 2: Empty Data
```
1. Login with account that has no transactions
2. Navigate to transactions page
3. Check for empty state message
Expected: Clean empty state, no errors
```

### Scenario 3: Loading States
```
1. Open network throttling in DevTools
2. Slow 3G
3. Navigate to any dashboard component
4. Watch loading spinner appear
Expected: Smooth UX with clear loading indicator
```

### Scenario 4: Error Handling
```
1. Temporarily disconnect from internet
2. Refresh page
3. Check console for errors
Expected: Graceful error, no crash, console logs error
```

### Scenario 5: Organization Context
```
1. Login with user in organization A
2. Check transactions displayed
3. Switch to organization B
4. Transactions should change
Expected: Organization-specific data shown
```

---

## 🎯 Specific Component Checks

### DashboardStats
```
Must verify:
❓ Today's date used in query (not mock)
❓ Revenue calculation (sum of today's payments)
❓ Occupancy formula: (occupied/total) * 100
❓ Guest count = checked_in bookings
❓ Loading spinner appears
```

### RecentPayments
```
Must verify:
❓ Query uses limit(5)
❓ Ordered by payment_date DESC (newest first)
❓ Guest names are real
❓ Amounts match database
❓ Methods showing correctly (cash/pos/transfer)
```

### RevenueChart
```
Must verify:
❓ Shows last 7 days (not hardcoded Mon-Sun)
❓ Revenue calculation correct
❓ Date formatting with date-fns working
❓ Chart renders without errors
❓ Tooltip shows real values
```

### RoomStatusGrid
```
Must verify:
❓ Room numbers match database
❓ Status colors correct
❓ ScrollArea working on overflow
❓ Limit 12 rooms applied
❓ Room types showing
```

---

## 📊 Before/After Comparison

### Before (Mock Data)
```typescript
const stats = [
  { title: 'Today\'s Revenue', value: formatNaira(2450000), ... },
  // ... hardcoded values
]
```

### After (Real Data)
```typescript
const { data: payments } = await supabase
  .from('payments')
  .select('*')
  .eq('organization_id', profile.organization_id)
  .gte('payment_date', `${today}T00:00:00`)

const totalRevenue = payments?.reduce((sum, p) => sum + p.amount, 0) || 0
```

**Impact**: Revenue now reflects actual transactions ✅

---

## 🚨 Red Flags to Watch For

❌ **Import of mock data remaining**
```typescript
import { mockTransactions } from '@/lib/mock-data' // Should not exist
```

❌ **No error handling**
```typescript
const { data } = await supabase.from(...) // Missing try/catch
```

❌ **Infinite loops**
```typescript
useEffect(() => { fetchData() }) // Missing dependency array
```

❌ **Organization filtering missing**
```typescript
.select('*') // Should have .eq('organization_id', ...)
```

❌ **Hard-coded dates**
```typescript
.gte('payment_date', '2026-02-22') // Should use new Date()
```

---

## ✨ Green Lights to Look For

✅ **Proper Error Handling**
```typescript
try {
  // ...
} catch (error) {
  console.error('Error:', error)
  setData([])
} finally {
  setLoading(false)
}
```

✅ **Loading State Management**
```typescript
const [loading, setLoading] = useState(true)
// ...
{loading ? <Spinner /> : <Content />}
```

✅ **Empty State Handling**
```typescript
{data.length === 0 ? (
  <div>No data found</div>
) : (
  <ContentDisplay />
)}
```

✅ **Organization Filtering**
```typescript
.eq('organization_id', profile.organization_id)
```

✅ **Proper useEffect**
```typescript
useEffect(() => {
  fetchData()
}, []) // Empty dependency array = mount only
```

---

## 📋 Approval Checklist

**Code Review**
- [ ] All 8 files reviewed
- [ ] No mock data imports remain
- [ ] Error handling present
- [ ] Loading states implemented
- [ ] Organization filtering applied

**Testing**
- [ ] Dashboard loads correctly
- [ ] Real data displays
- [ ] Loading spinners work
- [ ] Empty states show
- [ ] No console errors

**Security**
- [ ] User authentication checked
- [ ] Organization filtering present
- [ ] No credential exposure

**Performance**
- [ ] No performance degradation
- [ ] Queries optimized
- [ ] No infinite loops

**Documentation**
- [ ] Commit message clear
- [ ] PR description complete
- [ ] Inline comments present

---

## 🎓 Questions to Ask During Review

1. **Data Accuracy**: Are all calculations based on actual database records?
2. **Multi-Tenancy**: Does organization_id filtering prevent cross-org data leaks?
3. **Error Handling**: What happens if Supabase query fails?
4. **Performance**: Will these queries scale with larger datasets?
5. **Real-Time**: Should we add real-time subscriptions for live updates?
6. **Caching**: Do we need caching to reduce query load?
7. **Testing**: Are there edge cases we haven't covered?
8. **Backwards Compatibility**: Does this break any existing features?

---

## 🎯 Review Time Estimate

- **Quick scan**: 10 minutes (just checking structure)
- **Thorough review**: 20-30 minutes (all files, logic, edge cases)
- **With testing**: 45 minutes (review + manual testing scenarios)

**Recommended**: Thorough review with testing

---

## 📞 Contact

For questions about this PR:
1. Check `PR_MOCK_DATA_REMOVAL.md` for full details
2. Review `CHANGES_DETAILED.md` for line-by-line changes
3. Look at inline comments in component files
4. Check git diff for exact code changes

---

**Status**: Ready for Review ✅
**Risk Level**: Low 🟢
**Impact**: High 📈 (enables real data functionality)

Approve and merge to enable real-time financial data in FrontBill dashboard.
