-- supabase/migrations/prod/001_aditiva.sql
--
-- Fase ADITIVA da promoção da expansão multi-setor para produção.
-- Só cria/adiciona — nada aqui remove ou altera o comportamento de nada
-- que o código antigo do app já usa. Seguro rodar com o código antigo
-- ainda no ar.
--
-- Gerado a partir do diff estrutural real entre produção
-- (qilwxzpxkjzbfrwlbydt) e dev (fcpcorqquovvgtoukxry), consolidando as
-- migrations 004-015 do dev (excluindo 002/003, que são reparos
-- específicos do bootstrap do dev, e excluindo a divergência de
-- clientes.mit, que é um bug do dev — ver 016_fix_mit_type_dev.sql).
--
-- Ver docs/superpowers/specs/2026-07-27-rollout-rollback-protocol-design.md
-- e docs/runbook-rollout-producao.md.
--
-- IMPORTANTE: rodar sempre com `psql -v ON_ERROR_STOP=1 --single-transaction`
-- (já exigido pelo runbook). `CREATE POLICY` não tem `IF NOT EXISTS` — sem
-- transação única, uma falha no meio do arquivo deixaria política/tabela
-- parcialmente criada, e um re-run bateria em "already exists". Com
-- --single-transaction, qualquer falha faz rollback completo e um re-run
-- limpo sempre funciona.

-- ============================================================
-- profiles: setores (array) + paginas_acesso
-- ============================================================

alter table profiles add column if not exists setores user_setor[];
update profiles set setores = array[setor] where setores is null;
alter table profiles alter column setores set not null;
alter table profiles alter column setores set default '{fiscal}';
-- profiles.setor (singular) NÃO é removida aqui — código antigo ainda lê
-- essa coluna. Só cai na fase de limpeza (003), depois do deploy novo.

alter table profiles add column if not exists paginas_acesso text[] not null default '{}';

-- Backfill obrigatório: sem isso, os operadores reais de produção (que
-- hoje têm acesso total por não existir controle por página) ficariam
-- bloqueados de Clientes/Relatórios/Histórico/Parcelamentos/Conferência
-- assim que o código novo subir e passar a aplicar essa checagem em
-- proxy.ts. dashboard/agenda/bots/tarefas continuam sempre livres
-- (PAGINAS_SEMPRE_LIBERADAS em proxy.ts), por isso não entram na lista.
-- Mesmo conjunto que o próprio admin já concede por padrão a um usuário
-- novo (ver app/fiscal/parametros/ParametrosClient.tsx).
update profiles
set paginas_acesso = array['fiscal:clientes', 'fiscal:calendario', 'fiscal:relatorios', 'fiscal:historico', 'fiscal:parcelamentos', 'fiscal:conferencia']
where paginas_acesso = '{}';

-- ============================================================
-- handle_new_user(): versão de transição (dual-write)
-- ============================================================
--
-- Diferente da versão final do dev (que só escreve `setores`): enquanto
-- o código antigo ainda estiver no ar, qualquer usuário novo criado
-- nessa janela precisa ter `setor` preenchida também, senão o código
-- antigo veria `setor` nula para esse usuário. Seguro trocar agora
-- porque nenhum código do app chama esta function diretamente — só o
-- trigger do Supabase a aciona, então a troca independe da versão do
-- app rodando.
--
-- Também restaura o fallback legado (aceitar um `setor` string única em
-- vez de `setores` array) para criação manual de usuário pelo painel do
-- Supabase, perdido durante a migração original no dev.
create or replace function handle_new_user()
returns trigger as $$
declare
  v_setores user_setor[];
