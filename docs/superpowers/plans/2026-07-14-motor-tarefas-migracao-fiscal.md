# Migração de dados do Fiscal para `clientes_fiscal` + `tarefas.setor` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover os campos operacionais do Fiscal (`cod, regime, atividade, responsavel, grupo, obs, prioridade, envia_iss, confere_siga, login_iss, senha_iss, email_envio_iss, declaracao_anual, tarefas_personalizadas`) de `clientes` para uma tabela nova `clientes_fiscal` (1:1), e dar à tabela `tarefas` uma coluna `setor` — sem nenhuma mudança de comportamento observável no Fiscal. Esta é a Parte 1 do plano descrito em [2026-07-14-motor-tarefas-por-setor-contabil-design.md](../specs/2026-07-14-motor-tarefas-por-setor-contabil-design.md) (passos 1-2 da "Ordem de migração"); a Parte 2 (schema do Contábil + componentes compartilhados) e a Parte 3 (páginas do Contábil) são planos separados, escritos depois que esta migração estiver validada.

**Architecture:** Uma migration SQL cria `clientes_fiscal` (FK 1:1 `cliente_id -> clientes.id`), copia os dados, remove as colunas de `clientes`, adiciona `tarefas.setor`, e ajusta RLS. No código, toda leitura de cliente no Fiscal passa a usar `select('*, clientes_fiscal!inner(*)')` seguido de um helper `flattenClienteFiscal()` que devolve um objeto plano com as mesmas propriedades de antes — minimizando a mudança no resto de cada arquivo, já que quase todo o código hoje lê `cliente.responsavel`, `cliente.grupo` etc. diretamente. Toda leitura/escrita em `tarefas` ganha `.eq('setor', 'fiscal')` explícito.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + PostgREST + RLS), TypeScript, sem framework de testes automatizado neste repo — verificação é `npx tsc --noEmit -p .` a cada task, e verificação manual no navegador feita pelo usuário (não pelo implementador).

## Global Constraints

- **Nenhuma mudança de comportamento observável no Fiscal.** Este plano é migração pura — se qualquer tela do Fiscal parecer ou se comportar diferente depois, é bug.
- Rodar cada passo de SQL contra o Supabase de dev (`fcpcorqquovvgtoukxry`) antes de seguir pro próximo — nunca contra produção.
- Sem framework de testes neste repo. Verificação por task = `npx tsc --noEmit -p .` limpo. Não iniciar servidor de dev nem fazer verificação de navegador — o usuário faz essa parte (ver [[feedback-no-unsolicited-testing]]).
- Toda query nova ou modificada contra `tarefas` deve incluir `.eq('setor', 'fiscal')` explicitamente — não depender apenas do default da coluna.
- `clientes.mit`, `clientes.municipio`, `clientes.uf`, `clientes.tarefas_custom` **não são tocados** neste plano — ficam exatamente como estão.
- Não mexer em `scripts/*.ts` (scripts de manutenção один-off) — ficam quebrados contra o schema novo até alguém os atualizar depois; fora de escopo deste plano.
- Cada task termina com `git commit` próprio.

---

### Task 1: Migration SQL — `clientes_fiscal` + `tarefas.setor` + RLS

**Files:**
- Create: `supabase/migrations/006_clientes_fiscal_e_tarefas_setor.sql`

**Interfaces:**
- Produces: tabela `clientes_fiscal(cliente_id uuid PK/FK, cod, regime, atividade, responsavel, grupo, obs, prioridade, envia_iss, confere_siga, login_iss, senha_iss, email_envio_iss, declaracao_anual, tarefas_personalizadas)`; coluna `tarefas.setor user_setor not null`; constraint única `tarefas_cliente_mes_ano_tipo_setor_key (cliente_id, mes, ano, tipo, setor)`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/006_clientes_fiscal_e_tarefas_setor.sql

-- ============================================================
-- Move os campos operacionais do Fiscal de `clientes` para uma
-- tabela filha `clientes_fiscal` (1:1), e adiciona `tarefas.setor`.
-- Ver docs/superpowers/specs/2026-07-14-motor-tarefas-por-setor-contabil-design.md
-- ============================================================

create table clientes_fiscal (
  cliente_id              uuid primary key references clientes(id) on delete cascade,
  cod                     text,
  regime                  text,
  atividade               text,
  responsavel             text,
  grupo                   text default 'normal',
  obs                     text,
  prioridade              integer default 0,
  envia_iss               boolean default false,
  confere_siga            boolean default false,
  login_iss               text,
  senha_iss               text,
  email_envio_iss         text,
  declaracao_anual        boolean default false,
  tarefas_personalizadas  text[] not null default '{}'
);

insert into clientes_fiscal (
  cliente_id, cod, regime, atividade, responsavel, grupo, obs, prioridade,
  envia_iss, confere_siga, login_iss, senha_iss, email_envio_iss,
  declaracao_anual, tarefas_personalizadas
)
select
  id, cod, regime, atividade, responsavel, grupo, obs, prioridade,
  envia_iss, confere_siga, login_iss, senha_iss, email_envio_iss,
  declaracao_anual, tarefas_personalizadas
from clientes;

alter table clientes
  drop column cod,
  drop column regime,
  drop column atividade,
  drop column responsavel,
  drop column grupo,
  drop column obs,
  drop column prioridade,
  drop column envia_iss,
  drop column confere_siga,
  drop column login_iss,
  drop column senha_iss,
  drop column email_envio_iss,
  drop column declaracao_anual,
  drop column tarefas_personalizadas;

create index idx_clientes_fiscal_responsavel on clientes_fiscal (lower(responsavel));
create index idx_clientes_fiscal_grupo on clientes_fiscal (grupo);

-- tarefas.setor
alter table tarefas add column setor user_setor not null default 'fiscal';
alter table tarefas alter column setor drop default;

alter table tarefas drop constraint if exists tarefas_cliente_mes_ano_tipo_key;
alter table tarefas add constraint tarefas_cliente_mes_ano_tipo_setor_key
  unique (cliente_id, mes, ano, tipo, setor);

-- ---------- RLS: clientes_fiscal ----------
alter table clientes_fiscal enable row level security;

create policy "Setor fiscal le dados fiscais" on clientes_fiscal for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and 'fiscal' = any(p.setores)
  )
);

create policy "Admin gerencia dados fiscais" on clientes_fiscal for all using (is_admin());

create policy "Responsavel atualiza seus dados fiscais" on clientes_fiscal for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and lower(p.nome) = lower(clientes_fiscal.responsavel))
);

