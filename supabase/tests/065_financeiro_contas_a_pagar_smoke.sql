-- supabase/tests/065_financeiro_contas_a_pagar_smoke.sql
--
-- Teste de fumaça da migration 065 (rodar no dev e, depois, em produção, como
-- postgres via psql; termina em rollback, não deixa nada). Datas sempre
-- relativas ao mês atual (M), para passar em qualquer mês, inclusive dezembro.
-- Sucesso = "065 OK".
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

-- Caso 1: recorrente, dia 31, início M
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_res jsonb;
  v_fim date;
  v_esperado integer;
  v_qtd integer;
begin
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_065_c1') returning id into v_tipo;
  v_res := financeiro_definir_forma_pagamento(v_tipo, 'recorrente', 100, 31, v_m, null);

  v_fim := make_date(extract(year from v_m)::integer + case when extract(month from v_m) = 12 then 1 else 0 end, 12, 1);
  v_esperado := (extract(year from v_fim)::integer - extract(year from v_m)::integer) * 12
                + 12 - extract(month from v_m)::integer + 1;
  select count(*) into v_qtd from financeiro_movimentos where tipo_id = v_tipo;

  assert v_qtd = v_esperado,
    format('caso 1: esperava %s contas (M até dezembro), criou %s', v_esperado, v_qtd);
  assert (v_res->>'criadas')::integer = v_qtd,
    format('caso 1: retorno criadas=%s diferente das linhas=%s', v_res->>'criadas', v_qtd);
  assert not exists (
    select 1 from financeiro_movimentos
    where tipo_id = v_tipo and date_trunc('month', data)::date <> competencia
  ), 'caso 1: alguma data caiu fora do mês da competência';
  assert not exists (
    select 1 from financeiro_movimentos
    where tipo_id = v_tipo
      and extract(day from (competencia + interval '1 month' - interval '1 day')) = 30
      and extract(day from data) <> 30
  ), 'caso 1: em mês de 30 dias a data deveria ser dia 30';
  assert not exists (
    select 1 from financeiro_movimentos where tipo_id = v_tipo and (pago or competencia is null)
  ), 'caso 1: conta gerada deveria nascer não paga e com competência';
  assert (v_res->>'primeira')::date = v_m and (v_res->>'ultima')::date = v_fim,
    'caso 1: primeira/ultima do retorno erradas';
end $$;

-- Caso 2: vencimento em fevereiro
do $$
begin
  assert financeiro_vencimento('2027-02-01', 31) = date '2027-02-28',
    'caso 2: 31 em fev/2027 deveria virar dia 28';
  assert financeiro_vencimento('2028-02-01', 30) = date '2028-02-29',
    'caso 2: 30 em fev/2028 (bissexto) deveria virar dia 29';
  assert financeiro_vencimento('2027-03-01', 31) = date '2027-03-31',
    'caso 2: 31 em março deveria continuar dia 31';
end $$;

-- Caso 3: prazo de 6 meses
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_res jsonb;
begin
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_065_c3') returning id into v_tipo;
  v_res := financeiro_definir_forma_pagamento(v_tipo, 'prazo', 100, 10, v_m, 6);
  assert (select count(*) from financeiro_movimentos where tipo_id = v_tipo) = 6,
    'caso 3: prazo de 6 meses deveria criar 6 contas';
  assert (select max(competencia) from financeiro_movimentos where tipo_id = v_tipo) = (v_m + interval '5 months')::date,
    'caso 3: a última conta deveria estar em M + 5 meses';
  assert (select min(competencia) from financeiro_movimentos where tipo_id = v_tipo) = v_m,
    'caso 3: a primeira conta deveria estar em M';
  assert (v_res->>'criadas')::integer = 6, 'caso 3: retorno criadas deveria ser 6';
end $$;

-- Caso 4: simulação não grava e devolve as mesmas contagens
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_sim jsonb;
  v_real jsonb;
