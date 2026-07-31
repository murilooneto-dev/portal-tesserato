# Fiscal Fase 2 (parte 2): semear tipos reais restantes, avisar drift em templates, remover "Corrigir Tarefas" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os 15 nomes reais de tarefa do Fiscal ainda hard-coded (fora `ENTRADA`/`SAIDAS`, já migrados) passam a existir no catálogo `tarefa_tipos`; aplicar um template de tarefas passa a avisar (sem bloquear) quando gera um nome fora do catálogo; a ferramenta "Corrigir Tarefas" em `/fiscal/parametros` (renomear/excluir/preencher data em massa + detecção de duplicata por acento) é removida.

**Architecture:** Uma migration SQL nova insere as 15 linhas no catálogo (`tipo_resposta='data'`, `etapas=null` — mesmo comportamento do fallback atual, sem mudança de UX). Em `app/fiscal/parametros/actions.ts`, as duas actions que aplicam template (`aplicarTemplateAClientes`/`aplicarTemplateGrupoAClientes`) ganham uma checagem extra contra `tarefa_tipos` (normalizando acento/caixa) e retornam `avisoForaCatalogo: string[]`; `ParametrosClient.tsx` exibe esse aviso como banner informativo, sem alterar o fluxo de aplicação. Por fim, as 8 funções da ferramenta "Corrigir Tarefas" (renomear/excluir/preencher data em clientes + análise/limpeza de duplicata por acento) saem de `actions.ts`, e a seção de UI correspondente sai de `ParametrosClient.tsx`, junto dos tipos/estado/handlers que só existiam para ela.

**Tech Stack:** Next.js 16 (App Router, Server Components), Supabase (Postgres + PostgREST + RLS), TypeScript, Tailwind v4. Sem framework de testes automatizado neste repo — verificação via `npx tsc --noEmit -p .` e `npm run build`.

## Global Constraints

- Nenhum dos 15 tipos ganha etapas múltiplas — todos `tipo_resposta='data'`, `etapas=null`, idêntico ao comportamento de fallback atual (decisão do usuário).
- Drift já existente em `tarefas_personalizadas`/`tarefas.tipo` **não é corrigido** nesta fase — nenhuma migração de dado, só o aviso passa a existir daqui pra frente (decisão do usuário).
- O aviso de drift entra só na tela de **aplicar** template (`aplicarTemplateAClientes`/`aplicarTemplateGrupoAClientes`) — `salvarTemplate`/`salvarTemplateGrupo` (criação/edição) não mudam.
- `components/fiscal/CorrigirTarefasClient.tsx` (montada em `/fiscal/admin`) **não muda** — é uma ferramenta diferente (corrige valores com caracteres corrompidos/mojibake), sem relação com a ferramenta "Corrigir Tarefas" de `/fiscal/parametros` que este plano remove.
- `analisarParcelamentosDuplicados`/`limparParcelamentosDuplicados` (mesma seção "Manutenção de Dados", mas sobre a tabela `parcelamentos`) **não mudam** — feature separada, fica intocada.
- A migration SQL só é aplicada no banco de **dev** (`fcpcorqquovvgtoukxry`), via REST insert com a service role key — nunca em produção (produção não tem `clientes_fiscal`/`setor`/`tarefa_tipos` ainda).
- `lib/tarefas-paginacao.ts` (`buscarTodasTarefas`) não muda — é usada por outros arquivos (`CorrigirTarefasClient.tsx`, páginas de relatório/dashboard); só o import dela em `app/fiscal/parametros/actions.ts` sai, porque nesse arquivo específico só era usada pela função removida.

---

### Task 1: Migration — semear os 15 tipos reais restantes no catálogo (dev)

**Files:**
- Create: `supabase/migrations/014_fiscal_tipos_reais_catalogo.sql`

**Interfaces:**
- Produces: 15 linhas em `tarefa_tipos` (`setor='fiscal'`) — não consumidas por nenhum código novo neste plano (o lookup `tarefaTipos[tipo]` em `components/fiscal/TarefaChecklist.tsx` já existe e já busca `tarefa_tipos` por setor; essas linhas só passam a aparecer nesse lookup, sem mudar nenhum código).

- [ ] **Step 1: Criar o arquivo da migration**

```sql
-- supabase/migrations/014_fiscal_tipos_reais_catalogo.sql

-- Semeia no catálogo os 15 nomes de tarefa do Fiscal que ainda eram
-- hard-coded em TAREFAS_NORMAL/TAREFAS_SIMPLES/TAREFAS_MEI
-- (components/fiscal/TarefaChecklist.tsx) e caiam no fallback padrão
-- (campo de data simples) por não existirem em tarefa_tipos. Todos
-- entram como tipo_resposta='data', etapas=null — mesmo comportamento
-- de hoje, sem mudança de UX; só passam a existir formalmente no
-- catálogo. Nomes gravados exatamente como aparecem nos arrays hoje,
-- sem consolidar grafias parecidas entre grupos (ex. 'ICMS/ICMS ST' vs
-- 'ICMS ST' continuam duas entradas distintas).
insert into tarefa_tipos (setor, nome, etapas, tipo_resposta) values
  ('fiscal', 'SIGET',              null, 'data'),
  ('fiscal', 'SPEED GOV',          null, 'data'),
  ('fiscal', 'ISS',                null, 'data'),
  ('fiscal', 'ENV. DAS',           null, 'data'),
  ('fiscal', 'PIS/COFINS',         null, 'data'),
  ('fiscal', 'ICMS/ICMS ST',       null, 'data'),
  ('fiscal', 'IRPJ/CSLL',          null, 'data'),
  ('fiscal', 'REINF/INSS',         null, 'data'),
  ('fiscal', 'EFD FISCAL',         null, 'data'),
  ('fiscal', 'EFD PIS/COFINS',     null, 'data'),
  ('fiscal', 'FECHAMENTO SIMPLES', null, 'data'),
  ('fiscal', 'GUIAS ENVIADAS',     null, 'data'),
  ('fiscal', 'ICMS ST',            null, 'data'),
  ('fiscal', 'REINF',              null, 'data'),
  ('fiscal', 'DAS',                null, 'data');
```

