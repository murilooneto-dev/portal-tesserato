# Geração automática de tarefas a partir dos vínculos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lista de tarefas esperadas de um cliente passa a somar automaticamente o que os vínculos do seu Grupo/Regime/Atividade geram (cadastrados em `/admin/configuracoes`) com `tarefas_personalizadas`, nos 3 setores (Fiscal, Contábil, Pessoal) — substituindo os 3 mecanismos legados do Fiscal que faziam algo parecido de forma paralela e desincronizada.

**Architecture:** Um módulo compartilhado novo (`lib/tarefas-esperadas.ts`) separa a busca em lote (uma consulta por página, nunca por cliente) do cálculo puro e testável. Cada um dos ~14 pontos que hoje lê `tarefas_personalizadas` cru nos 3 setores passa a usar esse cálculo no lugar. Os 3 mecanismos legados do Fiscal (`getTiposParaGrupoFiscal`, `atividade_templates`/`resolverTemplate`, `grupo_templates`/"Aplicar template") são removidos por completo (código deletado; as tabelas do banco ficam sem uso, não são apagadas).

**Tech Stack:** Next.js (App Router, Server Components + alguns Client Components com fetch próprio), Supabase (`@supabase/supabase-js`), TypeScript.

## Global Constraints

- Casamento do grupo/regime/atividade do cliente com a entidade do catálogo é por **nome** (comparação de string), sem coluna de ID — decisão explícita, sem migration nova.
- `calcularTarefasEsperadas()` nunca duplica tarefa (usa `Set`) e nunca perde `tarefas_personalizadas` — a lista final é sempre união, nunca substituição.
- Cliente sem grupo/regime/atividade preenchido contribui zero desses 3 pros vínculos — lista final vira só `tarefas_personalizadas` (sem fallback nenhum).
- Nenhuma migration nova. `atividade_templates`/`grupo_templates` ficam no banco sem uso depois da retirada (mesmo padrão já usado com `admin_users`).
- Não criar campo Grupo em Contábil/Pessoal — eles não têm esse campo hoje.
- Não mexer no snapshot mensal (`tarefas_esperadas_mes`) nem em `ClienteGeralModal.tsx`/`EmpresaContabilModal.tsx`/`EmpresaPessoalModal.tsx`/`EmpresaModal.tsx` na parte de seed de cliente novo — fora de escopo.
- Cada task termina com `npx tsc --noEmit` limpo (rodar do diretório `portal-tesserato`).

---

### Task 1: `lib/tarefas-esperadas.ts` — módulo compartilhado + testes

**Files:**
- Create: `lib/tarefas-esperadas.ts`
- Test: `tests/tarefas-esperadas.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `export interface MapaVinculosSetor { porGrupo: Record<string, string[]>; porRegime: Record<string, string[]>; porAtividade: Record<string, string[]> }`, `export async function buscarMapaVinculosSetor(supabase: SupabaseClient, setor: UserSetor): Promise<MapaVinculosSetor>`, `export function calcularTarefasEsperadas(cliente: { grupo?: string | null; regime?: string | null; atividade?: string | null; tarefas_personalizadas: string[] }, mapa: MapaVinculosSetor): string[]` — usados por todas as tasks seguintes.

- [ ] **Step 1: Escrever os testes de `calcularTarefasEsperadas` (falhando)**

```ts
// tests/tarefas-esperadas.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularTarefasEsperadas, type MapaVinculosSetor } from '../lib/tarefas-esperadas'

const mapaVazio: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: {} }

test('calcularTarefasEsperadas: sem vínculo nenhum, devolve só tarefas_personalizadas', () => {
  const cliente = { grupo: 'simples', regime: null, atividade: 'Serviço', tarefas_personalizadas: ['DAS', 'ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapaVazio)
  assert.deepEqual(resultado.sort(), ['DAS', 'ISS'])
})

test('calcularTarefasEsperadas: vínculo só por grupo soma com tarefas_personalizadas', () => {
  const mapa: MapaVinculosSetor = { porGrupo: { simples: ['FECHAMENTO SIMPLES', 'DAS'] }, porRegime: {}, porAtividade: {} }
  const cliente = { grupo: 'simples', regime: null, atividade: null, tarefas_personalizadas: ['ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS', 'FECHAMENTO SIMPLES', 'ISS'])
})

test('calcularTarefasEsperadas: vínculo só por regime', () => {
  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: { Normal: ['IRPJ/CSLL'] }, porAtividade: {} }
  const cliente = { grupo: null, regime: 'Normal', atividade: null, tarefas_personalizadas: [] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['IRPJ/CSLL'])
})

test('calcularTarefasEsperadas: vínculo só por atividade', () => {
  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: { Serviço: ['ISS'] } }
  const cliente = { grupo: null, regime: null, atividade: 'Serviço', tarefas_personalizadas: [] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['ISS'])
})

