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
--  * SELECT: continua para qualquer autenticado (policy 021 intacta).
--
-- A app escreve nessa tabela só via Server Action com service role (ignora
-- RLS), então nada do fluxo atual depende da policy antiga.

drop policy if exists "Autenticados gerenciam parcelamento_secoes" on parcelamento_secoes;

create policy "Fiscal cria parcelamento_secoes" on parcelamento_secoes
  for insert with check (
    is_admin() or exists (
      select 1 from profiles p
      where p.id = auth.uid() and 'fiscal'::user_setor = any(p.setores)
    )
  );

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

create policy "Config fiscal apaga parcelamento_secoes" on parcelamento_secoes
  for delete using (
    is_admin() or exists (
      select 1 from profiles p
      where p.id = auth.uid() and 'configuracoes:fiscal' = any(p.paginas_acesso)
    )
  );
