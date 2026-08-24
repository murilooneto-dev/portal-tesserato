# Preenchimento Rápido de Tarefas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma tela por setor (Fiscal/Contábil/Pessoal) que deixa marcar a mesma tarefa tipo DATA como concluída (com a data de hoje) para vários clientes de uma vez, filtrando por Grupo/Regime/Atividade.

**Architecture:** Um componente client compartilhado (`components/PreenchimentoRapido.tsx`) recebe dados já carregados por três server components (um por setor, em `app/<setor>/preenchimento-rapido/page.tsx`) e usa funções puras de `lib/preenchimento-rapido.ts` pra filtrar clientes/tarefas. Cada clique de checkbox chama a mesma server action que a ficha do cliente já usa hoje pra marcar tarefas (`toggleTarefaFiscal`/`toggleTarefaContabil`/`toggleTarefaPessoal`) — a do Fiscal precisa ser extraída de dentro de um closure pra virar reutilizável, as de Contábil/Pessoal já são funções exportadas independentes.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase, TypeScript, `node:test` para testes de unidade em `lib/`.

## Global Constraints

- Sem migration nova — reaproveita `grupos`/`regimes`/`atividades`, `tarefa_tipos`, `tarefa_tipo_vinculos`, `tarefas` que já existem.
- Só tarefas com `tipo_resposta = 'data'` **e sem etapas nomeadas** (`tarefa_tipos.etapas` vazio/null) entram no filtro de tarefas — é o mesmo critério que `TarefaChecklist.tsx:314` usa pra decidir se uma tarefa é um checkbox simples (ver `components/fiscal/TarefaChecklist.tsx:283-314`).
- Grupo só existe no cadastro de cliente do Fiscal (`ClienteFiscal.grupo`) — Contábil e Pessoal só têm `regime`/`atividade` (ver `lib/types.ts:111-131`).
- A tela nova sempre grava a data de hoje (sem input de data manual) — a ficha do cliente continua com o input de data manual intacto, sem nenhuma mudança de comportamento lá.
- Permissão: admin vê/edita todos os clientes do setor; não-admin só vê/edita os clientes onde é `responsavel` (mesma regra já usada em `app/fiscal/tarefas/page.tsx:49-53` e nas funções `podeEditarCliente*`).
- Mês/ano: sempre o corrente do sistema (`getMesAno()`), sem seletor próprio na tela nova.
- Branch de trabalho: `feat/preenchimento-rapido-tarefas` (já criada, baseada em `origin/dev`, com o spec já commitado). Não fazer merge — só abrir PR contra `dev` no final (ver `feedback_never_merge_prs`, `feedback_prs_target_dev_branch`).

---

### Task 1: Funções puras de filtro (`lib/preenchimento-rapido.ts`)

**Files:**
- Create: `lib/preenchimento-rapido.ts`
- Test: `tests/preenchimento-rapido.test.ts`

**Interfaces:**
- Consumes: `MapaVinculosSetor` de `lib/tarefas-esperadas.ts` (já existe — tem `porGrupo`, `porRegime`, `porAtividade`, cada um `Record<string, string[]>` mapeando nome da entidade → nomes de tarefa).
- Produces (usado pelas Tasks 4-7):
  - `type CampoFiltro = 'grupo' | 'regime' | 'atividade'`
  - `interface ClienteFiltro { id: string; nome: string; grupo?: string | null; regime?: string | null; atividade?: string | null }`
  - `interface TarefaTipoRaw { nome: string; tipo_resposta: string; etapas: string[] | null }`
  - `function nomesTarefaTipoData(tipos: TarefaTipoRaw[]): string[]`
  - `function valoresDistintos(clientes: ClienteFiltro[], campo: CampoFiltro): string[]`
  - `function clientesPorValor(clientes: ClienteFiltro[], campo: CampoFiltro, valor: string): ClienteFiltro[]`
  - `function tarefasTipoDataVinculadas(mapa: MapaVinculosSetor, campo: CampoFiltro, valor: string, tiposData: Set<string>): string[]`

- [ ] **Step 1: Escrever os testes (vão falhar — módulo ainda não existe)**

Criar `tests/preenchimento-rapido.test.ts`:

