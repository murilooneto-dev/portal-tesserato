-- supabase/rollback/068_rollback.sql
-- Desfaz a migration 068, DEPOIS de o código voltar para a versão anterior.
-- ATENCAO:
--   * os Tipos de Saída sem uso apagados pela 068 NÃO voltam (recriar pela
--     lista guardada antes da aplicação, ou pelo backup);
--   * conta Única (movimento sem tipo) não cabe no modelo antigo: enquanto
--     existir alguma, o rollback para aqui, sem mudar nada. Decidir com o
--     usuário o que fazer com elas antes de rodar de novo;
--   * conta Indeterminada volta a ser Recorrente comum e as contas não pagas
--     depois de dezembro são apagadas (vão para a Lixeira).
begin;
set local lock_timeout = '5s';

do $$
declare
  v_unicas integer;
begin
  select count(*) into v_unicas from public.financeiro_movimentos where tipo_id is null;
  if v_unicas > 0 then
    raise exception 'Rollback da 068 parado: existem % conta(s) Única(s) (movimento sem tipo).', v_unicas;
  end if;
end $$;

-- Indeterminado volta a Recorrente comum: apaga as contas não pagas além do
-- fim que a regra antiga daria e recua gerado_ate.
delete from public.financeiro_movimentos m
using public.financeiro_tipos t
where t.indeterminado and m.tipo_id = t.id and m.competencia is not null and not m.pago
  and m.competencia > make_date(
    greatest(extract(year from t.mes_inicio)::integer,
             extract(year from (now() at time zone 'America/Sao_Paulo'))::integer
               + case when extract(month from (now() at time zone 'America/Sao_Paulo')) = 12 then 1 else 0 end),
    12, 1);

update public.financeiro_tipos t
set gerado_ate = make_date(
    greatest(extract(year from t.mes_inicio)::integer,
             extract(year from (now() at time zone 'America/Sao_Paulo'))::integer
               + case when extract(month from (now() at time zone 'America/Sao_Paulo')) = 12 then 1 else 0 end),
    12, 1)
where t.indeterminado;

-- Log de eventos: o trecho do Financeiro volta ao texto da 058.
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

  if v_def is not null and position(v_novo in v_def) > 0 then
    execute replace(v_def, v_novo, v_antigo);
  end if;
end $$;

-- Funções voltam ao texto da 065.
drop function if exists public.financeiro_definir_forma_pagamento(uuid, text, numeric, integer, date, integer, boolean, boolean);
drop function if exists public.financeiro_fim_recorrente(date, date, boolean);

create or replace function public.financeiro_fim_recorrente(p_mes_inicio date, p_hoje date)
returns date
language sql
immutable
as $$
  select make_date(
    greatest(
      extract(year from p_mes_inicio)::integer,
      extract(year from p_hoje)::integer + case when extract(month from p_hoje) = 12 then 1 else 0 end
    ), 12, 1)
$$;

-- Grava a forma de pagamento de um Tipo de Saída e acerta as contas dele.
-- Conta paga nunca é tocada. p_simular = true só devolve as contagens.

