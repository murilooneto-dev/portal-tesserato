-- supabase/rollback/065_rollback.sql
-- Desfaz a migration 065.
-- ATENCAO: as contas já criadas pelos tipos continuam em financeiro_movimentos
-- como movimentos não pagos (só perdem a coluna competencia). O pago_em
-- preenchido pelo backfill fica (não faz mal ao código antigo).
begin;
set local lock_timeout = '5s';

drop function if exists public.financeiro_definir_forma_pagamento(uuid, text, numeric, integer, date, integer, boolean);
drop function if exists public.financeiro_renovar_recorrentes();
drop function if exists public.financeiro_fim_recorrente(date, date);
drop function if exists public.financeiro_vencimento(date, integer);

drop trigger if exists financeiro_movimentos_pago_em_padrao on public.financeiro_movimentos;
drop function if exists public.financeiro_movimentos_pago_em_padrao();

alter table public.financeiro_movimentos drop constraint if exists financeiro_movimentos_pago_em_check;

drop index if exists public.idx_financeiro_movimentos_pago_em;
drop index if exists public.idx_financeiro_movimentos_tipo_competencia;

alter table public.financeiro_movimentos
  drop column if exists competencia,
  drop column if exists pago_em_hora;

alter table public.financeiro_tipos drop constraint if exists financeiro_tipos_forma_pagamento_check;

alter table public.financeiro_tipos
  drop column if exists forma_pagamento,
  drop column if exists valor_padrao,
  drop column if exists dia_vencimento,
  drop column if exists mes_inicio,
  drop column if exists qtd_meses,
  drop column if exists gerado_ate;

update public.profiles
set paginas_acesso = array_remove(paginas_acesso, 'financeiro:contas-a-pagar')
where 'financeiro:contas-a-pagar' = any (paginas_acesso);

commit;
