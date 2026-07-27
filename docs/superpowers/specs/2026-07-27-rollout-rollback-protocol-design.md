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
1. Procedimento de clone completo de produção → projeto de teste (schema, dados, Storage, `auth.users`), com checklist de verificação objetiva.
2. Preparação do conjunto de migrations "prontas para produção", derivado por diff real entre produção e dev, organizado em fases seguras.
3. Runbook de rollout em fases, com verificação objetiva entre cada fase.
4. Runbook de rollback em camadas (reversão granular por fase + restore completo como último recurso).
5. Execução do ensaio completo (clone → rollout → rollback) no projeto de teste, feita pelo usuário com o assistente preparando cada comando e revisando os resultados.
6. Runbook final, pronto para ser seguido no dia da promoção real em produção.

Fora do escopo (explicitamente adiado, não tratar como pendência desta spec):
- A promoção real em produção em si — esta spec cobre o protocolo e seu ensaio, não a execução contra produção.
- Sincronizar `feat/motor-tarefas-setor` com `main` (decisão anterior do usuário: não fazer agora).
- Societário e Financeiro (decisão anterior do usuário: só depois).

## Arquitetura do protocolo

### 1. Clone completo produção → teste

O `pg_dump` padrão do schema `public` não é suficiente: não move Storage (arquivos de `client_files` e outros buckets) nem necessariamente o schema `auth` de forma restaurável. O clone precisa cobrir três frentes separadamente:

- **Banco Postgres completo:** dump via connection string direta de produção, cobrindo os schemas `public`, `auth` e as tabelas de metadata de `storage`, restaurado no projeto de teste.
- **Arquivos de Storage:** script dedicado (via Storage API do Supabase) que lista cada bucket e objeto em produção e copia para o projeto de teste — o dump do Postgres move só os metadados (`storage.objects`), não os arquivos físicos.
- **Inventário de configuração:** extensões do Postgres habilitadas, triggers/functions existentes, providers/templates de Auth relevantes — conferidos manualmente como parte do checklist, não assumidos como "vieram junto".

**Verificação obrigatória pós-clone** (critério objetivo, não "parece que funcionou"):
- Contagem de linhas de **todas** as tabelas de todos os schemas relevantes batendo produção↔teste.
- Contagem de arquivos e tamanho total por bucket de Storage batendo.
- Login funcional no projeto de teste com um usuário real copiado, confirmando que `auth.users` foi restaurado corretamente.

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

### 3. Rollback em camadas

Não é "restaurar tudo" como único mecanismo — cada fase tem sua própria estratégia de reversão, do mais barato para o mais custoso:

- **Fase aditiva:** reverte com `DROP` do que foi criado — sem perder dados gravados depois do rollout, porque nada existente foi alterado.
- **Fase de correção:** a definição original de cada policy/function alterada é capturada e guardada antes da mudança; reversão é reaplicar a definição original — instantâneo, sem perda de dados.
- **Fase de limpeza:** sem reversão graciosa possível (coluna já foi removida) — único recurso é restaurar o clone completo (item 1) tirado antes do rollout real. Por isso essa fase só roda depois de tempo suficiente de confiança nas duas anteriores, e idealmente numa janela de manutenção/modo leitura anunciada.

### 4. Ensaio no projeto de teste

Tudo executado pelo usuário, com o assistente preparando cada comando/script previamente e revisando os resultados reportados:

1. Clone completo de produção → projeto de teste (item 1), com checklist de verificação rodado e resultado conferido antes de prosseguir.
2. Rollout fase por fase contra o projeto de teste — depois de cada fase, verificação objetiva (contagem de linhas, login como cada perfil: admin, mono-fiscal, multi-setor) além de navegação manual pelos fluxos principais.
3. Ensaio de rollback: restaurar o clone tirado no passo 1 e confirmar que o estado bate exatamente com o "antes" (mesmo checklist de verificação do item 1).
4. Descartar o projeto de teste assim que o ensaio completo (rollout + rollback) for validado.

### 5. Entregável final

Runbook (documento separado, produzido ao final desta iniciativa) com:
- Comandos exatos para cada etapa (clone, diff, cada fase de migration, cada verificação, cada tipo de rollback).
- Checklist de verificação objetiva em cada checkpoint.
- Ponto de não-retorno de cada fase (a partir de onde só resta rollback via restore completo).
- Quem executa cada etapa e janela de manutenção/modo leitura sugerida para as fases de correção e limpeza.

## Testando

Não há testes automatizados aplicáveis a este protocolo — a validação é o próprio ensaio de ponta a ponta (item 4) rodado pelo usuário no projeto de teste, com os critérios objetivos de verificação definidos acima em cada checkpoint.