-- ---------- RLS: clientes (repõe a policy que dependia de responsavel) ----------
drop policy if exists "Responsavel atualiza seu cliente" on clientes;
create policy "Responsavel atualiza seu cliente" on clientes for update using (
  exists (
    select 1 from clientes_fiscal cf
    join profiles p on p.id = auth.uid()
    where cf.cliente_id = clientes.id and lower(p.nome) = lower(cf.responsavel)
  )
);

-- ---------- RLS: tarefas (isola leitura por setor) ----------
drop policy if exists "Autenticados leem tarefas" on tarefas;
create policy "Setor le suas tarefas" on tarefas for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and tarefas.setor = any(p.setores)
  )
);
```

- [ ] **Step 2: Aplicar no Supabase de dev**

Run: `SUPABASE_ACCESS_TOKEN=<token de dev novo, gerado após a rotação> npx supabase db push --password '<senha do banco de dev>' --yes`

(Gerar credenciais novas se necessário — as antigas citadas em sessões anteriores já foram rotacionadas. Ver [[reference-supabase-dev-project]].)

Expected: migration aplicada sem erro; `select count(*) from clientes_fiscal` no SQL editor do Supabase retorna o mesmo número de linhas que `select count(*) from clientes`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_clientes_fiscal_e_tarefas_setor.sql
git commit -m "feat(db): cria clientes_fiscal e tarefas.setor, migra dados do Fiscal"
```

---

### Task 2: Camada compartilhada — `lib/types.ts`, `lib/clientes-fiscal.ts`, `lib/tarefas-paginacao.ts`, `lib/supabase/server.ts`

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/clientes-fiscal.ts`
- Modify: `lib/tarefas-paginacao.ts`
- Modify: `lib/supabase/server.ts`

**Interfaces:**
- Produces: `interface ClienteFiscal { cliente_id: string; cod: string | null; regime: string | null; atividade: string | null; responsavel: string | null; grupo: string | null; obs: string | null; prioridade: number; envia_iss: boolean; confere_siga: boolean; login_iss: string | null; senha_iss: string | null; email_envio_iss: string | null; declaracao_anual: boolean; tarefas_personalizadas: string[] }`; `Tarefa.setor: UserSetor`; `export const SELECT_CLIENTE_FISCAL = '*, clientes_fiscal!inner(*)'`; `export type ClienteComFiscal = Cliente & ClienteFiscal`; `export function flattenClienteFiscal(row: any): ClienteComFiscal`.
- Consumes (Task 1): tabela `clientes_fiscal`, coluna `tarefas.setor`.

- [ ] **Step 1: Atualizar `lib/types.ts`**

Substituir a interface `Cliente` (remove os 14 campos relocados) e adicionar `ClienteFiscal`, e adicionar `setor` em `Tarefa`:

```ts
export interface Cliente {
  id: string
  nome: string
  cnpj: string | null
  mit: string | null
  municipio: string | null
  uf: string | null
  contato_chat: string | null
  setores: UserSetor[]
  created_at: string
}

export interface ClienteFiscal {
  cliente_id: string
  cod: string | null
  regime: string | null
  atividade: string | null
  responsavel: string | null
  grupo: string | null
  obs: string | null
  prioridade: number
  envia_iss: boolean
  confere_siga: boolean
  login_iss: string | null
  senha_iss: string | null
  email_envio_iss: string | null
  declaracao_anual: boolean
  tarefas_personalizadas: string[]
}

export interface Tarefa {
  id: string
  cliente_id: string
  usuario_id: string | null
  setor: UserSetor
  mes: number
  ano: number
  tipo: string
  concluida: boolean
  concluida_em: string | null
  recebido: boolean
  importado: boolean
  conferido: boolean
  created_at: string
}
```

Manter todo o resto do arquivo (`UserRole`, `UserSetor`, `SETORES`, `SETOR_LABEL`, `SETOR_HOME`, `Profile`, `LinkRapido`, `BotConfig`, `BotEvento`) sem alteração.

- [ ] **Step 2: Criar `lib/clientes-fiscal.ts`**

```ts
import type { Cliente, ClienteFiscal } from './types'

export const SELECT_CLIENTE_FISCAL = '*, clientes_fiscal!inner(*)'

export type ClienteComFiscal = Cliente & ClienteFiscal

export function flattenClienteFiscal(row: Record<string, unknown>): ClienteComFiscal {
  const { clientes_fiscal, ...resto } = row as { clientes_fiscal: ClienteFiscal } & Record<string, unknown>
  return { ...resto, ...clientes_fiscal } as ClienteComFiscal
}
```

- [ ] **Step 3: Atualizar `lib/tarefas-paginacao.ts`**

Adicionar `import type { UserSetor } from './types'` no topo, e um parâmetro `setor: UserSetor = 'fiscal'` ao final da assinatura de cada função, encadeando `.eq('setor', setor)` antes de `.range(...)`:

```ts
export async function buscarTodasTarefasDoMes<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
  colunas: string = '*',
  setor: UserSetor = 'fiscal'
): Promise<T[]> {
  const linhas: T[] = []
  const TAMANHO_PAGINA = 1000

  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await supabase
      .from('tarefas')
      .select(colunas)
      .eq('mes', mes)
      .eq('ano', ano)
      .eq('setor', setor)
      .range(inicio, inicio + TAMANHO_PAGINA - 1)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    linhas.push(...(data as unknown as T[]))
    if (data.length < TAMANHO_PAGINA) break
  }

  return linhas
}

export async function buscarTodasTarefas<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  colunas: string = '*',
  setor: UserSetor = 'fiscal'
): Promise<T[]> {
  const linhas: T[] = []
  const TAMANHO_PAGINA = 1000

  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await supabase
      .from('tarefas')
      .select(colunas)
      .eq('setor', setor)
      .range(inicio, inicio + TAMANHO_PAGINA - 1)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    linhas.push(...(data as unknown as T[]))
    if (data.length < TAMANHO_PAGINA) break
  }

  return linhas
}
```

Manter os comentários JSDoc existentes no topo de cada função. Todo call site existente continua funcionando sem passar o novo parâmetro (default `'fiscal'` preserva o comportamento atual).

- [ ] **Step 4: Atualizar `lib/supabase/server.ts` — `podeEditarCliente`**

Trocar a query de `podeEditarCliente` (hoje `supabase.from('clientes').select('responsavel').eq('id', clienteId).single()`) para:

```ts
const { data: cliente } = await supabase.from('clientes_fiscal').select('responsavel').eq('cliente_id', clienteId).single()
```

Manter o resto da função (comparação de `role`/`nome`) sem alteração.

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: erros apontando os arquivos que ainda usam os campos antigos diretamente em `Cliente` — isso é esperado neste ponto (serão corrigidos nas próximas tasks). Confirmar que os erros são exclusivamente nos arquivos listados nas Tasks 3-13 abaixo, não em `lib/types.ts`, `lib/clientes-fiscal.ts`, `lib/tarefas-paginacao.ts` ou `lib/supabase/server.ts` em si.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/clientes-fiscal.ts lib/tarefas-paginacao.ts lib/supabase/server.ts
git commit -m "feat: separa Cliente/ClienteFiscal, adiciona setor a Tarefa, helper de flatten"
```

