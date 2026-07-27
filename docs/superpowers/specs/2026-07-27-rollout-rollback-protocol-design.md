# Protocolo de Rollout/Rollback para promoção de produção — Design

**Data:** 2026-07-27
**Status:** aprovado pelo usuário, pendente de plano de implementação
**Branch de referência do trabalho a ser promovido:** `feat/motor-tarefas-setor` (expansão multi-setor completa em dev)

## Contexto

O portal-tesserato tem hoje três ambientes possíveis em Supabase/PostgreSQL:

- **Produção real** (projeto `qilwxzpxkjzbfrwlbydt`), em uso ao vivo há tempo, plano **Free** (sem PITR, sem backup automático diário). Tem schema drift real: tabelas/colunas criadas fora de qualquer migration versionada (`app_settings`, `parcelamentos`, `agenda`, `client_files`, `deletion_log`, `task_unlock_log`, `atividade_templates`, `grupo_templates`, `observacoes_clientes`).
- **Dev** (projeto `fcpcorqquovvgtoukxry`), onde a expansão multi-setor inteira foi construída e testada, com 15 migrations sequenciais (`001` a `015`) escritas contra um banco dev "limpo" — não contra o schema real de produção.
- **Teste/staging** (a ser criado): terceiro projeto Supabase, descartável, cujo único propósito é ensaiar a promoção real de schema para produção — copiando produção fielmente, aplicando as migrations de promoção, e validando que um rollback funciona — antes de tocar no banco real.

Das 15 migrations de dev, três têm problemas conhecidos que impedem rodá-las direto contra produção:
- `002_sync_prod_schema_dev.sql` — reconstrução manual do schema de produção; não idempotente; produção já tem essas tabelas.
- `003_fix_rls_recursion_dev.sql` — corrige um bug real de recursão infinita em RLS (Postgres 42P17) em `profiles`/`clientes`/`tarefas`/etc, mas escrito contra as policies do dev, nunca confirmado contra as policies reais de produção.
- `004_multi_setor.sql` — migra `profiles.setor` (enum único) → `profiles.setores` (array) fazendo backfill+drop num único passo, o que quebraria o app em produção durante o deploy.

As migrations `005` a `015` foram construídas presumindo que `004` já tinha rodado num banco limpo, e nunca foram auditadas contra o schema real de produção.

**Decisão explícita do usuário:** dados reais de clientes SERÃO copiados para o ambiente de teste (sem restrição de LGPD aplicada aqui) — os usuários não conseguem validar o sistema sem seus dados reais de trabalho. Em compensação, o projeto de teste é descartado logo após o ensaio, e a cópia precisa ser **completa e verificável** — nenhuma perda de dado é aceitável, nem durante o ensaio nem na promoção real.

**Decisão explícita do usuário:** quem executa os comandos é o usuário, não o assistente. O papel do assistente é preparar scripts/comandos prontos e o runbook passo a passo; a execução real (cópia do banco, rollout, rollback) é sempre feita pelo usuário, com checkpoints de confirmação entre etapas.

## Objetivo

Produzir um runbook validado e executável para promover a expansão multi-setor (e todo o schema construído em dev) para produção, com um mecanismo de rollback testado — ensaiado de ponta a ponta num terceiro projeto Supabase que replica produção fielmente, antes de qualquer comando rodar contra o banco real.

## Escopo

Dentro do escopo:
1. Procedimento de clone completo de produção → projeto de teste (schema `public`, dados, Storage, usuários de teste com UUID igual aos de produção), com checklist de verificação objetiva.
2. Preparação do conjunto de migrations "prontas para produção", derivado por diff real entre produção e dev, organizado em fases seguras.
3. Runbook de rollout em fases, com verificação objetiva entre cada fase.
4. Runbook de rollback em camadas (reversão granular por fase + restore completo como último recurso).
5. Execução do ensaio completo (clone → rollout → rollback) no projeto de teste, feita pelo usuário com o assistente preparando cada comando e revisando os resultados.
6. Sincronização de `feat/motor-tarefas-setor` com `main` e deploy do código novo em produção via Vercel — como etapa final e acoplada do protocolo (ver seção 5 da Arquitetura), não uma decisão separada.
7. Runbook final, pronto para ser seguido no dia da promoção real em produção.

