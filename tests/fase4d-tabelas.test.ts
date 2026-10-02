// tests/fase4d-tabelas.test.ts — Lista e tabela aberta (Fase 4d) no desenho novo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')
const ARQUIVOS = [
  'components/tabelas/TabelasLista.tsx',
  'components/tabelas/TabelaDetalhe.tsx',
  'components/tabelas/TabelaEditavel.tsx',
  'components/tabelas/BarraConsulta.tsx',
]

for (const arq of ARQUIVOS) {
  test(`${arq}: sem fontes pequenas nem [var(--fg)]`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
  })
  test(`${arq}: sem confirm() do navegador`, () => {
    assert.doesNotMatch(ler(arq), /(^|[^.\w])confirm\(/)
  })
}

test('lista e tabela aberta rolam dentro de "relative overflow-x-auto"', () => {
  assert.ok(ler('components/tabelas/TabelasLista.tsx').includes('relative overflow-x-auto'))
  assert.ok(ler('components/tabelas/TabelaEditavel.tsx').includes('relative max-h-[75vh] overflow-x-auto'))
})

test('lista usa Pagina, EmptyState e mostra linhas e data de atualização', () => {
  const src = ler('components/tabelas/TabelasLista.tsx')
  for (const t of ['<Pagina>', 'CabecalhoPagina', 'EmptyState', 'updated_at', 'Atualizada em']) assert.ok(src.includes(t), t)
})

test('tabela aberta: 1ª coluna fixa, sem alça de redimensionar, aria-sort, selo e confirmação', () => {
  const src = ler('components/tabelas/TabelaEditavel.tsx')
  assert.ok(src.includes('sticky left-0'))
  assert.doesNotMatch(src, /resize-(y|x|both)/)
  assert.ok(src.includes('aria-sort'))
  assert.ok(src.includes('>sem cliente</Badge>'))
  assert.ok(src.includes('useConfirmar'))
  assert.ok(src.includes('<IconButton'))
})

test('tabela aberta mantém as chamadas de edição de célula', () => {
  const src = ler('components/tabelas/TabelaEditavel.tsx')
  for (const t of ['editarCelula({ linhaId: l.id, colunaId: c.id, valor: entrada })',
    'definirClienteDaLinha({ linhaId: l.id, colunaId: c.id, clienteId: clienteId || null })',
    'adicionarLinha(planilhaId)', 'removerLinha(l.id)']) assert.ok(src.includes(t), t)
})

test('detalhe: paginação no rodapé e contrato de searchParams', () => {
  const src = ler('components/tabelas/TabelaDetalhe.tsx')
  assert.ok(src.includes('rodape='))
  assert.ok(src.includes('aria-label="Paginação"'))
  assert.ok(src.includes('semCliente'))
  assert.ok(src.includes('serializeConsulta'))
})

test('filtros: contagem de ativos, Aplicar e Limpar reaproveitando parseConsulta', () => {
  const src = ler('components/tabelas/BarraConsulta.tsx')
  for (const t of ['filtros ativos', 'Aplicar filtros', 'Limpar', 'parseConsulta(', 'filtros: JSON.stringify(campos)', 'aria-expanded']) assert.ok(src.includes(t), t)
  for (const t of ["c.tipo === 'texto'", "c.tipo === 'opcoes'", "c.tipo === 'numero'", "c.tipo === 'data'"]) assert.ok(src.includes(t), t)
})
