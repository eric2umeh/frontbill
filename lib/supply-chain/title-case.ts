import { titleCaseWhileTyping as titleCaseWhileTypingShared } from '@/lib/utils/name-format'

/** Title-case each word: "jollof rice" → "Jollof Rice" */
export function toTitleCaseWords(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/** Title-case while typing — capitalizes each word as the user types. */
export const titleCaseWhileTyping = titleCaseWhileTypingShared
