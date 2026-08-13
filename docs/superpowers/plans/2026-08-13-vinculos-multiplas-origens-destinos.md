# Vínculos de tarefas com múltiplas origens e destinos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um vínculo de tarefas entre setores tenha múltiplas tarefas de origem e/ou múltiplas tarefas de destino, criadas de uma vez na tela `/vinculos`, com a regra de liberação "E" (todas as origens precisam estar concluídas) refletida corretamente nos badges de status.

**Architecture:** Sem mudança de schema — `tarefa_vinculos` já é uma tabela de pares (1 linha = 1 origem→destino), então N:N já é suportado por múltiplas linhas. O trabalho é: (1) extrair a lógica de agregação/formatação de `lib/vinculos.ts` em funções puras testáveis sem Supabase, corrigindo o bug de sobrescrita quando duas origens miram o mesmo destino; (2) trocar a criação de vínculo de "1 por vez" para "produto cartesiano de várias origens × vários destinos" via nova server action; (3) atualizar os 6 pontos de renderização de badge (3× checklist, 3× listagem) pra usar a formatação centralizada.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase, TypeScript, `node:test` + `tsx` para testes unitários (sem framework de mock de Supabase no repo — funções que tocam o banco não são unit-testadas hoje; a lógica pura é extraída justamente pra poder ser testada sem mock).

## Global Constraints

- Regra de liberação: um destino só fica "liberada" quando **todas** as origens vinculadas e ativas do cliente estiverem concluídas (E lógico, não OU) — confirmado com o usuário.
- Criar vínculo com múltiplas origens/destinos = produto cartesiano (N origens × M destinos = N×M vínculos), pulando pares já existentes no catálogo.
- O seletor de Setor (origem/destino) continua único por lado; só a lista de tarefas vira multi-seleção.
- Badge com 1 origem só (`total === 1`): texto igual ao de hoje, sem mudança visual — `✓ Liberada por Fiscal` / `⏳ Aguardando Fiscal`.
- Badge com múltiplas origens (`total > 1`): contagem, sem nomear setores — `✓ Liberada (3/3)` / `⏳ Aguardando (2/3 concluídas)`.
- Sem alteração de schema, sem alteração na tela de ativar vínculos por cliente (`ClienteGeralModal.tsx`).
- Não rodar verificação no navegador sem o usuário pedir explicitamente — validar via `tsc --noEmit` e os testes unitários.
- Nunca fazer `git push`/PR/merge sem o usuário pedir.

---

### Task 1: Funções puras de agregação e formatação em `lib/vinculos.ts`

**Files:**
- Modify: `lib/vinculos.ts` (adicionar funções no topo do arquivo, antes de `buscarVinculosDoCliente`)
- Test: `tests/vinculos.test.ts` (novo)

**Interfaces:**
- Consumes: `SETOR_LABEL`, `UserSetor` de `lib/types.ts` (já importados em `lib/vinculos.ts`); `TarefaVinculo` de `lib/types.ts` (novo import).
- Produces (usado pelas Tasks 2 e 5):
  - `agregarStatusVinculo(origens: { setorOrigemLabel: string; concluida: boolean }[]): VinculoStatus`
  - `formatarBadgeVinculo(status: { liberada: boolean; concluidos: number; total: number; setorOrigemLabel: string }): { texto: string; classe: string }`
  - `calcularNovosPares(setorOrigem: UserSetor, tiposOrigem: string[], setorDestino: UserSetor, tiposDestino: string[], vinculosExistentes: TarefaVinculo[]): { tipoOrigem: string; tipoDestino: string }[]`
  - `VinculoStatus` interface atualizada com `concluidos: number` e `total: number`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/vinculos.test.ts`:

```ts
// tests/vinculos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarStatusVinculo, formatarBadgeVinculo, calcularNovosPares } from '../lib/vinculos'
import type { TarefaVinculo } from '../lib/types'

test('agregarStatusVinculo: uma origem concluída libera (total=1)', () => {
  const status = agregarStatusVinculo([{ setorOrigemLabel: 'Fiscal', concluida: true }])
  assert.deepEqual(status, { setorOrigemLabel: 'Fiscal', liberada: true, concluidos: 1, total: 1 })
})