```ts
// tests/preenchimento-rapido.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nomesTarefaTipoData,
  valoresDistintos,
  clientesPorValor,
  tarefasTipoDataVinculadas,
} from '../lib/preenchimento-rapido'
import type { MapaVinculosSetor } from '../lib/tarefas-esperadas'

test('nomesTarefaTipoData: mantém só tipo_resposta=data sem etapas', () => {
  const nomes = nomesTarefaTipoData([
    { nome: 'DAS', tipo_resposta: 'data', etapas: null },
    { nome: 'RELATORIO', tipo_resposta: 'texto', etapas: null },
    { nome: 'FECHAMENTO', tipo_resposta: 'data', etapas: ['Conferência', 'Envio'] },
    { nome: 'ISS', tipo_resposta: 'data', etapas: [] },
  ])
  assert.deepEqual(nomes, ['DAS', 'ISS'])
})

test('nomesTarefaTipoData: lista vazia devolve lista vazia', () => {
  assert.deepEqual(nomesTarefaTipoData([]), [])
})

test('valoresDistintos: extrai valores únicos e ordena', () => {
  const valores = valoresDistintos(
    [
      { id: '1', nome: 'A', regime: 'Simples Nacional' },
      { id: '2', nome: 'B', regime: 'Lucro Presumido' },
      { id: '3', nome: 'C', regime: 'Simples Nacional' },
      { id: '4', nome: 'D', regime: null },
    ],
    'regime',
  )
  assert.deepEqual(valores, ['Lucro Presumido', 'Simples Nacional'])
})

test('valoresDistintos: campo ausente (ex: grupo em Contábil) não quebra', () => {
  const valores = valoresDistintos(
    [{ id: '1', nome: 'A', regime: 'Simples Nacional' }],
    'grupo',
  )
  assert.deepEqual(valores, [])
})

test('clientesPorValor: filtra só quem tem exatamente aquele valor', () => {
  const clientes = [
    { id: '1', nome: 'A', regime: 'Simples Nacional' },
    { id: '2', nome: 'B', regime: 'Lucro Presumido' },
    { id: '3', nome: 'C', regime: 'Simples Nacional' },
  ]
  const filtrados = clientesPorValor(clientes, 'regime', 'Simples Nacional')
  assert.deepEqual(filtrados.map(c => c.id), ['1', '3'])
})

test('tarefasTipoDataVinculadas: cruza vínculo do valor com o conjunto de tipos DATA', () => {
  const mapa: MapaVinculosSetor = {
    porGrupo: {},
    porRegime: { 'Simples Nacional': ['DAS', 'FECHAMENTO SIMPLES', 'RELATORIO'] },
    porAtividade: {},
  }
  const tarefas = tarefasTipoDataVinculadas(
    mapa, 'regime', 'Simples Nacional', new Set(['DAS', 'FECHAMENTO SIMPLES']),
  )
  assert.deepEqual(tarefas, ['DAS', 'FECHAMENTO SIMPLES'])
})

test('tarefasTipoDataVinculadas: valor sem vínculo cadastrado devolve lista vazia', () => {
  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: {} }
  const tarefas = tarefasTipoDataVinculadas(mapa, 'regime', 'Inexistente', new Set(['DAS']))
  assert.deepEqual(tarefas, [])
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test -- tests/preenchimento-rapido.test.ts` (ou `node --import tsx --test tests/preenchimento-rapido.test.ts`)
Expected: FAIL — `Cannot find module '../lib/preenchimento-rapido'`

- [ ] **Step 3: Implementar `lib/preenchimento-rapido.ts`**

```ts
// lib/preenchimento-rapido.ts
import type { MapaVinculosSetor } from './tarefas-esperadas'

export type CampoFiltro = 'grupo' | 'regime' | 'atividade'

export interface ClienteFiltro {
  id: string
  nome: string
  grupo?: string | null
  regime?: string | null
  atividade?: string | null
}

export interface TarefaTipoRaw {
  nome: string
  tipo_resposta: string
  etapas: string[] | null
}

// Só tarefas tipo_resposta='data' sem etapas nomeadas viram um checkbox de
// um clique só na grade de preenchimento em lote — mesmo critério que
// TarefaChecklist.tsx usa pra decidir entre checkbox simples e etapas
// (tarefa com etapas continua só editável na ficha do cliente).
export function nomesTarefaTipoData(tipos: TarefaTipoRaw[]): string[] {
  return tipos
    .filter(t => t.tipo_resposta === 'data' && (!t.etapas || t.etapas.length === 0))
    .map(t => t.nome)
}

export function valoresDistintos(clientes: ClienteFiltro[], campo: CampoFiltro): string[] {
  const valores = new Set<string>()
  for (const c of clientes) {
    const v = c[campo]
    if (v) valores.add(v)
  }
  return Array.from(valores).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function clientesPorValor(
  clientes: ClienteFiltro[],
  campo: CampoFiltro,
  valor: string,
): ClienteFiltro[] {
  return clientes.filter(c => c[campo] === valor)
}

const CHAVE_MAPA: Record<CampoFiltro, keyof MapaVinculosSetor> = {
  grupo: 'porGrupo',
  regime: 'porRegime',
  atividade: 'porAtividade',
}

export function tarefasTipoDataVinculadas(
  mapa: MapaVinculosSetor,
  campo: CampoFiltro,
  valor: string,
  tiposData: Set<string>,
): string[] {
  const nomes = mapa[CHAVE_MAPA[campo]][valor] ?? []
  const filtradas = new Set(nomes.filter(n => tiposData.has(n)))
  return Array.from(filtradas).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `npm test -- tests/preenchimento-rapido.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/preenchimento-rapido.ts tests/preenchimento-rapido.test.ts
