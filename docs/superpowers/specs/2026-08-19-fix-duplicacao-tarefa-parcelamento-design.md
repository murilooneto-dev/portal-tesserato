# Fix: duplicação de tarefa ao desambiguar parcelamentos da mesma seção

Data: 2026-08-19

## Contexto

Quando dois parcelamentos da mesma seção existem pro mesmo cliente,
`nomesTarefaParcelamentos` ([lib/parcelamento-tarefas.ts](../../../lib/parcelamento-tarefas.ts))
desambigua os nomes das tarefas geradas — ex.: "Parcelamentos (PGFN - ECAC)"
vira "Parcelamentos (PGFN - ECAC) (1)" e "Parcelamentos (PGFN - ECAC) (2)".
Isso é esperado e não muda com este fix.

O problema é em `sincronizarTarefasParcelamento`: o upsert que grava as
tarefas usa `onConflict: 'cliente_id,mes,ano,tipo,setor'` com
`ignoreDuplicates: true`. Quando o `tipo` calculado pra um parcelamento
existente muda (porque um segundo parcelamento da mesma seção apareceu),
o upsert não reconhece isso como "a mesma tarefa com nome novo" — ele só
sabe inserir combinações que ainda não existem. A tarefa antiga (nome sem
sufixo) nunca é renomeada nem removida; uma tarefa nova (nome com sufixo)
é criada do zero. Resultado confirmado no banco de dev: duas linhas em
`tarefas` com o **mesmo** `parcelamento_id`, mesmo cliente/mês/ano — uma
"Parcelamentos (PGFN - ECAC)" (órfã) e outra "Parcelamentos (PGFN - ECAC) (2)"
(atual).

## Objetivo

1. Daqui pra frente, quando a desambiguação mudar o nome de uma tarefa já
   existente pra um parcelamento, **renomear** a linha existente em vez de
   criar uma nova. Criar múltiplos parcelamentos na mesma seção pro mesmo
   cliente continua permitido e continua gerando uma tarefa por
   parcelamento — o que muda é só que cada parcelamento sempre tem
   exatamente **uma** tarefa por mês, nunca duas.
2. Limpar, uma vez, as duplicatas já existentes no banco de dev (e,
   depois, dar o script pronto pra você decidir quando rodar em produção).

## Mudanças

### 1. `sincronizarTarefasParcelamento` (`lib/parcelamento-tarefas.ts`)

Antes de montar a lista de inserção, buscar as tarefas já existentes pros
`parcelamento_id` dos parcelamentos resolvidos, filtradas por
`mes`/`ano`/`setor`:

```ts
const parcelamentoIds = resolvidos.map(({ parcelamento }) => parcelamento.id)
const { data: tarefasExistentesRaw } = await admin
  .from('tarefas')
  .select('id, parcelamento_id, tipo')
  .in('parcelamento_id', parcelamentoIds)
  .eq('mes', mes)
  .eq('ano', ano)
  .eq('setor', setor)
```

Nova função pura testável que separa o que precisa ser renomeado do que
precisa ser inserido:

```ts
interface TarefaExistente { id: string; parcelamento_id: string; tipo: string }

export function separarRenomeacoesEInsercoes(
  parcelamentoIds: string[],
  nomes: Map<string, string>,
  tarefasExistentes: TarefaExistente[],
): { renomear: { tarefaId: string; novoTipo: string }[]; inserirIds: string[] } {
  const existentePorParcelamento = new Map(
    tarefasExistentes.map(t => [t.parcelamento_id, t]),
  )
  const renomear: { tarefaId: string; novoTipo: string }[] = []
  const inserirIds: string[] = []
  for (const id of parcelamentoIds) {
    const nomeAtual = nomes.get(id)
    if (!nomeAtual) continue
    const existente = existentePorParcelamento.get(id)
    if (!existente) {
      inserirIds.push(id)
    } else if (existente.tipo !== nomeAtual) {
      renomear.push({ tarefaId: existente.id, novoTipo: nomeAtual })
    }
  }
  return { renomear, inserirIds }
}
```

`sincronizarTarefasParcelamento` usa essa função pra decidir, pra cada
parcelamento resolvido: renomear (`update` só do campo `tipo`, preserva
`concluida`/`concluida_em` como estão) ou inserir (segue exatamente o
fluxo de upsert atual, só que filtrado pra `inserirIds`).

### 2. Script de limpeza (`scripts/limpar-duplicatas-parcelamento.ts`)

Script Node standalone (roda com `tsx`, usa `SUPABASE_SERVICE_ROLE_KEY` do
`.env.development.local` por padrão — mesmo padrão de outros scripts
administrativos do repo):

1. Busca todas as tarefas com `parcelamento_id` não nulo.
2. Agrupa por `(parcelamento_id, mes, ano, setor)`.
3. Pra grupos com mais de uma linha: escolhe uma linha "sobrevivente"
   (a que tem `concluida=true`, se alguma tiver; senão, a mais antiga por
   `id`), atualiza seu `tipo` pro nome que `nomesTarefaParcelamentos`
   calcularia hoje pra esse parcelamento, e apaga as outras linhas do
   grupo.
4. Imprime um relatório (quantos grupos, quais tarefas foram mescladas/
   apagadas) antes de aplicar — roda em modo `--dry-run` primeiro, aplica
   de verdade só com `--apply`.

Roda contra o dev primeiro, com sua confirmação explícita antes do
`--apply`. Não roda contra produção nesta tarefa — fica pronto pra você
decidir quando rodar lá.

## Fora de escopo

- Impedir a criação de 2+ parcelamentos na mesma seção pro mesmo cliente —
  decisão explícita do usuário: isso continua permitido.
- O outro bug relatado nesta sessão (exclusão de parcelamento não
  removendo a tarefa vinculada via cascade) — investigação em andamento
  separadamente, ainda não confirmada como bug real (aguardando teste do
  usuário). Se confirmado, vira uma spec própria.

## Teste manual

1. Criar um parcelamento "PGFN - ECAC" pro Cliente X → gera 1 tarefa sem
   sufixo.
2. Criar um segundo parcelamento "PGFN - ECAC" pro mesmo Cliente X → a
   tarefa do primeiro deve ser **renomeada** pra "(1)" (mesma linha, não
   uma nova), e uma tarefa nova "(2)" deve ser criada pro segundo. Total:
   2 tarefas, nunca 3.
3. Marcar a tarefa "(1)" como concluída, depois criar um terceiro
   parcelamento na mesma seção → "(1)" deve continuar concluída após ser
   renomeada pra "(1)" novamente (nome não muda neste caso, mas o teste
   confirma que renomear não mexe em `concluida`).