Fora do escopo (explicitamente adiado, não tratar como pendência desta spec):
- A promoção real em produção em si — esta spec cobre o protocolo e seu ensaio, não a execução contra produção.
- Societário e Financeiro (decisão anterior do usuário: só depois).

**Nota sobre acoplamento código↔banco (correção de um entendimento anterior):** "sincronizar `main`" e "promover o schema" não são independentes. O deploy do Vercel é automático a partir de `main` — mesclar essa branch publica código novo (que já espera `profiles.setores`, `clientes_fiscal`, `tarefa_tipos` etc.) no ar. Se isso acontecer antes das migrations de produção, o portal quebra imediatamente para todos os usuários porque o código consultaria colunas/tabelas inexistentes. Por isso o merge/deploy do código é tratado nesta spec como a etapa final do próprio rollout (seção 5 da Arquitetura), não como um item avulso a decidir depois.

## Arquitetura do protocolo

### 1. Clone completo produção → teste

O `pg_dump` padrão do schema `public` não é suficiente: não move Storage (arquivos de `client_files` e outros buckets), e o comando oficial da Supabase (`supabase db dump`) **exclui deliberadamente os schemas `auth` e `storage`** de qualquer dump por padrão (são gerenciados pela própria plataforma — sobrescrever o DDL deles no destino quebra o versionamento interno do Supabase). O clone precisa cobrir três frentes separadamente:

- **Banco Postgres completo (schema `public`):** dump via connection string direta de produção, restaurado no projeto de teste — este é o schema que as migrations de fato alteram e que precisa ser fiel byte a byte a produção.
- **Arquivos de Storage:** script dedicado (via Storage API do Supabase) que lista cada bucket e objeto em produção e copia para o projeto de teste.
- **Usuários de teste (não cópia real de `auth.users`):** o `auth.users` real de produção nunca é migrado — nem no ensaio nem na promoção real, já que produção continua sendo o mesmo projeto Supabase o tempo todo, e as migrations não tocam nesse schema. Em vez de copiar dados reais de login (que exigiria replicar `auth.identities` além de `auth.users`, e carregar e-mails/hashes reais para um projeto descartável), criar usuários de teste via `auth.admin.createUser` no projeto de teste, **fixando o `id` igual ao UUID de usuários reais de produção** que os testes precisam (um por perfil: admin, mono-fiscal, multi-setor) — preserva as foreign keys com `public.profiles` e o comportamento das RLS policies (`auth.uid() = profiles.id`) de forma idêntica a usar os dados reais, sem o risco de expor credenciais reais num ambiente descartável. **Plano B:** se algum ensaio futuro exigir a base completa de usuários reais, é tecnicamente possível via `supabase db dump --data-only --schema auth --schema storage` (override explícito do padrão) trazendo também `auth.identities` — não necessário para o objetivo atual.
- **Inventário de configuração:** extensões do Postgres habilitadas, triggers/functions existentes no `public` — conferidos manualmente como parte do checklist, não assumidos como "vieram junto".

**Verificação obrigatória pós-clone** (critério objetivo, não "parece que funcionou"):
- Contagem de linhas de **todas** as tabelas do schema `public` batendo produção↔teste.
- Contagem de arquivos e tamanho total por bucket de Storage batendo.
- Login funcional no projeto de teste com cada usuário de teste criado, confirmando que as RLS policies reconhecem corretamente `auth.uid()` contra `public.profiles`.

Esse mesmo procedimento de clone **é o mecanismo de backup real** para o dia da promoção em produção — como produção está no plano Free (sem PITR/backup automático), o clone completo tirado imediatamente antes do rollout real é a única rede de segurança disponível. Por isso ele precisa ser ensaiado exatamente como será usado de verdade, não como uma versão simplificada.

### 2. Preparar migrations prontas para produção

