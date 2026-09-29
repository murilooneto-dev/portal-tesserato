-- supabase/tests/055_lixeira_restauracao.sql
-- Rodar com psql (-v ON_ERROR_STOP=1) SO NO DEV, DEPOIS da 055 completa. Transacao desfeita.
-- ATENCAO: como tudo roda em UMA transacao, todas as exclusoes daqui teriam o MESMO
-- grupo (txid_current()). O bloco R1 usa o grupo real (prova o agrupamento por
-- transacao); os blocos R3-R6 ISOLAM seu cenario anotando o maior id da lixeira
-- antes (watermark) e renumerando o grupo das linhas novas para um valor proprio.
begin;

select id as u_admin  from auth.users where email = 'admin.dev@tesserato.local' \gset
select id as u_fiscal from auth.users where email = 'fiscal@tesserato.local' \gset

-- ---------- R1: ida e volta identica (cliente + ficha + tarefas + etapa) ----------
insert into public.clientes (nome, setores) values ('ZZLIX restaura', '{contabil}') returning id \gset c_
insert into public.clientes_contabil (cliente_id) values (:'c_id');
insert into public.tarefas (cliente_id, setor, tipo, mes, ano) values
  (:'c_id', 'contabil', 'T1', 9, 2026), (:'c_id', 'contabil', 'T2', 9, 2026);
insert into public.tarefa_etapas (tarefa_id, nome)
  select id, 'etapa 1' from public.tarefas where cliente_id = :'c_id' order by tipo limit 1;

create temp table _orig as
  select 'clientes'::text as tabela, to_jsonb(c) as j from public.clientes c where c.id = :'c_id'
  union all select 'clientes_contabil', to_jsonb(x) from public.clientes_contabil x where x.cliente_id = :'c_id'
  union all select 'tarefas', to_jsonb(t) from public.tarefas t where t.cliente_id = :'c_id'
  union all select 'tarefa_etapas', to_jsonb(e) from public.tarefa_etapas e
            where e.tarefa_id in (select id from public.tarefas where cliente_id = :'c_id');

delete from public.clientes where id = :'c_id';
select grupo as g1 from public.lixeira where tabela = 'clientes' and registro_id = :'c_id' \gset
select (count(*) = 0) as ok from public.clientes where id = :'c_id' \gset
\if :ok
\echo 'OK   R1a cliente sumiu de clientes apos a exclusao'
\else
\echo 'FALHOU R1a'
select 1/0;
\endif

select public.lixeira_restaurar(:g1, :'u_admin') as resultado \gset
create temp table _dep as
  select 'clientes'::text as tabela, to_jsonb(c) as j from public.clientes c where c.id = :'c_id'
  union all select 'clientes_contabil', to_jsonb(x) from public.clientes_contabil x where x.cliente_id = :'c_id'
  union all select 'tarefas', to_jsonb(t) from public.tarefas t where t.cliente_id = :'c_id'
  union all select 'tarefa_etapas', to_jsonb(e) from public.tarefa_etapas e
            where e.tarefa_id in (select id from public.tarefas where cliente_id = :'c_id');
select ((select count(*) from ((select * from _orig except select * from _dep)
                                union all (select * from _dep except select * from _orig)) d) = 0
        and (select count(*) from _dep) = 5) as ok \gset
\if :ok
\echo 'OK   R1b restauracao devolve as 5 linhas IDENTICAS ao original (jsonb igual, linha a linha)'
\else
\echo 'FALHOU R1b banco diferente do original apos restaurar'
select 1/0;
\endif

select (count(*) = 5 and bool_and(restaurado_em is not null) and bool_and(restaurado_por = :'u_admin'::uuid)) as ok
  from public.lixeira where grupo = :g1 \gset
\if :ok
\echo 'OK   R1c linhas da lixeira marcadas como restauradas por quem restaurou'
\else
\echo 'FALHOU R1c'
select 1/0;
\endif

-- ---------- R2: restaurar duas vezes e recusado ----------
do $$
declare g bigint := (select grupo from public.lixeira where tabela = 'clientes' and dados->>'nome' = 'ZZLIX restaura' limit 1);
        u uuid   := (select id from auth.users where email = 'admin.dev@tesserato.local');
