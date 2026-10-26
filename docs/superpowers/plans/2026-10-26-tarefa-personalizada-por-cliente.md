# Tarefa personalizada por cliente (Contábil) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** no Contábil, cada tarefa personalizada passa a ser um `tarefa_tipos` do próprio cliente (`cliente_id`), criada sempre pelo `NovoTipoTarefaModal` e apagada ao sair da ficha.

**Architecture:** coluna `tarefa_tipos.cliente_id` (nulo = tipo do setor). Leitura no Contábil resolve "tipo do cliente, senão tipo do setor" por um helper puro. Criação passa a ser adiada para o `salvarClienteContabil` (vale para cliente novo e existente). Leitores do catálogo do setor filtram `cliente_id is null`.

**Tech Stack:** Next.js (ver `AGENTS.md`: ler `node_modules/next/dist/docs/` antes de mexer em API do Next), Supabase/Postgres 17, testes `npm test` (node:test + tsx, pasta `tests/`).

**Spec:** `docs/superpowers/specs/2026-10-26-tarefa-personalizada-por-cliente-design.md`

## Global Constraints

- Só Contábil muda de comportamento. Fiscal, Pessoal, Societário, Financeiro: zero mudança visível.
- "Tipo do setor" = `cliente_id is null` (inclui padrão e o não-padrão com vínculo).
- Configurações → Tarefas e a tela de Vínculos listam só `cliente_id is null`.
- Nenhum histórico (`tarefas`, etapas, anexos) muda na migração; a migração se autoverifica e aborta se qualquer ficha mudar.
- Banco: migration `070` aplicada só no dev (`DEV_DATABASE_URL`, ref `fcpcorqquovvgtoukxry`). Produção NÃO faz parte deste plano.
- PR contra `dev`; nunca mergear.

## Review Focus

1. Remover e readicionar o mesmo nome antes de salvar = tarefa nova: o tipo do cliente é substituído e o histórico daquele nome no cliente é apagado (mesmo aviso de remoção). → teste na Task 4.
2. Nome digitado com outra caixa/espaços que bate com tipo do setor ("banco santander " vs "Banco Santander") entra com a grafia do catálogo, sem abrir criação. → teste na Task 2.
3. Cliente cujo nome personalizado também é tipo padrão do setor resolve para o padrão (não ganha cópia). → teste na Task 1 (SQL) e Task 2 (helper).
4. Cancelar o cadastro depois de "criar" uma tarefa no modal não deixa nada no banco (criação é adiada). → coberto pela Task 4 (nenhum `criarTipoTarefa` no fluxo do Contábil).
5. Preenchimento Rápido: mesmo nome com formato Data num cliente e Texto em outro → checkbox só no primeiro. → teste na Task 3.

---

### Task 1: Migration 070 (schema + separação por cliente, autoverificada) e aplicação no dev

**Files:**
- Create: `supabase/migrations/070_tarefa_tipos_por_cliente.sql`

**Interfaces:**
- Produces: coluna `tarefa_tipos.cliente_id uuid null references clientes(id) on delete cascade`; índices únicos parciais `tarefa_tipos_setor_nome_uniq (setor, nome) where cliente_id is null` e `tarefa_tipos_cliente_nome_uniq (setor, cliente_id, nome) where cliente_id is not null`; constraint antiga `tarefa_tipos_setor_nome_key` removida.

- [ ] **Step 1: Escrever a migration**, em `begin; ... commit;`, `set local lock_timeout = '5s'`, nesta ordem:
  1. Snapshot "antes" em temp table: para cada `clientes_contabil` e cada nome em `tarefas_personalizadas`, a linha do `tarefa_tipos` (setor `contabil`, mesmo nome) com `tipo_resposta, etapas, meses_visiveis, criado_em, vigente_ate, ativo` (left join; nome sem tipo fica com nulos).
  2. `add column cliente_id`, drop `tarefa_tipos_setor_nome_key`, criar os 2 índices.
  3. `alter table tarefa_tipos disable trigger evento_log_item_criacao` (não poluir o log com as cópias); reabilitar no fim.
  4. Donos: tipos `setor='contabil'`, `padrao=false`, sem linha em `tarefa_tipo_vinculos`, com os clientes cujo `tarefas_personalizadas @> array[nome]`; `row_number() over (partition by tipo order by cliente_id)`. `rn=1` → `update ... set cliente_id`; `rn>1` → `insert` cópia com todas as colunas (exceto `id`) e o `cliente_id` do dono.
  5. Apagar tipos Contábil `padrao=false`, sem vínculo, `cliente_id is null` (personalizados sem dono).
  6. Snapshot "depois" com a regra nova (tipo do cliente se existir, senão do setor) e `raise exception` se houver qualquer diferença em relação ao "antes" (comparar com `is distinct from`).
