-- supabase/rollback/055_rollback.sql
-- Desfaz a migration 055. ATENCAO: apaga a tabela lixeira e TUDO que estiver guardado nela.
begin;
set local lock_timeout = '5s';

do $$
declare
  t text;
begin
  foreach t in array array[
    'clientes', 'clientes_fiscal', 'clientes_contabil', 'clientes_pessoal',
    'cliente_responsavel_historico', 'tarefas', 'tarefa_etapas', 'tarefa_arquivos',
    'tarefas_avulsas', 'evento_arquivos', 'client_files', 'cliente_notas',
    'observacoes_clientes', 'tarefa_grupos', 'parcelamentos', 'financeiro_movimentos',
    'procedimentos_societario', 'procedimento_arquivos'
  ] loop
    execute format('drop trigger if exists lixeira_capturar on public.%I', t);
  end loop;
end $$;

do $$
begin
  perform cron.unschedule('lixeira-limpar');
exception when others then
  null; -- pg_cron nao instalado ou job inexistente
end $$;

drop function if exists public.lixeira_restaurar(bigint, uuid);
drop function if exists public.lixeira_listar(integer);
drop function if exists public.lixeira_limpar();
drop function if exists public.lixeira_capturar();
drop table if exists public.lixeira;

commit;