test('calcularTarefasEsperadas: combinação dos 3 sem duplicar', () => {
  const mapa: MapaVinculosSetor = {
    porGrupo: { simples: ['DAS', 'FECHAMENTO SIMPLES'] },
    porRegime: { Normal: ['IRPJ/CSLL'] },
    porAtividade: { Serviço: ['ISS', 'DAS'] },
  }
  const cliente = { grupo: 'simples', regime: 'Normal', atividade: 'Serviço', tarefas_personalizadas: ['ISS'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS', 'FECHAMENTO SIMPLES', 'IRPJ/CSLL', 'ISS'])
})

test('calcularTarefasEsperadas: cliente sem grupo/regime/atividade preenchido', () => {
  const mapa: MapaVinculosSetor = { porGrupo: { simples: ['DAS'] }, porRegime: {}, porAtividade: {} }
  const cliente = { grupo: null, regime: null, atividade: null, tarefas_personalizadas: ['MANUAL'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado, ['MANUAL'])
})

test('calcularTarefasEsperadas: grupo do cliente sem entrada no mapa (não cadastrado/renomeado) não quebra', () => {
  const mapa: MapaVinculosSetor = { porGrupo: { simples: ['DAS'] }, porRegime: {}, porAtividade: {} }
  const cliente = { grupo: 'nome-que-nao-existe-no-catalogo', regime: null, atividade: null, tarefas_personalizadas: ['MANUAL'] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado, ['MANUAL'])
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (arquivo não existe ainda)**

Run: `node --import tsx --test tests/tarefas-esperadas.test.ts`
Expected: FAIL — `Cannot find module '../lib/tarefas-esperadas'`

- [ ] **Step 3: Implementar `lib/tarefas-esperadas.ts`**

```ts
// lib/tarefas-esperadas.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserSetor } from './types'

export interface MapaVinculosSetor {
  porGrupo: Record<string, string[]>
  porRegime: Record<string, string[]>
  porAtividade: Record<string, string[]>
}

// Uma consulta em lote por carregamento de página (nunca por cliente) —
// junta grupos/regimes/atividades (id, nome) com tarefa_tipo_vinculos e
// tarefa_tipos (nome) do setor, monta os 3 mapas nome → [nomes de tarefa].
// Casamento do grupo/regime/atividade do cliente com a entidade do
// catálogo é por nome (sem coluna de ID — decisão do spec de 2026-08-20).
export async function buscarMapaVinculosSetor(
  supabase: SupabaseClient,
  setor: UserSetor,
): Promise<MapaVinculosSetor> {
  const [{ data: grupos }, { data: regimes }, { data: atividades }, { data: vinculos }] = await Promise.all([
    supabase.from('grupos').select('id, nome').eq('setor', setor),
    supabase.from('regimes').select('id, nome').eq('setor', setor),
    supabase.from('atividades').select('id, nome').eq('setor', setor),
    supabase
      .from('tarefa_tipo_vinculos')
      .select('entidade_tipo, entidade_id, tarefa_tipos!inner(nome, setor)')
      .eq('tarefa_tipos.setor', setor),
  ])

  const nomePorId: Record<string, string> = {}
  for (const g of grupos ?? []) nomePorId[g.id as string] = g.nome as string
  for (const r of regimes ?? []) nomePorId[r.id as string] = r.nome as string
  for (const a of atividades ?? []) nomePorId[a.id as string] = a.nome as string

  const mapa: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: {} }
  const chavePorTipo: Record<string, keyof MapaVinculosSetor> = {
    grupo: 'porGrupo',
    regime: 'porRegime',
    atividade: 'porAtividade',
  }

  for (const v of vinculos ?? []) {
    const nomeEntidade = nomePorId[v.entidade_id as string]
    if (!nomeEntidade) continue
    const chave = chavePorTipo[v.entidade_tipo as string]
    if (!chave) continue
    const nomeTarefa = (v.tarefa_tipos as unknown as { nome: string }).nome
    if (!mapa[chave][nomeEntidade]) mapa[chave][nomeEntidade] = []
    mapa[chave][nomeEntidade].push(nomeTarefa)
  }

  return mapa
}

// Função pura, testável: soma o que os vínculos do grupo/regime/atividade
// do cliente geram com tarefas_personalizadas dele. Nunca duplica (Set).
// Cliente sem grupo/regime/atividade preenchido (ou com um valor que não
// bate com nada do mapa — não cadastrado, renomeado etc.) simplesmente não
// contribui nada desses 3 — a lista vira só tarefas_personalizadas, igual
// hoje sem nenhum fallback.
export function calcularTarefasEsperadas(
  cliente: { grupo?: string | null; regime?: string | null; atividade?: string | null; tarefas_personalizadas: string[] },
  mapa: MapaVinculosSetor,
): string[] {
  const automaticas = [
    ...(mapa.porGrupo[cliente.grupo ?? ''] ?? []),
    ...(mapa.porRegime[cliente.regime ?? ''] ?? []),
    ...(mapa.porAtividade[cliente.atividade ?? ''] ?? []),
  ]
  return Array.from(new Set([...automaticas, ...cliente.tarefas_personalizadas]))
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --import tsx --test tests/tarefas-esperadas.test.ts`
Expected: PASS — 7/7 testes.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/tarefas-esperadas.ts tests/tarefas-esperadas.test.ts
git commit -m "feat: módulo tarefas-esperadas (busca em lote de vínculos + cálculo puro)"
```

---

### Task 2: Fiscal — checklist usa vínculos + retira `getTiposParaGrupoFiscal`

**Files:**
- Modify: `app/fiscal/clientes/[id]/page.tsx`
- Modify: `components/fiscal/TarefaChecklist.tsx`
- Modify: `lib/tarefa-tipos.ts`

**Interfaces:**
- Consumes: `buscarMapaVinculosSetor`, `calcularTarefasEsperadas` da Task 1.
- Produces: nada consumido pelas tasks seguintes (setores são independentes).

- [ ] **Step 1: `lib/tarefa-tipos.ts` — remover `getTiposParaGrupoFiscal`**

Localizar e remover a função inteira (procurar `export function getTiposParaGrupoFiscal`):

```ts
export function getTiposParaGrupoFiscal(grupo: string): string[] {
  if (grupo === 'simples') return TAREFAS_FISCAL_SIMPLES
  if (grupo === 'mei')     return TAREFAS_FISCAL_MEI
  return TAREFAS_FISCAL_NORMAL
}
```

As constantes `TAREFAS_FISCAL_NORMAL`/`TAREFAS_FISCAL_SIMPLES`/`TAREFAS_FISCAL_MEI` logo acima ficam sem uso depois disso — remover elas também (confirmar antes com um grep que não têm outro consumidor: `grep -rn "TAREFAS_FISCAL_" --include="*.ts" --include="*.tsx" .`).

- [ ] **Step 2: `app/fiscal/clientes/[id]/page.tsx` — usar o mapa de vínculos**

Remover o import (linha ~22):

```ts
import { getTiposParaGrupoFiscal } from '@/lib/tarefa-tipos'
```

Adicionar:

```ts
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
```

Substituir o bloco (linhas 57-60):

```ts
  const tarefasPersonalizadasBrutas = cliente.tarefas_personalizadas ?? []
  const tarefasBaseFiscal = tarefasPersonalizadasBrutas.length > 0
    ? tarefasPersonalizadasBrutas
    : getTiposParaGrupoFiscal(cliente.grupo ?? 'normal')
```

por:

```ts
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'fiscal')
  const tarefasBaseFiscal = calcularTarefasEsperadas(cliente, mapaVinculos)
```

O resto do arquivo (`tarefasPersonalizadasEfetivas = Array.from(new Set([...tarefasBaseFiscal, ...tiposDeParcelamento]))`, o grid de histórico de 12 meses, a prop pro `<TarefaChecklist>`) não muda — já consome `tarefasBaseFiscal`/`tarefasPersonalizadasEfetivas`.

- [ ] **Step 3: `components/fiscal/TarefaChecklist.tsx` — remover o fallback interno**

Remover o import (linha 9):

```ts
import { getTiposParaGrupoFiscal } from '@/lib/tarefa-tipos'
```

Substituir a linha 111:

```ts
  const tipos = tarefasPersonalizadas.length > 0 ? tarefasPersonalizadas : getTiposParaGrupoFiscal(grupo)
```

por:

```ts
  const tipos = tarefasPersonalizadas
```

Não remover a prop `grupo` nem seu uso na linha 435 (`{grupo === 'normal' && (...)}`, campo MIT) — isso é um consumidor diferente e aceito do valor literal de `grupo`, fora de escopo deste projeto.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "app/fiscal/clientes/[id]/page.tsx" components/fiscal/TarefaChecklist.tsx lib/tarefa-tipos.ts
git commit -m "feat: checklist do Fiscal soma vínculos; remove fallback getTiposParaGrupoFiscal"
```

---

### Task 3: Fiscal — listagem, dashboard e relatórios usam vínculos

**Files:**
- Modify: `app/fiscal/clientes/page.tsx`
- Modify: `app/fiscal/dashboard/page.tsx`
- Modify: `app/fiscal/relatorios/page.tsx`

**Interfaces:**
- Consumes: `buscarMapaVinculosSetor`, `calcularTarefasEsperadas` da Task 1.
- Produces: nada consumido pelas tasks seguintes.

- [ ] **Step 1: `app/fiscal/clientes/page.tsx`**

Adicionar o import:

```ts
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
```

Substituir o bloco (linhas 30-34):

```ts
  // Mapa de tipos por cliente
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }
```

por:

```ts
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'fiscal')

  // Mapa de tipos por cliente
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    tiposMap[c.id] = new Set(calcularTarefasEsperadas(c, mapaVinculos))
  }
```

- [ ] **Step 2: `app/fiscal/dashboard/page.tsx`**

Adicionar o import:

```ts
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
```

Substituir o bloco (linhas 45-48):

```ts
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }
```

por:

```ts
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'fiscal')
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(calcularTarefasEsperadas(c, mapaVinculos))
  }
```

Substituir a linha 151 (dentro do `.map(nome => { ... })` de "Progresso por Responsável"):

```ts
              const opTotal     = opClientes.reduce((sum, c) => sum + (c.tarefas_personalizadas?.length ?? 0), 0)
```

por:

```ts
              const opTotal     = opClientes.reduce((sum, c) => sum + (tiposMap[c.id]?.size ?? 0), 0)
```

(reaproveita o `tiposMap` já calculado, em vez de reler `tarefas_personalizadas` cru — mesmo padrão já usado em `totalTarefas` na linha 53, que não muda.)

As linhas 57-60 (contadores `normal`/`simples`/`mei`/`isento` por `c.grupo`) **não mudam** — são um dos 5 pontos que dependem do valor literal do slug, aceito e documentado (ver `components/fiscal/CamposFiscais.tsx`).

- [ ] **Step 3: `app/fiscal/relatorios/page.tsx`**

Este arquivo é `'use client'` e busca dados no navegador — `buscarMapaVinculosSetor` funciona igual (aceita qualquer `SupabaseClient`, servidor ou navegador).

Adicionar o import:

```ts
import { buscarMapaVinculosSetor, calcularTarefasEsperadas, type MapaVinculosSetor } from '@/lib/tarefas-esperadas'
```

Adicionar um novo estado, junto aos outros `useState` (perto da linha 33-34):

```ts
  const [mapaVinculos, setMapaVinculos] = useState<MapaVinculosSetor>({ porGrupo: {}, porRegime: {}, porAtividade: {} })
```

No `useEffect` (linhas 50-77), adicionar a busca do mapa dentro do `Promise.all` existente (linhas 62-66):

```ts
        Promise.all([
          clientesQ,
          buscarTodasTarefasDoMes<Tarefa>(sb, mes, ano),
          sb.from('observacoes_clientes').select('cliente_id,texto').eq('mes', mes).eq('ano', ano),
          buscarMapaVinculosSetor(sb, 'fiscal'),
        ]).then(([c, t, o, mapa]) => {
          setClientes((c.data ?? []).map(flattenClienteFiscal))
          setTarefas(t)
          const obsMap: Record<string, string> = {}
          for (const row of o.data ?? []) {
            if (row.texto?.trim()) obsMap[row.cliente_id] = row.texto
          }
          setObsPorCliente(obsMap)
          setMapaVinculos(mapa)
        })
```

Alterar a função `progresso` (linhas 19-27) pra receber o mapa:

```ts
function progresso(cliente: ClienteComFiscal, tarefas: Tarefa[], mapa: MapaVinculosSetor) {
  const tipos = new Set(calcularTarefasEsperadas(cliente, mapa))
  const clienteTarefas = tarefas.filter(t => t.cliente_id === cliente.id && tipos.has(t.tipo))
  const total = tipos.size
  const feitas = clienteTarefas.filter(t => t.concluida).length
  const pendentesConcluidas = new Set(clienteTarefas.filter(t => t.concluida).map(t => t.tipo))
  const pendentes = Array.from(tipos).filter(tipo => !pendentesConcluidas.has(tipo))
  return { total, feitas, pct: total > 0 ? Math.round((feitas / total) * 100) : 0, pendentes }
}
```

Alterar as linhas 84 e 90-91:

```ts
  const tarefasDisponiveis = Array.from(new Set(clientes.flatMap(c => c.tarefas_personalizadas ?? []))).sort()
```

por:

```ts
  const tarefasDisponiveis = Array.from(new Set(clientes.flatMap(c => calcularTarefasEsperadas(c, mapaVinculos)))).sort()
```

e:

```ts
    .filter(c => filtroTarefa === 'TODAS' || (c.tarefas_personalizadas ?? []).includes(filtroTarefa))
    .map(c => ({ cliente: c, ...progresso(c, tarefas) }))
```

por:

```ts
    .filter(c => filtroTarefa === 'TODAS' || calcularTarefasEsperadas(c, mapaVinculos).includes(filtroTarefa))
    .map(c => ({ cliente: c, ...progresso(c, tarefas, mapaVinculos) }))
```

O resto do arquivo (filtro por grupo/atividade, ordenação, impressão) não muda.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "app/fiscal/clientes/page.tsx" "app/fiscal/dashboard/page.tsx" "app/fiscal/relatorios/page.tsx"
git commit -m "feat: listagem, dashboard e relatórios do Fiscal somam vínculos"
```

---

### Task 4: Contábil — checklist, listagem, dashboard e relatórios usam vínculos

**Files:**
- Modify: `app/contabil/clientes/[id]/page.tsx`
- Modify: `app/contabil/clientes/page.tsx`
- Modify: `app/contabil/dashboard/page.tsx`
- Modify: `app/contabil/relatorios/page.tsx`
- Modify: `components/contabil/RelatoriosContabil.tsx`

**Interfaces:**
- Consumes: `buscarMapaVinculosSetor`, `calcularTarefasEsperadas` da Task 1.
- Produces: nada consumido pelas tasks seguintes.

- [ ] **Step 1: `app/contabil/clientes/[id]/page.tsx` — checklist**

Adicionar o import:

```ts
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
```

Depois da linha `const { mes, ano } = await getMesAno()` (linha 37), adicionar:

```ts
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'contabil')
```

Substituir, na chamada de `<TarefaChecklistContabil>` (linha 138):

```tsx
        tarefasPersonalizadas={cliente.tarefas_personalizadas}
```

por:

```tsx
        tarefasPersonalizadas={calcularTarefasEsperadas(cliente, mapaVinculos)}
```

- [ ] **Step 2: `app/contabil/clientes/page.tsx` — listagem**

Adicionar o import:

```ts
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
```

Substituir o bloco (linhas 24-29):

```ts
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    progressoMap[c.id] = { total: c.tarefas_personalizadas.length, concluidas: 0 }
    tiposMap[c.id] = new Set(c.tarefas_personalizadas)
  }
```

por:

```ts
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'contabil')
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    const esperadas = calcularTarefasEsperadas(c, mapaVinculos)
    progressoMap[c.id] = { total: esperadas.length, concluidas: 0 }
    tiposMap[c.id] = new Set(esperadas)
  }