Abordagem: diff automático como rascunho + revisão manual dirigida, não reescrita manual das 15 migrations uma a uma (risco maior de esquecer algo, dado o drift documentado de produção).

- Gerar diff real entre o schema de produção (a partir do clone) e o schema atual de dev, via `supabase db diff` ou comparação de `pg_dump --schema-only` dos dois lados.
- Tratar o diff como rascunho: revisar manualmente policies de RLS, triggers, functions (especialmente `SECURITY DEFINER` e seu `search_path`), grants, e dados de seed (`atividade_templates`, `grupo_templates`) que um diff de schema puro não captura.
- Antes de escrever a correção de recursão RLS, confirmar com uma query read-only em produção que o bug (42P17) realmente ocorre lá — hoje é uma suposição baseada no dev, nunca verificada contra as policies reais.
- Restaurar o fallback legado em `handle_new_user()` para aceitar `setor` string única (usuários criados manualmente pelo painel do Supabase), perdido durante a migração para `setores` array.

Organizar o resultado em três fases, cada uma numa migration própria dentro de `supabase/migrations/prod/`:

- **Fase aditiva:** tudo que só cria/adiciona — tabelas novas, `setores` adicionada mantendo `setor`, colunas novas com default. Não quebra o app antigo rodando durante o deploy.
- **Fase de correção pontual:** RLS recursion fix reescrito contra as policies reais confirmadas de produção; restauração do fallback do `handle_new_user()`. Trocas de RLS sempre dentro de uma única transação; `DISABLE ROW LEVEL SECURITY` proibido em qualquer etapa do runbook.
- **Fase de limpeza:** remoção de `profiles.setor` (e qualquer outra coluna substituída) — só depois de confirmar estabilidade das fases anteriores e do código novo (que lê `setores` com fallback para `setor`) já estar publicado e sem deployments antigos vivos na Vercel.

**Auditoria obrigatória de retrocompatibilidade (cada statement da fase de correção):** entre a migration aplicada e o deploy novo publicado (seção 5), o código velho ainda em produção continua rodando contra o schema já alterado — essa janela não é instantânea (build do Vercel leva minutos e pode falhar). Cada alteração da fase de correção precisa ser classificada explicitamente como "segura sob código velho" (ex: criar uma function nova, corrigir uma policy sem mudar a forma que o código velho já consulta) ou "exige código novo" (ex: `NOT NULL`, rename, mudança de tipo, trigger que muda comportamento observável). Qualquer item do segundo grupo é adiado para depois do deploy novo — não entra na fase de correção como está hoje.

O princípio de retrocompatibilidade adotado aqui é **o schema ser aditivo/retrocompatível** (colunas antigas mantidas até a limpeza), não o código ler os dois formatos — dual-read no código dobraria o esforço de teste sem necessidade, já que o próprio schema em fases já resolve o problema.

### 3. Rollback em camadas

Não é "restaurar tudo" como único mecanismo — cada fase tem sua própria estratégia de reversão, do mais barato para o mais custoso:

- **Fase aditiva:** reverte com `DROP` do que foi criado — sem perder dados gravados depois do rollout, porque nada existente foi alterado.
- **Fase de correção:** a definição original de cada policy/function alterada é capturada e guardada antes da mudança; reversão é reaplicar a definição original — instantâneo, sem perda de dados.
- **Fase de limpeza:** sem reversão graciosa possível (coluna já foi removida) — único recurso é restaurar o clone completo (item 1) tirado antes do rollout real. Por isso essa fase só roda depois de tempo suficiente de confiança nas duas anteriores, e idealmente numa janela de manutenção/modo leitura anunciada. Um clone/dump completo imediatamente antes desta fase é etapa **obrigatória** do runbook, não opcional — é o único ponto do protocolo verdadeiramente irreversível, e produção está no plano Free (sem PITR).

**Nota sobre rollback de código (Vercel):** o "Instant Rollback" do Vercel reverte o código publicado em segundos, mas isso **reintroduz o código velho rodando contra o schema já alterado** — só é uma opção segura enquanto a fase de limpeza não tiver rodado. Depois da limpeza, reverter o código não resolve nada sozinho (o código anterior esperava a coluna que já foi removida); nesse ponto o único caminho é o restore completo acima.

