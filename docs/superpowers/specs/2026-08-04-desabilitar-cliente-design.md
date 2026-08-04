# Desabilitar cliente (por setor) — design

## Contexto

Hoje um cliente só pode ser mantido ativo indefinidamente ou excluído (exclusão
permanente, com confirmação de nome + palavra "DELETAR"). Não existe meio-termo
para clientes que pararam de ser atendidos mas cujo histórico (tarefas
concluídas, observações, etc.) precisa continuar salvo e consultável.

Este design adiciona um estado "desabilitado" por cliente, **por setor**
(Fiscal, Contábil, Pessoal têm cada um sua própria tabela filha —
`clientes_fiscal`, `clientes_contabil`, `clientes_pessoal` — 1:1 com
`clientes`). Desabilitar em um setor não afeta o mesmo cliente em outro setor.

## Modelo de dados

Migration nova (`019_clientes_ativo.sql`) adiciona a cada tabela filha:

```sql
alter table clientes_fiscal   add column if not exists ativo boolean not null default true;
alter table clientes_contabil add column if not exists ativo boolean not null default true;
alter table clientes_pessoal  add column if not exists ativo boolean not null default true;
```

Nenhuma exclusão de dado ocorre. Tarefas já criadas (linhas em `tarefas`),
observações, arquivos anexados etc. continuam no banco, inalterados. O campo
`ativo` só controla se o cliente aparece nas listas/contagens ativas dali pra
frente.

`ClienteFiscal`, `ClienteContabil`, `ClientePessoal` (`lib/types.ts`) ganham
`ativo: boolean`.

## Ações de servidor

Em cada `app/<setor>/clientes/actions.ts`:

```ts
export async function desabilitarCliente(clienteId: string, senha: string): Promise<{ error?: string }>
export async function reabilitarCliente(clienteId: string): Promise<{ error?: string }>
```

`desabilitarCliente`:
1. Pega o usuário autenticado da sessão atual (`getAuthenticatedAdmin` ou
   equivalente já usado nas actions existentes) e seu e-mail.
2. Reautentica com `signInWithPassword({ email: user.email, password: senha })`
   num cliente Supabase descartável (mesmo padrão de `verificarSenhaDev` em
   `app/fiscal/parametros/actions.ts`) — se falhar, retorna
   `{ error: 'Senha incorreta.' }`.
3. Se ok, `update` na tabela filha do setor: `ativo = false`.
4. `revalidatePath` das páginas de listagem/detalhe do setor.

`reabilitarCliente` apenas seta `ativo = true` e revalida — sem exigir senha,
por ser uma ação reversível e não destrutiva.

## UI — tela de detalhe do cliente

Em `ClienteAcoes.tsx` (Fiscal) / `ClienteContabilAcoes.tsx` (Contábil) /
`ClientePessoalAcoes.tsx` (Pessoal), ao lado de "Editar"/"Excluir":

- Cliente ativo → botão "Desabilitar". Ao clicar, abre modal (mesmo estilo
  visual do modal de exclusão já existente) explicando que a ação tira o
  cliente das listas ativas e das contagens dali pra frente, mas preserva o
  histórico. Pede duas confirmações digitadas: **nome do cliente** (igual ao
  já exigido para excluir) e **senha do usuário logado**. Botão de confirmar
  só habilita quando os dois campos batem; a senha só é validada no submit
  (chamada ao server action).
- Cliente desabilitado → botão vira "Reabilitar" (sem modal de senha, só uma
  confirmação simples) e uma badge cinza "Desabilitado" aparece no cabeçalho
  da página de detalhe.

A página de detalhe (`app/<setor>/clientes/[id]/page.tsx`) continua carregando
o cliente independente do valor de `ativo` — assim dá pra consultar histórico
ou reabilitar mesmo depois de desabilitado.

## UI — listagem de clientes

`ClientesLista` / `ClientesListaContabil` / `ClientesListaPessoal` passam a
receber todos os clientes do setor (ativos + desabilitados). Um novo checkbox
de filtro "Mostrar desabilitados" (mesmo padrão dos filtros já existentes,
como `filtroPendencia`, persistido com `useFiltroPersistente`) controla se os
desabilitados aparecem na lista — por padrão, desmarcado (comportamento atual
preservado: só ativos aparecem). Quando marcado, os desabilitados aparecem com
badge "Desabilitado" e um botão "Reabilitar" inline, fora do cálculo de
progresso/contagem da tela.

## Páginas que contam tarefas/clientes do mês

Passam a filtrar `ativo = true` na query (usando o filtro embutido do
PostgREST sobre a tabela filha, ex. `.eq('clientes_fiscal.ativo', true)`), de
forma que clientes desabilitados somem das contagens e das listas de
pendência:

- **Fiscal**: `app/fiscal/dashboard/page.tsx`, `app/fiscal/tarefas/page.tsx`,
  `app/fiscal/relatorios/page.tsx`, `app/fiscal/parcelamentos/page.tsx`,
  `app/(comum)/ferramentas/page.tsx`, `app/api/relatorios/fiscal/route.ts`.
- **Contábil**: `app/contabil/dashboard/page.tsx`,
  `app/contabil/relatorios/page.tsx`.
- **Pessoal**: `app/pessoal/dashboard/page.tsx`,
  `app/pessoal/relatorios/page.tsx`.

A página de listagem de cada setor (`app/<setor>/clientes/page.tsx`) é a
exceção: busca todos (ativos + desabilitados), pois é ali que o toggle
"Mostrar desabilitados" e o botão "Reabilitar" vivem.

## Fora de escopo

- Setores Societário e Financeiro (ainda não têm tabela filha de cliente
  equivalente).
- Qualquer exclusão ou expurgo automático de dado de cliente desabilitado.
- Notificação/aviso automático para o responsável do cliente ao desabilitar.
