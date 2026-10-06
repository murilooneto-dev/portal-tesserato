-- Pagamento recorrente deixa de nascer como "já pago": cada lançamento da
-- série registra só que aquela conta, naquele valor, vai existir naquela
-- data. O usuário confirma o pagamento quando ele acontece; sem confirmação
-- e com a data passada, a tela mostra "Vencido".
--   pago    = false enquanto a conta está só prevista (a pagar ou vencida)
--   pago_em = dia em que o pagamento foi confirmado
-- Lançamentos comuns (e todos os que já existiam) continuam pagos.
-- O bloco só roda quando a coluna ainda não existe: rodar de novo não desfaz
-- confirmações já feitas.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'financeiro_movimentos' and column_name = 'pago'
  ) then
    alter table public.financeiro_movimentos add column pago boolean not null default true;
    alter table public.financeiro_movimentos add column pago_em date;
    -- Séries recorrentes criadas antes desta migration entraram como pagas.
    update public.financeiro_movimentos set pago = false where recorrencia_id is not null and natureza = 'saida';
  end if;
end $$;

create index if not exists idx_financeiro_movimentos_a_pagar
  on public.financeiro_movimentos (data)
  where not pago;
