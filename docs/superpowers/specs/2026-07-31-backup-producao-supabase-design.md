# Rotina automática de backup do banco de produção (Supabase)

Data: 2026-07-31

## Objetivo

Ter um backup completo e recorrente do banco Postgres de **produção** (projeto Supabase `qilwxzpxkjzbfrwlbydt`), rodando sozinho sem depender de nenhuma máquina ligada, com histórico suficiente pra recuperar dados em caso de erro humano, bug de migration, ou incidente.

## Escopo

- Banco: produção apenas (`qilwxzpxkjzbfrwlbydt`). Dev não é coberto por esta rotina.
- Backup completo: schema + dados, via `pg_dump`.
- Execução: GitHub Actions, em um repositório **novo e dedicado** (`tesserato-backups`, privado), não no `portal-tesserato`. Motivo: isola o secret do banco de produção dos outros secrets/workflows que já existem no repo do app (deploy, Vercel, etc.), e deixa esse repo pronto pra virar o lugar central de backup de outros bancos (Fiscal, Societário, Financeiro) conforme os outros setores do portal multi-setor forem saindo do papel — sem misturar infraestrutura de ops com histórico de features de produto.
- Armazenamento: artifacts do próprio workflow do GitHub Actions.
- Restauração: **fora de escopo** de implementação — só documentada em texto, execução é manual e sob decisão humana (operação potencialmente destrutiva).

Este documento é criado no repo `portal-tesserato` (onde a conversa começou), mas o conteúdo final passa a residir também no repo `tesserato-backups` assim que ele for criado, junto com o workflow.

## Componentes

### 0. Repositório `tesserato-backups`

- Repositório novo no GitHub, privado, sob a mesma conta/organização do `portal-tesserato`.
- Conteúdo mínimo: `.github/workflows/backup-db.yml` e uma cópia deste design doc (ou um README curto explicando a rotina).
- Criação do repositório é uma ação em sistema externo (GitHub) — feita com confirmação explícita do usuário antes de executar, não silenciosamente durante a implementação.

### 1. Workflow `.github/workflows/backup-db.yml`

Triggers:
- `schedule`: cron `0 21 * * 5` (toda sexta-feira, 21:00 UTC = 18:00 horário de Brasília). Editável a qualquer momento mudando essa única linha do YAML — não existe um campo de configuração em runtime, o "ajustável" aqui significa "uma linha simples de editar", não um parâmetro dinâmico.
- `workflow_dispatch`: permite disparar manualmente pela aba Actions do GitHub, pra tirar um backup avulso quando quiser (ex.: antes de rodar uma migration arriscada em produção).

Job (`ubuntu-latest`):
1. Checkout do repo (não é estritamente necessário pro dump em si, mas mantém o padrão de workflow do GitHub Actions).
2. Instala `postgresql-client` (pra ter o `pg_dump` na versão compatível — Supabase roda Postgres 15/17 dependendo do projeto; usar a imagem padrão do runner ou instalar a versão via apt costuma ser suficiente, mas se houver erro de versão incompatível, o fix é instalar o client version-pinned).
3. Roda `pg_dump -Fc --no-owner --no-privileges "$PROD_SUPABASE_DB_URL" -f backup-producao-<data>.dump`, onde `<data>` é `YYYY-MM-DD` do dia da execução.
   - Formato `-Fc` (custom, comprimido) permite restore seletivo com `pg_restore` e é menor que `.sql` puro.
   - `--no-owner --no-privileges` evita erros de restore em outro ambiente onde os roles não existem exatamente iguais.
4. Falha o job (`exit 1` implícito do `pg_dump` com `set -e`) se o dump vier vazio ou o comando falhar — o GitHub já marca o workflow como falho e notifica por e-mail pela configuração padrão da conta.
5. Upload do arquivo via `actions/upload-artifact@v4`, `retention-days: 90`.

### 2. Secret `PROD_SUPABASE_DB_URL`

- Connection string **direta** (porta 5432, não a pooled 6543) do Postgres de produção, pega em Supabase → Project Settings → Database → Connection string.
- Cadastrado pelo usuário diretamente no GitHub: repo `tesserato-backups` → Settings → Secrets and variables → Actions → New repository secret, nome exato `PROD_SUPABASE_DB_URL`.
- Esse cadastro não é feito pelo assistente — envolve credencial de banco de produção.

### 3. Nome do arquivo

`backup-producao-YYYY-MM-DD.dump`, gerado a partir da data de execução do workflow (UTC do runner).

## Erros e observabilidade

- Falha de `pg_dump` (rede, credencial inválida, etc.) → job falha → GitHub Actions marca run como vermelho e envia notificação por e-mail (comportamento padrão da conta GitHub, nenhuma configuração extra necessária).
- Sem retry automático: se falhar, fica pro próximo agendamento (sexta seguinte) ou disparo manual.

## Fora de escopo

- Restauração automatizada (`pg_restore` documentado em texto no `README` do workflow ou no topo do próprio YAML como comentário, mas execução é sempre manual).
- Backup do banco de dev.
- Armazenamento externo (S3, Supabase Storage, etc.) — pode virar uma segunda spec no futuro se os 90 dias de artifact não forem suficientes.
- Alertas customizados além do e-mail padrão do GitHub.
