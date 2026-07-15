# Parte 3a — Contábil: Clientes + Cliente Detalhe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `/contabil/clientes` (lista) e `/contabil/clientes/[id]` (detalhe com checklist de tarefas), com cadastro, edição e "exclusão" (só remove o vínculo com o setor) de clientes do Contábil.

**Architecture:** Componentes e server actions próprios do Contábil (não reaproveitam nada do Fiscal), seguindo a mesma forma estrutural que o Fiscal já usa (Server Component busca dados → passa pra client component → server actions inline/importadas cuidam das mutações). O checklist de tarefas suporta dois formatos: tarefa simples (uma data) e tarefa com etapas nomeadas (Movimentação), usando `tarefa_tipos.etapas` pra decidir qual UI renderizar por tipo.

**Tech Stack:** Next.js 16 App Router, Supabase, TypeScript, Tailwind v4. Sem framework de testes automatizado — verificação por `tsc`/`build`; verificação manual no navegador fica com o usuário (não faço proativamente, ver [[feedback-no-unsolicited-testing]]).

## Global Constraints

- Nenhum componente do Fiscal é reaproveitado ou generalizado — decisão explícita do usuário, cada setor tem os seus.
- Todo cliente retornado pelas páginas `/contabil/*` necessariamente tem linha em `clientes_contabil` — usar `select('*, clientes_contabil!inner(*))` (inner join), não left join.
- "Excluir" no Contábil nunca apaga a linha de `clientes` a não ser que o cliente fique sem nenhum setor depois de remover `'contabil'` — nunca apaga dados de outros setores.
- Toda query/insert/update em `tarefas` deve incluir `setor: 'contabil'` / `.eq('setor', 'contabil')`.
- Sem framework de testes: cada task verifica com `npx tsc --noEmit -p .`; não iniciar servidor de dev nem fazer verificação de navegador proativamente.
- Cada task termina com `git commit` próprio.

---

### Task 1: Camada de dados — `lib/clientes-contabil.ts` + `podeEditarClienteContabil`

**Files:**
- Create: `lib/clientes-contabil.ts`
- Modify: `lib/supabase/server.ts`

**Interfaces:**
- Consumes: tabelas `clientes_contabil` (Parte 2), tipos `Cliente`, `ClienteContabil` de `@/lib/types`.
- Produces: `export const SELECT_CLIENTE_CONTABIL = '*, clientes_contabil!inner(*)'`; `export type ClienteComContabil = Cliente & ClienteContabil`; `export function flattenClienteContabil(row): ClienteComContabil`; `export async function podeEditarClienteContabil(clienteId: string): Promise<boolean>`.

- [ ] **Step 1: Criar `lib/clientes-contabil.ts`**

```ts
import type { Cliente, ClienteContabil } from './types'

export const SELECT_CLIENTE_CONTABIL = '*, clientes_contabil!inner(*)'

export type ClienteComContabil = Cliente & ClienteContabil

export function flattenClienteContabil(row: Record<string, unknown>): ClienteComContabil {
  const { clientes_contabil, ...resto } = row as { clientes_contabil: ClienteContabil } & Record<string, unknown>
  return { ...resto, ...clientes_contabil } as ClienteComContabil
}
```

- [ ] **Step 2: Adicionar `podeEditarClienteContabil` em `lib/supabase/server.ts`**

Adicionar logo depois da função `podeEditarCliente` existente (mesmo arquivo, mesmo padrão — admin ou responsável bate com o nome do usuário):