create or replace function public.financeiro_definir_forma_pagamento(
  p_tipo_id uuid,
  p_forma text,
  p_valor numeric,
  p_dia integer,
  p_mes_inicio date,
  p_qtd_meses integer,
  p_simular boolean default false
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
    raise exception 'Tipo não encontrado.';
  end if;
  if v_tipo.natureza <> 'saida' then
    raise exception 'Forma de pagamento só existe em Tipo de Saída.';
  end if;
  if p_forma is null or p_forma not in ('avulso', 'recorrente', 'prazo') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_forma <> 'avulso' then
    if p_valor is null or p_valor <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
    if p_dia is null or p_dia < 1 or p_dia > 31 then raise exception 'Informe um dia de vencimento de 1 a 31.'; end if;
    if p_mes_inicio is null then raise exception 'Informe o mês de início.'; end if;
    v_inicio := date_trunc('month', p_mes_inicio)::date;
    -- Só barra o passado quando o mês de início está sendo escolhido agora:
    -- editar o valor de um tipo que começou em meses anteriores continua valendo.
    if v_inicio is distinct from v_tipo.mes_inicio and v_inicio < date_trunc('month', v_hoje)::date then
      raise exception 'O mês de início não pode ser anterior ao mês atual.';
    end if;
    if p_forma = 'prazo' then
      if p_qtd_meses is null or p_qtd_meses < 1 or p_qtd_meses > 120 then
        raise exception 'Informe a quantidade de meses, de 1 a 120.';
      end if;
      v_fim := (v_inicio + make_interval(months => p_qtd_meses - 1))::date;
    else
      v_fim := financeiro_fim_recorrente(v_inicio, v_hoje);
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
          mes_inicio = null, qtd_meses = null, gerado_ate = null
      where id = p_tipo_id;
    else
      update financeiro_tipos
      set forma_pagamento = p_forma, valor_padrao = p_valor, dia_vencimento = p_dia,
          mes_inicio = v_inicio, qtd_meses = case when p_forma = 'prazo' then p_qtd_meses end,
          gerado_ate = v_fim
      where id = p_tipo_id;
    end if;
  end if;

  return jsonb_build_object(
    'criadas', v_criadas, 'alteradas', v_alteradas, 'apagadas', v_apagadas,
    'primeira', v_criar[1], 'ultima', v_criar[v_criadas]);
end $$;

-- Renovação do Recorrente, chamada pela rotina diária com a chave de serviço.
-- Cria os meses entre gerado_ate e o fim devido (em dezembro, o ano seguinte
-- inteiro), nunca antes do mês atual: um Recorrente que ficou inativo por
-- muito tempo não ganha meses já vencidos ao ser reativado (gerado_ate avança
-- mesmo assim). Rodar de novo não duplica, e conta excluída pelo usuário não
-- volta, porque gerado_ate avança junto. Cada tipo é tratado em seu próprio
-- bloco: se um falhar, vira aviso e os demais seguem. Devolve
-- {"criadas": n, "falhas": n}; falhas = tipos cujo bloco deu erro, para a

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
    select id, valor_padrao, dia_vencimento, mes_inicio, gerado_ate
    from financeiro_tipos
    where forma_pagamento = 'recorrente' and ativo
    for update
  loop
    begin
      v_fim := financeiro_fim_recorrente(v_tipo.mes_inicio, v_hoje);
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
      raise warning 'Renovação do tipo % falhou: %', v_tipo.id, sqlerrm;
      v_falhas := v_falhas + 1;
    end;
  end loop;
  return jsonb_build_object('criadas', v_total, 'falhas', v_falhas);
end $$;

revoke all on function public.financeiro_renovar_recorrentes() from public, anon, authenticated;
grant execute on function public.financeiro_renovar_recorrentes() to service_role;

-- Colunas e regras.
alter table public.financeiro_movimentos drop constraint if exists financeiro_movimentos_tipo_ou_descricao_check;
alter table public.financeiro_movimentos alter column tipo_id set not null;
alter table public.financeiro_movimentos drop column if exists descricao;

alter table public.financeiro_tipos drop constraint if exists financeiro_tipos_forma_pagamento_check;
alter table public.financeiro_tipos drop column if exists indeterminado;
alter table public.financeiro_tipos add constraint financeiro_tipos_forma_pagamento_check check (
  (forma_pagamento = 'avulso'
    and valor_padrao is null and dia_vencimento is null and mes_inicio is null
    and qtd_meses is null and gerado_ate is null)
  or
  (forma_pagamento in ('recorrente', 'prazo')
    and natureza = 'saida'
    and valor_padrao is not null and valor_padrao > 0
    and dia_vencimento is not null and dia_vencimento between 1 and 31
    and mes_inicio is not null and extract(day from mes_inicio) = 1
    and gerado_ate is not null
    and ((forma_pagamento = 'recorrente' and qtd_meses is null)
      or (forma_pagamento = 'prazo' and qtd_meses is not null and qtd_meses between 1 and 120)))
);

commit;