```

- [ ] **Step 3: `app/contabil/dashboard/page.tsx`**

Adicionar o import:

```ts
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
```

Substituir o bloco (linhas 35-40):

```ts
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }

  const totalTarefas = cs.reduce((sum, c) => sum + (c.tarefas_personalizadas?.length ?? 0), 0)
```

por:

```ts
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'contabil')
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(calcularTarefasEsperadas(c, mapaVinculos))
  }

  const totalTarefas = cs.reduce((sum, c) => sum + (tiposMap[c.id]?.size ?? 0), 0)
```

Substituir a linha 116 (dentro do `.map(nome => { ... })` de "Progresso por Responsável"):

```ts
              const opTotal     = opClientes.reduce((sum, c) => sum + (c.tarefas_personalizadas?.length ?? 0), 0)
```

por:

```ts
              const opTotal     = opClientes.reduce((sum, c) => sum + (tiposMap[c.id]?.size ?? 0), 0)
```

- [ ] **Step 4: `app/contabil/relatorios/page.tsx` (server) — buscar o mapa e repassar**

Adicionar o import:

```ts
import { buscarMapaVinculosSetor } from '@/lib/tarefas-esperadas'
```

Depois de `const clientes = (clientesRaw ?? []).map(flattenClienteContabil)`, adicionar:

```ts
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'contabil')
```

Na chamada de `<RelatoriosContabil>`, adicionar a prop:

```tsx
    <RelatoriosContabil
      clientes={clientes}
      tarefas={tarefas}
      isAdmin={isAdmin}
      mes={mes}
      ano={ano}
      obsPorCliente={obsPorCliente}
      mapaVinculos={mapaVinculos}
    />
```

- [ ] **Step 5: `components/contabil/RelatoriosContabil.tsx` (client) — usar o mapa recebido**

Adicionar o import:

```ts
import { calcularTarefasEsperadas, type MapaVinculosSetor } from '@/lib/tarefas-esperadas'
```

Alterar a função `progresso` (linhas 10-17):

```ts
function progresso(cliente: ClienteComContabil, tarefas: Tarefa[]) {
  const tipos = new Set(cliente.tarefas_personalizadas ?? [])
  const clienteTarefas = tarefas.filter(t => t.cliente_id === cliente.id && tipos.has(t.tipo))
  const total = tipos.size
  const feitas = clienteTarefas.filter(t => t.concluida).length
  const pendentesConcluidas = new Set(clienteTarefas.filter(t => t.concluida).map(t => t.tipo))
  const pendentes = Array.from(tipos).filter(tipo => !pendentesConcluidas.has(tipo))
  return { total, feitas, pct: total > 0 ? Math.round((feitas / total) * 100) : 0, pendentes }
}
```

por:

```ts
function progresso(cliente: ClienteComContabil, tarefas: Tarefa[], mapa: MapaVinculosSetor) {
  const tipos = new Set(calcularTarefasEsperadas(cliente, mapa))
  const clienteTarefas = tarefas.filter(t => t.cliente_id === cliente.id && tipos.has(t.tipo))
  const total = tipos.size
  const feitas = clienteTarefas.filter(t => t.concluida).length
  const pendentesConcluidas = new Set(clienteTarefas.filter(t => t.concluida).map(t => t.tipo))
  const pendentes = Array.from(tipos).filter(tipo => !pendentesConcluidas.has(tipo))
  return { total, feitas, pct: total > 0 ? Math.round((feitas / total) * 100) : 0, pendentes }
}
```

Adicionar `mapaVinculos: MapaVinculosSetor` na interface `Props` e na desestruturação da função `RelatoriosContabil`.

Alterar as linhas do corpo do componente:

```ts
  const tarefasDisponiveis = Array.from(new Set(clientes.flatMap(c => c.tarefas_personalizadas ?? []))).sort()

  const filtrados = clientes
    .filter(c => filtroResp === 'TODOS' || c.responsavel === filtroResp)
    .filter(c => filtroAtividade === 'TODAS' || c.atividade === filtroAtividade)
    .filter(c => filtroTarefa === 'TODAS' || (c.tarefas_personalizadas ?? []).includes(filtroTarefa))
    .map(c => ({ cliente: c, ...progresso(c, tarefas) }))
