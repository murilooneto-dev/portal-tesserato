-- Tarefa que deixou de ser feita não pode sumir dos meses em que foi feita.
-- A lista de tarefas do cliente é uma só para todos os meses: tirar o nome da
-- ficha dele apaga a tarefa também das telas de meses passados. A migration
-- 063 deu ao tipo um começo (criado_em); esta dá um fim.
--   vigente_ate = último mês em que a tarefa conta (qualquer dia desse mês;
--                 o padrão é gravar o dia 1). Do mês seguinte em diante ela
--                 some das telas, mesmo estando na ficha do cliente
--                 (lib/tarefas-esperadas.ts).
--   nulo        = sem fim, como sempre foi.
alter table public.tarefa_tipos add column if not exists vigente_ate date;
