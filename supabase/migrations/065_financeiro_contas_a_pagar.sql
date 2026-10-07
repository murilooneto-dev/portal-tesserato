-- supabase/migrations/065_financeiro_contas_a_pagar.sql
--
-- Contas a Pagar do Financeiro. O Tipo de Saída passa a dizer como a despesa
-- se repete e o banco cria as contas:
--   avulso     = nada é criado (todos os tipos de hoje)
--   recorrente = uma conta por mês, do mês de início até dezembro; a rotina
--                diária renova o ano seguinte em dezembro
--   prazo      = uma conta por mês, pela quantidade de meses informada
-- Conta criada pelo tipo = financeiro_movimentos com `competencia` preenchida
-- e pago = false. Ao pagar, pago_em guarda o dia e pago_em_hora a data e hora.
-- Compatível com o código anterior: nada do que ele grava passa a falhar.

-- ---------- financeiro_tipos ----------
alter table public.financeiro_tipos
  add column if not exists forma_pagamento text not null default 'avulso',
  add column if not exists valor_padrao numeric(12,2),
  add column if not exists dia_vencimento smallint,
  add column if not exists mes_inicio date,
  add column if not exists qtd_meses smallint,
  -- Último mês já gerado. Meses até aqui não são recriados: se faltam, é
  -- porque foram pagos, ou excluídos pelo usuário.
  add column if not exists gerado_ate date;

alter table public.financeiro_tipos drop constraint if exists financeiro_tipos_forma_pagamento_check;
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

-- A forma de pagamento cria contas, então só admin a define (pela função
-- financeiro_definir_forma_pagamento). O setor Financeiro continua podendo
-- criar tipos (migration 046), mas só Avulso: a check constraint acima garante
-- que Avulso tem todos os outros campos nulos.
drop policy if exists "Setor financeiro cria financeiro_tipos" on public.financeiro_tipos;
create policy "Setor financeiro cria financeiro_tipos" on public.financeiro_tipos for insert with check (
  is_admin()
  or (
    forma_pagamento = 'avulso'
    and exists (select 1 from profiles p where p.id = auth.uid() and 'financeiro' = any(p.setores))
  )
);

-- ---------- financeiro_movimentos ----------
alter table public.financeiro_movimentos
  add column if not exists competencia date,
  add column if not exists pago_em_hora timestamptz;

-- O banco impede duas contas do mesmo tipo no mesmo mês.
create unique index if not exists idx_financeiro_movimentos_tipo_competencia
  on public.financeiro_movimentos (tipo_id, competencia)
  where competencia is not null;

-- Pagamentos e Relatórios passam a olhar o dia do pagamento (pago_em), não o
-- vencimento. Para isso todo movimento pago precisa ter pago_em:
--   lançamento comum (sem série e sem competência) = pago no próprio dia dele,
--     e acompanha a data quando ela é editada;
--   conta = o dia em que o pagamento foi confirmado.
-- Feito em trigger para valer também para o código anterior a esta migration.
create or replace function public.financeiro_movimentos_pago_em_padrao()
returns trigger
language plpgsql
as $$
begin
  if new.pago then
    if new.recorrencia_id is null and new.competencia is null then
      new.pago_em := new.data;
    elsif new.pago_em is null then
      new.pago_em := new.data;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists financeiro_movimentos_pago_em_padrao on public.financeiro_movimentos;
create trigger financeiro_movimentos_pago_em_padrao
  before insert or update on public.financeiro_movimentos
  for each row execute function public.financeiro_movimentos_pago_em_padrao();

-- Movimentos pagos antes desta migration: nenhum muda de mês com isso.
update public.financeiro_movimentos set pago_em = data where pago and pago_em is null;

alter table public.financeiro_movimentos drop constraint if exists financeiro_movimentos_pago_em_check;
alter table public.financeiro_movimentos add constraint financeiro_movimentos_pago_em_check
  check (not pago or pago_em is not null);

create index if not exists idx_financeiro_movimentos_pago_em
  on public.financeiro_movimentos (natureza, pago_em)
  where pago;

-- ---------- geração das contas ----------

-- Vencimento de um mês: o dia pedido, ou o último dia quando ele não existe
-- (29, 30 e 31).
create or replace function public.financeiro_vencimento(p_competencia date, p_dia integer)
returns date
language sql
immutable
as $$
  select p_competencia
    + (least(p_dia, extract(day from (p_competencia + interval '1 month' - interval '1 day'))::integer) - 1)
$$;

-- Último mês que um Recorrente deve ter: dezembro do ano de início ou do ano
-- corrente (o que for maior); em dezembro, já o do ano seguinte.
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
-- primeira/ultima = primeiro e último mês das contas criadas (nulos se nada é criado).
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
-- rotina diária poder avisar em vez de só deixar um WARNING no log.
drop function if exists public.financeiro_renovar_recorrentes();
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

-- ---------- permissão da página nova ----------
-- Quem já acessa Pagamentos recebe Contas a Pagar.
update public.profiles
set paginas_acesso = array_append(paginas_acesso, 'financeiro:contas-a-pagar')
where 'financeiro:pagamentos' = any (paginas_acesso)
  and not ('financeiro:contas-a-pagar' = any (paginas_acesso));