- [ ] **Step 2: Commit (sem aplicar ainda — a aplicação no dev via REST é feita pelo controller na Task 4, que tem a service role key; o subagent desta task não tem essas credenciais)**

```bash
git add supabase/migrations/014_fiscal_tipos_reais_catalogo.sql
git commit -m "feat: migration semeia 15 tipos reais restantes do Fiscal no catalogo tarefa_tipos (dev)"
```

---

### Task 2: Aviso de drift ao aplicar template (backend)

**Files:**
- Modify: `app/fiscal/parametros/actions.ts:117-159` (`aplicarTemplateAClientes`)
- Modify: `app/fiscal/parametros/actions.ts:179-221` (`aplicarTemplateGrupoAClientes`)

**Interfaces:**
- Produces: `aplicarTemplateAClientes`/`aplicarTemplateGrupoAClientes` passam a retornar `{ error?: string; atualizados: number; avisoForaCatalogo: string[] }` (campo novo, sempre presente, array vazio quando não há drift) — consumido pela Task 3 em `ParametrosClient.tsx`.
- Consumes: nenhuma interface de outra task deste plano (a Task 1 semeia dados que esta action passa a ler, mas o código compila e funciona mesmo antes da migration ser aplicada — só o array `avisoForaCatalogo` fica maior até lá).

- [ ] **Step 1: Adicionar a função `normalizarNome` no topo de `app/fiscal/parametros/actions.ts`, logo após os imports**

```ts
function normalizarNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}
```

- [ ] **Step 2: Modificar `aplicarTemplateAClientes` para calcular e retornar `avisoForaCatalogo`**

Substituir (linhas 117-159):

```ts
export async function aplicarTemplateAClientes(
  atividadeBase: string
): Promise<{ error?: string; atualizados: number }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', atualizados: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', atualizados: 0 }

  const { data: templateRow, error: templateErr } = await supabase
    .from('atividade_templates')
    .select('tarefas')
    .eq('atividade', atividadeBase)
    .single()

  if (templateErr && templateErr.code !== 'PGRST116') {
    return { error: templateErr.message, atualizados: 0 }
  }
  const tarefasBase: string[] = templateRow?.tarefas ?? []
  if (tarefasBase.length === 0) return { atualizados: 0 }

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
  return { atualizados }
}
```

por:

```ts
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
```

- [ ] **Step 3: Modificar `aplicarTemplateGrupoAClientes` da mesma forma**

Substituir (linhas 179-221):

```ts
export async function aplicarTemplateGrupoAClientes(
  grupo: string
): Promise<{ error?: string; atualizados: number }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', atualizados: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', atualizados: 0 }

  const { data: templateRow, error: templateErr } = await supabase
    .from('grupo_templates')
    .select('tarefas')
    .eq('grupo', grupo)
    .single()

  if (templateErr && templateErr.code !== 'PGRST116') {
    return { error: templateErr.message, atualizados: 0 }
  }
  const tarefasBase: string[] = templateRow?.tarefas ?? []
  if (tarefasBase.length === 0) return { atualizados: 0 }

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
  return { atualizados }
}
```

por:

```ts
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

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: erros apontando os dois call sites em `ParametrosClient.tsx` (`handleAplicarTemplate`/`handleAplicarTemplateGrupo`) que ainda não leem `avisoForaCatalogo` — isso é esperado, a Task 3 resolve. Confirmar que os erros são só nesses dois pontos (nenhum erro de tipo dentro do próprio `actions.ts`).

- [ ] **Step 5: Commit**

```bash
git add app/fiscal/parametros/actions.ts
git commit -m "feat: aplicar template de tarefas avisa nomes fora do catalogo tarefa_tipos"
```

---

### Task 3: Exibir o aviso de drift na UI

**Files:**
- Modify: `app/fiscal/parametros/ParametrosClient.tsx:138` (state `templateMsg`)
- Modify: `app/fiscal/parametros/ParametrosClient.tsx:156` (state `templateGrupoMsg`)
- Modify: `app/fiscal/parametros/ParametrosClient.tsx:489-498` (`handleAplicarTemplate`)
- Modify: `app/fiscal/parametros/ParametrosClient.tsx:522-531` (`handleAplicarTemplateGrupo`)
- Modify: `app/fiscal/parametros/ParametrosClient.tsx:949-956` (JSX do card de atividade)
- Modify: `app/fiscal/parametros/ParametrosClient.tsx:1040-1047` (JSX do card de grupo)

**Interfaces:**
- Consumes: `avisoForaCatalogo: string[]` retornado por `aplicarTemplateAClientes`/`aplicarTemplateGrupoAClientes` (Task 2).

- [ ] **Step 1: Adicionar estado para o aviso, logo abaixo de `templateMsg`/`templateGrupoMsg`**

Depois da linha 138 (`const [templateMsg, setTemplateMsg] = useState<Record<string, string>>({})`), adicionar:

```ts
  const [templateAviso, setTemplateAviso] = useState<Record<string, string[]>>({})
```

Depois da linha 156 (`const [templateGrupoMsg, setTemplateGrupoMsg] = useState<Record<string, string>>({})`), adicionar:

```ts
  const [templateGrupoAviso, setTemplateGrupoAviso] = useState<Record<string, string[]>>({})
```

- [ ] **Step 2: Atualizar `handleAplicarTemplate` para gravar o aviso**

Substituir (linhas 489-498):

```ts
  async function handleAplicarTemplate(base: string) {
    setAplicandoTemplate(base)
    const result = await aplicarTemplateAClientes(base)
    setAplicandoTemplate(null)
    const msg = result.error
      ? `Erro: ${result.error}`
      : `${result.atualizados} cliente(s) atualizados`
    setTemplateMsg(prev => ({ ...prev, [base + '_aplicar']: msg }))
    setTimeout(() => setTemplateMsg(prev => ({ ...prev, [base + '_aplicar']: '' })), 4000)
  }
