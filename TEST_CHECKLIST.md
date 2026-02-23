# FrontBill Database Connection - Test Checklist

## Pre-Test Setup
- [ ] You have Supabase properly connected (env vars set)
- [ ] Database migrations have been applied (001-005)
- [ ] You have a Supabase account with FrontBill project

---

## Test 1: Signup & Auto-Organization

### Steps:
1. Go to `/auth/sign-up`
2. Create new account with:
   - Email: `test@example.com`
   - Password: `TestPassword123!`
3. You should be logged in automatically
4. Check Supabase dashboard:
   - Go to **organizations** table
   - Verify new organization "test@example.com's Hotel" was created
   - Go to **profiles** table
   - Verify your user has `organization_id` set to the new organization

### Expected Results:
- ✅ Can sign up without error
- ✅ Auto-created organization in database
- ✅ Profile linked to organization
- ✅ Redirected to dashboard

---

## Test 2: Create a Room

### Steps:
1. Click **Rooms** in sidebar
2. Click **Add Room** button
3. Fill form:
   - Room Number: `101`
   - Floor: `1`
   - Type: `Deluxe`
   - Capacity: `2`
   - Rate/Night: `25000`
   - Status: `Available`
   - Add amenities: `King Bed`, `Smart TV`, `Balcony`
4. Click **Add Room**
5. Toast should show: "Room 101 added successfully!"

### Expected Results:
- ✅ Form submits without error
- ✅ Success toast appears
- ✅ Modal closes automatically
- ✅ Room 101 appears in rooms table immediately
- ✅ Room data visible in Supabase dashboard → **rooms** table

### If It Fails:
- Check browser console for error message
- Verify organization_id is being fetched in modal
- Check Supabase RLS policies aren't blocking insert

---

## Test 3: Create Multiple Rooms

### Steps:
1. Add 3 more rooms:
   - Room 102, Floor 1, Deluxe, ₦25,000
   - Room 201, Floor 2, Royal Suite, ₦50,000
   - Room 202, Floor 2, King Suite, ₦45,000

### Expected Results:
- ✅ All rooms appear in list
- ✅ Can search/filter by room number, type, status
- ✅ Room details show correctly in both table and card views

---

## Test 4: Create a Guest

### Steps:
1. Go to **Bookings** page
2. Click **New Booking** button
3. In Step 1 "Guest" section:
   - Enter Name: `John Doe`
   - Enter Phone: `+2349876543210`
4. Click **Create Guest** button
5. Toast: "Guest created"
6. Guest should auto-select in the dropdown

### Expected Results:
- ✅ Guest created successfully
- ✅ Toast confirmation
- ✅ Guest appears in available guests list
- ✅ Guest data in Supabase **guests** table

---

## Test 5: Create a Booking

### Steps:
1. Continue from Test 4 (guest already selected)
2. Click **Next** button → Step 2
3. Select dates:
   - Check-in: Today
   - Check-out: 3 days from today
4. Click **Next** → Step 3
5. Select Room: `Room 101 - Deluxe (₦25,000/night)`
6. Payment Method: `Cash`
7. Verify total shows: ₦75,000 (25,000 × 3 nights)
8. Click **Create Booking**
9. Toast: "Booking created! Total: ₦75,000"

### Expected Results:
- ✅ Booking created successfully
- ✅ Total calculated correctly
- ✅ Booking appears in bookings list
- ✅ Folio ID auto-generated (format: YYYYMMXXXXX)
- ✅ Room 101 status changes to "occupied"
- ✅ Data in Supabase **bookings** table

---

## Test 6: Data Persistence

### Steps:
1. Complete Test 5
2. Log out (click profile → Logout)
3. Log back in with same email
4. Go to **Rooms**
   - Verify all 4 rooms still there

5. Go to **Bookings**
   - Verify booking still there
   - Guest name should display correctly
   - Room number should display correctly

### Expected Results:
- ✅ All data persists across logout/login
- ✅ Correct data appears (not blank/null)
- ✅ Organization isolation works (only see own data)

---

## Test 7: Real-time Updates (Optional)

### Steps:
1. Open Supabase dashboard in another browser tab
2. Go to **rooms** table
3. In this browser, update a room status (if edit exists)
4. Check Supabase dashboard - should update in real-time

### Expected Results:
- ✅ Changes appear immediately in Supabase
- ✅ If you refresh page, updated data appears

---

## Common Issues & Fixes

### Issue: "No organization found"
**Solution**: Make sure you created a NEW account AFTER the fix was applied
- Old accounts won't have organization_id
- Create fresh account to get auto-organization

### Issue: Room/Guest not appearing in list after creation
**Solution**: 
- Hard refresh page (Ctrl+Shift+R or Cmd+Shift+R)
- Check browser console for errors
- Verify RLS policies aren't blocking your organization

### Issue: "Organization not found" in modal
**Solution**:
- Check Supabase profiles table
- Verify your user profile has `organization_id` filled
- If null, manually update or create new account

### Issue: Dates not selectable in booking form
**Solution**:
- Make sure check-in date is today or later
- Make sure check-out is after check-in
- Browser date picker might need refresh

---

## Success Criteria

All tests pass if:
- [ ] Can sign up and auto-organization is created
- [ ] Can create rooms and they appear in list
- [ ] Can create guests and bookings
- [ ] Data persists across logout/login
- [ ] No "organization not found" errors
- [ ] Database shows correct data in all tables
- [ ] Rooms change status when booked

---

## Testing Commands (Supabase Console)

If you want to verify data directly in Supabase SQL:

```sql
-- See your organization
SELECT * FROM organizations WHERE email = 'test@example.com';

-- See rooms in your org
SELECT * FROM rooms WHERE organization_id = 'YOUR_ORG_ID';

-- See bookings in your org
SELECT * FROM bookings WHERE organization_id = 'YOUR_ORG_ID';

-- See guests in your org
SELECT * FROM guests WHERE organization_id = 'YOUR_ORG_ID';
```

---

## Report Issues

If any test fails:
1. Note the exact step that failed
2. Check browser console (F12) for error message
3. Check Supabase dashboard for data
4. Provide error message when reporting
