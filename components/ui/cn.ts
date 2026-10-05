import { twMerge } from 'tailwind-merge'

// Junta classes CSS ignorando valores falsos; em conflito do Tailwind
// (ex.: h-9 e h-11), a última vence — assim o className do chamador manda.
export function cn(...partes: (string | false | null | undefined)[]): string {
  return twMerge(partes.filter(Boolean).join(' '))
}
