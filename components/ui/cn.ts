// Junta classes CSS ignorando valores falsos.
export function cn(...partes: (string | false | null | undefined)[]): string {
  return partes.filter(Boolean).join(' ')
}
