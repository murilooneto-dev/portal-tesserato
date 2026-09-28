-- supabase/migrations/051_planilhas_reenvio.sql
--
-- Reenvio para atualizar uma tabela de planilha já existente: casa linhas
-- pela coluna-chave, insere linhas novas, atualiza linhas existentes célula
-- a célula, e registra um log resumido do que foi feito.
--
-- Cuidados:
--  * A escrita de atualizações é uma lista FLAT de células (linha, coluna,
--    de, para), não de linhas inteiras — cada célula só é escrita se o
--    valor atual no banco ainda bater com "de" (o valor que a MESMA
--    chamada acabou de ler, não um valor de uma chamada anterior).
--  * Todo UPDATE filtra por planilha_id = p_planilha, derivado da própria
--    tabela (nunca de id solto vindo do cliente): escrita nunca sai da
--    tabela certa, mesmo com payload adulterado.
--  * Linhas novas entram no fim da ordem (max(ordem)+1 em diante).

create table planilha_reenvio_log (
  id           uuid primary key default gen_random_uuid(),
  planilha_id  uuid not null references planilhas(id) on delete cascade,
  usuario_id   uuid references profiles(id) on delete set null,
  usuario_nome text not null,
  resumo       jsonb not null,
  created_at   timestamptz not null default now()
);
create index planilha_reenvio_log_planilha_idx on planilha_reenvio_log (planilha_id, created_at desc);

alter table planilha_reenvio_log enable row level security;

create policy "Setor le planilha_reenvio_log" on planilha_reenvio_log for select using (
  is_admin() or exists (
    select 1 from planilhas pl where pl.id = planilha_reenvio_log.planilha_id
  )
);
create policy "Admin gerencia planilha_reenvio_log" on planilha_reenvio_log for all using (is_admin());

create or replace function aplicar_reenvio_planilha(
  p_planilha uuid,
  p_linhas_novas jsonb,
  p_atualizacoes jsonb,
  p_usuario_id uuid,
  p_usuario_nome text,
  p_resumo jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_ordem_max int;
begin
  perform pg_advisory_xact_lock(hashtext(p_planilha::text));

  select coalesce(max(ordem), -1) into v_ordem_max from planilha_linhas where planilha_id = p_planilha;

  for v_item in select * from jsonb_array_elements(coalesce(p_linhas_novas, '[]'::jsonb))
  loop
    v_ordem_max := v_ordem_max + 1;
    insert into planilha_linhas (planilha_id, dados, cliente_id, ordem)
    values (
      p_planilha,
      coalesce(v_item->'dados', '{}'::jsonb),
      nullif(v_item->>'clienteId', '')::uuid,
      v_ordem_max
    );
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_atualizacoes, '[]'::jsonb))
  loop
    update planilha_linhas
       set dados = jsonb_set(dados, array[v_item->>'coluna'], coalesce(v_item->'para', 'null'::jsonb), true),
           updated_at = now()
     where id = (v_item->>'linha')::uuid
       and planilha_id = p_planilha
       and dados -> (v_item->>'coluna') is not distinct from coalesce(v_item->'de', 'null'::jsonb);
  end loop;

  insert into planilha_reenvio_log (planilha_id, usuario_id, usuario_nome, resumo)
  values (p_planilha, p_usuario_id, coalesce(p_usuario_nome, 'Desconhecido'), coalesce(p_resumo, '{}'::jsonb));

  return true;
end;
$$;

revoke all on function aplicar_reenvio_planilha(uuid, jsonb, jsonb, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function aplicar_reenvio_planilha(uuid, jsonb, jsonb, uuid, text, jsonb) to service_role;
