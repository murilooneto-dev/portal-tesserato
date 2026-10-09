import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
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

const ler = (arq: string) => readFileSync(join(process.cwd(), arq), 'utf-8')

test('telas: sem fontes pequenas, cores fixas nem alert/confirm', () => {
  for (const arq of ['app/fiscal/parametros/UsuarioDrawer.tsx', 'app/fiscal/minhas-tarefas/page.tsx']) {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(10|11)px\]/)
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}/)
    assert.doesNotMatch(src, /(alert|confirm)\(/)
  }
})

test('Minhas Tarefas não mostra mais o campo e segue filtrando pelo regime', () => {
  const src = ler('app/fiscal/minhas-tarefas/page.tsx')
  assert.doesNotMatch(src, /MinhasTarefasRegimes/)
  assert.doesNotMatch(src, /Regimes que atendo/)
  assert.equal(existsSync(join(process.cwd(), 'components/fiscal/MinhasTarefasRegimes.tsx')), false)
  assert.match(src, /clientesDaSecao\(clientesTodos, tipoInfo\.nome, regimesAlvo\)/)
  assert.match(src, /clientes=\{clientesTodos\}/)
})

test('a action de gravar regimes exige admin sempre, mesmo para o próprio id', () => {
  const src = ler('lib/minhas-tarefas-regimes-actions.ts')
  assert.match(src, /export async function salvarRegimesDoUsuario/)
  assert.match(src, /getAuthenticatedAdmin\(\)/)
  assert.match(src, /callerProfile\?\.role !== 'admin'/)
  assert.doesNotMatch(src, /userId !== user\.id/)
  assert.match(src, /limparRegimes\(regimes\)/)
  assert.match(src, /revalidatePath\('\/fiscal', 'layout'\)/)
})

test('ficha do usuário em Parâmetros tem o campo e grava pela action', () => {
  const drawer = ler('app/fiscal/parametros/UsuarioDrawer.tsx')
  assert.match(drawer, /Regimes que atende em Minhas Tarefas \(Fiscal\)/)
  assert.match(drawer, /opcoesDeRegime\(regimesCatalogo, regimes\)/)
  assert.match(drawer, /setores\.includes\('fiscal'\)/)
  assert.match(drawer, /salvarRegimesDoUsuario\(perfil\.id, regimes\)/)
  const page = ler('app/fiscal/parametros/page.tsx')
  assert.match(page, /buscarCatalogoCliente\(supabase, 'fiscal'\)/)
  assert.match(page, /minhas_tarefas_regimes/)
})

test('migration 069 deixa só leitura e admin; teste de fumaça espera 2 policies', () => {
  const mig = ler('supabase/migrations/069_minhas_tarefas_regimes.sql')
  assert.doesNotMatch(mig, /create policy "Usuario grava/)
  assert.match(mig, /drop policy if exists "Usuario grava os proprios regimes"/)
  assert.match(ler('supabase/tests/069_minhas_tarefas_regimes_smoke.sql'), /v_qtd = 2/)
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
