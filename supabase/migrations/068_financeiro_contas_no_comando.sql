-- supabase/migrations/068_financeiro_contas_no_comando.sql
--
-- Contas a Pagar passa a ser o único lugar onde uma despesa nasce; Pagamentos
-- vira só o histórico do que foi pago. Com isso o Tipo de Saída deixa de
-- existir para o usuário:
--   conta Única       = financeiro_movimentos sem tipo, com `descricao` e
--                       `competencia` (o mês do vencimento), pago = false
--   Recorrente/Prazo  = continuam em financeiro_tipos, que só guarda o nome,
--                       o valor, o dia e até onde as contas já foram geradas
--   Indeterminado     = Recorrente que não para em dezembro: tem sempre 48
--                       meses à frente, e a rotina diária acrescenta um por mês
-- Compatível com o código anterior: nada do que ele grava passa a falhar, e a
-- chamada antiga de financeiro_definir_forma_pagamento (7 parâmetros, por
-- nome) continua valendo.

-- ---------- financeiro_movimentos ----------
alter table public.financeiro_movimentos add column if not exists descricao text;
alter table public.financeiro_movimentos alter column tipo_id drop not null;

-- Sem tipo, só a conta Única: saída, com mês de competência e descrição.
alter table public.financeiro_movimentos drop constraint if exists financeiro_movimentos_tipo_ou_descricao_check;
alter table public.financeiro_movimentos add constraint financeiro_movimentos_tipo_ou_descricao_check check (
  tipo_id is not null
  or (natureza = 'saida' and competencia is not null and nullif(btrim(descricao), '') is not null)
);

-- ---------- financeiro_tipos ----------
alter table public.financeiro_tipos add column if not exists indeterminado boolean not null default false;

-- Mesma regra da 065, mais: Indeterminado só existe em Recorrente.
alter table public.financeiro_tipos drop constraint if exists financeiro_tipos_forma_pagamento_check;
alter table public.financeiro_tipos add constraint financeiro_tipos_forma_pagamento_check check (
  (forma_pagamento = 'avulso'
    and valor_padrao is null and dia_vencimento is null and mes_inicio is null
    and qtd_meses is null and gerado_ate is null and not indeterminado)
  or
  (forma_pagamento in ('recorrente', 'prazo')
    and natureza = 'saida'
    and valor_padrao is not null and valor_padrao > 0
    and dia_vencimento is not null and dia_vencimento between 1 and 31
    and mes_inicio is not null and extract(day from mes_inicio) = 1
    and gerado_ate is not null
    and ((forma_pagamento = 'recorrente' and qtd_meses is null)
      or (forma_pagamento = 'prazo' and qtd_meses is not null and qtd_meses between 1 and 120
          and not indeterminado)))
);

-- ---------- geração das contas ----------

-- Último mês que um Recorrente deve ter.
--   comum:         dezembro do ano de início ou do ano corrente (o que for
--                  maior); em dezembro, já o do ano seguinte.
--   indeterminado: 48 meses contados do mês de início ou do mês atual (o que
--                  for maior). Como o mês atual anda, o fim anda junto.
drop function if exists public.financeiro_fim_recorrente(date, date);
create or replace function public.financeiro_fim_recorrente(
  p_mes_inicio date,
  p_hoje date,
  p_indeterminado boolean default false
) returns date
language sql
immutable
as $$
  select case when coalesce(p_indeterminado, false) then
    (greatest(date_trunc('month', p_mes_inicio::timestamp), date_trunc('month', p_hoje::timestamp))
      + interval '47 months')::date
  else
    make_date(
      greatest(
        extract(year from p_mes_inicio)::integer,
        extract(year from p_hoje)::integer + case when extract(month from p_hoje) = 12 then 1 else 0 end
      ), 12, 1)
  end
$$;

