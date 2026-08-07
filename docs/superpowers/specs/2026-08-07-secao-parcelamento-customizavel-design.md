# Seção de parcelamento customizável — Design

Data: 2026-08-07

## Contexto

Hoje a "Seção" de um parcelamento (o órgão/local onde ele está — ex: "RECEITA FEDERAL - ECAC", "PGFN - ECAC") é um select fixo com 5 opções, definidas como constante `SECOES` em `app/fiscal/parcelamentos/page.tsx`. Não há como cadastrar um parcelamento numa seção que não esteja nessa lista fixa.

O objetivo é permitir que o usuário crie uma seção nova diretamente no fluxo de cadastro de parcelamento, e que essa seção passe a existir na lista pra criação de parcelamentos futuros (persistente, não só pra aquele cadastro).

## Escopo

### 1. Nova tabela `parcelamento_secoes`

- Colunas: `id` (uuid, pk), `nome` (text, unique, not null), `created_at` (timestamptz, default now()).
- Migration cria a tabela e semeia as 5 seções que já existem hoje como constante, na mesma ordem atual: `RECEITA FEDERAL - ECAC`, `PGFN - ECAC`, `SEFAZ - PARCELAMENTO MULTA AUTONOMA`, `SEFAZ - PARCELAMENTOS`, `FGTS DIGITAL`.
- A partir dessa migration, a constante `SECOES` em `app/fiscal/parcelamentos/page.tsx` deixa de ser a fonte de verdade — a página passa a buscar a lista dessa tabela (ordenada por `created_at`, preservando as 5 originais no topo e as novas na ordem de criação).

### 2. Criar seção nova no fluxo de cadastro

- No select de "Seção" do modal de criar/editar parcelamento, uma última opção fixa `+ Criar nova seção...`.
- Ao escolher essa opção, revela um campo de texto simples logo abaixo do select (mesmo padrão visual dos outros campos do modal), com botão "Criar".
- Ao confirmar: nome é normalizado (`trim()` + `toUpperCase()`), salvo via server action em `parcelamento_secoes`, e a seção recém-criada passa a ser a selecionada no formulário — sem precisar reabrir o modal.
- Nome duplicado (já existe uma seção com esse nome após normalização): tratado como sucesso silencioso — a seção já existe, só seleciona ela (mesmo padrão de `criarTipoTarefa` em `lib/tarefa-tipos-actions.ts`, que trata a constraint unique como corrida entre dois usuários, não erro).
- Permissão: qualquer usuário que já pode cadastrar/editar parcelamento pode criar seção nova — sem tela de admin separada, sem checagem de `role` adicional.

### 3. Onde mais a lista de seções é usada

O filtro "Todas as seções" no topo da página (`secaoFiltro`) e o agrupamento de linhas por seção (tanto na tela quanto no relatório impresso) já iteram sobre a mesma lista `SECOES`. Ao trocar a fonte pra vir do banco, esses dois lugares automaticamente passam a incluir qualquer seção nova criada — não é uma mudança de comportamento adicional a implementar, é consequência direta de usar uma única fonte de dados.

## Fora de escopo

- Edição ou remoção de seções (só criação — o catálogo só cresce, igual ao `tarefa_tipos`).
- Tela de gerenciamento dedicada.
- Qualquer distinção de seção "padrão" vs "criada pelo usuário" (diferente do `tarefa_tipos.padrao`) — aqui todas as seções, fixas ou novas, são tratadas igual.