git commit -m "feat: funções puras de filtro do preenchimento rápido de tarefas"
```

---

### Task 2: Extrair `toggleTarefaFiscal` do closure da ficha do cliente

Hoje `toggleTarefa` (o handler do checkbox tipo DATA na ficha do cliente Fiscal) é uma
função `'use server'` **inline**, fechada sobre `id`/`mes`/`ano` da página — só funciona
para aquela ficha. Contábil e Pessoal já não têm esse problema (`toggleTarefaContabil` e
`toggleTarefaPessoal`, em `app/contabil/clientes/actions.ts` e
`app/pessoal/clientes/actions.ts`, já são funções exportadas e parametrizadas). Esta task
alinha o Fiscal ao mesmo padrão, sem mudar nenhum comportamento observável na ficha.

**Files:**
- Modify: `app/fiscal/clientes/actions.ts`
- Modify: `app/fiscal/clientes/[id]/page.tsx:140-168`

**Interfaces:**
- Produces (usado pela Task 5): `toggleTarefaFiscal(clienteId: string, tipo: string, mes: number, ano: number, concluida: boolean, data?: string): Promise<void>`, exportada de `app/fiscal/clientes/actions.ts`.

- [ ] **Step 1: Adicionar `toggleTarefaFiscal` em `app/fiscal/clientes/actions.ts`**

No topo do arquivo, trocar o import de `parcelamento-tarefas`:

```ts
import { gravarDataParcelamento, isoParaDdMm } from '@/lib/parcelamento-tarefas'
```

(era `import { gravarDataParcelamento } from '@/lib/parcelamento-tarefas'`)

Adicionar a função (pode ficar logo depois de `salvarObs`, antes da constante `TIPOS_PERMITIDOS`):

```ts
export async function toggleTarefaFiscal(
  clienteId: string,
  tipo: string,
  mes: number,
  ano: number,
  concluida: boolean,
  data?: string,
) {
  if (!(await podeEditarCliente(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const concluida_em = concluida
    ? (data ? new Date(data + 'T12:00:00').toISOString() : new Date().toISOString())
    : null

  const { data: existing } = await supabase
    .from('tarefas').select('id, parcelamento_id')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'fiscal')
    .maybeSingle()

  if (existing?.id) {
    await supabase.from('tarefas')
      .update({ concluida, concluida_em })
      .eq('id', existing.id)
  } else {
    await supabase.from('tarefas')
      .insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'fiscal', concluida, concluida_em })
  }

  if (existing?.parcelamento_id) {
    await gravarDataParcelamento(supabase, existing.parcelamento_id, mes, concluida && data ? isoParaDdMm(data) : null)
  }

  revalidatePath(`/fiscal/clientes/${clienteId}`)
  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/dashboard')
  revalidatePath('/fiscal/relatorios')
  revalidatePath('/fiscal/tarefas')
  revalidatePath('/fiscal/preenchimento-rapido')
}
```

- [ ] **Step 2: Trocar o closure em `app/fiscal/clientes/[id]/page.tsx` por um wrapper fino**

Em `app/fiscal/clientes/[id]/page.tsx:14`, adicionar `toggleTarefaFiscal` ao import existente:

```ts
import { atualizarEtapa, salvarRespostaTexto, uploadArquivoTarefa, excluirArquivoTarefa, toggleTarefaFiscal } from '../actions'
```

Substituir o corpo de `toggleTarefa` (linhas 140-168) por:

```ts
  async function toggleTarefa(tipo: string, concluida: boolean, data?: string) {
    'use server'
    await toggleTarefaFiscal(id, tipo, mes, ano, concluida, data)
  }
```

(remove a lógica duplicada de `concluida_em`/`existing`/`gravarDataParcelamento`/`revalidatePath` que agora mora em `toggleTarefaFiscal`.)

- [ ] **Step 3: Checar tipos e build**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos.

Run: `npm run build`
Expected: build limpo, mesmas 38+ rotas de antes.

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/clientes/actions.ts "app/fiscal/clientes/[id]/page.tsx"
git commit -m "refactor: extrai toggleTarefaFiscal do closure da ficha do cliente"
```

---

### Task 3: Registrar a rota nova no `revalidatePath` de Contábil/Pessoal

**Files:**
- Modify: `app/contabil/clientes/actions.ts:35-36`
- Modify: `app/pessoal/clientes/actions.ts:40-41`

**Interfaces:**
- Consumes: `toggleTarefaContabil`/`toggleTarefaPessoal` já existentes (assinatura inalterada).

- [ ] **Step 1: Adicionar o revalidatePath em `toggleTarefaContabil`**

Em `app/contabil/clientes/actions.ts`, dentro de `toggleTarefaContabil`, depois de:

```ts
  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
```

adicionar:

```ts
  revalidatePath('/contabil/preenchimento-rapido')
```

- [ ] **Step 2: Adicionar o revalidatePath em `toggleTarefaPessoal`**

Em `app/pessoal/clientes/actions.ts`, dentro de `toggleTarefaPessoal`, depois de:

```ts
  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
```

adicionar:

```ts
  revalidatePath('/pessoal/preenchimento-rapido')
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add app/contabil/clientes/actions.ts app/pessoal/clientes/actions.ts
git commit -m "chore: revalida rota de preenchimento rápido ao marcar tarefa em Contábil/Pessoal"
```