```

por:

```ts
  const tarefasDisponiveis = Array.from(new Set(clientes.flatMap(c => calcularTarefasEsperadas(c, mapaVinculos)))).sort()

  const filtrados = clientes
    .filter(c => filtroResp === 'TODOS' || c.responsavel === filtroResp)
    .filter(c => filtroAtividade === 'TODAS' || c.atividade === filtroAtividade)
    .filter(c => filtroTarefa === 'TODAS' || calcularTarefasEsperadas(c, mapaVinculos).includes(filtroTarefa))
    .map(c => ({ cliente: c, ...progresso(c, tarefas, mapaVinculos) }))
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add "app/contabil/clientes/[id]/page.tsx" "app/contabil/clientes/page.tsx" "app/contabil/dashboard/page.tsx" "app/contabil/relatorios/page.tsx" components/contabil/RelatoriosContabil.tsx
git commit -m "feat: checklist, listagem, dashboard e relatórios do Contábil somam vínculos"
```

---

### Task 5: Pessoal — checklist, listagem, dashboard e relatórios usam vínculos

**Files:**
- Modify: `app/pessoal/clientes/[id]/page.tsx`
- Modify: `app/pessoal/clientes/page.tsx`
- Modify: `app/pessoal/dashboard/page.tsx`
- Modify: `app/pessoal/relatorios/page.tsx`
- Modify: `components/pessoal/RelatoriosPessoal.tsx`

**Interfaces:**
- Consumes: `buscarMapaVinculosSetor`, `calcularTarefasEsperadas` da Task 1.
- Produces: nada consumido pela Task 6.

- [ ] **Step 1: `app/pessoal/clientes/[id]/page.tsx` — checklist**

Adicionar o import:

```ts
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
```

Substituir a linha 56:

```ts
  const tarefasPersonalizadasEfetivas = Array.from(new Set([...cliente.tarefas_personalizadas, ...tiposDeParcelamento]))
```

por:

```ts
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'pessoal')
  const tarefasPersonalizadasEfetivas = Array.from(new Set([...calcularTarefasEsperadas(cliente, mapaVinculos), ...tiposDeParcelamento]))
```

- [ ] **Step 2: `app/pessoal/clientes/page.tsx` — listagem**

Adicionar o import:

```ts
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
```

Substituir o bloco (linhas 28-34):

```ts
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    const visiveis = filtrarTarefasVisiveis(c.tarefas_personalizadas, mesesVisiveisPorTipo, mes)
    progressoMap[c.id] = { total: visiveis.length, concluidas: 0 }
    tiposMap[c.id] = new Set(visiveis)
  }
```

por:

```ts
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'pessoal')
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    const visiveis = filtrarTarefasVisiveis(calcularTarefasEsperadas(c, mapaVinculos), mesesVisiveisPorTipo, mes)
    progressoMap[c.id] = { total: visiveis.length, concluidas: 0 }
    tiposMap[c.id] = new Set(visiveis)
  }
```

- [ ] **Step 3: `app/pessoal/dashboard/page.tsx`**

Adicionar o import:

```ts
import { buscarMapaVinculosSetor, calcularTarefasEsperadas } from '@/lib/tarefas-esperadas'
```

Substituir a linha 50 (dentro do bloco que monta `tiposMap`, linhas 48-51):

```ts
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(filtrarTarefasVisiveis(c.tarefas_personalizadas ?? [], mesesVisiveisPorTipo, mes))
  }
```

por:

```ts
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'pessoal')
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(filtrarTarefasVisiveis(calcularTarefasEsperadas(c, mapaVinculos), mesesVisiveisPorTipo, mes))
  }
```

(`totalTarefas`/`opTotal` já reaproveitam `tiposMap.size` neste arquivo — não precisam de outra mudança, diferente do Fiscal/Contábil.)

- [ ] **Step 4: `app/pessoal/relatorios/page.tsx` (server) — buscar o mapa e repassar**

Adicionar o import:

```ts
import { buscarMapaVinculosSetor } from '@/lib/tarefas-esperadas'
```

Depois de `const clientes = (clientesRaw ?? []).map(flattenClientePessoal)`, adicionar:

```ts
  const mapaVinculos = await buscarMapaVinculosSetor(supabase, 'pessoal')
```

Na chamada de `<RelatoriosPessoal>`, adicionar a prop:

```tsx
    <RelatoriosPessoal
      clientes={clientes}
      tarefas={tarefas}
      isAdmin={isAdmin}
      mes={mes}
      ano={ano}
      mesesVisiveisPorTipo={mesesVisiveisPorTipo}
      obsPorCliente={obsPorCliente}
      mapaVinculos={mapaVinculos}
    />
```

- [ ] **Step 5: `components/pessoal/RelatoriosPessoal.tsx` (client) — usar o mapa recebido**

Adicionar o import:

```ts
import { calcularTarefasEsperadas, type MapaVinculosSetor } from '@/lib/tarefas-esperadas'
```

Alterar a função `progresso` (linhas 11-19):

```ts
function progresso(cliente: ClienteComPessoal, tarefas: Tarefa[], mesesVisiveisPorTipo: Record<string, number[] | null>, mes: number) {
  const tiposVisiveis = filtrarTarefasVisiveis(cliente.tarefas_personalizadas ?? [], mesesVisiveisPorTipo, mes)
  const tipos = new Set(tiposVisiveis)
  const clienteTarefas = tarefas.filter(t => t.cliente_id === cliente.id && tipos.has(t.tipo))
  const total = tipos.size
  const feitas = clienteTarefas.filter(t => t.concluida).length
  const pendentesConcluidas = new Set(clienteTarefas.filter(t => t.concluida).map(t => t.tipo))
  const pendentes = Array.from(tipos).filter(tipo => !pendentesConcluidas.has(tipo))
  return { total, feitas, pct: total > 0 ? Math.round((feitas / total) * 100) : 0, pendentes }
}
```

por:

```ts
function progresso(cliente: ClienteComPessoal, tarefas: Tarefa[], mesesVisiveisPorTipo: Record<string, number[] | null>, mes: number, mapa: MapaVinculosSetor) {
  const tiposVisiveis = filtrarTarefasVisiveis(calcularTarefasEsperadas(cliente, mapa), mesesVisiveisPorTipo, mes)
  const tipos = new Set(tiposVisiveis)
  const clienteTarefas = tarefas.filter(t => t.cliente_id === cliente.id && tipos.has(t.tipo))
  const total = tipos.size
  const feitas = clienteTarefas.filter(t => t.concluida).length
  const pendentesConcluidas = new Set(clienteTarefas.filter(t => t.concluida).map(t => t.tipo))
  const pendentes = Array.from(tipos).filter(tipo => !pendentesConcluidas.has(tipo))
  return { total, feitas, pct: total > 0 ? Math.round((feitas / total) * 100) : 0, pendentes }
}
```

Adicionar `mapaVinculos: MapaVinculosSetor` na interface `Props` e na desestruturação da função `RelatoriosPessoal`.

Alterar as linhas do corpo do componente:

```ts
  const tarefasDisponiveis = Array.from(new Set(clientes.flatMap(c => c.tarefas_personalizadas ?? []))).sort()

  const filtrados = clientes
    .filter(c => filtroResp === 'TODOS' || c.responsavel === filtroResp)
    .filter(c => filtroAtividade === 'TODAS' || c.atividade === filtroAtividade)
    .filter(c => filtroTarefa === 'TODAS' || (c.tarefas_personalizadas ?? []).includes(filtroTarefa))
    .map(c => ({ cliente: c, ...progresso(c, tarefas, mesesVisiveisPorTipo, mes) }))
