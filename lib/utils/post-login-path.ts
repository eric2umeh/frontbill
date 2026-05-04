/** First route after email/password login. Store-only staff skip the dashboard. */
export function getPostLoginPath(role: string | null | undefined): string {
  if (role === 'store') return '/store'
  return '/dashboard'
}
