-- Permite condicionar um vínculo de ATIVIDADE a um regime específico
-- (AND: só aplica se o cliente tiver a atividade E o regime). NULL =
-- "todos os regimes", equivalente ao comportamento de hoje — vínculos de
-- atividade já existentes continuam funcionando sem nenhuma migração de
-- dado. Só tem sentido quando entidade_tipo='atividade'; vínculos de
-- 'grupo' e o legado de 'regime' (que este vínculo substitui) ficam com
-- regime_id sempre null e não usam esta coluna.
alter table tarefa_tipo_vinculos
  add column regime_id uuid references regimes(id) on delete cascade;
