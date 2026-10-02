// tests/fase4a-varredura.test.ts — telas tocadas na Fase 4a (Fiscal / clientes) sem restos do visual antigo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const ARQUIVOS = [
  'app/fiscal/clientes/[id]/page.tsx', 'app/fiscal/clientes/page.tsx', 'components/HistoricoResponsavel.tsx',
  'components/fiscal/AbasFichaCelular.tsx', 'components/fiscal/CamposFiscais.tsx', 'components/fiscal/ClienteAcoes.tsx',
  'components/fiscal/ClienteArquivos.tsx', 'components/fiscal/ClienteConferencia.tsx', 'components/fiscal/ClienteObs.tsx',
  'components/fiscal/ClientesLista.tsx', 'components/fiscal/EmpresaModal.tsx', 'components/fiscal/TarefaChecklist.tsx',
  'components/geral/EventoAvulsoModal.tsx', 'components/geral/EventosAvulsosSecao.tsx', 'components/geral/GruposTarefasModal.tsx',
  'components/geral/SeletorAtividades.tsx', 'components/geral/TarefasAutomaticasCampo.tsx',
]
const ler = (arq: string) => readFileSync(join(ROOT, arq), 'utf8')

for (const arq of ARQUIVOS) {
  test(`sem visual antigo: ${arq}`, () => {
    const fonte = ler(arq)
    assert.doesNotMatch(fonte, /text-\[(9|10|11)px\]/, 'texto abaixo de 12 px')
    assert.doesNotMatch(fonte, /\[var\(--(fg|accent|accent-hover|bg-surface|bg-page)\)\]/, 'cor antiga por var()')
    assert.doesNotMatch(fonte, /\b(amber|red|green|emerald|indigo|orange)-\d{3}\b/, 'cor fixa do Tailwind')
    assert.doesNotMatch(fonte, /(^|[^.\w])(confirm|alert)\(/m, 'confirm()/alert() do navegador')
    assert.doesNotMatch(fonte, /fixed inset-0/, 'janela montada à mão')
    assert.doesNotMatch(fonte, /[🔎📋🏪📢🔔✏✕⚠]/u, 'emoji no lugar de ícone')
  })
}

test('contêiner que rola a tabela é relative (sr-only dos cabeçalhos não alarga a página)', () => {
  for (const arq of [
    'components/fiscal/ClientesLista.tsx', 'components/geral/ClientesGeralLista.tsx',
    'app/(comum)/vinculos/VinculosClient.tsx', 'app/(comum)/ferramentas/FerramentasClient.tsx',
  ]) {
    const fonte = ler(arq)
    assert.match(fonte, /className="relative overflow-x-auto"/, arq)
    assert.doesNotMatch(fonte, /className="overflow-x-auto"/, arq)
  }
})

test('EventoAvulsoModal: exceção no envio sempre libera a janela (try/catch/finally)', () => {
  const fonte = ler('components/geral/EventoAvulsoModal.tsx')
  assert.match(fonte, /\} finally \{\s*setSaving\(false\)\s*\}/)
  assert.match(fonte, /catch \{[\s\S]*Arquivos acima de 4 MB não são aceitos/)
  assert.match(fonte, /if \(criouAgora\) router\.refresh\(\)/)
})

test('abas da ficha apontam para os painéis (aria-controls)', () => {
  assert.match(ler('components/fiscal/AbasFichaCelular.tsx'), /aria-controls=\{idPrimeiroPainel\(a\.id\)\}/)
})
