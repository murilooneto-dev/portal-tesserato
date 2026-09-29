-- supabase/tests/054_recriar_desvio_producao_DEV_ONLY.sql
--
-- SÓ DEV. NUNCA EM PRODUÇÃO (lá essas policies já existem; rodar isto em
-- produção depois da 054 REABRIRIA tudo e derrubaria policies de client_files).
-- Recria no dev as policies abertas que existem em produção, para ensaiar
-- a migration 054 em condições iguais às reais. Pré-requisito: 052 e 053
-- já aplicadas no dev. Depois de rodar este script, o dev fica IGUAL à
-- produção nesse ponto (inseguro de propósito) até a 054 ser aplicada.
--
-- TRAVA: para rodar, troque 'nao' por 'sim' na linha marcada abaixo. O
-- arquivo como está NÃO executa nada, então não dá para colar e rodar por
-- engano no projeto errado.
--
-- Definições copiadas do pg_policies de produção (2026-09-29). As duas
-- "true" são TO authenticated (confirmado). As baseadas em auth.uid() não
-- tiveram a coluna roles conferida em produção; ficam sem TO (roles public),
-- o que é funcionalmente equivalente (auth.uid() já barra o anon).

do $$
declare
  confirmo_que_estou_no_dev text := 'nao';  -- <<< troque para 'sim' SÓ no projeto de DEV
begin
  if confirmo_que_estou_no_dev <> 'sim' then
    raise exception 'Trava: edite a linha "confirmo_que_estou_no_dev" para ''sim'' se (e somente se) este for o projeto de DEV.';
  end if;

  drop policy if exists "autenticados_acesso_total" on tarefas;
  create policy "autenticados_acesso_total" on tarefas for all to authenticated using (true) with check (true);
  drop policy if exists "allow_authenticated_all" on tarefas;
  create policy "allow_authenticated_all" on tarefas for all to authenticated using (true) with check (true);

  drop policy if exists "autenticados_acesso_total" on clientes;
  create policy "autenticados_acesso_total" on clientes for all to authenticated using (true) with check (true);

  drop policy if exists "autenticados_acesso_total" on client_files;
  create policy "autenticados_acesso_total" on client_files for all to authenticated using (true) with check (true);
  drop policy if exists "Autenticados gerenciam arquivos" on client_files;
  create policy "Autenticados gerenciam arquivos" on client_files for all using (auth.uid() is not null);
  -- em produção não existem as policies abaixo de client_files; remove pra reproduzir
  drop policy if exists "Admin gerencia client_files" on client_files;
  drop policy if exists "Autenticados leem client_files" on client_files;

  drop policy if exists "Operador gerencia parcelamentos" on parcelamentos;
  create policy "Operador gerencia parcelamentos" on parcelamentos for all using (auth.uid() is not null);
  drop policy if exists "Fiscal gerencia parcelamentos" on parcelamentos;

  drop policy if exists "Autenticados leem observacoes" on observacoes_clientes;
  create policy "Autenticados leem observacoes" on observacoes_clientes for select using (auth.uid() is not null);

  raise notice 'Desvio de producao recriado no DEV. Agora aplique a 054.';
end $$;
