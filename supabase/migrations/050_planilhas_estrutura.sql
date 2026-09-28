-- supabase/migrations/050_planilhas_estrutura.sql
--
-- Gerenciar estrutura de uma tabela de planilha: adicionar, renomear, mover
-- e excluir coluna; trocar o tipo de uma coluna; renomear a tabela. Só quem
-- configura o setor usa (checado nas Server Actions, não aqui).
--
-- Cuidados:
--  * Renomear coluna/tabela nunca mexe em `dados` — a chave é sempre o id da
--    coluna, nunca o nome (garantia da Fase 1).
--  * mover_coluna_planilha devolve false (sem erro) quando a coluna já está
--    na ponta e não tem vizinho pra trocar.
--  * trocar_tipo_coluna_planilha recusa coluna do tipo cliente (origem ou
--    destino) — vínculo com clientes é estrutural, não é só um texto.
--  * excluir_coluna_planilha remove a chave da coluna de TODAS as linhas da
--    tabela (não só de uma página), numa única instrução UPDATE.

create or replace function adicionar_coluna_planilha(
  p_planilha uuid,
  p_nome text,
  p_tipo text,
  p_opcoes jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_planilha::text));

  insert into planilha_colunas (planilha_id, nome, tipo, ordem, opcoes)
  select p_planilha, p_nome, p_tipo, coalesce(max(ordem), -1) + 1, p_opcoes
  from planilha_colunas
  where planilha_id = p_planilha
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function renomear_coluna_planilha(p_coluna uuid, p_nome text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update planilha_colunas set nome = p_nome where id = p_coluna;
  return found;
end;
$$;

create or replace function mover_coluna_planilha(p_coluna uuid, p_direcao text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_planilha uuid;
  v_ordem int;
  v_vizinho_id uuid;
  v_vizinho_ordem int;
begin
  select planilha_id, ordem into v_planilha, v_ordem from planilha_colunas where id = p_coluna;
  if v_planilha is null then
    return false;
  end if;

  if p_direcao = 'cima' then
    select id, ordem into v_vizinho_id, v_vizinho_ordem
    from planilha_colunas
    where planilha_id = v_planilha and ordem < v_ordem
    order by ordem desc
    limit 1;
  elsif p_direcao = 'baixo' then
    select id, ordem into v_vizinho_id, v_vizinho_ordem
    from planilha_colunas
    where planilha_id = v_planilha and ordem > v_ordem
    order by ordem asc
    limit 1;
  else
    raise exception 'direção inválida: %', p_direcao;
  end if;

  if v_vizinho_id is null then
    return false;
  end if;

  update planilha_colunas set ordem = v_vizinho_ordem where id = p_coluna;
  update planilha_colunas set ordem = v_ordem where id = v_vizinho_id;
  return true;
end;
$$;

create or replace function excluir_coluna_planilha(p_coluna uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_planilha uuid;
begin
  select planilha_id into v_planilha from planilha_colunas where id = p_coluna;
  if v_planilha is null then
    return false;
  end if;

  update planilha_linhas
     set dados = dados - p_coluna::text,
         updated_at = now()
   where planilha_id = v_planilha;

  delete from planilha_colunas where id = p_coluna;
  return true;
end;
$$;

create or replace function contar_celulas_coluna(p_coluna uuid)
returns table (total bigint, preenchidas bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*) as total,
    count(*) filter (where l.dados ? p_coluna::text) as preenchidas
  from planilha_linhas l
  join planilha_colunas c on c.planilha_id = l.planilha_id
  where c.id = p_coluna
$$;

create or replace function trocar_tipo_coluna_planilha(
  p_coluna uuid,
  p_tipo text,
  p_opcoes jsonb,
  p_valores jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo_atual text;
  v_item jsonb;
begin
  select tipo into v_tipo_atual from planilha_colunas where id = p_coluna;
  if v_tipo_atual is null then
    return false;
  end if;
  if v_tipo_atual = 'cliente' or p_tipo = 'cliente' then
    raise exception 'coluna do tipo cliente não pode trocar de tipo';
  end if;

  update planilha_colunas set tipo = p_tipo, opcoes = p_opcoes where id = p_coluna;

  for v_item in select * from jsonb_array_elements(coalesce(p_valores, '[]'::jsonb))
  loop
    update planilha_linhas
       set dados = jsonb_set(dados, array[p_coluna::text], coalesce(v_item->'valor', 'null'::jsonb), true),
           updated_at = now()
     where id = (v_item->>'id')::uuid;
  end loop;

  return true;
end;
$$;

create or replace function renomear_planilha(p_planilha uuid, p_nome text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update planilhas set nome = p_nome, updated_at = now() where id = p_planilha;
  return found;
end;
$$;

revoke all on function adicionar_coluna_planilha(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function renomear_coluna_planilha(uuid, text) from public, anon, authenticated;
revoke all on function mover_coluna_planilha(uuid, text) from public, anon, authenticated;
revoke all on function excluir_coluna_planilha(uuid) from public, anon, authenticated;
revoke all on function contar_celulas_coluna(uuid) from public, anon, authenticated;
revoke all on function trocar_tipo_coluna_planilha(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function renomear_planilha(uuid, text) from public, anon, authenticated;

grant execute on function adicionar_coluna_planilha(uuid, text, text, jsonb) to service_role;
grant execute on function renomear_coluna_planilha(uuid, text) to service_role;
grant execute on function mover_coluna_planilha(uuid, text) to service_role;
grant execute on function excluir_coluna_planilha(uuid) to service_role;
grant execute on function contar_celulas_coluna(uuid) to service_role;
grant execute on function trocar_tipo_coluna_planilha(uuid, text, jsonb, jsonb) to service_role;
grant execute on function renomear_planilha(uuid, text) to service_role;