begin
  perform public.lixeira_restaurar(g, u);
  raise exception 'DEVERIA TER RECUSADO: ja restaurada';
exception when raise_exception then
  if sqlerrm not like '%já foi restaurada%' then raise; end if;
end $$;
\echo 'OK   R2 segunda restauracao recusada com mensagem em portugues'

-- ---------- R3: conflito de id => recusa e o registro existente fica intacto ----------
select coalesce(max(id), 0) as w3 from public.lixeira \gset
insert into public.clientes (nome, setores) values ('ZZLIX conflito', '{fiscal}') returning id \gset k_
delete from public.clientes where id = :'k_id';
update public.lixeira set grupo = 900000003 where id > :w3;
insert into public.clientes (id, nome, setores) values (:'k_id', 'ocupou o id', '{}');
do $$
declare u uuid := (select id from auth.users where email = 'admin.dev@tesserato.local');
begin
  perform public.lixeira_restaurar(900000003, u);
  raise exception 'DEVERIA TER RECUSADO: id ja existe';
exception when raise_exception then
  if sqlerrm not like '%já existe um registro igual%' then raise; end if;
end $$;
select (nome = 'ocupou o id') as ok from public.clientes where id = :'k_id' \gset
\if :ok
\echo 'OK   R3 conflito de id recusado e o registro existente ficou intacto'
\else
\echo 'FALHOU R3'
select 1/0;
\endif
delete from public.clientes where id = :'k_id';

-- ---------- R4: pai ausente => recusa (tarefas restauradas sem o cliente) ----------
select coalesce(max(id), 0) as w4 from public.lixeira \gset
insert into public.clientes (nome, setores) values ('ZZLIX pai', '{contabil}') returning id \gset p_
insert into public.tarefas (cliente_id, setor, tipo, mes, ano) values (:'p_id', 'contabil', 'TP', 9, 2026);
delete from public.tarefas where cliente_id = :'p_id';
delete from public.clientes where id = :'p_id';
update public.lixeira set grupo = 900000004 where id > :w4 and tabela = 'tarefas';
update public.lixeira set grupo = 900000104 where id > :w4 and tabela = 'clientes';
do $$
declare u uuid := (select id from auth.users where email = 'admin.dev@tesserato.local');
begin
  perform public.lixeira_restaurar(900000004, u);
  raise exception 'DEVERIA TER RECUSADO: cliente pai ausente';
exception when raise_exception then
  if sqlerrm not like '%falta um registro do qual%' then raise; end if;
end $$;
select (count(*) = 0) as ok from public.tarefas where tipo = 'TP' and cliente_id = :'p_id' \gset
\if :ok
\echo 'OK   R4 pai ausente recusado em portugues e NADA foi restaurado pela metade'
\else
\echo 'FALHOU R4 restaurou tarefas sem o cliente'
select 1/0;
\endif

-- ---------- R5: ficha de setor restaurada REINCLUI o setor em clientes.setores ----------
select coalesce(max(id), 0) as w5 from public.lixeira \gset
insert into public.clientes (nome, setores) values ('ZZLIX setor', '{fiscal,contabil}') returning id \gset m_
insert into public.clientes_contabil (cliente_id) values (:'m_id');
delete from public.clientes_contabil where cliente_id = :'m_id';
update public.clientes set setores = '{fiscal}' where id = :'m_id';
update public.lixeira set grupo = 900000005 where id > :w5;
select public.lixeira_restaurar(900000005, :'u_admin') as resultado \gset
select (setores = '{fiscal,contabil}'::public.user_setor[]) as ok from public.clientes where id = :'m_id' \gset
\if :ok
\echo 'OK   R5 restaurar a ficha do Contabil reincluiu o setor em clientes.setores'
\else
\echo 'FALHOU R5 setor nao foi reincluido'
select 1/0;
\endif

