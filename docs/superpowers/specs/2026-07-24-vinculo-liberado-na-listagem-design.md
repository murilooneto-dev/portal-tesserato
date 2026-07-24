# Selo de vínculo liberado na listagem de clientes

**Data:** 2026-07-24
**Status:** Aprovado

## Contexto

Existe um mecanismo de vínculo entre tarefas de setores diferentes (`tarefa_vinculos`, admin-gerenciado, catálogo de pares `setor_origem/tipo_origem → setor_destino/tipo_destino`; cada cliente ativa quais vínculos valem pra ele via `clientes.tarefas_vinculadas_ativas`). Hoje, saber se uma tarefa de origem já foi concluída (liberando a tarefa vinculada deste setor) só é visível dentro da tela de detalhe do cliente — `lib/vinculos.ts` (`buscarVinculosDoCliente`) calcula isso por cliente/mês, e `components/fiscal/TarefaChecklist.tsx:306-316` renderiza um selo `✓ Liberada por {Setor}` (verde) ou `⏳ Aguardando {Setor}` (laranja) ao lado do nome da tarefa no checklist.

O usuário precisa saber que um cliente tem uma tarefa liberada por outro setor **sem abrir o cliente**, direto na tela de listagem (`/fiscal/clientes`, `/contabil/clientes`, `/pessoal/clientes`).

## Objetivo

Na listagem de clientes de cada setor, ao lado do nome do cliente, aparece um selo `✓ Liberada por {Setor}` — visualmente idêntico ao já usado no checklist — pra cada vínculo ativo do cliente cuja tarefa de origem está concluída **e** cuja tarefa de destino (deste setor, no mês corrente da listagem) ainda não está concluída. O selo some sozinho assim que a tarefa deste setor for marcada como concluída. Se houver mais de um vínculo pendente, aparece um selo por vínculo.

## Fora de escopo

- Mostrar o selo "⏳ Aguardando" (origem ainda não concluída) na listagem — só o caso "liberada" interessa aqui, é isso que o usuário precisa notar sem abrir o cliente.
- Mudar `buscarVinculosDoCliente`/o comportamento do checklist na tela de detalhe — continuam exatamente como estão.
- Setores Societário/Financeiro — ainda não têm listagem de clientes funcional.

## Design

### 1. Backend — `lib/vinculos.ts`

Nova função `buscarPendenciasVinculoPorCliente`, que calcula pra **todos os clientes da listagem de uma vez** (não em loop por cliente, evitando N+1 queries):

```ts
export interface PendenciaVinculo {
  tipoDestino: string
  tipoOrigem: string
  setorOrigemLabel: string
}

export async function buscarPendenciasVinculoPorCliente(
  supabase: SupabaseClient,
  clientes: { id: string; tarefas_vinculadas_ativas: string[] }[],
  tarefasDestinoDoMes: { cliente_id: string; tipo: string; concluida: boolean }[],
  setorAtual: UserSetor,
  mes: number,
  ano: number,
): Promise<Record<string, PendenciaVinculo[]>> {
  const idsVinculosAtivos = Array.from(new Set(clientes.flatMap(c => c.tarefas_vinculadas_ativas)))
  if (idsVinculosAtivos.length === 0) return {}

  const { data: vinculosRaw } = await supabase
    .from('tarefa_vinculos')
    .select('*')
    .in('id', idsVinculosAtivos)
    .eq('setor_destino', setorAtual)

  const vinculos = vinculosRaw ?? []
  if (vinculos.length === 0) return {}

  const setoresOrigem = Array.from(new Set(vinculos.map(v => v.setor_origem as UserSetor)))
  const origemConcluidaPorSetor: Record<string, Record<string, boolean>> = {}
  for (const setorOrigem of setoresOrigem) {
    const tarefasOrigem = await buscarTodasTarefasDoMes<{ cliente_id: string; tipo: string; concluida: boolean }>(
      supabase, mes, ano, 'cliente_id, tipo, concluida', setorOrigem
    )
    const mapa: Record<string, boolean> = {}
    for (const t of tarefasOrigem) mapa[`${t.cliente_id}||${t.tipo}`] = t.concluida
    origemConcluidaPorSetor[setorOrigem] = mapa
  }

  const destinoConcluida: Record<string, boolean> = {}
  for (const t of tarefasDestinoDoMes) destinoConcluida[`${t.cliente_id}||${t.tipo}`] = t.concluida

  const resultado: Record<string, PendenciaVinculo[]> = {}
  for (const c of clientes) {
    const vinculosDoCliente = vinculos.filter(v => c.tarefas_vinculadas_ativas.includes(v.id as string))
    for (const v of vinculosDoCliente) {
      const origemFeita = !!origemConcluidaPorSetor[v.setor_origem as string]?.[`${c.id}||${v.tipo_origem}`]
      const destinoFeita = !!destinoConcluida[`${c.id}||${v.tipo_destino}`]
      if (origemFeita && !destinoFeita) {
        if (!resultado[c.id]) resultado[c.id] = []
        resultado[c.id].push({
          tipoDestino: v.tipo_destino as string,
          tipoOrigem: v.tipo_origem as string,
          setorOrigemLabel: SETOR_LABEL[v.setor_origem as UserSetor],
        })
      }
    }
  }
  return resultado
}
```

