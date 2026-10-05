// tests/fase4d-tabelas-t2.test.ts — Janelas de tabela (Fase 4d, T2) no desenho novo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')
const ARQUIVOS = [
  'components/tabelas/NovaTabelaWizard.tsx',
  'components/tabelas/GerenciarEstrutura.tsx',
  'components/tabelas/ReenviarPlanilhaWizard.tsx',
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

test('Nova tabela: usa Modal com três passos (Arquivo, Colunas, Clientes) e indicador', () => {
  const src = ler('components/tabelas/NovaTabelaWizard.tsx')
  assert.ok(src.includes("from '@/components/ui/Modal'"))
  for (const t of ['Arquivo', 'Colunas', 'Clientes']) assert.ok(src.includes(`'${t}'`) || src.includes(t))
  assert.ok(src.includes('Voltar'))
  assert.ok(src.includes('Continuar'))
  assert.ok(src.includes('aria-current'))
})

test('Nova tabela mantém a chamada de criação intacta', () => {
  const src = ler('components/tabelas/NovaTabelaWizard.tsx')
  assert.ok(src.includes('criarPlanilha(entrada)'))
  assert.ok(src.includes('colunaChaveId,'))
})

test('Gerenciar colunas vira gaveta lateral (Drawer), com exclusão inline e rodapé de "salva na hora"', () => {
  const src = ler('components/tabelas/GerenciarEstrutura.tsx')
  assert.ok(src.includes("import { Drawer } from '@/components/ui/Modal'"))
  assert.ok(src.includes('<Drawer'))
  assert.ok(src.includes('Alterações salvas na hora'))
  assert.ok(src.includes("colunaExcluindo?.id === c.id"))
})

test('Gerenciar colunas mantém as chamadas de estrutura intactas', () => {
  const src = ler('components/tabelas/GerenciarEstrutura.tsx')
  for (const t of [
    'adicionarColuna({ planilhaId, nome: nomeValido, tipo: novoTipo, opcoes })',
    'renomearColuna({ colunaId: coluna.id, nome: nomeNovo })',
    'moverColuna({ colunaId: coluna.id, direcao })',
    'preVisualizarExclusaoColuna(coluna.id)',
    'excluirColuna(colunaExcluindo.id)',
    'preVisualizarTrocaTipo({',
    'trocarTipoColuna({',
    'renomearTabela({ planilhaId, nome: nomeTabela })',
    "excluirTabela({ planilhaId, nomeConfirmacao: nomeDigitado })",
  ]) assert.ok(src.includes(t), t)
})

test('Atualizar com planilha: prévia em números, conflitos lado a lado e botão Voltar novo', () => {
  const src = ler('components/tabelas/ReenviarPlanilhaWizard.tsx')
  assert.ok(src.includes("from '@/components/ui/Modal'"))
  assert.ok(src.includes('StatCard'))
  assert.ok(src.includes('Voltar'))
  assert.ok(src.includes('Segmentado'))
  assert.ok(src.includes('aplicarResolucaoATodas'))
})

test('Atualizar com planilha mantém as chamadas de reenvio intactas', () => {
  const src = ler('components/tabelas/ReenviarPlanilhaWizard.tsx')
  assert.ok(src.includes('preVisualizarReenvio(entrada)'))
  assert.ok(src.includes('aplicarReenvio(entrada, resolucoes)'))
  assert.ok(src.includes("adicionarColuna({ planilhaId, nome, tipo: det.tipo, opcoes })"))
})