```

por:

```ts
  const tarefasDisponiveis = Array.from(new Set(clientes.flatMap(c => calcularTarefasEsperadas(c, mapaVinculos)))).sort()

  const filtrados = clientes
    .filter(c => filtroResp === 'TODOS' || c.responsavel === filtroResp)
    .filter(c => filtroAtividade === 'TODAS' || c.atividade === filtroAtividade)
    .filter(c => filtroTarefa === 'TODAS' || calcularTarefasEsperadas(c, mapaVinculos).includes(filtroTarefa))
    .map(c => ({ cliente: c, ...progresso(c, tarefas, mesesVisiveisPorTipo, mes, mapaVinculos) }))
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add "app/pessoal/clientes/[id]/page.tsx" "app/pessoal/clientes/page.tsx" "app/pessoal/dashboard/page.tsx" "app/pessoal/relatorios/page.tsx" components/pessoal/RelatoriosPessoal.tsx
git commit -m "feat: checklist, listagem, dashboard e relatórios do Pessoal somam vínculos"
```

---

### Task 6: Retirar `atividade_templates`/`resolverTemplate`

**Files:**
- Modify: `components/fiscal/CamposFiscais.tsx`
- Modify: `components/fiscal/EmpresaModal.tsx`
- Modify: `components/geral/ClienteGeralModal.tsx`
- Modify: `app/fiscal/clientes/page.tsx`
- Modify: `app/fiscal/clientes/[id]/page.tsx`
- Modify: `app/(comum)/clientes/page.tsx`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: nada consumido pela Task 7.

- [ ] **Step 1: `components/fiscal/CamposFiscais.tsx` — remover o auto-preenchimento e o botão de restaurar**

Remover o import:

```ts
import { resolverTemplate } from '@/lib/atividade-templates'
```

Substituir o bloco do `<select>` de Atividade:

```tsx
      {/* Atividade */}
      <div>
        <label className={labelCls}>Atividade</label>
        <select className={selectCls} value={form.atividade} onChange={e => {
          const novaAtividade = e.target.value
          set('atividade', novaAtividade)
          if (!isEdit && novaAtividade) {
            const tarefasTemplate = resolverTemplate(novaAtividade, templates)
            if (tarefasTemplate.length > 0) {
              set('tarefas_personalizadas', tarefasTemplate)
            }
          }
        }} disabled={readOnly}>
          <option value="">Selecionar...</option>
          {ATIVIDADES.map(a => <option key={a} value={a} className="bg-[var(--bg-surface)]">{a}</option>)}
        </select>
      </div>
```

por:

```tsx
      {/* Atividade */}
      <div>
        <label className={labelCls}>Atividade</label>
        <select className={selectCls} value={form.atividade} onChange={e => set('atividade', e.target.value)} disabled={readOnly}>
          <option value="">Selecionar...</option>
          {ATIVIDADES.map(a => <option key={a} value={a} className="bg-[var(--bg-surface)]">{a}</option>)}
        </select>
      </div>
```

No bloco "Tarefas", remover o botão "Restaurar padrão da atividade":

```tsx
          {!readOnly && !isEdit && form.atividade && (
            <button type="button"
              onClick={() => set('tarefas_personalizadas', resolverTemplate(form.atividade, templates))}
              className="text-xs text-[var(--fg)]/30 hover:text-[var(--fg)]/60 transition-colors border border-[var(--fg)]/10 px-2 py-1 rounded-lg">
              Restaurar padrão da atividade
            </button>
          )}
```

(remover o bloco inteiro, incluindo o `{!readOnly && !isEdit && form.atividade && (...)}`).

Remover `templates: Record<string, string[]>` da interface `Props` e da desestruturação da função `CamposFiscais`.

O placeholder do texto vazio de tarefas também deixa de fazer sentido (referenciava o auto-preenchimento que acabou de sair). Substituir:

```tsx
          {form.tarefas_personalizadas.length === 0 && (
            <p className="text-[var(--fg)]/20 text-xs">
              {form.atividade ? 'Selecione a atividade acima para pré-preencher as tarefas padrão.' : 'Nenhuma tarefa adicionada.'}
            </p>
          )}
```

por:

```tsx
          {form.tarefas_personalizadas.length === 0 && (
            <p className="text-[var(--fg)]/20 text-xs">Nenhuma tarefa adicionada.</p>
          )}
```

- [ ] **Step 2: `components/fiscal/EmpresaModal.tsx` — parar de repassar `templates`**

Remover `templates: Record<string, string[]>` da interface `Props` e da desestruturação da função `EmpresaModal`. Remover a prop `templates={templates}` da chamada de `<CamposFiscais>`.

- [ ] **Step 3: `components/geral/ClienteGeralModal.tsx` — parar de repassar `templates`**

Remover `templates: Record<string, string[]>` da interface `Props` e da desestruturação da função `ClienteGeralModal`. Remover a prop `templates={templates}` das duas chamadas de `<CamposFiscais>` (bloco `mostraFiscal && isEdit` e bloco `mostraFiscal && !isEdit`).

- [ ] **Step 4: `app/fiscal/clientes/page.tsx` — parar de buscar `atividade_templates`**

Substituir:

```ts
  const [{ data: clientesRaw }, tarefas, { data: atividadeTemplates }] = await Promise.all([
    clientesQ,
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])
  const clientes = (clientesRaw ?? []).map(flattenClienteFiscal)

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }
```

por:

```ts
  const [{ data: clientesRaw }, tarefas] = await Promise.all([
    clientesQ,
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo'),
  ])
  const clientes = (clientesRaw ?? []).map(flattenClienteFiscal)
```

Remover a prop `templates={templatesMap}` da chamada de `<ClientesLista>`. Em `components/fiscal/ClientesLista.tsx`, remover `templates: Record<string, string[]>` da interface `Props` e da desestruturação, e a prop `templates={templates}` na chamada de `<EmpresaModal>` (esse arquivo não busca `atividade_templates`, só repassava — mesma limpeza de prop feita na Task anterior pro `catalogo`, agora ao contrário).

- [ ] **Step 5: `app/fiscal/clientes/[id]/page.tsx` — parar de buscar `atividade_templates`**

Substituir:

```ts
  // Dados pro EmpresaModal (editar cliente)
  const [{ data: usuariosFiscal }, { data: atividadeTemplates }] = await Promise.all([
    supabase.from('profiles').select('nome').contains('setores', ['fiscal']),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])
  const responsaveis = Array.from(new Set(
    (usuariosFiscal ?? []).map(p => p.nome ?? '').filter(Boolean)
  )).sort()
  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }
```

por:

```ts
  // Dados pro EmpresaModal (editar cliente)
  const { data: usuariosFiscal } = await supabase.from('profiles').select('nome').contains('setores', ['fiscal'])
  const responsaveis = Array.from(new Set(
    (usuariosFiscal ?? []).map(p => p.nome ?? '').filter(Boolean)
  )).sort()
```

Na chamada de `<ClienteAcoes>`, remover a prop `templates={templatesMap}`. Em `components/fiscal/ClienteAcoes.tsx`, remover `templates: Record<string, string[]>` da interface `Props` e da desestruturação, e a prop `templates={templates}` na chamada de `<EmpresaModal>`.

- [ ] **Step 6: `app/(comum)/clientes/page.tsx` — parar de buscar `atividade_templates`**

Substituir:

```ts
  const [{ data: profile }, { data: clientes }, { data: atividadeTemplates }, { data: usuariosFiscal }, { data: vinculosCatalogo }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('clientes').select('*').order('nome'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
    supabase.from('profiles').select('nome').contains('setores', ['fiscal']),
    supabase.from('tarefa_vinculos').select('*').order('created_at'),
  ])

  const isAdmin = profile?.role === 'admin'

  const responsaveis = Array.from(new Set(
    (usuariosFiscal ?? []).map(p => p.nome ?? '').filter(Boolean)
  )).sort()

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }
```

por:

```ts
  const [{ data: profile }, { data: clientes }, { data: usuariosFiscal }, { data: vinculosCatalogo }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('clientes').select('*').order('nome'),
    supabase.from('profiles').select('nome').contains('setores', ['fiscal']),
    supabase.from('tarefa_vinculos').select('*').order('created_at'),
  ])

  const isAdmin = profile?.role === 'admin'

  const responsaveis = Array.from(new Set(
    (usuariosFiscal ?? []).map(p => p.nome ?? '').filter(Boolean)
  )).sort()
