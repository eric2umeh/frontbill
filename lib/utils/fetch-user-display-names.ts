import { getUserDisplayName } from './user-display'

export async function fetchUserDisplayNameMap(userIds: string[], callerId: string) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
  const fallbackMap = uniqueIds.reduce<Record<string, string>>((acc, id) => {
    acc[id] = getUserDisplayName(null, id)
    return acc
  }, {})

  if (!callerId || uniqueIds.length === 0) return fallbackMap

  try {
    const response = await fetch('/api/profiles/display-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caller_id: callerId, user_ids: uniqueIds }),
    })

    if (!response.ok) return fallbackMap

    const payload = await response.json()
    return { ...fallbackMap, ...(payload.names || {}) }
  } catch {
    return fallbackMap
  }
}
