import { formatNaira } from '@/lib/utils/currency'

const toNumber = (value: any) => Number(value || 0)

const nightsFor = (booking: any) => {
  const nights = toNumber(booking.number_of_nights ?? booking.nights)
  if (nights > 0) return nights
  const checkIn = new Date(booking.check_in || booking.checkIn)
  const checkOut = new Date(booking.check_out || booking.checkOut)
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return 1
  return Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000))
}

export function generateLocalGuestInsights(bookings: any[] = []) {
  const totalBookings = bookings.length
  const totalNights = bookings.reduce((sum, booking) => sum + nightsFor(booking), 0)
  const totalRevenue = bookings.reduce((sum, booking) => sum + toNumber(booking.total_amount ?? booking.amount), 0)
  const averageStay = totalBookings ? Math.max(1, Math.round((totalNights / totalBookings) * 10) / 10) : 0

  const roomCounts = bookings.reduce<Record<string, number>>((counts, booking) => {
    const roomType = booking.rooms?.room_type || booking.room_type || booking.room || 'Standard'
    counts[roomType] = (counts[roomType] || 0) + 1
    return counts
  }, {})

  const preferredRoomType = Object.entries(roomCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'No room preference yet'
  const corporateCount = bookings.filter((booking) => booking.organization_id || /corporate|company|ledger/i.test(String(booking.notes || ''))).length

  return {
    guestSegment: corporateCount > totalBookings / 2 ? 'Corporate / city-ledger guests' : totalBookings > 0 ? 'Mixed individual and leisure guests' : 'No guest history yet',
    averageStay,
    preferredRoomType,
    estimatedLTV: formatNaira(Math.max(totalRevenue, totalBookings * 50000)),
    recommendations: totalBookings > 0
      ? [
          `Promote ${preferredRoomType} rooms because they are currently the most requested.`,
          averageStay <= 1 ? 'Offer second-night incentives to grow average stay length.' : 'Create repeat-stay offers for guests with multi-night bookings.',
          corporateCount > 0 ? 'Follow up with corporate/city-ledger guests for repeat bulk reservations.' : 'Capture company details for frequent guests to grow corporate accounts.',
        ]
      : ['Start capturing completed bookings to unlock stronger guest pattern recommendations.'],
  }
}

export function generateLocalRevenueRecommendation(bookings: any[] = [], currentDate = new Date().toISOString()) {
  const now = new Date(currentDate)
  const activeStatuses = new Set(['confirmed', 'checked_in', 'reserved'])
  const activeBookings = bookings.filter((booking) => activeStatuses.has(String(booking.status || '').toLowerCase()))
  const upcomingBookings = bookings.filter((booking) => new Date(booking.check_in || booking.checkIn) > now)
  const totalRevenue = bookings.reduce((sum, booking) => sum + toNumber(booking.total_amount ?? booking.amount), 0)
  const averageRate = bookings.length ? Math.round(totalRevenue / bookings.length) : 0
  const occupancyRate = Math.min(100, Math.round((activeBookings.length / Math.max(bookings.length, 1)) * 100))
  const adjustment = occupancyRate >= 80 ? '+10% to +15%' : occupancyRate >= 50 ? '+5% on high-demand room types' : 'Hold base rates, use packages to stimulate demand'

  return {
    currentOccupancyRate: occupancyRate,
    recommendedPriceAdjustment: adjustment,
    reasoning: occupancyRate >= 80
      ? 'Demand is strong, so premium rooms and late bookings can carry a higher rate.'
      : occupancyRate >= 50
        ? 'Occupancy is healthy but still has room to grow, so targeted increases are safer than broad price changes.'
        : 'Occupancy is light, so conversion and packages are more important than increasing rates.',
    potentialRevenueIncrease: averageRate ? formatNaira(Math.round(averageRate * Math.max(activeBookings.length, 1) * 0.1)) : formatNaira(0),
    seasonalTrends: [
      `${upcomingBookings.length} upcoming booking${upcomingBookings.length === 1 ? '' : 's'} in the current data set.`,
      `${activeBookings.length} active/reserved stay${activeBookings.length === 1 ? '' : 's'} driving near-term occupancy.`,
    ],
    actionItems: [
      'Review rates for occupied and reserved room types before accepting walk-ins.',
      'Prioritize collection for unpaid and partial-payment folios.',
      'Use city-ledger organization history to target repeat reservations.',
    ],
  }
}

export function generateLocalNightAuditSummary(dailyData: any = {}, date: string) {
  const checkIns = toNumber(dailyData.checkIns)
  const checkouts = toNumber(dailyData.checkouts)
  const occupancy = toNumber(dailyData.occupancy)
  const revenue = toNumber(dailyData.revenue)
  const pendingCheckouts = toNumber(dailyData.pendingCheckouts)
  const expectedArrivals = toNumber(dailyData.expectedArrivals)

  return {
    totalCheckouts: checkouts,
    totalCheckIns: checkIns,
    occupancyRate: occupancy,
    dayRevenue: formatNaira(revenue),
    keyHighlights: [
      `${checkIns} check-in${checkIns === 1 ? '' : 's'} and ${checkouts} checkout${checkouts === 1 ? '' : 's'} recorded for ${date}.`,
      `Current occupancy is ${occupancy}%.`,
      `${expectedArrivals} expected arrival${expectedArrivals === 1 ? '' : 's'} remain on the radar.`,
    ],
    issues: [
      ...(pendingCheckouts > 0 ? [`${pendingCheckouts} checkout${pendingCheckouts === 1 ? '' : 's'} still need follow-up.`] : []),
      ...(toNumber(dailyData.outstandingBalance) > 0 ? [`Outstanding balances total ${formatNaira(dailyData.outstandingBalance)}.`] : []),
    ],
    recommendations: [
      'Confirm all due checkouts and late checkout charges before closing the day.',
      'Review pending balances and assign follow-up ownership.',
      'Prepare rooms tied to tomorrow arrivals before the morning shift.',
    ],
    staffNotes: dailyData.notes || 'No special staff notes were recorded.',
  }
}
