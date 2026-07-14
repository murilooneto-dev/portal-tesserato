# Motor de tarefas genérico por setor + páginas do Contábil

**Data:** 2026-07-14
**Branch:** a definir (nova branch a partir de `main`, dev-only)

## Contexto

O portal está em expansão multi-setor (Fiscal, Contábil, Pessoal, Societário, Financeiro — ver [[project-multi-setor-portal]]). A fundação de navegação/acesso já existe (`feat/multi-setor-portal`, local, não mesclada). Hoje, porém, **todo o sistema de tarefas (cadastro de cliente operacional, tarefas mensais, templates) é hard-coded pro Fiscal**: uma única tabela `clientes` carrega tanto identidade quanto campos operacionais Fiscal-específicos, e `tarefas` não distingue setor.

O objetivo final (fora de escopo aqui, spec futuro) é um motor de **dependência entre tarefas de setores diferentes** com alertas — mas isso exige que qualquer setor consiga ter suas próprias tarefas primeiro. Este spec entrega essa fundação genérica e, com ela, o Contábil funcional (com a lista real de tarefas do cliente) como primeiro setor além do Fiscal.

## Objetivo

1. Generalizar o modelo de dados de "cliente operacional" e "tarefas" para ser por-setor, sem hard-code de Fiscal.
2. Migrar o Fiscal para essa estrutura genérica **sem alterar seu comportamento observável** (mesma UI, mesmos dados, mesmas queries filtradas corretamente por `setor = 'fiscal'`).
3. Construir as páginas do Contábil (Dashboard, Clientes, Cliente detail, Calendário, Relatórios, Histórico) com a lista real de tarefas fornecida pelo usuário.
4. Deixar a base pronta (tabelas `tarefa_tipos`/`tarefa_etapas` genéricas) para o motor de dependência entre setores, sem construí-lo agora.

## Fora de escopo

- Motor de dependência entre tarefas de setores diferentes e sistema de notificação/alerta — spec futuro, separado.
- Parcelamentos e Conferência para outros setores — **não existem fora do Fiscal, permanentemente**, não é um "spec futuro", é exclusividade do Fiscal.
- Setores Pessoal, Societário, Financeiro — cada um vira seu próprio spec quando tiver a lista de tarefas definida, reaproveitando a mesma fundação genérica entregue aqui.
- Hardening de segurança de `senha_iss`/`login_iss` (texto plano) — mencionado pelo Fable como ponto de atenção à parte, não faz parte deste spec.
- Qualquer mudança em `clientes.mit` (campo legado de município empacotado usado pelos relatórios do Fiscal) — permanece como está, para não expandir o raio da migração.

## Decisões de arquitetura

### 1. Separação de dados por setor: tabelas filhas (não JSONB, não colunas prefixadas numa tabela só)

Consultado o modelo Fable para uma segunda opinião (registrada em anexo à discussão, não neste arquivo): recomendação forte por tabelas filhas por setor, pelos motivos:
- Os campos operacionais de cada setor são genuinamente diferentes (Contábil não tem `envia_iss`), não apenas valores diferentes das mesmas colunas — JSONB perderia tipagem/constraints, colunas prefixadas numa tabela só viram um cemitério de NULLs.
- RLS por setor fica trivial com tabela própria (`USING (setor_do_usuario() = 'fiscal')`); numa tabela compartilhada exigiria views ou lógica no client, mais frágil e fácil de vazar dado sensível entre setores.
- Setor novo = tabela nova, sem tocar no código/dados do Fiscal — contém o raio de explosão de cada mudança futura.

Isso também é a tradução literal do que o usuário pediu: "o mesmo cliente terá 1 cadastro pra cada setor com atividades distintas e opções distintas."

### 2. Schema

**`clientes`** (existente, reduzida) — fica só com identidade compartilhada entre setores:
`id, nome, cnpj, municipio, uf, mit, contato_chat, setores (user_setor[]), created_at`

Colunas removidas de `clientes` (migradas para `clientes_fiscal`): `cod, regime, atividade, responsavel, grupo, obs, prioridade, envia_iss, confere_siga, login_iss, senha_iss, email_envio_iss, declaracao_anual, tarefas_personalizadas`.

**`clientes_fiscal`** (nova):
```
cliente_id      uuid PK, FK -> clientes(id) ON DELETE CASCADE
cod             text
regime          text
atividade       text
responsavel     text
grupo           text
obs             text
prioridade      int default 3
envia_iss       boolean default false
confere_siga    boolean default false
login_iss       text
senha_iss       text
email_envio_iss text
declaracao_anual boolean default false
tarefas_personalizadas text[] default '{}'
```
RLS: select/insert/update restrito a `is_admin()` ou usuário com `'fiscal' = ANY(setores)` no profile (mesma política de acesso que `clientes` já usa hoje para dados fiscais).

**`clientes_contabil`** (nova):
```
cliente_id      uuid PK, FK -> clientes(id) ON DELETE CASCADE
atividade       text
responsavel     text
prioridade      int default 3
obs             text
tarefas_personalizadas text[] default '{}'
```
RLS: análoga, restrita a setor `contabil`.
Ao criar um cliente com `'contabil' = ANY(clientes.setores)`, `tarefas_personalizadas` é pré-populado com as 7 tarefas padrão (seção 4) — igual ao padrão que `EmpresaModal`/`ClienteGeralModal` já seguem hoje pro Fiscal (pré-popula, depois é editável por cliente).

