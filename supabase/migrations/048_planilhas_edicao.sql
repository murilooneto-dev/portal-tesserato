-- supabase/migrations/048_planilhas_edicao.sql
--
-- Funções de edição das tabelas de planilha. Chamadas só pelas Server Actions
-- (service role), que já validaram sessão, permissão de setor e tipo do valor.
--
-- editar_celula_planilha usa jsonb_set num único UPDATE: no READ COMMITTED o
-- Postgres reavalia a expressão SET sobre a versão mais recente da linha, então
-- duas pessoas editando células DIFERENTES da mesma linha ao mesmo tempo não
-- sobrescrevem uma à outra (ler-e-regravar no JS perderia uma das edições).

create or replace function editar_celula_planilha(p_linha uuid, p_coluna uuid, p_valor jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update planilha_linhas
     set dados = jsonb_set(dados, array[p_coluna::text], coalesce(p_valor, 'null'::jsonb), true),
         updated_at = now()
   where id = p_linha;
  return found;
end;
$$;

create or replace function vincular_cliente_linha(p_linha uuid, p_coluna uuid, p_cliente uuid, p_nome text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cliente is null then
    -- Só desvincula: o texto original da célula continua, e a linha volta a
    -- aparecer no filtro "sem cliente".
    update planilha_linhas
       set cliente_id = null, updated_at = now()
     where id = p_linha;
  else
    update planilha_linhas
       set cliente_id = p_cliente,
           dados = jsonb_set(dados, array[p_coluna::text], to_jsonb(p_nome), true),
           updated_at = now()
     where id = p_linha;
  end if;
  return found;
end;
$$;

create or replace function adicionar_linha_planilha(p_planilha uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Serializa adições simultâneas na mesma tabela para não repetir `ordem`.
  perform pg_advisory_xact_lock(hashtext(p_planilha::text));

  insert into planilha_linhas (planilha_id, dados, ordem)
  select p_planilha, '{}'::jsonb, coalesce(max(ordem), -1) + 1
  from planilha_linhas
  where planilha_id = p_planilha
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function editar_celula_planilha(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function vincular_cliente_linha(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function adicionar_linha_planilha(uuid) from public, anon, authenticated;
grant execute on function editar_celula_planilha(uuid, uuid, jsonb) to service_role;
grant execute on function vincular_cliente_linha(uuid, uuid, uuid, text) to service_role;
grant execute on function adicionar_linha_planilha(uuid) to service_role;