### 4. Ensaio no projeto de teste

Tudo executado pelo usuário, com o assistente preparando cada comando/script previamente e revisando os resultados reportados:

1. Clone completo de produção → projeto de teste (item 1), com checklist de verificação rodado e resultado conferido antes de prosseguir.
2. Rollout fase por fase contra o projeto de teste — depois de cada fase, verificação objetiva (contagem de linhas, login como cada perfil: admin, mono-fiscal, multi-setor) além de navegação manual pelos fluxos principais.
3. **Verificação final contra o dev:** depois da última fase (limpeza) aplicada no clone de teste, gerar um novo diff entre o schema do clone já migrado e o schema atual de dev — esperado dar vazio (nenhuma diferença estrutural). O dev funciona aqui só como um checklist de conferência barato, não como fundação da abordagem — se o diff não vier vazio, é sinal de que alguma parte do diff original (passo 2 da Arquitetura) foi mal traduzida em migration.
4. Ensaio de rollback: restaurar o clone tirado no passo 1 e confirmar que o estado bate exatamente com o "antes" (mesmo checklist de verificação do item 1).
5. Descartar o projeto de teste assim que o ensaio completo (rollout + rollback) for validado.

### 5. Sincronização com `main` e deploy do código novo (etapa final acoplada ao rollout)

Esta etapa só acontece em produção real, depois que as fases aditiva e de correção já foram aplicadas com sucesso no banco de produção — nunca antes, e nunca no projeto de teste (o teste não tem deploy Vercel associado).

- **Verificar o escopo das variáveis de ambiente no Vercel antes de qualquer coisa:** confirmar que as credenciais do Supabase de produção estão marcadas só para o ambiente "Production", não herdadas por "Preview" — senão qualquer push na branch já conversaria com o banco real de forma não intencional.
- **Build validado antes do dia D:** rodar o build localmente (ou um preview deployment da própria branch) com as variáveis de ambiente de produção, para pegar erros de build que só aparecem nesse contexto — um build que falha no merge deixa produção travada no código velho contra o schema novo, por tempo indefinido.
- **Promoção manual em vez de depender só do merge disparar o deploy:** preferir publicar via "Promote to Production" de um preview deployment já buildado e verificado, em vez de confiar cegamente que merge→build→deploy vai correr bem sem supervisão. Isso desacopla "merge no git" de "publicar de fato" e permite abortar se o build falhar.
- **Branch protection no GitHub:** exigir PR (mesmo que aprovado pelo próprio usuário) para merges em `main`, evitando um merge acidental fora da sequência do runbook.
- Só depois do deploy novo confirmado estável em produção (ver gate objetivo abaixo) é que a fase de limpeza (remoção de `profiles.setor`) pode rodar.

**Gate técnico entre deploy e limpeza (salvaguarda, não só checklist):** a migration da fase de limpeza começa com uma verificação que aborta a execução se um marcador explícito de "deploy novo validado em produção" não existir (ex: uma linha de controle gravada manualmente pelo usuário só depois de confirmar o deploy estável) — transformando "não rodar a limpeza cedo demais" de uma regra de disciplina em uma trava técnica real.

### 6. Entregável final

Runbook (documento separado, produzido ao final desta iniciativa) com:
- Comandos exatos para cada etapa (clone, diff, cada fase de migration, cada verificação, cada tipo de rollback, deploy/promoção do Vercel).
- Checklist de verificação objetiva em cada checkpoint, incluindo os gates técnicos descritos acima.
- Ponto de não-retorno de cada fase (a partir de onde só resta rollback via restore completo).
- Quem executa cada etapa e janela de manutenção/modo leitura sugerida para as fases de correção, deploy e limpeza.

## Testando

Não há testes automatizados aplicáveis a este protocolo — a validação é o próprio ensaio de ponta a ponta (item 4) rodado pelo usuário no projeto de teste, com os critérios objetivos de verificação definidos acima em cada checkpoint.