---

### Task 3: `components/fiscal/EmpresaModal.tsx`

**Files:**
- Modify: `components/fiscal/EmpresaModal.tsx`

**Interfaces:**
- Consumes (Task 2): `SELECT_CLIENTE_FISCAL`, `flattenClienteFiscal` de `@/lib/clientes-fiscal`.

- [ ] **Step 1: Trocar a leitura (useEffect)**

Em `components/fiscal/EmpresaModal.tsx:61-100`, trocar:

```ts
      sb.from('clientes').select('*').eq('id', clienteId).single(),
      sb.from('tarefas').select('tipo').eq('cliente_id', clienteId),
    ]).then(([{ data }, { data: tarefasDB }]) => {
      if (!data) return
```

Por:

```ts
      sb.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('id', clienteId).single(),
      sb.from('tarefas').select('tipo').eq('cliente_id', clienteId).eq('setor', 'fiscal'),
    ]).then(([{ data: raw }, { data: tarefasDB }]) => {
      if (!raw) return
      const data = flattenClienteFiscal(raw)
```

E adicionar o import no topo do arquivo:

```ts
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'
```

O resto do corpo do `.then(...)` (linhas 68-98, populando `setForm({...})`) não muda — `data.cod`, `data.regime`, `data.tarefas_personalizadas` etc. continuam funcionando porque `flattenClienteFiscal` devolve um objeto plano com essas mesmas propriedades.

- [ ] **Step 2: Trocar `handleSave` para gravar em duas tabelas**

Substituir o corpo de `handleSave` (`components/fiscal/EmpresaModal.tsx:127-166`):

```ts
  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    setErro(null)
    const mit = form.municipio && form.uf
      ? `${form.municipio}/${form.uf}`
      : form.municipio || null

    const clientePayload = {
      nome:         form.nome,
      cnpj:         form.cnpj || null,
      mit,
      contato_chat: form.contato_chat || null,
    }
    const fiscalPayload = {
      cod:                    form.cod || null,
      regime:                 form.regime || null,
      atividade:              form.atividade || null,
      grupo:                  form.grupo || null,
      responsavel:            form.responsavel || null,
      prioridade:             form.prioridade,
      declaracao_anual:       form.declaracao_anual,
      envia_iss:              form.envia_iss,
      confere_siga:           form.confere_siga,
      login_iss:              form.envia_iss ? form.login_iss || null : null,
      senha_iss:              form.envia_iss ? form.senha_iss || null : null,
      email_envio_iss:        form.envia_iss ? form.email_envio_iss || null : null,
      tarefas_personalizadas: form.tarefas_personalizadas,
    }

    if (isEdit) {
      const { error: errCliente } = await sb.from('clientes').update(clientePayload).eq('id', clienteId)
      if (errCliente) { setSaving(false); setErro(errCliente.message); return }
      const { error: errFiscal } = await sb.from('clientes_fiscal').update(fiscalPayload).eq('cliente_id', clienteId)
      if (errFiscal) { setSaving(false); setErro(errFiscal.message); return }
    } else {
      const { data: novoCliente, error: errCliente } = await sb.from('clientes').insert(clientePayload).select('id').single()
      if (errCliente || !novoCliente) { setSaving(false); setErro(errCliente?.message ?? 'Falha ao criar cliente'); return }
      const { error: errFiscal } = await sb.from('clientes_fiscal').insert({ cliente_id: novoCliente.id, ...fiscalPayload })
      if (errFiscal) { setSaving(false); setErro(errFiscal.message); return }
    }

    setSaving(false)
    router.refresh()
    onClose()
  }
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros neste arquivo.

- [ ] **Step 4: Commit**

```bash
git add components/fiscal/EmpresaModal.tsx
git commit -m "fix: EmpresaModal le/grava clientes_fiscal via join+flatten"
```

---

### Task 4: `app/fiscal/clientes/[id]/page.tsx` + `app/fiscal/clientes/actions.ts`

**Files:**
- Modify: `app/fiscal/clientes/[id]/page.tsx`
- Modify: `app/fiscal/clientes/actions.ts`

**Interfaces:**
- Consumes (Task 2): `SELECT_CLIENTE_FISCAL`, `flattenClienteFiscal` de `@/lib/clientes-fiscal`.

- [ ] **Step 1: `app/fiscal/clientes/[id]/page.tsx` — leitura do cliente**

Trocar (linha 29-30):

```ts
  const { data: cliente } = await supabase.from('clientes').select('*').eq('id', id).single()
  if (!cliente) notFound()
```

Por:

```ts
  const { data: clienteRaw } = await supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('id', id).single()
  if (!clienteRaw) notFound()
  const cliente = flattenClienteFiscal(clienteRaw)
```

Adicionar import: `import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'`.

- [ ] **Step 2: Queries de `tarefas` neste arquivo**

Linha 38-39 e 42-43 — adicionar `.eq('setor', 'fiscal')`:

```ts
  const { data: tarefas } = await supabase
    .from('tarefas').select('*').eq('cliente_id', id).eq('mes', mes).eq('ano', ano).eq('setor', 'fiscal')

  const { data: tarefasAno } = await supabase
    .from('tarefas').select('mes,concluida').eq('cliente_id', id).eq('ano', ano).eq('setor', 'fiscal')
```

- [ ] **Step 3: Query de `responsaveis` (linha 59-60)**

Trocar:

```ts
  const [{ data: todosClientes }, { data: atividadeTemplates }] = await Promise.all([
    supabase.from('clientes').select('responsavel'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])
```

Por:

```ts
  const [{ data: todosClientes }, { data: atividadeTemplates }] = await Promise.all([
    supabase.from('clientes_fiscal').select('responsavel'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])
```

(`todosClientes.map(c => c.responsavel)` na linha seguinte não muda.)

- [ ] **Step 4: `toggleTarefa` (server action inline, linha 71-97)**

Adicionar `.eq('setor', 'fiscal')` na query de `existing` (linha 79-82) e `setor: 'fiscal'` no insert (linha 88-90):

```ts
    const { data: existing } = await supabase
      .from('tarefas').select('id')
      .eq('cliente_id', id).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'fiscal')
      .maybeSingle()
    if (existing?.id) {
      await supabase.from('tarefas')
        .update({ concluida, concluida_em })
        .eq('id', existing.id)
    } else {
      await supabase.from('tarefas')
        .insert({ cliente_id: id, usuario_id: user!.id, mes, ano, tipo, setor: 'fiscal', concluida, concluida_em })
    }
```

