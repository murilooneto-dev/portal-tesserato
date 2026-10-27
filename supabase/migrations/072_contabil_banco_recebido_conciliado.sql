-- supabase/migrations/072_contabil_banco_recebido_conciliado.sql

-- Padroniza as tarefas de banco do Contábil: toda tarefa com "Banco" no nome
-- passa a ser checklist com as etapas Recebido e Conciliado. Antes havia 8
-- formatos misturados (data ou checklist, com Recebimento/Conferência/
-- Lançamento/Conciliação, Recebido/Escriturado etc.), herdados do catálogo
-- compartilhado e copiados por cliente na 071.
--
-- Histórico convertido (decisão do usuário, 2026-10-27):
--   - tarefa já concluída: Recebido e Conciliado marcados;
--   - em andamento: Recebimento/Recebido -> Recebido;
--     Conciliação/Conciliado/Escriturado -> Conciliado.
-- As etapas antigas ficam na tabela (só deixam de aparecer). Nenhuma etapa já
-- marcada é desmarcada. Só dados: o código não muda; quem criar tarefa nova
-- escolhe o formato no formulário, como hoje.
-- Idempotente: reexecutar só pega o que ainda não está no padrão.
begin;
set local lock_timeout = '5s';

create temp table _tipos on commit drop as
select id, cliente_id, nome
from public.tarefa_tipos
where setor = 'contabil' and nome ilike '%banco%'
  and not (tipo_resposta = 'checklist' and etapas = array['Recebido', 'Conciliado']::text[]);

-- Tipo do setor (cliente_id nulo) com "Banco" não existia quando isto foi
-- escrito; a ligação tarefa -> tipo abaixo só cobre o tipo do cliente.
do $$
begin
  if exists (select 1 from _tipos where cliente_id is null) then
    raise exception '072: há tipo do setor com "Banco" no Contábil; revise a migration';
  end if;
end $$;

create temp table _tarefas on commit drop as
select ta.id, ta.concluida,
       ta.concluida or exists (select 1 from public.tarefa_etapas e where e.tarefa_id = ta.id and e.concluida
                                 and e.nome in ('Recebimento', 'Recebido')) as rec,
       coalesce((select min(e.concluida_em) from public.tarefa_etapas e where e.tarefa_id = ta.id and e.concluida
                   and e.nome in ('Recebimento', 'Recebido')),
                ta.concluida_em::date, current_date) as rec_em,
       ta.concluida or exists (select 1 from public.tarefa_etapas e where e.tarefa_id = ta.id and e.concluida
                                 and e.nome in ('Conciliação', 'Conciliado', 'Escriturado')) as conc,
       coalesce((select min(e.concluida_em) from public.tarefa_etapas e where e.tarefa_id = ta.id and e.concluida
                   and e.nome in ('Conciliação', 'Conciliado', 'Escriturado')),
                ta.concluida_em::date, current_date) as conc_em
from public.tarefas ta
join _tipos t on ta.setor = 'contabil' and ta.cliente_id = t.cliente_id and ta.tipo = t.nome;

-- Etapas novas: marca a que já existia desmarcada, cria a que faltava.
update public.tarefa_etapas e set concluida = true, concluida_em = x.rec_em
from _tarefas x where e.tarefa_id = x.id and e.nome = 'Recebido' and x.rec and not e.concluida;
insert into public.tarefa_etapas (tarefa_id, nome, concluida, concluida_em)
select x.id, 'Recebido', true, x.rec_em from _tarefas x
where x.rec and not exists (select 1 from public.tarefa_etapas e where e.tarefa_id = x.id and e.nome = 'Recebido');

update public.tarefa_etapas e set concluida = true, concluida_em = x.conc_em
from _tarefas x where e.tarefa_id = x.id and e.nome = 'Conciliado' and x.conc and not e.concluida;
insert into public.tarefa_etapas (tarefa_id, nome, concluida, concluida_em)
select x.id, 'Conciliado', true, x.conc_em from _tarefas x
where x.conc and not exists (select 1 from public.tarefa_etapas e where e.tarefa_id = x.id and e.nome = 'Conciliado');

-- Mesma regra do app (marcarEtapa): todas as etapas marcadas = concluída.
update public.tarefas ta set concluida = true,
  concluida_em = coalesce(ta.concluida_em, greatest(x.rec_em, x.conc_em)::timestamptz)
from _tarefas x where ta.id = x.id and not x.concluida and x.rec and x.conc;

update public.tarefa_tipos t set tipo_resposta = 'checklist', etapas = array['Recebido', 'Conciliado']::text[]
from _tipos x where t.id = x.id;

do $$
declare n_tipos int; n_tarefas int; n_novas_concluidas int; n_perdidas int; n_fora int;
begin
  select count(*) into n_tipos from _tipos;
  select count(*) into n_tarefas from _tarefas;
  select count(*) into n_novas_concluidas from _tarefas where not concluida and rec and conc;
  -- Toda tarefa concluída antes tem que mostrar as duas etapas marcadas.
  select count(*) into n_perdidas from _tarefas x
  where x.concluida and (
    not exists (select 1 from public.tarefa_etapas e where e.tarefa_id = x.id and e.nome = 'Recebido' and e.concluida)
    or not exists (select 1 from public.tarefa_etapas e where e.tarefa_id = x.id and e.nome = 'Conciliado' and e.concluida));
  select count(*) into n_fora from public.tarefa_tipos
  where setor = 'contabil' and nome ilike '%banco%'
    and not (tipo_resposta = 'checklist' and etapas = array['Recebido', 'Conciliado']::text[]);

  if n_perdidas > 0 then raise exception '072: % tarefa(s) concluída(s) ficariam sem as etapas marcadas', n_perdidas; end if;
  if n_fora > 0 then raise exception '072: % tipo(s) com "Banco" fora do padrão', n_fora; end if;
  raise notice '072: % tipo(s) padronizado(s), % tarefa(s) convertida(s), % passaram a concluída(s)', n_tipos, n_tarefas, n_novas_concluidas;
end $$;

commit;