begin
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_065_c4') returning id into v_tipo;

  v_sim := financeiro_definir_forma_pagamento(v_tipo, 'prazo', 100, 10, v_m, 6, true);
  assert (select count(*) from financeiro_movimentos where tipo_id = v_tipo) = 0,
    'caso 4: simulação gravou contas';
  assert (select forma_pagamento from financeiro_tipos where id = v_tipo) = 'avulso',
    'caso 4: simulação alterou a forma do tipo';
  v_real := financeiro_definir_forma_pagamento(v_tipo, 'prazo', 100, 10, v_m, 6);
  assert v_sim = v_real, format('caso 4: simulado %s <> real %s (criação)', v_sim, v_real);

  -- encolher: simulação mantém as linhas e anuncia o mesmo que o real fará
  v_sim := financeiro_definir_forma_pagamento(v_tipo, 'prazo', 100, 10, v_m, 3, true);
  assert (select count(*) from financeiro_movimentos where tipo_id = v_tipo) = 6,
    'caso 4: simulação de redução mexeu nas contas';
  assert (select qtd_meses from financeiro_tipos where id = v_tipo) = 6,
    'caso 4: simulação de redução alterou qtd_meses do tipo';
  v_real := financeiro_definir_forma_pagamento(v_tipo, 'prazo', 100, 10, v_m, 3);
  assert v_sim = v_real, format('caso 4: simulado %s <> real %s (redução)', v_sim, v_real);
end $$;

-- Caso 5: conta paga nunca é tocada ao encolher/esticar o prazo
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_res jsonb;
begin
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_065_c5') returning id into v_tipo;
  perform financeiro_definir_forma_pagamento(v_tipo, 'prazo', 100, 10, v_m, 6);
  update financeiro_movimentos set pago = true, pago_em = current_date
  where tipo_id = v_tipo and competencia = (v_m + interval '4 months')::date;

  v_res := financeiro_definir_forma_pagamento(v_tipo, 'prazo', 100, 10, v_m, 3);
  assert (v_res->>'apagadas')::integer = 2,
    format('caso 5: reduzir para 3 deveria apagar 2 (4a e 6a), apagou %s', v_res->>'apagadas');
  assert exists (
    select 1 from financeiro_movimentos
    where tipo_id = v_tipo and competencia = (v_m + interval '4 months')::date and pago
  ), 'caso 5: a 5a conta paga deveria continuar lá e paga';
  assert (select count(*) from financeiro_movimentos where tipo_id = v_tipo) = 4,
    'caso 5: depois de reduzir deveriam sobrar 4 linhas (3 + a paga)';
  -- o dia do pagamento (hoje) difere da data de vencimento (M+4 meses, dia 10) e é mantido
  assert (select data from financeiro_movimentos
          where tipo_id = v_tipo and competencia = (v_m + interval '4 months')::date) <> current_date,
    'caso 5: preparo do teste: data da conta deveria diferir de hoje';
  assert (select pago_em from financeiro_movimentos
          where tipo_id = v_tipo and competencia = (v_m + interval '4 months')::date) = current_date,
    'caso 5: a conta paga deveria manter pago_em = dia do pagamento, não a data de vencimento';

  v_res := financeiro_definir_forma_pagamento(v_tipo, 'prazo', 100, 10, v_m, 6);
  assert (v_res->>'criadas')::integer = 2,
    format('caso 5: voltar para 6 deveria recriar 2 (4a e 6a), criou %s', v_res->>'criadas');
  assert (select count(*) from financeiro_movimentos where tipo_id = v_tipo) = 6,
    'caso 5: depois de voltar para 6 deveriam existir 6 linhas, sem duplicar a 5a';
  assert (select count(*) from financeiro_movimentos
          where tipo_id = v_tipo and competencia = (v_m + interval '4 months')::date) = 1,
    'caso 5: a 5a conta foi duplicada';
end $$;

-- Caso 6: mudar valor atinge só as não pagas; conta excluída à mão não volta
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_res jsonb;
  v_claims text;
  v_erro text := null;
