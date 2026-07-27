/** True when the request session matches the client-supplied caller_id. */
export function callerMatchesSession(
  callerId: string | null | undefined,
  authedUserId: string | null | undefined,
): boolean {
  if (!callerId || !authedUserId) return false
  return callerId === authedUserId
}
