# Subetapas no Cadastro de Processos (Societário)

## Contexto

O Cadastro de Processos do Societário (`/admin/configuracoes/societario`, aba
Processos) permite cadastrar tipos de processo com uma lista de etapas —
hoje cada etapa é só um nome (`processo_tipos.etapas text[]`), que na tela
de execução do processo (ainda não construída) viraria um campo de texto
livre.

O usuário pediu que cada etapa possa ter subetapas, e que cada subetapa
tenha seu próprio formato de resposta: texto + anexo, checklist (caixinha
simples, sem data) ou data (caixinha + data de conclusão) — a mesma
linguagem visual já usada no formulário de tipo de tarefa
(`components/geral/NovoTipoTarefaModal.tsx`), mas como um conceito próprio
da subetapa.

Isso exige transformar `etapas` de uma lista de texto solta em uma
estrutura relacional: etapas passam a ser entidades com ID próprio, e cada
uma pode ter zero ou mais subetapas.

Escopo: só a estrutura de cadastro (criar tipo de processo com etapas e
subetapas, listar, expandir pra ver o detalhe, excluir o tipo inteiro).
Não inclui edição de etapas/subetapas depois de criadas (mesmo
comportamento de hoje — só criar e excluir o tipo inteiro) nem a tela de
execução do processo, que é trabalho futuro.

## Banco de dados

Nova migration `supabase/migrations/027_processo_etapas_subetapas.sql`:

```sql
create table processo_etapas (
  id                uuid primary key default gen_random_uuid(),
  processo_tipo_id  uuid references processo_tipos(id) on delete cascade not null,
  nome              text not null,
  ordem             integer not null default 0
);

create table processo_subetapas (
  id             uuid primary key default gen_random_uuid(),
  etapa_id       uuid references processo_etapas(id) on delete cascade not null,
  nome           text not null,
  tipo_resposta  text not null check (tipo_resposta in ('texto', 'checklist', 'data')),
  ordem          integer not null default 0
);

alter table processo_tipos drop column etapas;

alter table processo_etapas    enable row level security;
alter table processo_subetapas enable row level security;

create policy "Autenticados leem processo_etapas" on processo_etapas for select using (auth.uid() is not null);
create policy "Admin gerencia processo_etapas" on processo_etapas for all using (is_admin());

create policy "Autenticados leem processo_subetapas" on processo_subetapas for select using (auth.uid() is not null);
create policy "Admin gerencia processo_subetapas" on processo_subetapas for all using (is_admin());
```

`ordem` em ambas as tabelas guarda a posição de criação (índice na lista),
usada só pra ordenar a exibição — sem reordenação manual por enquanto.

`processo_tipos.etapas` é descartada: no banco de dev, hoje a tabela está
vazia (nenhum tipo de processo real foi cadastrado ainda — só testes
manuais que já foram excluídos), então o `drop column` não perde dado
real. Confirmar isso antes de aplicar a migration, e se houver alguma
linha, decidir com o usuário migrar manualmente ou apagar antes do drop.

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
  id: string
  nome: string
  subetapas: ProcessoSubetapaResumo[]
}

export interface ProcessoTipoResumo {
  id: string
  nome: string
  etapas: ProcessoEtapaResumo[]
}
```

- `listarProcessoTipos()` — select aninhado via Supabase (`processo_etapas(id, nome, ordem, processo_subetapas(id, nome, tipo_resposta, ordem))`), ordenado por `ordem` nos dois níveis, mapeado pro shape acima.
- `criarProcessoTipo(nome: string, etapas: { nome: string; subetapas: { nome: string; tipoResposta: SubetapaTipoResposta }[] }[])` — mesmo padrão de `exigirAdmin()` já usado:
  1. insere `processo_tipos` (nome), trata `23505` (nome duplicado) como sucesso silencioso igual já faz;
  2. insere as etapas em lote (`processo_etapas`, com `ordem` = índice), recuperando os IDs gerados;
  3. insere as subetapas em lote (`processo_subetapas`, com `etapa_id` correspondente e `ordem` = índice dentro da etapa).
  4. Se qualquer passo falhar depois do insert do tipo, apaga o `processo_tipo` recém-criado antes de retornar erro (evita registro órfão sem etapas) — não há transação client-side no supabase-js, então o rollback é manual.
- `excluirProcessoTipo(id)` — inalterado (cascade cuida de etapas/subetapas).

## UI (`app/admin/configuracoes/societario/ProcessosTab.tsx`)

**Formulário de criação**, estado local:

```ts
interface EtapaForm { nome: string; subetapas: { nome: string; tipoResposta: SubetapaTipoResposta }[] }
```

- Nome do tipo de processo — input, igual a hoje.
- Etapas — input de nome + "Adicionar etapa" continua criando um item na lista, mas cada item agora é renderizado como um bloco (não mais um chip), com:
  - o nome da etapa e um "×" pra remover a etapa inteira (igual hoje);
  - dentro do bloco: input de nome da subetapa + três botões tipo rádio (Texto + anexo / Checklist / Data, mesmo estilo visual dos formatos do `NovoTipoTarefaModal`) + "Adicionar subetapa";
  - lista das subetapas já adicionadas àquela etapa, cada uma como uma linha pequena com nome + selo do tipo + "×" pra remover só a subetapa.
- Botão "Criar tipo de processo" — desabilitado se não houver nome ou nenhuma etapa (subetapa continua opcional); ao confirmar, monta o payload aninhado e chama `criarProcessoTipo`.

**Listagem** dos tipos já criados:

- Cada item mostra nome + "N etapas" (contagem), com uma seta/botão pra expandir.
- Expandido, mostra cada etapa com suas subetapas abaixo (nome — selo do tipo). Etapa sem subetapas aparece só com o nome, sem seção extra.
- "Excluir" continua removendo o tipo inteiro (com confirm()), sem exclusão parcial de etapa/subetapa depois de criado.

## Fora de escopo

- Editar etapas/subetapas de um tipo já criado (só criar tudo de uma vez, ou excluir o tipo inteiro).
- Reordenar etapas/subetapas depois de criadas.
- Tela de execução do processo (onde as subetapas de fato seriam preenchidas/marcadas) — trabalho futuro, fora deste spec.
- Migrar dados de `processo_tipos.etapas` existentes — a tabela está vazia em dev, então o `drop column` é direto; confirmar antes de aplicar.

## Verificação

1. Aplicar a migration 027 no Supabase de dev.
2. `tsc --noEmit` limpo, suite de testes passando.
3. No navegador: criar um tipo de processo com 2 etapas, uma delas com 2 subetapas de tipos diferentes (ex.: uma "Texto + anexo", outra "Data") e a outra etapa sem nenhuma subetapa.
4. Expandir o item na listagem e conferir que as etapas e subetapas aparecem certas, com os selos de tipo corretos.
5. Excluir o tipo e confirmar que some da listagem (e que etapas/subetapas somem do banco via cascade).
