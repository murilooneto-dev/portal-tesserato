-- supabase/migrations/040_renomear_etapa_processo.sql

-- Renomear uma etapa de um tipo de processo precisa propagar em duas
-- tabelas de uma vez: as subetapas daquela etapa (processo_subetapas.
-- etapa_nome — chave usada porque "etapa" não é uma entidade com ID
-- própria, ver 028_processo_subetapas.sql) e as respostas já preenchidas
-- em procedimentos já em andamento (procedimentos_societario.campos,
-- jsonb chaveado pelo nome da etapa). Sem isso, renomear deixaria essas
-- respostas órfãs, presas sob o nome antigo.
--
-- Sem security definer: a function roda com o papel de quem chama; a
-- server action (lib/processo-tipos-actions.ts) já exige admin antes de
-- chamar, e as policies de escrita das duas tabelas já permitem essa
-- operação pro usuário autenticado admin.

create or replace function renomear_etapa_processo(p_processo_tipo_id uuid, p_nome_antigo text, p_nome_novo text)
returns void
language plpgsql
set search_path = public
as $$
begin
  update processo_subetapas
    set etapa_nome = p_nome_novo
    where processo_tipo_id = p_processo_tipo_id and etapa_nome = p_nome_antigo;

  update procedimentos_societario
    set campos = (campos - p_nome_antigo) || jsonb_build_object(p_nome_novo, campos -> p_nome_antigo)
    where processo_tipo_id = p_processo_tipo_id and campos ? p_nome_antigo;
end;
$$;