begin
  v_setores := coalesce(
    (select array_agg(x::user_setor) from jsonb_array_elements_text(new.raw_user_meta_data->'setores') as x),
    case when new.raw_user_meta_data->>'setor' is not null
      then array[(new.raw_user_meta_data->>'setor')::user_setor]
      else null
    end,
    '{fiscal}'
  );

  insert into public.profiles (id, nome, role, setor, setores, cor)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'operador'),
    v_setores[1],
    v_setores,
    coalesce(new.raw_user_meta_data->>'cor', '#6366f1')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- clientes: setores + tarefas_vinculadas_ativas
-- ============================================================

alter table clientes add column if not exists setores user_setor[] not null default '{fiscal}';
alter table clientes add column if not exists tarefas_vinculadas_ativas uuid[] not null default '{}';

-- ============================================================
-- clientes_fiscal (tabela filha 1:1) — criada vazia aqui.
-- ============================================================
--
-- A cópia dos dados das 14 colunas antigas de `clientes` para cá
-- NÃO acontece nesta fase — fica para a fase de correção (002),
-- rodada imediatamente antes do deploy do código novo. Motivo: o
-- código antigo continua ESCREVENDO nas colunas antigas de `clientes`
-- até o deploy; copiar os dados agora e deixar a cópia parada até o
-- deploy criaria uma janela de drift (edições feitas pelo código antigo
-- nessa janela não apareceriam em clientes_fiscal, e o código novo leria
-- dado desatualizado).

create table if not exists clientes_fiscal (
  cliente_id              uuid primary key references clientes(id) on delete cascade,
  cod                     text,
  regime                  text,
  atividade               text,
  responsavel             text,
  grupo                   text default 'normal',
  obs                     text,
  prioridade              integer default 0,
  envia_iss               boolean default false,
  confere_siga            boolean default false,
  login_iss               text,
  senha_iss               text,
  email_envio_iss         text,
  declaracao_anual        boolean default false,
  tarefas_personalizadas  text[] not null default '{}'
);

create index if not exists idx_clientes_fiscal_responsavel on clientes_fiscal (lower(responsavel));
create index if not exists idx_clientes_fiscal_grupo on clientes_fiscal (grupo);

alter table clientes_fiscal enable row level security;

create policy "Setor fiscal le dados fiscais" on clientes_fiscal for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and 'fiscal' = any(p.setores)
  )
);

create policy "Admin gerencia dados fiscais" on clientes_fiscal for all using (is_admin());

create policy "Responsavel atualiza seus dados fiscais" on clientes_fiscal for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and lower(p.nome) = lower(clientes_fiscal.responsavel))
);

-- Nota: a policy "Responsavel atualiza seu cliente" em `clientes` (que
-- ainda depende de `clientes.responsavel`, coluna antiga) continua
-- intocada aqui — só é trocada na fase de limpeza (003), junto com o
-- drop das colunas antigas.

-- ============================================================
-- clientes_contabil e clientes_pessoal (setores novos, sem clientes
-- reais atribuídos ainda em produção — tabelas nascem vazias)
-- ============================================================

create table if not exists clientes_contabil (
  cliente_id              uuid primary key references clientes(id) on delete cascade,
  atividade               text,
  responsavel             text,
  prioridade              integer default 0,
  obs                     text,
  tarefas_personalizadas  text[] not null default '{}'
);

create index if not exists idx_clientes_contabil_responsavel on clientes_contabil (lower(responsavel));

alter table clientes_contabil enable row level security;

create policy "Setor contabil le dados contabeis" on clientes_contabil for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and 'contabil' = any(p.setores)
  )
);

create policy "Admin gerencia dados contabeis" on clientes_contabil for all using (is_admin());

create policy "Responsavel atualiza seus dados contabeis" on clientes_contabil for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and lower(p.nome) = lower(clientes_contabil.responsavel))
);

create table if not exists clientes_pessoal (
  cliente_id              uuid primary key references clientes(id) on delete cascade,
  atividade               text,
  responsavel             text,
  prioridade              integer default 0,
  obs                     text,
  tarefas_personalizadas  text[] not null default '{}'
);

