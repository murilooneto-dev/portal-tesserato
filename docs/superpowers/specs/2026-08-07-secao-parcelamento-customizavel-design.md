# Seção de parcelamento customizável — Design

Data: 2026-08-07

## Contexto

Hoje a "Seção" de um parcelamento (o órgão/local onde ele está — ex: "RECEITA FEDERAL - ECAC", "PGFN - ECAC") é um select fixo com 5 opções, definidas como constante `SECOES` em `app/fiscal/parcelamentos/page.tsx`. Não há como cadastrar um parcelamento numa seção que não esteja nessa lista fixa.

O objetivo é permitir que o usuário crie uma seção nova diretamente no fluxo de cadastro de parcelamento (persistente, disponível pra parcelamentos futuros), e também edite (renomeie) ou remova seções já existentes no catálogo.

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

### 3. Gerenciar seções (editar/remover)

- Um link "Gerenciar seções" logo abaixo do select de "Seção" no modal de criar/editar parcelamento, abrindo um modal próprio (`GerenciarSecoesModal`) com a lista de todas as seções do catálogo.
- Cada linha da lista tem: o nome da seção, um botão "Editar" (transforma o nome numa `<input>` inline com botões Salvar/Cancelar) e um botão "Remover".
- **Editar (renomear):** ao salvar um novo nome (normalizado do mesmo jeito que na criação: `trim()` + `toUpperCase()`), a operação atualiza `parcelamento_secoes.nome` **e** todos os `parcelamentos.secao` que estejam com o nome antigo, na mesma transação — nenhum parcelamento existente fica com um nome de seção que não existe mais no catálogo. Nome duplicado (já existe outra seção com esse nome após normalização): erro exibido no modal, não deixa salvar (diferente da criação, aqui não faz sentido "silenciosamente" fundir duas seções que já têm parcelamentos distintos).
- **Remover:** antes de remover, conta quantos `parcelamentos` usam essa seção. Se houver 1 ou mais, bloqueia a remoção e mostra a contagem ("Não é possível remover: 4 parcelamentos usam essa seção."). Só remove se a contagem for zero.
- Permissão: mesma regra da criação — qualquer usuário que pode cadastrar/editar parcelamento pode editar/remover seção, sem checagem de `role` adicional.

### 4. Onde mais a lista de seções é usada

O filtro "Todas as seções" no topo da página (`secaoFiltro`) e o agrupamento de linhas por seção (tanto na tela quanto no relatório impresso) já iteram sobre a mesma lista `SECOES`. Ao trocar a fonte pra vir do banco, esses dois lugares automaticamente passam a refletir qualquer seção criada, renomeada ou removida — não é uma mudança de comportamento adicional a implementar, é consequência direta de usar uma única fonte de dados. Depois de renomear ou remover uma seção, a página recarrega a lista de parcelamentos (a mesma função `load()` já usada após salvar/excluir um parcelamento) pra refletir qualquer `secao` que tenha mudado de nome.

## Fora de escopo

- Tela de gerenciamento dedicada fora do modal (ex: uma página própria em Parâmetros) — o modal acessado a partir do formulário de parcelamento cobre o caso de uso.
- Qualquer distinção de seção "padrão" vs "criada pelo usuário" (diferente do `tarefa_tipos.padrao`) — aqui todas as seções, fixas ou novas, são tratadas igual, inclusive pra edição/remoção (as 5 seções originais podem ser renomeadas ou removidas como qualquer outra).
