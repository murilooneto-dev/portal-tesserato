-- supabase/migrations/014_fiscal_tipos_reais_catalogo.sql

-- Semeia no catálogo os 15 nomes de tarefa do Fiscal que ainda eram
-- hard-coded em TAREFAS_NORMAL/TAREFAS_SIMPLES/TAREFAS_MEI
-- (components/fiscal/TarefaChecklist.tsx) e caiam no fallback padrão
-- (campo de data simples) por não existirem em tarefa_tipos. Todos
-- entram como tipo_resposta='data', etapas=null — mesmo comportamento
-- de hoje, sem mudança de UX; só passam a existir formalmente no
-- catálogo. Nomes gravados exatamente como aparecem nos arrays hoje,
-- sem consolidar grafias parecidas entre grupos (ex. 'ICMS/ICMS ST' vs
-- 'ICMS ST' continuam duas entradas distintas).
insert into tarefa_tipos (setor, nome, etapas, tipo_resposta) values
  ('fiscal', 'SIGET',              null, 'data'),
  ('fiscal', 'SPEED GOV',          null, 'data'),
  ('fiscal', 'ISS',                null, 'data'),
  ('fiscal', 'ENV. DAS',           null, 'data'),
  ('fiscal', 'PIS/COFINS',         null, 'data'),
  ('fiscal', 'ICMS/ICMS ST',       null, 'data'),
  ('fiscal', 'IRPJ/CSLL',          null, 'data'),
  ('fiscal', 'REINF/INSS',         null, 'data'),
  ('fiscal', 'EFD FISCAL',         null, 'data'),
  ('fiscal', 'EFD PIS/COFINS',     null, 'data'),
  ('fiscal', 'FECHAMENTO SIMPLES', null, 'data'),
  ('fiscal', 'GUIAS ENVIADAS',     null, 'data'),
  ('fiscal', 'ICMS ST',            null, 'data'),
  ('fiscal', 'REINF',              null, 'data'),
  ('fiscal', 'DAS',                null, 'data');
