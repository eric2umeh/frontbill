export type BackdateApprovalRequest = {
  status?: string | null
  request_type?: string | null
  dedupe_key?: string | null
}

export function isMatchingApprovedBackdateRequest(
  request: BackdateApprovalRequest,
  expected: { requestType: string; dedupeKey: string },
): boolean {
  return (
    request.status === 'approved' &&
    request.request_type === expected.requestType &&
    request.dedupe_key === expected.dedupeKey
  )
}