```ts
// Mesma lógica de podeEditarCliente, mas pro setor Contábil (consulta
// clientes_contabil em vez de clientes_fiscal). Função irmã, não
// parametrizada — cada setor tem a sua, mesmo padrão de clientes_fiscal.
export async function podeEditarClienteContabil(clienteId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase.from('profiles').select('role,nome').eq('id', user.id).single()
  if (profile?.role === 'admin') return true

  const { data: cliente } = await supabase.from('clientes_contabil').select('responsavel').eq('cliente_id', clienteId).single()
  return !!profile?.nome && !!cliente?.responsavel && profile.nome.toLowerCase() === cliente.responsavel.toLowerCase()
}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros (nada consome essas funções ainda).

- [ ] **Step 4: Commit**

```bash
git add lib/clientes-contabil.ts lib/supabase/server.ts
git commit -m "feat: adiciona camada de dados do Contábil (join+flatten, podeEditarClienteContabil)"
```

---

### Task 2: Server actions — `app/contabil/clientes/actions.ts`

**Files:**
- Create: `app/contabil/clientes/actions.ts`

**Interfaces:**
- Consumes (Task 1): `podeEditarClienteContabil` de `@/lib/supabase/server`.
- Produces: `toggleTarefaContabil(clienteId, tipo, mes, ano, concluida, data?)`, `atualizarEtapa(clienteId, mes, ano, tipo, etapaNome, concluida, data?)`, `excluirClienteContabil(clienteId)` — todas usadas pela Task 6 (páginas).

- [ ] **Step 1: Criar o arquivo**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, podeEditarClienteContabil } from '@/lib/supabase/server'

export async function toggleTarefaContabil(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  concluida: boolean,
  data?: string,
) {
  if (!(await podeEditarClienteContabil(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString() : new Date().toISOString())
    : null

  const { data: existing } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'contabil')
    .maybeSingle()

  if (existing?.id) {
    await supabase.from('tarefas').update({ concluida, concluida_em }).eq('id', existing.id)
  } else {
    await supabase.from('tarefas').insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'contabil', concluida, concluida_em })
  }

  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
}

export async function atualizarEtapa(
  clienteId: string,
  mes: number,
  ano: number,
  tipo: string,
  etapaNome: string,
  concluida: boolean,
  data?: string,
) {
  if (!(await podeEditarClienteContabil(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
    : null

  // 1. Acha ou cria a linha de `tarefas` pro tipo (mês/ano/cliente/setor)
  const { data: tarefaExistente } = await supabase
    .from('tarefas').select('id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'contabil')
    .maybeSingle()

  let tarefaId = tarefaExistente?.id as string | undefined
  if (!tarefaId) {
    const { data: novaTarefa } = await supabase
      .from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'contabil', concluida: false })
      .select('id')
      .single()
    tarefaId = novaTarefa?.id
  }
  if (!tarefaId) return

  // 2. Acha ou cria a linha de `tarefa_etapas` pro nome da etapa
  const { data: etapaExistente } = await supabase
    .from('tarefa_etapas').select('id')
    .eq('tarefa_id', tarefaId).eq('nome', etapaNome)
    .maybeSingle()

  if (etapaExistente?.id) {
    await supabase.from('tarefa_etapas').update({ concluida, concluida_em }).eq('id', etapaExistente.id)
  } else {
    await supabase.from('tarefa_etapas').insert({ tarefa_id: tarefaId, nome: etapaNome, concluida, concluida_em })
  }

  // 3. Recalcula concluida da tarefa-pai: todas as etapas esperadas (de tarefa_tipos) concluídas?
  const { data: tipoRow } = await supabase
    .from('tarefa_tipos').select('etapas')
    .eq('setor', 'contabil').eq('nome', tipo)
    .maybeSingle()
  const etapasEsperadas: string[] = tipoRow?.etapas ?? []

  const { data: etapasAtuais } = await supabase
    .from('tarefa_etapas').select('nome, concluida')
    .eq('tarefa_id', tarefaId)

  const todasConcluidas = etapasEsperadas.length > 0 && etapasEsperadas.every(
    nome => (etapasAtuais ?? []).find(e => e.nome === nome)?.concluida === true
  )

  await supabase.from('tarefas').update({
    concluida: todasConcluidas,
    concluida_em: todasConcluidas ? new Date().toISOString() : null,
  }).eq('id', tarefaId)

  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
}

export async function excluirClienteContabil(clienteId: string) {
  if (!(await podeEditarClienteContabil(clienteId))) throw new Error('Não autorizado')
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) throw new Error('Não autorizado')

  // Apaga as tarefas do setor Contábil pra esse cliente (tarefa_etapas
  // cascateia via FK em tarefas.id, não precisa apagar manualmente).
  await supabase.from('tarefas').delete().eq('cliente_id', clienteId).eq('setor', 'contabil')

  // Apaga os dados operacionais do Contábil.
  await supabase.from('clientes_contabil').delete().eq('cliente_id', clienteId)

  // Remove 'contabil' de clientes.setores. Se não sobrar nenhum setor,
  // a linha de clientes deixa de fazer sentido — apaga também.
  const { data: cliente } = await supabase.from('clientes').select('setores').eq('id', clienteId).single()
  const novosSetores = (cliente?.setores ?? []).filter((s: string) => s !== 'contabil')

  if (novosSetores.length === 0) {
    await supabase.from('clientes').delete().eq('id', clienteId)
  } else {
    await supabase.from('clientes').update({ setores: novosSetores }).eq('id', clienteId)
  }

  revalidatePath('/contabil/clientes')
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/contabil/clientes/actions.ts
git commit -m "feat: server actions do Contábil (toggle tarefa simples, etapas, excluir vínculo)"
```

---

### Task 3: `components/contabil/TarefaChecklistContabil.tsx`

**Files:**
- Create: `components/contabil/TarefaChecklistContabil.tsx`

**Interfaces:**
- Consumes: tipos `Tarefa`, `TarefaEtapa` de `@/lib/types`.
- Produces: componente `TarefaChecklistContabil` — usado pela Task 6 (`app/contabil/clientes/[id]/page.tsx`), que passa `onToggleSimples`/`onAtualizarEtapa` como wrappers em volta das actions da Task 2.

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

