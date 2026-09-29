-- supabase/tests/053_rls_parcelamento_secoes_smoke.sql
--
-- Teste de fumaça da migration 053. Rodar SÓ no dev, no SQL Editor.
-- Checagem estática via pg_policies (não simula auth.uid()): as 3 policies
-- novas existem com o escopo certo, a policy aberta antiga sumiu e a de
-- leitura continua. Sucesso = mensagem "053 OK" e nenhum erro.
begin;

do $$
declare
  v_qual text;
  v_check text;
begin
  perform 1 from pg_policies where tablename = 'parcelamento_secoes' and policyname = 'Autenticados gerenciam parcelamento_secoes';
  assert not found, 'policy aberta antiga ainda existe';

  select with_check into v_check from pg_policies
   where tablename = 'parcelamento_secoes' and policyname = 'Fiscal cria parcelamento_secoes' and cmd = 'INSERT';
  assert v_check is not null, 'policy de INSERT não foi criada';
  assert v_check like '%fiscal%', 'INSERT não referencia o setor fiscal: ' || v_check;

  select qual into v_qual from pg_policies
   where tablename = 'parcelamento_secoes' and policyname = 'Config fiscal altera parcelamento_secoes' and cmd = 'UPDATE';
  assert v_qual is not null, 'policy de UPDATE não foi criada';
  assert v_qual like '%configuracoes:fiscal%', 'UPDATE não exige configuracoes:fiscal: ' || v_qual;

  select qual into v_qual from pg_policies
   where tablename = 'parcelamento_secoes' and policyname = 'Config fiscal apaga parcelamento_secoes' and cmd = 'DELETE';
  assert v_qual is not null, 'policy de DELETE não foi criada';
  assert v_qual like '%configuracoes:fiscal%', 'DELETE não exige configuracoes:fiscal: ' || v_qual;

  perform 1 from pg_policies where tablename = 'parcelamento_secoes' and policyname = 'Autenticados leem parcelamento_secoes' and cmd = 'SELECT';
  assert found, 'policy de leitura desapareceu';

  -- Nenhuma policy "for all" deve sobrar em parcelamento_secoes
  perform 1 from pg_policies where tablename = 'parcelamento_secoes' and cmd = 'ALL';
  assert not found, 'sobrou policy for all em parcelamento_secoes';

  raise notice '053 OK';
end $$;

rollback;