---

### Task 4: Componente compartilhado `components/PreenchimentoRapido.tsx`

**Files:**
- Create: `components/PreenchimentoRapido.tsx`

**Interfaces:**
- Consumes: `CampoFiltro`, `ClienteFiltro`, `valoresDistintos`, `clientesPorValor`, `tarefasTipoDataVinculadas` de `lib/preenchimento-rapido.ts` (Task 1); `MapaVinculosSetor` de `lib/tarefas-esperadas.ts`.
- Produces (usado pelas Tasks 5-7): componente React
  ```ts
  interface PreenchimentoRapidoProps {
    camposDisponiveis: CampoFiltro[]
    clientes: ClienteFiltro[]
    mapaVinculos: MapaVinculosSetor
    tiposData: string[]
    estadoInicial: Record<string, Record<string, boolean>>
    onToggle: (clienteId: string, tipo: string, concluida: boolean) => Promise<void>
  }
  ```

- [ ] **Step 1: Criar o componente**

```tsx
// components/PreenchimentoRapido.tsx
'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  type CampoFiltro,
  type ClienteFiltro,
  valoresDistintos,
  clientesPorValor,
  tarefasTipoDataVinculadas,
} from '@/lib/preenchimento-rapido'
import type { MapaVinculosSetor } from '@/lib/tarefas-esperadas'

const LABEL_CAMPO: Record<CampoFiltro, string> = {
  grupo: 'Grupo',
  regime: 'Regime',
  atividade: 'Atividade',
}

interface Props {
  camposDisponiveis: CampoFiltro[]
  clientes: ClienteFiltro[]
  mapaVinculos: MapaVinculosSetor
  tiposData: string[]
  estadoInicial: Record<string, Record<string, boolean>>
  onToggle: (clienteId: string, tipo: string, concluida: boolean) => Promise<void>
}

export default function PreenchimentoRapido({
  camposDisponiveis,
  clientes,
  mapaVinculos,
  tiposData,
  estadoInicial,
  onToggle,
}: Props) {
  const [campo, setCampo] = useState<CampoFiltro | null>(null)
  const [valor, setValor] = useState<string | null>(null)
  const [tarefasSelecionadas, setTarefasSelecionadas] = useState<Set<string>>(new Set())
  const [estado, setEstado] = useState(estadoInicial)
  const [, startTransition] = useTransition()

  const tiposDataSet = useMemo(() => new Set(tiposData), [tiposData])

  const valores = useMemo(
    () => (campo ? valoresDistintos(clientes, campo) : []),
    [clientes, campo],
  )

  const tarefasDisponiveis = useMemo(
    () => (campo && valor ? tarefasTipoDataVinculadas(mapaVinculos, campo, valor, tiposDataSet) : []),
    [mapaVinculos, campo, valor, tiposDataSet],
  )

  const clientesFiltrados = useMemo(
    () => (campo && valor ? clientesPorValor(clientes, campo, valor) : []),
    [clientes, campo, valor],
  )

  function handleCampoChange(novoCampo: CampoFiltro) {
    setCampo(novoCampo)
    setValor(null)
    setTarefasSelecionadas(new Set())
  }

  function handleValorChange(novoValor: string) {
    setValor(novoValor)
    setTarefasSelecionadas(new Set())
  }

  function toggleTarefaSelecionada(tipo: string) {
    setTarefasSelecionadas(prev => {
      const next = new Set(prev)
      if (next.has(tipo)) next.delete(tipo)
      else next.add(tipo)
      return next
    })
  }

  function handleCheckbox(clienteId: string, tipo: string) {
    const concluidaAtual = estado[clienteId]?.[tipo] ?? false
    const novaConcluida = !concluidaAtual
    setEstado(prev => ({
      ...prev,
      [clienteId]: { ...prev[clienteId], [tipo]: novaConcluida },
    }))
    startTransition(() => {
      onToggle(clienteId, tipo, novaConcluida)
    })
  }

  const colunas = Array.from(tarefasSelecionadas).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-xs text-[var(--fg)]/40 mb-1">Filtrar por</label>
          <select
            value={campo ?? ''}
            onChange={e => handleCampoChange(e.target.value as CampoFiltro)}
            className="bg-[var(--fg)]/5 border border-[var(--fg)]/10 rounded-lg px-3 py-2 text-sm text-[var(--fg)]"
          >
            <option value="" disabled>Selecione...</option>
            {camposDisponiveis.map(c => (
              <option key={c} value={c}>{LABEL_CAMPO[c]}</option>
            ))}
          </select>
        </div>

        {campo && (
          <div>
            <label className="block text-xs text-[var(--fg)]/40 mb-1">{LABEL_CAMPO[campo]}</label>
            <select
              value={valor ?? ''}
              onChange={e => handleValorChange(e.target.value)}
              className="bg-[var(--fg)]/5 border border-[var(--fg)]/10 rounded-lg px-3 py-2 text-sm text-[var(--fg)]"
            >
              <option value="" disabled>Selecione...</option>
              {valores.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {campo && valor && tarefasDisponiveis.length === 0 && (
        <p className="text-sm text-[var(--fg)]/40">
          Nenhuma tarefa do tipo data vinculada a {LABEL_CAMPO[campo].toLowerCase()} &quot;{valor}&quot;.
        </p>
      )}

      {campo && valor && tarefasDisponiveis.length > 0 && (
        <div>
          <label className="block text-xs text-[var(--fg)]/40 mb-2">Tarefas</label>
          <div className="flex flex-wrap gap-2">
            {tarefasDisponiveis.map(tipo => (
              <button
                key={tipo}
                type="button"
                onClick={() => toggleTarefaSelecionada(tipo)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  tarefasSelecionadas.has(tipo)
                    ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
                    : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60'
                }`}
              >
                {tipo}
              </button>
            ))}
          </div>
        </div>
      )}

      {colunas.length > 0 && (
        clientesFiltrados.length === 0 ? (
          <p className="text-sm text-[var(--fg)]/40">Nenhum cliente encontrado para esse filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--fg)]/10">
                  <th className="text-left py-2 px-3 text-[var(--fg)]/40 font-medium">Empresa</th>
                  {colunas.map(tipo => (
                    <th key={tipo} className="text-center py-2 px-3 text-[var(--fg)]/40 font-medium whitespace-nowrap">
                      {tipo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(cliente => (
                  <tr key={cliente.id} className="border-b border-[var(--fg)]/5">
                    <td className="py-2 px-3 text-[var(--fg)]">{cliente.nome}</td>
                    {colunas.map(tipo => (
                      <td key={tipo} className="text-center py-2 px-3">
                        <input
                          type="checkbox"
                          checked={estado[cliente.id]?.[tipo] ?? false}
                          onChange={() => handleCheckbox(cliente.id, tipo)}
                          className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/PreenchimentoRapido.tsx
git commit -m "feat: componente compartilhado da grade de preenchimento rápido"
```

---

### Task 5: Página `/fiscal/preenchimento-rapido`

**Files:**
- Create: `app/fiscal/preenchimento-rapido/page.tsx`

**Interfaces:**
- Consumes: `toggleTarefaFiscal` (Task 2), `PreenchimentoRapido` (Task 4), `nomesTarefaTipoData` (Task 1), `buscarMapaVinculosSetor` de `lib/tarefas-esperadas.ts`, `buscarTodasTarefasDoMes` de `lib/tarefas-paginacao.ts`, `getMesAno` de `lib/mes-atual-server.ts`.

- [ ] **Step 1: Criar a página**

```tsx
// app/fiscal/preenchimento-rapido/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarMapaVinculosSetor } from '@/lib/tarefas-esperadas'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { nomesTarefaTipoData, type ClienteFiltro } from '@/lib/preenchimento-rapido'
import { toggleTarefaFiscal } from '@/app/fiscal/clientes/actions'
import PreenchimentoRapido from '@/components/PreenchimentoRapido'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Preenchimento Rápido — Tesserato Fiscal' }

interface ClienteRow {
  id: string
  nome: string
  clientes_fiscal: {
    grupo: string | null
    regime: string | null
    atividade: string | null
    responsavel: string | null
  }
}

export default async function PreenchimentoRapidoFiscalPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, nome').eq('id', user.id).single()

  const [{ data: clientesRaw }, mapaVinculos, { data: tiposRaw }, tarefas] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nome, clientes_fiscal!inner(grupo, regime, atividade, responsavel, ativo)')
      .eq('clientes_fiscal.ativo', true)
      .order('nome'),
    buscarMapaVinculosSetor(supabase, 'fiscal'),
    supabase.from('tarefa_tipos').select('nome, tipo_resposta, etapas').eq('setor', 'fiscal'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'tipo' | 'concluida'>>(
      supabase, mes, ano, 'cliente_id, tipo, concluida', 'fiscal',
    ),
  ])

  const clientesTodos: (ClienteFiltro & { responsavel: string | null })[] = (clientesRaw ?? []).map(row => {
    const r = row as unknown as ClienteRow
    return {
      id: r.id,
      nome: r.nome,
      grupo: r.clientes_fiscal.grupo,
      regime: r.clientes_fiscal.regime,
      atividade: r.clientes_fiscal.atividade,
      responsavel: r.clientes_fiscal.responsavel,
    }
  })

  const clientes = profile?.role === 'admin'
    ? clientesTodos
    : clientesTodos.filter(c => c.responsavel?.toUpperCase() === profile?.nome?.toUpperCase())

  const tiposData = nomesTarefaTipoData(tiposRaw ?? [])

  const estadoInicial: Record<string, Record<string, boolean>> = {}
  for (const t of tarefas) {
    if (!estadoInicial[t.cliente_id]) estadoInicial[t.cliente_id] = {}
    estadoInicial[t.cliente_id][t.tipo] = t.concluida
  }

  async function onToggle(clienteId: string, tipo: string, concluida: boolean) {
    'use server'
    await toggleTarefaFiscal(clienteId, tipo, mes, ano, concluida)
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Preenchimento Rápido</h1>
        <p className="text-[var(--fg)]/40 mt-1 text-sm">
          Marque a mesma tarefa pra vários clientes de uma vez.
        </p>
      </div>
      <PreenchimentoRapido
        camposDisponiveis={['grupo', 'regime', 'atividade']}
        clientes={clientes}
        mapaVinculos={mapaVinculos}
        tiposData={tiposData}
        estadoInicial={estadoInicial}
        onToggle={onToggle}
      />
    </div>
  )
}
```

- [ ] **Step 2: Checar tipos e build**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo, com a rota nova `/fiscal/preenchimento-rapido` listada.

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/preenchimento-rapido/page.tsx
git commit -m "feat: página de preenchimento rápido do Fiscal"
```

---

### Task 6: Página `/contabil/preenchimento-rapido`

**Files:**
- Create: `app/contabil/preenchimento-rapido/page.tsx`

**Interfaces:**
- Consumes: `toggleTarefaContabil` de `@/app/contabil/clientes/actions` (já existe), `PreenchimentoRapido` (Task 4), `nomesTarefaTipoData` (Task 1).

- [ ] **Step 1: Criar a página**

```tsx
// app/contabil/preenchimento-rapido/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarMapaVinculosSetor } from '@/lib/tarefas-esperadas'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { nomesTarefaTipoData, type ClienteFiltro } from '@/lib/preenchimento-rapido'
import { toggleTarefaContabil } from '@/app/contabil/clientes/actions'
import PreenchimentoRapido from '@/components/PreenchimentoRapido'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Preenchimento Rápido — Tesserato Contábil' }

interface ClienteRow {
  id: string
  nome: string
  clientes_contabil: {
    regime: string | null
    atividade: string | null
    responsavel: string | null
  }
}

export default async function PreenchimentoRapidoContabilPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, nome').eq('id', user.id).single()

  const [{ data: clientesRaw }, mapaVinculos, { data: tiposRaw }, tarefas] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nome, clientes_contabil!inner(regime, atividade, responsavel, ativo)')
      .eq('clientes_contabil.ativo', true)
      .order('nome'),
    buscarMapaVinculosSetor(supabase, 'contabil'),
    supabase.from('tarefa_tipos').select('nome, tipo_resposta, etapas').eq('setor', 'contabil'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'tipo' | 'concluida'>>(
      supabase, mes, ano, 'cliente_id, tipo, concluida', 'contabil',
    ),
  ])

  const clientesTodos: (ClienteFiltro & { responsavel: string | null })[] = (clientesRaw ?? []).map(row => {
    const r = row as unknown as ClienteRow
    return {
      id: r.id,
      nome: r.nome,
      regime: r.clientes_contabil.regime,
      atividade: r.clientes_contabil.atividade,
      responsavel: r.clientes_contabil.responsavel,
    }
  })

  const clientes = profile?.role === 'admin'
    ? clientesTodos
    : clientesTodos.filter(c => c.responsavel?.toUpperCase() === profile?.nome?.toUpperCase())

  const tiposData = nomesTarefaTipoData(tiposRaw ?? [])

  const estadoInicial: Record<string, Record<string, boolean>> = {}
  for (const t of tarefas) {
    if (!estadoInicial[t.cliente_id]) estadoInicial[t.cliente_id] = {}
    estadoInicial[t.cliente_id][t.tipo] = t.concluida
  }

  async function onToggle(clienteId: string, tipo: string, concluida: boolean) {
    'use server'
    await toggleTarefaContabil(clienteId, tipo, mes, ano, concluida)
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Preenchimento Rápido</h1>
        <p className="text-[var(--fg)]/40 mt-1 text-sm">
          Marque a mesma tarefa pra vários clientes de uma vez.
        </p>
      </div>
      <PreenchimentoRapido
        camposDisponiveis={['regime', 'atividade']}
        clientes={clientes}
        mapaVinculos={mapaVinculos}
        tiposData={tiposData}
        estadoInicial={estadoInicial}
        onToggle={onToggle}
      />
    </div>
  )
}
```

- [ ] **Step 2: Checar tipos e build**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo, com a rota nova `/contabil/preenchimento-rapido` listada.

- [ ] **Step 3: Commit**

```bash
git add app/contabil/preenchimento-rapido/page.tsx
git commit -m "feat: página de preenchimento rápido do Contábil"
```

---

### Task 7: Página `/pessoal/preenchimento-rapido`

**Files:**
- Create: `app/pessoal/preenchimento-rapido/page.tsx`

**Interfaces:**
- Consumes: `toggleTarefaPessoal` de `@/app/pessoal/clientes/actions` (já existe), `PreenchimentoRapido` (Task 4), `nomesTarefaTipoData` (Task 1).

- [ ] **Step 1: Criar a página**

```tsx
// app/pessoal/preenchimento-rapido/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { buscarMapaVinculosSetor } from '@/lib/tarefas-esperadas'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { nomesTarefaTipoData, type ClienteFiltro } from '@/lib/preenchimento-rapido'
import { toggleTarefaPessoal } from '@/app/pessoal/clientes/actions'
import PreenchimentoRapido from '@/components/PreenchimentoRapido'
import type { Tarefa } from '@/lib/types'

export const metadata = { title: 'Preenchimento Rápido — Tesserato Pessoal' }

interface ClienteRow {
  id: string
  nome: string
  clientes_pessoal: {
    regime: string | null
    atividade: string | null
    responsavel: string | null
  }
}

export default async function PreenchimentoRapidoPessoalPage() {
  const supabase = await createClient()
  const { mes, ano } = await getMesAno()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, nome').eq('id', user.id).single()

  const [{ data: clientesRaw }, mapaVinculos, { data: tiposRaw }, tarefas] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nome, clientes_pessoal!inner(regime, atividade, responsavel, ativo)')
      .eq('clientes_pessoal.ativo', true)
      .order('nome'),
    buscarMapaVinculosSetor(supabase, 'pessoal'),
    supabase.from('tarefa_tipos').select('nome, tipo_resposta, etapas').eq('setor', 'pessoal'),
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'tipo' | 'concluida'>>(
      supabase, mes, ano, 'cliente_id, tipo, concluida', 'pessoal',
    ),
  ])

  const clientesTodos: (ClienteFiltro & { responsavel: string | null })[] = (clientesRaw ?? []).map(row => {
    const r = row as unknown as ClienteRow
    return {
      id: r.id,
      nome: r.nome,
      regime: r.clientes_pessoal.regime,
      atividade: r.clientes_pessoal.atividade,
      responsavel: r.clientes_pessoal.responsavel,
    }
  })

  const clientes = profile?.role === 'admin'
    ? clientesTodos
    : clientesTodos.filter(c => c.responsavel?.toUpperCase() === profile?.nome?.toUpperCase())

  const tiposData = nomesTarefaTipoData(tiposRaw ?? [])

  const estadoInicial: Record<string, Record<string, boolean>> = {}
  for (const t of tarefas) {
    if (!estadoInicial[t.cliente_id]) estadoInicial[t.cliente_id] = {}
    estadoInicial[t.cliente_id][t.tipo] = t.concluida
  }

  async function onToggle(clienteId: string, tipo: string, concluida: boolean) {
    'use server'
    await toggleTarefaPessoal(clienteId, tipo, mes, ano, concluida)
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Preenchimento Rápido</h1>
        <p className="text-[var(--fg)]/40 mt-1 text-sm">
          Marque a mesma tarefa pra vários clientes de uma vez.
        </p>
      </div>
      <PreenchimentoRapido
        camposDisponiveis={['regime', 'atividade']}
        clientes={clientes}
        mapaVinculos={mapaVinculos}
        tiposData={tiposData}
        estadoInicial={estadoInicial}
        onToggle={onToggle}
      />
    </div>
  )
}
```

- [ ] **Step 2: Checar tipos e build**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo, com a rota nova `/pessoal/preenchimento-rapido` listada.

- [ ] **Step 3: Commit**

```bash
git add app/pessoal/preenchimento-rapido/page.tsx
git commit -m "feat: página de preenchimento rápido do Pessoal"
```

---

### Task 8: Menu e permissão de página

`lib/paginas-setor.ts` é a fonte única usada tanto pelo menu lateral
(`components/fiscal/Sidebar.tsx`) quanto pelo controle de acesso por página
(`proxy.ts` → `lib/route-permissions.ts`). Adicionar a página nova aqui já resolve as
duas coisas: ela aparece no menu de cada setor **e** passa a existir na tela de permissões
do admin (`/fiscal/parametros`), exigindo liberação explícita por usuário não-admin — igual
`clientes`/`relatorios`/`dashboard` hoje.

**Files:**
- Modify: `lib/paginas-setor.ts`
- Modify: `components/fiscal/Sidebar.tsx`

- [ ] **Step 1: Registrar a página nos 3 setores**

Em `lib/paginas-setor.ts`, adicionar `{ slug: 'preenchimento-rapido', label: 'Preenchimento Rápido' }` ao final de cada array `fiscal`, `contabil` e `pessoal`:

```ts
export const PAGINAS_POR_SETOR: Record<UserSetor, PaginaSetor[]> = {
  fiscal: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'parcelamentos', label: 'Parcelamentos' },
    { slug: 'preenchimento-rapido', label: 'Preenchimento Rápido' },
  ],
  contabil: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'preenchimento-rapido', label: 'Preenchimento Rápido' },
  ],
  pessoal: [
    { slug: 'dashboard', label: 'Dashboard' },
    { slug: 'clientes', label: 'Clientes' },
    { slug: 'relatorios', label: 'Relatórios' },
    { slug: 'calendario', label: 'Calendário' },
    { slug: 'preenchimento-rapido', label: 'Preenchimento Rápido' },
  ],
  societario: [],
  financeiro: [],
}
```

- [ ] **Step 2: Adicionar o ícone no Sidebar**

Em `components/fiscal/Sidebar.tsx`, importar `ListChecks` de `lucide-react` (junto dos outros ícones já importados) e adicionar a entrada em `ICONES_PAGINA`:

```ts
import {
  Zap, LayoutGrid, Users, Calendar,
  FileText, CreditCard, Wrench, Settings, SlidersHorizontal,
  Sun, Moon, Link2, ListChecks,
  type LucideIcon,
} from 'lucide-react'
```

```ts
const ICONES_PAGINA: Record<string, LucideIcon> = {
  dashboard: LayoutGrid,
  clientes: Users,
  calendario: Calendar,
  relatorios: FileText,
  parcelamentos: CreditCard,
  'preenchimento-rapido': ListChecks,
}
```

- [ ] **Step 3: Checar tipos e build**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 4: Commit**

```bash
git add lib/paginas-setor.ts components/fiscal/Sidebar.tsx
git commit -m "feat: preenchimento rápido entra no menu e na permissão por página"
```

---

### Task 9: Verificação final da branch inteira

**Files:** nenhum (só verificação).

- [ ] **Step 1: Rodar a suíte de testes completa**

Run: `npm test`
Expected: todos os testes passam, incluindo os 7 novos de `tests/preenchimento-rapido.test.ts`.

- [ ] **Step 2: Checar tipos do projeto inteiro**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: build limpo, com as 3 rotas novas (`/fiscal/preenchimento-rapido`,
`/contabil/preenchimento-rapido`, `/pessoal/preenchimento-rapido`) listadas na saída.

- [ ] **Step 4: Diff review manual**

Rodar `git diff dev...HEAD` (ou `git log --stat dev..HEAD`) e conferir que:
- Nenhuma tabela/migration foi tocada.
- `app/fiscal/clientes/[id]/page.tsx` só mudou o import e o corpo de `toggleTarefa` (Task 2) — nenhuma outra lógica da ficha do cliente foi alterada.
- Os 3 `toggleTarefa*` (Fiscal/Contábil/Pessoal) continuam com o mesmo comportamento de antes pra quem chama pela ficha do cliente (assinatura e lógica interna inalteradas, só ganharam um `revalidatePath` a mais).

Isso substitui teste manual no navegador — ver `feedback_no_unsolicited_testing`: verificação no navegador com o Supabase de dev fica reservada pro usuário pedir explicitamente, não é parte automática deste plano.

- [ ] **Step 5: Commit final (se sobrar algo solto) e abertura de PR**

```bash
git status
```

Se limpo, seguir para `superpowers:finishing-a-development-branch` pra decidir push/PR contra `dev` (nunca fazer merge — ver `feedback_never_merge_prs`, `feedback_prs_target_dev_branch`).

---

## Self-Review

**Cobertura do spec:**
- Fiscal/Contábil/Pessoal → Tasks 5, 6, 7.
- Grupo só no Fiscal → `camposDisponiveis` diferente por setor (Task 5 vs 6/7), coberto por `valoresDistintos` que já lida com campo ausente (testado na Task 1).
- Só tarefas tipo DATA sem etapas → `nomesTarefaTipoData` (Task 1), testado.
- Só empresas com aquele valor → `clientesPorValor` (Task 1), testado; usado no componente (Task 4).
- Um valor por vez → seletor único de campo/valor no componente (Task 4), sem multi-seleção de campo.
- Desmarcar desfaz → `handleCheckbox` alterna `concluida` nos dois sentidos (Task 4), delegando ao mesmo `toggleTarefa*` que já suporta desmarcar.
- Mês/ano corrente → `getMesAno()` em cada página (Tasks 5-7), sem seletor próprio.
- Permissão por responsável → filtro por `responsavel` nas 3 páginas (Tasks 5-7), mesma regra de `app/fiscal/tarefas/page.tsx`.
- Data manual continua na ficha do cliente → Task 2 não muda a assinatura nem o comportamento de `toggleTarefa` na ficha, só extrai o corpo; `data?` continua opcional e funcional lá.
- Server action compartilhada, validando com `podeEditarCliente*` → já garantido, pois `toggleTarefaFiscal`/`Contabil`/`Pessoal` fazem essa checagem internamente antes de gravar (Task 2 preserva isso, Tasks 3/6/7 não duplicam a checagem no wrapper).
- Menu → Task 8.

**Placeholder scan:** nenhum "TBD"/"depois eu vejo" — todo código de cada step está completo.

**Consistência de tipos:** `ClienteFiltro` (Task 1) é reusada sem alteração pelas Tasks 5-7 (com `responsavel` adicionado via intersection type só nas páginas, não no tipo base — o componente da Task 4 nunca precisa de `responsavel`, só as páginas usam pra filtrar antes de passar pro componente). `onToggle` tem a mesma assinatura `(clienteId, tipo, concluida) => Promise<void>` em Task 4 (prop) e Tasks 5-7 (implementação). `nomesTarefaTipoData`/`valoresDistintos`/`clientesPorValor`/`tarefasTipoDataVinculadas` têm a mesma assinatura em Task 1 (definição), Task 4 (uso no componente) e Tasks 5-7 (uso nas páginas).