begin
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_065_c6') returning id into v_tipo;
  perform financeiro_definir_forma_pagamento(v_tipo, 'prazo', 100, 10, v_m, 6);
  update financeiro_movimentos set pago = true, pago_em = current_date
  where tipo_id = v_tipo and competencia = (v_m + interval '1 month')::date;

  v_res := financeiro_definir_forma_pagamento(v_tipo, 'prazo', 150, 10, v_m, 6);
  assert (v_res->>'alteradas')::integer = 5,
    format('caso 6: alteradas deveria ser 5 (as não pagas), foi %s', v_res->>'alteradas');
  assert (select count(*) from financeiro_movimentos where tipo_id = v_tipo and not pago and valor = 150) = 5,
    'caso 6: as 5 não pagas deveriam ter o valor novo';
  assert (select valor from financeiro_movimentos where tipo_id = v_tipo and pago) = 100,
    'caso 6: a paga deveria manter o valor antigo';

  delete from financeiro_movimentos
  where tipo_id = v_tipo and competencia = (v_m + interval '3 months')::date;
  v_res := financeiro_definir_forma_pagamento(v_tipo, 'prazo', 200, 10, v_m, 6);
  assert not exists (
    select 1 from financeiro_movimentos
    where tipo_id = v_tipo and competencia = (v_m + interval '3 months')::date
  ), 'caso 6: a conta excluída à mão voltou';
  assert (v_res->>'criadas')::integer = 0, 'caso 6: não deveria criar nada ao mudar só o valor';
  assert (v_res->>'alteradas')::integer = 4,
    format('caso 6: alteradas deveria ser 4 depois da exclusão, foi %s', v_res->>'alteradas');
  assert (select count(*) from financeiro_movimentos where tipo_id = v_tipo and not pago and valor = 200) = 4,
    'caso 6: as 4 não pagas restantes deveriam ter o valor 200';
  assert (select valor from financeiro_movimentos where tipo_id = v_tipo and pago) = 100,
    'caso 6: a paga deveria continuar com 100 depois da segunda mudança';

  -- muda só o dia: data das não pagas recalculada, a paga intocada
  v_res := financeiro_definir_forma_pagamento(v_tipo, 'prazo', 200, 15, v_m, 6);
  assert (v_res->>'alteradas')::integer = 4,
    format('caso 6: mudar só o dia deveria alterar 4, alterou %s', v_res->>'alteradas');
  assert not exists (
    select 1 from financeiro_movimentos
    where tipo_id = v_tipo and not pago and data <> financeiro_vencimento(competencia, 15)
  ), 'caso 6: toda conta não paga deveria ter data = vencimento do dia 15';
  assert (select data from financeiro_movimentos where tipo_id = v_tipo and pago)
         = financeiro_vencimento((v_m + interval '1 month')::date, 10),
    'caso 6: a data da conta paga não deveria mudar';
  assert (select valor from financeiro_movimentos where tipo_id = v_tipo and pago) = 100,
    'caso 6: a paga deveria continuar com 100 depois de mudar o dia';

  -- não admin é barrado
  v_claims := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform financeiro_definir_forma_pagamento(v_tipo, 'prazo', 999, 15, v_m, 6);
  exception when others then
    v_erro := sqlerrm;
  end;
  perform set_config('request.jwt.claims', v_claims, true);
  assert v_erro = 'Acesso negado.', format('caso 6: não admin deveria receber "Acesso negado.", recebeu %s', v_erro);
  assert (select count(*) from financeiro_movimentos where tipo_id = v_tipo and valor = 999) = 0,
    'caso 6: a chamada de não admin não deveria gravar nada';
end $$;

-- Caso 7: voltar para Avulso (continua do tipo do caso 6)
do $$
declare
  v_tipo uuid;
  v_res jsonb;