import { useTransition, useState } from 'react'
import type { Tarefa, TarefaEtapa } from '@/lib/types'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface Props {
  tarefasPersonalizadas: string[]
  tarefaTipos: Record<string, string[] | null>
  tarefas: Tarefa[]
  etapas: TarefaEtapa[]
  mes: number
  ano: number
  onToggleSimples: (tipo: string, concluida: boolean, data?: string) => Promise<void>
  onAtualizarEtapa: (tipo: string, etapaNome: string, concluida: boolean, data?: string) => Promise<void>
  podeEditar: boolean
}

function isoParaDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function displayParaIso(display: string): string | null {
  const digits = display.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const d = digits.slice(0, 2)
  const m = digits.slice(2, 4)
  const y = digits.slice(4, 8)
  if (parseInt(y, 10) < 1000) return null
  const iso = `${y}-${m}-${d}`
  const dateObj = new Date(iso + 'T12:00:00')
  if (isNaN(dateObj.getTime())) return null
  return iso
}

function autoFormatarData(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length > 4) return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
  if (digits.length > 2) return `${digits.slice(0,2)}/${digits.slice(2)}`
  return digits
}

export default function TarefaChecklistContabil({
  tarefasPersonalizadas,
  tarefaTipos,
  tarefas,
  etapas,
  mes,
  ano,
  onToggleSimples,
  onAtualizarEtapa,
  podeEditar,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [localText, setLocalText] = useState<Record<string, string>>({})

  const mapaTarefa = new Map(tarefas.map(t => [t.tipo, t]))
  const total = tarefasPersonalizadas.length
  const concluidas = tarefasPersonalizadas.filter(t => mapaTarefa.get(t)?.concluida).length

  function etapasDaTarefa(tipo: string): TarefaEtapa[] {
    const tarefaId = mapaTarefa.get(tipo)?.id
    if (!tarefaId) return []
    return etapas.filter(e => e.tarefa_id === tarefaId)
  }

  function keyLocal(tipo: string, etapaNome?: string) {
    return etapaNome ? `${tipo}::${etapaNome}` : tipo
  }

  function getSavedIso(tipo: string, etapaNome?: string): string {
    if (etapaNome) {
      const e = etapasDaTarefa(tipo).find(e => e.nome === etapaNome)
      return e?.concluida && e.concluida_em ? e.concluida_em.slice(0, 10) : ''
    }
    const t = mapaTarefa.get(tipo)
    return t?.concluida && t.concluida_em ? t.concluida_em.slice(0, 10) : ''
  }

  function getDisplayValue(tipo: string, etapaNome?: string): string {
    const key = keyLocal(tipo, etapaNome)
    if (key in localText) return localText[key]
    return isoParaDisplay(getSavedIso(tipo, etapaNome))
  }

  function handleTextChange(tipo: string, raw: string, etapaNome?: string) {
    const key = keyLocal(tipo, etapaNome)
    const formatted = autoFormatarData(raw)
    setLocalText(prev => ({ ...prev, [key]: formatted }))

    const iso = displayParaIso(formatted)
    if (iso) {
      setLocalText(prev => { const n = { ...prev }; delete n[key]; return n })
      startTransition(() => {
        if (etapaNome) onAtualizarEtapa(tipo, etapaNome, true, iso)
        else onToggleSimples(tipo, true, iso)
      })
    }
  }

  function handleTextBlur(tipo: string, etapaNome?: string) {
    const key = keyLocal(tipo, etapaNome)
    const val = localText[key]
    if (val === undefined) return
    if (val === '') {
      startTransition(() => {
        if (etapaNome) onAtualizarEtapa(tipo, etapaNome, false)
        else onToggleSimples(tipo, false)
      })
    }
    setLocalText(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  const inputCls = (feito: boolean) => `text-xs px-2 py-1 rounded-lg border transition-all focus:outline-none disabled:opacity-40 w-[106px] text-center ${
    feito
      ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)] focus:border-[var(--accent)]/60'
      : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60 focus:border-[var(--fg)]/30 placeholder-[var(--fg)]/20'
  }`

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--fg)]/40 uppercase tracking-widest">
          Tarefas — {MESES[mes - 1]}/{ano}
        </h3>
        <span className="text-xs text-[var(--fg)]/40">{concluidas}/{total}</span>
      </div>

      <div className="w-full h-1.5 bg-[var(--fg)]/8 rounded-full mb-5">
        <div
          className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
          style={{ width: `${total > 0 ? (concluidas / total) * 100 : 0}%` }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {tarefasPersonalizadas.map(tipo => {
          const etapasDefinidas = tarefaTipos[tipo] ?? null
          const feito = !!mapaTarefa.get(tipo)?.concluida
          const displayVal = getDisplayValue(tipo)

          return (
            <div key={tipo} className="flex flex-col gap-0">
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                feito ? 'bg-[var(--accent)]/8 border-[var(--accent)]/25' : 'bg-[var(--fg)]/3 border-[var(--fg)]/8'
              }`}>
                <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${feito ? 'bg-[var(--accent)]' : 'bg-[var(--fg)]/15'}`} />
                <span className={`text-sm flex-1 transition-colors ${feito ? 'text-[var(--fg)]/50 line-through' : 'text-[var(--fg)]'}`}>
                  {tipo}
                </span>

                {!etapasDefinidas && (
                  <input
                    type="text"
                    value={displayVal}
                    onChange={e => handleTextChange(tipo, e.target.value)}
                    onBlur={() => handleTextBlur(tipo)}
                    disabled={!podeEditar || isPending}
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                    className={inputCls(feito)}
                  />
                )}
              </div>

              {etapasDefinidas && (
                <div className="ml-5 mt-1 grid grid-cols-2 gap-2 p-3 bg-[var(--fg)]/2 border border-[var(--fg)]/8 rounded-xl">
                  {etapasDefinidas.map(etapaNome => {
                    const etapaFeita = !!etapasDaTarefa(tipo).find(e => e.nome === etapaNome)?.concluida
                    const etapaDisplay = getDisplayValue(tipo, etapaNome)
                    return (
                      <div key={etapaNome} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--fg)]/60">{etapaNome}</span>
                        <input
                          type="text"
                          value={etapaDisplay}
                          onChange={e => handleTextChange(tipo, e.target.value, etapaNome)}
                          onBlur={() => handleTextBlur(tipo, etapaNome)}
                          disabled={!podeEditar || isPending}
                          placeholder="DD/MM/AAAA"
                          maxLength={10}
                          className={inputCls(etapaFeita)}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/contabil/TarefaChecklistContabil.tsx
git commit -m "feat: TarefaChecklistContabil (tarefa simples e tarefa com etapas)"
```

---

### Task 4: `components/contabil/EmpresaContabilModal.tsx`

**Files:**
- Create: `components/contabil/EmpresaContabilModal.tsx`

**Interfaces:**
- Consumes (Task 1): `SELECT_CLIENTE_CONTABIL`, `flattenClienteContabil` de `@/lib/clientes-contabil`; `buscarCnpj` de `@/lib/buscar-cnpj` (já existe, usado por `EmpresaModal.tsx`/`ClienteGeralModal.tsx`, não é Fiscal-específico).
- Produces: componente `EmpresaContabilModal` — usado pela Task 5 (`ClientesListaContabil.tsx`).

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'

interface FormData {
  cnpj: string
  nome: string
  atividade: string
  municipio: string
  uf: string
  responsavel: string
  contato_chat: string
  prioridade: number
  tarefas_personalizadas: string[]
}

interface Props {
  clienteId: string | null
  responsaveis: string[]
  tarefasPadrao: string[]
  onClose: () => void
  readOnly?: boolean
}

const emptyForm = (tarefasPadrao: string[]): FormData => ({
  cnpj: '', nome: '', atividade: '', municipio: '', uf: '', responsavel: '', contato_chat: '',
  prioridade: 3, tarefas_personalizadas: tarefasPadrao,
})

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const selectCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function EmpresaContabilModal({ clienteId, responsaveis, tarefasPadrao, onClose, readOnly = false }: Props) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = !!clienteId

  const [form, setForm] = useState<FormData>(emptyForm(tarefasPadrao))
  const [novaTarefa, setNovaTarefa] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!clienteId) return
    sb.from('clientes').select(SELECT_CLIENTE_CONTABIL).eq('id', clienteId).single().then(({ data: raw }) => {
      if (!raw) return
      const data = flattenClienteContabil(raw)
      setForm({
        cnpj: data.cnpj ?? '',
        nome: data.nome ?? '',
        atividade: data.atividade ?? '',
        municipio: data.municipio ?? '',
        uf: data.uf ?? '',
        responsavel: data.responsavel ?? '',
        contato_chat: data.contato_chat ?? '',
        prioridade: data.prioridade ?? 3,
        tarefas_personalizadas: data.tarefas_personalizadas ?? [],
      })
      setLoading(false)
    })
  }, [clienteId])

  async function fetchCnpj(raw: string) {
    setLoadingCnpj(true)
    const resultado = await buscarCnpj(raw)
    if (resultado) {
      setForm(p => ({
        ...p,
        nome: resultado.nome || p.nome,
        municipio: resultado.municipio || p.municipio,
        uf: resultado.uf || p.uf,
      }))
    }
    setLoadingCnpj(false)
  }

  function set<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function addTarefa() {
    const t = novaTarefa.trim()
    if (!t) return
    set('tarefas_personalizadas', [...form.tarefas_personalizadas, t])
    setNovaTarefa('')
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    setErro(null)

    const clientePayload = {
      nome: form.nome,
      cnpj: form.cnpj || null,
      municipio: form.municipio || null,
      uf: form.uf || null,
      contato_chat: form.contato_chat || null,
    }
    const contabilPayload = {
      atividade: form.atividade || null,
      responsavel: form.responsavel || null,
      prioridade: form.prioridade,
      tarefas_personalizadas: form.tarefas_personalizadas,
    }

    if (isEdit) {
      const { error: errCliente } = await sb.from('clientes').update(clientePayload).eq('id', clienteId)
      if (errCliente) { setSaving(false); setErro(errCliente.message); return }
      const { error: errContabil } = await sb.from('clientes_contabil').update(contabilPayload).eq('cliente_id', clienteId)
      if (errContabil) { setSaving(false); setErro(errContabil.message); return }
    } else {
      // setores explícito: 'contabil', não o default '{fiscal}' da coluna —
      // esse cliente está sendo criado a partir da tela do Contábil.
      const { data: novoCliente, error: errCliente } = await sb.from('clientes')
        .insert({ ...clientePayload, setores: ['contabil'] })
        .select('id').single()
      if (errCliente || !novoCliente) { setSaving(false); setErro(errCliente?.message ?? 'Falha ao criar cliente'); return }
      const { error: errContabil } = await sb.from('clientes_contabil').insert({ cliente_id: novoCliente.id, ...contabilPayload })
      if (errContabil) { setSaving(false); setErro(errContabil.message); return }
    }

    setSaving(false)
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">{readOnly ? 'Visualizar Empresa' : isEdit ? 'Editar Empresa' : 'Nova Empresa'}</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-[var(--fg)]/30 text-sm text-center py-8">Carregando...</p>
          ) : (<>

            <div>
              <label className={labelCls}>CNPJ {loadingCnpj && <span className="text-[var(--accent)] normal-case tracking-normal">Buscando...</span>}</label>
              <input className={inputCls + ' font-mono'} value={form.cnpj}
                onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }}
                placeholder="00.000.000/0000-00" disabled={readOnly} />
            </div>

            <div>
              <label className={labelCls}>Razão Social *</label>
              <input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} required disabled={readOnly} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Município</label>
                <input className={inputCls} value={form.municipio} onChange={e => set('municipio', e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <label className={labelCls}>UF</label>
                <input className={inputCls + ' uppercase'} value={form.uf}
                  onChange={e => set('uf', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} disabled={readOnly} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Contato</label>
              <input className={inputCls} value={form.contato_chat} onChange={e => set('contato_chat', e.target.value)} disabled={readOnly} />
            </div>

            <div>
              <label className={labelCls}>Atividade</label>
              <input className={inputCls} value={form.atividade} onChange={e => set('atividade', e.target.value)} disabled={readOnly} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Responsável</label>
                <select className={selectCls} value={form.responsavel} onChange={e => set('responsavel', e.target.value)} disabled={readOnly}>
                  <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
                  {responsaveis.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Prioridade (0–5)</label>
                <input className={inputCls} type="number" min={0} max={5} value={form.prioridade}
                  onChange={e => set('prioridade', Number(e.target.value))} disabled={readOnly} />
              </div>
            </div>

            <div className="rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-4">
              <label className={labelCls}>Tarefas ({form.tarefas_personalizadas.length})</label>
              <div className="flex flex-wrap gap-1.5 mb-3 mt-2 min-h-[32px]">
                {form.tarefas_personalizadas.map((t, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-xs bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--fg)] px-2.5 py-1 rounded-lg">
                    {t}
                    {!readOnly && (
                      <button type="button"
                        onClick={() => set('tarefas_personalizadas', form.tarefas_personalizadas.filter((_, idx) => idx !== i))}
                        className="text-[var(--fg)]/40 hover:text-red-400 transition-colors font-bold">×</button>
                    )}
                  </span>
                ))}
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  <input value={novaTarefa} onChange={e => setNovaTarefa(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefa())}
                    placeholder="Digitar nome da tarefa e pressionar Enter..."
                    className={inputCls + ' flex-1 text-xs'} />
                  <button type="button" onClick={addTarefa}
                    className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 text-xs font-semibold transition-colors whitespace-nowrap">
                    + Adicionar
                  </button>
                </div>
              )}
            </div>

          </>)}
        </div>

        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          {readOnly ? (
            <button onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-sm transition-colors">
              Fechar
            </button>
          ) : (<>
            <button onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !form.nome.trim()}
              className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar empresa'}
            </button>
          </>)}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/contabil/EmpresaContabilModal.tsx
git commit -m "feat: EmpresaContabilModal (criar/editar cliente do Contábil)"
```

---

### Task 5: `components/contabil/ClientesListaContabil.tsx`

**Files:**
- Create: `components/contabil/ClientesListaContabil.tsx`

**Interfaces:**
- Consumes (Task 1): `ClienteComContabil` de `@/lib/clientes-contabil`. Consumes (Task 4): `EmpresaContabilModal`.
- Produces: componente `ClientesListaContabil` — usado pela Task 6 (`app/contabil/clientes/page.tsx`).

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComContabil } from '@/lib/clientes-contabil'
import EmpresaContabilModal from './EmpresaContabilModal'

const CORES_RESP: string[] = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899','#8b5cf6','#14b8a6','#f97316','#ef4444','#84cc16']
const _respColorCache: Record<string, string> = {}
function corResponsavel(nome: string): string {
  if (!_respColorCache[nome]) {
    _respColorCache[nome] = CORES_RESP[Object.keys(_respColorCache).length % CORES_RESP.length]
  }
  return _respColorCache[nome]
}

interface Props {
  clientes: ClienteComContabil[]
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  tarefasPadrao: string[]
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function ClientesListaContabil({ clientes, progressoMap, mes, ano, tarefasPadrao }: Props) {
  const [busca, setBusca] = useFiltroPersistente('clientes-contabil:busca', '')
  const [filtroResponsavel, setFiltroResponsavel] = useFiltroPersistente('clientes-contabil:responsavel', 'TODOS')
  const [modalNovoOpen, setModalNovoOpen] = useState(false)

  const responsaveis = useMemo(() => ['TODOS', ...Array.from(new Set(
    clientes.map(c => c.responsavel ?? '').filter(Boolean)
  )).sort()], [clientes])

  const filtrados = useMemo(() => clientes.filter(c => {
    if (busca) {
      const q = busca.toLowerCase()
      if (!c.nome.toLowerCase().includes(q) && !(c.cnpj ?? '').includes(q)) return false
    }
    if (filtroResponsavel !== 'TODOS' && c.responsavel !== filtroResponsavel) return false
    return true
  }), [clientes, busca, filtroResponsavel])

  const selectClass = "bg-[var(--bg-surface)] border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-[var(--fg)]/70 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Buscar cliente ou CNPJ..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
        />
        <select value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value)} className={selectClass}>
          {responsaveis.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
        </select>
        <button
          onClick={() => setModalNovoOpen(true)}
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap">
          + Novo Cliente
        </button>
      </div>

      {modalNovoOpen && (
        <EmpresaContabilModal
          clienteId={null}
          responsaveis={responsaveis.slice(1)}
          tarefasPadrao={tarefasPadrao}
          onClose={() => setModalNovoOpen(false)}
        />
      )}

      <p className="text-[var(--fg)]/30 text-xs mb-3">
        {filtrados.length} clientes · {MESES[mes - 1]}/{ano}
      </p>

      <div className="flex flex-col gap-1.5">
        {filtrados.length === 0 && (
          <p className="text-center text-[var(--fg)]/20 py-12 text-sm">Nenhum cliente encontrado.</p>
        )}

        {filtrados.map(cliente => {
          const prog = progressoMap[cliente.id]
          const total = prog?.total ?? 0
          const concluidas = prog?.concluidas ?? 0
          const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0

          return (
            <Link
              key={cliente.id}
              href={`/contabil/clientes/${cliente.id}`}
              className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8 hover:bg-[var(--fg)]/6 hover:border-[var(--fg)]/15 transition-all group"
            >
              {cliente.prioridade && cliente.prioridade > 0 ? (
                <div className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                  <span className="text-red-400 text-[10px] font-bold">P{cliente.prioridade}</span>
                </div>
              ) : (
                <div className="w-7 h-7 shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-[var(--fg)] text-sm font-semibold truncate">{cliente.nome}</p>
                <p className="text-[var(--fg)]/25 text-xs mt-0.5">{cliente.cnpj ?? '—'}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                {cliente.atividade && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                    {cliente.atividade}
                  </span>
                )}
                {cliente.responsavel && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: corResponsavel(cliente.responsavel) + '25', color: corResponsavel(cliente.responsavel), border: `1px solid ${corResponsavel(cliente.responsavel)}50` }}>
                    {cliente.responsavel}
                  </span>
                )}
              </div>

              {total > 0 && (
                <div className="w-20 shrink-0 text-right">
                  <p className={`text-sm font-bold ${pct === 100 ? 'text-[#10b981]' : 'text-[var(--fg)]'}`}>{pct}%</p>
                  <div className="w-full h-1 bg-[var(--fg)]/10 rounded-full mt-1">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#10b981' : 'var(--accent)' }} />
                  </div>
                  <p className="text-[var(--fg)]/25 text-[10px] mt-0.5">{concluidas}/{total}</p>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/contabil/ClientesListaContabil.tsx
git commit -m "feat: ClientesListaContabil (lista com filtros e progresso)"
```

---

### Task 6: `components/contabil/ClienteContabilAcoes.tsx`

Sem esse componente, `excluirClienteContabil` (Task 2) e a edição de um cliente já existente ficam sem nenhum jeito de acioná-los pela UI — a Task 7 (página de detalhe) precisa dele pra satisfazer o critério de sucesso "criar, editar e excluir funcionam de ponta a ponta".

**Files:**
- Create: `components/contabil/ClienteContabilAcoes.tsx`

**Interfaces:**
- Consumes (Task 1): `ClienteComContabil` de `@/lib/clientes-contabil`. Consumes (Task 2): `excluirClienteContabil` de `@/app/contabil/clientes/actions`. Consumes (Task 4): `EmpresaContabilModal`.
- Produces: componente `ClienteContabilAcoes` — usado pela Task 7 (`app/contabil/clientes/[id]/page.tsx`).

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { excluirClienteContabil } from '@/app/contabil/clientes/actions'
import EmpresaContabilModal from './EmpresaContabilModal'
import type { ClienteComContabil } from '@/lib/clientes-contabil'

interface Props {
  cliente: ClienteComContabil
  responsaveis: string[]
  tarefasPadrao: string[]
}

export default function ClienteContabilAcoes({ cliente, responsaveis, tarefasPadrao }: Props) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  async function handleExcluir() {
    setExcluindo(true)
    try {
      await excluirClienteContabil(cliente.id)
      router.push('/contabil/clientes')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setEditando(true)}
        className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] px-3 py-1.5 rounded-lg transition-all">
        Editar
      </button>

      {confirmando ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">Remover do Contábil?</span>
          <button onClick={handleExcluir} disabled={excluindo}
            className="text-xs bg-red-500/20 border border-red-500/40 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-all disabled:opacity-50">
            {excluindo ? 'Removendo...' : 'Confirmar'}
          </button>
          <button onClick={() => setConfirmando(false)}
            className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]/70 px-2 py-1.5">
            Cancelar
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmando(true)}
          className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg transition-all">
          Excluir
        </button>
      )}

      {editando && (
        <EmpresaContabilModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          tarefasPadrao={tarefasPadrao}
          onClose={() => setEditando(false)}
        />
      )}
    </div>
  )
}
```

Nota: o botão "Excluir" tem o rótulo interno "Remover do Contábil?" na confirmação, deixando claro pro usuário que não é uma exclusão total do cliente — coerente com o comportamento real de `excluirClienteContabil` (Task 2), que só remove o vínculo com o setor.

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/contabil/ClienteContabilAcoes.tsx
git commit -m "feat: ClienteContabilAcoes (editar e remover vinculo do cliente)"
```

---

### Task 7: Páginas — `app/contabil/clientes/page.tsx` + `app/contabil/clientes/[id]/page.tsx` + Sidebar

**Files:**
- Create: `app/contabil/clientes/page.tsx`
- Create: `app/contabil/clientes/[id]/page.tsx`
- Modify: `components/fiscal/Sidebar.tsx`

**Interfaces:**
- Consumes (Task 1): `SELECT_CLIENTE_CONTABIL`, `flattenClienteContabil`, `podeEditarClienteContabil`. Consumes (Task 2): `toggleTarefaContabil`, `atualizarEtapa`. Consumes (Task 3): `TarefaChecklistContabil`. Consumes (Task 5): `ClientesListaContabil`. Consumes (Task 6): `ClienteContabilAcoes`.

- [ ] **Step 1: Criar `app/contabil/clientes/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import ClientesListaContabil from '@/components/contabil/ClientesListaContabil'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Clientes — Tesserato Contábil' }

export default async function ClientesContabilPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  const [{ data: clientesRaw }, tarefas, { data: tiposRaw }] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).order('nome'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo', 'contabil'),
    supabase.from('tarefa_tipos').select('nome').eq('setor', 'contabil').order('nome'),
  ])

  const clientes = (clientesRaw ?? []).map(flattenClienteContabil)
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    progressoMap[c.id] = { total: c.tarefas_personalizadas.length, concluidas: 0 }
    tiposMap[c.id] = new Set(c.tarefas_personalizadas)
  }
  for (const t of tarefas) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ClientesListaContabil
        clientes={clientes}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        tarefasPadrao={tarefasPadrao}
      />
    </div>
  )
}
```

- [ ] **Step 2: Criar `app/contabil/clientes/[id]/page.tsx`**

```tsx
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { SELECT_CLIENTE_CONTABIL, flattenClienteContabil } from '@/lib/clientes-contabil'
import TarefaChecklistContabil from '@/components/contabil/TarefaChecklistContabil'
import ClienteContabilAcoes from '@/components/contabil/ClienteContabilAcoes'
import { toggleTarefaContabil, atualizarEtapa } from '../actions'
import type { Tarefa, TarefaEtapa } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClienteContabilDetalhePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('nome,role').eq('id', user.id).single()

  const { data: clienteRaw } = await supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).eq('id', id).single()
  if (!clienteRaw) notFound()
  const cliente = flattenClienteContabil(clienteRaw)

  const podeEditar = profile?.role === 'admin' || cliente.responsavel?.toLowerCase() === profile?.nome?.toLowerCase()

  const { mes, ano } = await getMesAno()

  const [{ data: tarefas }, { data: todosContabil }, { data: tiposRaw }] = await Promise.all([
    supabase.from('tarefas').select('*').eq('cliente_id', id).eq('mes', mes).eq('ano', ano).eq('setor', 'contabil'),
    supabase.from('clientes_contabil').select('responsavel'),
    supabase.from('tarefa_tipos').select('nome, etapas').eq('setor', 'contabil'),
  ])

  const responsaveis = Array.from(new Set(
    (todosContabil ?? []).map(c => c.responsavel ?? '').filter(Boolean)
  )).sort()

  const tarefaTipos: Record<string, string[] | null> = {}
  for (const t of tiposRaw ?? []) {
    tarefaTipos[t.nome as string] = t.etapas as string[] | null
  }
  const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)

  const tarefaIds = (tarefas ?? []).map(t => t.id)
  const { data: etapas } = tarefaIds.length > 0
    ? await supabase.from('tarefa_etapas').select('*').in('tarefa_id', tarefaIds)
    : { data: [] as TarefaEtapa[] }

  async function onToggleSimples(tipo: string, concluida: boolean, data?: string) {
    'use server'
    await toggleTarefaContabil(id, tipo, mes, ano, concluida, data)
  }

  async function onAtualizarEtapa(tipo: string, etapaNome: string, concluida: boolean, data?: string) {
    'use server'
    await atualizarEtapa(id, mes, ano, tipo, etapaNome, concluida, data)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 pb-6 border-b border-[var(--fg)]/8">
        <div className="flex items-start gap-4">
          <Link href="/contabil/clientes" className="mt-1 text-[var(--fg)]/30 hover:text-[var(--fg)]/70 transition-colors text-lg">←</Link>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-[var(--fg)]">{cliente.nome}</h1>
                <p className="text-[var(--fg)]/40 text-sm mt-0.5">{cliente.cnpj ?? '—'}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {cliente.atividade && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.atividade}</span>}
                  {cliente.responsavel && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.responsavel}</span>}
                  {cliente.municipio && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.municipio}{cliente.uf ? `/${cliente.uf}` : ''}</span>}
                </div>
              </div>
              {podeEditar && <ClienteContabilAcoes cliente={cliente} responsaveis={responsaveis} tarefasPadrao={tarefasPadrao} />}
            </div>
          </div>
        </div>
      </div>

      <TarefaChecklistContabil
        tarefasPersonalizadas={cliente.tarefas_personalizadas}
        tarefaTipos={tarefaTipos}
        tarefas={(tarefas ?? []) as Tarefa[]}
        etapas={(etapas ?? []) as TarefaEtapa[]}
        mes={mes}
        ano={ano}
        onToggleSimples={onToggleSimples}
        onAtualizarEtapa={onAtualizarEtapa}
        podeEditar={podeEditar}
      />
    </div>
  )
}
```

- [ ] **Step 3: Atualizar a Sidebar**

Em `components/fiscal/Sidebar.tsx`, trocar (linha 34):

```ts
  contabil:   [{ href: '/contabil',   label: 'Em construção', icon: Wrench }],
```

Por:

```ts
  contabil: [
    { href: '/contabil',          label: 'Em construção', icon: Wrench },
    { href: '/contabil/clientes', label: 'Clientes',      icon: Users  },
  ],
```

(`Users` já está importado no topo do arquivo — usado pelo item "Clientes" de `ITENS_COMUNS` e do Fiscal.)

- [ ] **Step 4: Verificar compilação e build**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build passa, `/contabil/clientes` e `/contabil/clientes/[id]` aparecem na lista de rotas.

- [ ] **Step 5: Commit**

```bash
git add "app/contabil/clientes/page.tsx" "app/contabil/clientes/[id]/page.tsx" components/fiscal/Sidebar.tsx
git commit -m "feat: paginas de Clientes do Contabil (lista + detalhe) e link na Sidebar"
```

---

### Task 8: Verificação final

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Typecheck e build completos**

Run: `npx tsc --noEmit -p .`
Expected: zero erros, projeto inteiro.

Run: `npm run build`
Expected: build passa, todas as rotas anteriores + `/contabil/clientes` e `/contabil/clientes/[id]` compilam.

- [ ] **Step 2: Confirmar que nada do Fiscal ou da Parte 2 regrediu**

Run: query de smoke test contra o banco de dev — `select count(*) from clientes_fiscal` e `select count(*) from clientes_contabil` devem retornar os mesmos números de antes desta parte (nenhum dado foi apagado; a única escrita esperada é se o usuário criar/editar/excluir um cliente do Contábil manualmente ao testar).

- [ ] **Step 3: Nota final**

Nenhum commit adicional necessário se os steps 1-2 passarem sem exigir mudança de código. Verificação manual no navegador (criar cliente, marcar tarefa simples, marcar as 4 etapas de "Movimentação", excluir vínculo) fica com o usuário.
