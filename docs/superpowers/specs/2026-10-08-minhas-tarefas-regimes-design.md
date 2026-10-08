# Minhas Tarefas: regimes que o usuário atende

Data: 2026-10-08
Setor: Fiscal
Branch: `feat/minhas-tarefas-regimes` (PR contra `dev`)

## Objetivo

Hoje um tipo de tarefa do Fiscal pode ter um dono (`tarefa_tipos.responsavel_id`).
Quando tem, a tarefa aparece em Minhas Tarefas do dono para todos os clientes e
some para o responsável de cada empresa.

O usuário passa a poder marcar os regimes com que trabalha. Nas empresas desses
regimes nada muda. Nas empresas dos outros regimes a tarefa deixa de ser do dono
e volta para o responsável da empresa, como se o tipo não tivesse dono.

A escolha é por pessoa: vale para todos os tipos de que ela é dona.

## Regra

Para um tipo com dono D e um cliente com regime R:

| Situação | Dono efetivo naquele cliente |
|---|---|
| D não marcou nenhum regime | D (comportamento de hoje) |
| D marcou regimes e R está entre eles | D |
| D marcou regimes e R não está entre eles | ninguém (tarefa comum) |
| D marcou regimes e o cliente está sem regime | ninguém (tarefa comum) |

"Ninguém" significa exatamente o comportamento de um tipo sem `responsavel_id`:
o responsável da empresa vê, marca, e a tarefa conta na % de progresso dela.

Comparação de regime por nome, com `trim` e minúsculas (mesmo `normalizarNome`
já usado no Fiscal). O cadastro do cliente guarda o regime como texto, sem FK.

Admin continua vendo e editando tudo.

## Banco (migration 069)

```sql
create table minhas_tarefas_regimes (
  user_id    uuid not null references profiles(id) on delete cascade,
  setor      text not null,
  regimes    text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, setor)
);
```

- RLS ligada.
- `select`: qualquer autenticado. As telas de todos os usuários precisam saber
  os regimes do dono de cada tipo para decidir o que mostrar. Não é dado sensível.
- `insert`/`update`/`delete`: `user_id = auth.uid()` ou `is_admin()`.
- Aditiva: sem linha na tabela, ou com `regimes` vazio, nada muda.
- Só `setor = 'fiscal'` é usado agora; a coluna existe para não precisar de
  outra migration se outro setor ganhar Minhas Tarefas.
- Conferir colisão de número com `gh pr list --state all` antes de nomear.

## Função central

Em `lib/tarefa-tipo-visibilidade.ts`, duas funções puras:

```ts
donoAtendeRegime(regimesDoDono, regimeCliente): boolean
donosNoRegime(donoPorTipo, regimesPorTipo, regimeCliente): Record<string, T>
```

`donoAtendeRegime` aplica a tabela da regra. `donosNoRegime` recorta um mapa
tipo -> dono (id ou nome) para um cliente, tirando os tipos cujo dono não atende
o regime dele. Todo ponto que hoje lê `responsavel_id` (ou o nome do dono) para
decidir visibilidade, permissão ou progresso passa o mapa por ela antes de usar.

Leitura dos regimes: `buscarRegimesPorTipo(supabase, 'fiscal')` devolvendo
`Record<nomeDoTipo, string[]>` (regimes marcados pelo dono daquele tipo), uma
consulta por página.

## Pontos que mudam

Visibilidade (`tipoVisivelParaUsuario`), hoje por tipo, passa a ser por tipo e cliente:

- `app/fiscal/clientes/[id]/page.tsx`: lista de tarefas visíveis e `podeEditarPorTipo`.
- `app/fiscal/clientes/page.tsx`: listagem e % por cliente.
- `app/fiscal/tarefas/page.tsx`: tela de Tarefas.

Permissão de escrita:

- `lib/supabase/server.ts:podeEditarTarefaTipo(clienteId, tipo)`: busca o regime
  do cliente e os regimes do dono; se o dono efetivo for nulo, cai em
  `podeEditarCliente`. O dono perde a escrita nos clientes fora dos seus regimes
  (a menos que seja o responsável da empresa). As variantes de Societário e
  Financeiro não mudam.

Progresso (`filtrarTiposDoProgresso` / `tipoContaNoProgressoDoCliente`), que recebe
o nome do dono por tipo, passa a receber o dono efetivo para aquele cliente:

- `lib/tarefa-tipo-donos.ts` e `lib/tarefa-tipo-donos-actions.ts`: o mapa passa a
  carregar também os regimes do dono.
- `app/fiscal/dashboard/page.tsx` e `lib/dashboard-meu.ts` (modo Meu, incluindo a
  lista de encaminhadas).
- `app/fiscal/relatorios/page.tsx`, `lib/relatorio-fiscal.ts`,
  `lib/relatorio-fiscal-envio.ts` (envio agendado).

Minhas Tarefas:

- `app/fiscal/minhas-tarefas/page.tsx`: lê os regimes do usuário alvo; cada seção
  lista só clientes cujo regime está marcado (ou todos, se nada marcado). O PDF
  (`lib/relatorio-minhas-tarefas-pdf.tsx`) recebe os mesmos dados já filtrados.
- Abas Eventos e Dossiê não mudam.

## Tela

No topo de Minhas Tarefas, acima das abas, campo "Regimes que atendo":

- Opções: regimes ativos do catálogo do Fiscal (`buscarCatalogoCliente`).
- Marcar/desmarcar salva na hora via Server Action e recarrega a página.
- Nada marcado: texto "Todos os regimes".
- Regime salvo que não existe mais no catálogo (renomeado ou desativado) aparece
  marcado com a indicação "fora do catálogo", para o usuário poder desmarcar.
  Renomear um regime em Configurações hoje não altera o texto no cadastro dos
  clientes, e também não altera a marcação; os dois ficam com o nome antigo e
  continuam batendo entre si.
- Componentes do sistema de design atual (`components/ui`), sem layout novo.

Server Action `salvarRegimesMinhasTarefas(userId, regimes)`:

- Usuário comum só grava a própria linha; admin grava a de qualquer usuário.
- Valida que cada regime é texto não vazio; remove duplicados.
- `upsert` em `minhas_tarefas_regimes` com `setor = 'fiscal'`.
- `revalidatePath` das telas do Fiscal afetadas.

Admin vendo outro usuário: o campo de regimes é editável; o restante da tela
continua somente leitura.

## Efeitos aceitos

- Desmarcar um regime transfere na hora as tarefas daquelas empresas para os
  responsáveis delas, sem aviso. Tarefas já concluídas continuam concluídas.
- A % de progresso das empresas afetadas muda, porque a tarefa volta a contar.
- Quem é dono de um tipo e também responsável de uma empresa fora dos seus
  regimes continua vendo a tarefa na ficha dessa empresa, agora como responsável.

## Fora do escopo

- Societário e Financeiro.
- Escolha de regime por tipo de tarefa.
- Aviso ou log para o responsável da empresa quando a tarefa volta para ele.
- Propagar renomeação de regime para clientes ou marcações.

## Testes

`node --test` + tsx, em `tests/`:

- `donoEfetivoDoTipo`: os quatro casos da tabela, mais tipo sem dono e diferença
  de caixa/espaços no nome do regime.
- Progresso: tipo com dono conta na % do cliente fora dos regimes do dono e não
  conta no cliente dentro deles.
- Filtro de clientes de Minhas Tarefas por regime (função pura extraída da página).

Verificação: `tsc --noEmit`, lint e a suíte de testes. Migration aplicada só no
banco de dev. Produção só depois de teste e OK do usuário, com backup.
