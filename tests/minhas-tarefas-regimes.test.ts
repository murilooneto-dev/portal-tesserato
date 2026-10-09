import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { limparRegimes, opcoesDeRegime, clientesDaSecao, MAX_REGIMES, MAX_CARACTERES_REGIME } from '../lib/minhas-tarefas-regimes'

test('limparRegimes tira vazios, espaços e repetidos (sem olhar caixa)', () => {
  assert.deepEqual(limparRegimes([' MEI ', 'mei', '', '  ', 'Lucro Real']), ['MEI', 'Lucro Real'])
})

test('limparRegimes devolve lista vazia para entrada que não é lista de textos', () => {
  assert.deepEqual(limparRegimes(null), [])
  assert.deepEqual(limparRegimes('MEI'), [])
  assert.deepEqual(limparRegimes([1, null, 'MEI']), ['MEI'])
})

test('opcoesDeRegime marca os do catálogo e mostra o marcado que saiu dele', () => {
  assert.deepEqual(opcoesDeRegime(['Lucro Real', 'MEI'], ['mei', 'Antigo']), [
    { nome: 'Lucro Real', marcado: false, foraDoCatalogo: false },
    { nome: 'MEI', marcado: true, foraDoCatalogo: false },
    { nome: 'Antigo', marcado: true, foraDoCatalogo: true },
  ])
})

test('componente e página: sem fontes pequenas, cores fixas nem alert/confirm', () => {
  for (const arq of ['components/fiscal/MinhasTarefasRegimes.tsx', 'app/fiscal/minhas-tarefas/page.tsx']) {
    const src = readFileSync(join(process.cwd(), arq), 'utf-8')
    assert.doesNotMatch(src, /text-\[(10|11)px\]/)
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}\b/)
    assert.doesNotMatch(src, /\b(alert|confirm)\(/)
  }
})

test('página filtra as seções pelo regime e deixa Eventos com todos os clientes', () => {
  const src = readFileSync(join(process.cwd(), 'app/fiscal/minhas-tarefas/page.tsx'), 'utf-8')
  assert.match(src, /clientesDaSecao\(clientesTodos, tipoInfo\.nome, regimesAlvo\)/)
  assert.match(src, /clientes=\{clientesTodos\}/)
})

test('limparRegimes limita a 50 regimes e descarta texto com mais de 100 caracteres', () => {
  const muitos = Array.from({ length: 80 }, (_, i) => `R${i}`)
  assert.equal(limparRegimes(muitos).length, MAX_REGIMES)
  assert.deepEqual(limparRegimes(['x'.repeat(MAX_CARACTERES_REGIME + 1), 'x'.repeat(MAX_CARACTERES_REGIME)]), ['x'.repeat(MAX_CARACTERES_REGIME)])
})

const cs = [
  { id: 'a', regime: 'MEI', esperadas: ['DCTF', 'ICMS'] },
  { id: 'b', regime: 'Lucro Real', esperadas: ['DCTF'] },
  { id: 'c', regime: null, esperadas: ['DCTF'] },
]

test('clientesDaSecao: nada marcado devolve todos os clientes do tipo', () => {
  assert.deepEqual(clientesDaSecao(cs, 'DCTF', []).map(c => c.id), ['a', 'b', 'c'])
  assert.deepEqual(clientesDaSecao(cs, 'ICMS', undefined).map(c => c.id), ['a'])
})

test('clientesDaSecao: regime marcado deixa só o regime, sem regime fica fora, ignora caixa/espaços', () => {
  assert.deepEqual(clientesDaSecao(cs, 'DCTF', ['mei']).map(c => c.id), ['a'])
  assert.deepEqual(clientesDaSecao(cs, 'DCTF', ['  LUCRO real ', 'MEI']).map(c => c.id), ['a', 'b'])
})
