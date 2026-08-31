-- Controle de Dossiê por cliente: marcação independente de mês/competência,
-- editável por qualquer usuário com acesso à aba Dossiê (não gated pelo
-- responsável geral do cliente — ver lib/dossie-actions.ts).
create type status_dossie as enum ('NAO_POSSUI', 'EM_ATUALIZACAO', 'CONCLUIDO');

alter table clientes_fiscal
  add column faz_dossie        boolean not null default false,
  add column dossie_status     status_dossie not null default 'NAO_POSSUI',
  add column dossie_finalizado boolean not null default false;
