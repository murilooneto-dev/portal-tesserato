// tests/fiscal-empresa.test.ts — janela Editar empresa (Fiscal) no desenho novo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const ARQUIVOS = [
  'components/fiscal/EmpresaModal.tsx', 'components/fiscal/CamposFiscais.tsx', 'components/fiscal/ClienteAcoes.tsx',
  'components/geral/TarefasAutomaticasCampo.tsx', 'components/geral/SeletorAtividades.tsx', 'components/geral/GruposTarefasModal.tsx',
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
    assert.doesNotMatch(fonte, /[🔎📋🔒✏✕⚠]/u, 'emoji no lugar de ícone')
  })
}

test('EmpresaModal e GruposTarefasModal usam o Modal e useConfirmar', () => {
  const empresa = ler('components/fiscal/EmpresaModal.tsx')
  assert.match(empresa, /components\/ui\/Modal/)
  assert.match(empresa, /largura="g"/)
  assert.match(empresa, /useConfirmar/)
  const grupos = ler('components/geral/GruposTarefasModal.tsx')
  assert.match(grupos, /components\/ui\/Modal/)
  assert.match(grupos, /useConfirmar/)
  assert.match(grupos, /As alterações aqui são salvas na hora\./)
})

test('ClienteAcoes usa Button e mantém o fluxo de exclusão', () => {
  const fonte = ler('components/fiscal/ClienteAcoes.tsx')
  assert.match(fonte, /components\/ui\/Button/)
  assert.match(fonte, /ConfirmarExclusaoClienteModal/)
  assert.match(fonte, /excluirCliente\(cliente\.id\)/)
})

test('Editar empresa: UF em lista, senha do ISS oculta, rótulo Contato, prioridade mantida', () => {
  const empresa = ler('components/fiscal/EmpresaModal.tsx')
  assert.equal((empresa.match(/'[A-Z]{2}'/g) ?? []).filter((_, i) => i < 27).length, 27)
  assert.match(empresa, /<Select id=\{c\.id\} disabled=\{readOnly\} value=\{form\.uf\}/)
  assert.match(empresa, /rotulo="Contato"/)
  assert.doesNotMatch(empresa, /Contato Chat/)
  assert.match(empresa, /prioridade:\s+form\.prioridade/)
  const campos = ler('components/fiscal/CamposFiscais.tsx')
  assert.match(campos, /senhaVisivel \? 'text' : 'password'/)
  assert.match(campos, /Mostrar senha/)
})

test('props e exports padrão dos componentes compartilhados continuam iguais', () => {
  assert.match(ler('components/geral/GruposTarefasModal.tsx'), /export default function GruposTarefasModal\(\{ clienteId, setor, tarefasDisponiveis, onClose \}: Props\)/)
  assert.match(ler('components/geral/SeletorAtividades.tsx'), /export default function SeletorAtividades\(\{ valores, opcoes, onChange, readOnly = false \}: Props\)/)
  assert.match(ler('components/geral/TarefasAutomaticasCampo.tsx'), /onChangeExcluidas: \(v: string\[\]\) => void/)
})
