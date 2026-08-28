export const USAGE_SIGNAL_TYPES = [
  'app_installed',
  'standalone_open',
  'daily_sign_in',
  'first_open',
  'return_open',
] as const

export type UsageSignalType = (typeof USAGE_SIGNAL_TYPES)[number]

export function isUsageSignalType(value: string): value is UsageSignalType {
  return (USAGE_SIGNAL_TYPES as readonly string[]).includes(value)
}