```

por:

```ts
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
```

- [ ] **Step 3: Atualizar `handleAplicarTemplateGrupo` da mesma forma**

Substituir (linhas 522-531):

```ts
  async function handleAplicarTemplateGrupo(grupo: string) {
    setAplicandoTemplateGrupo(grupo)
    const result = await aplicarTemplateGrupoAClientes(grupo)
    setAplicandoTemplateGrupo(null)
    const msg = result.error
      ? `Erro: ${result.error}`
      : `${result.atualizados} cliente(s) atualizados`
    setTemplateGrupoMsg(prev => ({ ...prev, [grupo + '_aplicar']: msg }))
    setTimeout(() => setTemplateGrupoMsg(prev => ({ ...prev, [grupo + '_aplicar']: '' })), 4000)
  }
```

por:

```ts
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
```

- [ ] **Step 4: Exibir o banner no card de template por atividade**

Substituir (linhas 949-956):

```tsx
                  {templateMsg[base] && (
                    <p className={`text-xs text-center ${templateMsg[base].startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                      {templateMsg[base]}
                    </p>
                  )}
                  {templateMsg[base + '_aplicar'] && (
                    <p className="text-xs text-center text-blue-400">{templateMsg[base + '_aplicar']}</p>
                  )}
```

por:

```tsx
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
```

- [ ] **Step 5: Exibir o banner no card de template por grupo**

Substituir (linhas 1040-1047):

```tsx
                  {templateGrupoMsg[grupo] && (
                    <p className={`text-xs text-center ${templateGrupoMsg[grupo].startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                      {templateGrupoMsg[grupo]}
                    </p>
                  )}
                  {templateGrupoMsg[grupo + '_aplicar'] && (
                    <p className="text-xs text-center text-blue-400">{templateGrupoMsg[grupo + '_aplicar']}</p>
                  )}
```

por:

```tsx
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
```

- [ ] **Step 6: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add app/fiscal/parametros/ParametrosClient.tsx
git commit -m "feat: exibe aviso de nomes fora do catalogo ao aplicar template de tarefas"
```

---

### Task 4: Remover a ferramenta "Corrigir Tarefas" e aplicar a migration no dev

**Files:**
- Modify: `app/fiscal/parametros/actions.ts`
- Modify: `app/fiscal/parametros/ParametrosClient.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: nada — só remove código morto.

- [ ] **Step 1: Remover as 8 funções (+ tipos e `semAcento`) de `app/fiscal/parametros/actions.ts`**

Remover, na íntegra, os seguintes blocos (linhas conforme o arquivo antes desta task — conferir contexto antes de cada corte, já que a Task 2 já editou este arquivo):

1. `buscarDadosParaAlteracao` (função completa)
2. `renomearTarefaEmClientes` (função completa)
3. `excluirTarefaDeClientes` (função completa)
4. `preencherDataEmClientes` (função completa)
5. `buscarConclusoesTarefa` (função completa)
6. A interface `RegistroSemData` e a função `buscarTarefasSemData` (completas)
7. `excluirRegistrosDeTarefas` (função completa)
8. A função `semAcento` original (diferente da `normalizarNome` adicionada na Task 2 — `semAcento` só era usada pelas duas funções abaixo)
9. A interface `GrupoDuplicata` e a função `analisarTarefasDuplicadas` (completas)
10. O comentário `// mapeamento: ...` e a função `limparTarefasDuplicadas` (completos)

O arquivo passa de (imediatamente antes de `buscarDadosParaAlteracao`, depois de `aplicarTemplateGrupoAClientes`):

```ts
  revalidatePath('/fiscal/clientes')
  return { atualizados, avisoForaCatalogo }
}

export async function buscarDadosParaAlteracao(): Promise<{
```

para:

```ts
  revalidatePath('/fiscal/clientes')
  return { atualizados, avisoForaCatalogo }
}

const CAMPOS_MESCLAVEIS_PARCELAMENTO = [
```

(ou seja, tudo entre o fim de `aplicarTemplateGrupoAClientes` e a constante `CAMPOS_MESCLAVEIS_PARCELAMENTO` — que dá início às funções de parcelamentos duplicados, essas **não removidas** — sai inteiro.)

- [ ] **Step 2: Remover o import de `buscarTodasTarefas` (não usado mais neste arquivo)**

Trocar (linha 5, ou onde estiver após a Task 2):

```ts
import { buscarTodasTarefas } from '@/lib/tarefas-paginacao'
```

Remover essa linha inteira (as outras importações do topo do arquivo não mudam).

- [ ] **Step 3: Verificar compilação parcial**

Run: `npx tsc --noEmit -p . 2>&1 | grep parametros`
Expected: só erros em `ParametrosClient.tsx` (imports/usos de funções que acabaram de sumir de `actions.ts`) — nenhum erro dentro de `actions.ts` em si.

- [ ] **Step 4: Atualizar os imports no topo de `ParametrosClient.tsx`**

Substituir (linha 9-10):

```tsx
import { salvarTemplate, aplicarTemplateAClientes, salvarTemplateGrupo, aplicarTemplateGrupoAClientes, analisarTarefasDuplicadas, limparTarefasDuplicadas, buscarDadosParaAlteracao, renomearTarefaEmClientes, excluirTarefaDeClientes, preencherDataEmClientes, buscarConclusoesTarefa, buscarTarefasSemData, excluirRegistrosDeTarefas, analisarParcelamentosDuplicados, limparParcelamentosDuplicados } from './actions'
import type { GrupoDuplicata, RegistroSemData, GrupoParcelamentoDuplicado } from './actions'
```

por:

```tsx
import { salvarTemplate, aplicarTemplateAClientes, salvarTemplateGrupo, aplicarTemplateGrupoAClientes, analisarParcelamentosDuplicados, limparParcelamentosDuplicados } from './actions'
import type { GrupoParcelamentoDuplicado } from './actions'
```

- [ ] **Step 5: Remover o estado de "Remover tarefas duplicadas" e "Alteração em massa" e "Tarefas sem data"**

Remover (linhas 157-212, o bloco entre `// Parcelamentos duplicados` e `async function handleAnalisarDuplicatas`):

```ts
  const [analisando, setAnalisando] = useState(false)
  const [analise, setAnalise] = useState<{ grupos: GrupoDuplicata[]; todasTarefas: string[] } | null>(null)
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({})
  const [aplicando, setAplicando] = useState(false)
  const [duplicatasMsg, setDuplicatasMsg] = useState('')

  // Parcelamentos duplicados
  const [analisandoParcelamentos, setAnalisandoParcelamentos] = useState(false)
  const [analiseParcelamentos, setAnaliseParcelamentos] = useState<{ grupos: GrupoParcelamentoDuplicado[] } | null>(null)
  const [aplicandoParcelamentos, setAplicandoParcelamentos] = useState(false)
  const [parcelamentosMsg, setParcelamentosMsg] = useState('')

  // Alteração em massa
  const [carregandoDados, setCarregandoDados] = useState(false)
  const [dadosAlteracao, setDadosAlteracao] = useState<{
    todasTarefas: string[]
    clientes: { id: string; nome: string; tarefas: string[] }[]
  } | null>(null)
  const [modoAlteracao, setModoAlteracao] = useState<'renomear' | 'excluir' | 'data'>('renomear')
  const [tarefaOrigem, setTarefaOrigem] = useState('')
  const [tarefaDestino, setTarefaDestino] = useState('')
  const [dataPreenchimento, setDataPreenchimento] = useState('')
  const [mesPreenchimento, setMesPreenchimento] = useState(new Date().getMonth() + 1)
  const [anoPreenchimento, setAnoPreenchimento] = useState(new Date().getFullYear())
  const [clientesSelecionados, setClientesSelecionados] = useState<Set<string>>(new Set())
  const [aplicandoAlteracao, setAplicandoAlteracao] = useState(false)
  const [alteracaoMsg, setAlteracaoMsg] = useState('')
  const [concluidosData, setConcluidosData] = useState<Set<string> | null>(null)
  const [carregandoConcluidos, setCarregandoConcluidos] = useState(false)

  useEffect(() => {
    if (modoAlteracao !== 'data' || !tarefaOrigem) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com o servidor (busca de conclusoes) ao trocar de tarefa/modo
      setConcluidosData(null)
      return
    }
    let cancelado = false
    setCarregandoConcluidos(true)
    buscarConclusoesTarefa(tarefaOrigem, mesPreenchimento, anoPreenchimento).then(result => {
      if (cancelado) return
      setCarregandoConcluidos(false)
      const concluidos = new Set(result.clienteIdsConcluidos)
      setConcluidosData(concluidos)
      setClientesSelecionados(prev => new Set(Array.from(prev).filter(id => !concluidos.has(id))))
    })
    return () => { cancelado = true }
  }, [modoAlteracao, tarefaOrigem, mesPreenchimento, anoPreenchimento])

  // Tarefas sem data
  const [analisandoSemData, setAnalisandoSemData] = useState(false)
  const [mesFiltroSemData, setMesFiltroSemData] = useState(6)
  const [anoFiltroSemData, setAnoFiltroSemData] = useState(new Date().getFullYear())
  const [dadosSemData, setDadosSemData] = useState<{ registros: RegistroSemData[]; totalRegistros: number } | null>(null)
  const [selecionadosSemData, setSelecionadosSemData] = useState<Set<string>>(new Set())  // chaves "tipo||mes||ano"
  const [excluindoSemData, setExcluindoSemData] = useState(false)
  const [semDataMsg, setSemDataMsg] = useState('')
```

por (mantendo só o bloco de parcelamentos):

```ts
  // Parcelamentos duplicados
  const [analisandoParcelamentos, setAnalisandoParcelamentos] = useState(false)
  const [analiseParcelamentos, setAnaliseParcelamentos] = useState<{ grupos: GrupoParcelamentoDuplicado[] } | null>(null)
  const [aplicandoParcelamentos, setAplicandoParcelamentos] = useState(false)
  const [parcelamentosMsg, setParcelamentosMsg] = useState('')
```

- [ ] **Step 6: Remover os handlers da ferramenta**

Remover (agora logo após `handleSalvarTemplateGrupo`/`handleAplicarTemplateGrupo`/etc., mas antes de `handleSaveComunicado` — usar o texto abaixo para localizar): `handleAnalisarDuplicatas`, `handleAplicarLimpeza` (manter `handleAnalisarParcelamentosDuplicados`/`handleAplicarLimpezaParcelamentos`), `handleCarregarDados`, `handleSelecionarTarefaOrigem`, `handleAplicarAlteracao`, `handleAnalisarSemData`, `handleExcluirSemData`.

Substituir o bloco:

```ts
  async function handleAnalisarDuplicatas() {
    setAnalisando(true)
    setDuplicatasMsg('')
    setAnalise(null)
    const result = await analisarTarefasDuplicadas()
    setAnalisando(false)
    if (result.error) { setDuplicatasMsg(`Erro: ${result.error}`); return }
    if (result.grupos.length === 0) { setDuplicatasMsg('Nenhuma duplicata encontrada.'); return }
    // Pré-preenche mapeamento com sugestões automáticas
    const map: Record<string, string> = {}
    for (const g of result.grupos) map[g.normalizado] = g.sugerido ?? g.versoes[0]
    setMapeamento(map)
    setAnalise(result)
  }

  async function handleAplicarLimpeza() {
    setAplicando(true)
    const result = await limparTarefasDuplicadas(mapeamento)
    setAplicando(false)
    setAnalise(null)
    if (result.error) {
      setDuplicatasMsg(`Erro: ${result.error}`)
    } else {
      setDuplicatasMsg(`Concluído — ${result.clientesAtualizados} cliente(s) corrigidos, ${result.tarefasCorrigidas} registro(s) de tarefa atualizados`)
    }
  }

  async function handleAnalisarParcelamentosDuplicados() {
```

por:

```ts
  async function handleAnalisarParcelamentosDuplicados() {
```

E substituir o bloco (que hoje vem depois de `handleAplicarLimpezaParcelamentos`, antes de `handleSaveComunicado`):

```ts
  async function handleCarregarDados() {
    setCarregandoDados(true)
    setAlteracaoMsg('')
    const result = await buscarDadosParaAlteracao()
    setCarregandoDados(false)
    if (result.error) { setAlteracaoMsg(`Erro: ${result.error}`); return }
    setDadosAlteracao(result)
    setTarefaOrigem('')
    setTarefaDestino('')
    setClientesSelecionados(new Set())
  }

  function handleSelecionarTarefaOrigem(tarefa: string) {
    setTarefaOrigem(tarefa)
    setTarefaDestino(tarefa)
    if (!dadosAlteracao) return
    const ids = dadosAlteracao.clientes
      .filter(c => c.tarefas.includes(tarefa))
      .map(c => c.id)
    setClientesSelecionados(new Set(ids))
  }

  async function handleAplicarAlteracao() {
    if (!tarefaOrigem) { setAlteracaoMsg('Selecione uma tarefa.'); return }
    if (clientesSelecionados.size === 0) { setAlteracaoMsg('Selecione ao menos um cliente.'); return }
    const ids = Array.from(clientesSelecionados)

    setAplicandoAlteracao(true)
    let msg = ''

    if (modoAlteracao === 'renomear') {
      if (!tarefaDestino) { setAlteracaoMsg('Selecione o novo nome.'); setAplicandoAlteracao(false); return }
      const r = await renomearTarefaEmClientes(tarefaOrigem, tarefaDestino, ids)
      msg = r.error ? `Erro: ${r.error}` : `Concluído — ${r.clientesAtualizados} cliente(s) renomeados, ${r.tarefasCorrigidas} registro(s) corrigidos`
    } else if (modoAlteracao === 'excluir') {
      const r = await excluirTarefaDeClientes(tarefaOrigem, ids)
      msg = r.error ? `Erro: ${r.error}` : `Concluído — tarefa removida de ${r.clientesAtualizados} cliente(s), ${r.registrosExcluidos} registro(s) excluídos`
    } else {
      if (!dataPreenchimento) { setAlteracaoMsg('Selecione a data.'); setAplicandoAlteracao(false); return }
      const r = await preencherDataEmClientes(tarefaOrigem, mesPreenchimento, anoPreenchimento, dataPreenchimento, ids)
      msg = r.error ? `Erro: ${r.error}` : `Concluído — ${r.registrosAtualizados} registro(s) marcados como concluídos`
    }

    setAplicandoAlteracao(false)
    setAlteracaoMsg(msg)
    if (!msg.startsWith('Erro')) {
      setDadosAlteracao(null)
      setTarefaOrigem('')
      setTarefaDestino('')
      setClientesSelecionados(new Set())
    }
  }

  async function handleAnalisarSemData() {
    setAnalisandoSemData(true)
    setSemDataMsg('')
    setDadosSemData(null)
    setSelecionadosSemData(new Set())
    const result = await buscarTarefasSemData(mesFiltroSemData, anoFiltroSemData)
    setAnalisandoSemData(false)
    if (result.error) { setSemDataMsg(`Erro: ${result.error}`); return }
    if (result.totalRegistros === 0) { setSemDataMsg('Nenhum registro sem data encontrado.'); return }
    setDadosSemData(result)
    // Pré-seleciona todos
    setSelecionadosSemData(new Set(result.registros.map(r => `${r.tipo}||${r.mes}||${r.ano}`)))
  }

  async function handleExcluirSemData() {
    if (!dadosSemData || selecionadosSemData.size === 0) return
    const ids = dadosSemData.registros
      .filter(r => selecionadosSemData.has(`${r.tipo}||${r.mes}||${r.ano}`))
      .flatMap(r => r.ids)
    setExcluindoSemData(true)
    const result = await excluirRegistrosDeTarefas(ids)
    setExcluindoSemData(false)
    if (result.error) {
      setSemDataMsg(`Erro: ${result.error}`)
    } else {
      setSemDataMsg(`Concluído — ${result.excluidos} registro(s) excluídos`)
      setDadosSemData(null)
      setSelecionadosSemData(new Set())
    }
  }

  async function handleSaveComunicado() {
```

por:

```ts
  async function handleSaveComunicado() {
```

- [ ] **Step 7: Remover a JSX de "Remover tarefas duplicadas", "Alteração em massa" e "Tarefas sem data" (mantendo "Remover parcelamentos duplicados" e os dois Divisores ao redor dela)**

Dentro do painel "Manutenção de Dados", substituir todo o trecho desde `<p ... >Remover tarefas duplicadas</p>` até o Divisor logo antes de "Remover parcelamentos duplicados":

```tsx
          <p className="text-[var(--fg)]/60 text-sm font-medium mb-1">Remover tarefas duplicadas</p>
          <p className="text-[var(--fg)]/30 text-xs mb-4">
            Analisa todos os clientes e identifica tarefas repetidas com grafias diferentes (ex: "SAIDAS" e "SAÍDAS"). Você confirma qual versão manter antes de aplicar.
          </p>

          {/* Etapa 1: botão Analisar */}
          {!analise && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleAnalisarDuplicatas}
                disabled={analisando}
                className="px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-semibold hover:bg-orange-500/30 transition-colors disabled:opacity-50">
                {analisando ? 'Analisando...' : 'Analisar duplicatas'}
              </button>
              {duplicatasMsg && (
                <p className={`text-xs ${duplicatasMsg.startsWith('Erro') ? 'text-red-400' : duplicatasMsg.startsWith('Nenhuma') ? 'text-[var(--fg)]/40' : 'text-green-400'}`}>
                  {duplicatasMsg}
                </p>
              )}
            </div>
          )}

          {/* Etapa 2: preview + confirmação */}
          {analise && (
            <div className="flex flex-col gap-4">
              <p className="text-[var(--fg)]/50 text-xs">
                {analise.grupos.length} grupo(s) de duplicata encontrado(s). Confirme qual versão manter para cada um:
              </p>

              <div className="rounded-xl border border-[var(--fg)]/8 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--fg)]/8 bg-[var(--fg)]/3">
                      <th className="text-left px-4 py-2.5 text-[var(--fg)]/40 font-semibold">Versões encontradas</th>
                      <th className="text-left px-4 py-2.5 text-[var(--fg)]/40 font-semibold">Manter como</th>
                      <th className="text-right px-4 py-2.5 text-[var(--fg)]/40 font-semibold">Clientes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analise.grupos.map(g => (
                      <tr key={g.normalizado} className="border-b border-[var(--fg)]/5 last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {g.versoes.map(v => (
                              <span key={v} className={`px-2 py-0.5 rounded text-[11px] border ${mapeamento[g.normalizado] === v ? 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60' : 'bg-red-500/10 border-red-500/20 text-red-300 line-through'}`}>
                                {v}
                              </span>
                            ))}
                          </div>
                          {!g.sugerido && (
                            <p className="text-yellow-400/70 text-[10px] mt-1">⚠ Sem versão com acento detectada — selecione manualmente</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={mapeamento[g.normalizado] ?? ''}
                            onChange={e => setMapeamento(prev => ({ ...prev, [g.normalizado]: e.target.value }))}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50 w-full max-w-[220px] bg-[var(--bg-surface)]">
                            <optgroup label="Versões encontradas">
                              {g.versoes.map(v => <option key={v} value={v}>{v}</option>)}
                            </optgroup>
                            <optgroup label="Outras tarefas cadastradas">
                              {analise.todasTarefas.filter(t => !g.versoes.includes(t)).map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </optgroup>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--fg)]/40">
                          {g.clientesAfetados}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleAplicarLimpeza}
                  disabled={aplicando}
                  className="px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-semibold hover:bg-orange-500/30 transition-colors disabled:opacity-50">
                  {aplicando ? 'Aplicando...' : 'Confirmar e aplicar'}
                </button>
                <button
                  onClick={() => { setAnalise(null); setDuplicatasMsg('') }}
                  className="px-4 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/40 text-xs hover:bg-[var(--fg)]/10 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Divisor */}
          <div className="border-t border-[var(--fg)]/8 my-6" />

          {/* Remover parcelamentos duplicados */}
