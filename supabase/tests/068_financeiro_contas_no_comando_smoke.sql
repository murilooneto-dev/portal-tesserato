-- supabase/tests/068_financeiro_contas_no_comando_smoke.sql
--
-- Teste de fumaça da migration 068 (rodar no dev e, depois, em produção, como
-- postgres via psql; termina em rollback, não deixa nada). Datas sempre
-- relativas ao mês atual (M), para passar em qualquer mês, inclusive dezembro.
-- Sucesso = "068 OK".
begin;

-- Faz o is_admin() passar: assume a identidade de um admin real.
do $$
declare
  v_admin uuid;
begin
  select id into v_admin from profiles where role = 'admin' limit 1;
  assert v_admin is not null, 'sem nenhum admin em profiles para o teste';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  assert is_admin(), 'is_admin() deveria ser true com os claims do admin';
end $$;

-- Caso 1: conta Única (sem tipo). A mesma descrição pode se repetir no mês.
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_id uuid;
  v_falhou boolean;
begin
  insert into financeiro_movimentos (natureza, descricao, valor, data, competencia, pago)
  values ('saida', '__smoke_068_unica', 10, v_m + 9, v_m, false) returning id into v_id;
  insert into financeiro_movimentos (natureza, descricao, valor, data, competencia, pago)
  values ('saida', '__smoke_068_unica', 20, v_m + 14, v_m, false);

  -- Pagar depois do vencimento: pago_em fica no dia informado, não vira a data.
  update financeiro_movimentos set pago = true, pago_em = v_m + 20 where id = v_id;
  assert (select pago_em from financeiro_movimentos where id = v_id) = v_m + 20,
    'caso 1: pago_em da conta Única foi reescrito para o vencimento';

  v_falhou := false;
  begin
    insert into financeiro_movimentos (natureza, descricao, valor, data, competencia, pago)
    values ('saida', '   ', 10, v_m, v_m, false);
  exception when check_violation then v_falhou := true;
  end;
  assert v_falhou, 'caso 1: aceitou saída sem tipo e sem descrição';

  v_falhou := false;
  begin
    insert into financeiro_movimentos (natureza, descricao, valor, data, pago)
    values ('saida', '__smoke_068_sem_competencia', 10, v_m, true);
  exception when check_violation then v_falhou := true;
  end;
  assert v_falhou, 'caso 1: aceitou saída sem tipo e sem competência';

  v_falhou := false;
  begin
    insert into financeiro_movimentos (natureza, descricao, valor, data, competencia, pago)
    values ('entrada', '__smoke_068_entrada', 10, v_m, v_m, true);
  exception when check_violation then v_falhou := true;
  end;
  assert v_falhou, 'caso 1: aceitou entrada sem tipo';
end $$;

-- Caso 2: Recorrente comum pela chamada antiga (7 parâmetros): até dezembro.
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_fim date;
  v_esperado integer;
  v_qtd integer;
begin
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_068_c2') returning id into v_tipo;
  perform financeiro_definir_forma_pagamento(
    p_tipo_id => v_tipo, p_forma => 'recorrente', p_valor => 100, p_dia => 31,
    p_mes_inicio => v_m, p_qtd_meses => null, p_simular => false);

  v_fim := make_date(extract(year from v_m)::integer + case when extract(month from v_m) = 12 then 1 else 0 end, 12, 1);
  v_esperado := (extract(year from v_fim)::integer - extract(year from v_m)::integer) * 12
                + 12 - extract(month from v_m)::integer + 1;
  select count(*) into v_qtd from financeiro_movimentos where tipo_id = v_tipo;
  assert v_qtd = v_esperado, format('caso 2: esperava %s contas (M até dezembro), criou %s', v_esperado, v_qtd);
  assert not (select indeterminado from financeiro_tipos where id = v_tipo), 'caso 2: nasceu indeterminado';
end $$;

-- Caso 3: Indeterminado = 48 contas, de M a M+47; simular não grava.
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_res jsonb;
  v_qtd integer;
begin
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_068_c3') returning id into v_tipo;

  v_res := financeiro_definir_forma_pagamento(v_tipo, 'recorrente', 250, 10, v_m, null, true, true);
  assert (v_res->>'criadas')::integer = 48, format('caso 3: simulação devolveu %s, esperava 48', v_res->>'criadas');
  assert not exists (select 1 from financeiro_movimentos where tipo_id = v_tipo), 'caso 3: simular gravou conta';

  v_res := financeiro_definir_forma_pagamento(v_tipo, 'recorrente', 250, 10, v_m, null, false, true);
  select count(*) into v_qtd from financeiro_movimentos where tipo_id = v_tipo;
  assert v_qtd = 48, format('caso 3: esperava 48 contas, criou %s', v_qtd);
  assert (v_res->>'primeira')::date = v_m, 'caso 3: primeira conta fora do mês de início';
  assert (v_res->>'ultima')::date = (v_m + interval '47 months')::date, 'caso 3: última conta não é M+47';
  assert (select indeterminado and gerado_ate = (v_m + interval '47 months')::date from financeiro_tipos where id = v_tipo),
    'caso 3: tipo não ficou indeterminado com gerado_ate em M+47';
  assert not exists (select 1 from financeiro_movimentos where tipo_id = v_tipo and pago), 'caso 3: conta nasceu paga';
