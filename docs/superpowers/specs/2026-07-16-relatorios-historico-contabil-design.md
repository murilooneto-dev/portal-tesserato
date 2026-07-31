# Parte 3c — Relatórios + Histórico do Contábil

**Data:** 2026-07-16
**Branch:** `feat/motor-tarefas-setor` (local, dev-only)

## Contexto

O Fiscal tem duas telas que ainda não existem pro Contábil: `/fiscal/relatorios` (tabela filtrável de progresso por cliente, com impressão/PDF) e `/fiscal/historico` (gráfico de progresso mensal ao longo do ano, com quebra por responsável). Ambas hoje são Client Components que buscam tudo no navegador via `useEffect` — autenticação, role, clientes e tarefas — um padrão anterior ao que o Contábil já usa nas telas que construímos até aqui (Dashboard, Clientes: Server Component busca os dados, Client Component só cuida da interação).

Pedido do usuário: replicar o comportamento das duas telas, mas com liberdade pra melhorar o que fizer sentido — não uma cópia cega. Decisão tomada: adotar o padrão Server+Client já estabelecido no Contábil em vez de replicar o `useEffect` client-side do Fiscal. O resultado visual e funcional é equivalente; a diferença é só arquitetural (sem flash de loading, sem duplicar a checagem de admin/responsável no navegador — ela roda no servidor, filtrando a query antes de qualquer dado sair do backend).

## Objetivo

1. `/contabil/relatorios` — tabela filtrável de progresso por cliente (Responsável, Atividade, Tarefa, "Apenas pendências"), cards de estatística (Total/100%/Em Andamento/Não Iniciados), impressão/PDF, linkando pra `/contabil/clientes/[id]`.
2. `/contabil/historico` — gráfico de progresso mensal do ano corrente, com cards por responsável (clicáveis pra filtrar) e grid dos 12 meses.
3. Sidebar do Contábil ganha os itens "Relatórios" e "Histórico".

## Fora de escopo

- Migrar `/fiscal/relatorios` ou `/fiscal/historico` pro padrão Server+Client — ficam como estão, client-side, intocados.
- Qualquer filtro, coluna ou métrica nova que não exista nas telas do Fiscal — a melhoria aqui é arquitetural (server-fetch), não de escopo funcional.
- Peça A (Calendário) e Parte 3b (Dashboard) — já implementadas.

## Design

### 1. Diferenças em relação ao Fiscal (ambas as telas)

- **Sem conceito de grupo/regime** (Normal/Simples/MEI é exclusivo do Fiscal) — mesma decisão já tomada no Dashboard do Contábil. Em Relatórios: sem filtro de Regime, sem coluna "Regime" na tabela nem no HTML de impressão. Em Histórico: não havia lógica de grupo no original, nada a remover.
- **Fonte de dados:** `SELECT_CLIENTE_CONTABIL`/`flattenClienteContabil`/`ClienteComContabil` (`lib/clientes-contabil.ts`) em vez dos equivalentes Fiscal; tarefas via `setor='contabil'`.
- **Links de cliente:** `/contabil/clientes/[id]`, não `/fiscal/clientes/[id]`.
- **Chaves de `sessionStorage`** (via `useFiltroPersistente`) com namespace próprio — `relatorios-contabil:*` e `historico-contabil:responsavel` — pra não colidir com os filtros salvos do Fiscal (`relatorios:*`, `historico:responsavel`), já que `sessionStorage` é compartilhado pelo navegador independente da rota.
- **Arquitetura:** Server Component (`page.tsx`) busca `mes`/`ano` (`getMesAno()`), a `role`/`nome` do usuário logado, e os dados já filtrados pela regra de permissão (não-admin só vê clientes do próprio `responsavel`, mesma regra do Fiscal — mas aplicada na query do servidor, não depois no client). Client Component recebe tudo pronto via props e cuida só de filtros/interação/impressão.
- A constante `TAREFAS` do arquivo original do Fiscal (`app/fiscal/relatorios/page.tsx`) não é referenciada em nenhum lugar do arquivo — código morto, não é replicada.

### 2. `/contabil/relatorios`

- `app/contabil/relatorios/page.tsx` (Server Component, novo): busca `mes`/`ano`, `profile` do usuário (`role`, `nome`), clientes do Contábil (query com `.ilike('clientes_contabil.responsavel', nome)` se não-admin), tarefas do mês (`buscarTodasTarefasDoMes(supabase, mes, ano, '*', 'contabil')`). Passa `clientes`, `tarefas`, `isAdmin`, `mes`, `ano` pro componente client.
- `components/contabil/RelatoriosContabil.tsx` (Client Component, novo): mesma UI do Fiscal — barra de filtros (Responsável só se `isAdmin`, Atividade, Tarefa, checkbox "Apenas pendências"), 4 cards de estatística, tabela ordenada por % crescente (colunas: #, Cliente, CNPJ, Responsável, Progresso, Tarefas Pendentes, MIT — sem Regime), botão "Imprimir/Salvar PDF" gerando o mesmo HTML de impressão do Fiscal, sem o badge de regime. Linha clicável leva pra `/contabil/clientes/[id]`.
- Cálculo de progresso por cliente (`progresso()`): idêntico ao Fiscal — `total` = tamanho de `tarefas_personalizadas`, `feitas` = tarefas concluídas cujo tipo está nesse conjunto, `pendentes` = os tipos que faltam.

### 3. `/contabil/historico`

- `app/contabil/historico/page.tsx` (Server Component, novo): busca `ano` (de `getMesAno()`), `mes` (pra destacar o mês atual), `profile` (role/nome), clientes do Contábil (mesma regra de permissão), e todas as tarefas do ano (`setor='contabil'`, sem filtro de mês). Passa tudo pro componente client.
- `components/contabil/HistoricoContabil.tsx` (Client Component, novo): mesma UI do Fiscal — gráfico de barras dos 12 meses (progresso global), cards de responsável clicáveis pra filtrar (só se `isAdmin` e houver responsáveis), grid dos 12 meses com % de cada um. `calcStats()` idêntico: por mês, `total` = número de linhas em `tarefas` daquele mês pros clientes selecionados, `concluidas` = quantas têm `concluida=true`.

### 4. Sidebar

Em `components/fiscal/Sidebar.tsx`, `ITENS_POR_SETOR.contabil` ganha, depois do item "Clientes":

```ts
{ href: '/contabil/relatorios', label: 'Relatórios', icon: FileText },
{ href: '/contabil/historico',  label: 'Histórico',  icon: TrendingUp },
```

(`FileText` e `TrendingUp` já estão importados no topo do arquivo — usados pelos itens equivalentes do Fiscal.)

## Critério de sucesso

- `/contabil/relatorios` mostra dados reais do Contábil, filtra corretamente por Responsável/Atividade/Tarefa/Pendências, imprime um PDF sem coluna de Regime, e usuário não-admin só vê seus próprios clientes (aplicado no servidor).
- `/contabil/historico` mostra o gráfico anual e os cards por responsável com dados reais do Contábil.
- Filtros salvos de uma tela não vazam pra outra (Fiscal ↔ Contábil) nem entre Relatórios/Histórico.
- Sidebar do Contábil mostra "Relatórios" e "Histórico" funcionando.
- Nenhuma tela do Fiscal muda de comportamento.
