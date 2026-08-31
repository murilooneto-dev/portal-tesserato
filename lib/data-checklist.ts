// Helpers de formatação de data usados nos inputs "DD/MM/AAAA" dos
// checklists de tarefa (TarefaChecklist.tsx e MinhasTarefasTable.tsx) —
// extraídos pra um só lugar pra não duplicar a lógica de parsing/formatação.

export function isoParaDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function displayParaIso(display: string): string | null {
  const digits = display.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const d = digits.slice(0, 2)
  const m = digits.slice(2, 4)
  const y = digits.slice(4, 8)
  if (parseInt(y, 10) < 1000) return null
  const iso = `${y}-${m}-${d}`
  const dateObj = new Date(iso + 'T12:00:00')
  if (isNaN(dateObj.getTime())) return null
  return iso
}

export function autoFormatarData(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length > 4) return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
  if (digits.length > 2) return `${digits.slice(0,2)}/${digits.slice(2)}`
  return digits
}
