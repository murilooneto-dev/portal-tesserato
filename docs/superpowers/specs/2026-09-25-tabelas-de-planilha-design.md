# Tabelas de planilha — design

Data: 2026-09-25. Caminho: arquitetural (subsistema novo). Entrega em 3 PRs contra `dev`.

## Objetivo
Enviar uma planilha (.xlsx/.csv) e o sistema criar, por conta própria, uma **tabela viva editável** com as colunas e linhas dela. A equipe passa a manter a tabela no portal, no lugar de um Excel solto. Não é importação para tabelas existentes: a estrutura vem da planilha.

## Decisões (confirmadas com o usuário)
- **Uso:** tabela viva editável (edita, filtra, mantém no dia a dia).
- **Escopo:** por setor. Admin ou quem configura o setor cria e muda a estrutura; todo o setor edita células e linhas.
- **Clientes:** existe coluna do tipo Cliente, vinculada a `clientes`. Casa por CNPJ e, se falhar, por nome parecido. Linhas sem match passam por tela de revisão antes de criar.
- **Ciclo de vida:** edita no sistema e reenvia planilha para atualizar (coluna-chave), sem perder edições.
- **Tipos de coluna (v1):** texto, número, data, lista de opções (com cor), cliente. Sim/Não fica fora da v1.
- **Armazenamento:** linhas em JSONB (abordagem A). Sem DDL em tempo de execução; descartadas a linha-por-célula (B) e a tabela real por planilha (C, conflita com migrations manuais e é arriscada).

## Modelo de dados (migration `047`, aplicada manualmente pelo usuário)
- `planilhas`: `id`, `setor`, `nome`, `coluna_chave` (nullable, para reenvio), `criado_por`, `created_at`, `updated_at`.
- `planilha_colunas`: `id`, `planilha_id`, `nome`, `tipo` (`texto|numero|data|opcoes|cliente`), `ordem`, `opcoes jsonb` (lista `{valor, cor}`, só tipo opcoes).
- `planilha_linhas`: `id`, `planilha_id`, `dados jsonb` (chave = id da coluna, não o nome), `cliente_id` (FK `clientes` `on delete set null`, indexado), `ordem`, timestamps.
- RLS por setor, no mesmo modelo do portal. Escrita de estrutura: `podeConfigurarSetor`. Escrita de linhas: usuário do setor.
- Renomear coluna não afeta os dados (valores por id).

## Fase 1 — Criação com conferência
1. Nova página `/<setor>/tabelas` com botão de enviar arquivo.
2. Leitura do arquivo **no navegador** com `xlsx` (já é dependência). Nada é gravado nesta etapa.
3. Tela de conferência: nome da tabela, linha de cabeçalho, nome e tipo de cada coluna (tipo detectado por amostragem; poucos valores repetidos sugerem lista de opções já preenchida), escolha da coluna Cliente e da coluna-chave, painel de linhas sem match com sugestão do cliente mais parecido (confirmar, trocar ou deixar "sem cliente").
4. Server Action valida tudo de novo no servidor (permissão, tipos, limite) e grava as três tabelas numa única transação.
5. Limite v1: **5.000 linhas**, gravadas em lotes.

## Fase 2 — Visualização e edição
- Rotas `/<setor>/tabelas` (lista) e `/<setor>/tabelas/[id]`; entram no menu do setor e no controle de permissão de página existente (`proxy.ts`).
- Grade com cabeçalho fixo; edição na célula com controle por tipo; salva ao sair da célula (Server Action que revalida permissão), com feedback por célula.
- Adicionar/remover linha (com confirmação). Busca geral, filtro por coluna (inclusive cliente), ordenação; execução no servidor, 100 linhas por página.
- Linhas sem cliente ganham selo e filtro rápido "só sem cliente".
- Exportar para Excel respeitando filtros.
- Só Admin/config do setor vê: adicionar/renomear/reordenar/excluir coluna, trocar tipo, excluir tabela. Trocar tipo converte o que der, avisa o que não converteu e nunca apaga o valor original.

## Fase 3 — Reenvio para atualizar
- Botão "Atualizar com planilha" (Admin/config do setor), casando pela coluna-chave.
- Pré-visualização antes de gravar: linhas novas, linhas a atualizar (com diferenças), linhas que existem mas não vieram.
- Nunca apaga por padrão. Edição feita no sistema que difere da planilha vira conflito, com escolha por linha ou em lote (manter sistema / usar planilha).
- Colunas novas na planilha viram sugestão de coluna nova.
- Log de quem mudou o quê, reaproveitando o padrão de auditoria existente (`lib/logs.ts`).

## Erros
Arquivo inválido ou vazio; cabeçalho duplicado (sufixo automático + aviso); data que não converte (célula fica texto com aviso, nada some); acima do limite de linhas; sem permissão (revalidada em toda Server Action). Nada é gravado pela metade.

## Testes
Funções puras em `lib/`, com testes `node --test`: detecção de tipo por amostragem, normalização de CNPJ, sugestão de cliente parecido, diff do reenvio, conversão ao trocar tipo. Teste de tela: usuário, em dev.

## Fora do escopo (v1)
Coluna Sim/Não, fórmulas, edição colaborativa em tempo real, histórico por célula, tabelas entre setores, exibir qualquer coisa na ficha do cliente (decidido: o vínculo com o cliente serve só dentro da própria tabela, para seletor, filtro e busca; nada aparece na ficha).
