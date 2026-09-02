-- supabase/migrations/036_remover_grupo.sql

-- Remove o conceito de "Grupo" (catálogo grupos + clientes_fiscal.grupo),
-- confirmado morto na prática: as 3 linhas de `grupos` estão inativas,
-- `tarefa_tipo_vinculos` não tem nenhuma linha com entidade_tipo='grupo'
-- (nenhuma tarefa automática depende disso), e o <select> de Grupo no
-- formulário Fiscal já não oferecia opções pra escolher (catálogo vazio).
-- Filtros "Grupo" em Clientes/Relatórios usam bucketDoRegime(regime), um
-- mecanismo derivado e não relacionado — ver lib/regime-bucket.ts, que
-- continua existindo sem alteração.
alter table clientes_fiscal drop column if exists grupo;
drop table if exists grupos;
