-- supabase/tests/052_rls_setor_smoke.sql
--
-- Teste de fumaça da migration 052. Rodar SÓ no dev, no SQL Editor.
-- Confere que as 4 policies novas existem com o texto esperado (via
-- pg_policies), que a lógica de "setor bate" está presente no qual
-- (checagem estática, não simula auth.uid() real — isso é testado de
-- verdade fazendo login como cada perfil de teste e usando a tela), e
-- que as policies antigas — inclusive as 3 policies "leem" residuais em
-- observacoes_clientes/procedimentos_societario/procedimento_arquivos,
-- que continuariam liberando SELECT irrestrito por OR se não fossem
-- removidas — não existem mais.
-- Sucesso = aparece a mensagem "052 OK" e nenhum erro.
begin;

do $$
declare
  v_qual text;
begin
  select qual into v_qual from pg_policies where tablename = 'tarefas' and policyname = 'Setor gerencia tarefas';
  assert v_qual is not null, 'policy "Setor gerencia tarefas" não foi criada';
  assert v_qual like '%tarefas.setor%', 'policy de tarefas não referencia tarefas.setor: ' || v_qual;

  select qual into v_qual from pg_policies where tablename = 'observacoes_clientes' and policyname = 'Setor fiscal gerencia observacoes_clientes';
  assert v_qual is not null, 'policy de observacoes_clientes não foi criada';
  assert v_qual like '%fiscal%', 'policy de observacoes_clientes não referencia o setor fiscal: ' || v_qual;

  select qual into v_qual from pg_policies where tablename = 'procedimentos_societario' and policyname = 'Setor societario gerencia procedimentos_societario';
  assert v_qual is not null, 'policy de procedimentos_societario não foi criada';
  assert v_qual like '%societario%', 'policy de procedimentos_societario não referencia o setor societario: ' || v_qual;

  select qual into v_qual from pg_policies where tablename = 'procedimento_arquivos' and policyname = 'Setor societario gerencia procedimento_arquivos';
  assert v_qual is not null, 'policy de procedimento_arquivos não foi criada';
  assert v_qual like '%societario%', 'policy de procedimento_arquivos não referencia o setor societario: ' || v_qual;

  -- As policies antigas não podem mais existir (o "using (auth.uid() is not
  -- null)" sem setor precisa ter sumido de verdade, não só coexistir com a
  -- nova).
  perform 1 from pg_policies where tablename = 'tarefas' and policyname = 'Usuário gerencia próprias tarefas';
  assert not found, 'policy antiga de tarefas ainda existe';
  perform 1 from pg_policies where tablename = 'observacoes_clientes' and policyname = 'Autenticados gerenciam observacoes_clientes';
  assert not found, 'policy antiga de observacoes_clientes ainda existe';
  perform 1 from pg_policies where tablename = 'procedimentos_societario' and policyname = 'Autenticados gerenciam procedimentos_societario';
  assert not found, 'policy antiga de procedimentos_societario ainda existe';
  perform 1 from pg_policies where tablename = 'procedimento_arquivos' and policyname = 'Autenticados gerenciam procedimento_arquivos';
  assert not found, 'policy antiga de procedimento_arquivos ainda existe';

  -- As policies de leitura residuais ("leem") também precisam ter sumido:
  -- como policies permissivas do Postgres se combinam por OR, mantê-las
  -- continuaria liberando SELECT pra qualquer autenticado de qualquer
  -- setor mesmo com a "for all" apertada acima.
  perform 1 from pg_policies where tablename = 'observacoes_clientes' and policyname = 'Autenticados leem observacoes_clientes';
  assert not found, 'policy residual de leitura de observacoes_clientes ainda existe';
  perform 1 from pg_policies where tablename = 'procedimentos_societario' and policyname = 'Autenticados leem procedimentos_societario';
  assert not found, 'policy residual de leitura de procedimentos_societario ainda existe';
  perform 1 from pg_policies where tablename = 'procedimento_arquivos' and policyname = 'Autenticados leem procedimento_arquivos';
  assert not found, 'policy residual de leitura de procedimento_arquivos ainda existe';

  raise notice '052 OK';
end $$;

rollback;
select '052 OK — confira também na tela: login como usuário mono-setor Fiscal/Societário e teste ler/escrever nas próprias telas (deve continuar funcionando) e, se possível, tentar acessar dado de outro setor por essas 4 tabelas via REST (deve ser negado)' as resultado;
