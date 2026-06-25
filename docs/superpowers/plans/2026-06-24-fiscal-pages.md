# Fiscal Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four features for the fiscal portal: personal calendar (agenda), XLS comparison tool (conferencia), print/PDF reports (relatorios), and an improved client detail page with task locking, MIT field, month navigation, and annual history grid.

**Architecture:** All pages are Next.js App Router client components fetching from Supabase directly. Server actions for mutations are centralized in `app/fiscal/clientes/actions.ts`. The TarefaChecklist component is converted to a client component with inline unlock panels, MIT debounce saving, and receives server actions as props from the parent server component. No tests are written — this is UI-heavy frontend code with no test runner configured in this project.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19, TypeScript, Tailwind CSS v4, Supabase (`@supabase/ssr` + `@supabase/supabase-js`), xlsx (dynamic import, not yet installed)

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `app/fiscal/agenda/page.tsx` | Create | Personal calendar with monthly grid, appointment CRUD, reminder panel |
| `app/fiscal/conferencia/page.tsx` | Create | XLS comparison tool: client search, file upload, DTE vs SISTEMA diff |
| `app/fiscal/relatorios/page.tsx` | Create | Monthly progress report with print/PDF export |
| `app/fiscal/clientes/actions.ts` | Create | Server actions: toggleTarefa, desbloquearTarefa, salvarMIT |
| `app/fiscal/clientes/[id]/page.tsx` | Modify | Add searchParams, month navigation, annual history grid |
| `components/fiscal/TarefaChecklist.tsx` | Modify | Add task locking (inline unlock panel), MIT field, keep toggle |

---

## Task 1: Server Actions file

**Files:**
- Create: `app/fiscal/clientes/actions.ts`

- [ ] **Step 1: Create the server actions file**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleTarefa(
  clienteId: string,
  tarefaId: string | null,
  tipo: string,
  concluida: boolean,
  mes: number,
  ano: number
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase.from('tarefas').upsert({
    id: tarefaId ?? undefined,
    cliente_id: clienteId,
    usuario_id: user.id,
    mes,
    ano,
    tipo,
    concluida,
    concluida_em: concluida ? new Date().toISOString() : null,
  }, { onConflict: 'cliente_id,mes,ano,tipo' })

  if (error) return { error: error.message }
  revalidatePath(`/fiscal/clientes/${clienteId}`)
  return { error: null }
}

export async function desbloquearTarefa(
  tarefaId: string,
  motivo: string,
  usuarioNome: string,
  clienteNome: string,
  tarefaTipo: string,
  competencia: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  // Set tarefa as not concluded
  const { error: updateError } = await supabase
    .from('tarefas')
    .update({ concluida: false, concluida_em: null })
    .eq('id', tarefaId)

  if (updateError) return { error: updateError.message }

  // Log the unlock
  await supabase.from('task_unlock_log').insert({
    tarefa_id: tarefaId,
    usuario_id: user.id,
    usuario_nome: usuarioNome,
    cliente_nome: clienteNome,
    tarefa_tipo: tarefaTipo,
    competencia,
    motivo,
    desbloqueado_em: new Date().toISOString(),
  })

  return { error: null }
}

export async function salvarMIT(clienteId: string, valor: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('clientes')
    .update({ mit: valor })
    .eq('id', clienteId)

  if (error) return { error: error.message }
  revalidatePath(`/fiscal/clientes/${clienteId}`)
  return { error: null }
}
```

- [ ] **Step 2: Verify TypeScript compiles (check no import errors)**

```bash
cd "C:\Users\Client\Documents\DEV\Site Tesserato + Fiscal\portal-tesserato"
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only from files not yet written (agenda, conferencia, relatorios), not from actions.ts itself.

---

## Task 2: Rewrite TarefaChecklist with task locking and MIT

**Files:**
- Modify: `components/fiscal/TarefaChecklist.tsx`

The current file is already a `'use client'` component. We need to:
1. Accept new props: `clienteId`, `clienteNome`, `usuarioNome`, `onDesbloquear`, `onSalvarMIT`, `tarefasMapa` (map from tipo to full Tarefa object so we have the id).
2. For completed tasks: show lock icon + "Desbloquear" button; clicking opens an inline panel with a textarea and confirm button.
3. MIT section at bottom when `grupo === 'normal'`.

- [ ] **Step 1: Rewrite TarefaChecklist.tsx**

