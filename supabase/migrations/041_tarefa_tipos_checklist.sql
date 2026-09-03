-- supabase/migrations/041_tarefa_tipos_checklist.sql
--
-- Novo formato de tarefa, exclusivo do setor Contábil: "Checkbox com
-- Opções" (tipo_resposta='checklist'). Reaproveita a coluna `etapas`
-- (já usada pelo formato "Opções") pra guardar os nomes das opções, e a
-- tabela `tarefa_etapas` pra guardar o estado (concluida) de cada opção
-- por tarefa concreta — a lógica de auto-preenchimento da data de
-- conclusão da tarefa-pai em atualizarEtapa() (app/contabil/clientes/actions.ts)
-- já compara só o campo `concluida`, então funciona sem mudança de código.

alter table tarefa_tipos drop constraint if exists tarefa_tipos_tipo_resposta_check;
alter table tarefa_tipos add constraint tarefa_tipos_tipo_resposta_check
  check (tipo_resposta in ('data', 'texto', 'checklist'));
