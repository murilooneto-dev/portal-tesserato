# Parte 3a — Contábil: Clientes + Cliente Detalhe

**Data:** 2026-07-14
**Branch:** `feat/motor-tarefas-setor` (local, dev-only)

## Contexto

Partes 1 e 2 já entregaram: migração do Fiscal pra `clientes_fiscal` + `tarefas.setor` (Parte 1), e o schema do Contábil — `clientes_contabil`, `tarefa_tipos` (semeado com as 7 tarefas padrão), `tarefa_etapas` (Parte 2). Nenhuma página do Contábil existe ainda (`/contabil` é só um placeholder "Em construção").

Esta parte constrói o núcleo funcional do Contábil: listar clientes, ver detalhe, marcar tarefas. Decisão já tomada (sessão anterior): **cada setor tem seus próprios componentes** — não existe um checklist ou modal "genérico" compartilhado entre Fiscal e Contábil, porque as tarefas de cada setor são estruturalmente diferentes.

## Objetivo

1. `/contabil/clientes` — lista de clientes do setor Contábil (card list, filtros, progresso).
2. `/contabil/clientes/[id]` — detalhe do cliente com o checklist de tarefas do Contábil, incluindo a UI de "Movimentação" (4 etapas nomeadas com data cada).
3. Modal de criação/edição próprio do Contábil (campos: nome, CNPJ, município, UF, contato, atividade, responsável, prioridade, tarefas personalizadas).
4. Server actions próprias: marcar tarefa simples, marcar etapa de tarefa composta, excluir vínculo do cliente com o Contábil.

## Fora de escopo

- Dashboard, Calendário, Relatórios, Histórico do Contábil — Partes 3b/3c, planos futuros.
- Reaproveitar/generalizar `TarefaChecklist.tsx`, `EmpresaModal.tsx` ou `ClientesLista.tsx` do Fiscal — decisão explícita, cada setor tem os seus.
- UI para `clientes_contabil.obs` — mesma lacuna que já existe hoje no Fiscal (`clientes_fiscal.obs` também não tem UI); não é resolvida aqui pra nenhum dos dois setores.
- Corrigir o `excluirCliente` do Fiscal (que hoje apaga a linha inteira de `clientes`, destruindo dados de outros setores num cliente multi-setor) — fica como um fix separado, futuro, fora desta parte.

## Design

### 1. Rotas e navegação

- `app/contabil/clientes/page.tsx` (lista) e `app/contabil/clientes/[id]/page.tsx` (detalhe), seguindo a mesma estrutura de Server Component + client actions que `/fiscal/clientes/*` já usa.
- `components/fiscal/Sidebar.tsx`: `ITENS_POR_SETOR.contabil` ganha um item `{ href: '/contabil/clientes', label: 'Clientes', icon: Users }`, mantendo o item "Em construção" apontando pra `/contabil` (ainda é o placeholder do Dashboard, até a Parte 3b).

### 2. Camada de dados (`lib/clientes-contabil.ts`, novo)

Mesma forma de `lib/clientes-fiscal.ts` (Parte 1):

```ts
export const SELECT_CLIENTE_CONTABIL = '*, clientes_contabil!inner(*)'
export type ClienteComContabil = Cliente & ClienteContabil
export function flattenClienteContabil(row): ClienteComContabil
```

Usa `!inner` (não left join) porque, diferente do `ClienteGeralModal` (que lista TODOS os clientes independente de setor), as páginas `/contabil/*` só mostram clientes que já têm `'contabil'` em `setores` — todo cliente retornado necessariamente tem linha em `clientes_contabil`.

### 3. Modal de cadastro (`components/contabil/EmpresaContabilModal.tsx`, novo)

Estrutura análoga ao `EmpresaModal.tsx` do Fiscal, mas com campos do Contábil:
- Compartilhados: nome, CNPJ, município, UF, contato.
- Próprios do Contábil: atividade, responsável, prioridade, tarefas personalizadas.
- **Sem** os campos exclusivos do Fiscal (ISS, SIGA, declaração anual, credenciais, código).