-- ---------- R6: ordem de dependencia: parcelamentos ANTES de tarefas ----------
select coalesce(max(id), 0) as w6 from public.lixeira \gset
insert into public.clientes (nome, setores) values ('ZZLIX parc', '{fiscal}') returning id \gset r_
insert into public.parcelamentos (empresa, secao) values ('ZZLIX parcelamento', 'ZZ') returning id \gset pp_
insert into public.tarefas (cliente_id, setor, tipo, mes, ano, parcelamento_id) values (:'r_id', 'fiscal', 'TPARC', 9, 2026, :'pp_id');
delete from public.clientes where id = :'r_id';
delete from public.parcelamentos where id = :'pp_id';
update public.lixeira set grupo = 900000006 where id > :w6;
select public.lixeira_restaurar(900000006, :'u_admin') as resultado \gset
select ((select count(*) from public.tarefas where cliente_id = :'r_id' and parcelamento_id = :'pp_id') = 1
        and (select count(*) from public.parcelamentos where id = :'pp_id') = 1) as ok \gset
\if :ok
\echo 'OK   R6 parcelamento voltou antes da tarefa que depende dele (FK respeitada)'
\else
\echo 'FALHOU R6 ordem de restauracao'
select 1/0;
\endif

-- ---------- R7: quem nao e admin nao restaura ----------
do $$
declare g bigint := (select grupo from public.lixeira order by id desc limit 1);
        u uuid   := (select id from auth.users where email = 'fiscal@tesserato.local');
begin
  perform public.lixeira_restaurar(g, u);
  raise exception 'DEVERIA TER RECUSADO: nao e admin';
exception when raise_exception then
  if sqlerrm not like '%Somente administradores%' then raise; end if;
end $$;
\echo 'OK   R7 usuario nao admin recusado'

-- ---------- R8: permissoes de EXECUTE ----------
select (not has_function_privilege('anon', 'public.lixeira_restaurar(bigint,uuid)', 'execute')
        and not has_function_privilege('authenticated', 'public.lixeira_restaurar(bigint,uuid)', 'execute')
        and has_function_privilege('service_role', 'public.lixeira_restaurar(bigint,uuid)', 'execute')
        and not has_function_privilege('anon', 'public.lixeira_listar(integer)', 'execute')
        and not has_function_privilege('authenticated', 'public.lixeira_listar(integer)', 'execute')
        and has_function_privilege('service_role', 'public.lixeira_listar(integer)', 'execute')
        and not has_function_privilege('anon', 'public.lixeira_limpar()', 'execute')
        and not has_function_privilege('authenticated', 'public.lixeira_limpar()', 'execute')
        and has_function_privilege('service_role', 'public.lixeira_limpar()', 'execute')) as ok \gset
\if :ok
\echo 'OK   R8 EXECUTE: anon/authenticated sem acesso; so service_role'
\else
\echo 'FALHOU R8 permissoes de execute'
select 1/0;
\endif

-- ---------- R9: listagem NAO expoe o conteudo (dados / content_base64) ----------
select (pg_get_function_result('public.lixeira_listar(integer)'::regprocedure) not like '%dados%'
        and pg_get_function_result('public.lixeira_listar(integer)'::regprocedure) like '%campos jsonb%') as ok \gset
\if :ok
\echo 'OK   R9 lixeira_listar devolve so "campos" (sem dados nem content_base64)'
\else
\echo 'FALHOU R9 listagem expoe conteudo'
select 1/0;
\endif
select (count(*) > 0
        and bool_and(campos::text not like '%content_base64%')
        and bool_or(campos ? 'nome')) as ok from public.lixeira_listar(500) \gset
\if :ok
\echo 'OK   R9b listagem devolve linhas com titulo (campos.nome) e sem conteudo'
\else
\echo 'FALHOU R9b'
select 1/0;
\endif

-- ---------- R10: limpeza remove so o que expirou ----------
insert into public.lixeira (grupo, tabela, registro_id, dados, origem_autor, expira_em)
  values (999000001, 'clientes', 'zz-velho', '{"nome":"velho"}', 'desconhecido', now() - interval '1 day'),
         (999000002, 'clientes', 'zz-novo',  '{"nome":"novo"}',  'desconhecido', now() + interval '10 days');
select public.lixeira_limpar() as apagadas \gset
select ((select count(*) from public.lixeira where registro_id = 'zz-velho') = 0
        and (select count(*) from public.lixeira where registro_id = 'zz-novo') = 1
        and :apagadas >= 1) as ok \gset
\if :ok
\echo 'OK   R10 limpeza apagou so a linha expirada'
\else
\echo 'FALHOU R10'
select 1/0;
\endif

rollback;
\echo 'TUDO OK: 055 restauracao'