- [ ] **Step 2: Aplicar no dev** via `secrets_run` + psql 17 com `DEV_DATABASE_URL` (trava: URL contém `fcpcorqquovvgtoukxry` e não contém `qilwxzpxkjzbfrwlbydt`; senha separada no último `@`, `UnescapeDataString`). Esperado: `COMMIT`, sem exception.
- [ ] **Step 3: Conferir no dev**: `select count(*) from tarefa_tipos where setor='contabil' and cliente_id is null and not padrao and id not in (select tarefa_tipo_id from tarefa_tipo_vinculos)` = 0; e nenhuma linha com `cliente_id` fora do Contábil.
- [ ] **Step 4: Commit** `feat(db): 070 tarefa_tipos por cliente no Contábil`.

### Task 2: Helpers puros + filtros do catálogo do setor

**Files:**
- Modify: `lib/tarefa-tipos.ts`, `lib/tarefas-esperadas.ts`, `lib/tarefa-tipos-actions.ts`, `lib/tarefas-do-cliente.ts`, `lib/tarefa-tipo-vinculos-actions.ts` (`listarTarefaTiposDoSetor`), `app/(comum)/vinculos/page.tsx`, `app/contabil/clientes/page.tsx`, `app/contabil/clientes/[id]/page.tsx` (só o `tarefasPadrao`)
- Test: `tests/tarefa-tipos-por-cliente.test.ts`, `tests/tarefas-esperadas.test.ts`

**Interfaces:**
- Produces:
  - `resolverTiposDoCliente<T extends { nome: string; cliente_id: string | null }>(tipos: T[], clienteId: string): T[]` em `lib/tarefa-tipos.ts` — um por nome; o do cliente vence o do setor; tipos de outros clientes são descartados.
  - `nomeNoCatalogo(catalogo: string[], nome: string): string | null` em `lib/tarefa-tipos.ts` — a grafia do catálogo para o nome (mesma comparação de `tarefaExisteNoCatalogo`), ou null.
  - `MapaVinculosSetor` ganha `inicioPorCliente?: Record<string, Record<string, string>>` e `fimPorCliente?: Record<string, Record<string, string>>` (clienteId → nome → data). `buscarMapaVinculosSetor` seleciona `cliente_id` e separa: nulo → `inicioPorTarefa/fimPorTarefa`; preenchido → `*PorCliente`.
  - `calcularTarefasEsperadas(cliente, mapa, periodo?)`: `cliente` aceita `id?: string | null` e `cliente_id?: string | null`; chave = `cliente_id ?? id`; data do cliente vence a do setor.

- [ ] **Step 1: Testes que falham**
  - `resolverTiposDoCliente`: `[{nome:'A',cliente_id:null,f:1},{nome:'A',cliente_id:'c1',f:2},{nome:'A',cliente_id:'c2',f:3},{nome:'B',cliente_id:null,f:4}]` com `'c1'` → `A.f===2`, `B.f===4`, tamanho 2; com `'c9'` → `A.f===1`.
  - `nomeNoCatalogo(['Banco Santander'], ' banco santander ')` → `'Banco Santander'`; `nomeNoCatalogo([], 'x')` → `null`.
  - `calcularTarefasEsperadas`: mapa com `inicioPorTarefa: {}` e `inicioPorCliente: { c1: { X: '2026-10-01T12:00:00-03:00' } }`; cliente `{ id:'c1', tarefas_personalizadas:['X'] }` em set/2026 → `[]`, em out/2026 → `['X']`; cliente `{ id:'c2', tarefas_personalizadas:['X'] }` em set/2026 → `['X']`.