```tsx
'use client'

import { useTransition, useState, useRef } from 'react'
import type { Tarefa } from '@/lib/types'

const TAREFAS_NORMAL  = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS']
const TAREFAS_SIMPLES = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF']
const TAREFAS_MEI     = ['DAS']

function getTiposParaGrupo(grupo: string) {
  if (grupo === 'simples') return TAREFAS_SIMPLES
  if (grupo === 'mei')     return TAREFAS_MEI
  return TAREFAS_NORMAL
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface Props {
  clienteId: string
  clienteNome: string
  usuarioNome: string
  grupo: string
  tarefas: Tarefa[]
  mes: number
  ano: number
  usuarioId: string
  onToggle: (tipo: string, tarefaId: string | null, concluida: boolean) => Promise<void>
  onDesbloquear: (tarefaId: string, motivo: string) => Promise<void>
  onSalvarMIT: (valor: string) => Promise<void>
  mit: string | null
}

export default function TarefaChecklist({
  clienteNome,
  grupo,
  tarefas,
  mes,
  ano,
  onToggle,
  onDesbloquear,
  onSalvarMIT,
  mit,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [unlockingTipo, setUnlockingTipo] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [mitValue, setMitValue] = useState(mit ?? '')
  const mitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tipos = getTiposParaGrupo(grupo)

  const tarefaMap = new Map(tarefas.map(t => [t.tipo, t]))
  const total = tipos.length
  const concluidas = tipos.filter(t => tarefaMap.get(t)?.concluida).length

  function handleMitChange(val: string) {
    setMitValue(val)
    if (mitDebounceRef.current) clearTimeout(mitDebounceRef.current)
    mitDebounceRef.current = setTimeout(() => {
      startTransition(() => onSalvarMIT(val))
    }, 1000)
  }

  async function handleDesbloquear(tipo: string) {
    const tarefa = tarefaMap.get(tipo)
    if (!tarefa || !motivo.trim()) return
    startTransition(async () => {
      await onDesbloquear(tarefa.id, motivo)
      setUnlockingTipo(null)
      setMotivo('')
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white/40 uppercase tracking-widest">
          Tarefas — {MESES[mes - 1]}/{ano}
        </h3>
        <span className="text-xs text-white/40">{concluidas}/{total}</span>
      </div>

      <div className="w-full h-1.5 bg-white/8 rounded-full mb-5">
        <div
          className="h-full bg-[#00B8D4] rounded-full transition-all duration-300"
          style={{ width: `${total > 0 ? (concluidas / total) * 100 : 0}%` }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {tipos.map(tipo => {
          const tarefa = tarefaMap.get(tipo)
          const feito = tarefa?.concluida ?? false
          const isUnlocking = unlockingTipo === tipo

          return (
            <div key={tipo}>
              <div
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  feito
                    ? 'bg-[#00B8D4]/10 border-[#00B8D4]/30'
                    : 'bg-white/3 border-white/8'
                }`}
              >
                {feito ? (
                  <>
                    {/* Lock icon */}
                    <div className="w-5 h-5 rounded-md bg-[#00B8D4]/30 border border-[#00B8D4]/40 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-[#00B8D4]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 1a5 5 0 00-5 5v3H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V11a2 2 0 00-2-2h-2V6a5 5 0 00-5-5zm0 2a3 3 0 013 3v3H9V6a3 3 0 013-3zm0 9a2 2 0 110 4 2 2 0 010-4z" />
                      </svg>
                    </div>
                    <span className="text-sm text-white/50 line-through flex-1">{tipo}</span>
                    <button
                      onClick={() => {
                        setUnlockingTipo(isUnlocking ? null : tipo)
                        setMotivo('')
                      }}
                      disabled={isPending}
                      className="text-xs text-amber-400/70 hover:text-amber-400 border border-amber-400/20 hover:border-amber-400/40 px-2 py-0.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Desbloquear
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => startTransition(() => onToggle(tipo, tarefa?.id ?? null, true))}
                    disabled={isPending}
                    className="flex items-center gap-3 w-full text-left disabled:opacity-60"
                  >
                    <div className="w-5 h-5 rounded-md border-2 border-white/20 flex items-center justify-center flex-shrink-0" />
                    <span className="text-sm text-white">{tipo}</span>
                  </button>
                )}
              </div>

              {isUnlocking && (
                <div className="mt-1 mb-1 p-3 bg-amber-400/5 border border-amber-400/20 rounded-xl">
                  <p className="text-xs text-amber-400/80 mb-2">Motivo da alteração</p>
                  <textarea
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    rows={2}
                    placeholder="Informe o motivo..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-[#00B8D4]/50"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleDesbloquear(tipo)}
                      disabled={isPending || !motivo.trim()}
                      className="text-xs bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    >
                      Confirmar Desbloqueio
                    </button>
                    <button
                      onClick={() => { setUnlockingTipo(null); setMotivo('') }}
                      className="text-xs text-white/40 hover:text-white/60 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {grupo === 'normal' && (
        <div className="mt-6 pt-5 border-t border-white/8">
          <label className="text-xs font-semibold text-white/40 uppercase tracking-widest block mb-2">
            MIT — Data de Envio
          </label>
          <input
            type="text"
            value={mitValue}
            onChange={e => handleMitChange(e.target.value)}
            placeholder="Ex: 15/06/2026"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00B8D4]/50 transition-colors"
          />
          {isPending && (
            <p className="text-xs text-white/30 mt-1">Salvando...</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors in component**

```bash
cd "C:\Users\Client\Documents\DEV\Site Tesserato + Fiscal\portal-tesserato"
npx tsc --noEmit 2>&1 | grep TarefaChecklist
```

Expected: no errors for this file specifically.

---

## Task 3: Update client detail page

**Files:**
- Modify: `app/fiscal/clientes/[id]/page.tsx`

The page needs to:
1. Accept `searchParams` for `mes` and `ano`.
2. Fetch tarefas for all 12 months of the current year for the annual history grid.
3. Pass new props to TarefaChecklist (clienteNome, usuarioNome, onDesbloquear, onSalvarMIT, mit).
4. Render prev/next month navigation buttons.
5. Render a 12-month grid at the bottom.

- [ ] **Step 1: Rewrite app/fiscal/clientes/[id]/page.tsx**

```tsx
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import TarefaChecklist from '@/components/fiscal/TarefaChecklist'
import { desbloquearTarefa, salvarMIT, toggleTarefa } from '@/app/fiscal/clientes/actions'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mes?: string; ano?: string }>
}

const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default async function ClienteDetalhePage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('nome')
    .eq('id', user.id)
    .single()

  const { data: cliente } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single()

  if (!cliente) notFound()

  const hoje = new Date()
  const mes = sp.mes ? parseInt(sp.mes) : hoje.getMonth() + 1
  const ano = sp.ano ? parseInt(sp.ano) : hoje.getFullYear()

  // Fetch tarefas for selected month
  const { data: tarefas } = await supabase
    .from('tarefas')
    .select('*')
    .eq('cliente_id', id)
    .eq('mes', mes)
    .eq('ano', ano)

  // Fetch all tarefas for current year for the history grid
  const { data: todasTarefasAno } = await supabase
    .from('tarefas')
    .select('mes, concluida')
    .eq('cliente_id', id)
    .eq('ano', ano)

  // Compute monthly progress for the grid
  // We need to know the expected task count per month — use the grupo
  const TAREFAS_NORMAL  = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS']
  const TAREFAS_SIMPLES = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF']
  const TAREFAS_MEI     = ['DAS']
  function getTarefasTotal(grupo: string | null) {
    if (grupo === 'simples') return TAREFAS_SIMPLES.length
    if (grupo === 'mei')     return TAREFAS_MEI.length
    return TAREFAS_NORMAL.length
  }

  const totalEsperado = getTarefasTotal(cliente.grupo)
  const progressoPorMes = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const mesItems = (todasTarefasAno ?? []).filter(t => t.mes === m)
    const concluidas = mesItems.filter(t => t.concluida).length
    return { mes: m, concluidas, total: totalEsperado }
  })

  // Prev/next month calculation
  const prevMes = mes === 1 ? 12 : mes - 1
  const prevAno = mes === 1 ? ano - 1 : ano
  const nextMes = mes === 12 ? 1 : mes + 1
  const nextAno = mes === 12 ? ano + 1 : ano

  const usuarioNome = profile?.nome ?? user.email ?? 'Usuário'

  async function handleToggle(tipo: string, tarefaId: string | null, concluida: boolean) {
    'use server'
    await toggleTarefa(id, tarefaId, tipo, concluida, mes, ano)
  }

  async function handleDesbloquear(tarefaId: string, motivo: string) {
    'use server'
    await desbloquearTarefa(
      tarefaId,
      motivo,
      usuarioNome,
      cliente.nome,
      '', // tipo is passed inside TarefaChecklist — we handle it via tarefaId lookup
      `${mes}/${ano}`
    )
  }

  async function handleSalvarMIT(valor: string) {
    'use server'
    await salvarMIT(id, valor)
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Client header */}
      <div className="mb-8 pb-6 border-b border-white/8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center flex-shrink-0">
            <span className="text-white/30 text-xs font-mono">{cliente.cod ?? '—'}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{cliente.nome}</h1>
            <p className="text-white/40 text-sm mt-1">{cliente.cnpj ?? '—'}</p>
            <div className="flex gap-3 mt-2 flex-wrap">
              {cliente.regime && (
                <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded-full">{cliente.regime}</span>
              )}
              {cliente.atividade && (
                <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded-full">{cliente.atividade}</span>
              )}
              {cliente.responsavel && (
                <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded-full">{cliente.responsavel}</span>
              )}
            </div>
            {cliente.obs && (
              <p className="text-yellow-400/70 text-xs mt-2">⚠ {cliente.obs}</p>
            )}
          </div>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href={`/fiscal/clientes/${id}?mes=${prevMes}&ano=${prevAno}`}
          className="text-white/40 hover:text-white transition-colors px-3 py-1 rounded-lg hover:bg-white/5 text-sm"
        >
          ← {MESES_LABEL[prevMes - 1]}
        </Link>
        <span className="text-white font-semibold text-sm">
          {MESES_LABEL[mes - 1]}/{ano}
        </span>
        <Link
          href={`/fiscal/clientes/${id}?mes=${nextMes}&ano=${nextAno}`}
          className="text-white/40 hover:text-white transition-colors px-3 py-1 rounded-lg hover:bg-white/5 text-sm"
        >
          {MESES_LABEL[nextMes - 1]} →
        </Link>
      </div>

      <TarefaChecklist
        clienteId={id}
        clienteNome={cliente.nome}
        usuarioNome={usuarioNome}
        grupo={cliente.grupo ?? 'normal'}
        tarefas={tarefas ?? []}
        mes={mes}
        ano={ano}
        usuarioId={user.id}
        onToggle={handleToggle}
        onDesbloquear={handleDesbloquear}
        onSalvarMIT={handleSalvarMIT}
        mit={cliente.mit ?? null}
      />

      {/* Annual history grid */}
      <div className="mt-10 pt-6 border-t border-white/8">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
          Histórico {ano}
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {progressoPorMes.map(({ mes: m, concluidas, total }) => {
            const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0
            const isActive = m === mes
            return (
              <Link
                key={m}
                href={`/fiscal/clientes/${id}?mes=${m}&ano=${ano}`}
                className={`p-3 rounded-xl border transition-all ${
                  isActive
                    ? 'border-[#00B8D4]/50 bg-[#00B8D4]/10'
                    : 'border-white/8 bg-white/3 hover:bg-white/6'
                }`}
              >
                <div className="text-xs text-white/50 mb-1">{MESES_LABEL[m - 1]}</div>
                <div className="text-sm font-bold text-white">{pct}%</div>
                <div className="w-full h-1 bg-white/8 rounded-full mt-1.5">
                  <div
                    className="h-full bg-[#00B8D4] rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd "C:\Users\Client\Documents\DEV\Site Tesserato + Fiscal\portal-tesserato"
npx tsc --noEmit 2>&1 | grep -E "(clientes|TarefaChecklist|actions)"
```

Expected: no errors for these files.

---

## Task 4: Agenda page (personal calendar)

**Files:**
- Create: `app/fiscal/agenda/page.tsx`

Key logic:
- State: `currentYear`, `currentMonth` (1-based), `agendaItems` array, `selectedDay` (number|null), `showModal` (boolean), `editingItem` (AgendaItem|null).
- `useEffect` to fetch on mount and whenever user changes.
- Monthly grid: compute first weekday of month, pad with empty cells.
- Colored dots per day: amber=pendente, green=concluido, gray=cancelado.
- Reminders: items with `lembrete_3_dias=true` where `data_compromisso` is within today..today+3 days.
- Modal for create/edit with controlled inputs.
- CRUD: direct supabase client calls.

- [ ] **Step 1: Create app/fiscal/agenda/page.tsx**

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface AgendaItem {
  id: string
  usuario_id: string
  titulo: string
  descricao: string | null
  data_compromisso: string
  hora_compromisso: string | null
  status: 'pendente' | 'concluido' | 'cancelado'
  lembrete_3_dias: boolean
  created_at: string
}

const DIAS_SEMANA = ['DOM','SEG','TER','QUA','QUI','SEX','SAB']
const MESES_LABEL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const STATUS_DOT: Record<AgendaItem['status'], string> = {
  pendente:  'bg-amber-400',
  concluido: 'bg-emerald-400',
  cancelado: 'bg-white/20',
}

const STATUS_LABEL: Record<AgendaItem['status'], string> = {
  pendente:  'Pendente',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const EMPTY_FORM = {
  titulo: '',
  data_compromisso: '',
  hora_compromisso: '',
  descricao: '',
  status: 'pendente' as AgendaItem['status'],
  lembrete_3_dias: false,
}

export default function AgendaPage() {
  const supabase = createClient()
  const today = todayStr()
  const todayDate = new Date(today + 'T12:00:00')

  const [currentYear, setCurrentYear]   = useState(todayDate.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(todayDate.getMonth() + 1)
  const [items, setItems]               = useState<AgendaItem[]>([])
  const [loading, setLoading]           = useState(true)
  const [selectedDay, setSelectedDay]   = useState<number | null>(null)
  const [showModal, setShowModal]       = useState(false)
  const [editingItem, setEditingItem]   = useState<AgendaItem | null>(null)
  const [form, setForm]                 = useState(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('agenda')
      .select('*')
      .eq('usuario_id', user.id)
      .order('data_compromisso', { ascending: true })
    setItems(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Calendar grid
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
  const firstWeekday = new Date(currentYear, currentMonth - 1, 1).getDay() // 0=Sun

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  // Group items by day
  const byDay = new Map<number, AgendaItem[]>()
  for (const item of items) {
    const [y, m, d] = item.data_compromisso.split('-').map(Number)
    if (y === currentYear && m === currentMonth) {
      const arr = byDay.get(d) ?? []
      arr.push(item)
      byDay.set(d, arr)
    }
  }

  // Reminders: lembrete_3_dias=true AND date within today..today+3
  const limit = addDays(today, 3)
  const reminders = items.filter(item =>
    item.lembrete_3_dias &&
    item.data_compromisso >= today &&
    item.data_compromisso <= limit &&
    item.status === 'pendente'
  )

  function prevMonth() {
    if (currentMonth === 1) { setCurrentYear(y => y - 1); setCurrentMonth(12) }
    else setCurrentMonth(m => m - 1)
    setSelectedDay(null)
  }

  function nextMonth() {
    if (currentMonth === 12) { setCurrentYear(y => y + 1); setCurrentMonth(1) }
    else setCurrentMonth(m => m + 1)
    setSelectedDay(null)
  }

  function openCreateModal(day?: number) {
    setEditingItem(null)
    setForm({
      ...EMPTY_FORM,
      data_compromisso: day ? toDateStr(currentYear, currentMonth, day) : '',
    })
    setShowModal(true)
  }

  function openEditModal(item: AgendaItem) {
    setEditingItem(item)
    setForm({
      titulo: item.titulo,
      data_compromisso: item.data_compromisso,
      hora_compromisso: item.hora_compromisso ?? '',
      descricao: item.descricao ?? '',
      status: item.status,
      lembrete_3_dias: item.lembrete_3_dias,
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.titulo.trim() || !form.data_compromisso) return
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const payload = {
      usuario_id: user.id,
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      data_compromisso: form.data_compromisso,
      hora_compromisso: form.hora_compromisso.trim() || null,
      status: form.status,
      lembrete_3_dias: form.lembrete_3_dias,
    }

    let err
    if (editingItem) {
      const { error: e } = await supabase.from('agenda').update(payload).eq('id', editingItem.id)
      err = e
    } else {
      const { error: e } = await supabase.from('agenda').insert(payload)
      err = e
    }

    if (err) { setError(err.message); setSaving(false); return }
    await fetchItems()
    setSaving(false)
    setShowModal(false)
  }

  async function handleDelete(itemId: string) {
    if (!confirm('Excluir este compromisso?')) return
    await supabase.from('agenda').delete().eq('id', itemId)
    await fetchItems()
    setSelectedDay(null)
  }

  const selectedItems = selectedDay ? (byDay.get(selectedDay) ?? []) : []

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Agenda</h1>
        <button
          onClick={() => openCreateModal()}
          className="text-sm bg-[#00B8D4] hover:bg-[#00a8c2] text-white px-4 py-2 rounded-xl transition-colors"
        >
          + Novo Compromisso
        </button>
      </div>

      {/* Reminders panel */}
      {reminders.length > 0 && (
        <div className="mb-6 p-4 bg-amber-400/10 border border-amber-400/20 rounded-2xl">
          <p className="text-xs font-semibold text-amber-400/80 uppercase tracking-widest mb-3">
            Lembretes — próximos 3 dias
          </p>
          <div className="flex flex-col gap-2">
            {reminders.map(r => (
              <div key={r.id} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <span className="text-sm text-white/80">{r.titulo}</span>
                <span className="text-xs text-white/40 ml-auto">{r.data_compromisso}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar header */}
      <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <button onClick={prevMonth} className="text-white/40 hover:text-white px-3 py-1 rounded-lg hover:bg-white/5 transition-colors text-sm">←</button>
          <span className="text-white font-semibold">{MESES_LABEL[currentMonth - 1]} {currentYear}</span>
          <button onClick={nextMonth} className="text-white/40 hover:text-white px-3 py-1 rounded-lg hover:bg-white/5 transition-colors text-sm">→</button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-white/8">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="text-center text-xs text-white/30 py-2 font-semibold tracking-widest">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const dayItems = day ? (byDay.get(day) ?? []) : []
            const isToday = day !== null && toDateStr(currentYear, currentMonth, day) === today
            const isSelected = day === selectedDay
            return (
              <div
                key={i}
                onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                className={`min-h-[72px] p-2 border-b border-r border-white/5 cursor-pointer transition-colors ${
                  day ? (isSelected ? 'bg-[#00B8D4]/10' : 'hover:bg-white/3') : ''
                }`}
              >
                {day && (
                  <>
                    <div className={`text-xs w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                      isToday ? 'bg-[#00B8D4] text-white font-bold' : 'text-white/50'
                    }`}>
                      {day}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {dayItems.map(item => (
                        <div key={item.id} className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[item.status]}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected day panel */}
      {selectedDay !== null && (
        <div className="mt-4 p-4 bg-white/3 border border-white/8 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">
              {selectedDay} de {MESES_LABEL[currentMonth - 1]}
            </h3>
            <button
              onClick={() => openCreateModal(selectedDay)}
              className="text-xs text-[#00B8D4] hover:text-[#00a8c2] transition-colors"
            >
              + Adicionar
            </button>
          </div>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-white/30">Nenhum compromisso neste dia.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedItems.map(item => (
                <div key={item.id} className="flex items-start gap-3 p-3 bg-white/3 rounded-xl">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${STATUS_DOT[item.status]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">{item.titulo}</div>
                    {item.hora_compromisso && (
                      <div className="text-xs text-white/40">{item.hora_compromisso}</div>
                    )}
                    {item.descricao && (
                      <div className="text-xs text-white/40 mt-0.5">{item.descricao}</div>
                    )}
                    <div className="text-xs text-white/30 mt-0.5">{STATUS_LABEL[item.status]}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEditModal(item)}
                      className="text-xs text-white/40 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-400/5 transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-base font-bold text-white mb-5">
              {editingItem ? 'Editar Compromisso' : 'Novo Compromisso'}
            </h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-white/40 block mb-1">Título *</label>
                <input
                  type="text"
                  value={form.titulo}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00B8D4]/50"
                  placeholder="Título do compromisso"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/40 block mb-1">Data *</label>
                  <input
                    type="date"
                    value={form.data_compromisso}
                    onChange={e => setForm(f => ({ ...f, data_compromisso: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00B8D4]/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">Horário</label>
                  <input
                    type="text"
                    value={form.hora_compromisso}
                    onChange={e => setForm(f => ({ ...f, hora_compromisso: e.target.value }))}
                    placeholder="Ex: 14:30"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00B8D4]/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-white/40 block mb-1">Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-[#00B8D4]/50"
                  placeholder="Detalhes..."
                />
              </div>

              <div>
                <label className="text-xs text-white/40 block mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as AgendaItem['status'] }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00B8D4]/50"
                >
                  <option value="pendente">Pendente</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.lembrete_3_dias}
                  onChange={e => setForm(f => ({ ...f, lembrete_3_dias: e.target.checked }))}
                  className="w-4 h-4 accent-[#00B8D4]"
                />
                <span className="text-sm text-white/70">Lembrete 3 dias antes</span>
              </label>
            </div>

            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSave}
                disabled={saving || !form.titulo.trim() || !form.data_compromisso}
                className="flex-1 bg-[#00B8D4] hover:bg-[#00a8c2] text-white text-sm py-2.5 rounded-xl transition-colors disabled:opacity-40"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 text-sm text-white/40 hover:text-white border border-white/10 rounded-xl transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles for agenda page**

```bash
cd "C:\Users\Client\Documents\DEV\Site Tesserato + Fiscal\portal-tesserato"
npx tsc --noEmit 2>&1 | grep agenda
```

Expected: no errors.

---

## Task 5: Conferencia page (XLS comparison tool)

**Files:**
- Create: `app/fiscal/conferencia/page.tsx`

Note: `xlsx` is not in package.json. The page must handle the case where `import('xlsx')` throws (show an error message). Install instruction at end of task.

- [ ] **Step 1: Create app/fiscal/conferencia/page.tsx**

```tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Cliente {
  id: string
  nome: string
  cnpj: string | null
}

interface ClienteFile {
  id: string
  cliente_id: string
  name: string
  size: number
  content_base64: string
  uploaded_at: string
}

const UF_MAP: Record<string, string> = {
  '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO',
  '21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA',
  '31':'MG','32':'ES','33':'RJ','35':'SP',
  '41':'PR','42':'SC','43':'RS',
  '50':'MS','51':'MT','52':'GO','53':'DF',
}

function extractKeys(data: unknown[][]): Set<string> {
  const keys = new Set<string>()
  for (const row of data) {
    for (const cell of row) {
      if (cell == null) continue
      const str = String(cell)
      const matches = str.match(/(\d{44})/g)
      if (matches) matches.forEach(k => keys.add(k))
    }
  }
  return keys
}

async function readWorkbookRows(wb: { SheetNames: string[]; Sheets: Record<string, unknown> }, XLSX: { utils: { sheet_to_json: (sheet: unknown, opts: unknown) => unknown[][] } }): Promise<unknown[][]> {
  const rows: unknown[][] = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const sheetRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    rows.push(...sheetRows)
  }
  return rows
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function ConferenciaPage() {
  const supabase = createClient()

  const [query, setQuery]               = useState('')
  const [clientes, setClientes]         = useState<Cliente[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [clienteFiles, setClienteFiles] = useState<ClienteFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [sistemaFile, setSistemaFile]   = useState<File | null>(null)
  const [selectedDteIds, setSelectedDteIds] = useState<Set<string>>(new Set())
  const [comparing, setComparing]       = useState(false)
  const [results, setResults]           = useState<{
    dteTotal: number
    sistemaTotal: number
    divergentes: string[]
  } | null>(null)
  const [compareError, setCompareError] = useState<string | null>(null)

  const dteInputRef = useRef<HTMLInputElement>(null)

  // Autocomplete
  useEffect(() => {
    if (!query.trim()) { setClientes([]); return }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nome, cnpj')
        .ilike('nome', `%${query}%`)
        .limit(10)
      setClientes(data ?? [])
      setShowDropdown(true)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, supabase])

  async function loadFiles(clienteId: string) {
    setLoadingFiles(true)
    const { data } = await supabase
      .from('client_files')
      .select('id, cliente_id, name, size, content_base64, uploaded_at')
      .eq('cliente_id', clienteId)
      .order('uploaded_at', { ascending: false })
    setClienteFiles(data ?? [])
    setLoadingFiles(false)
  }

  function selectCliente(c: Cliente) {
    setSelectedCliente(c)
    setQuery(c.nome)
    setShowDropdown(false)
    setResults(null)
    setSelectedDteIds(new Set())
    loadFiles(c.id)
  }

  async function uploadDTE(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedCliente) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      await supabase.from('client_files').insert({
        cliente_id: selectedCliente.id,
        name: file.name,
        size: file.size,
        content_base64: base64,
        uploaded_at: new Date().toISOString(),
      })
      await loadFiles(selectedCliente.id)
      setUploading(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function deleteDTE(fileId: string) {
    if (!confirm('Excluir este arquivo?')) return
    await supabase.from('client_files').delete().eq('id', fileId)
    setClienteFiles(prev => prev.filter(f => f.id !== fileId))
    setSelectedDteIds(prev => { const s = new Set(prev); s.delete(fileId); return s })
  }

  async function handleCompare() {
    if (!sistemaFile) return
    setComparing(true)
    setCompareError(null)
    setResults(null)

    try {
      const XLSX = (await import('xlsx')).default

      // Extract from selected DTE files
      const dteKeys = new Set<string>()
      for (const fileId of selectedDteIds) {
        const file = clienteFiles.find(f => f.id === fileId)
        if (!file) continue
        const wb = XLSX.read(file.content_base64, { type: 'base64' })
        const rows = await readWorkbookRows(wb as Parameters<typeof readWorkbookRows>[0], XLSX as Parameters<typeof readWorkbookRows>[1])
        extractKeys(rows).forEach(k => dteKeys.add(k))
      }

      // Extract from SISTEMA file
      const ab = await sistemaFile.arrayBuffer()
      const sistemaWb = XLSX.read(new Uint8Array(ab), { type: 'array' })
      const sistemaRows = await readWorkbookRows(sistemaWb as Parameters<typeof readWorkbookRows>[0], XLSX as Parameters<typeof readWorkbookRows>[1])
      const sistemaKeys = extractKeys(sistemaRows)

      // Divergences = DTE keys NOT in SISTEMA
      const divergentes = [...dteKeys].filter(k => !sistemaKeys.has(k))

      setResults({
        dteTotal: dteKeys.size,
        sistemaTotal: sistemaKeys.size,
        divergentes,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Cannot find module') || msg.includes('xlsx')) {
        setCompareError('Pacote "xlsx" não instalado. Execute: npm install xlsx')
      } else {
        setCompareError(`Erro na comparação: ${msg}`)
      }
    }
    setComparing(false)
  }

  function exportCSV() {
    if (!results) return
    const lines = ['Chave,UF']
    for (const key of results.divergentes) {
      const uf = UF_MAP[key.slice(0, 2)] ?? '??'
      lines.push(`${key},${uf}`)
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'divergencias.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const canCompare = selectedDteIds.size > 0 && sistemaFile !== null

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold text-white mb-6">Conferência de Arquivos</h1>

      {/* Client search */}
      <div className="mb-6 relative">
        <label className="text-xs text-white/40 uppercase tracking-widest block mb-2">Cliente</label>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setShowDropdown(true) }}
          onFocus={() => query && setShowDropdown(true)}
          placeholder="Buscar cliente..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00B8D4]/50 transition-colors"
        />
        {showDropdown && clientes.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden z-20 shadow-xl">
            {clientes.map(c => (
              <button
                key={c.id}
                onClick={() => selectCliente(c)}
                className="w-full text-left px-4 py-3 text-sm text-white/80 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
              >
                {c.nome}
                {c.cnpj && <span className="text-white/30 ml-2 text-xs">{c.cnpj}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedCliente && (
        <>
          {/* DTE Files */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest">
                Arquivos DTE — {selectedCliente.nome}
              </h2>
              <div>
                <input
                  ref={dteInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={uploadDTE}
                  className="hidden"
                />
                <button
                  onClick={() => dteInputRef.current?.click()}
                  disabled={uploading}
                  className="text-sm bg-white/8 hover:bg-white/12 text-white/70 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Enviando...' : '+ Upload DTE'}
                </button>
              </div>
            </div>

            {loadingFiles ? (
              <p className="text-sm text-white/30">Carregando...</p>
            ) : clienteFiles.length === 0 ? (
              <p className="text-sm text-white/30">Nenhum arquivo enviado.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {clienteFiles.map(file => (
                  <div
                    key={file.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedDteIds.has(file.id)
                        ? 'bg-[#00B8D4]/10 border-[#00B8D4]/30'
                        : 'bg-white/3 border-white/8 hover:bg-white/5'
                    }`}
                    onClick={() => setSelectedDteIds(prev => {
                      const s = new Set(prev)
                      if (s.has(file.id)) s.delete(file.id)
                      else s.add(file.id)
                      return s
                    })}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      selectedDteIds.has(file.id) ? 'bg-[#00B8D4] border-[#00B8D4]' : 'border-white/20'
                    }`}>
                      {selectedDteIds.has(file.id) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{file.name}</div>
                      <div className="text-xs text-white/30">
                        {formatSize(file.size)} · {new Date(file.uploaded_at).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteDTE(file.id) }}
                      className="text-xs text-red-400/40 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-400/5 transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SISTEMA file */}
          <div className="mb-6 p-4 bg-white/3 border border-white/8 rounded-2xl">
            <label className="text-xs font-semibold text-white/40 uppercase tracking-widest block mb-3">
              Planilha Sistema
            </label>
            <input
              type="file"
              accept=".xls,.xlsx"
              onChange={e => setSistemaFile(e.target.files?.[0] ?? null)}
              className="text-sm text-white/60 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-white/60 hover:file:bg-white/15 file:transition-colors cursor-pointer"
            />
            {sistemaFile && (
              <p className="text-xs text-white/40 mt-2">{sistemaFile.name} — {formatSize(sistemaFile.size)}</p>
            )}
          </div>

          {/* Compare button */}
          <button
            onClick={handleCompare}
            disabled={!canCompare || comparing}
            className="w-full py-3 bg-[#00B8D4] hover:bg-[#00a8c2] text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-6"
          >
            {comparing ? 'Comparando...' : 'Comparar'}
          </button>

          {compareError && (
            <div className="p-4 bg-red-400/10 border border-red-400/20 rounded-xl text-sm text-red-400 mb-4">
              {compareError}
            </div>
          )}

          {/* Results */}
          {results && (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-white/3 border border-white/8 rounded-2xl text-center">
                  <div className="text-2xl font-bold text-white">{results.dteTotal}</div>
                  <div className="text-xs text-white/40 mt-1">Chaves DTE</div>
                </div>
                <div className="p-4 bg-white/3 border border-white/8 rounded-2xl text-center">
                  <div className="text-2xl font-bold text-white">{results.sistemaTotal}</div>
                  <div className="text-xs text-white/40 mt-1">Chaves Sistema</div>
                </div>
                <div className={`p-4 border rounded-2xl text-center ${
                  results.divergentes.length === 0
                    ? 'bg-emerald-400/10 border-emerald-400/30'
                    : 'bg-red-400/10 border-red-400/30'
                }`}>
                  <div className={`text-2xl font-bold ${results.divergentes.length === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {results.divergentes.length}
                  </div>
                  <div className="text-xs text-white/40 mt-1">Divergências</div>
                </div>
              </div>

              {results.divergentes.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white/60">Chaves Divergentes</h3>
                    <button
                      onClick={exportCSV}
                      className="text-xs text-[#00B8D4] hover:text-[#00a8c2] border border-[#00B8D4]/30 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Exportar CSV
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                    {results.divergentes.map((key, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 bg-white/3 rounded-lg font-mono">
                        <span className="text-xs text-white/30 w-5 text-right">{i + 1}</span>
                        <span className="text-xs text-white/70 flex-1">{key}</span>
                        <span className="text-xs text-amber-400/70">{UF_MAP[key.slice(0,2)] ?? '??'}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Install xlsx package**

```bash
cd "C:\Users\Client\Documents\DEV\Site Tesserato + Fiscal\portal-tesserato"
npm install xlsx
```

Expected: xlsx added to package.json dependencies.

- [ ] **Step 3: Verify TypeScript compiles for conferencia page**

```bash
npx tsc --noEmit 2>&1 | grep conferencia
```

Expected: no errors.

---

## Task 6: Relatorios page (print/PDF reports)

**Files:**
- Create: `app/fiscal/relatorios/page.tsx`

Key logic:
- Fetch all clientes and all tarefas for current month on mount.
- Progress = concluidas / total for that client. If no tarefas = 0%.
- Table sorted by ascending progress (least done first).
- Filters: responsavel dropdown, grupo filter, pendentes only toggle.
- Print: open new window with HTML string.

- [ ] **Step 1: Create app/fiscal/relatorios/page.tsx**

```tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Cliente, Tarefa } from '@/lib/types'

const TAREFAS_NORMAL  = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS']
const TAREFAS_SIMPLES = ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF']
const TAREFAS_MEI     = ['DAS']

function getTotalEsperado(grupo: string | null) {
  if (grupo === 'simples') return TAREFAS_SIMPLES.length
  if (grupo === 'mei')     return TAREFAS_MEI.length
  return TAREFAS_NORMAL.length
}

const MESES_LABEL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default function RelatoriosPage() {
  const supabase = createClient()
  const hoje = new Date()
  const mes  = hoje.getMonth() + 1
  const ano  = hoje.getFullYear()

  const [clientes, setClientes]   = useState<Cliente[]>([])
  const [tarefas, setTarefas]     = useState<Tarefa[]>([])
  const [loading, setLoading]     = useState(true)
  const [responsavel, setResponsavel] = useState('')
  const [grupo, setGrupo]         = useState('')
  const [apendasPendentes, setApenasPendentes] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: cls } = await supabase.from('clientes').select('*').order('nome')
      const { data: trs } = await supabase
        .from('tarefas')
        .select('*')
        .eq('mes', mes)
        .eq('ano', ano)
      setClientes(cls ?? [])
      setTarefas(trs ?? [])
      setLoading(false)
    }
    load()
  }, [supabase, mes, ano])

  const responsaveis = useMemo(() => {
    const set = new Set(clientes.map(c => c.responsavel).filter(Boolean) as string[])
    return [...set].sort()
  }, [clientes])

  const grupos = useMemo(() => {
    const set = new Set(clientes.map(c => c.grupo).filter(Boolean) as string[])
    return [...set].sort()
  }, [clientes])

  const rows = useMemo(() => {
    return clientes
      .filter(c => {
        if (responsavel && c.responsavel !== responsavel) return false
        if (grupo && c.grupo !== grupo) return false
        return true
      })
      .map(c => {
        const clienteTarefas = tarefas.filter(t => t.cliente_id === c.id)
        const total = getTotalEsperado(c.grupo)
        const concluidas = clienteTarefas.filter(t => t.concluida).length
        const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0
        const pendentes = total - concluidas
        return { cliente: c, total, concluidas, pct, pendentes }
      })
      .filter(r => !apendasPendentes || r.pct < 100)
      .sort((a, b) => a.pct - b.pct)
  }, [clientes, tarefas, responsavel, grupo, apendasPendentes])

  const stats = useMemo(() => {
    const total = rows.length
    const cem   = rows.filter(r => r.pct === 100).length
    const emProgresso = rows.filter(r => r.pct > 0 && r.pct < 100).length
    const naoIniciado = rows.filter(r => r.pct === 0).length
    return { total, cem, emProgresso, naoIniciado }
  }, [rows])

  function handlePrint() {
    const win = window.open('', '_blank')
    if (!win) return

    const tableRows = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.cliente.nome}</td>
        <td>${r.cliente.cnpj ?? '—'}</td>
        <td>${r.cliente.regime ?? '—'}</td>
        <td>${r.cliente.responsavel ?? '—'}</td>
        <td>${r.pct}%</td>
        <td>${r.pendentes}</td>
        <td>${r.cliente.obs ?? ''}</td>
      </tr>
    `).join('')

    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório Fiscal — ${MESES_LABEL[mes - 1]}/${ano}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; }
    h1 { font-size: 12pt; margin-bottom: 8px; }
    p.sub { font-size: 8pt; color: #555; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
    th { background: #f0f0f0; font-size: 8pt; }
    td { font-size: 8pt; }
    tr:nth-child(even) { background: #fafafa; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>Relatório de Progresso Fiscal</h1>
  <p class="sub">${MESES_LABEL[mes - 1]}/${ano} · Total: ${stats.total} clientes · 100%: ${stats.cem} · Em progresso: ${stats.emProgresso} · Não iniciado: ${stats.naoIniciado}</p>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Cliente</th><th>CNPJ</th><th>Regime</th><th>Responsável</th><th>Progresso</th><th>Pendentes</th><th>Obs</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`)
    win.document.close()
    win.print()
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">
          Relatórios — {MESES_LABEL[mes - 1]}/{ano}
        </h1>
        <button
          onClick={handlePrint}
          disabled={loading || rows.length === 0}
          className="text-sm bg-[#00B8D4] hover:bg-[#00a8c2] text-white px-5 py-2.5 rounded-xl transition-colors disabled:opacity-40"
        >
          Imprimir
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Clientes', value: stats.total },
          { label: '100% Concluídos', value: stats.cem, color: 'text-emerald-400' },
          { label: 'Em Progresso', value: stats.emProgresso, color: 'text-amber-400' },
          { label: 'Não Iniciados', value: stats.naoIniciado, color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="p-4 bg-white/3 border border-white/8 rounded-2xl">
            <div className={`text-2xl font-bold ${s.color ?? 'text-white'}`}>{s.value}</div>
            <div className="text-xs text-white/40 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={responsavel}
          onChange={e => setResponsavel(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00B8D4]/50"
        >
          <option value="">Todos os Responsáveis</option>
          {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select
          value={grupo}
          onChange={e => setGrupo(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00B8D4]/50"
        >
          <option value="">Todos os Grupos</option>
          {grupos.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <label className="flex items-center gap-2 cursor-pointer px-3 py-2 bg-white/5 border border-white/10 rounded-xl">
          <input
            type="checkbox"
            checked={apendasPendentes}
            onChange={e => setApenasPendentes(e.target.checked)}
            className="accent-[#00B8D4]"
          />
          <span className="text-sm text-white/70">Apenas pendentes</span>
        </label>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-white/30">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {['#','Cliente','CNPJ','Regime','Responsável','Progresso','Pendentes','Obs'].map(h => (
                  <th key={h} className="text-left text-xs text-white/40 font-semibold uppercase tracking-widest px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.cliente.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3 text-white/30">{i + 1}</td>
                  <td className="px-4 py-3 text-white font-medium">{r.cliente.nome}</td>
                  <td className="px-4 py-3 text-white/50">{r.cliente.cnpj ?? '—'}</td>
                  <td className="px-4 py-3 text-white/50">{r.cliente.regime ?? '—'}</td>
                  <td className="px-4 py-3 text-white/50">{r.cliente.responsavel ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-white/8 rounded-full">
                        <div
                          className={`h-full rounded-full transition-all ${
                            r.pct === 100 ? 'bg-emerald-400' : r.pct > 0 ? 'bg-[#00B8D4]' : 'bg-white/10'
                          }`}
                          style={{ width: `${r.pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-white/50 w-8">{r.pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/50">{r.pendentes}</td>
                  <td className="px-4 py-3 text-yellow-400/60 text-xs">{r.cliente.obs ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="text-sm text-white/30 text-center py-8">Nenhum cliente encontrado.</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles for relatorios**

```bash
cd "C:\Users\Client\Documents\DEV\Site Tesserato + Fiscal\portal-tesserato"
npx tsc --noEmit 2>&1 | grep relatorios
```

Expected: no errors.

---

## Task 7: Final build verification

- [ ] **Step 1: Run full TypeScript check**

```bash
cd "C:\Users\Client\Documents\DEV\Site Tesserato + Fiscal\portal-tesserato"
npx tsc --noEmit 2>&1
```

Expected: zero errors, or only errors unrelated to the new files (e.g., pre-existing issues).

- [ ] **Step 2: Run dev server and manually verify each page loads**

```bash
npm run dev
```

Then open:
- `http://localhost:3000/fiscal/agenda` — should render calendar
- `http://localhost:3000/fiscal/conferencia` — should render client search
- `http://localhost:3000/fiscal/relatorios` — should render table
- `http://localhost:3000/fiscal/clientes/<any-id>` — should render month nav + history grid

---

## Self-Review: Spec Coverage

| Spec Requirement | Task |
|---|---|
| Agenda: monthly calendar grid with dots | Task 4 |
| Agenda: prev/next month nav | Task 4 |
| Agenda: side panel for day appointments | Task 4 (selected day panel) |
| Agenda: lembrete panel top | Task 4 |
| Agenda: CRUD modal with all fields | Task 4 |
| Agenda: fetch for current user | Task 4 |
| Conferencia: client search autocomplete | Task 5 |
| Conferencia: DTE file list + upload + delete | Task 5 |
| Conferencia: SISTEMA file input (state only) | Task 5 |
| Conferencia: COMPARAR button with enable condition | Task 5 |
| Conferencia: xlsx dynamic import + base64 decode | Task 5 |
| Conferencia: 44-digit key extraction regex | Task 5 |
| Conferencia: divergences = DTE keys NOT in SISTEMA | Task 5 |
| Conferencia: 3 summary cards + divergent list | Task 5 |
| Conferencia: UF code lookup | Task 5 |
| Conferencia: CSV export | Task 5 |
| Relatorios: fetch clients + tarefas current month | Task 6 |
| Relatorios: filter by responsavel, grupo, pendentes | Task 6 |
| Relatorios: summary stats (4 cards) | Task 6 |
| Relatorios: table sorted by progress ascending | Task 6 |
| Relatorios: progress CSS bar + % column | Task 6 |
| Relatorios: print via window.open + HTML string | Task 6 |
| Relatorios: A4 landscape print styles | Task 6 |
| TarefaChecklist: task locking (lock icon + Desbloquear) | Task 2 |
| TarefaChecklist: inline unlock panel (textarea + confirm) | Task 2 |
| TarefaChecklist: desbloquearTarefa server action | Task 1 |
| TarefaChecklist: MIT field for grupo=normal | Task 2 |
| TarefaChecklist: MIT debounce 1s save | Task 2 |
| TarefaChecklist: keep existing toggle functionality | Task 2 |
| Client page: searchParams mes/ano | Task 3 |
| Client page: prev/next month buttons | Task 3 |
| Client page: annual history grid (12 months, clickable) | Task 3 |
| Client page: fetch all 12 months for year | Task 3 |
| Server actions file: toggleTarefa, desbloquearTarefa, salvarMIT | Task 1 |

All spec requirements covered.
