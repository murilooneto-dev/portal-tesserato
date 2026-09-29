-- supabase/migrations/053_rls_parcelamento_secoes.sql
--
-- Fecha a escrita de parcelamento_secoes (achado da auditoria de risco de
-- 2026-09-29, Fase 2). A migration 021 criou "Autenticados gerenciam
-- parcelamento_secoes" (for all, auth.uid() is not null): qualquer usuário
-- logado, de qualquer setor, podia inserir/renomear/apagar seções do catálogo
-- de parcelamento chamando a API do Supabase direto (a anon key é pública),
-- ignorando as checagens da Server Action (lib/parcelamento-secoes-actions.ts).
--
-- Regra nova, espelhando a Server Action:
--  * INSERT: admin ou membro do setor Fiscal (criar seção é baixo risco e
--    acontece no fluxo normal de "Novo Parcelamento").
--  * UPDATE/DELETE: admin ou quem tem a permissão "configuracoes:fiscal" em
--    profiles.paginas_acesso (renomear reatribui parcelamentos em massa;
--    apagar remove dado existente).
--  * SELECT: continua para qualquer autenticado (policy 021 intacta; a
--    página de parcelamentos lê as seções pelo navegador).
--
-- A app escreve nessa tabela só via Server Action com service role (ignora
-- RLS), então nada do fluxo atual depende da policy antiga.
--
-- Transacional: qualquer erro desfaz tudo. lock_timeout evita travar o portal
-- se alguma consulta longa segurar a tabela (a migration falha limpa e pode
-- ser repetida).

begin;
set local lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'parcelamento_secoes' and c.relrowsecurity) then
    raise exception '053 abortada: RLS desligada em parcelamento_secoes';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'parcelamento_secoes' and policyname = 'Autenticados leem parcelamento_secoes' and cmd = 'SELECT') then
    raise exception '053 abortada: falta a policy de leitura "Autenticados leem parcelamento_secoes" (a página de parcelamentos perderia a lista de seções)';
  end if;
  if not exists (select 1 from pg_proc where proname = 'is_admin') then
    raise exception '053 abortada: função is_admin() não existe';
  end if;
end $$;

drop policy if exists "Autenticados gerenciam parcelamento_secoes" on parcelamento_secoes;

drop policy if exists "Fiscal cria parcelamento_secoes" on parcelamento_secoes;
create policy "Fiscal cria parcelamento_secoes" on parcelamento_secoes
  for insert with check (
    is_admin() or exists (
      select 1 from profiles p
      where p.id = auth.uid() and 'fiscal'::user_setor = any(p.setores)
    )
  );

drop policy if exists "Config fiscal altera parcelamento_secoes" on parcelamento_secoes;
create policy "Config fiscal altera parcelamento_secoes" on parcelamento_secoes
  for update using (
    is_admin() or exists (
      select 1 from profiles p
      where p.id = auth.uid() and 'configuracoes:fiscal' = any(p.paginas_acesso)
    )
  ) with check (
    is_admin() or exists (
      select 1 from profiles p
      where p.id = auth.uid() and 'configuracoes:fiscal' = any(p.paginas_acesso)
    )
  );

drop policy if exists "Config fiscal apaga parcelamento_secoes" on parcelamento_secoes;
create policy "Config fiscal apaga parcelamento_secoes" on parcelamento_secoes
  for delete using (
    is_admin() or exists (
      select 1 from profiles p
      where p.id = auth.uid() and 'configuracoes:fiscal' = any(p.paginas_acesso)
    )
  );

commit;
