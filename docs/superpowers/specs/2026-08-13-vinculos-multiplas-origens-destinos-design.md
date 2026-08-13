# Vínculos de tarefas com múltiplas origens e múltiplos destinos

Data: 2026-08-13

## Contexto

O catálogo de vínculos entre tarefas de setores diferentes (`/vinculos`, tabela
`tarefa_vinculos`) hoje só permite criar um vínculo por vez: uma tarefa de
origem (setor + tipo) ligada a uma tarefa de destino (setor + tipo). O usuário
quer poder, numa mesma criação, vincular várias tarefas de origem e/ou várias
tarefas de destino — por exemplo "Origem A + Origem B → Destino X" (destino
depende de duas origens) ou "Origem X → Destino A + Destino B" (uma origem
libera duas tarefas em setores diferentes).

O schema de `tarefa_vinculos` já é uma tabela de pares (uma linha por
origem→destino), então já suporta N:N sem alteração — o que falta é: (1) a UI
de criação permitir selecionar várias tarefas de cada lado de uma vez, e (2) a
lógica que calcula "liberada" hoje quebra quando duas origens diferentes
apontam pro mesmo destino (só a última processada "vence" — ver
`lib/vinculos.ts:46`).

## Decisões confirmadas com o usuário

- Criar vínculo com múltiplas tarefas de origem e/ou destino = produto
  cartesiano: marcar Origem A+B e Destino X cria dois vínculos (A→X, B→X).
- O seletor de Setor (origem/destino) continua único por lado — só a lista de
  tarefas daquele setor vira multi-seleção. Não dá pra misturar tarefas de
  setores diferentes do mesmo lado numa única criação.
- Quando um destino depende de várias origens, ele só fica "Liberada" quando
  **todas** as origens vinculadas e ativas pro cliente estiverem concluídas
  (E, não OU).
- Badge de progresso parcial usa contagem: `⏳ Aguardando (2/3 concluídas)`,
  sem nomear quais setores faltam.

## Design

### 1. Tela de catálogo (`/vinculos`)

`app/(comum)/vinculos/VinculosClient.tsx`: os dois `<select>` de "Tarefa"
(origem e destino) viram listas de checkboxes, dentro do setor único já
selecionado em cada lado (o `<select>` de Setor não muda). Ao trocar de setor,
a lista de checkboxes marcados daquele lado é limpa (mesmo comportamento atual
de resetar o tipo ao trocar setor).

Botão "Criar vínculo" fica habilitado quando há pelo menos 1 tarefa marcada em
cada lado. Ao clicar, calcula o produto cartesiano entre as tarefas de origem
e destino marcadas, filtra os pares que já existem no catálogo (comparando
contra `vinculosIniciais`, já disponível no componente) e chama a nova action
`criarVinculos` (plural) com a lista de pares restantes. Se todos os pares já
existiam, mostra uma mensagem de erro amigável ("Todos os vínculos
selecionados já existem") sem chamar a action.

Lista de vínculos existentes (parte de baixo da tela) não muda.

### 2. Server action

`app/(comum)/vinculos/actions.ts`: nova função `criarVinculos` substitui
`criarVinculo` (uso único, sem outros consumidores fora deste arquivo/tela —
pode remover a antiga em vez de manter as duas). Assinatura:

```ts
criarVinculos(input: {
  setorOrigem: UserSetor
  setorDestino: UserSetor
  pares: { tipoOrigem: string; tipoDestino: string }[] // produto cartesiano já calculado e filtrado de duplicatas no client
}): Promise<{ error?: string }>
```

Mesma checagem `exigirAcessoAdmin()` de hoje. Insere todos os `pares` num
único `insert` (array de rows). Mesmo `revalidatePath('/vinculos')` ao final.

### 3. Agregação de status de liberação — `lib/vinculos.ts`

`VinculoStatus` ganha dois campos novos:

```ts
export interface VinculoStatus {
  setorOrigemLabel: string   // mantém: label da 1ª origem (caso comum de 1 origem só)
  liberada: boolean          // true só quando TODAS as origens ativas estão concluídas
  concluidos: number         // quantas origens vinculadas e ativas já concluídas
  total: number               // quantas origens vinculadas e ativas ao todo
}
```

`buscarVinculosDoCliente` para de sobrescrever `resultado[tipoDestino]` a cada
vínculo processado (bug atual) e passa a agregar: agrupa os vínculos ativos
por `tipo_destino`, busca a conclusão de cada origem, e calcula
`concluidos`/`total`/`liberada` (E lógico) por grupo. `setorOrigemLabel`
guarda o label da primeira origem do grupo (na ordem em que vierem do
`.in('id', ...)`), usado só quando `total === 1`.

`buscarPendenciasVinculoPorCliente` (usado nas listagens) hoje devolve uma
`PendenciaVinculo` por vínculo pendente — se 2 origens miram o mesmo destino,
geram 2 entradas separadas. Passa a agregar por `(cliente, tipo_destino)`
também, reaproveitando os mesmos campos novos:

```ts
export interface PendenciaVinculo {
  tipoDestino: string
  setorOrigemLabel: string
  liberada: boolean
  concluidos: number
  total: number
}
```

`tipoOrigem` sai da interface (deixa de fazer sentido quando há mais de uma
origem); não é usado fora de `lib/vinculos.ts` e dos `ClientesLista*` (que só
usam pra chave React, trocável por `tipoDestino`).

### 4. Badges — 3× `TarefaChecklist*` e 3× `ClientesLista*`

Mesma regra de exibição nos 6 arquivos (fiscal/contábil/pessoal ×
checklist/listagem):

- `total === 1` (caso de hoje, sem mudança visual): `✓ Liberada por Fiscal` /
  `⏳ Aguardando Fiscal`
- `total > 1`: `✓ Liberada (3/3)` / `⏳ Aguardando (2/3 concluídas)`

## Fora de escopo

- Sem alteração de schema (`tarefa_vinculos` já suporta N:N via múltiplas
  linhas).
- Sem alteração na tela de ativar vínculos por cliente (`ClienteGeralModal.tsx`)
  — já é multi-seleção (checkboxes) e não muda.
- Sem opção de trocar E por OU na liberação (fora de escopo, confirmado com o
  usuário).
