-- supabase/migrations/049_planilhas_consulta.sql
--
-- Consulta de linhas de uma tabela de planilha: busca em todas as colunas,
-- filtros por coluna, ordenação e paginação, tudo no banco.
--
-- SECURITY INVOKER de propósito: a função lê planilha_linhas com a identidade
-- de quem chama, então a RLS por setor (migration 047) continua valendo e um
-- usuário de outro setor recebe zero linhas.
--
-- Cuidados:
--  * A busca compara os VALORES (jsonb_each_text), nunca as chaves (uuids).
--  * %, _ e \ digitados pelo usuário são literais (escapados para o ILIKE).
--  * Todo cast para numeric fica dentro de CASE guardado por regex: o SQL não
--    garante ordem de avaliação de AND, mas garante a de CASE. Valores legados
--    que a importação manteve como texto (ex.: 'abc' numa coluna de número)
--    ficam de fora do filtro numérico e vão para o fim da ordenação, sem erro.
--  * Datas são comparadas como texto ISO (AAAA-MM-DD ordena certo).

create or replace function consultar_planilha_linhas(
  p_planilha uuid,
  p_busca text,
  p_filtros jsonb,
  p_sem_cliente boolean,
  p_ordem_coluna uuid,
  p_ordem_tipo text,
  p_ordem_desc boolean,
  p_offset integer,
  p_limit integer
)
returns table (id uuid, dados jsonb, cliente_id uuid, ordem integer, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      nullif(btrim(coalesce(p_busca, '')), '') as busca,
      p_ordem_coluna::text as col,
      coalesce(p_ordem_desc, false) as desc_
  )
  select l.id, l.dados, l.cliente_id, l.ordem, count(*) over () as total
  from planilha_linhas l
  cross join params pr
  where l.planilha_id = p_planilha
    and (p_sem_cliente is not true or l.cliente_id is null)
    and (
      pr.busca is null
      or exists (
        select 1
        from jsonb_each_text(l.dados) e
        where e.value ilike
          '%' || replace(replace(replace(pr.busca, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
    )
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_filtros, '[]'::jsonb)) f
      where not (
        case f->>'tipo'
          when 'texto' then
            coalesce(l.dados ->> (f->>'coluna'), '') ilike
              '%' || replace(replace(replace(coalesce(f->>'v', ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
          when 'cliente' then
            coalesce(l.dados ->> (f->>'coluna'), '') ilike
              '%' || replace(replace(replace(coalesce(f->>'v', ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
          when 'opcoes' then
            coalesce(l.dados ->> (f->>'coluna') = f->>'v', false)
          when 'numero' then
            coalesce(
              case when (l.dados ->> (f->>'coluna')) ~ '^-?[0-9]+(\.[0-9]+)?$' then
                ((f->>'min') is null or (l.dados ->> (f->>'coluna'))::numeric >= (f->>'min')::numeric)
                and ((f->>'max') is null or (l.dados ->> (f->>'coluna'))::numeric <= (f->>'max')::numeric)
              end,
              false)
          when 'data' then
            coalesce(
              case when (l.dados ->> (f->>'coluna')) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
                ((f->>'de') is null or (l.dados ->> (f->>'coluna')) >= (f->>'de'))
                and ((f->>'ate') is null or (l.dados ->> (f->>'coluna')) <= (f->>'ate'))
              end,
              false)
          else true
        end
      )
    )
  order by
    case when p_ordem_coluna is not null and p_ordem_tipo = 'numero' and not pr.desc_
              and (l.dados ->> pr.col) ~ '^-?[0-9]+(\.[0-9]+)?$'
         then (l.dados ->> pr.col)::numeric end asc nulls last,
    case when p_ordem_coluna is not null and p_ordem_tipo = 'numero' and pr.desc_
              and (l.dados ->> pr.col) ~ '^-?[0-9]+(\.[0-9]+)?$'
         then (l.dados ->> pr.col)::numeric end desc nulls last,
    case when p_ordem_coluna is not null and p_ordem_tipo is distinct from 'numero' and not pr.desc_
         then lower(nullif(l.dados ->> pr.col, '')) end asc nulls last,
    case when p_ordem_coluna is not null and p_ordem_tipo is distinct from 'numero' and pr.desc_
         then lower(nullif(l.dados ->> pr.col, '')) end desc nulls last,
    l.ordem,
    l.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 100), 0), 1000)
$$;

revoke all on function consultar_planilha_linhas(uuid, text, jsonb, boolean, uuid, text, boolean, integer, integer) from public, anon;
grant execute on function consultar_planilha_linhas(uuid, text, jsonb, boolean, uuid, text, boolean, integer, integer) to authenticated;
