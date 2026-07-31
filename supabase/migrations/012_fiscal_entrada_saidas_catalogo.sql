-- supabase/migrations/012_fiscal_entrada_saidas_catalogo.sql

-- ENTRADA/SAIDAS deixam de ser hard-coded (3 checkboxes fixos,
-- recebido/importado/conferido) e passam a ser tipos reais do catálogo,
-- com as mesmas 3 etapas nomeadas, agora pelo motor genérico de etapas
-- que a Fase 1 já construiu. Dado histórico nas colunas
-- recebido/importado/conferido não é migrado — fica intocado no schema,
-- só para de ser lido/escrito pelo código a partir desta mudança.
insert into tarefa_tipos (setor, nome, etapas, tipo_resposta) values
  ('fiscal', 'ENTRADA', array['Recebido', 'Importado', 'Conferido'], 'data'),
  ('fiscal', 'SAIDAS',  array['Recebido', 'Importado', 'Conferido'], 'data');