- [ ] **Step 2: `npm test`** → FAIL nos novos.
- [ ] **Step 3: Implementar** os helpers e o mapa por cliente.
- [ ] **Step 4: Filtrar `.is('cliente_id', null)`** em toda leitura do catálogo do setor: `buscarTiposSemUso` (consulta de tipos), lookup de `existente` no 23505 de `criarTipoTarefa`, `listarTarefaTiposDoSetor`, `app/(comum)/vinculos/page.tsx`, e o `tarefa_tipos` que alimenta `tarefasPadrao` em `app/contabil/clientes/page.tsx` e `app/contabil/clientes/[id]/page.tsx`. Rodar `grep -rn "from('tarefa_tipos')" app lib components` e, para cada leitura com `eq('setor', 'contabil')` ou com `setor` variável não listada aqui, decidir: catálogo do setor → filtro; por cliente → Task 3. Registrar a decisão no commit.
- [ ] **Step 5: `npm test`** → PASS; `npx tsc --noEmit` → sem erros.
- [ ] **Step 6: Commit** `feat(contabil): helpers de tipo por cliente e catálogo do setor sem tipos de cliente`.

### Task 3: Leitores do Contábil resolvem por cliente

**Files:**
- Modify: `app/contabil/clientes/[id]/page.tsx`, `app/contabil/clientes/actions.ts` (consulta de `etapas` ~linha 227), `app/contabil/preenchimento-rapido/page.tsx`, `lib/preenchimento-rapido.ts`, `components/PreenchimentoRapido.tsx`, e `app/contabil/{clientes/page,dashboard/page,relatorios/page}.tsx` se o objeto passado a `calcularTarefasEsperadas` não tiver `id`/`cliente_id`
- Test: `tests/preenchimento-rapido*.test.ts` (o existente)

**Interfaces:**
- Consumes: `resolverTiposDoCliente`, `calcularTarefasEsperadas` com `id` (Task 2).
- Produces: `tarefasAplicaveisCliente(cliente, mapa, tiposData, tiposNaoData?, naoDataPorCliente?: Record<string, Set<string>>)` e `tarefasDisponiveisParaClientes(clientes, mapa, tiposData, tiposNaoData?, naoDataPorCliente?)`; prop opcional `naoDataPorCliente?: Record<string, string[]>` em `PreenchimentoRapido`. Personalizada de `c` sai se estiver em `naoDataPorCliente[c.id]`.

- [ ] **Step 1: Teste que falha**: `tarefasAplicaveisCliente` com `tiposData` e `tiposNaoData` vazios, cliente `{id:'c1', tarefas_personalizadas:['S']}` e `naoDataPorCliente={c1:new Set(['S'])}` → não contém `'S'`; cliente `c2` com a mesma personalizada → contém `'S'`.
- [ ] **Step 2: `npm test`** → FAIL.
- [ ] **Step 3: Implementar**:
  - ficha `[id]`: buscar `tarefa_tipos` do Contábil com `.or(\`cliente_id.is.null,cliente_id.eq.${id}\`)` e passar por `resolverTiposDoCliente` antes de montar os mapas existentes;
  - `actions.ts` (etapas da tarefa-pai): mesmo filtro + resolver para o `clienteId` da ação;
  - preenchimento rápido: `tiposData/tiposNaoData` só dos tipos `cliente_id is null`; dos tipos de cliente, montar `naoDataPorCliente` (não-data = `tipo_resposta !== 'data'` ou com etapas) e passar à grade;
  - garantir `id` nos objetos passados a `calcularTarefasEsperadas` nas páginas listadas.
- [ ] **Step 4: `npm test`** → PASS; `npx tsc --noEmit` ok.
- [ ] **Step 5: Commit** `feat(contabil): ficha, etapas e preenchimento rápido leem o tipo do cliente`.

### Task 4: Criar e remover no cadastro do cliente

**Files:**
- Modify: `components/geral/NovoTipoTarefaModal.tsx`, `components/contabil/EmpresaContabilModal.tsx`, `app/contabil/clientes/actions.ts` (`salvarClienteContabil`), `lib/remover-cliente-do-setor.ts`
- Create: `lib/tipos-do-cliente.ts` (helpers puros do salvar)
- Test: `tests/tipos-do-cliente.test.ts`

