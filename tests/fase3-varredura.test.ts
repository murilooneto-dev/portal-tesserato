// tests/fase3-varredura.test.ts — telas do grupo Geral sem restos do visual antigo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const ARQUIVOS = [
  'app/login/page.tsx', 'components/auth/LoginForm.tsx', 'components/auth/CampoSenha.tsx', 'components/auth/TelaAcesso.tsx',
  'app/auth/reset-password/page.tsx', 'app/(comum)/intranet/page.tsx', 'app/fiscal/agenda/page.tsx',
  'components/geral/agenda/Agenda.tsx', 'components/geral/agenda/CalendarioMes.tsx', 'components/geral/agenda/DiaModal.tsx',
  'components/geral/agenda/CompromissoModal.tsx', 'components/geral/LinksUteis.tsx', 'app/(comum)/clientes/page.tsx',
  'components/geral/ClientesGeralLista.tsx', 'components/geral/ClienteGeralModal.tsx', 'components/geral/ConfirmarExclusaoClienteModal.tsx',
  'components/geral/DesabilitarClienteModal.tsx', 'components/geral/NovoTipoTarefaModal.tsx', 'components/geral/SectorSection.tsx',
  'app/(comum)/ferramentas/FerramentasClient.tsx', 'app/(comum)/vinculos/VinculosClient.tsx', 'app/(comum)/vinculos/page.tsx',
]

for (const arq of ARQUIVOS) {
  test(`sem visual antigo: ${arq}`, () => {
    const fonte = readFileSync(join(ROOT, arq), 'utf8')
    assert.doesNotMatch(fonte, /text-\[(9|10|11)px\]/, 'texto abaixo de 12 px')
    assert.doesNotMatch(fonte, /\[var\(--(fg|accent|accent-hover|bg-surface|bg-page)\)\]/, 'cor antiga por var()')
    assert.doesNotMatch(fonte, /\b(amber|red|green|emerald|indigo|orange)-\d{3}\b/, 'cor fixa do Tailwind')
    assert.doesNotMatch(fonte, /(^|[^.\w])(confirm|alert)\(/m, 'confirm()/alert() do navegador')
    assert.doesNotMatch(fonte, /fixed inset-0/, 'janela montada à mão')
    assert.doesNotMatch(fonte, /[🔎📋🏪📢🔔✏✕⚠]/u, 'emoji no lugar de ícone')
  })
}