begin
  select id into v_tipo from financeiro_tipos where natureza = 'saida' and nome = '__smoke_065_c6';
  assert v_tipo is not null, 'caso 7: tipo do caso 6 não encontrado';

  v_res := financeiro_definir_forma_pagamento(v_tipo, 'avulso', null, null, null, null);
  assert (v_res->>'apagadas')::integer = 4,
    format('caso 7: deveria apagar as 4 não pagas, apagou %s', v_res->>'apagadas');
  assert (select count(*) from financeiro_movimentos where tipo_id = v_tipo) = 1
     and exists (select 1 from financeiro_movimentos where tipo_id = v_tipo and pago),
    'caso 7: só a conta paga deveria ficar';
  assert exists (
    select 1 from financeiro_tipos
    where id = v_tipo and forma_pagamento = 'avulso' and valor_padrao is null
      and dia_vencimento is null and mes_inicio is null and qtd_meses is null and gerado_ate is null
  ), 'caso 7: colunas do tipo deveriam ficar nulas e forma = avulso';
end $$;

-- Caso 8: mês de início no passado em tipo novo
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_erro text := null;
begin
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_065_c8') returning id into v_tipo;
  begin
    perform financeiro_definir_forma_pagamento(v_tipo, 'prazo', 100, 10, (v_m - interval '1 month')::date, 3);
  exception when others then
    v_erro := sqlerrm;
  end;
  assert v_erro is not null, 'caso 8: início em M-1 deveria dar exceção';
  assert v_erro like '%anterior ao mês atual%', format('caso 8: mensagem inesperada: %s', v_erro);
  assert (select count(*) from financeiro_movimentos where tipo_id = v_tipo) = 0,
    'caso 8: a exceção não deveria deixar contas';
end $$;

-- Caso 9: renovação do Recorrente (a função roda como postgres aqui; o grant é conferido à parte)
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_n integer;
  v_gerado date;
begin
  assert has_function_privilege('service_role', 'public.financeiro_renovar_recorrentes()', 'execute'),
    'caso 9: service_role deveria poder executar financeiro_renovar_recorrentes';
  assert not has_function_privilege('authenticated', 'public.financeiro_renovar_recorrentes()', 'execute'),
    'caso 9: authenticated não deveria poder executar financeiro_renovar_recorrentes';
  assert not has_function_privilege('anon', 'public.financeiro_renovar_recorrentes()', 'execute'),
    'caso 9: anon não deveria poder executar financeiro_renovar_recorrentes';

  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_065_c9') returning id into v_tipo;
  perform financeiro_definir_forma_pagamento(v_tipo, 'recorrente', 100, 31, v_m, null);

  v_n := financeiro_renovar_recorrentes();  -- descarrega qualquer pendência de outros tipos
  v_n := financeiro_renovar_recorrentes();
  assert v_n = 0, format('caso 9: a segunda renovação seguida deveria devolver 0, devolveu %s', v_n);

  select gerado_ate into v_gerado from financeiro_tipos where id = v_tipo;
  -- apaga à mão as duas últimas contas e recua gerado_ate dois meses
  delete from financeiro_movimentos
  where tipo_id = v_tipo and competencia > (v_gerado - interval '2 months')::date;
  update financeiro_tipos set gerado_ate = (gerado_ate - interval '2 months')::date where id = v_tipo;

  v_n := financeiro_renovar_recorrentes();
  assert v_n = 2, format('caso 9: deveria recriar só as 2 contas apagadas, recriou %s', v_n);
  assert (select count(*) from financeiro_movimentos
          where tipo_id = v_tipo and competencia > (v_gerado - interval '2 months')::date) = 2,
    'caso 9: as 2 contas recriadas não estão no lugar';
  assert (select gerado_ate from financeiro_tipos where id = v_tipo) = v_gerado,
    'caso 9: gerado_ate deveria voltar ao fim devido';
  v_n := financeiro_renovar_recorrentes();
  assert v_n = 0, 'caso 9: renovação depois da recriação deveria devolver 0';

  -- conta excluída à mão, sem mexer em gerado_ate, não volta pela renovação
  delete from financeiro_movimentos where tipo_id = v_tipo and competencia = v_m;
  v_n := financeiro_renovar_recorrentes();
  assert v_n = 0, format('caso 9: renovação não deveria recriar conta excluída, criou %s', v_n);
  assert not exists (select 1 from financeiro_movimentos where tipo_id = v_tipo and competencia = v_m),
    'caso 9: a conta excluída à mão voltou pela renovação';