create index if not exists idx_clientes_pessoal_responsavel on clientes_pessoal (lower(responsavel));

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

-- ============================================================
-- tarefa_tipos: catálogo administrável de tipos de tarefa por setor
-- ============================================================

create table if not exists tarefa_tipos (
  id              uuid primary key default gen_random_uuid(),
  setor           user_setor not null,
  nome            text not null,
  etapas          text[],
  ativo           boolean not null default true,
  meses_visiveis  smallint[],
  tipo_resposta   text not null default 'data' check (tipo_resposta in ('data', 'texto')),
  unique (setor, nome)
);

alter table tarefa_tipos enable row level security;

create policy "Autenticados leem tarefa_tipos" on tarefa_tipos for select using (auth.uid() is not null);
create policy "Admin gerencia tarefa_tipos" on tarefa_tipos for all using (is_admin());

-- Catálogo Contábil (7 tarefas padrão)
insert into tarefa_tipos (setor, nome, etapas) values
  ('contabil', 'Solicitação Distribuição de Lucros', null),
  ('contabil', 'Envio Distribuição de Lucros', null),
  ('contabil', 'Movimentação', array['Solicitada','Conferida','Lançada','Conciliada']),
  ('contabil', 'Importação Entradas', null),
  ('contabil', 'Importação Saídas', null),
  ('contabil', 'Importação Tributos', null),
  ('contabil', 'Importação Folha de Pagamento', null)
on conflict (setor, nome) do nothing;

-- Catálogo Pessoal (5 tarefas padrão)
insert into tarefa_tipos (setor, nome, etapas, meses_visiveis) values
  ('pessoal', 'Folha de Pagamento', array['Gerar','Relatório','Guias','Envio'], null),
  ('pessoal', '13º Salário', array['Gerar','Relatório','Guias','Envio'], array[11,12]),
  ('pessoal', 'Consulta Ecac - Situação Fiscal', null, null),
  ('pessoal', 'Consulta FGTS - DET', null, null),
  ('pessoal', 'Consulta Sindicato - Convenções', null, null)
on conflict (setor, nome) do nothing;

-- Fiscal: ENTRADA/SAIDAS deixam de ser hard-coded (ver 012 no dev)
insert into tarefa_tipos (setor, nome, etapas, tipo_resposta) values
  ('fiscal', 'ENTRADA', array['Recebido', 'Importado', 'Conferido'], 'data'),
  ('fiscal', 'SAIDAS',  array['Recebido', 'Importado', 'Conferido'], 'data')
on conflict (setor, nome) do nothing;

-- Fiscal: os 15 nomes que ainda eram hard-coded em TarefaChecklist.tsx (ver 014 no dev)
insert into tarefa_tipos (setor, nome, etapas, tipo_resposta) values
  ('fiscal', 'SIGET',              null, 'data'),
  ('fiscal', 'SPEED GOV',          null, 'data'),
  ('fiscal', 'ISS',                null, 'data'),
  ('fiscal', 'ENV. DAS',           null, 'data'),
  ('fiscal', 'PIS/COFINS',         null, 'data'),
  ('fiscal', 'ICMS/ICMS ST',       null, 'data'),
  ('fiscal', 'IRPJ/CSLL',          null, 'data'),
  ('fiscal', 'REINF/INSS',         null, 'data'),
  ('fiscal', 'EFD FISCAL',         null, 'data'),
  ('fiscal', 'EFD PIS/COFINS',     null, 'data'),
  ('fiscal', 'FECHAMENTO SIMPLES', null, 'data'),
  ('fiscal', 'GUIAS ENVIADAS',     null, 'data'),
  ('fiscal', 'ICMS ST',            null, 'data'),
  ('fiscal', 'REINF',              null, 'data'),
  ('fiscal', 'DAS',                null, 'data')
on conflict (setor, nome) do nothing;

