# Aviso de parcelamento na ficha do cliente

Data: 2026-08-05

## Contexto

Existe hoje a página `app/fiscal/parcelamentos/page.tsx`, que cadastra parcelamentos (tabela `parcelamentos`) vinculados a uma empresa por nome/CNPJ (sem `cliente_id`). O objetivo desta mudança é: quando o usuário abre a ficha de um cliente (em Fiscal, Contábil ou Pessoal), e esse cliente tem parcelamento(s) em andamento, mostrar um aviso visual na ficha — sem precisar ir até a tela de Parcelamentos pra saber disso.

Hoje a tabela `parcelamentos` não tem um campo único de status geral (só 12 colunas de texto livre `jan`..`dez`, coloridas por palavra-chave: liquidado/cancelado/comunicado/outro). Não dá pra confiar nisso pra decidir se o parcelamento está ativo. Por isso a mudança inclui reestruturar esses campos.

## Escopo

### 1. Novo campo `status` no parcelamento

- Nova coluna `status` (text, not null, default `'EM ANDAMENTO'`), com check constraint para os 3 valores: `'EM ANDAMENTO'`, `'LIQUIDADO'`, `'CANCELADO'`.
- Na tela de cadastro/edição (`app/fiscal/parcelamentos/page.tsx`), select "Status" ao lado de Regime/Responsável/Local-Tipo, iniciando em "Em andamento" ao criar.
- Esse campo é a única fonte de verdade sobre se o parcelamento está ativo — usado tanto para o aviso na ficha quanto, opcionalmente, como filtro na própria tela de Parcelamentos.

### 2. Campos de mês (`jan`..`dez`) viram data

- As 12 colunas deixam de ser texto livre e viram `date` (nullable). Cada uma representa a data em que o parcelamento daquele mês foi emitido/enviado ao cliente.
- Na UI, os 12 inputs de texto viram `<input type="date">`. A lógica de cor por palavra-chave (`badgeColor` em `app/fiscal/parcelamentos/page.tsx:51-58`) é removida — não há mais categoria a colorir, só "preenchido" (mostra a data) ou "—" (vazio).
- Tabela e card expandido (linhas 330-345 e 379-390 do arquivo atual) passam a exibir a data formatada em vez do badge textual.

### 3. Preservação do histórico de texto

Antes de trocar o tipo da coluna, os 12 campos atuais (texto) são renomeados para `jan_obs`..`dez_obs`, preservando o conteúdo já cadastrado. As novas colunas `jan`..`dez` (date) nascem vazias. Os campos `*_obs` não aparecem em nenhuma tela — ficam só no banco, consultáveis manualmente se algum dia for necessário resgatar o histórico.

### 4. Vínculo cliente ↔ parcelamento (matching)

Não existe `cliente_id` na tabela `parcelamentos`. O vínculo é feito por CNPJ:

- `parcelamentos.cnpj` já é preenchido automaticamente hoje quando o usuário escolhe a empresa num dropdown vindo de `clientes` (não-avulsa). Entradas "avulsas" (`empresa_avulsa = true`) não têm CNPJ e naturalmente não têm como casar com nenhum cliente real — ficam de fora do aviso.
- Como `cnpj` mora na tabela `clientes` (base, compartilhada por todos os setores via `clientes.id`), o casamento por CNPJ funciona igual nas fichas de Fiscal, Contábil e Pessoal, sem precisar de coluna nova.
- Query: buscar em `parcelamentos` onde `cnpj = cliente.cnpj AND status = 'EM ANDAMENTO'`, agrupar por `secao` distinto.

### 5. Aviso na ficha do cliente

Nas 3 fichas server-side (`app/fiscal/clientes/[id]/page.tsx`, `app/contabil/clientes/[id]/page.tsx`, `app/pessoal/clientes/[id]/page.tsx`), busca-se (via Supabase, no próprio server component) os parcelamentos ativos do cliente pelo CNPJ. Se houver 1 ou mais, renderiza-se uma pill de alerta no bloco de selos do cabeçalho (mesmo local dos badges de regime/atividade/responsável/município — ex. `app/fiscal/clientes/[id]/page.tsx:187-192`), com o mesmo padrão visual (`rounded-full`, texto pequeno), mas em cor de alerta (laranja/vermelho) para se destacar dos demais selos neutros:

> ⚠️ Cliente possui parcelamento! Ecac / PGFN

Mapa de label curto por `secao` (evita mostrar o nome completo e cansativo da seção):

| `secao` (banco)                         | label curto      |
|------------------------------------------|------------------|
| RECEITA FEDERAL - ECAC                    | Ecac             |
| PGFN - ECAC                                | PGFN             |
| SEFAZ - PARCELAMENTO MULTA AUTONOMA        | Sefaz (Multa)    |
| SEFAZ - PARCELAMENTOS                      | Sefaz            |
| FGTS DIGITAL                                | FGTS             |

Se o cliente tiver mais de um parcelamento ativo na mesma seção, ela aparece uma única vez na lista (labels distintos, unidos por " / ").

Implementação: helper compartilhado (ex. `lib/parcelamentos-aviso.ts`) com uma função que recebe `supabase` + `cnpj` e devolve a lista de labels distintos (ou vazio), reaproveitada pelas 3 páginas de ficha — evita duplicar a query e o mapa de labels em cada setor.

## Fora de escopo

- Não altera a tela de listagem cruzada de clientes (`app/(comum)/clientes/page.tsx`) — o aviso é só dentro da ficha individual.
- Não sincroniza automaticamente com produção — migration roda primeiro no dev; aplicação em produção é manual, feita pelo usuário (protocolo já estabelecido).
- Não expõe os campos `*_obs` preservados em nenhuma tela.
