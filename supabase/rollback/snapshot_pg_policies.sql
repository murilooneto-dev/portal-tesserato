-- supabase/rollback/snapshot_pg_policies.sql
--
-- SOMENTE LEITURA. Rode em produção imediatamente ANTES de aplicar 052/053/054
-- e guarde o resultado (exporte em CSV). É o retrato exato do estado atual,
-- incluindo a coluna roles de TODAS as policies, e serve para conferir/gerar
-- o rollback fiel.

select tablename, policyname, permissive, roles::text, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('tarefas','clientes','client_files','parcelamentos','parcelamento_secoes',
                    'observacoes_clientes','procedimentos_societario','procedimento_arquivos','profiles')
order by tablename, policyname;

-- RLS ligada em cada tabela alvo
select c.relname as tabela, c.relrowsecurity as rls_ligada, c.relforcerowsecurity as rls_forcada
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('tarefas','clientes','client_files','parcelamentos','parcelamento_secoes',
                    'observacoes_clientes','procedimentos_societario','procedimento_arquivos','profiles')
order by 1;