end $$;

-- Caso 9b: Recorrente parado há muito tempo não ganha meses já vencidos
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_n integer;
begin
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_065_c9b') returning id into v_tipo;
  update financeiro_tipos
  set forma_pagamento = 'recorrente', valor_padrao = 100, dia_vencimento = 10,
      mes_inicio = (v_m - interval '8 months')::date, gerado_ate = (v_m - interval '6 months')::date
  where id = v_tipo;

  v_n := financeiro_renovar_recorrentes();
  assert v_n >= 1, 'caso 9b: a renovação deveria criar pelo menos o mês atual';
  assert not exists (
    select 1 from financeiro_movimentos where tipo_id = v_tipo and competencia < v_m
  ), 'caso 9b: a renovação criou conta de mês anterior ao atual';
  assert exists (
    select 1 from financeiro_movimentos where tipo_id = v_tipo and competencia = v_m
  ), 'caso 9b: faltou a conta do mês atual';
  assert (select gerado_ate from financeiro_tipos where id = v_tipo)
         = financeiro_fim_recorrente((v_m - interval '8 months')::date, (now() at time zone 'America/Sao_Paulo')::date),
    'caso 9b: gerado_ate deveria avançar até o fim devido';
end $$;

-- Caso 12: a check constraint do tipo não aceita campos nulos em Recorrente/Prazo
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_ok boolean := false;
begin
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_065_c12') returning id into v_tipo;
  begin
    update financeiro_tipos
    set forma_pagamento = 'recorrente', dia_vencimento = 10, mes_inicio = v_m, gerado_ate = v_m
    where id = v_tipo;  -- valor_padrao nulo
  exception when check_violation then
    v_ok := true;
  end;
  assert v_ok, 'caso 12: recorrente com valor_padrao nulo deveria violar a check constraint';

  v_ok := false;
  begin
    update financeiro_tipos
    set forma_pagamento = 'prazo', valor_padrao = 100, dia_vencimento = 10, mes_inicio = v_m, gerado_ate = v_m
    where id = v_tipo;  -- qtd_meses nulo
  exception when check_violation then
    v_ok := true;
  end;
  assert v_ok, 'caso 12: prazo com qtd_meses nulo deveria violar a check constraint';

  v_ok := false;
  begin
    update financeiro_tipos
    set forma_pagamento = 'recorrente', valor_padrao = 100, mes_inicio = v_m, gerado_ate = v_m
    where id = v_tipo;  -- dia_vencimento nulo
  exception when check_violation then
    v_ok := true;
  end;
  assert v_ok, 'caso 12: recorrente com dia_vencimento nulo deveria violar a check constraint';
end $$;

-- Caso 13: só admin cria tipo com forma de pagamento (RLS de financeiro_tipos)
create temp table _smoke_user_fin (id uuid) on commit drop;
grant select on _smoke_user_fin to authenticated;
insert into _smoke_user_fin
  select id from profiles where role <> 'admin' and 'financeiro' = any (setores) limit 1;

set local role authenticated;
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_user uuid;
  v_claims text;
  v_ok boolean := false;
