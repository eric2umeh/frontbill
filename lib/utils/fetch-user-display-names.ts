import { getUserDisplayName } from './user-display'
import { fetchJsonWithTimeout } from './fetch-with-timeout'

export async function fetchUserDisplayNameMap(
  userIds: Array<string | null | undefined>,
  callerId?: string | null,
): Promise<Record<string, string>> {
  const uniqueIds = Array.from(
    new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  )
  const fallbackMap = uniqueIds.reduce<Record<string, string>>((acc, id) => {
    acc[id] = getUserDisplayName(null, id)
    return acc
  }, {})

  if (!callerId || uniqueIds.length === 0) return fallbackMap

  const { ok, data, timedOut } = await fetchJsonWithTimeout<{ names?: Record<string, string> }>(
    '/api/profiles/display-names',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caller_id: callerId, user_ids: uniqueIds }),
      credentials: 'include',
    },
    8_000,
  )

  if (timedOut || !ok || !data?.names) return fallbackMap
  return { ...fallbackMap, ...data.names }
}