```

Remover a prop `templates={templatesMap}` da chamada de `<ClientesGeralLista>`. Em `components/geral/ClientesGeralLista.tsx`, remover `templates: Record<string, string[]>` da interface `Props` e da desestruturação, e a prop `templates={templates}` nas duas chamadas de `<ClienteGeralModal>`.

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add components/fiscal/CamposFiscais.tsx components/fiscal/EmpresaModal.tsx components/fiscal/ClientesLista.tsx components/fiscal/ClienteAcoes.tsx components/geral/ClienteGeralModal.tsx components/geral/ClientesGeralLista.tsx "app/fiscal/clientes/page.tsx" "app/fiscal/clientes/[id]/page.tsx" "app/(comum)/clientes/page.tsx"
git commit -m "refactor: remove atividade_templates/resolverTemplate (substituído pelos vínculos)"
```

---

### Task 7: Retirar `grupo_templates`/"Aplicar template"

**Files:**
- Modify: `app/fiscal/parametros/actions.ts`
- Modify: `app/fiscal/parametros/ParametrosClient.tsx`
- Modify: `app/fiscal/parametros/page.tsx`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: nada consumido pela Task 8.

- [ ] **Step 1: `app/fiscal/parametros/actions.ts` — remover as 4 funções de template**

Remover o import (linha 6, `normalizarNome` fica sem uso depois deste bloco sair — confirmar com grep antes de remover: `grep -n "normalizarNome" app/fiscal/parametros/actions.ts` deve mostrar só a linha do import depois desta task):

```ts
import { normalizarNome } from '@/lib/config-entidades'
```

Localizar o bloco abaixo (começa logo depois de `salvarConfiguracoes`, termina logo antes de `const CAMPOS_MESCLAVEIS_PARCELAMENTO = [`) e remover inteiro, sem deixar nada no lugar:

```ts
export async function salvarTemplate(
  atividade: string,
  tarefas: string[]
): Promise<{ error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { error } = await supabase
    .from('atividade_templates')
    .upsert({ atividade, tarefas }, { onConflict: 'atividade' })

  if (error) return { error: error.message }
  revalidatePath('/fiscal/parametros')
  return {}
}

export async function aplicarTemplateAClientes(
  atividadeBase: string
): Promise<{ error?: string; atualizados: number; avisoForaCatalogo: string[] }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', atualizados: 0, avisoForaCatalogo: [] }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', atualizados: 0, avisoForaCatalogo: [] }

  const { data: templateRow, error: templateErr } = await supabase
    .from('atividade_templates')
    .select('tarefas')
    .eq('atividade', atividadeBase)
    .single()

  if (templateErr && templateErr.code !== 'PGRST116') {
    return { error: templateErr.message, atualizados: 0, avisoForaCatalogo: [] }
  }
  const tarefasBase: string[] = templateRow?.tarefas ?? []
  if (tarefasBase.length === 0) return { atualizados: 0, avisoForaCatalogo: [] }

  const { data: tiposCatalogo } = await supabase
    .from('tarefa_tipos')
    .select('nome')
    .eq('setor', 'fiscal')
  const nomesCatalogoNormalizados = new Set((tiposCatalogo ?? []).map(t => normalizarNome(t.nome as string)))
  const avisoForaCatalogo = tarefasBase.filter(t => !nomesCatalogoNormalizados.has(normalizarNome(t)))

  const { data: clientes } = await supabase
    .from('clientes_fiscal')
    .select('cliente_id, atividade, tarefas_personalizadas')

  let atualizados = 0
  for (const c of clientes ?? []) {
    if (!c.atividade?.includes(atividadeBase)) continue

    const existentes: string[] = c.tarefas_personalizadas ?? []
    const novas = tarefasBase.filter(t => !existentes.includes(t))
    if (novas.length === 0) continue

    await supabase
      .from('clientes_fiscal')
      .update({ tarefas_personalizadas: [...existentes, ...novas] })
      .eq('cliente_id', c.cliente_id)

    atualizados++
  }

  revalidatePath('/fiscal/clientes')
  return { atualizados, avisoForaCatalogo }
}

export async function salvarTemplateGrupo(
  grupo: string,
  tarefas: string[]
): Promise<{ error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { error } = await supabase
    .from('grupo_templates')
    .upsert({ grupo, tarefas }, { onConflict: 'grupo' })

  if (error) return { error: error.message }
  revalidatePath('/fiscal/parametros')
  return {}
}

export async function aplicarTemplateGrupoAClientes(
  grupo: string
): Promise<{ error?: string; atualizados: number; avisoForaCatalogo: string[] }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', atualizados: 0, avisoForaCatalogo: [] }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', atualizados: 0, avisoForaCatalogo: [] }

  const { data: templateRow, error: templateErr } = await supabase
    .from('grupo_templates')
    .select('tarefas')
    .eq('grupo', grupo)
    .single()

  if (templateErr && templateErr.code !== 'PGRST116') {
    return { error: templateErr.message, atualizados: 0, avisoForaCatalogo: [] }
  }
  const tarefasBase: string[] = templateRow?.tarefas ?? []
  if (tarefasBase.length === 0) return { atualizados: 0, avisoForaCatalogo: [] }

  const { data: tiposCatalogo } = await supabase
    .from('tarefa_tipos')
    .select('nome')
    .eq('setor', 'fiscal')
  const nomesCatalogoNormalizados = new Set((tiposCatalogo ?? []).map(t => normalizarNome(t.nome as string)))
  const avisoForaCatalogo = tarefasBase.filter(t => !nomesCatalogoNormalizados.has(normalizarNome(t)))

  const { data: clientes } = await supabase
    .from('clientes_fiscal')
    .select('cliente_id, grupo, tarefas_personalizadas')

  let atualizados = 0
  for (const c of clientes ?? []) {
    if (c.grupo !== grupo) continue

    const existentes: string[] = c.tarefas_personalizadas ?? []
    const novas = tarefasBase.filter(t => !existentes.includes(t))
    if (novas.length === 0) continue

    await supabase
      .from('clientes_fiscal')
      .update({ tarefas_personalizadas: [...existentes, ...novas] })
      .eq('cliente_id', c.cliente_id)

    atualizados++
  }

  revalidatePath('/fiscal/clientes')
  return { atualizados, avisoForaCatalogo }
}
```

O código logo depois (`const CAMPOS_MESCLAVEIS_PARCELAMENTO = [...`) e tudo antes (`salvarConfiguracoes`) não mudam.

- [ ] **Step 2: `app/fiscal/parametros/ParametrosClient.tsx` — remover a UI de template**

Alterar o import (linha 9) de:

```ts
import { salvarTemplate, aplicarTemplateAClientes, salvarTemplateGrupo, aplicarTemplateGrupoAClientes, analisarParcelamentosDuplicados, limparParcelamentosDuplicados } from './actions'
```

para:

```ts
import { analisarParcelamentosDuplicados, limparParcelamentosDuplicados } from './actions'
```

Remover o import (linha 11):

```ts
import { resolverTemplate } from '@/lib/atividade-templates'
```

Na interface `Props`, remover `atividadeTemplates: Record<string, string[]>` e `grupoTemplates: Record<string, string[]>`. Na assinatura da função `ParametrosClient`, remover `atividadeTemplates, grupoTemplates` da desestruturação.

Remover o bloco de estado abaixo inteiro, sem deixar nada no lugar (fica entre a linha `const [logModal, setLogModal] = useState<'tarefas' | 'exclusoes' | null>(null)`, que não muda, e o comentário `// Parcelamentos duplicados`, que também não muda):