- [ ] **Step 5: `app/fiscal/clientes/actions.ts` — `desbloquearTarefa`**

Linha 22 (`.update({ concluida: false, ... }).eq('id', tarefaId)`) já é escopada por `id`, mas por consistência com a política do plano, deixar como está (não precisa `.eq('setor', 'fiscal')` pois já filtra por `id` único). Nenhuma mudança necessária aqui.

- [ ] **Step 6: `app/fiscal/clientes/actions.ts` — `atualizarSubEtapa`**

Linha 119-123 e 142 — adicionar `.eq('setor', 'fiscal')` na leitura e `setor: 'fiscal'` no insert:

```ts
  const { data: existing } = await supabase
    .from('tarefas')
    .select('id, recebido, importado, conferido')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'fiscal')
    .maybeSingle()
```

```ts
  if (existing?.id) {
    await supabase.from('tarefas').update(payload).eq('id', existing.id)
  } else {
    await supabase.from('tarefas').insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'fiscal', ...payload })
  }
```

`salvarMIT` (linha 44-49, só grava `clientes.mit`) e `excluirCliente` (linha 152-159, `clientes.delete()`, cascateia pra `clientes_fiscal` via FK) não mudam.

- [ ] **Step 7: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros nestes dois arquivos.

- [ ] **Step 8: Commit**

```bash
git add app/fiscal/clientes/[id]/page.tsx app/fiscal/clientes/actions.ts
git commit -m "fix: pagina de detalhe do cliente e actions usam clientes_fiscal + tarefas.setor"
```

---

### Task 5: `app/fiscal/clientes/page.tsx` + `components/fiscal/ClientesLista.tsx`

**Files:**
- Modify: `app/fiscal/clientes/page.tsx`
- Modify: `components/fiscal/ClientesLista.tsx` (só o tipo da prop `clientes`, se estiver tipada como `Cliente[]`)

**Interfaces:**
- Consumes (Task 2): `SELECT_CLIENTE_FISCAL`, `flattenClienteFiscal`, `ClienteComFiscal`, `buscarTodasTarefasDoMes` (com `setor` default `'fiscal'`).

- [ ] **Step 1: Trocar a query e o mapa de tipos**

Trocar (linhas 14-31):

```ts
  const clientesQ = supabase.from('clientes').select('*').order('nome')

  const [{ data: clientes }, tarefas, { data: atividadeTemplates }] = await Promise.all([
    clientesQ,
    buscarTodasTarefasDoMes<Pick<Tarefa, 'cliente_id' | 'concluida' | 'tipo'>>(supabase, mes, ano, 'cliente_id, concluida, tipo'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }

  // Mapa de tipos por cliente
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes ?? []) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }
```

Por:

```ts
  const clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome')

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

  // Mapa de tipos por cliente
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }
```

Ajustar a linha 53 (`clientes={clientes ?? []}`) para `clientes={clientes}` (já não é mais nullable — `flattenClienteFiscal` foi aplicado sobre um array, nunca `null`). Adicionar o import `import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'` no topo do arquivo.

- [ ] **Step 2: Conferir o tipo da prop em `ClientesLista.tsx`**

Ler `components/fiscal/ClientesLista.tsx`. Se a prop `clientes` estiver tipada como `Cliente[]`, trocar para `ClienteComFiscal[]` (importar de `@/lib/clientes-fiscal`). Nenhuma outra linha do componente deve precisar mudar — ele só lê propriedades que continuam existindo no objeto achatado.

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros nestes dois arquivos.

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/clientes/page.tsx components/fiscal/ClientesLista.tsx
git commit -m "fix: lista de clientes do Fiscal usa join com clientes_fiscal"
```

---

### Task 6: `app/fiscal/dashboard/page.tsx`

**Files:**
- Modify: `app/fiscal/dashboard/page.tsx`

**Interfaces:**
- Consumes (Task 2): `SELECT_CLIENTE_FISCAL`, `flattenClienteFiscal`.

- [ ] **Step 1: Trocar a query de clientes**

Em `app/fiscal/dashboard/page.tsx:49-56`, trocar:

```ts
  const [{ data: clientes }, { data: profiles }, tarefas] = await Promise.all([
    supabase.from('clientes').select('*').order('nome'),
    supabase.from('profiles').select('*'),
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano),
  ])

  const cs = (clientes ?? []) as Cliente[]
```

Por:

```ts
  const [{ data: clientesRaw }, { data: profiles }, tarefas] = await Promise.all([
    supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome'),
    supabase.from('profiles').select('*'),
    buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano),
  ])

  const cs = (clientesRaw ?? []).map(flattenClienteFiscal)