end $$;

-- Caso 4: a rotina diária acrescenta o mês que falta e não duplica.
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_ultimo date := (v_m + interval '47 months')::date;
  v_qtd integer;
begin
  select id into v_tipo from financeiro_tipos where nome = '__smoke_068_c3';
  -- Como se a rotina tivesse rodado pela última vez no mês passado.
  delete from financeiro_movimentos where tipo_id = v_tipo and competencia = v_ultimo;
  update financeiro_tipos set gerado_ate = (v_ultimo - interval '1 month')::date where id = v_tipo;

  perform financeiro_renovar_recorrentes();
  select count(*) into v_qtd from financeiro_movimentos where tipo_id = v_tipo;
  assert v_qtd = 48, format('caso 4: renovação deveria fechar 48 contas, ficou com %s', v_qtd);
  assert exists (select 1 from financeiro_movimentos where tipo_id = v_tipo and competencia = v_ultimo),
    'caso 4: renovação não criou o mês M+47';

  perform financeiro_renovar_recorrentes();
  select count(*) into v_qtd from financeiro_movimentos where tipo_id = v_tipo;
  assert v_qtd = 48, format('caso 4: rodar de novo duplicou (%s contas)', v_qtd);
end $$;

-- Caso 5: desmarcar Indeterminado apaga só as não pagas depois de dezembro.
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_fim date;
  v_paga date := (v_m + interval '30 months')::date;
  v_res jsonb;
  v_esperado integer;
  v_qtd integer;
begin
  select id into v_tipo from financeiro_tipos where nome = '__smoke_068_c3';
  update financeiro_movimentos set pago = true, pago_em = v_m where tipo_id = v_tipo and competencia = v_paga;

  v_fim := make_date(extract(year from v_m)::integer + case when extract(month from v_m) = 12 then 1 else 0 end, 12, 1);
  v_esperado := (extract(year from v_fim)::integer - extract(year from v_m)::integer) * 12
                + 12 - extract(month from v_m)::integer + 1;

  v_res := financeiro_definir_forma_pagamento(v_tipo, 'recorrente', 250, 10, v_m, null, false, false);
  select count(*) into v_qtd from financeiro_movimentos where tipo_id = v_tipo and not pago;
  assert v_qtd = v_esperado, format('caso 5: esperava %s contas não pagas até dezembro, ficou com %s', v_esperado, v_qtd);
  assert (v_res->>'apagadas')::integer = 48 - v_esperado - 1,
    format('caso 5: apagadas=%s, esperava %s', v_res->>'apagadas', 48 - v_esperado - 1);
  assert exists (select 1 from financeiro_movimentos where tipo_id = v_tipo and competencia = v_paga and pago),
    'caso 5: a conta paga depois de dezembro foi apagada';
  assert not (select indeterminado from financeiro_tipos where id = v_tipo), 'caso 5: continuou indeterminado';
end $$;

-- Caso 6: Indeterminado com início futuro conta 48 meses do início; e só vale em Recorrente.
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_inicio date := (v_m + interval '3 months')::date;
  v_tipo uuid;
  v_res jsonb;
  v_falhou boolean := false;
begin
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_068_c6') returning id into v_tipo;
  v_res := financeiro_definir_forma_pagamento(v_tipo, 'recorrente', 80, 5, v_inicio, null, true, true);
  assert (v_res->>'criadas')::integer = 48 and (v_res->>'ultima')::date = (v_inicio + interval '47 months')::date,
    'caso 6: início futuro deveria dar 48 contas a partir do início';

  begin
    perform financeiro_definir_forma_pagamento(v_tipo, 'prazo', 80, 5, v_m, 6, true, true);
  exception when others then v_falhou := true;
  end;
  assert v_falhou, 'caso 6: aceitou Indeterminado em Prazo determinado';

  begin
    update financeiro_tipos set indeterminado = true where id = v_tipo;
    v_falhou := false;
  exception when check_violation then v_falhou := true;
  end;
  assert v_falhou, 'caso 6: a tabela aceitou Avulso indeterminado';
end $$;

-- Caso 7: o log de eventos (se existir) descreve a conta Única pela descrição.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'evento_log_registrar_item';
  assert v_def is null or position('r->>''descricao''' in v_def) > 0,
    'caso 7: evento_log_registrar_item não foi atualizada';
end $$;

-- Caso 8: não sobrou Tipo de Saída Avulso sem uso (fora os deste teste).
do $$
declare
  v_qtd integer;
begin
  select count(*) into v_qtd
  from financeiro_tipos t
  where t.natureza = 'saida' and t.forma_pagamento = 'avulso' and t.nome not like '\_\_smoke\_068%'
    and not exists (select 1 from financeiro_movimentos m where m.tipo_id = t.id)
    and not exists (
      select 1 from lixeira l
      where l.tabela = 'financeiro_movimentos' and l.restaurado_em is null and l.dados->>'tipo_id' = t.id::text);
  assert v_qtd = 0, format('caso 8: sobraram %s tipos de saída sem uso', v_qtd);
end $$;

select '068 OK' as resultado;
rollback;
