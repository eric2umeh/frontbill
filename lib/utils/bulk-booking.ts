export function createBulkGroupId() {
  return `BLKGRP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
}

export function extractBulkGroupId(notes?: string | null) {
  if (!notes) return ''
  return notes.match(/bulk_group:([A-Z0-9-]+)/i)?.[1] || ''
}

export function appendBulkGroupNote(notes: string, bulkGroupId: string) {
  return `${notes}${notes ? ' | ' : ''}bulk_group:${bulkGroupId}`
}

export function getBulkGroupId(row: any) {
  const explicitGroupId = extractBulkGroupId(row?.notes)
  if (explicitGroupId) return explicitGroupId

  const folioId = String(row?.folio_id || '')
  if (!/^BLK-/i.test(folioId)) return ''

  const ledgerName = String(
    row?.ledger_account_name
      || row?.notes?.match(/City Ledger:\s*([^|]+)/i)?.[1]
      || row?.guestName
      || row?.guests?.name
      || ''
  ).trim()
  const createdBucket = String(row?.created_at || '').slice(0, 16)
  const parts = [
    row?.organization_id || '',
    row?.check_in || '',
    row?.check_out || '',
    row?.rate_per_night || '',
    row?.created_by || '',
    createdBucket,
    ledgerName,
  ]

  return `legacy-${encodeURIComponent(parts.join('~'))}`
}

export function isLegacyBulkGroupId(groupId: string) {
  return groupId.startsWith('legacy-')
}