-- ============================================================
-- tarefas: setor (com DEFAULT mantido — ver nota abaixo) + resposta_texto
-- ============================================================
--
-- Diferente da migration original do dev (006), que dropa o DEFAULT
-- logo depois de adicionar a coluna: aqui o DEFAULT 'fiscal' é mantido
-- de propósito. Código antigo faz INSERT em `tarefas` sem especificar
-- essa coluna (não sabe que ela existe) — sem DEFAULT, esses INSERTs
-- quebrariam com "null value in column setor violates not-null
-- constraint". O DEFAULT só é removido na fase de limpeza (003), depois
-- que o código novo (que sempre especifica setor) já estiver no ar.

alter table tarefas add column if not exists setor user_setor not null default 'fiscal';
alter table tarefas add column if not exists resposta_texto text;


-- ============================================================
-- tarefa_etapas: sub-passos nomeados genéricos (usado por "Movimentação")
-- ============================================================

create table if not exists tarefa_etapas (
  id           uuid primary key default gen_random_uuid(),
  tarefa_id    uuid references tarefas(id) on delete cascade not null,
  nome         text not null,
  concluida    boolean not null default false,
  concluida_em date,
  ordem        integer not null default 0
);

create index if not exists idx_tarefa_etapas_tarefa_id on tarefa_etapas (tarefa_id);

alter table tarefa_etapas enable row level security;

create policy "Setor le etapas de suas tarefas" on tarefa_etapas for select using (
  is_admin() or exists (
    select 1 from tarefas t
    join profiles p on p.id = auth.uid()
    where t.id = tarefa_etapas.tarefa_id and t.setor = any(p.setores)
  )
);

create policy "Setor gerencia etapas de suas tarefas" on tarefa_etapas for all using (
  is_admin() or exists (
    select 1 from tarefas t
    join profiles p on p.id = auth.uid()
    where t.id = tarefa_etapas.tarefa_id and t.setor = any(p.setores)
  )
);

-- ============================================================
-- calendario_eventos: calendário personalizável por setor
-- ============================================================

create table if not exists calendario_eventos (
  id           uuid primary key default gen_random_uuid(),
  setor        user_setor not null,
  titulo       text not null,
  descricao    text,
  tipo_data    text not null check (tipo_data in ('recorrente', 'unica')),
  dia_mes      int check (dia_mes between 1 and 31),
  data         date,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  constraint tipo_data_consistente check (
    (tipo_data = 'recorrente' and dia_mes is not null and data is null) or
    (tipo_data = 'unica' and data is not null and dia_mes is null)
  ),
  -- Sem isso, `ON CONFLICT DO NOTHING` no seed abaixo não tem nenhum
  -- índice único pra usar como alvo — re-rodar a migration duplicaria
  -- as 9 linhas silenciosamente em vez de ser um no-op seguro.
  constraint calendario_eventos_setor_titulo_key unique (setor, titulo)
);

create index if not exists idx_calendario_eventos_setor on calendario_eventos (setor);

alter table calendario_eventos enable row level security;

create policy "Setor le seus eventos" on calendario_eventos for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and calendario_eventos.setor = any(p.setores)
  )
);

create policy "Admin gerencia eventos" on calendario_eventos for all using (is_admin());

