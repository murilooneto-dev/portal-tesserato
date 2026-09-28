# Tabelas de planilha — Fase 3 (reenvio para atualizar) design

Data: 2026-09-28. Caminho: arquitetural. Continuação do subsistema "tabelas de planilha" (ver `docs/superpowers/specs/2026-09-25-tabelas-de-planilha-design.md`, seção "Fase 3").

## Objetivo

Dar a quem configura o setor um botão "Atualizar com planilha" que reenvia um `.xlsx`/`.csv` pra uma tabela já existente, casando linhas pela **coluna-chave** (definida na criação, Fase 1). Mostra uma prévia clara do que vai mudar antes de gravar, nunca apaga nada por padrão, e deixa a pessoa decidir o que fazer quando o sistema e a planilha divergem numa mesma linha.

## Decisões (confirmadas com o usuário)

- **Local da UI:** botão dentro do painel "Gerenciar colunas" (Fase 2C), visível só pra quem configura o setor — mesma regra (`podeAcessarPagina(profile, 'configuracoes', setor)`), reaproveita o painel já existente em vez de criar página nova.
- **Casamento de coluna:** por NOME do cabeçalho (sem diferenciar maiúsculas/minúsculas, aparado), não por posição — robusto a reordenação de colunas no arquivo original.
- **Coluna nova no arquivo:** a pessoa escolhe, coluna por coluna, se cria como coluna nova (checkbox na tela de conferência) ou ignora. Nunca cria automaticamente.
- **Conflito é POR LINHA, não por célula:** uma linha com várias células divergentes vira UMA decisão ("manter sistema" ou "usar planilha" pra linha inteira), com atalho pra aplicar a mesma escolha a todas as linhas em conflito de uma vez.
- **O que conta como conflito:** só quando a célula no banco **já tinha valor** (não-vazio) e o valor novo é diferente. Célula vazia no banco recebendo um valor novo da planilha é preenchimento automático, sem pedir confirmação — nada a perder, nunca é "conflito".
- **Linhas que existem no banco mas não vieram na planilha:** só aparecem numa lista informativa na prévia. Nenhuma ação de exclusão acontece pelo reenvio — bate com "nunca apaga por padrão" da forma mais simples. Quem quiser excluir faz manualmente pela grade, como já existe hoje.
- **Log de auditoria:** tabela própria (`planilha_reenvio_log`), não o `evento_log` existente (que é organizado por cliente e não serve bem pra mudança estrutural de tabela que pode afetar linhas sem cliente nenhum). Sem UI de histórico nesta fase, só o registro.

## Modelo de dados

Migration `051`: uma tabela nova (`planilha_reenvio_log`) e uma função SQL (`aplicar_reenvio_planilha`). Nenhuma tabela existente muda de estrutura.

```
planilha_reenvio_log
  id            uuid primary key default gen_random_uuid()
  planilha_id   uuid not null references planilhas(id) on delete cascade
  usuario_id    uuid references profiles(id) on delete set null
  usuario_nome  text not null
  resumo        jsonb not null  -- {novas, semConflito, comConflitoSistema, comConflitoPlanilha, ausentes, colunasNovas}
  created_at    timestamptz not null default now()
```
RLS: leitura por setor (mesmo padrão de `planilhas`), escrita só via `SECURITY DEFINER`/service role.

## Fluxo

### 1. Enviar arquivo
Botão "Atualizar com planilha" no painel "Gerenciar colunas" (`components/tabelas/GerenciarEstrutura.tsx`) abre um wizard novo (`components/tabelas/ReenviarPlanilhaWizard.tsx`), no mesmo espírito de `NovaTabelaWizard.tsx`. Leitura do arquivo **no navegador** com `lerPlanilha` (já existe, `lib/tabelas/parse-planilha.ts`). Nada é gravado nesta etapa.

Se a tabela não tem `coluna_chave` definida (é `nullable` desde a Fase 1, e a Fase 2C não criou um jeito de defini-la depois de a tabela já existir), o botão "Atualizar com planilha" fica **desabilitado**, com um texto explicando: "Esta tabela não tem uma coluna-chave definida. Defina uma coluna-chave na criação para poder reenviar." (limitação conhecida, fora do escopo desta fase reabrir esse fluxo).

### 2. Casar colunas
Cada cabeçalho do arquivo é comparado (nome normalizado: `trim().toLowerCase()`) contra o `nome` das colunas já existentes (`planilha_colunas` daquela tabela). Cabeçalho que bate = coluna casada, usa o `id` e `tipo` já existentes (conversão de valor usa as mesmas funções por tipo já existentes: `paraNumero`, `paraDataISO`, checagem de `opcoes`). Cabeçalho sem correspondência aparece na tela de conferência com um checkbox "Criar como coluna nova" (tipo detectado por amostragem, reaproveitando `detectarTipoColuna` já existente) — desmarcado por padrão, a coluna é ignorada se não marcada.

### 3. Casar linhas pela coluna-chave
Para cada linha do arquivo, o valor da célula na coluna-chave (já convertido/normalizado como texto trimado) é comparado contra `dados[colunaChaveId]` das linhas já existentes daquela tabela (lidas do banco, paginadas em lotes de 1000 até o teto de 5.000 — nunca uma leitura sem paginação, lição da Fase 2C).

