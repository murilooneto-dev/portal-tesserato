# Setor Pessoal + Tarefa Avulsa ("+Evento")

**Data:** 2026-07-16
**Branch:** `feat/motor-tarefas-setor` (local, dev-only)

## Contexto

Fiscal e Contábil já têm o motor de tarefas completo (Dashboard, Clientes, Relatórios, Histórico, Calendário, Vínculos entre Setores). `pessoal` já existe no enum `user_setor` e em `SETORES`/`SETOR_LABEL`/`SETOR_HOME`/Sidebar, hoje só com uma tela placeholder "Em construção". Esta spec estende o mesmo motor pro setor Pessoal, replicando 1:1 o padrão do Contábil, e introduz um mecanismo novo — tarefa avulsa por cliente ("+Evento") — pedido pelo usuário especificamente para o Pessoal, mas desenhado como genérico desde já (mesmo espírito de Calendário e Vínculos, que nasceram genéricos para não repetir trabalho nos próximos setores).

## Objetivo

1. Setor Pessoal com as 4 telas do Contábil (Dashboard, Clientes, Relatórios, Histórico) mais Calendário (reaproveitando o componente já compartilhado), seguindo exatamente os mesmos padrões de dados, RLS e UI já validados.
2. Catálogo de tarefas padrão do Pessoal: Folha de Pagamento (com etapas), 13º Salário (com etapas, visível só em novembro/dezembro), Consulta Ecac - Situação Fiscal, Consulta FGTS - DET, Consulta Sindicato - Convenções (essas três simples).
3. Mecanismo genérico de tarefa avulsa por cliente: botão "+ Evento" na tela de detalhe do cliente abre um modal (Título, Descrição, Data), grava quem criou, aparece numa seção "Eventos do mês" separada do checklist principal, marcável como concluída, e desaparece de vez quando o mês vira (sem histórico). Habilitado já em Fiscal, Contábil e Pessoal.

## Fora de escopo

- Societário, Financeiro — sem sistema de tarefas ainda; o motor (incluindo tarefa avulsa) já funciona pra eles quando existirem, sem trabalho adicional.
- Seed de `calendario_eventos` pro Pessoal — não foi pedido; Admin cadastra manualmente pela tela `/pessoal/calendario` se quiser.
- Histórico ou qualquer forma de consulta de eventos avulsos de meses passados — decisão explícita do usuário: eles somem de vez ao virar o mês, não ficam consultáveis em lugar nenhum.
- Edição do texto de um evento avulso já criado — o modal só cria; se precisar corrigir, exclui e recria (mesmo nível de simplicidade que outras features desta branch tiveram no primeiro corte).
- Vínculos entre Setores envolvendo tarefas avulsas — o motor de vínculos (`tarefa_vinculos`) opera sobre `tarefas`/`tarefa_tipos`; tarefas avulsas ficam de fora desse cruzamento.

## Design

### 1. Modelo de dados (migration `010_setor_pessoal.sql`)

**`clientes_pessoal`** — espelho exato de `clientes_contabil`:

```sql
create table clientes_pessoal (
  cliente_id              uuid primary key references clientes(id) on delete cascade,
  atividade               text,
  responsavel             text,
  prioridade              integer default 0,
  obs                     text,
  tarefas_personalizadas  text[] not null default '{}'
);

create index idx_clientes_pessoal_responsavel on clientes_pessoal (lower(responsavel));

alter table clientes_pessoal enable row level security;

create policy "Setor pessoal le dados pessoal" on clientes_pessoal for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and 'pessoal' = any(p.setores)
  )
);

create policy "Admin gerencia dados pessoal" on clientes_pessoal for all using (is_admin());

create policy "Responsavel atualiza seus dados pessoal" on clientes_pessoal for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and lower(p.nome) = lower(clientes_pessoal.responsavel))
);
```

**`tarefa_tipos`** ganha coluna nova, genérica (não exclusiva do Pessoal):

```sql
alter table tarefa_tipos add column meses_visiveis smallint[];
```

`null` (default) = tarefa sempre visível, comportamento idêntico ao atual para todo o catálogo existente (Contábil não muda). Quando preenchido, a tarefa só é considerada visível/ativa nos meses listados.

Seed do catálogo Pessoal:

```sql
insert into tarefa_tipos (setor, nome, etapas, meses_visiveis) values
  ('pessoal', 'Folha de Pagamento', array['Gerar','Relatório','Guias','Envio'], null),
  ('pessoal', '13º Salário', array['Gerar','Relatório','Guias','Envio'], array[11,12]),
  ('pessoal', 'Consulta Ecac - Situação Fiscal', null, null),
  ('pessoal', 'Consulta FGTS - DET', null, null),
  ('pessoal', 'Consulta Sindicato - Convenções', null, null);
```

Backfill: clientes já com `'pessoal' = any(clientes.setores)` (se existirem no ambiente de dev) ganham linha em `clientes_pessoal` com as 5 tarefas do catálogo em `tarefas_personalizadas` — mesmo padrão usado na migration 007 pro Contábil.

**`tarefas_avulsas`** (nova, genérica — mecanismo "+Evento"):

```sql
create table tarefas_avulsas (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid references clientes(id) on delete cascade not null,
  setor        user_setor not null,
  titulo       text not null,
  descricao    text,
  data         date not null,
  criado_por   uuid references profiles(id) on delete set null,
  concluida    boolean not null default false,
  concluida_em timestamptz,
  created_at   timestamptz not null default now()
);

create index idx_tarefas_avulsas_cliente on tarefas_avulsas (cliente_id, setor);

alter table tarefas_avulsas enable row level security;

create policy "Setor le tarefas avulsas" on tarefas_avulsas for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and tarefas_avulsas.setor = any(p.setores)
  )
);

create policy "Setor gerencia tarefas avulsas" on tarefas_avulsas for all using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and tarefas_avulsas.setor = any(p.setores)
  )
);
```

Não há coluna `mes`/`ano`: pertencer "ao mês corrente" é derivado de `data` na query (`extract(month from data) = mês atual and extract(year from data) = ano atual`, calculado com o mesmo padrão de fuso `America/Sao_Paulo` já usado em `lib/calendario.ts`). Linhas de meses anteriores simplesmente não são buscadas por nenhuma tela — não é soft-delete nem arquivamento, apenas deixam de aparecer.

### 2. Telas e componentes do setor Pessoal

Réplica 1:1 da estrutura Contábil, trocando `contabil`/`Contabil` por `pessoal`/`Pessoal` e a tabela `clientes_contabil` por `clientes_pessoal`:

- `app/pessoal/layout.tsx`
- `app/pessoal/dashboard/page.tsx`
- `app/pessoal/clientes/page.tsx` + `app/pessoal/clientes/actions.ts` (`toggleTarefaPessoal`, `atualizarEtapa`, `excluirClientePessoal`)
- `app/pessoal/clientes/[id]/page.tsx`
- `app/pessoal/historico/page.tsx`
- `app/pessoal/relatorios/page.tsx`
- `app/pessoal/calendario/page.tsx` (usa `CalendarioSetor` já compartilhado, sem componente novo)
- `components/pessoal/EmpresaPessoalModal.tsx`
- `components/pessoal/ClientesListaPessoal.tsx`
- `components/pessoal/ClientePessoalAcoes.tsx`
- `components/pessoal/HistoricoPessoal.tsx`
- `components/pessoal/RelatoriosPessoal.tsx`
- `components/pessoal/TarefaChecklistPessoal.tsx`
- `lib/clientes-pessoal.ts` (`SELECT_CLIENTE_PESSOAL`, `ClienteComPessoal`, `flattenClientePessoal`)

**Diferença funcional única em relação ao Contábil:** em `TarefaChecklistPessoal` (e em todo cálculo de progresso que itera `tarefasPersonalizadas` — Dashboard, Relatórios, Histórico, detalhe do cliente), cada tipo é checado contra `tarefaTipos[tipo].meses_visiveis`; se definido e o mês corrente não estiver na lista, a tarefa (e suas etapas) é excluída da renderização e do denominador/numerador do progresso daquele mês. Sem `meses_visiveis`, comportamento idêntico ao Contábil hoje.

**Sidebar (`components/fiscal/Sidebar.tsx`):**

```ts
pessoal: [
  { href: '/pessoal/dashboard',  label: 'Dashboard',  icon: LayoutGrid },
  { href: '/pessoal/clientes',   label: 'Clientes',   icon: Users    },
  { href: '/pessoal/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/pessoal/historico',  label: 'Histórico',  icon: TrendingUp },
  { href: '/pessoal/calendario', label: 'Calendário', icon: Calendar },
],
```