test('agregarStatusVinculo: uma origem não concluída não libera (total=1)', () => {
  const status = agregarStatusVinculo([{ setorOrigemLabel: 'Fiscal', concluida: false }])
  assert.deepEqual(status, { setorOrigemLabel: 'Fiscal', liberada: false, concluidos: 0, total: 1 })
})

test('agregarStatusVinculo: duas origens, só uma concluída = não libera (E lógico)', () => {
  const status = agregarStatusVinculo([
    { setorOrigemLabel: 'Fiscal', concluida: true },
    { setorOrigemLabel: 'Contábil', concluida: false },
  ])
  assert.equal(status.liberada, false)
  assert.equal(status.concluidos, 1)
  assert.equal(status.total, 2)
})

test('agregarStatusVinculo: duas origens, ambas concluídas = libera', () => {
  const status = agregarStatusVinculo([
    { setorOrigemLabel: 'Fiscal', concluida: true },
    { setorOrigemLabel: 'Contábil', concluida: true },
  ])
  assert.equal(status.liberada, true)
  assert.equal(status.concluidos, 2)
  assert.equal(status.total, 2)
})

test('agregarStatusVinculo: setorOrigemLabel guarda o label da primeira origem da lista', () => {
  const status = agregarStatusVinculo([
    { setorOrigemLabel: 'Fiscal', concluida: true },
    { setorOrigemLabel: 'Contábil', concluida: true },
  ])
  assert.equal(status.setorOrigemLabel, 'Fiscal')
})

test('formatarBadgeVinculo: total=1 liberada mantém o texto atual com o setor', () => {
  const badge = formatarBadgeVinculo({ liberada: true, concluidos: 1, total: 1, setorOrigemLabel: 'Fiscal' })
  assert.equal(badge.texto, '✓ Liberada por Fiscal')
  assert.equal(badge.classe, 'bg-green-500/15 text-green-400')
})

test('formatarBadgeVinculo: total=1 aguardando mantém o texto atual com o setor', () => {
  const badge = formatarBadgeVinculo({ liberada: false, concluidos: 0, total: 1, setorOrigemLabel: 'Fiscal' })
  assert.equal(badge.texto, '⏳ Aguardando Fiscal')
  assert.equal(badge.classe, 'bg-orange-500/15 text-orange-400')
})

test('formatarBadgeVinculo: total>1 liberada usa contagem, sem nomear setor', () => {
  const badge = formatarBadgeVinculo({ liberada: true, concluidos: 3, total: 3, setorOrigemLabel: 'Fiscal' })
  assert.equal(badge.texto, '✓ Liberada (3/3)')
})

test('formatarBadgeVinculo: total>1 aguardando usa contagem parcial', () => {
  const badge = formatarBadgeVinculo({ liberada: false, concluidos: 2, total: 3, setorOrigemLabel: 'Fiscal' })
  assert.equal(badge.texto, '⏳ Aguardando (2/3 concluídas)')
})

const catalogoExistente: TarefaVinculo[] = [
  { id: '1', setor_origem: 'fiscal', tipo_origem: 'DAS', setor_destino: 'contabil', tipo_destino: 'Guia', created_at: '' },
]

test('calcularNovosPares: gera o produto cartesiano entre origens e destinos marcados', () => {
  const pares = calcularNovosPares('fiscal', ['A', 'B'], 'contabil', ['X'], [])
  assert.deepEqual(pares, [
    { tipoOrigem: 'A', tipoDestino: 'X' },
    { tipoOrigem: 'B', tipoDestino: 'X' },
  ])
})

test('calcularNovosPares: pula pares que já existem no catálogo pro mesmo par de setores', () => {
  const pares = calcularNovosPares('fiscal', ['DAS', 'ISS'], 'contabil', ['Guia'], catalogoExistente)
  assert.deepEqual(pares, [{ tipoOrigem: 'ISS', tipoDestino: 'Guia' }])
})