```

por:

```tsx
          {/* Remover parcelamentos duplicados */}
```

E substituir o trecho desde o Divisor logo depois do bloco de parcelamentos até o fim de "Tarefas sem data" (ou seja, tudo entre o fechamento da seção de parcelamentos e o `</div>` de fechamento do painel "Manutenção de Dados"):

```tsx
          {/* Divisor */}
          <div className="border-t border-[var(--fg)]/8 my-6" />

          {/* Alteração em massa */}
          <p className="text-[var(--fg)]/60 text-sm font-medium mb-1">Alteração em massa de tarefa</p>
          <p className="text-[var(--fg)]/30 text-xs mb-4">
            Selecione uma tarefa, escolha os clientes e informe o novo nome. Aplica em todos os selecionados de uma vez.
          </p>

          {!dadosAlteracao ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleCarregarDados}
                disabled={carregandoDados}
                className="px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-300 text-xs font-semibold hover:bg-violet-500/30 transition-colors disabled:opacity-50">
                {carregandoDados ? 'Carregando...' : 'Carregar tarefas'}
              </button>
              {alteracaoMsg && (
                <p className={`text-xs ${alteracaoMsg.startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                  {alteracaoMsg}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Seletor de modo */}
              <div className="flex gap-1.5">
                {([['renomear', 'Renomear'], ['excluir', 'Excluir'], ['data', 'Preencher data']] as const).map(([modo, label]) => (
                  <button
                    key={modo}
                    onClick={() => { setModoAlteracao(modo); setAlteracaoMsg('') }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${modoAlteracao === modo ? 'bg-violet-500/30 border border-violet-500/50 text-violet-200' : 'bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/40 hover:text-[var(--fg)]/70 hover:bg-[var(--fg)]/10'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Tarefa de origem (comum a todos os modos) */}
              <div>
                <label className={labelCls}>Tarefa</label>
                <select
                  value={tarefaOrigem}
                  onChange={e => handleSelecionarTarefaOrigem(e.target.value)}
                  className="w-full max-w-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50">
                  <option value="">— selecione —</option>
                  {dadosAlteracao.todasTarefas.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Campo específico por modo */}
              {modoAlteracao === 'renomear' && (
                <div>
                  <label className={labelCls}>Renomear para</label>
                  <select
                    value={tarefaDestino}
                    onChange={e => setTarefaDestino(e.target.value)}
                    className="w-full max-w-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50">
                    <option value="">— selecione o novo nome —</option>
                    {dadosAlteracao.todasTarefas.filter(t => t !== tarefaOrigem).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}

              {modoAlteracao === 'excluir' && tarefaOrigem && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                  <p className="text-red-300 text-xs">A tarefa <span className="font-semibold">'{tarefaOrigem}'</span> será removida da lista de cada cliente selecionado e todos os seus registros históricos serão excluídos.</p>
                </div>
              )}

              {modoAlteracao === 'data' && (
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className={labelCls}>Mês</label>
                    <select
                      value={mesPreenchimento}
                      onChange={e => setMesPreenchimento(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50">
                      {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => (
                        <option key={i} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Ano</label>
                    <input
                      type="number"
                      value={anoPreenchimento}
                      onChange={e => setAnoPreenchimento(Number(e.target.value))}
                      min={2020} max={2099}
                      className="w-24 px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Data de conclusão</label>
                    <input
                      type="date"
                      value={dataPreenchimento}
                      onChange={e => setDataPreenchimento(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50"
                    />
                  </div>
                </div>
              )}

              {/* Lista de clientes */}
              {tarefaOrigem && modoAlteracao === 'data' && carregandoConcluidos && (
                <p className="text-[var(--fg)]/30 text-xs py-2">Verificando quem já tem essa data preenchida...</p>
              )}
              {tarefaOrigem && !(modoAlteracao === 'data' && carregandoConcluidos) && (() => {
                let filtrados = dadosAlteracao.clientes.filter(c => c.tarefas.includes(tarefaOrigem))
                if (modoAlteracao === 'data' && concluidosData) {
                  filtrados = filtrados.filter(c => !concluidosData.has(c.id))
                }
                const todosSelected = filtrados.length > 0 && filtrados.every(c => clientesSelecionados.has(c.id))
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[var(--fg)]/40 text-xs">
                        {filtrados.length} cliente(s) {modoAlteracao === 'data' ? 'sem essa data preenchida' : 'com essa tarefa'}
                      </p>
                      {filtrados.length > 0 && (
                        <button
                          onClick={() => setClientesSelecionados(
                            todosSelected ? new Set() : new Set(filtrados.map(c => c.id))
                          )}
                          className="text-[var(--accent)] text-xs hover:underline">
                          {todosSelected ? 'Limpar seleção' : 'Selecionar todos'}
                        </button>
                      )}
                    </div>
                    {filtrados.length === 0 ? (
                      <p className="text-[var(--fg)]/20 text-xs py-2">
                        {modoAlteracao === 'data' ? 'Todos os clientes com essa tarefa já têm essa data preenchida.' : 'Nenhum cliente possui essa tarefa.'}
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                        {filtrados.map(c => (
                          <label key={c.id} className="flex items-center gap-2 cursor-pointer select-none px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/3 border border-[var(--fg)]/6 hover:bg-[var(--fg)]/6 transition-colors">
                            <input
                              type="checkbox"
                              checked={clientesSelecionados.has(c.id)}
                              onChange={e => {
                                const next = new Set(clientesSelecionados)
                                if (e.target.checked) next.add(c.id); else next.delete(c.id)
                                setClientesSelecionados(next)
                              }}
                              className="w-3.5 h-3.5 accent-[var(--accent)] shrink-0"
                            />
                            <span className="text-[var(--fg)]/70 text-xs truncate">{c.nome}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Preview */}
              {tarefaOrigem && clientesSelecionados.size > 0 && (
                <div className="rounded-lg bg-[var(--fg)]/3 border border-[var(--fg)]/8 px-4 py-3 text-xs text-[var(--fg)]/60">
                  {modoAlteracao === 'renomear' && tarefaDestino && tarefaDestino !== tarefaOrigem && (
                    <>Renomear <span className="text-[var(--fg)] font-semibold">'{tarefaOrigem}'</span> → <span className="text-[var(--accent)] font-semibold">'{tarefaDestino}'</span> em <span className="text-[var(--fg)] font-semibold">{clientesSelecionados.size}</span> cliente(s)</>
                  )}
                  {modoAlteracao === 'excluir' && (
                    <>Excluir <span className="text-[var(--fg)] font-semibold">'{tarefaOrigem}'</span> de <span className="text-[var(--fg)] font-semibold">{clientesSelecionados.size}</span> cliente(s)</>
                  )}
                  {modoAlteracao === 'data' && dataPreenchimento && (
                    <>Marcar <span className="text-[var(--fg)] font-semibold">'{tarefaOrigem}'</span> como concluída em <span className="text-[var(--accent)] font-semibold">{new Date(dataPreenchimento + 'T12:00:00').toLocaleDateString('pt-BR')}</span> para <span className="text-[var(--fg)] font-semibold">{clientesSelecionados.size}</span> cliente(s) — {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][mesPreenchimento - 1]}/{anoPreenchimento}</>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleAplicarAlteracao}
                  disabled={aplicandoAlteracao || !tarefaOrigem || clientesSelecionados.size === 0}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${modoAlteracao === 'excluir' ? 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30' : 'bg-violet-500/20 border border-violet-500/40 text-violet-300 hover:bg-violet-500/30'}`}>
                  {aplicandoAlteracao ? 'Aplicando...' : 'Confirmar e aplicar'}
                </button>
                <button
                  onClick={() => { setDadosAlteracao(null); setAlteracaoMsg('') }}
                  className="px-4 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/40 text-xs hover:bg-[var(--fg)]/10 transition-colors">
                  Cancelar
                </button>
                {alteracaoMsg && (
                  <p className={`text-xs ${alteracaoMsg.startsWith('Erro') || alteracaoMsg.startsWith('Selecione') ? 'text-red-400' : 'text-green-400'}`}>
                    {alteracaoMsg}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Divisor */}
          <div className="border-t border-[var(--fg)]/8 my-6" />

          {/* Tarefas sem data */}
          <p className="text-[var(--fg)]/60 text-sm font-medium mb-1">Registros sem data de conclusão</p>
          <p className="text-[var(--fg)]/30 text-xs mb-4">
            Cruza todos os clientes com suas tarefas personalizadas e lista as que não têm data de conclusão no mês/ano selecionado.
          </p>

          {!dadosSemData ? (
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={mesFiltroSemData}
                onChange={e => { setMesFiltroSemData(Number(e.target.value)); setDadosSemData(null); setSemDataMsg('') }}
                className="px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/80 text-xs">
                {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((nome, i) => (
                  <option key={i+1} value={i+1}>{nome}</option>
                ))}
              </select>
              <select
                value={anoFiltroSemData}
                onChange={e => { setAnoFiltroSemData(Number(e.target.value)); setDadosSemData(null); setSemDataMsg('') }}
                className="px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/80 text-xs">
                {[2024, 2025, 2026, 2027].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <button
                onClick={handleAnalisarSemData}
                disabled={analisandoSemData}
                className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold hover:bg-rose-500/30 transition-colors disabled:opacity-50">
                {analisandoSemData ? 'Analisando...' : 'Analisar registros sem data'}
              </button>
              {semDataMsg && (
                <p className={`text-xs ${semDataMsg.startsWith('Erro') ? 'text-red-400' : semDataMsg.startsWith('Nenhum') ? 'text-[var(--fg)]/40' : 'text-green-400'}`}>
                  {semDataMsg}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-[var(--fg)]/40 text-xs">{dadosSemData.totalRegistros} tarefa(s) sem conclusão em {dadosSemData.registros.length} tipo(s) — {dadosSemData.registros.reduce((s, r) => s + r.ids.length, 0)} com registro excluível</p>
                <button
                  onClick={() => setSelecionadosSemData(
                    selecionadosSemData.size === dadosSemData.registros.length
                      ? new Set()
                      : new Set(dadosSemData.registros.map(r => `${r.tipo}||${r.mes}||${r.ano}`))
                  )}
                  className="text-[var(--accent)] text-xs hover:underline">
                  {selecionadosSemData.size === dadosSemData.registros.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>

              <div className="rounded-xl border border-[var(--fg)]/8 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--fg)]/8 bg-[var(--fg)]/3">
                      <th className="w-8 px-3 py-2.5"></th>
                      <th className="text-left px-3 py-2.5 text-[var(--fg)]/40 font-semibold">Tarefa</th>
                      <th className="text-left px-3 py-2.5 text-[var(--fg)]/40 font-semibold">Mês/Ano</th>
                      <th className="text-right px-3 py-2.5 text-[var(--fg)]/40 font-semibold">Registros</th>
                      <th className="text-left px-3 py-2.5 text-[var(--fg)]/40 font-semibold">Clientes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosSemData.registros.map(r => {
                      const key = `${r.tipo}||${r.mes}||${r.ano}`
                      const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
                      return (
                        <tr key={key} className="border-b border-[var(--fg)]/5 last:border-0 hover:bg-[var(--fg)]/2">
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={selecionadosSemData.has(key)}
                              onChange={e => {
                                const next = new Set(selecionadosSemData)
                                if (e.target.checked) next.add(key); else next.delete(key)
                                setSelecionadosSemData(next)
                              }}
                              className="w-3.5 h-3.5 accent-rose-400"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-[var(--fg)] font-medium">{r.tipo}</td>
                          <td className="px-3 py-2.5 text-[var(--fg)]/60">{meses[r.mes - 1]}/{r.ano}</td>
                          <td className="px-3 py-2.5 text-right text-[var(--fg)]/50">
                            {r.total}
                            {r.semRegistro > 0 && <span className="ml-1 text-[var(--fg)]/25 text-[10px]">({r.semRegistro} s/reg)</span>}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--fg)]/40 truncate max-w-[260px]">{r.clientes.join(', ')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleExcluirSemData}
                  disabled={excluindoSemData || selecionadosSemData.size === 0}
                  className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50">
                  {excluindoSemData ? 'Excluindo...' : `Excluir selecionados (${[...selecionadosSemData].reduce((acc, key) => acc + (dadosSemData.registros.find(r => `${r.tipo}||${r.mes}||${r.ano}` === key)?.ids.length ?? 0), 0)} registros)`}
                </button>
                <button
                  onClick={() => { setDadosSemData(null); setSemDataMsg('') }}
                  className="px-4 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/40 text-xs hover:bg-[var(--fg)]/10 transition-colors">
                  Cancelar
                </button>
                {semDataMsg && (
                  <p className={`text-xs ${semDataMsg.startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                    {semDataMsg}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        </DevLock>
      </div>
```

por:

```tsx
        </div>
        </DevLock>
      </div>
```

- [ ] **Step 8: Build completo**

Run: `npx tsc --noEmit -p .`
Expected: sem erros. Confirmar que não sobrou nenhuma referência a `analise`, `mapeamento`, `dadosAlteracao`, `tarefaOrigem`, `tarefaDestino`, `dadosSemData`, `GrupoDuplicata`, `RegistroSemData`, `buscarDadosParaAlteracao`, `renomearTarefaEmClientes`, `excluirTarefaDeClientes`, `preencherDataEmClientes`, `buscarConclusoesTarefa`, `buscarTarefasSemData`, `excluirRegistrosDeTarefas`, `analisarTarefasDuplicadas`, `limparTarefasDuplicadas`, `semAcento` em nenhum dos dois arquivos.

Run: `npm run build`
Expected: build limpo, mesmas 38 rotas de antes (nenhuma rota nova ou removida — `/fiscal/admin` com `CorrigirTarefasClient` continua existindo, intocada).

- [ ] **Step 9: Commit**

```bash
git add app/fiscal/parametros/actions.ts app/fiscal/parametros/ParametrosClient.tsx
git commit -m "refactor: remove ferramenta Corrigir Tarefas de /fiscal/parametros (renomear/excluir/preencher data em massa, dedupe por acento)"
```

- [ ] **Step 10: Aplicar a migration da Task 1 no dev (controller, via REST insert com a service role key — não subagent)**

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.development.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tipos = ['SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF','DAS'];
sb.from('tarefa_tipos').insert(tipos.map(nome => ({ setor: 'fiscal', nome, etapas: null, tipo_resposta: 'data' }))).then(r => console.log(r.error ?? 'OK', r.data));
"
```

Verificar via SQL Editor do Supabase de dev ou uma query rápida:

```sql
select nome, etapas, tipo_resposta from tarefa_tipos where setor = 'fiscal' order by nome;
```

Expected: 17 linhas ao todo (`ENTRADA`, `SAIDAS` da Fase 2 parte 1, mais os 15 novos), todas com `tipo_resposta = 'data'`, e as 15 novas com `etapas` nulo.

- [ ] **Step 11: Roteiro de teste manual (documentado — só executar se o usuário pedir)**

1. Abrir um cliente Fiscal de teste no dev que tenha alguma dessas 15 tarefas na lista (ex: `SIGET`, `DAS`) — confirmar que continua renderizando como campo de data simples, sem mudança visível.
2. Em `/fiscal/parametros`, aplicar um template de atividade ou de grupo que tenha pelo menos um nome fora do catálogo (ex: editar um template temporariamente adicionando uma tarefa nova tipo "TESTE XYZ") e confirmar que o banner amarelo aparece com esse nome, mas os clientes são atualizados normalmente.
3. Confirmar que a seção "Manutenção de Dados" em `/fiscal/parametros` só mostra mais "Remover parcelamentos duplicados" (sem "Remover tarefas duplicadas", "Alteração em massa" ou "Tarefas sem data").
4. Confirmar que `/fiscal/admin` (ferramenta de corrigir caracteres corrompidos) continua funcionando normalmente, sem relação com o que foi removido.

- [ ] **Step 12: Nota final**

Se os Steps 8 e 10 passarem limpo, a feature está pronta para o usuário revisar/testar manualmente quando quiser, seguindo `superpowers:finishing-a-development-branch` — manter a branch `feat/motor-tarefas-setor` como está (sem push/merge), como em todas as frentes anteriores. Nenhuma parte desta mudança é aplicável em produção ainda — só existe no banco de dev até a sincronização da branch ser decidida.
