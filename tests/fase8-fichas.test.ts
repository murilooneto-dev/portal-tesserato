// tests/fase8-fichas.test.ts — Fase 8, Frente C: fichas, checklists e janelas de cliente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { IndicadorSalvamento, ErroSalvamento } from '../components/geral/TarefasSetorChecklist'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8').replace(/\r/g, '')
const tem = (src: string, textos: string[], onde = '') => { for (const t of textos) assert.ok(src.includes(t), `${onde} ${t}`) }

const FISCAL = 'components/fiscal/TarefaChecklist.tsx'
const CONTABIL = 'components/contabil/TarefaChecklistContabil.tsx'
const PESSOAL = 'components/pessoal/TarefaChecklistPessoal.tsx'
const SETOR = 'components/geral/TarefasSetorChecklist.tsx'
const SELETOR = 'components/contabil/SeletorMesFicha.tsx'
const CONFERENCIA = 'components/fiscal/ClienteConferencia.tsx'
const EVENTOS = 'components/geral/EventosAvulsosSecao.tsx'
const OBS = 'components/fiscal/ClienteObs.tsx'
const ARQUIVOS = 'components/fiscal/ClienteArquivos.tsx'
const JANELAS = ['components/fiscal/EmpresaModal.tsx', 'components/contabil/EmpresaContabilModal.tsx',
  'components/pessoal/EmpresaPessoalModal.tsx', 'components/geral/ClienteGeralModal.tsx', 'components/geral/GruposTarefasModal.tsx']
const TODOS = [FISCAL, CONTABIL, PESSOAL, SETOR, SELETOR, CONFERENCIA, EVENTOS, OBS, ARQUIVOS, ...JANELAS]

for (const arq of TODOS) {
  test(`${arq}: sem fonte < 12px, sem emoji, sem confirm/alert`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(8|9|10|11)px\]/)
    // O HTML impresso da conferência (fora desta fase) ainda usa ✓; a tela não.
    if (arq !== CONFERENCIA) assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]|[✓⏳⚠]/u)
    assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/m)
  })
}

// ---------- Salvando… / Salvo / erro (ds-06) ----------

test('indicador: Salvando…, Salvo (text-ok + ícone) e Erro (text-danger), região aria-live sempre montada', () => {
  const vazio = renderToStaticMarkup(h(IndicadorSalvamento, {}))
  assert.match(vazio, /aria-live="polite"/)
  assert.match(vazio, /sr-only/)
  assert.match(renderToStaticMarkup(h(IndicadorSalvamento, { estado: { tipo: 'salvando' } })), /Salvando…/)
  const salvo = renderToStaticMarkup(h(IndicadorSalvamento, { estado: { tipo: 'salvo' } }))
  assert.match(salvo, /text-ok/)
  assert.match(salvo, /<svg/)
  assert.match(salvo, />Salvo</)
  const erro = renderToStaticMarkup(h(IndicadorSalvamento, { estado: { tipo: 'erro', mensagem: 'Falhou' } }))
  assert.match(erro, /text-danger/)
  assert.match(erro, /title="Falhou"/)
  assert.equal(renderToStaticMarkup(h(ErroSalvamento, { estado: { tipo: 'salvo' } })), '')
  assert.match(renderToStaticMarkup(h(ErroSalvamento, { estado: { tipo: 'erro', mensagem: 'Falhou' } })), /role="alert"[^>]*>Falhou</)
})

test('useSalvamento só observa a promessa e a devolve intocada', () => {
  const src = ler(SETOR)
  tem(src, ['export function useSalvamento()', 'promessa.then(', 'return promessa', "{ tipo: 'salvando' }",
    'Não foi possível salvar. Tente de novo.'])
  // O Societário/Financeiro continuam com o próprio indicador (fase 6).
  tem(src, ['w-[70px]', '>Salvo', 'role="alert"'])
})

test('Fiscal: mesmas chamadas de antes, agora acompanhadas', () => {
  const src = ler(FISCAL)
  tem(src, [
    "import { ErroSalvamento, IndicadorSalvamento, useSalvamento } from '@/components/geral/TarefasSetorChecklist'",
    'startTransition(() => acompanhar(tipo, onToggle(tipo, true, iso)))',
    'startTransition(() => { acompanhar(tipo, marcarSemMovimento(clienteId, tipo, mes, ano, novo)) })',
    'startTransition(() => { acompanhar(tipo, onAtualizarEtapa?.(tipo, etapaNome, true, iso)) })',
    'startTransition(() => { acompanhar(tipo, onAtualizarEtapa?.(tipo, etapaNome, false)) })',
    'startTransition(() => { acompanhar(tipo, onSalvarTexto?.(tipo, valor)) })',
    'startTransition(() => { acompanhar(tipo, onExcluirArquivo?.(arquivoId)) })',
    'await acompanhar(CHAVE_MIT, salvarMIT(clienteId, mit))',
    'await desbloquearTarefa(tarefa.id, motivo, tipo, competencia)',
    'const result = await onUploadArquivo(tipo, formData)',
    '<IndicadorSalvamento estado={salvamento[tipo]}', '<ErroSalvamento estado={salvamento[tipo]}',
    '<IndicadorSalvamento estado={salvamento[CHAVE_MIT]} />',
  ], FISCAL)
  // "Salvando…" é marcado antes de cada startTransition que salva.
  assert.equal(src.split('iniciar(').length - 1, src.split('acompanhar(').length - 1, 'um iniciar para cada acompanhar')
})

