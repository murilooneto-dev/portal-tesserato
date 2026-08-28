-- Responsável exclusivo por tipo de tarefa: quando setado, só essa pessoa
-- (+ admin) edita/enxerga esse tipo em qualquer cliente do setor, independente
-- de quem é o responsável geral de cada cliente (clientes_fiscal.responsavel).
-- Nullable, sem default — aditivo, não muda comportamento de nenhum tipo
-- existente.
alter table tarefa_tipos
  add column responsavel_id uuid references profiles(id) on delete set null;
