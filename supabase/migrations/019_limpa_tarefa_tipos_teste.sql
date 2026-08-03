-- supabase/migrations/019_limpa_tarefa_tipos_teste.sql

-- TES-6: `456456`, `456456456`, `456456456456` e `TESTE` foram criados em
-- tarefa_tipos (setor contábil) via testes manuais ANTES da migration 017
-- (que introduziu a distinção padrao/extra). Por já existirem na tabela
-- quando 017 rodou, herdaram o default padrao=true da coluna nova — e por
-- isso continuam sendo copiados como tarefa padrão pra todo cliente novo
-- do setor Contábil (ClienteGeralModal.tsx, .eq('padrao', true)), mesmo
-- depois de removidos de tarefas_personalizadas de cada cliente onde
-- tinham sido usados: apagar a tarefa no cliente só limpa o array
-- tarefas_personalizadas, nunca a linha em tarefa_tipos.
--
-- Não há chave estrangeira apontando pra tarefa_tipos.id (o vínculo com
-- clientes é só pelo nome, via texto no array tarefas_personalizadas) e os
-- nomes já foram confirmados removidos de todos os clientes — apagar as
-- linhas é seguro e evita que a sujeira de teste continue poluindo também
-- o catálogo completo usado pelos seletores de "tarefa extra" na tela de
-- cliente (app/contabil/clientes/page.tsx e [id]/page.tsx, que listam
-- tarefa_tipos sem filtro de padrao).
delete from tarefa_tipos
where setor = 'contabil'
  and nome in ('456456', '456456456', '456456456456', 'TESTE');