**`tarefa_tipos`** (nova) — catálogo administrável de tipos de tarefa por setor, usado para popular `tarefas_personalizadas` por padrão e para declarar tarefas com sub-etapas:
```
id      uuid PK
setor   user_setor
nome    text
etapas  text[] nullable   -- ex: ['Solicitada','Conferida','Lançada','Conciliada']; null = tarefa simples
ativo   boolean default true
```
Seed inicial: as 7 tarefas do Contábil (ver seção 4), todas com `etapas = null` exceto "Movimentação" (`etapas = ['Solicitada','Conferida','Lançada','Conciliada']`).

**`tarefas`** (existente) — ganha coluna `setor`:
```
ALTER TABLE tarefas ADD COLUMN setor user_setor NOT NULL DEFAULT 'fiscal';
-- backfill implícito pelo DEFAULT nas linhas existentes
ALTER TABLE tarefas ALTER COLUMN setor DROP DEFAULT;
```
Colunas `recebido`, `importado`, `conferido` permanecem exatamente como estão — vocabulário exclusivo do Fiscal, não usadas por outros setores. Toda query existente que lê/escreve `tarefas` para o Fiscal passa a incluir `.eq('setor', 'fiscal')` explicitamente (é o risco que o Fable apontou: sem isso, assim que o Contábil tiver linhas em `tarefas`, o Fiscal passaria a enxergá-las).

**`tarefa_etapas`** (nova) — só existe para tarefas cujo `tarefa_tipos.etapas` não é nulo:
```
id           uuid PK
tarefa_id    uuid FK -> tarefas(id) ON DELETE CASCADE
nome         text
concluida    boolean default false
concluida_em date nullable
ordem        int
```
Criada automaticamente (uma linha por nome em `etapas`) no momento em que a linha de `tarefas` daquele tipo é criada para o cliente/mês/ano.

### 3. Arquitetura de página: componentes compartilhados + páginas finas por setor

- Componentes de domínio extraídos de `/fiscal/*` para lugar compartilhado (ex: `components/tarefas/`): checklist de tarefa (suporta tarefa simples com "concluída" único, ou com sub-etapas nomeadas), card/lista de cliente, filtro de mês/ano, dashboard cards de progresso — todos parametrizados por `setor`.
- `/fiscal/dashboard`, `/fiscal/clientes`, `/fiscal/clientes/[id]`, `/fiscal/calendario`, `/fiscal/relatorios`, `/fiscal/historico` são refatorados para consumir os componentes compartilhados com `setor="fiscal"`, sem mudança de comportamento observável. `/fiscal/parcelamentos` e `/fiscal/conferencia` não são tocados (permanecem como estão, exclusivos do Fiscal, fora do padrão compartilhado).
- `/contabil/dashboard`, `/contabil/clientes`, `/contabil/clientes/[id]`, `/contabil/calendario`, `/contabil/relatorios`, `/contabil/historico` são criados como páginas finas equivalentes, com `setor="contabil"`. Os placeholders atuais "Em construção" são substituídos.

### 4. Lista de tarefas padrão do Contábil (seed de `tarefa_tipos`)

Fornecida pelo usuário, aplicável a todo cliente do setor Contábil, independente da atividade:

| Tarefa | Etapas |
|---|---|
| Solicitação Distribuição de Lucros | simples (uma data de conclusão) |
| Envio Distribuição de Lucros | simples |
| Movimentação | Solicitada, Conferida, Lançada, Conciliada (cada uma com data própria) |
| Importação Entradas | simples |
| Importação Saídas | simples |
| Importação Tributos | simples |
| Importação Folha de Pagamento | simples |

Tarefas "simples" usam as colunas já existentes em `tarefas` (`concluida`, `concluida_em`) — não precisam de linhas em `tarefa_etapas`.

## Ordem de migração (mitiga risco de regressão no Fiscal)

1. Criar `clientes_fiscal`, migrar (copiar) os dados das colunas Fiscal-específicas de `clientes`, então remover essas colunas de `clientes`. Atualizar todo código que lê/escreve esses campos (`EmpresaModal.tsx`, `CamposFiscais.tsx`, `ClienteGeralModal.tsx`, `app/fiscal/clientes/*`, `app/fiscal/dashboard`, `app/fiscal/relatorios`, `app/fiscal/historico`, `app/fiscal/parametros`) para ler/escrever de `clientes_fiscal` via join/select aninhado.
2. Adicionar `tarefas.setor`, com backfill via DEFAULT. Atualizar toda query Fiscal existente para filtrar `setor = 'fiscal'` explicitamente **antes** de qualquer dado de outro setor existir em `tarefas` — não pode haver janela onde o Fiscal lê tarefas sem esse filtro.
3. Criar `clientes_contabil`, `tarefa_tipos` (seed com a tabela da seção 4), `tarefa_etapas`.
4. Extrair componentes compartilhados a partir do código Fiscal já migrado nos passos 1-2, sem mudar comportamento.
5. Construir as 6 páginas de `/contabil/*` sobre os componentes compartilhados.

Cada passo é validado no Supabase de dev (`fcpcorqquovvgtoukxry`) antes do próximo — consistente com o processo já usado no projeto (dev isolado, nada em produção até o usuário decidir promover).

## Critério de sucesso

- Fiscal continua 100% funcional, sem diferença observável, com dados corretos após a migração de `clientes` → `clientes_fiscal` e o filtro de `setor` em `tarefas`.
- Contábil tem as 6 páginas funcionais, cliente pode ser criado com as 7 tarefas padrão pré-populadas, "Movimentação" mostra as 4 sub-etapas com data cada, demais tarefas mostram conclusão simples.
- Nenhum dado ou UI de um setor aparece na tela do outro.
