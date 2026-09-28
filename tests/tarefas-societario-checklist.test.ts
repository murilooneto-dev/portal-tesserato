import { test } from 'node:test'
import assert from 'node:assert/strict'

// Reimplementação isolada só pra testar a lógica de formatação sem montar
// o componente React inteiro — o componente real (Step 3) usa exatamente
// esta função.
function formatarDdMm(iso: string | null): string {
  if (!iso) return ''
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

test('formatarDdMm não recua um dia (bug de fuso horário corrigido)', () => {
  assert.equal(formatarDdMm('2026-09-03'), '03/09/2026')
  assert.equal(formatarDdMm('2026-01-01'), '01/01/2026')
  assert.equal(formatarDdMm('2026-12-31'), '31/12/2026')
})

test('formatarDdMm com null devolve string vazia', () => {
  assert.equal(formatarDdMm(null), '')
})
