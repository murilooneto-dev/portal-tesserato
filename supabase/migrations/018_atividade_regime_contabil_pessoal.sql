-- supabase/migrations/018_atividade_regime_contabil_pessoal.sql

-- Replica pros setores Contábil e Pessoal o campo "Grupo" que já existe no
-- Fiscal (clientes_fiscal.grupo — select fixo Normal/Simples/MEI, na
-- prática o regime tributário do cliente). Chamado de "regime" aqui pra
-- bater com o nome que o usuário usa pra esse campo — não confundir com
-- clientes_fiscal.regime, que é outro campo (texto livre, decorativo,
-- tipo "Isenta"), sem equivalente nesta migration.
--
-- `atividade` já existe em clientes_contabil e clientes_pessoal desde as
-- migrations 007 e 010 — não precisa de alteração de schema, só a UI que a
-- edita passa a usar um select fixo em vez de texto livre.
alter table clientes_contabil add column regime text;
alter table clientes_pessoal  add column regime text;