```ts
  // Templates de atividade
  const BASES = ['Serviço', 'Comércio', 'Indústria'] as const
  const ATIVIDADES_COMBINADAS = [
    'Serviço e Comércio',
    'Serviço e Indústria',
    'Comércio e Indústria',
    'Serviço, Comércio e Indústria',
  ]
  const [templates, setTemplates] = useState<Record<string, string[]>>({
    Serviço:   atividadeTemplates['Serviço']   ?? [],
    Comércio:  atividadeTemplates['Comércio']  ?? [],
    Indústria: atividadeTemplates['Indústria'] ?? [],
  })
  const [novasTarefas, setNovasTarefas] = useState<Record<string, string>>({
    Serviço: '', Comércio: '', Indústria: '',
  })
  const [salvandoTemplate, setSalvandoTemplate] = useState<string | null>(null)
  const [aplicandoTemplate, setAplicandoTemplate] = useState<string | null>(null)
  const [templateMsg, setTemplateMsg] = useState<Record<string, string>>({})
  const [templateAviso, setTemplateAviso] = useState<Record<string, string[]>>({})

  // Templates de grupo
  const GRUPOS_TEMPLATE = [
    { value: 'normal',  label: 'Regime Normal' },
    { value: 'simples', label: 'Simples Nacional' },
    { value: 'mei',     label: 'MEI' },
    { value: 'isento',  label: 'Isento' },
  ]
  const [templatesGrupo, setTemplatesGrupo] = useState<Record<string, string[]>>({
    normal:  grupoTemplates['normal']  ?? [],
    simples: grupoTemplates['simples'] ?? [],
    mei:     grupoTemplates['mei']     ?? [],
    isento:  grupoTemplates['isento']  ?? [],
  })
  const [novasTarefasGrupo, setNovasTarefasGrupo] = useState<Record<string, string>>({
    normal: '', simples: '', mei: '', isento: '',
  })
  const [salvandoTemplateGrupo, setSalvandoTemplateGrupo] = useState<string | null>(null)
  const [aplicandoTemplateGrupo, setAplicandoTemplateGrupo] = useState<string | null>(null)
  const [templateGrupoMsg, setTemplateGrupoMsg] = useState<Record<string, string>>({})
  const [templateGrupoAviso, setTemplateGrupoAviso] = useState<Record<string, string[]>>({})
```

Remover as 8 funções handler abaixo, inteiras, sem deixar nada no lugar (ficam entre uma função de toggle de setor, que não muda, e `const sectionHeader = (title: string) => (...)`, que também não muda):

```ts
  async function handleSalvarTemplate(base: string) {
    setSalvandoTemplate(base)
    const result = await salvarTemplate(base, templates[base])
    setSalvandoTemplate(null)
    setTemplateMsg(prev => ({ ...prev, [base]: result.error ? `Erro: ${result.error}` : 'Salvo!' }))
    setTimeout(() => setTemplateMsg(prev => ({ ...prev, [base]: '' })), 3000)
  }

  async function handleAplicarTemplate(base: string) {
    setAplicandoTemplate(base)
    const result = await aplicarTemplateAClientes(base)
    setAplicandoTemplate(null)
    const msg = result.error
      ? `Erro: ${result.error}`
      : `${result.atualizados} cliente(s) atualizados`
    setTemplateMsg(prev => ({ ...prev, [base + '_aplicar']: msg }))
    setTemplateAviso(prev => ({ ...prev, [base]: result.avisoForaCatalogo ?? [] }))
    setTimeout(() => setTemplateMsg(prev => ({ ...prev, [base + '_aplicar']: '' })), 4000)
  }

  function addTarefaTemplate(base: string) {
    const t = (novasTarefas[base] ?? '').trim().toUpperCase()
    if (!t || templates[base].includes(t)) return
    setTemplates(prev => ({ ...prev, [base]: [...prev[base], t] }))
    setNovasTarefas(prev => ({ ...prev, [base]: '' }))
  }

  function removeTarefaTemplate(base: string, idx: number) {
    setTemplates(prev => ({
      ...prev,
      [base]: prev[base].filter((_, i) => i !== idx),
    }))
  }

  async function handleSalvarTemplateGrupo(grupo: string) {
    setSalvandoTemplateGrupo(grupo)
    const result = await salvarTemplateGrupo(grupo, templatesGrupo[grupo])
    setSalvandoTemplateGrupo(null)
    setTemplateGrupoMsg(prev => ({ ...prev, [grupo]: result.error ? `Erro: ${result.error}` : 'Salvo!' }))
    setTimeout(() => setTemplateGrupoMsg(prev => ({ ...prev, [grupo]: '' })), 3000)
  }

  async function handleAplicarTemplateGrupo(grupo: string) {
    setAplicandoTemplateGrupo(grupo)
    const result = await aplicarTemplateGrupoAClientes(grupo)
    setAplicandoTemplateGrupo(null)
    const msg = result.error
      ? `Erro: ${result.error}`
      : `${result.atualizados} cliente(s) atualizados`
    setTemplateGrupoMsg(prev => ({ ...prev, [grupo + '_aplicar']: msg }))
    setTemplateGrupoAviso(prev => ({ ...prev, [grupo]: result.avisoForaCatalogo ?? [] }))
    setTimeout(() => setTemplateGrupoMsg(prev => ({ ...prev, [grupo + '_aplicar']: '' })), 4000)
  }

  function addTarefaTemplateGrupo(grupo: string) {
    const t = (novasTarefasGrupo[grupo] ?? '').trim().toUpperCase()
    if (!t || templatesGrupo[grupo].includes(t)) return
    setTemplatesGrupo(prev => ({ ...prev, [grupo]: [...prev[grupo], t] }))
    setNovasTarefasGrupo(prev => ({ ...prev, [grupo]: '' }))
  }

  function removeTarefaTemplateGrupo(grupo: string, idx: number) {
    setTemplatesGrupo(prev => ({
      ...prev,
      [grupo]: prev[grupo].filter((_, i) => i !== idx),
    }))
  }
```

No JSX, dentro do `<DevLock>`, remover as duas seções abaixo inteiras, sem deixar nada no lugar (ficam entre o `</div>` que fecha a seção anterior, que não muda, e `{/* Manutenção de Dados */}`, que também não muda — continua dentro do mesmo `<DevLock>`):