for (const arq of [CONTABIL, PESSOAL]) {
  test(`${arq}: mesmas chamadas de antes, agora acompanhadas`, () => {
    const src = ler(arq)
    tem(src, [
      "import { ErroSalvamento, IndicadorSalvamento, useSalvamento } from '@/components/geral/TarefasSetorChecklist'",
      'if (etapaNome) acompanhar(tipo, onAtualizarEtapa(tipo, etapaNome, true, iso))',
      'else acompanhar(tipo, onToggleSimples(tipo, true, iso))',
      'if (etapaNome) acompanhar(tipo, onAtualizarEtapa(tipo, etapaNome, false))',
      'else acompanhar(tipo, onToggleSimples(tipo, false))',
      'if (etapaNome) acompanhar(tipo, onAtualizarEtapa(tipo, etapaNome, marcar, marcar ? hojeISO() : undefined))',
      'else acompanhar(tipo, onToggleSimples(tipo, marcar, marcar ? hojeISO() : undefined))',
      'startTransition(() => { acompanhar(tipo, onSalvarTexto(tipo, valor)) })',
      'startTransition(() => { acompanhar(tipo, onExcluirArquivo(arquivoId)) })',
      'startTransition(() => { acompanhar(tipo, onMarcarSemMovimento(tipo, novo)) })',
      'const result = await onUploadArquivo(tipo, formData)',
      '<IndicadorSalvamento estado={salvamento[tipo]}', '<ErroSalvamento estado={salvamento[tipo]}',
    ], arq)
    assert.equal(src.split('iniciar(tipo)').length - 1, 6 + (arq === CONTABIL ? 1 : 0), 'um iniciar por ponto de salvamento')
  })
}

test('Contábil: opções do checklist continuam esperando a action na transição', () => {
  assert.ok(ler(CONTABIL).includes('startTransition(() => acompanhar(tipo, onAtualizarEtapa(tipo, opcaoNome, e.target.checked)))'))
})

// ---------- Vazios e textos das fichas ----------

test('Fiscal (f-04): vazio sem "0 de 0", rótulo do MIT e observação do mês por extenso', () => {
  const src = ler(FISCAL)
  tem(src, ['{total === 0 ? (', '<EmptyState', 'compacto', 'Nenhuma tarefa em ${MESES_EXTENSO[mes - 1]}',
    'meta={total > 0 ?', 'rotulo="MIT · anotação do mês (regime normal)"'])
  tem(ler(OBS), ['Observação de ${MESES[mes - 1].toLowerCase()}', 'titulo={titulo}', 'salvarObs(clienteId, mes, ano, obs)'])
})

for (const arq of [CONTABIL, PESSOAL]) {
  test(`${arq}: vazio em EmptyState compacto`, () => {
    const src = ler(arq)
    tem(src, ['<EmptyState', 'compacto', 'Nenhuma tarefa neste mês'])
    assert.ok(!src.includes('Nenhuma tarefa para este cliente neste mês.'))
  })
}

test('eventos: "Nenhum evento avulso em {mês}" com a descrição do mockup, mês passado pelas três fichas', () => {
  const src = ler(EVENTOS)
  tem(src, ['mes?: number', "`em ${MESES[mes - 1].toLowerCase()}`", "'neste mês'", 'titulo={`Nenhum evento avulso ${noMes}`}',
    'descricao="Registre aqui compromissos pontuais deste cliente no mês."', 'compacto'])
  for (const s of ['fiscal', 'contabil', 'pessoal']) {
    assert.ok(ler(`app/${s}/clientes/[id]/page.tsx`).includes(`setor="${s}" eventos={eventosAvulsos} podeEditar={podeEditar} mes={mes} />`), s)
  }
})

// ---------- Seletor de mês (c-04) ----------

test('seletor de mês: fecha com clique fora e Esc em qualquer ponto, 44px no celular, quadro dentro da tela', () => {
  const src = ler(SELETOR)
  tem(src, ["document.addEventListener('pointerdown', fora)", "document.removeEventListener('pointerdown', fora)",
    "e.key === 'Escape' && aberto", 'botaoRef.current?.focus()', 'max-sm:h-11 max-sm:w-11', 'max-sm:h-11 items-center',
    'style={{ left: deslocamento }}', 'window.innerWidth - 16', '16 - left',
    'aria-label="Mês anterior"', 'aria-label="Próximo mês"', '?mes=${m}&ano=${a}', 'Andamento de'])
  assert.ok(!src.includes('Ano anterior') && !src.includes('Próximo ano'), 'sem troca de ano')
})

// ---------- Conferência ----------

test('conferência: números empilham no celular e tabela com relative; impressão igual', () => {
  const src = ler(CONFERENCIA)
  tem(src, ['grid grid-cols-1 gap-3 sm:grid-cols-3', 'relative max-h-80 overflow-auto', 'font-size: 9px'])
})

// ---------- Janelas ----------

for (const arq of JANELAS) {
  test(`${arq}: sem "Carregando…" solto, com esqueleto`, () => {
    const src = ler(arq)
    assert.ok(!src.includes('Carregando…'))
    tem(src, ["from '@/components/ui/Esqueleto'", '<EsqueletoLinhas'])
  })
}

test('vazios das janelas e da ficha em EmptyState compacto', () => {
  tem(ler('components/geral/GruposTarefasModal.tsx'), ['titulo="Nenhum grupo criado ainda"', 'As alterações aqui são salvas na hora.'])
  tem(ler('components/geral/ClienteGeralModal.tsx'), ['titulo="Nenhum vínculo para estes setores"'])
  tem(ler(ARQUIVOS), ['titulo="Nenhuma planilha anexada"', 'uploadArquivo(clienteId, formData)', 'excluirArquivo(id)'])
})