Ao criar cliente novo: `tarefas_personalizadas` pré-populado com as 7 tarefas de `tarefa_tipos where setor = 'contabil'` (sem lógica de atividade — são fixas, confirmado pelo usuário). Editável/removível por cliente, mesmo padrão de personalização que o Fiscal já tem.

Leitura via `SELECT_CLIENTE_CONTABIL` + `flattenClienteContabil`. Escrita: dois inserts sequenciais na criação (`clientes` depois `clientes_contabil`, mesmo padrão de `EmpresaModal`), update direto nas duas tabelas na edição (sem a restrição de somente-leitura que existe no `ClienteGeralModal` — aqui, diferente de lá, o modal É a tela de edição canônica do setor).

### 4. Checklist de tarefas (`components/contabil/TarefaChecklistContabil.tsx`, novo)

Recebe, além do que `TarefaChecklist.tsx` já recebe (tipos, tarefas do mês, callbacks), um mapa `tarefaTipos: Record<string, string[] | null>` (nome → etapas, vindo de `tarefa_tipos where setor='contabil'`, buscado uma vez pela página).

- Para `tipo` com `etapas === null`: input de data único (mesmo padrão DD/MM/AAAA do Fiscal), grava `tarefas.concluida`/`concluida_em`.
- Para `tipo` com `etapas` definidas (Movimentação): renderiza um input de data por etapa nomeada. Cada mudança grava/atualiza a linha correspondente em `tarefa_etapas` (upsert por `tarefa_id` + `nome`). Depois de cada gravação, recalcula: se todas as etapas dessa tarefa estão com data preenchida, marca `tarefas.concluida = true` (senão `false`) — assim o resto do sistema (dashboard, relatórios, futuros) só precisa olhar `concluida`, sem saber que "Movimentação" tem sub-estrutura.

### 5. Server actions (`app/contabil/clientes/actions.ts`, novo)

- `toggleTarefaContabil(clienteId, tipo, mes, ano, concluida, data?)` — mesmo padrão do `toggleTarefa` inline do Fiscal, mas com `setor: 'contabil'` no insert e `.eq('setor','contabil')` nas leituras.
- `atualizarEtapa(clienteId, mes, ano, tipo, etapaNome, concluida, data?)` — acha-ou-cria a linha em `tarefas` (setor contábil) pro tipo, depois acha-ou-cria a linha em `tarefa_etapas` pro nome da etapa, grava, e recalcula `tarefas.concluida` com base em todas as etapas daquele `tarefa_id` (busca as `etapas` esperadas em `tarefa_tipos` pra saber quantas existem no total).
- `excluirClienteContabil(clienteId)` — remove `'contabil'` de `clientes.setores`, apaga a linha de `clientes_contabil` (cascata cuida de `tarefas`/`tarefa_etapas` do setor contábil, já que `tarefas.cliente_id` referencia `clientes`, não `clientes_contabil` — precisa filtrar por `setor='contabil'` explicitamente ao apagar as tarefas, já que a FK não faz esse recorte sozinha). Se `setores` ficar vazio depois de remover, apaga a linha de `clientes` também.
- `podeEditarClienteContabil(clienteId)` — mesma lógica de `podeEditarCliente` (Fiscal), mas consultando `clientes_contabil.responsavel`. Função irmã, não parametrizada — consistente com "cada setor separado".

### 6. Lista de clientes (`components/contabil/ClientesListaContabil.tsx`, novo)

Card list análoga a `ClientesLista.tsx`: nome, CNPJ, atividade, responsável, barra de progresso (tarefas concluídas / total do mês). Sem filtro de "grupo" (Contábil não tem esse conceito — grupo é Fiscal-específico, `normal`/`simples`/`mei`).

## Critério de sucesso

- Criar, editar e excluir (só o vínculo) um cliente do Contábil funciona de ponta a ponta.
- Marcar as 6 tarefas simples funciona igual ao padrão do Fiscal.
- Marcar "Movimentação" mostra as 4 etapas, cada uma gravável independentemente, e a tarefa vira "concluída" só quando as 4 têm data.
- Nenhuma tela do Fiscal muda de comportamento.