```tsx
        {/* Templates de Tarefas por Atividade */}
        <div className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-6">
          {sectionHeader('Templates de Tarefas por Atividade')}
          <p className="text-[var(--fg)]/30 text-xs mb-5">
            Configure as tarefas padrão para cada atividade base. Atividades combinadas são geradas automaticamente pela união das bases.
          </p>

          {/* 3 cards editáveis */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {BASES.map(base => (
              <div key={base} className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-[var(--fg)] font-semibold text-sm">{base}</p>

                {/* Lista de tarefas */}
                <div className="flex flex-wrap gap-1.5 min-h-[40px]">
                  {templates[base].length === 0 && (
                    <p className="text-[var(--fg)]/20 text-xs">Nenhuma tarefa</p>
                  )}
                  {templates[base].map((t, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--fg)] px-2 py-0.5 rounded-md">
                      {t}
                      <button
                        onClick={() => removeTarefaTemplate(base, i)}
                        className="text-[var(--fg)]/30 hover:text-red-400 transition-colors font-bold ml-0.5">×</button>
                    </span>
                  ))}
                </div>

                {/* Input nova tarefa */}
                <div className="flex gap-1.5">
                  <input
                    value={novasTarefas[base] ?? ''}
                    onChange={e => setNovasTarefas(prev => ({ ...prev, [base]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefaTemplate(base))}
                    placeholder="Nova tarefa..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50"
                  />
                  <button
                    onClick={() => addTarefaTemplate(base)}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] text-xs font-bold hover:bg-[var(--accent)]/30 transition-colors">
                    +
                  </button>
                </div>

                {/* Botões */}
                <div className="flex flex-col gap-1.5 mt-auto pt-1">
                  <button
                    onClick={() => handleSalvarTemplate(base)}
                    disabled={salvandoTemplate === base}
                    className="w-full py-1.5 rounded-lg bg-[var(--accent)] text-[var(--fg)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                    {salvandoTemplate === base ? 'Salvando...' : 'Salvar template'}
                  </button>
                  <button
                    onClick={() => handleAplicarTemplate(base)}
                    disabled={aplicandoTemplate === base}
                    className="w-full py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/60 text-xs hover:bg-[var(--fg)]/10 transition-colors disabled:opacity-50">
                    {aplicandoTemplate === base ? 'Aplicando...' : 'Aplicar a clientes existentes'}
                  </button>
                  {templateMsg[base] && (
                    <p className={`text-xs text-center ${templateMsg[base].startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                      {templateMsg[base]}
                    </p>
                  )}
                  {templateMsg[base + '_aplicar'] && (
                    <p className="text-xs text-center text-blue-400">{templateMsg[base + '_aplicar']}</p>
                  )}
                  {(templateAviso[base]?.length ?? 0) > 0 && (
                    <p className="text-xs text-center text-amber-400">
                      Fora do catálogo: {templateAviso[base].join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Preview atividades combinadas */}
          <div>
            <p className="text-[10px] font-bold text-[var(--fg)]/30 uppercase tracking-widest mb-3">Preview — Atividades Combinadas (somente leitura)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ATIVIDADES_COMBINADAS.map(ativ => {
                const tarefas = resolverTemplate(ativ, templates)
                return (
                  <div key={ativ} className="rounded-xl border border-[var(--fg)]/6 bg-[var(--fg)]/2 px-4 py-3">
                    <p className="text-[var(--fg)]/50 text-xs font-semibold mb-2">{ativ}</p>
                    <p className="text-[var(--fg)]/30 text-xs">
                      {tarefas.length === 0
                        ? 'Nenhuma tarefa'
                        : tarefas.join(' · ')}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Templates de Tarefas por Grupo */}
        <div className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-6">
          {sectionHeader('Templates de Tarefas por Grupo')}
          <p className="text-[var(--fg)]/30 text-xs mb-5">
            Configure as tarefas padrão para cada grupo (Regime Normal, Simples Nacional, MEI, Isento).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {GRUPOS_TEMPLATE.map(({ value: grupo, label }) => (
              <div key={grupo} className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-[var(--fg)] font-semibold text-sm">{label}</p>

                {/* Lista de tarefas */}
                <div className="flex flex-wrap gap-1.5 min-h-[40px]">
                  {templatesGrupo[grupo].length === 0 && (
                    <p className="text-[var(--fg)]/20 text-xs">Nenhuma tarefa</p>
                  )}
                  {templatesGrupo[grupo].map((t, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--fg)] px-2 py-0.5 rounded-md">
                      {t}
                      <button
                        onClick={() => removeTarefaTemplateGrupo(grupo, i)}
                        className="text-[var(--fg)]/30 hover:text-red-400 transition-colors font-bold ml-0.5">×</button>
                    </span>
                  ))}
                </div>

                {/* Input nova tarefa */}
                <div className="flex gap-1.5">
                  <input
                    value={novasTarefasGrupo[grupo] ?? ''}
                    onChange={e => setNovasTarefasGrupo(prev => ({ ...prev, [grupo]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefaTemplateGrupo(grupo))}
                    placeholder="Nova tarefa..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50"
                  />
                  <button
                    onClick={() => addTarefaTemplateGrupo(grupo)}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] text-xs font-bold hover:bg-[var(--accent)]/30 transition-colors">
                    +
                  </button>
                </div>

                {/* Botões */}
                <div className="flex flex-col gap-1.5 mt-auto pt-1">
                  <button
                    onClick={() => handleSalvarTemplateGrupo(grupo)}
                    disabled={salvandoTemplateGrupo === grupo}
                    className="w-full py-1.5 rounded-lg bg-[var(--accent)] text-[var(--fg)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                    {salvandoTemplateGrupo === grupo ? 'Salvando...' : 'Salvar template'}
                  </button>
                  <button
                    onClick={() => handleAplicarTemplateGrupo(grupo)}
                    disabled={aplicandoTemplateGrupo === grupo}
                    className="w-full py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/60 text-xs hover:bg-[var(--fg)]/10 transition-colors disabled:opacity-50">
                    {aplicandoTemplateGrupo === grupo ? 'Aplicando...' : 'Aplicar a clientes existentes'}
                  </button>
                  {templateGrupoMsg[grupo] && (
                    <p className={`text-xs text-center ${templateGrupoMsg[grupo].startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                      {templateGrupoMsg[grupo]}
                    </p>
                  )}
                  {templateGrupoMsg[grupo + '_aplicar'] && (
                    <p className="text-xs text-center text-blue-400">{templateGrupoMsg[grupo + '_aplicar']}</p>
                  )}
                  {(templateGrupoAviso[grupo]?.length ?? 0) > 0 && (
                    <p className="text-xs text-center text-amber-400">
                      Fora do catálogo: {templateGrupoAviso[grupo].join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
```

- [ ] **Step 3: `app/fiscal/parametros/page.tsx` — parar de buscar `atividade_templates`/`grupo_templates`**

Substituir o arquivo inteiro por:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ParametrosClient from './ParametrosClient'

export const metadata = { title: 'Parâmetros — Tesserato Fiscal' }

export default async function ParametrosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/intranet')

  const [
    { data: profiles },
    { data: appSettings },
    { data: taskLogs },
    { data: deletionLogs },
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('nome'),
    supabase.from('app_settings').select('*').eq('id', 1).single(),
    supabase.from('task_unlock_log').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('deletion_log').select('*').order('created_at', { ascending: false }).limit(50),
  ])

  const s = (appSettings as any) ?? {}
  const emailKeys = [
    'email_ativo','gmail_remetente','gmail_senha','email_destinatario','usar_senha_app',
    'rotina1_ativo','rotina1_dia','rotina1_hora',
    'rotina2_ativo','rotina2_dia','rotina2_hora',
    'log1_ativo','log1_dia','log1_hora',
    'log2_ativo','log2_dia','log2_hora',
    'log3_ativo','log3_dia','log3_hora',
    'log4_ativo','log4_dia','log4_hora',
  ]
  const emailSettings: Record<string, string> = {}
  for (const k of emailKeys) { if (s[k] != null) emailSettings[k] = String(s[k]) }

  return (
    <>
      <ParametrosClient
        profiles={profiles ?? []}
        currentUserId={user.id}
        dashboardAnnouncement={s.dashboard_announcement ?? ''}
        taskLogs={taskLogs ?? []}
        deletionLogs={deletionLogs ?? []}
        emailSettings={emailSettings}
      />
    </>
  )
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/fiscal/parametros/actions.ts app/fiscal/parametros/ParametrosClient.tsx app/fiscal/parametros/page.tsx
git commit -m "refactor: remove grupo_templates e o botão Aplicar template (substituído pelos vínculos)"
```

---

### Task 8: Limpeza final e verificação

**Files:**
- Nenhum arquivo de código novo — só verificação.

**Interfaces:**
- Consumes: estado final das Tasks 1-7.
- Produces: nada — última task.

- [ ] **Step 1: Confirmar que nada mais referencia os 3 mecanismos legados**

Run: `grep -rn "getTiposParaGrupoFiscal\|atividade_templates\|grupo_templates\|resolverTemplate\|aplicarTemplateAClientes\|aplicarTemplateGrupoAClientes\|salvarTemplate\b\|salvarTemplateGrupo" --include="*.ts" --include="*.tsx" app lib components`
Expected: nenhuma ocorrência. Se aparecer algo, parar e investigar — alguma task anterior não completou a remoção.

- [ ] **Step 2: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui sem erros.

- [ ] **Step 3: Rodar a suíte de testes inteira**

Run: `npm test`
Expected: todos os testes passam, incluindo os 7 novos de `calcularTarefasEsperadas` da Task 1 (total esperado: 49 já existentes + 7 novos = 56).

- [ ] **Step 4: Commit final (se sobrar algo solto)**

```bash
git status --short
```

Se houver mudanças não commitadas remanescentes de alguma task, commitar; caso contrário, pular este step.

- [ ] **Step 5: Verificação manual (reservada pro usuário)**

Não é feita automaticamente — reportar como pendente, não executar. Roteiro sugerido pro usuário rodar depois:

1. Cadastrar um vínculo em `/admin/configuracoes` ligando um Grupo/Regime/Atividade do Fiscal a uma tarefa do catálogo.
2. Abrir um cliente do Fiscal com esse Grupo/Regime/Atividade — confirmar que a tarefa aparece no checklist, mesmo sem estar em `tarefas_personalizadas`.
3. Repetir nos dashboards, relatórios e listagem do Fiscal — confirmar que os contadores batem com o novo total.
4. Repetir os passos 1-3 pro Contábil e pro Pessoal (Atividade/Regime, sem Grupo).
5. Confirmar que a tela `/fiscal/parametros` não tem mais as seções "Templates de Tarefas por Atividade"/"por Grupo".
6. Confirmar que criar um cliente novo no Fiscal não pré-preenche mais tarefas ao escolher a Atividade (mudança de UX esperada e aceita).