`SETOR_HOME.pessoal` ajustado para `/pessoal/dashboard`; aproveitado para corrigir `SETOR_HOME.contabil` (hoje aponta pra `/contabil`, desatualizado) para `/contabil/dashboard`.

### 3. Mecanismo "+Evento" (tarefa avulsa por cliente)

**`lib/tarefas-avulsas.ts`** — funções server-side compartilhadas entre setores:
- `buscarTarefasAvulsasDoMes(supabase, clienteId, setor, mes, ano)` — lê `tarefas_avulsas` filtrando por `data` dentro do mês/ano informado.
- `criarTarefaAvulsa({ clienteId, setor, titulo, descricao, data, criadoPor })`
- `toggleTarefaAvulsa(id, concluida)`
- `excluirTarefaAvulsa(id)`

Todas usam o client Supabase autenticado normal (RLS já cobre a permissão — não precisa de service role como as actions de cliente, porque aqui não há necessidade de bypass: qualquer membro do setor pode gerenciar).

**`components/geral/EventoAvulsoModal.tsx`** — modal compartilhado (mesmo diretório de `ClienteGeralModal.tsx`). Campos: Título (obrigatório), Descrição (opcional, textarea), Data (obrigatório, `<input type="date">`). Ao submeter, chama `criarTarefaAvulsa` passando `criadoPor = profile.id` do usuário logado (não é campo do formulário).

**Integração nas telas de detalhe de cliente** (`app/fiscal/clientes/[id]/page.tsx`, `app/contabil/clientes/[id]/page.tsx`, `app/pessoal/clientes/[id]/page.tsx`):
- Botão "+ Evento" ao lado dos demais controles de ação, visível para qualquer usuário com `podeEditar = true` naquele cliente (mesma regra já usada para o resto da tela — admin ou responsável).
- Nova seção "Eventos do mês", renderizada abaixo do checklist principal, listando o resultado de `buscarTarefasAvulsasDoMes` para o cliente/setor/mês/ano correntes. Cada item: checkbox (chama `toggleTarefaAvulsa`), título, descrição (se houver), data formatada, "criado por {nome}" (via join com `profiles`), botão excluir (chama `excluirTarefaAvulsa`, com confirmação inline — mesmo padrão de `ClienteContabilAcoes`). Seção não aparece (ou mostra estado vazio discreto) quando não há eventos avulsos no mês.

### 4. Ordem de implementação sugerida

1. Migration (`clientes_pessoal`, `tarefa_tipos.meses_visiveis` + seed, `tarefas_avulsas` + RLS).
2. `lib/tarefas-avulsas.ts` + `EventoAvulsoModal.tsx` (mecanismo genérico, testável isoladamente).
3. Retrofit do botão "+ Evento" e seção "Eventos do mês" em Fiscal e Contábil (telas já existentes e estáveis — menor risco, valida o mecanismo genérico em terreno conhecido antes de construir o Pessoal em cima dele).
4. Setor Pessoal completo (Dashboard, Clientes, Relatórios, Histórico, Calendário) já incluindo "+ Evento" desde o início.

## Critério de sucesso

- `/pessoal/dashboard`, `/pessoal/clientes`, `/pessoal/clientes/[id]`, `/pessoal/relatorios`, `/pessoal/historico`, `/pessoal/calendario` funcionam com paridade de comportamento ao Contábil (progresso, filtros, impressão, RLS por responsável).
- Um cliente novo no Pessoal já nasce com as 5 tarefas do catálogo em `tarefas_personalizadas`.
- Em outubro, "13º Salário" não aparece em nenhuma tela do cliente nem conta pro progresso; em novembro e dezembro, aparece normalmente com suas 4 etapas.
- Botão "+ Evento" em Fiscal, Contábil e Pessoal cria uma tarefa avulsa que aparece em "Eventos do mês" do cliente certo, marcável, mostrando quem criou.
- Um evento avulso criado em junho não aparece mais em nenhuma tela a partir de julho (nem consultável).
- Nenhuma tela existente do Fiscal ou Contábil muda de comportamento fora da adição do botão "+ Evento" e sua seção.
