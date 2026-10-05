-- Pagamento recorrente: ao lançar um pagamento marcado como recorrente, o
-- sistema cria um lançamento por mês até dezembro do mesmo ano. Todos os
-- lançamentos da mesma série levam o mesmo recorrencia_id, pra lista mostrar
-- o selo "Recorrente" e pra dar pra excluir "este e os próximos" de uma vez.
-- Nula = lançamento comum (todos os que já existem continuam assim).
alter table financeiro_movimentos add column if not exists recorrencia_id uuid;

create index if not exists idx_financeiro_movimentos_recorrencia
  on financeiro_movimentos (recorrencia_id, data)
  where recorrencia_id is not null;