Custo: no pior caso, 1 query pra buscar os vínculos aplicáveis + 1 query por setor de origem distinto entre eles (normalmente 1, no máximo 2, já que só existem 3 setores funcionais hoje) — não cresce com o número de clientes.

### 2. Páginas de listagem

`app/fiscal/clientes/page.tsx`, `app/contabil/clientes/page.tsx`, `app/pessoal/clientes/page.tsx` chamam `buscarPendenciasVinculoPorCliente` depois de já terem `clientes` e `tarefas` (a mesma variável já usada pra `progressoMap` serve como `tarefasDestinoDoMes`), e passam o resultado como nova prop `pendenciasVinculo: Record<string, PendenciaVinculo[]>` pro componente de lista.

### 3. UI — selo na listagem

`components/fiscal/ClientesLista.tsx`, `components/contabil/ClientesListaContabil.tsx`, `components/pessoal/ClientesListaPessoal.tsx`: logo depois do nome do cliente (mesma posição de `{cliente.nome}`), renderiza um selo por item de `pendenciasVinculo[cliente.id] ?? []`, com o markup idêntico ao já usado em `TarefaChecklist.tsx:306-316` (só o caso "liberada", sem o ramo "aguardando"):

```tsx
{(pendenciasVinculo[cliente.id] ?? []).map((p, i) => (
  <span key={i} className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap bg-green-500/15 text-green-400">
    ✓ Liberada por {p.setorOrigemLabel}
  </span>
))}
```

### Erros e casos de borda

- Cliente sem nenhum vínculo ativo (`tarefas_vinculadas_ativas` vazio): não aparece nada, sem custo extra (a função já retorna cedo se a união de ids ativos entre todos os clientes for vazia).
- Setor sem nenhum `tarefa_vinculos` com `setor_destino` igual ao setor da listagem: mesma coisa, retorno cedo.
- Vínculo liberado E a tarefa deste setor já concluída: não aparece (é exatamente a condição de "resolvido", já não precisa mais chamar atenção).
- Múltiplos vínculos pendentes pro mesmo cliente: um selo por vínculo, lado a lado, sem limite artificial (na prática são poucos, já que `tarefa_vinculos` é uma tabela pequena e ad hoc).

## Testes

Sem suíte automatizada no projeto. Verificação via `npx tsc --noEmit -p .` e `npm run build`, mais roteiro manual (criar um vínculo de teste via `/vinculos`, ativá-lo num cliente de teste via `/clientes`, marcar a tarefa de origem como concluída no setor de origem, confirmar que o selo aparece na listagem do setor de destino ao lado do nome do cliente; marcar a tarefa de destino como concluída e confirmar que o selo some).