-- Grava a forma de pagamento de uma conta (linha de financeiro_tipos) e acerta
-- as contas dela. Conta paga nunca é tocada. p_simular = true só devolve as
-- contagens. primeira/ultima = primeiro e último mês das contas criadas (nulos
-- se nada é criado). p_indeterminado fica por último e com padrão: o código
-- anterior chama sem ele.
drop function if exists public.financeiro_definir_forma_pagamento(uuid, text, numeric, integer, date, integer, boolean);
create or replace function public.financeiro_definir_forma_pagamento(
  p_tipo_id uuid,
  p_forma text,
  p_valor numeric,
  p_dia integer,
  p_mes_inicio date,
  p_qtd_meses integer,
  p_simular boolean default false,
  p_indeterminado boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tipo financeiro_tipos%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date;
  v_fim date;
  v_indeterminado boolean := coalesce(p_indeterminado, false);
  v_muda_valor_dia boolean;
  v_criar date[] := '{}';
  v_criadas integer := 0;
  v_alteradas integer := 0;
  v_apagadas integer := 0;
begin
  if not is_admin() then
    raise exception 'Acesso negado.';
  end if;

  select * into v_tipo from financeiro_tipos where id = p_tipo_id for update;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  if v_tipo.natureza <> 'saida' then
    raise exception 'Forma de pagamento só existe em conta a pagar.';
  end if;
  if p_forma is null or p_forma not in ('avulso', 'recorrente', 'prazo') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if v_indeterminado and p_forma <> 'recorrente' then
    raise exception 'Indeterminado só vale para conta Recorrente.';
  end if;

  if p_forma <> 'avulso' then
    if p_valor is null or p_valor <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
    if p_dia is null or p_dia < 1 or p_dia > 31 then raise exception 'Informe um dia de vencimento de 1 a 31.'; end if;
    if p_mes_inicio is null then raise exception 'Informe o mês de início.'; end if;
    v_inicio := date_trunc('month', p_mes_inicio)::date;
    -- Só barra o passado quando o mês de início está sendo escolhido agora:
    -- editar o valor de uma conta que começou em meses anteriores continua valendo.
    if v_inicio is distinct from v_tipo.mes_inicio and v_inicio < date_trunc('month', v_hoje)::date then
      raise exception 'O mês de início não pode ser anterior ao mês atual.';
    end if;
    if p_forma = 'prazo' then
      if p_qtd_meses is null or p_qtd_meses < 1 or p_qtd_meses > 120 then
        raise exception 'Informe a quantidade de meses, de 1 a 120.';
      end if;
      v_fim := (v_inicio + make_interval(months => p_qtd_meses - 1))::date;
    else
      v_fim := financeiro_fim_recorrente(v_inicio, v_hoje, v_indeterminado);
    end if;
  end if;

  v_muda_valor_dia := p_forma <> 'avulso' and v_tipo.forma_pagamento <> 'avulso'
    and (p_valor is distinct from v_tipo.valor_padrao or p_dia is distinct from v_tipo.dia_vencimento);

  -- Meses a criar: os do novo período que ainda não foram gerados antes
  -- (fora de [mes_inicio antigo, gerado_ate antigo]) e que não têm conta.
  -- generate_series em timestamp sem fuso: o mês não escorrega com o fuso da sessão.
  if p_forma <> 'avulso' then
    select coalesce(array_agg(c::date order by c), '{}') into v_criar
    from generate_series(v_inicio::timestamp, v_fim::timestamp, interval '1 month') c
    where (v_tipo.forma_pagamento = 'avulso' or c::date < v_tipo.mes_inicio or c::date > v_tipo.gerado_ate)
      and not exists (
        select 1 from financeiro_movimentos m where m.tipo_id = p_tipo_id and m.competencia = c::date
      );
  end if;
  v_criadas := coalesce(array_length(v_criar, 1), 0);

  select count(*) into v_apagadas
  from financeiro_movimentos m
  where m.tipo_id = p_tipo_id and m.competencia is not null and not m.pago
    and (p_forma = 'avulso' or m.competencia < v_inicio or m.competencia > v_fim);

  if v_muda_valor_dia then
    select count(*) into v_alteradas
    from financeiro_movimentos m
    where m.tipo_id = p_tipo_id and m.competencia is not null and not m.pago
      and m.competencia between v_inicio and v_fim;
  end if;

  if not p_simular then
    delete from financeiro_movimentos m
    where m.tipo_id = p_tipo_id and m.competencia is not null and not m.pago
      and (p_forma = 'avulso' or m.competencia < v_inicio or m.competencia > v_fim);

    if v_muda_valor_dia then
      update financeiro_movimentos m
      set valor = p_valor, data = financeiro_vencimento(m.competencia, p_dia)
      where m.tipo_id = p_tipo_id and m.competencia is not null and not m.pago
        and m.competencia between v_inicio and v_fim;
    end if;

    insert into financeiro_movimentos (natureza, tipo_id, valor, data, competencia, pago, criado_por)
    select 'saida', p_tipo_id, p_valor, financeiro_vencimento(c, p_dia), c, false, auth.uid()
    from unnest(v_criar) as c;

    if p_forma = 'avulso' then
      update financeiro_tipos
      set forma_pagamento = 'avulso', valor_padrao = null, dia_vencimento = null,
          mes_inicio = null, qtd_meses = null, gerado_ate = null, indeterminado = false
      where id = p_tipo_id;
    else
      update financeiro_tipos
      set forma_pagamento = p_forma, valor_padrao = p_valor, dia_vencimento = p_dia,
          mes_inicio = v_inicio, qtd_meses = case when p_forma = 'prazo' then p_qtd_meses end,
          gerado_ate = v_fim, indeterminado = v_indeterminado
      where id = p_tipo_id;
    end if;
  end if;

  return jsonb_build_object(
    'criadas', v_criadas, 'alteradas', v_alteradas, 'apagadas', v_apagadas,
    'primeira', v_criar[1], 'ultima', v_criar[v_criadas]);
end $$;

-- Renovação do Recorrente, chamada pela rotina diária com a chave de serviço.
-- Igual à da 065, só que o fim devido considera o Indeterminado: nele o fim
-- anda um mês a cada mês, então a rotina acrescenta uma conta por mês. Nunca
-- cria antes do mês atual, e gerado_ate avança junto (rodar de novo não
-- duplica, e conta excluída pelo usuário não volta).
create or replace function public.financeiro_renovar_recorrentes()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_tipo record;
  v_fim date;
  v_total integer := 0;
  v_falhas integer := 0;
  v_n integer;
begin
  for v_tipo in
    select id, valor_padrao, dia_vencimento, mes_inicio, gerado_ate, indeterminado
    from financeiro_tipos
    where forma_pagamento = 'recorrente' and ativo
    for update
  loop
    begin
      v_fim := financeiro_fim_recorrente(v_tipo.mes_inicio, v_hoje, v_tipo.indeterminado);
      if v_tipo.gerado_ate < v_fim then
        insert into financeiro_movimentos (natureza, tipo_id, valor, data, competencia, pago)
        select 'saida', v_tipo.id, v_tipo.valor_padrao,
               financeiro_vencimento(c::date, v_tipo.dia_vencimento), c::date, false
        from generate_series(
          greatest((v_tipo.gerado_ate + interval '1 month')::timestamp, date_trunc('month', v_hoje::timestamp)),
          v_fim::timestamp, interval '1 month') c
        on conflict (tipo_id, competencia) where competencia is not null do nothing;
        get diagnostics v_n = row_count;
        update financeiro_tipos set gerado_ate = v_fim where id = v_tipo.id;
        v_total := v_total + v_n;
      end if;
    exception when others then
      raise warning 'Renovação da conta % falhou: %', v_tipo.id, sqlerrm;
      v_falhas := v_falhas + 1;
    end;
  end loop;
  return jsonb_build_object('criadas', v_total, 'falhas', v_falhas);
end $$;

revoke all on function public.financeiro_renovar_recorrentes() from public, anon, authenticated;
grant execute on function public.financeiro_renovar_recorrentes() to service_role;

-- ---------- log de eventos ----------
-- O log (migration 058) descreve o movimento pelo nome do tipo. A conta Única
-- não tem tipo: entra a descrição no lugar. A função é longa e cobre todas as
-- tabelas, então só o trecho do Financeiro é trocado no texto dela. Onde a 058
-- não existe (ou o trecho já foi trocado) nada acontece.
do $$
declare
  v_def text;
  v_antigo text := '(select ft.nome from financeiro_tipos ft where ft.id = (r->>''tipo_id'')::uuid),';
  v_novo text := 'coalesce((select ft.nome from financeiro_tipos ft where ft.id = (r->>''tipo_id'')::uuid), r->>''descricao''),';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'evento_log_registrar_item';

  if v_def is not null and position(v_novo in v_def) = 0 and position(v_antigo in v_def) > 0 then
    execute replace(v_def, v_antigo, v_novo);
  end if;
end $$;

-- ---------- Lixeira ----------
-- A lista da Lixeira (migration 055) só devolve alguns campos da linha
-- apagada. Entra a `descricao`, para a conta Única excluída aparecer com o
-- nome. Mesma troca de texto do bloco acima; sem a 055, nada acontece.
do $$
declare
  v_def text;
  v_antigo text := '''natureza'', l.dados->>''natureza'',';
  v_novo text := '''natureza'', l.dados->>''natureza'', ''descricao'', l.dados->>''descricao'',';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'lixeira_listar';

  if v_def is not null and position('l.dados->>''descricao''' in v_def) = 0 and position(v_antigo in v_def) > 0 then
    execute replace(v_def, v_antigo, v_novo);
  end if;
end $$;

-- ---------- limpeza dos Tipos de Saída ----------
-- Sai o que nunca foi usado: tipo de saída Avulso sem nenhum movimento, nem
-- na Lixeira (um movimento excluído há menos de 60 dias ainda pode ser
-- restaurado e precisa do tipo). Os que têm pagamento ficam guardados, só para
-- o histórico continuar mostrando o nome; as contas Recorrente/Prazo ficam.
-- A lista do que sai é tirada antes, com supabase/tests/068_lista_tipos_de_saida.sql.
delete from public.financeiro_tipos t
where t.natureza = 'saida'
  and t.forma_pagamento = 'avulso'
  and not exists (select 1 from public.financeiro_movimentos m where m.tipo_id = t.id)
  and not exists (
    select 1 from public.lixeira l
    where l.tabela = 'financeiro_movimentos'
      and l.restaurado_em is null
      and l.dados->>'tipo_id' = t.id::text
  );
