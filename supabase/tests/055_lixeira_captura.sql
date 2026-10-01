-- supabase/tests/055_lixeira_captura.sql
-- Rodar com psql (-v ON_ERROR_STOP=1) SO NO DEV. Tudo dentro de UMA transacao desfeita.
-- Cada bloco imprime "OK ..." ou "FALHOU ..." (e provoca erro para o psql sair != 0).
begin;

select id as u_admin  from auth.users where email = 'admin.dev@tesserato.local' \gset
select id as u_fiscal from auth.users where email = 'fiscal@tesserato.local' \gset

-- massa: cliente so do Contabil com filhos em varios niveis
insert into public.clientes (nome, setores) values ('ZZLIX captura', '{contabil}') returning id \gset c_
insert into public.clientes_contabil (cliente_id) values (:'c_id');
insert into public.tarefas (cliente_id, setor, tipo, mes, ano) values
  (:'c_id', 'contabil', 'T1', 9, 2026), (:'c_id', 'contabil', 'T2', 9, 2026);
insert into public.tarefa_etapas (tarefa_id, nome)
  select id, 'etapa 1' from public.tarefas where cliente_id = :'c_id' order by tipo limit 1;

-- 1) exclusao pela SESSAO do admin: uma exclusao, 5 linhas, autor = admin, origem = sessao
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u_admin'::text, 'role', 'authenticated')::text, true) as zz \gset
delete from public.clientes where id = :'c_id';
reset role;
select grupo as g1 from public.lixeira where tabela = 'clientes' and registro_id = :'c_id' \gset
select (count(*) = 5
        and count(distinct tabela) = 4
        and bool_and(excluido_por = :'u_admin'::uuid)
        and bool_and(origem_autor = 'sessao')) as ok
  from public.lixeira where grupo = :g1 \gset
\if :ok
\echo 'OK   1 exclusao pela sessao: cliente + ficha + 2 tarefas + 1 etapa em UM grupo, autor = admin, origem = sessao'
\else
\echo 'FALHOU 1 captura/cascata/autoria pela sessao'
select 1/0;
\endif

-- 2) ficha por setor tem PK cliente_id (sem coluna id): registro_id cai no fallback
select (registro_id = :'c_id') as ok from public.lixeira where grupo = :g1 and tabela = 'clientes_contabil' \gset
\if :ok
\echo 'OK   2 registro_id da ficha do setor usa cliente_id'
\else
\echo 'FALHOU 2 registro_id da ficha'
select 1/0;
\endif

-- 3) exclusao pela CHAVE DE SERVICO com header x-app-usuario: autor = o do header, origem = servico
insert into public.clientes (nome, setores) values ('ZZLIX servico', '{fiscal}') returning id \gset s_
select set_config('request.jwt.claims', '{"role":"service_role"}', true) as zz \gset
select set_config('request.headers', json_build_object('x-app-usuario', :'u_admin'::text)::text, true) as zz \gset
delete from public.clientes where id = :'s_id';
select (excluido_por = :'u_admin'::uuid and origem_autor = 'servico') as ok
  from public.lixeira where tabela = 'clientes' and registro_id = :'s_id' \gset
\if :ok
\echo 'OK   3 chave de servico + header: autor = usuario do header, origem = servico'
\else
\echo 'FALHOU 3 autoria pela chave de servico'
select 1/0;
\endif

-- 4) AUTORIA FORJADA: sessao de outro usuario mandando o header do admin => vale a sessao, nao o header
insert into public.clientes (nome, setores) values ('ZZLIX forja', '{fiscal}') returning id \gset f_
select set_config('request.jwt.claims', json_build_object('sub', :'u_fiscal'::text, 'role', 'authenticated')::text, true) as zz \gset
select set_config('request.headers', json_build_object('x-app-usuario', :'u_admin'::text)::text, true) as zz \gset
delete from public.clientes where id = :'f_id';
select (excluido_por = :'u_fiscal'::uuid and origem_autor = 'sessao') as ok
  from public.lixeira where tabela = 'clientes' and registro_id = :'f_id' \gset
\if :ok
\echo 'OK   4 header forjado ignorado quando ha sessao (vale auth.uid())'
\else
\echo 'FALHOU 4 header forjado foi honrado'
select 1/0;
\endif

-- 5) claims ANON com header: o header NAO e honrado (so vale com service_role); sem claims idem
insert into public.clientes (nome, setores) values ('ZZLIX anon', '{fiscal}') returning id \gset a_
select set_config('request.jwt.claims', '{"role":"anon"}', true) as zz \gset
select set_config('request.headers', json_build_object('x-app-usuario', :'u_admin'::text)::text, true) as zz \gset
delete from public.clientes where id = :'a_id';
select (excluido_por is null and origem_autor = 'desconhecido') as ok
  from public.lixeira where tabela = 'clientes' and registro_id = :'a_id' \gset
\if :ok
\echo 'OK   5 claims anon + header: autor desconhecido (header nao honrado)'
\else
\echo 'FALHOU 5 header honrado sem service_role'
select 1/0;
\endif

insert into public.clientes (nome, setores) values ('ZZLIX semclaims', '{fiscal}') returning id \gset n_
select set_config('request.jwt.claims', '', true) as zz \gset
select set_config('request.headers', '', true) as zz \gset
delete from public.clientes where id = :'n_id';
select (excluido_por is null and origem_autor = 'desconhecido') as ok
  from public.lixeira where tabela = 'clientes' and registro_id = :'n_id' \gset
\if :ok
\echo 'OK   5b sem claims: autor desconhecido'
\else
\echo 'FALHOU 5b sem claims'
select 1/0;
\endif

-- 6) FALHA FECHADA: se a lixeira rejeitar a copia, a exclusao falha e a linha continua existindo
insert into public.clientes (nome, setores) values ('ZZLIX falha', '{fiscal}') returning id \gset x_
alter table public.lixeira add constraint zz_falha check (false) not valid;
do $$
begin
  delete from public.clientes where nome = 'ZZLIX falha';
  raise exception 'DEVERIA TER FALHADO: excluiu sem guardar copia';
exception when check_violation then
  null;
end $$;
alter table public.lixeira drop constraint zz_falha;
select (count(*) = 1) as ok from public.clientes where id = :'x_id' \gset
\if :ok
\echo 'OK   6 falha fechada: copia rejeitada => exclusao cancelada, cliente intacto'
\else
\echo 'FALHOU 6 cliente foi apagado sem copia'
select 1/0;
\endif

-- 7) ACESSO: usuario comum e anonimo nao veem nada; admin ve
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u_fiscal'::text, 'role', 'authenticated')::text, true) as zz \gset
select count(*) as n_comum from public.lixeira \gset
select set_config('request.jwt.claims', json_build_object('sub', :'u_admin'::text, 'role', 'authenticated')::text, true) as zz \gset
select count(*) as n_admin from public.lixeira \gset
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) as zz \gset
select count(*) as n_anon from public.lixeira \gset
reset role;
select (:n_comum = 0 and :n_anon = 0 and :n_admin > 0) as ok \gset
\if :ok
\echo 'OK   7 RLS: usuario comum e anonimo veem 0 linhas; admin ve a lixeira'
\else
\echo 'FALHOU 7 RLS da lixeira'
select 1/0;
\endif

rollback;
\echo 'TUDO OK: 055 captura'