- **Chave duplicada dentro do próprio arquivo reenviado**: bloqueia a gravação inteira. A tela mostra os valores repetidos e pede pra corrigir o arquivo antes de reenviar. Nada é gravado.
- **Chave não existe no banco** → linha **nova**. Passa pelo mesmo casamento de cliente da Fase 1 (`casarCliente`, se a tabela tem coluna Cliente), com a mesma tela de revisão pra quem ficou "sem match"/"sugerido".
- **Chave existe no banco** → linha a **atualizar**. Para cada coluna casada (exceto a própria coluna-chave, que por definição não muda — se o valor da chave em si mudasse, seria uma linha diferente): se o valor atual no banco está vazio, o valor novo é aplicado direto (**sem conflito**). Se o valor atual não está vazio e é diferente do novo, é um **conflito**: a linha inteira entra na lista de decisão (manter sistema = não sobrescreve nenhuma célula em conflito dessa linha, mas AINDA aplica os preenchimentos sem conflito da mesma linha; usar planilha = sobrescreve todas as células casadas dessa linha com os valores do arquivo, inclusive as que estavam em conflito).
- **Chave do banco não aparece no arquivo** → linha **ausente**, só informativa.

### 4. Prévia
Tela com 4 blocos, cada um com contagem no topo:
- **Novas** (com a mesma tela de revisão de cliente da Fase 1 quando aplicável).
- **Atualizações sem conflito** (lista compacta, aplicadas automaticamente).
- **Atualizações com conflito** (uma linha por decisão pendente, mostrando "célula: valor atual → valor novo" pras colunas em conflito daquela linha; radio "Manter sistema" / "Usar planilha", padrão "Manter sistema"; botão "Aplicar a todas" que seta a mesma escolha em massa, sem impedir ajuste individual depois).
- **Ausentes** (lista só informativa, sem checkbox, sem ação).
- Se houver colunas novas marcadas, aparecem resumidas no topo também ("+ N coluna(s) nova(s): Nome1, Nome2").

### 5. Confirmar
Um botão "Aplicar reenvio" dispara uma Server Action que revalida tudo no servidor (nunca confia no que o navegador calculou) e chama `aplicar_reenvio_planilha` numa única transação:
1. Cria as colunas novas marcadas (mesma lógica de `adicionar_coluna_planilha`, mesma transação).
2. Insere as linhas novas (com cliente casado, se houver).
3. Aplica as atualizações sem conflito e as com conflito resolvido como "usar planilha": `UPDATE` por linha, filtrado por `planilha_id` (nunca confia em id solto vindo do cliente) e guardado por "o valor atual ainda é o que a prévia viu" (mesmo padrão `de`/`para` corrigido na Fase 2C — protege contra alguém ter editado a célula entre a prévia e a confirmação; se mudou, essa célula específica fica de fora, sem erro).
4. Linhas "manter sistema" só recebem os preenchimentos sem conflito dessa mesma linha (se houver), nunca as células em conflito.
5. Grava uma linha em `planilha_reenvio_log` com o resumo.

## Server Actions (`lib/tabelas-reenvio-actions.ts`)

- `preVisualizarReenvio(planilhaId, colunas, linhas)`: recebe o que o wizard já leu e casou no navegador (cabeçalhos, linhas convertidas), revalida a permissão e a existência da coluna-chave, busca as linhas atuais paginadas, recalcula o diff no servidor (nunca confia no diff calculado no navegador), devolve a prévia estruturada (novas/sem conflito/com conflito/ausentes) pronta pra tela renderizar. Mesmo princípio de "a prévia é recalculada e revalidada no servidor" já usado em `preVisualizarTrocaTipo`.
- `aplicarReenvio(planilhaId, resolucao)`: recebe a prévia (ou os ids/valores já resolvidos) mais as escolhas de conflito por linha, revalida tudo de novo, chama `aplicar_reenvio_planilha`.

## Erros

- Arquivo inválido/vazio: mesma mensagem já usada na Fase 1.
- Chave duplicada no arquivo: bloqueia com lista dos valores repetidos.
- Tabela sem coluna-chave: botão desabilitado antes mesmo de abrir o wizard.
- Acima do limite de 5.000 linhas **no total da tabela depois do reenvio** (linhas existentes que permanecem + linhas novas — atualizações não contam como soma, só substituem; mesmo espírito do limite da Fase 1): rejeitado antes de gravar.
- Sessão inválida ou sem permissão: mesma mensagem padrão do sistema.
- Nada é gravado pela metade — `aplicar_reenvio_planilha` é uma única transação.

## Testes

- Funções puras novas em `lib/tabelas/reenvio.ts` (casar cabeçalho por nome, classificar cada linha em nova/sem-conflito/com-conflito/ausente, detectar chave duplicada), com `node --test`.
- Teste de fumaça SQL pra `aplicar_reenvio_planilha` (mesmo formato de `049`/`050`), cobrindo: linha nova inserida corretamente; atualização sem conflito aplicada; atualização com conflito "manter sistema" preserva a célula em conflito mas aplica os preenchimentos da mesma linha; atualização com conflito "usar planilha" sobrescreve tudo da linha; escrita protegida contra edição concorrente (célula mudou entre prévia e confirmação fica de fora); coluna nova criada dentro da mesma transação; log gravado com o resumo certo.
- Teste de tela: usuário, em dev.

## Fora do escopo (v1 desta fase)

- Definir/editar `coluna_chave` depois que a tabela já existe (permanece só definível na criação, Fase 1).
- Excluir linhas "ausentes" pelo próprio fluxo de reenvio (a pessoa exclui manualmente pela grade, se quiser).
- Tela de histórico dos reenvios já feitos (o log é gravado, mas sem UI de consulta ainda).
- Reenvio incremental/parcial (sempre processa o arquivo inteiro enviado).
- Resolver conflito por célula individual (só por linha inteira).
