import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { limparRegimes, opcoesDeRegime } from '../lib/minhas-tarefas-regimes'

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
  assert.match(src, /donoAtendeRegime\(regimesAlvo, c\.regime\)/)
  assert.match(src, /clientes=\{clientesTodos\}/)
})
