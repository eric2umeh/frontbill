export const FOLIO_ATTACHMENT_SOURCES = [
  'reservation_create',
  'booking_create',
  'extend_stay',
  'extend_stay_discount',
  'reschedule_stay',
  'room_change',
  'manual',
] as const

export type FolioAttachmentSource = (typeof FOLIO_ATTACHMENT_SOURCES)[number]

export const FOLIO_ATTACHMENT_SOURCE_LABELS: Record<FolioAttachmentSource, string> = {
  reservation_create: 'New reservation',
  booking_create: 'New booking',
  extend_stay: 'Extend stay',
  extend_stay_discount: 'Extend stay (discount request)',
  reschedule_stay: 'Move dates request',
  room_change: 'Room change',
  manual: 'Folio note',
}