```

Adicionar import: `import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'`. Remover o cast `as Cliente[]` (não é mais necessário, `flattenClienteFiscal` já tipa como `ClienteComFiscal[]`) e ajustar o tipo de `cs` em qualquer lugar do arquivo que declare `Cliente[]` explicitamente para `ClienteComFiscal[]` (importar `ClienteComFiscal` de `@/lib/clientes-fiscal` se necessário).

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/dashboard/page.tsx
git commit -m "fix: dashboard do Fiscal usa join com clientes_fiscal"
```

---

### Task 7: `app/fiscal/relatorios/page.tsx`

**Files:**
- Modify: `app/fiscal/relatorios/page.tsx`

**Interfaces:**
- Consumes (Task 2): `SELECT_CLIENTE_FISCAL`, `flattenClienteFiscal`, `ClienteComFiscal`.

- [ ] **Step 1: Trocar tipo de estado e a query**

Trocar (linha 6, 18, 31, 50-58):

```ts
import type { Cliente, Tarefa } from '@/lib/types'
```
por
```ts
import type { Tarefa } from '@/lib/types'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal, type ClienteComFiscal } from '@/lib/clientes-fiscal'
```

```ts
function progresso(cliente: Cliente, tarefas: Tarefa[]) {
```
por
```ts
function progresso(cliente: ClienteComFiscal, tarefas: Tarefa[]) {
```

```ts
  const [clientes, setClientes] = useState<Cliente[]>([])
```
por
```ts
  const [clientes, setClientes] = useState<ClienteComFiscal[]>([])
```

```ts
        let clientesQ = sb.from('clientes').select('*').order('nome')
        if (!admin && p?.nome) clientesQ = (clientesQ as any).ilike('responsavel', p.nome)

        Promise.all([
          clientesQ,
          buscarTodasTarefasDoMes<Tarefa>(sb, mes, ano),
        ]).then(([c, t]) => {
          setClientes(c.data ?? [])
          setTarefas(t)
        })
```
por
```ts
        let clientesQ = sb.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome')
        if (!admin && p?.nome) clientesQ = clientesQ.ilike('clientes_fiscal.responsavel', p.nome)

        Promise.all([
          clientesQ,
          buscarTodasTarefasDoMes<Tarefa>(sb, mes, ano),
        ]).then(([c, t]) => {
          setClientes((c.data ?? []).map(flattenClienteFiscal))
          setTarefas(t)
        })
```

Nenhuma outra linha do arquivo muda — `r.cliente.responsavel`, `r.cliente.atividade`, `r.cliente.tarefas_personalizadas`, `r.cliente.grupo`, `r.cliente.regime`, `r.cliente.mit` (usados em `progresso()`, nos filtros, no HTML de impressão e na tabela) continuam funcionando porque `flattenClienteFiscal` devolve as mesmas propriedades num objeto plano.

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/relatorios/page.tsx
git commit -m "fix: relatorios do Fiscal usam join com clientes_fiscal"
```

---

### Task 8: `app/fiscal/historico/page.tsx`

**Files:**
- Modify: `app/fiscal/historico/page.tsx`

**Interfaces:**
- Consumes (Task 2): `SELECT_CLIENTE_FISCAL`, `flattenClienteFiscal`, `ClienteComFiscal`.

- [ ] **Step 1: Mesmo padrão da Task 7**

Trocar (linha 5, 19, 34-52):

```ts
import { Cliente, Tarefa } from '@/lib/types'
```
por
```ts
import { Tarefa } from '@/lib/types'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal, type ClienteComFiscal } from '@/lib/clientes-fiscal'
```

```ts
  const [clientes, setClientes]     = useState<Cliente[]>([])
```
por
```ts
  const [clientes, setClientes]     = useState<ClienteComFiscal[]>([])
```

```ts
        let clientesQ = sb.from('clientes').select('*').order('nome')
        if (!admin && p?.nome) clientesQ = (clientesQ as any).ilike('responsavel', p.nome)

        clientesQ.then(async ({ data: cs }) => {
          const ids = (cs ?? []).map((c: any) => c.id)
          let ts: any[] = []
          if (ids.length > 0) {
            const { data } = await sb
              .from('tarefas')
              .select('*')
              .eq('ano', ano)
              .in('cliente_id', ids)
              .limit(10000)
            ts = data ?? []
          }
          setClientes((cs ?? []) as Cliente[])
          setTarefas(ts as Tarefa[])
          setLoading(false)
        })
```
por
```ts
        let clientesQ = sb.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome')
        if (!admin && p?.nome) clientesQ = clientesQ.ilike('clientes_fiscal.responsavel', p.nome)

        clientesQ.then(async ({ data: cs }) => {
          const clientesFlat = (cs ?? []).map(flattenClienteFiscal)
          const ids = clientesFlat.map(c => c.id)
          let ts: Tarefa[] = []
          if (ids.length > 0) {
            const { data } = await sb
              .from('tarefas')
              .select('*')
              .eq('ano', ano)
              .eq('setor', 'fiscal')
              .in('cliente_id', ids)
              .limit(10000)
            ts = (data ?? []) as Tarefa[]
          }
          setClientes(clientesFlat)
          setTarefas(ts)
          setLoading(false)
        })
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/historico/page.tsx
git commit -m "fix: historico do Fiscal usa join com clientes_fiscal"
```

---

### Task 9: `app/fiscal/ferramentas/page.tsx`

**Files:**
- Modify: `app/fiscal/ferramentas/page.tsx`

**Interfaces:**
- Consumes (Task 2): `SELECT_CLIENTE_FISCAL`, `flattenClienteFiscal`.

- [ ] **Step 1: Ler o arquivo**

Ler `app/fiscal/ferramentas/page.tsx` por completo. A query relevante (confirmada por busca anterior) é:

```ts
let q = supabase.from('clientes').select('*').order('nome'); if (!isAdmin && profile?.nome) q = q.ilike('responsavel', profile.nome)
```

- [ ] **Step 2: Trocar a query**

Trocar por:

```ts
let q = supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome'); if (!isAdmin && profile?.nome) q = q.ilike('clientes_fiscal.responsavel', profile.nome)
```

E onde o resultado da query é usado (passado como prop `clientes` para `FerramentasClient`), aplicar `.map(flattenClienteFiscal)` antes de passar adiante. Adicionar o import `import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'`.

- [ ] **Step 3: Verificar o tipo da prop em `FerramentasClient.tsx`**

Ler `app/fiscal/ferramentas/FerramentasClient.tsx`. Se a prop `clientes` estiver tipada como `Cliente[]`, trocar para `ClienteComFiscal[]` (importar de `@/lib/clientes-fiscal`). Nenhuma outra linha do componente muda — ele só lê propriedades (`c.confere_siga`, `c.envia_iss`, `c.grupo`, `c.login_iss`, `c.senha_iss`, `c.responsavel`), que continuam existindo no objeto achatado.

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros nestes dois arquivos.

- [ ] **Step 5: Commit**

```bash
git add app/fiscal/ferramentas/page.tsx app/fiscal/ferramentas/FerramentasClient.tsx
git commit -m "fix: ferramentas do Fiscal usa join com clientes_fiscal"
```

---

### Task 10: `app/fiscal/tarefas/page.tsx`

**Files:**
- Modify: `app/fiscal/tarefas/page.tsx`

**Interfaces:**
- Consumes (Task 2): `SELECT_CLIENTE_FISCAL`/`flattenClienteFiscal` não se aplicam aqui diretamente — este arquivo faz `select` explícito de colunas, não `select('*')`.

- [ ] **Step 1: Ler o arquivo**

Ler `app/fiscal/tarefas/page.tsx` por completo. A query relevante (confirmada por busca anterior) é:

```ts
supabase.from('clientes').select('id, nome, cod, grupo, responsavel').order('nome')
```

- [ ] **Step 2: Trocar a query**

Como esta query já seleciona colunas específicas (não `select('*')`), trocar para buscar de `clientes_fiscal` com join reverso, mantendo o mesmo formato de saída usado pelo resto do arquivo:

```ts
supabase.from('clientes').select('id, nome, clientes_fiscal!inner(cod, grupo, responsavel)').order('nome')
```

E, no ponto onde o resultado é consumido, achatar manualmente (este caso é simples o bastante para não precisar do helper genérico):

```ts
const clientesFlat = (data ?? []).map(c => ({ id: c.id, nome: c.nome, ...c.clientes_fiscal }))
```

Ajustar o restante do arquivo (`cliente.responsavel`, `cliente.id`, `cliente.nome`) para usar `clientesFlat` em vez do resultado bruto da query, sem outras mudanças.

- [ ] **Step 3: Verificar `buscarTodasTarefasDoMes`**

Confirmar que a chamada existente a `buscarTodasTarefasDoMes<Tarefa>(supabase, mes, ano)` não precisa de mudança (default `setor='fiscal'` cobre).

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros neste arquivo.

- [ ] **Step 5: Commit**

```bash
git add app/fiscal/tarefas/page.tsx
git commit -m "fix: pagina de tarefas do Fiscal usa clientes_fiscal"
```

---

### Task 11: `app/fiscal/parcelamentos/page.tsx`

**Files:**
- Modify: `app/fiscal/parcelamentos/page.tsx`

- [ ] **Step 1: Trocar a query de `clientesCadastrados`**

Ler `app/fiscal/parcelamentos/page.tsx` para localizar a linha (~105) `sb.from('clientes').select('nome, cnpj, responsavel').order('nome')`. Trocar por:

```ts
sb.from('clientes').select('nome, cnpj, clientes_fiscal!inner(responsavel)').order('nome')
```

E achatar o resultado ao popular o estado `clientesCadastrados` (`{ nome, cnpj, responsavel: c.clientes_fiscal.responsavel }` no `.map(...)` correspondente), preservando o formato `{ nome, cnpj, responsavel }[]` que o resto do arquivo já espera.

**Não confundir** com `parcelamentos.regime`/`parcelamentos.responsavel` — essas são colunas da tabela `parcelamentos` (não-relacionada, não tocada por este plano), usadas em outras partes do mesmo arquivo.

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/parcelamentos/page.tsx
git commit -m "fix: dropdown de empresas em parcelamentos usa clientes_fiscal"
```

---

### Task 12: `components/fiscal/CorrigirTarefasClient.tsx` + `components/fiscal/CorrigirAtividadesClient.tsx`

**Files:**
- Modify: `components/fiscal/CorrigirTarefasClient.tsx`
- Modify: `components/fiscal/CorrigirAtividadesClient.tsx`

- [ ] **Step 1: `CorrigirAtividadesClient.tsx`**

Ler o arquivo. Trocar:

```ts
sb.from('clientes').select('id,nome,atividade').not('atividade', 'is', null).order('nome')
```
por
```ts
sb.from('clientes').select('id,nome,clientes_fiscal!inner(atividade)').not('clientes_fiscal.atividade', 'is', null).order('nome')
```
e achatar o resultado (`{ id: c.id, nome: c.nome, atividade: c.clientes_fiscal.atividade }`) antes de popular o estado local, mantendo a interface `Item` como está.

Trocar:
```ts
sb.from('clientes').update({ atividade: i.correcaoManual.trim() }).eq('id', i.id)
```
por
```ts
sb.from('clientes_fiscal').update({ atividade: i.correcaoManual.trim() }).eq('cliente_id', i.id)
```

- [ ] **Step 2: `CorrigirTarefasClient.tsx`**

Ler o arquivo. Trocar:

```ts
sb.from('clientes').select('id,nome,tarefas_personalizadas').not('tarefas_personalizadas', 'is', null)
```
por
```ts
sb.from('clientes').select('id,nome,clientes_fiscal!inner(tarefas_personalizadas)').not('clientes_fiscal.tarefas_personalizadas', 'is', null)
```
achatando o resultado da mesma forma.

Trocar:
```ts
sb.from('clientes').update({ tarefas_personalizadas: arr }).eq('id', id)
```
por
```ts
sb.from('clientes_fiscal').update({ tarefas_personalizadas: arr }).eq('cliente_id', id)
```

Trocar a chamada a `buscarTodasTarefas<{id:string; cliente_id:string; tipo:string}>(sb, 'id,cliente_id,tipo')` para passar o novo parâmetro de setor explicitamente (mesmo sendo o default): `buscarTodasTarefas<{id:string; cliente_id:string; tipo:string}>(sb, 'id,cliente_id,tipo', 'fiscal')` — confirmar contra a assinatura real definida na Task 2 Step 3.

Trocar:
```ts
sb.from('tarefas').update({ tipo: item.correcaoManual.trim() }).eq('id', tid)
```
Nenhuma mudança necessária (já escopado por `id` único).

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros nestes dois arquivos.

- [ ] **Step 4: Commit**

```bash
git add components/fiscal/CorrigirTarefasClient.tsx components/fiscal/CorrigirAtividadesClient.tsx
git commit -m "fix: telas de correcao de atividades/tarefas usam clientes_fiscal"
```

---

### Task 13: `app/fiscal/parametros/actions.ts`

**Files:**
- Modify: `app/fiscal/parametros/actions.ts`

O arquivo com mais pontos de contato (confirmado por leitura completa). Todas as trocas abaixo, na ordem em que aparecem no arquivo:

- [ ] **Step 1: `aplicarTemplateAClientes` (linha 135-153)**

Trocar:
```ts
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, atividade, tarefas_personalizadas')

  let atualizados = 0
  for (const c of clientes ?? []) {
    if (!c.atividade?.includes(atividadeBase)) continue

    const existentes: string[] = c.tarefas_personalizadas ?? []
    const novas = tarefasBase.filter(t => !existentes.includes(t))
    if (novas.length === 0) continue

    await supabase
      .from('clientes')
      .update({ tarefas_personalizadas: [...existentes, ...novas] })
      .eq('id', c.id)

    atualizados++
  }
```
por:
```ts
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
```

- [ ] **Step 2: `aplicarTemplateGrupoAClientes` (linha 197-215)**

Mesma troca de tabela/coluna-chave:
```ts
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
```

- [ ] **Step 3: `buscarDadosParaAlteracao` (linha 231-239)**

Trocar:
```ts
  const { data: rows, error } = await supabase.from('clientes').select('id, nome, tarefas_personalizadas')
  if (error) return { error: error.message, todasTarefas: [], clientes: [] }

  const todasSet = new Set<string>()
  const clientes = (rows ?? []).map(c => {
    const tarefas: string[] = c.tarefas_personalizadas ?? []
    for (const t of tarefas) todasSet.add(t)
    return { id: c.id as string, nome: c.nome as string, tarefas }
  })
```
por:
```ts
  const { data: rows, error } = await supabase.from('clientes').select('id, nome, clientes_fiscal!inner(tarefas_personalizadas)')
  if (error) return { error: error.message, todasTarefas: [], clientes: [] }

  const todasSet = new Set<string>()
  const clientes = (rows ?? []).map(c => {
    const tarefas: string[] = (c.clientes_fiscal as { tarefas_personalizadas: string[] })?.tarefas_personalizadas ?? []
    for (const t of tarefas) todasSet.add(t)
    return { id: c.id as string, nome: c.nome as string, tarefas }
  })
```

- [ ] **Step 4: `renomearTarefaEmClientes` (linha 258-287)**

Trocar:
```ts
  const { data: clientes } = await supabase.from('clientes').select('id, tarefas_personalizadas').in('id', clienteIds)
  let clientesAtualizados = 0

  for (const c of clientes ?? []) {
    const original: string[] = c.tarefas_personalizadas ?? []
    if (!original.includes(tarefaOrigem)) continue
    const renamed = original.map(t => t === tarefaOrigem ? destino : t)
    const seen = new Set<string>()
    const deduped = renamed.filter(t => { if (seen.has(t)) return false; seen.add(t); return true })
    await supabase.from('clientes').update({ tarefas_personalizadas: deduped }).eq('id', c.id)
    clientesAtualizados++
  }

  const { data: registros } = await supabase
    .from('tarefas')
    .select('id')
    .eq('tipo', tarefaOrigem)
    .in('cliente_id', clienteIds)

  let tarefasCorrigidas = 0
  if ((registros ?? []).length > 0) {
    await supabase
      .from('tarefas')
      .update({ tipo: destino })
      .eq('tipo', tarefaOrigem)
      .in('cliente_id', clienteIds)
    tarefasCorrigidas = registros!.length
  }
```
por:
```ts
  const { data: clientes } = await supabase.from('clientes_fiscal').select('cliente_id, tarefas_personalizadas').in('cliente_id', clienteIds)
  let clientesAtualizados = 0

  for (const c of clientes ?? []) {
    const original: string[] = c.tarefas_personalizadas ?? []
    if (!original.includes(tarefaOrigem)) continue
    const renamed = original.map(t => t === tarefaOrigem ? destino : t)
    const seen = new Set<string>()
    const deduped = renamed.filter(t => { if (seen.has(t)) return false; seen.add(t); return true })
    await supabase.from('clientes_fiscal').update({ tarefas_personalizadas: deduped }).eq('cliente_id', c.cliente_id)
    clientesAtualizados++
  }

  const { data: registros } = await supabase
    .from('tarefas')
    .select('id')
    .eq('tipo', tarefaOrigem)
    .eq('setor', 'fiscal')
    .in('cliente_id', clienteIds)

  let tarefasCorrigidas = 0
  if ((registros ?? []).length > 0) {
    await supabase
      .from('tarefas')
      .update({ tipo: destino })
      .eq('tipo', tarefaOrigem)
      .eq('setor', 'fiscal')
      .in('cliente_id', clienteIds)
    tarefasCorrigidas = registros!.length
  }
```

- [ ] **Step 5: `excluirTarefaDeClientes` (linha 304-319)**

Trocar:
```ts
  const { data: clientes } = await supabase.from('clientes').select('id, tarefas_personalizadas').in('id', clienteIds)
  let clientesAtualizados = 0

  for (const c of clientes ?? []) {
    const original: string[] = c.tarefas_personalizadas ?? []
    if (!original.includes(tarefaTipo)) continue
    await supabase.from('clientes').update({ tarefas_personalizadas: original.filter(t => t !== tarefaTipo) }).eq('id', c.id)
    clientesAtualizados++
  }

  const { data: registros } = await supabase.from('tarefas').select('id').eq('tipo', tarefaTipo).in('cliente_id', clienteIds)
  let registrosExcluidos = 0
  if ((registros ?? []).length > 0) {
    await supabase.from('tarefas').delete().eq('tipo', tarefaTipo).in('cliente_id', clienteIds)
    registrosExcluidos = registros!.length
  }
```
por:
```ts
  const { data: clientes } = await supabase.from('clientes_fiscal').select('cliente_id, tarefas_personalizadas').in('cliente_id', clienteIds)
  let clientesAtualizados = 0

  for (const c of clientes ?? []) {
    const original: string[] = c.tarefas_personalizadas ?? []
    if (!original.includes(tarefaTipo)) continue
    await supabase.from('clientes_fiscal').update({ tarefas_personalizadas: original.filter(t => t !== tarefaTipo) }).eq('cliente_id', c.cliente_id)
    clientesAtualizados++
  }

  const { data: registros } = await supabase.from('tarefas').select('id').eq('tipo', tarefaTipo).eq('setor', 'fiscal').in('cliente_id', clienteIds)
  let registrosExcluidos = 0
  if ((registros ?? []).length > 0) {
    await supabase.from('tarefas').delete().eq('tipo', tarefaTipo).eq('setor', 'fiscal').in('cliente_id', clienteIds)
    registrosExcluidos = registros!.length
  }
```

- [ ] **Step 6: `preencherDataEmClientes` (linha 340-346)**

Trocar:
```ts
  for (const clienteId of clienteIds) {
    await supabase.from('tarefas').upsert(
      { tipo: tarefaTipo, cliente_id: clienteId, mes, ano, concluida: true, concluida_em: dataISO },
      { onConflict: 'tipo,cliente_id,mes,ano' }
    )
    registrosAtualizados++
  }
```
por:
```ts
  for (const clienteId of clienteIds) {
    await supabase.from('tarefas').upsert(
      { tipo: tarefaTipo, cliente_id: clienteId, mes, ano, setor: 'fiscal', concluida: true, concluida_em: dataISO },
      { onConflict: 'tipo,cliente_id,mes,ano,setor' }
    )
    registrosAtualizados++
  }
```

- [ ] **Step 7: `buscarConclusoesTarefa` (linha 362-369)**

Trocar:
```ts
  const { data, error } = await supabase
    .from('tarefas')
    .select('cliente_id')
    .eq('tipo', tarefaTipo)
    .eq('mes', mes)
    .eq('ano', ano)
    .eq('concluida', true)
```
por:
```ts
  const { data, error } = await supabase
    .from('tarefas')
    .select('cliente_id')
    .eq('tipo', tarefaTipo)
    .eq('mes', mes)
    .eq('ano', ano)
    .eq('setor', 'fiscal')
    .eq('concluida', true)
```

- [ ] **Step 8: `buscarTarefasSemData` (linha 398-410)**

Trocar:
```ts
  const { data: clientesRows, error: errClientes } = await supabase
    .from('clientes')
    .select('id, nome, tarefas_personalizadas')
    .order('nome')
  if (errClientes) return { error: errClientes.message, registros: [], totalRegistros: 0 }

  const { data: tarefasRows, error: errTarefas } = await supabase
    .from('tarefas')
    .select('id, tipo, cliente_id, concluida_em')
    .eq('mes', mesEfetivo)
    .eq('ano', anoEfetivo)
  if (errTarefas) return { error: errTarefas.message, registros: [], totalRegistros: 0 }
```
por:
```ts
  const { data: clientesRowsRaw, error: errClientes } = await supabase
    .from('clientes')
    .select('id, nome, clientes_fiscal!inner(tarefas_personalizadas)')
    .order('nome')
  if (errClientes) return { error: errClientes.message, registros: [], totalRegistros: 0 }
  const clientesRows = (clientesRowsRaw ?? []).map(c => ({
    id: c.id, nome: c.nome,
    tarefas_personalizadas: (c.clientes_fiscal as { tarefas_personalizadas: string[] })?.tarefas_personalizadas ?? [],
  }))

  const { data: tarefasRows, error: errTarefas } = await supabase
    .from('tarefas')
    .select('id, tipo, cliente_id, concluida_em')
    .eq('mes', mesEfetivo)
    .eq('ano', anoEfetivo)
    .eq('setor', 'fiscal')
  if (errTarefas) return { error: errTarefas.message, registros: [], totalRegistros: 0 }
```

(O resto da função já usa `clientesRows` como `{id, nome, tarefas_personalizadas}[]`, que continua compatível.)

- [ ] **Step 9: `excluirRegistrosDeTarefas` (linha 464)**

```ts
  const { error } = await supabase.from('tarefas').delete().in('id', ids)
```
Nenhuma mudança (já escopado por lista de `id`s únicos).

- [ ] **Step 10: `analisarTarefasDuplicadas` (linha 493)**

Trocar:
```ts
  const { data: clientes } = await supabase.from('clientes').select('id, tarefas_personalizadas')
```
por:
```ts
  const { data: clientes } = await supabase.from('clientes_fiscal').select('cliente_id, tarefas_personalizadas')
```
E ajustar as referências a `c.id` dentro do loop seguinte (linha 498-514) para `c.cliente_id`.

- [ ] **Step 11: `limparTarefasDuplicadas` (linha 540-573)**

Trocar:
```ts
  const { data: clientes } = await supabase.from('clientes').select('id, tarefas_personalizadas')
  let clientesAtualizados = 0

  for (const c of clientes ?? []) {
    const original: string[] = c.tarefas_personalizadas ?? []
    if (original.length === 0) continue
    const seen = new Set<string>()
    const deduped: string[] = []
    for (const t of original) {
      const key = semAcento(t)
      if (!seen.has(key)) {
        seen.add(key)
        deduped.push(mapeamento[key] ?? t)
      }
    }
    const mudou = deduped.length !== original.length || deduped.some((t, i) => t !== original[i])
    if (!mudou) continue
    await supabase.from('clientes').update({ tarefas_personalizadas: deduped }).eq('id', c.id)
    clientesAtualizados++
  }

  const todosRegistros = await buscarTodasTarefas<{ id: string; tipo: string }>(supabase, 'id, tipo')

  let tarefasCorrigidas = 0
  for (const [normalizado, canonico] of Object.entries(mapeamento)) {
    for (const r of todosRegistros) {
      if (r.tipo !== canonico && semAcento(r.tipo) === normalizado) {
        await supabase.from('tarefas').update({ tipo: canonico }).eq('id', r.id)
        tarefasCorrigidas++
      }
    }
  }
```
por:
```ts
  const { data: clientes } = await supabase.from('clientes_fiscal').select('cliente_id, tarefas_personalizadas')
  let clientesAtualizados = 0

  for (const c of clientes ?? []) {
    const original: string[] = c.tarefas_personalizadas ?? []
    if (original.length === 0) continue
    const seen = new Set<string>()
    const deduped: string[] = []
    for (const t of original) {
      const key = semAcento(t)
      if (!seen.has(key)) {
        seen.add(key)
        deduped.push(mapeamento[key] ?? t)
      }
    }
    const mudou = deduped.length !== original.length || deduped.some((t, i) => t !== original[i])
    if (!mudou) continue
    await supabase.from('clientes_fiscal').update({ tarefas_personalizadas: deduped }).eq('cliente_id', c.cliente_id)
    clientesAtualizados++
  }

  const todosRegistros = await buscarTodasTarefas<{ id: string; tipo: string }>(supabase, 'id, tipo', 'fiscal')

  let tarefasCorrigidas = 0
  for (const [normalizado, canonico] of Object.entries(mapeamento)) {
    for (const r of todosRegistros) {
      if (r.tipo !== canonico && semAcento(r.tipo) === normalizado) {
        await supabase.from('tarefas').update({ tipo: canonico }).eq('id', r.id)
        tarefasCorrigidas++
      }
    }
  }
```

(Confirmar a ordem exata dos parâmetros de `buscarTodasTarefas` contra a assinatura definida na Task 2 Step 3 antes de aplicar esta troca.)

- [ ] **Step 12: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros neste arquivo.

- [ ] **Step 13: Commit**

```bash
git add app/fiscal/parametros/actions.ts
git commit -m "fix: acoes de parametros (templates, renomear/excluir/deduplicar tarefas) usam clientes_fiscal"
```

---

### Task 14: `app/fiscal/conferencia/page.tsx` + verificação final

**Files:**
- Modify (se necessário): `app/fiscal/conferencia/page.tsx`

- [ ] **Step 1: Conferir `app/fiscal/conferencia/page.tsx`**

Ler o arquivo. A query `sb.from('clientes').select('*').order('nome')` usa apenas `id, nome, cnpj` no restante do arquivo (nenhum campo relocado) — confirmar isso lendo o arquivo inteiro. Se confirmado, **nenhuma mudança de código é necessária** aqui: `select('*')` contra `clientes` simplesmente devolve menos colunas depois da migration, sem quebrar nada. Se a leitura revelar uso de algum campo relocado não capturado nas buscas anteriores, aplicar o mesmo padrão de join+flatten das tasks anteriores.

- [ ] **Step 2: Typecheck completo do projeto**

Run: `npx tsc --noEmit -p .`
Expected: zero erros em todo o projeto — confirma que todas as 13 tasks anteriores cobriram every referência aos campos relocados.

- [ ] **Step 3: Build completo**

Run: `npm run build`
Expected: build passa sem erros (pega problemas que `tsc --noEmit` sozinho às vezes não pega, como imports quebrados em rotas não visitadas pelo typecheck incremental).

- [ ] **Step 4: Commit (se Step 1 exigiu mudança) ou nota final**

Se `conferencia/page.tsx` não precisou de mudança, nenhum commit novo aqui — a Task 13 já é o último commit de código. Deixar para o usuário fazer a verificação manual no navegador (login admin e não-admin, `/fiscal/clientes`, `/fiscal/clientes/[id]`, `/fiscal/dashboard`, `/fiscal/relatorios`, `/fiscal/historico`, `/fiscal/ferramentas`, `/fiscal/tarefas`, `/fiscal/parametros` → aplicar template, renomear tarefa, `/fiscal/parcelamentos` → dropdown de empresa, `/fiscal/admin` → corrigir atividades/tarefas) — comparando com o comportamento anterior à migração.
