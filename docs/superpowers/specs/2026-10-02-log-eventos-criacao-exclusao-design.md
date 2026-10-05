# Log de Eventos: só criação/exclusão (+ responsável e tarefas do cliente)

Data: 2026-10-02 · Aprovado pelo usuário no chat.

## Objetivo
O Log de Eventos (`evento_log`, Parâmetros → Logs) estava cheio de "Edição de dados" (todo save da ficha
do cliente). O usuário quer registrar **toda criação e exclusão** do sistema, mantendo troca de
responsável e alteração nas tarefas definidas para o cliente.

## Decisões
- **Para de gravar `edicao`.** Registros antigos continuam visíveis.
- **Mantém** (gravados pelo código): criação/exclusão/desabilitação/reabilitação de cliente, troca de
  responsável, `tarefas` (estrutura de tarefas do cliente e grupos).
- **Novo: trigger genérico no banco** (migration 058, `evento_log_registrar_item`) em 22 tabelas:
  `evento_arquivos, client_files, procedimento_arquivos, cliente_notas, parcelamentos,
  parcelamento_secoes, calendario_eventos, tarefas_avulsas, tarefa_tipos, tarefa_tipo_vinculos,
  tarefa_vinculos, processo_tipos, procedimentos_societario, planilhas, documentacao_modelos,
  atividades, regimes, financeiro_movimentos, financeiro_tipos, financeiro_centros_custo,
  links_rapidos, agenda`. Cobre gravações do servidor e do navegador.
  - `detalhes = {entidade, descricao}`; setor e cliente resolvidos por tabela; `cliente_nome` passa a
    aceitar null.
  - Autor: `auth.uid()` ou header `x-app-usuario` com JWT service_role (mesmo critério da Lixeira 055).
  - Criação: AFTER INSERT. Exclusão: BEFORE DELETE — necessário pra `pg_trigger_depth() > 1` detectar
    cascata de verdade (em AFTER o filho da cascata vazava). Excluir um cliente = 1 evento só.
  - Falha aberta: erro no log vira WARNING, nunca cancela a operação.
- **Fora** (preenchimento, não criação): `tarefas`, `tarefa_etapas`, `tarefa_arquivos` (anexo da tarefa —
  usuário pediu pra não monitorar), `observacoes_clientes` (obs. mensal), `planilha_linhas/colunas`,
  `processo_subetapas`; tabelas de log/config (`lixeira`, `task_unlock_log`, históricos, `bots_config`).
- **Usuários**: criação/exclusão registradas no código (`app/fiscal/parametros/actions.ts`), pois passam
  pelo Auth.
- **Tela**: coluna e filtro "Item"; rótulos dos setores Societário/Financeiro/Configurações.

## Teste
Migration testada no dev em transação com rollback (criação, exclusão direta, cascata de cliente,
autoria via header, formatação de valor) e depois aplicada no dev. Produção: só com OK do usuário e
backup, depois do merge.