test('calcularNovosPares: não deduplica contra vínculo de outro par de setores com mesmo texto', () => {
  const pares = calcularNovosPares('pessoal', ['DAS'], 'contabil', ['Guia'], catalogoExistente)
  assert.deepEqual(pares, [{ tipoOrigem: 'DAS', tipoDestino: 'Guia' }])
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test`
Expected: FAIL — `agregarStatusVinculo`, `formatarBadgeVinculo` e `calcularNovosPares` não existem em `lib/vinculos.ts` (erro de import/módulo).

- [ ] **Step 3: Implementar as funções puras**

No topo de `lib/vinculos.ts`, logo após os imports existentes (linha 4), adicionar:

```ts
import type { TarefaVinculo } from './types'

export function agregarStatusVinculo(
  origens: { setorOrigemLabel: string; concluida: boolean }[],
): VinculoStatus {
  const total = origens.length
  const concluidos = origens.filter(o => o.concluida).length
  return {
    setorOrigemLabel: origens[0]?.setorOrigemLabel ?? '',
    liberada: total > 0 && concluidos === total,
    concluidos,
    total,
  }
}

export function formatarBadgeVinculo(
  status: { liberada: boolean; concluidos: number; total: number; setorOrigemLabel: string },
): { texto: string; classe: string } {
  const classe = status.liberada
    ? 'bg-green-500/15 text-green-400'
    : 'bg-orange-500/15 text-orange-400'
  if (status.total <= 1) {
    return {
      classe,
      texto: status.liberada
        ? `✓ Liberada por ${status.setorOrigemLabel}`
        : `⏳ Aguardando ${status.setorOrigemLabel}`,
    }
  }
  return {
    classe,
    texto: status.liberada
      ? `✓ Liberada (${status.concluidos}/${status.total})`
      : `⏳ Aguardando (${status.concluidos}/${status.total} concluídas)`,
  }
}

export function calcularNovosPares(
  setorOrigem: UserSetor,
  tiposOrigem: string[],
  setorDestino: UserSetor,
  tiposDestino: string[],
  vinculosExistentes: TarefaVinculo[],
): { tipoOrigem: string; tipoDestino: string }[] {
  const existentesSet = new Set(
    vinculosExistentes
      .filter(v => v.setor_origem === setorOrigem && v.setor_destino === setorDestino)
      .map(v => `${v.tipo_origem}||${v.tipo_destino}`),
  )
  const pares: { tipoOrigem: string; tipoDestino: string }[] = []
  for (const o of tiposOrigem) {
    for (const d of tiposDestino) {
      const key = `${o}||${d}`
      if (!existentesSet.has(key)) pares.push({ tipoOrigem: o, tipoDestino: d })
    }
  }
  return pares
}
```

Atualizar a interface `VinculoStatus` existente (linhas 6-9) para incluir os dois campos novos:

```ts
export interface VinculoStatus {
  setorOrigemLabel: string
  liberada: boolean
  concluidos: number
  total: number
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS — todos os testes de `tests/vinculos.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/vinculos.ts tests/vinculos.test.ts
git commit -m "feat: funções puras de agregação e formatação de vínculos"
```

---

### Task 2: Reescrever `buscarVinculosDoCliente` e `buscarPendenciasVinculoPorCliente` para usar a agregação

**Files:**
- Modify: `lib/vinculos.ts:15-119` (as duas funções que consultam o Supabase)

**Interfaces:**
- Consumes: `agregarStatusVinculo` (Task 1).
- Produces: `buscarVinculosDoCliente` continua devolvendo `Record<string, VinculoStatus>` (mesma assinatura pública, campos novos em `VinculoStatus`); `PendenciaVinculo` perde o campo `tipoOrigem` e ganha `concluidos`/`total` (mesma forma de `VinculoStatus` + `tipoDestino`); `buscarPendenciasVinculoPorCliente` continua devolvendo `Record<string, PendenciaVinculo[]>`, mas agora com **no máximo 1 entrada por `tipoDestino`** por cliente (antes podia ter 1 por vínculo).

Não há testes automatizados desta task — nenhuma outra função do repo que consulta Supabase é unit-testada (verificado: `lib/parcelamentos-aviso.ts` e `lib/tarefas-paginacao.ts` também não têm testes), porque não existe mock de `SupabaseClient` no projeto. A lógica que decide o resultado (agregação) já está coberta pelos testes de `agregarStatusVinculo` na Task 1; esta task só liga essa lógica às queries existentes. Validação aqui é `tsc --noEmit` + revisão manual do fluxo.

- [ ] **Step 1: Reescrever `buscarVinculosDoCliente`**

Substituir o corpo da função (linhas 15-52 do arquivo original) por:

```ts
export async function buscarVinculosDoCliente(
  supabase: SupabaseClient,
  clienteId: string,
  vinculosAtivos: string[],
  setorAtual: UserSetor,
  mes: number,
  ano: number,
): Promise<Record<string, VinculoStatus>> {
  if (vinculosAtivos.length === 0) return {}

  const { data: vinculosRaw } = await supabase
    .from('tarefa_vinculos')
    .select('*')
    .in('id', vinculosAtivos)
    .eq('setor_destino', setorAtual)

  const vinculos = vinculosRaw ?? []
  if (vinculos.length === 0) return {}

  const grupos = new Map<string, typeof vinculos>()
  for (const v of vinculos) {
    const arr = grupos.get(v.tipo_destino as string) ?? []
    arr.push(v)
    grupos.set(v.tipo_destino as string, arr)
  }

  const resultado: Record<string, VinculoStatus> = {}
  for (const [tipoDestino, vs] of grupos) {
    const origens: { setorOrigemLabel: string; concluida: boolean }[] = []
    for (const v of vs) {
      const { data: origem } = await supabase
        .from('tarefas')
        .select('concluida')
        .eq('cliente_id', clienteId)
        .eq('setor', v.setor_origem)
        .eq('tipo', v.tipo_origem)
        .eq('mes', mes)
        .eq('ano', ano)
        .maybeSingle()

      origens.push({
        setorOrigemLabel: SETOR_LABEL[v.setor_origem as UserSetor],
        concluida: !!origem?.concluida,
      })
    }
    resultado[tipoDestino] = agregarStatusVinculo(origens)
  }
  return resultado
}
```

- [ ] **Step 2: Reescrever `PendenciaVinculo` e `buscarPendenciasVinculoPorCliente`**

Substituir a interface `PendenciaVinculo` (linhas 54-59 do arquivo original):

```ts
export interface PendenciaVinculo {
  tipoDestino: string
  setorOrigemLabel: string
  liberada: boolean
  concluidos: number
  total: number
}
```

Substituir o corpo de `buscarPendenciasVinculoPorCliente` (linhas 67-119 do arquivo original) — mantém a mesma busca em lote (evita N+1), só muda o loop final:

```ts
export async function buscarPendenciasVinculoPorCliente(
  supabase: SupabaseClient,
  clientes: { id: string; tarefas_vinculadas_ativas: string[] }[],
  tarefasDestinoDoMes: { cliente_id: string; tipo: string; concluida: boolean }[],
  setorAtual: UserSetor,
  mes: number,
  ano: number,
): Promise<Record<string, PendenciaVinculo[]>> {
  const idsVinculosAtivos = Array.from(new Set(clientes.flatMap(c => c.tarefas_vinculadas_ativas)))
  if (idsVinculosAtivos.length === 0) return {}

  const { data: vinculosRaw } = await supabase
    .from('tarefa_vinculos')
    .select('*')
    .in('id', idsVinculosAtivos)
    .eq('setor_destino', setorAtual)

  const vinculos = vinculosRaw ?? []
  if (vinculos.length === 0) return {}

  const setoresOrigem = Array.from(new Set(vinculos.map(v => v.setor_origem as UserSetor)))
  const origemConcluidaPorSetor: Record<string, Record<string, boolean>> = {}
  for (const setorOrigem of setoresOrigem) {
    const tarefasOrigem = await buscarTodasTarefasDoMes<{ cliente_id: string; tipo: string; concluida: boolean }>(
      supabase, mes, ano, 'cliente_id, tipo, concluida', setorOrigem
    )
    const mapa: Record<string, boolean> = {}
    for (const t of tarefasOrigem) mapa[`${t.cliente_id}||${t.tipo}`] = t.concluida
    origemConcluidaPorSetor[setorOrigem] = mapa
  }

  const destinoConcluida: Record<string, boolean> = {}
  for (const t of tarefasDestinoDoMes) destinoConcluida[`${t.cliente_id}||${t.tipo}`] = t.concluida

  const resultado: Record<string, PendenciaVinculo[]> = {}
  for (const c of clientes) {
    const vinculosDoCliente = vinculos.filter(v => c.tarefas_vinculadas_ativas.includes(v.id as string))
    const porDestino = new Map<string, { setorOrigemLabel: string; concluida: boolean }[]>()
    for (const v of vinculosDoCliente) {
      const destinoFeita = !!destinoConcluida[`${c.id}||${v.tipo_destino}`]
      if (destinoFeita) continue
      const origemFeita = !!origemConcluidaPorSetor[v.setor_origem as string]?.[`${c.id}||${v.tipo_origem}`]
      const arr = porDestino.get(v.tipo_destino as string) ?? []
      arr.push({ setorOrigemLabel: SETOR_LABEL[v.setor_origem as UserSetor], concluida: origemFeita })
      porDestino.set(v.tipo_destino as string, arr)
    }
    if (porDestino.size === 0) continue
    resultado[c.id] = Array.from(porDestino.entries()).map(([tipoDestino, origens]) => ({
      tipoDestino,
      ...agregarStatusVinculo(origens),
    }))
  }
  return resultado
}
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `lib/vinculos.ts`. Se algum consumidor (`ClientesLista*`) reclamar de `tipoOrigem` que não existe mais em `PendenciaVinculo`, ok por enquanto — é corrigido na Task 5.

- [ ] **Step 4: Rodar os testes**

Run: `npm test`
Expected: PASS (os testes da Task 1 continuam passando; nenhum teste novo nesta task).

- [ ] **Step 5: Commit**

```bash
git add lib/vinculos.ts
git commit -m "fix: buscarVinculosDoCliente/buscarPendenciasVinculoPorCliente agregam múltiplas origens por destino"
```

---

### Task 3: Server action `criarVinculos` (plural, produto cartesiano)

**Files:**
- Modify: `app/(comum)/vinculos/actions.ts:37-56`

**Interfaces:**
- Consumes: nenhuma função nova das tasks anteriores (usa direto o Supabase client de `exigirAcessoAdmin()`).
- Produces: `criarVinculos(input: { setorOrigem: UserSetor; setorDestino: UserSetor; pares: { tipoOrigem: string; tipoDestino: string }[] }): Promise<{ error?: string }>` — usada pela Task 4.

- [ ] **Step 1: Substituir `criarVinculo` por `criarVinculos`**

Em `app/(comum)/vinculos/actions.ts`, substituir a função `criarVinculo` (linhas 37-56) por:

```ts
export async function criarVinculos(input: {
  setorOrigem: UserSetor
  setorDestino: UserSetor
  pares: { tipoOrigem: string; tipoDestino: string }[]
}): Promise<{ error?: string }> {
  const supabase = await exigirAcessoAdmin()
  if (!supabase) return { error: ERRO_ACESSO }

  if (input.pares.length === 0) return { error: 'Nenhum par novo pra criar.' }

  const { error } = await supabase.from('tarefa_vinculos').insert(
    input.pares.map(p => ({
      setor_origem: input.setorOrigem,
      tipo_origem: p.tipoOrigem,
      setor_destino: input.setorDestino,
      tipo_destino: p.tipoDestino,
    })),
  )
  if (error) return { error: error.message }

  revalidatePath('/vinculos')
  return {}
}
```

`excluirVinculo` (linhas 58-67) não muda.

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: erro esperado em `VinculosClient.tsx` (ainda chama `criarVinculo`, que não existe mais) — corrigido na Task 4.

- [ ] **Step 3: Commit**

```bash
git add "app/(comum)/vinculos/actions.ts"
git commit -m "feat: server action criarVinculos cria vários pares origem/destino de uma vez"
```

---

### Task 4: UI de criação com multi-seleção em `VinculosClient.tsx`

**Files:**
- Modify: `app/(comum)/vinculos/VinculosClient.tsx` (reescrita quase completa do componente)

**Interfaces:**
- Consumes: `calcularNovosPares` (Task 1), `criarVinculos` (Task 3).
- Produces: nenhum consumidor externo (é a folha da árvore de componentes desta tela).

- [ ] **Step 1: Reescrever o componente**

Substituir todo o conteúdo de `app/(comum)/vinculos/VinculosClient.tsx` por:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarVinculos, excluirVinculo } from './actions'
import { calcularNovosPares } from '@/lib/vinculos'
import { SETORES, SETOR_LABEL, type UserSetor, type TarefaVinculo } from '@/lib/types'

interface Props {
  vinculosIniciais: TarefaVinculo[]
  tiposPorSetor: Record<string, string[]>
}

const selectCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"
const checkboxRowCls = "flex items-center gap-2 cursor-pointer select-none py-1"

export default function VinculosClient({ vinculosIniciais, tiposPorSetor }: Props) {
  const router = useRouter()

  const [setorOrigem, setSetorOrigem] = useState<UserSetor>('fiscal')
  const [tiposOrigem, setTiposOrigem] = useState<string[]>([])
  const [setorDestino, setSetorDestino] = useState<UserSetor>('contabil')
  const [tiposDestino, setTiposDestino] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function toggleTipo(lista: string[], setLista: (v: string[]) => void, tipo: string) {
    setLista(lista.includes(tipo) ? lista.filter(t => t !== tipo) : [...lista, tipo])
  }

  async function handleCriar() {
    if (tiposOrigem.length === 0 || tiposDestino.length === 0) return
    const pares = calcularNovosPares(setorOrigem, tiposOrigem, setorDestino, tiposDestino, vinculosIniciais)
    if (pares.length === 0) {
      setErro('Todos os vínculos selecionados já existem no catálogo.')
      return
    }
    setSaving(true)
    setErro(null)
    const { error } = await criarVinculos({ setorOrigem, setorDestino, pares })
    setSaving(false)
    if (error) { setErro(error); return }
    setTiposOrigem([])
    setTiposDestino([])
    router.refresh()
  }

  async function handleExcluir(id: string) {
    setExcluindoId(id)
    const { error } = await excluirVinculo(id)
    setExcluindoId(null)
    if (error) { setErro(error); return }
    router.refresh()
  }

  const tiposOrigemDisponiveis = tiposPorSetor[setorOrigem] ?? []
  const tiposDestinoDisponiveis = tiposPorSetor[setorDestino] ?? []

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--fg)] mb-1">Vínculos de Tarefas</h1>
      <p className="text-sm text-[var(--fg)]/40 mb-6">Quando a(s) tarefa(s) de origem são concluídas, a tarefa de destino (do mesmo cliente, outro setor) mostra um aviso de liberada. Marque mais de uma tarefa dos dois lados pra criar vários vínculos de uma vez.</p>

      <div className="rounded-2xl border border-[var(--fg)]/10 bg-[var(--fg)]/3 p-5 mb-8">
        <p className="text-xs font-bold text-[var(--fg)]/50 uppercase tracking-widest mb-4">Novo vínculo</p>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-[var(--fg)]/70 text-sm font-medium">Origem</p>
            <div>
              <label className={labelCls}>Setor</label>
              <select className={selectCls} value={setorOrigem}
                onChange={e => { setSetorOrigem(e.target.value as UserSetor); setTiposOrigem([]) }}>
                {SETORES.map(s => <option key={s} value={s} className="bg-[var(--bg-surface)]">{SETOR_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tarefas</label>
              {tiposOrigemDisponiveis.length === 0 ? (
                <p className="text-[var(--fg)]/30 text-xs">Nenhuma tarefa nesse setor.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--fg)]/10 px-3 py-2">
                  {tiposOrigemDisponiveis.map(t => (
                    <label key={t} className={checkboxRowCls}>
                      <input type="checkbox" checked={tiposOrigem.includes(t)}
                        onChange={() => toggleTipo(tiposOrigem, setTiposOrigem, t)}
                        className="w-3.5 h-3.5 accent-[var(--accent)]" />
                      <span className="text-[var(--fg)]/80 text-sm">{t}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[var(--fg)]/70 text-sm font-medium">Destino</p>
            <div>
              <label className={labelCls}>Setor</label>
              <select className={selectCls} value={setorDestino}
                onChange={e => { setSetorDestino(e.target.value as UserSetor); setTiposDestino([]) }}>
                {SETORES.map(s => <option key={s} value={s} className="bg-[var(--bg-surface)]">{SETOR_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tarefas</label>
              {tiposDestinoDisponiveis.length === 0 ? (
                <p className="text-[var(--fg)]/30 text-xs">Nenhuma tarefa nesse setor.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--fg)]/10 px-3 py-2">
                  {tiposDestinoDisponiveis.map(t => (
                    <label key={t} className={checkboxRowCls}>
                      <input type="checkbox" checked={tiposDestino.includes(t)}
                        onChange={() => toggleTipo(tiposDestino, setTiposDestino, t)}
                        className="w-3.5 h-3.5 accent-[var(--accent)]" />
                      <span className="text-[var(--fg)]/80 text-sm">{t}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {erro && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <button onClick={handleCriar} disabled={saving || tiposOrigem.length === 0 || tiposDestino.length === 0}
          className="mt-4 px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
          {saving ? 'Salvando...' : `+ Criar vínculo${tiposOrigem.length * tiposDestino.length > 1 ? `s (${tiposOrigem.length * tiposDestino.length})` : ''}`}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {vinculosIniciais.length === 0 && (
          <p className="text-center text-[var(--fg)]/30 py-8 text-sm">Nenhum vínculo cadastrado ainda.</p>
        )}
        {vinculosIniciais.map(v => (
          <div key={v.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8">
            <div className="flex-1 text-sm text-[var(--fg)]">
              <span className="font-medium">{v.tipo_origem}</span>
              <span className="text-[var(--fg)]/40"> ({SETOR_LABEL[v.setor_origem]})</span>
              <span className="text-[var(--fg)]/30 mx-2">→</span>
              <span className="font-medium">{v.tipo_destino}</span>
              <span className="text-[var(--fg)]/40"> ({SETOR_LABEL[v.setor_destino]})</span>
            </div>
            <button onClick={() => handleExcluir(v.id)} disabled={excluindoId === v.id}
              className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
              {excluindoId === v.id ? 'Removendo...' : 'Excluir'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `VinculosClient.tsx` nem em `actions.ts`. Erros restantes (se houver) devem ser só nos 6 arquivos de badge da Task 5.

- [ ] **Step 3: Commit**

```bash
git add "app/(comum)/vinculos/VinculosClient.tsx"
git commit -m "feat: tela de vínculos permite marcar várias tarefas de origem e destino de uma vez"
```

---

### Task 5: Badges nos 3 checklists e nas 3 listagens usam `formatarBadgeVinculo`

**Files:**
- Modify: `components/fiscal/TarefaChecklist.tsx:308-320`
- Modify: `components/contabil/TarefaChecklistContabil.tsx:224-236`
- Modify: `components/pessoal/TarefaChecklistPessoal.tsx` (mesmo bloco, ver Step 3)
- Modify: `components/fiscal/ClientesLista.tsx:187-193`
- Modify: `components/contabil/ClientesListaContabil.tsx:137-143`
- Modify: `components/pessoal/ClientesListaPessoal.tsx:137-143`

**Interfaces:**
- Consumes: `formatarBadgeVinculo` (Task 1), `VinculoStatus`/`PendenciaVinculo` atualizados (Task 2).
- Produces: nada (são os pontos finais de renderização).

- [ ] **Step 1: `components/fiscal/TarefaChecklist.tsx`**

Adicionar o import no topo (perto da linha 5, junto do import de `VinculoStatus`):

```ts
import { formatarBadgeVinculo } from '@/lib/vinculos'
```

Substituir o bloco (linhas 310-320 do arquivo original):

```tsx
{vinculos[tipo] && (
  <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
    vinculos[tipo].liberada
      ? 'bg-green-500/15 text-green-400'
      : 'bg-orange-500/15 text-orange-400'
  }`}>
    {vinculos[tipo].liberada
      ? `✓ Liberada por ${vinculos[tipo].setorOrigemLabel}`
      : `⏳ Aguardando ${vinculos[tipo].setorOrigemLabel}`}
  </span>
)}
```

por:

```tsx
{vinculos[tipo] && (
  <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${formatarBadgeVinculo(vinculos[tipo]).classe}`}>
    {formatarBadgeVinculo(vinculos[tipo]).texto}
  </span>
)}
```

- [ ] **Step 2: `components/contabil/TarefaChecklistContabil.tsx`**

Mesma mudança de import e mesmo bloco (linhas 226-236 do arquivo original), idêntico ao Step 1.

- [ ] **Step 3: `components/pessoal/TarefaChecklistPessoal.tsx`**

Mesma mudança de import (linha 5, junto do `import type { VinculoStatus } from '@/lib/vinculos'` já existente) e mesmo bloco (linhas 230-240 do arquivo original), idêntico ao Step 1.

- [ ] **Step 4: `components/fiscal/ClientesLista.tsx`**

Adicionar o import (junto dos demais imports de `@/lib/vinculos`, se houver, ou no topo):

```ts
import { formatarBadgeVinculo } from '@/lib/vinculos'
```

Substituir o bloco (linhas 187-193 do arquivo original):

```tsx
{(pendenciasVinculo[cliente.id] ?? []).map((p, i) => (
  <span key={i} className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
    p.liberada ? 'bg-green-500/15 text-green-400' : 'bg-orange-500/15 text-orange-400'
  }`}>
    {p.liberada ? `✓ Liberada por ${p.setorOrigemLabel}` : `⏳ Aguardando ${p.setorOrigemLabel}`}
  </span>
))}
```

por:

```tsx
{(pendenciasVinculo[cliente.id] ?? []).map((p, i) => {
  const badge = formatarBadgeVinculo(p)
  return (
    <span key={i} className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.classe}`}>
      {badge.texto}
    </span>
  )
})}
```

- [ ] **Step 5: `components/contabil/ClientesListaContabil.tsx` e `components/pessoal/ClientesListaPessoal.tsx`**

Mesmo bloco (linhas 137-143 em ambos, JSX idêntico ao de `ClientesLista.tsx`) — mesma troca do Step 4.

- [ ] **Step 6: Checar tipos**

Run: `npx tsc --noEmit`
Expected: nenhum erro em nenhum dos 6 arquivos. Se `PendenciaVinculo` ainda for referenciada com `tipoOrigem` em algum desses arquivos (ex: `key={p.tipoOrigem}`), trocar a key por `tipoDestino` ou pelo índice `i` do `.map`.

- [ ] **Step 7: Rodar os testes**

Run: `npm test`
Expected: PASS (nenhum teste novo nesta task; confirma que nada quebrou).

- [ ] **Step 8: Commit**

```bash
git add components/fiscal/TarefaChecklist.tsx components/contabil/TarefaChecklistContabil.tsx components/pessoal/TarefaChecklistPessoal.tsx components/fiscal/ClientesLista.tsx components/contabil/ClientesListaContabil.tsx components/pessoal/ClientesListaPessoal.tsx
git commit -m "refactor: badges de vínculo usam formatarBadgeVinculo (suporta múltiplas origens)"
```

---

### Task 6: Verificação final

**Files:** nenhum (task de validação, sem mudança de código).

- [ ] **Step 1: Build completo**

Run: `npx tsc --noEmit && npm test`
Expected: ambos passam sem erro.

- [ ] **Step 2: Revisão manual do diff**

Run: `git diff feat/relatorios-observacao-pendencias --stat` (ou o branch base usado) — conferir que só os arquivos listados nas Tasks 1-5 mudaram, nada em `supabase/migrations/` nem em arquivos fora do escopo.

- [ ] **Step 3: Nota de verificação manual pendente**

Deixar registrado (na conversa com o usuário, não em código) que a verificação no navegador — criar um vínculo com múltiplas origens/destinos na tela `/vinculos`, ativar num cliente de teste e conferir os badges "N/M" na ficha e na listagem — não foi feita nesta sessão e fica pendente pro usuário (ou para quando ele pedir explicitamente).
