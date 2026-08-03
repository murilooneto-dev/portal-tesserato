-- supabase/migrations/017_tarefa_tipos_padrao.sql

-- Bug: tarefa_tipos é um catálogo único e global por setor, sem distinção
-- entre "tipo padrão" (deve ser aplicado a todo cliente novo do setor) e
-- "tipo extra criado a partir de um cliente específico" (deve ficar restrito
-- a esse cliente). Como não havia essa distinção, todo tipo criado via
-- NovoTipoTarefaModal a partir do cadastro de UM cliente entrava no mesmo
-- catálogo compartilhado e passava a "vazar" para qualquer cliente novo
-- importado/marcado para o setor Contábil ou Pessoal (que provisionam
-- tarefas_personalizadas copiando o catálogo inteiro).
--
-- `padrao` (default true) preserva o comportamento atual pra tudo que já
-- existe no catálogo hoje. Tipos criados a partir de agora pelo fluxo "+
-- tarefa" de um cliente específico serão inseridos com padrao=false (ver
-- lib/tarefa-tipos-actions.ts), e as queries de provisionamento de cliente
-- novo (components/geral/ClienteGeralModal.tsx) passam a filtrar
-- .eq('padrao', true).
alter table tarefa_tipos
  add column padrao boolean not null default true;
