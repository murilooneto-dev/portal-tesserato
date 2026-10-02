// tests/fase4b-preenchimento.test.ts — Preenchimento rápido (Fase 4b): três passos visíveis, sem visual antigo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')
const ARQUIVOS = ['components/PreenchimentoRapido.tsx', 'app/fiscal/preenchimento-rapido/page.tsx']

for (const arq of ARQUIVOS) {
  test(`${arq}: sem fontes pequenas, [var(--fg)] nem alert/confirm`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.doesNotMatch(src, /\b(alert|confirm)\(/)
  })
}

test('componente mostra os três passos desde o início e "—" quando não se aplica', () => {
  const src = ler('components/PreenchimentoRapido.tsx')
  for (const t of ['numero={1}', 'numero={2}', 'Marque o que já foi feito', 'Não se aplica a este cliente', 'sticky left-0']) {
    assert.ok(src.includes(t), t)
  }
  assert.ok(src.includes('relative overflow-x-auto'))
})

test('componente mantém gravação e aplicabilidade', () => {
  const src = ler('components/PreenchimentoRapido.tsx')
  for (const t of ['onToggle(clienteId, tipo, novaConcluida)', 'tarefasAplicaveisCliente(', 'tarefasDisponiveisParaClientes(', 'calcularLinhasVisiveis(', 'modoDireto', 'filtroPendentes && apenasPendentes']) {
    assert.ok(src.includes(t), t)
  }
})

test('página do Fiscal usa Pagina e mantém a action de gravação', () => {
  const src = ler('app/fiscal/preenchimento-rapido/page.tsx')
  assert.ok(src.includes('<Pagina>') && src.includes('CabecalhoPagina'))
  assert.ok(src.includes('toggleTarefaFiscal(clienteId, tipo, mes, ano, concluida)'))
})