begin
  select id into v_user from _smoke_user_fin;
  if v_user is null then
    raise notice 'caso 13 PULADO: não há perfil não admin com setor financeiro';
    return;
  end if;
  v_claims := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  begin
    insert into financeiro_tipos (natureza, nome, forma_pagamento, valor_padrao, dia_vencimento, mes_inicio, gerado_ate)
    values ('saida', '__smoke_065_c13_rec', 'recorrente', 100, 10, v_m, v_m);
  exception when insufficient_privilege then
    v_ok := true;
  end;
  assert v_ok, 'caso 13: não admin não deveria criar tipo Recorrente (RLS)';

  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_065_c13_avulso');

  perform set_config('request.jwt.claims', v_claims, true);
end $$;
reset role;

do $$
begin
  assert not exists (select 1 from financeiro_tipos where nome = '__smoke_065_c13_rec'),
    'caso 13: o tipo Recorrente do não admin foi gravado';
  assert exists (select 1 from financeiro_tipos where nome = '__smoke_065_c13_avulso')
    or not exists (select 1 from _smoke_user_fin),
    'caso 13: o tipo Avulso do não admin deveria ter sido criado';
end $$;

-- Caso 10: Tipo de Entrada não aceita forma de pagamento
do $$
declare
  v_m date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_tipo uuid;
  v_erro text := null;
begin
  insert into financeiro_tipos (natureza, nome) values ('entrada', '__smoke_065_c10') returning id into v_tipo;
  begin
    perform financeiro_definir_forma_pagamento(v_tipo, 'recorrente', 100, 10, v_m, null);
  exception when others then
    v_erro := sqlerrm;
  end;
  assert v_erro is not null, 'caso 10: Tipo de Entrada deveria dar exceção';
  assert v_erro like '%só existe em Tipo de Saída%', format('caso 10: mensagem inesperada: %s', v_erro);

  -- forma nula também é recusada, com mensagem amigável
  v_erro := null;
  insert into financeiro_tipos (natureza, nome) values ('saida', '__smoke_065_c10b') returning id into v_tipo;
  begin
    perform financeiro_definir_forma_pagamento(v_tipo, null, 100, 10, v_m, null);
  exception when others then
    v_erro := sqlerrm;
  end;
  assert v_erro = 'Forma de pagamento inválida.', format('caso 10: forma nula deveria dar "Forma de pagamento inválida.", deu %s', v_erro);
end $$;

-- Caso 11: compatibilidade com o código anterior
do $$
declare
  v_tipo uuid;
  v_id uuid;
  v_data date := current_date;
begin
  insert into financeiro_tipos (natureza, nome) values ('entrada', '__smoke_065_c11') returning id into v_tipo;
  insert into financeiro_movimentos (natureza, tipo_id, valor, data)
  values ('entrada', v_tipo, 10, v_data) returning id into v_id;
  assert (select pago_em from financeiro_movimentos where id = v_id) = v_data,
    'caso 11: lançamento sem pago_em deveria sair com pago_em = data';

  update financeiro_movimentos set data = data + 1 where id = v_id;
  assert (select pago_em from financeiro_movimentos where id = v_id) = v_data + 1,
    'caso 11: editar a data deveria levar o pago_em junto';

  -- código antigo: linha de série nasce não paga, é confirmada com pago_em próprio e desfeita
  insert into financeiro_movimentos (natureza, tipo_id, valor, data, recorrencia_id, pago)
  values ('entrada', v_tipo, 10, v_data, gen_random_uuid(), false) returning id into v_id;
  assert (select pago_em from financeiro_movimentos where id = v_id) is null,
    'caso 11: linha de série não paga deveria nascer sem pago_em';

  update financeiro_movimentos set pago = true, pago_em = v_data + 3 where id = v_id;
  assert (select pago_em from financeiro_movimentos where id = v_id) = v_data + 3,
    'caso 11: confirmar linha de série com pago_em próprio deveria manter esse dia, não a data';

  update financeiro_movimentos set pago = false, pago_em = null where id = v_id;
  assert (select not pago and pago_em is null from financeiro_movimentos where id = v_id),
    'caso 11: desfazer a confirmação da linha de série deveria passar pela check constraint';
end $$;

do $$ begin raise notice '065 OK'; end $$;

rollback;