**Interfaces:**
- Produces:
  - `interface NovoTipoConfig { tipoResposta: TipoResposta; etapas: string[] | null; mesesVisiveis: number[] | null; inicioEm: PeriodoTarefas | null }` (em `lib/tipos-do-cliente.ts`).
  - `NovoTipoTarefaModal` prop opcional `adiar?: boolean`; com ela, "Criar" não chama `criarTipoTarefa` e chama `onCriado(nome, config: NovoTipoConfig)`. Sem ela, comportamento atual (Fiscal/Pessoal/admin intactos).
  - `salvarClienteContabil(clienteId, clientePayload, contabilPayload, tiposNovos: Record<string, NovoTipoConfig> = {})`.
  - `nomesParaApagar(personalizadasAntes: string[], esperadasDepois: string[], tiposNovos: string[]): string[]` = `tarefasRemovidasDoCliente(antes, depois)` ∪ (nomes de `tiposNovos` que estavam em `antes`).
- Comportamento do servidor (depois de gravar o cliente, novo ou existente):
  1. `apagar = nomesParaApagar(...)`; `apagarTarefasDoCliente(supabase, clienteId, 'contabil', apagar)`; `delete from tarefa_tipos where setor='contabil' and cliente_id=clienteId and nome in apagar`. No Contábil não chamar mais `apagarTiposSemUso`.
  2. Para cada `tiposNovos` ainda em `contabilPayload.tarefas_personalizadas`: `insert` com `setor='contabil'`, `cliente_id`, `padrao=false`, `tipo_resposta`, `etapas`, `meses_visiveis`, `criado_em = criadoEmDoPeriodo(inicioEm)` (omitir se null). Erro → devolver `{ error }` (mensagem do banco).
- Comportamento do modal:
  - `catalogoNomes` = tipos `cliente_id is null` do Contábil (remover o uso de `listarNomesDeTiposSemUso` aqui).
  - `addTarefa`: se o nome já está na ficha (comparação de `tarefaExisteNoCatalogo`) → não faz nada; se `nomeNoCatalogo(catalogoNomes, t)` → adiciona com a grafia do catálogo; senão abre `NovoTipoTarefaModal` com `adiar` e `inicioEm` atual.
  - `handleTipoCriado(nome, config)`: guarda em `tiposNovos[nome]` e adiciona à lista. Tirar da lista um nome de `tiposNovos` que não estava em `personalizadasOriginais` só descarta do estado.
  - Aviso de remoção no salvar: lista também os nomes de `tiposNovos` que estavam em `personalizadasOriginais` (são recriações).
- `removerClienteDoSetor` com setor `contabil`: apagar `tarefa_tipos` com `cliente_id` = cliente e setor `contabil`.

- [ ] **Step 1: Testes que falham** (`tests/tipos-do-cliente.test.ts`): `nomesParaApagar(['A','B'], ['A'], [])` → `['B']`; `nomesParaApagar(['A'], ['A'], ['A'])` → `['A']`; `nomesParaApagar([], ['N'], ['N'])` → `[]`.
- [ ] **Step 2: `npm test`** → FAIL.
- [ ] **Step 3: Implementar** helpers, action, modal, `NovoTipoTarefaModal` e `removerClienteDoSetor`.
- [ ] **Step 4: `npm test`** → PASS; `npx tsc --noEmit` ok; `grep -n "criarTipoTarefa\|listarNomesDeTiposSemUso" components/contabil` → vazio.
- [ ] **Step 5: Commit** `feat(contabil): tarefa personalizada criada e apagada por cliente`.

### Task 5: Verificação final e PR

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run build` → todos ok (colar contagem de testes).
- [ ] **Step 2:** `git push -u origin feat/tarefa-personalizada-por-cliente` e `gh pr create --base dev` com: problema (caso Banco Santander), o que muda, migration 070 já aplicada no dev, "não testado no navegador", e **ordem para produção: aplicar 070 ANTES do merge da promoção** (as cópias têm o mesmo formato, então o código antigo continua funcionando com o banco novo; o código novo quebra sem a coluna).
