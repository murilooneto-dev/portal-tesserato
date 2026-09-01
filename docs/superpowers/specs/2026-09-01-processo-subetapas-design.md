# Subetapas no Cadastro de Processos (Societário)

## Contexto

O Cadastro de Processos do Societário (`/admin/configuracoes/societario`, aba
Processos) permite cadastrar tipos de processo com uma lista de etapas —
hoje cada etapa é só um nome (`processo_tipos.etapas text[]`).

**Atualização importante:** quando este spec foi desenhado originalmente, a
tela de execução do processo ainda não existia, e foi marcada como "fora de
escopo, trabalho futuro". No meio da implementação, descobrimos que outra
sessão já construiu e mergeou em `dev` essa tela
(`app/societario/procedimentos/page.tsx`, migration
`027_procedimentos_societario.sql`) — ela lê `processo_tipos.etapas`
diretamente (o array de texto) e guarda o valor digitado em cada etapa num
`jsonb` (`procedimentos_societario.campos`) **cuja chave é o nome da
etapa**. Isso muda a decisão de modelagem: **não vamos mais normalizar
`etapas` numa tabela própria com ID** (opção descartada, que quebraria essa
tela já em uso). Em vez disso, `processo_tipos.etapas` continua exatamente
como está, e as subetapas são penduradas nele pelo nome da etapa — a chave
natural que a tela de Procedimentos já usa.

O usuário pediu que cada etapa possa ter subetapas, e que cada subetapa
tenha seu próprio formato de resposta: texto + anexo, checklist (caixinha
simples, sem data) ou data (caixinha + data de conclusão) — a mesma
linguagem visual já usada no formulário de tipo de tarefa
(`components/geral/NovoTipoTarefaModal.tsx`), mas como um conceito próprio
da subetapa.

Escopo: só a estrutura de cadastro (criar tipo de processo com etapas e
subetapas, listar, expandir pra ver o detalhe, excluir o tipo inteiro).
Não inclui edição de etapas/subetapas depois de criadas (mesmo
comportamento de hoje — só criar e excluir o tipo inteiro) nem qualquer
mudança na tela de execução do processo (`app/societario/procedimentos/
page.tsx`) — essa tela continua funcionando exatamente como está; exibir
as subetapas ali é trabalho futuro, fora deste spec.

## Banco de dados

Nova migration `supabase/migrations/028_processo_subetapas.sql` (ver Task 1
do plano pro número exato — `027` já está em uso por
`027_procedimentos_societario.sql`):

```sql
create table processo_subetapas (
  id                uuid primary key default gen_random_uuid(),
  processo_tipo_id  uuid references processo_tipos(id) on delete cascade not null,
  etapa_nome        text not null,
  nome              text not null,
  tipo_resposta     text not null check (tipo_resposta in ('texto', 'checklist', 'data')),
  ordem             integer not null default 0
);

alter table processo_subetapas enable row level security;

create policy "Autenticados leem processo_subetapas" on processo_subetapas for select using (auth.uid() is not null);
create policy "Admin gerencia processo_subetapas" on processo_subetapas for all using (is_admin());
```

`processo_tipos.etapas` **não é alterada** — continua `text[]`, sem drop de
coluna, sem mudança nenhuma nela nem na tabela `processo_tipos`.

`etapa_nome` é a chave que liga a subetapa à etapa dentro do tipo (junto
com `processo_tipo_id`) — não existe uma entidade "etapa" própria com ID.
Como não há edição de etapas depois de criadas, o nome nunca muda, então
essa referência por nome é estável na prática.

`ordem` guarda a posição de criação da subetapa dentro da etapa, usada só
pra ordenar a exibição — sem reordenação manual por enquanto.

Excluir um tipo de processo cadastrado continua sendo um clique só: o
`on delete cascade` remove as subetapas junto (não há mais uma tabela
intermediária de etapas pra encadear).

## Server actions (`lib/processo-tipos-actions.ts`)

Tipos:

```ts
export type SubetapaTipoResposta = 'texto' | 'checklist' | 'data'

export interface ProcessoSubetapaResumo {
  id: string
  nome: string
  tipoResposta: SubetapaTipoResposta
}

export interface ProcessoEtapaResumo {
  nome: string
  subetapas: ProcessoSubetapaResumo[]
}

export interface ProcessoTipoResumo {
  id: string
  nome: string
  etapas: ProcessoEtapaResumo[]
}
```

- `listarProcessoTipos()` — duas queries simples (sem select aninhado, já
  que não há mais relação de FK entre etapa e subetapa): `processo_tipos`
  (`id, nome, etapas`) e `processo_subetapas` filtrada por
  `processo_tipo_id in (...)`. Uma função pura agrupa as subetapas por
  `(processo_tipo_id, etapa_nome)` e monta o `ProcessoTipoResumo[]`.
- `criarProcessoTipo(nome: string, etapas: { nome: string; subetapas: { nome: string; tipoResposta: SubetapaTipoResposta }[] }[])` — mesmo padrão de `exigirAdmin()` já usado:
  1. insere `processo_tipos` com `nome` e `etapas: etapas.map(e => e.nome)` (o array de nomes, exatamente como hoje), trata `23505` (nome duplicado) como sucesso silencioso;
  2. insere todas as subetapas de todas as etapas em um único lote (`processo_subetapas`, com `processo_tipo_id`, `etapa_nome`, `ordem` = índice dentro da etapa).
  3. Se o insert das subetapas falhar, apaga o `processo_tipo` recém-criado antes de retornar erro (evita registro órfão) — não há transação client-side no supabase-js, então o rollback é manual.
- `excluirProcessoTipo(id)` — inalterado (cascade cuida das subetapas).

## UI (`app/admin/configuracoes/societario/ProcessosTab.tsx`)

Sem mudança em relação ao spec original — o formulário de criação e a
listagem expansível descritos abaixo não dependem de como as etapas são
referenciadas no banco:

- Nome do tipo de processo — input, igual a hoje.
- Etapas — input de nome + "Adicionar etapa" continua criando um item na
  lista, cada item renderizado como um bloco com:
  - o nome da etapa e um "×" pra remover a etapa inteira;
  - dentro do bloco: input de nome da subetapa + três botões tipo rádio
    (Texto + anexo / Checklist / Data) + "Adicionar subetapa";
  - lista das subetapas já adicionadas àquela etapa, cada uma com nome +
    selo do tipo + "×" pra remover só a subetapa.
- Botão "Criar tipo de processo" — desabilitado se não houver nome ou
  nenhuma etapa (subetapa continua opcional); ao confirmar, monta o
  payload aninhado e chama `criarProcessoTipo`.
- Listagem: cada item mostra nome + "N etapas", expansível pra ver cada
  etapa com suas subetapas (nome — selo do tipo) abaixo.
- "Excluir" continua removendo o tipo inteiro, sem exclusão parcial.

## Fora de escopo

- Editar etapas/subetapas de um tipo já criado.
- Reordenar etapas/subetapas depois de criadas.
- Qualquer mudança em `app/societario/procedimentos/page.tsx` — exibir e
  preencher as subetapas na tela de execução é trabalho futuro.

## Verificação

1. Aplicar a nova migration no Supabase de dev.
2. `tsc --noEmit` limpo, suite de testes passando.
3. No navegador: criar um tipo de processo com 2 etapas, uma delas com 2
   subetapas de tipos diferentes (ex.: uma "Texto + anexo", outra "Data") e
   a outra etapa sem nenhuma subetapa.
4. Expandir o item na listagem e conferir que as etapas e subetapas
   aparecem certas, com os selos de tipo corretos.
5. Excluir o tipo e confirmar que some da listagem (e que as subetapas
   somem do banco via cascade).
6. Conferir que `/societario/procedimentos` continua funcionando
   normalmente (a tela de execução não foi tocada).
