-- Cliente pode exercer mais de uma atividade (ex.: serviço e comércio) — o
-- <select> de valor único virava workaround de texto livre combinando
-- opções (ver scripts/normalizar-atividades.ts, histórico, fora de escopo
-- aqui). atividade vira array de nomes, comparado por nome contra o
-- catálogo `atividades` (por setor) — mesmo padrão sem FK já usado pra
-- grupo/regime. Ver docs/superpowers/specs/2026-08-27-multiplas-atividades-
-- cliente-design.md.

alter table clientes_fiscal
  alter column atividade type text[]
  using case when atividade is null then '{}'::text[] else array[atividade] end;
alter table clientes_fiscal alter column atividade set default '{}'::text[];
alter table clientes_fiscal alter column atividade set not null;

alter table clientes_contabil
  alter column atividade type text[]
  using case when atividade is null then '{}'::text[] else array[atividade] end;
alter table clientes_contabil alter column atividade set default '{}'::text[];
alter table clientes_contabil alter column atividade set not null;

alter table clientes_pessoal
  alter column atividade type text[]
  using case when atividade is null then '{}'::text[] else array[atividade] end;
alter table clientes_pessoal alter column atividade set default '{}'::text[];
alter table clientes_pessoal alter column atividade set not null;