-- Seed: as 9 obrigações fiscais hoje hard-coded em
-- components/fiscal/CalendarioFiscal.tsx e app/fiscal/calendario/page.tsx.
insert into calendario_eventos (setor, titulo, descricao, tipo_data, dia_mes) values
  ('fiscal', 'SIGET',              'Prazo interno do escritório para rotinas SIGET.',                 'recorrente', 5),
  ('fiscal', 'SPEED GOV',          'Prazo interno do escritório para rotinas Speed Gov.',              'recorrente', 10),
  ('fiscal', 'EFD-Reinf',          'Retenções na fonte, serviços tomados e prestados.',                'recorrente', 15),
  ('fiscal', 'DAS/PGDAS-D',        'Documento de Arrecadação do Simples Nacional.',                    'recorrente', 15),
  ('fiscal', 'ISS',                'Imposto Sobre Serviços.',                                          'recorrente', 15),
  ('fiscal', 'ICMS/ICMS-ST',       'ICMS e Substituição Tributária.',                                  'recorrente', 15),
  ('fiscal', 'PIS/COFINS',         'Apuração de PIS e COFINS.',                                        'recorrente', 20),
  ('fiscal', 'DCTFWeb',            'Declaração de débitos e créditos tributários federais previdenciários.', 'recorrente', 20),
  ('fiscal', 'EFD-Contribuições',  'PIS, COFINS e Contribuição Previdenciária sobre Receita.',         'recorrente', 31)
on conflict (setor, titulo) do nothing;

-- ============================================================
-- tarefa_vinculos: catálogo de vínculos de tarefas entre setores
-- ============================================================

create table if not exists tarefa_vinculos (
  id             uuid primary key default gen_random_uuid(),
  setor_origem   user_setor not null,
  tipo_origem    text not null,
  setor_destino  user_setor not null,
  tipo_destino   text not null,
  created_at     timestamptz not null default now()
);

alter table tarefa_vinculos enable row level security;

create policy "Autenticados leem tarefa_vinculos" on tarefa_vinculos for select using (auth.uid() is not null);
create policy "Admin gerencia tarefa_vinculos" on tarefa_vinculos for all using (is_admin());

-- ============================================================
-- tarefas_avulsas: mecanismo genérico "+ Evento"
-- ============================================================

create table if not exists tarefas_avulsas (
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

create index if not exists idx_tarefas_avulsas_cliente on tarefas_avulsas (cliente_id, setor);

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

-- ============================================================
-- tarefa_arquivos e evento_arquivos: anexos (base64 na linha, sem Storage)
-- ============================================================

create table if not exists tarefa_arquivos (
  id             uuid primary key default gen_random_uuid(),
  tarefa_id      uuid references tarefas(id) on delete cascade not null,
  name           text not null,
  size           integer not null,
  content_base64 text not null,
  uploaded_at    timestamptz not null default now()
);

create index if not exists idx_tarefa_arquivos_tarefa_id on tarefa_arquivos (tarefa_id);

alter table tarefa_arquivos enable row level security;

create policy "Setor le arquivos de suas tarefas" on tarefa_arquivos for select using (
  is_admin() or exists (
    select 1 from tarefas t
    join profiles p on p.id = auth.uid()
    where t.id = tarefa_arquivos.tarefa_id and t.setor = any(p.setores)
  )
);

create policy "Setor gerencia arquivos de suas tarefas" on tarefa_arquivos for all using (
  is_admin() or exists (
    select 1 from tarefas t
    join profiles p on p.id = auth.uid()
    where t.id = tarefa_arquivos.tarefa_id and t.setor = any(p.setores)
  )
);

create table if not exists evento_arquivos (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid references tarefas_avulsas(id) on delete cascade not null,
  name           text not null,
  size           integer not null,
  content_base64 text not null,
  uploaded_at    timestamptz not null default now()
);

create index if not exists idx_evento_arquivos_evento_id on evento_arquivos (evento_id);

alter table evento_arquivos enable row level security;

create policy "Setor le arquivos de seus eventos" on evento_arquivos for select using (
  is_admin() or exists (
    select 1 from tarefas_avulsas ev
    join profiles p on p.id = auth.uid()
    where ev.id = evento_arquivos.evento_id and ev.setor = any(p.setores)
  )
);

create policy "Setor gerencia arquivos de seus eventos" on evento_arquivos for all using (
  is_admin() or exists (
    select 1 from tarefas_avulsas ev
    join profiles p on p.id = auth.uid()
    where ev.id = evento_arquivos.evento_id and ev.setor = any(p.setores)
  )
);
