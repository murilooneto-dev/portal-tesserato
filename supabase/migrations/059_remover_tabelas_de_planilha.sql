-- supabase/migrations/059_remover_tabelas_de_planilha.sql
--
-- Retirada da funcionalidade "Tabelas" (upload de planilha vira tabela por
-- setor; migrations 047 a 051). O código saiu na mesma PR. DESTRUTIVA: apaga
-- as tabelas e o conteúdo delas. Em produção só depois do deploy sem a tela
-- e com backup (pg_dump) conferido.
--
-- Idempotente: pode rodar com ou sem a 058 aplicada, e mais de uma vez. O
-- histórico do Log de Eventos ("Tabela" criada/excluída) é mantido.

-- 1. Tabelas (leva junto índices, policies e os triggers do log da 058).
drop table if exists public.planilha_reenvio_log;
drop table if exists public.planilha_linhas;
drop table if exists public.planilha_colunas;
drop table if exists public.planilhas;

-- 2. Funções, por nome (qualquer assinatura).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'criar_planilha', 'editar_celula_planilha', 'vincular_cliente_linha',
        'adicionar_linha_planilha', 'consultar_planilha_linhas',
        'adicionar_coluna_planilha', 'renomear_coluna_planilha',
        'mover_coluna_planilha', 'excluir_coluna_planilha',
        'contar_celulas_coluna', 'trocar_tipo_coluna_planilha',
        'renomear_planilha', 'aplicar_reenvio_planilha'
      )
  loop
    execute format('drop function %s', f.assinatura);
  end loop;
end $$;

-- 3. Permissão de página "<setor>:tabelas" deixa de existir.
update public.profiles
set paginas_acesso = array(
  select x from unnest(paginas_acesso) with ordinality as u(x, i)
  where x not like '%:tabelas'
  order by i
)
where exists (select 1 from unnest(paginas_acesso) x where x like '%:tabelas');
