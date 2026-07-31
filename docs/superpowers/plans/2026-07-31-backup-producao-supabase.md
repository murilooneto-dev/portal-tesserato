# Backup Automático do Banco de Produção Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ter um workflow do GitHub Actions, num repositório dedicado (`tesserato-backups`), que roda `pg_dump` toda sexta 18h (horário de Brasília) contra o banco Postgres de produção do Supabase e guarda o dump como artifact por 90 dias, com opção de disparo manual a qualquer momento.

**Architecture:** Repositório `tesserato-backups` (já criado, vazio, em `https://github.com/murilooneto-dev/tesserato-backups.git`) recebe um único workflow (`.github/workflows/backup-db.yml`) e um README com instruções de setup do secret e de restauração. Nenhum código de aplicação — só a automação de backup.

**Tech Stack:** GitHub Actions (`ubuntu-latest`), `pg_dump` (cliente PostgreSQL oficial via repositório apt.postgresql.org), `actions/upload-artifact@v4`.

## Global Constraints

- Cron: `0 21 * * 5` (sexta-feira 21:00 UTC = 18:00 horário de Brasília) — spec: [2026-07-31-backup-producao-supabase-design.md](../specs/2026-07-31-backup-producao-supabase-design.md)
- Trigger adicional: `workflow_dispatch` (disparo manual)
- Formato do dump: `pg_dump -Fc --no-owner --no-privileges`
- Nome do arquivo: `backup-producao-YYYY-MM-DD.dump`
- Artifact retention: 90 dias
- Secret esperado pelo workflow: `PROD_SUPABASE_DB_URL` (connection string do **Session pooler** — ver correção pós-execução na seção "Correções descobertas em execução real" da spec; a conexão direta porta 5432 não funciona a partir do GitHub Actions, só IPv6)
- Repositório de destino: `https://github.com/murilooneto-dev/tesserato-backups.git` (privado, já existe vazio)
- Push para o remote requer confirmação explícita do usuário a cada vez (não é automático)
- Cadastro do secret no GitHub é feito pelo usuário, não pelo assistente

---

## File Structure

- `tesserato-backups/.github/workflows/backup-db.yml` — o workflow de backup (único arquivo de automação)
- `tesserato-backups/README.md` — o que o repo faz, como cadastrar o secret, como restaurar um dump, como disparar manualmente

## Task 1: Clonar o repositório e criar o README

**Files:**
- Create: `D:\DEV\Site Tesserato + Fiscal\tesserato-backups\README.md`

**Interfaces:**
- Produces: nenhuma interface de código — só o repositório local clonado, pronto para receber o workflow na Task 2.

- [ ] **Step 1: Clonar o repositório vazio**

Run:
```bash
cd "D:/DEV/Site Tesserato + Fiscal"
git clone https://github.com/murilooneto-dev/tesserato-backups.git
```
Expected: diretório `tesserato-backups` criado, com aviso do git de "You appear to have cloned an empty repository" (esperado, repo está vazio).

- [ ] **Step 2: Criar o README**

Escrever em `D:\DEV\Site Tesserato + Fiscal\tesserato-backups\README.md`:

```markdown
# tesserato-backups

Backup automático do banco de produção (Supabase, projeto `qilwxzpxkjzbfrwlbydt`) via GitHub Actions.

## O que roda

`.github/workflows/backup-db.yml`:
- Toda sexta-feira às 18:00 (horário de Brasília), roda `pg_dump` completo (schema + dados) contra o banco de produção.
- Também pode ser disparado manualmente: aba **Actions** deste repo → **Backup do banco de produção** → **Run workflow**.
- O dump fica disponível como *artifact* do run (aba Actions → o run específico → seção Artifacts), guardado por 90 dias.

## Setup necessário (feito uma vez, manualmente)

1. No Supabase, pegue a connection string **direta** (porta 5432, não a pooled 6543) em: Project Settings → Database → Connection string.
2. Neste repositório no GitHub: Settings → Secrets and variables → Actions → New repository secret.
   - Nome: `PROD_SUPABASE_DB_URL`
   - Valor: a connection string do passo 1.

Sem esse secret cadastrado, o workflow falha ao tentar conectar.

## Como restaurar um backup

Os arquivos são gerados com `pg_dump -Fc` (formato custom, comprimido). Para restaurar:

```bash
pg_restore --no-owner --no-privileges -d "<connection-string-do-destino>" backup-producao-2026-07-31.dump
```

Restauração é sempre uma ação manual e deliberada — nunca é automatizada por este repositório. Tenha certeza do banco de destino (`-d`) antes de rodar: um restore aplicado no banco errado sobrescreve dados.
```

- [ ] **Step 3: Commit**

```bash
cd "D:/DEV/Site Tesserato + Fiscal/tesserato-backups"
git add README.md
git commit -m "docs: explica o repositório e o setup do secret de backup"
```

## Task 2: Criar o workflow de backup

**Files:**
- Create: `D:\DEV\Site Tesserato + Fiscal\tesserato-backups\.github\workflows\backup-db.yml`

**Interfaces:**
- Consumes: secret `PROD_SUPABASE_DB_URL` (definido pelo usuário na Task 4, mas referenciado aqui como `${{ secrets.PROD_SUPABASE_DB_URL }}`)
- Produces: artifact `backup-producao-<data>` contendo o arquivo `backup-producao-<data>.dump`

- [ ] **Step 1: Escrever o workflow**

Criar `D:\DEV\Site Tesserato + Fiscal\tesserato-backups\.github\workflows\backup-db.yml`:

```yaml
name: Backup do banco de produção

on:
  schedule:
    - cron: "0 21 * * 5"
  workflow_dispatch: {}

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Instalar pg_dump (PostgreSQL 17 client)
        run: |
          sudo apt-get update
          sudo apt-get install -y curl ca-certificates gnupg
          curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
          echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
          sudo apt-get update
          sudo apt-get install -y postgresql-client-17

      - name: Definir nome do arquivo
        id: filename
        run: echo "name=backup-producao-$(date -u +%Y-%m-%d).dump" >> "$GITHUB_OUTPUT"

      - name: Rodar pg_dump
        env:
          DB_URL: ${{ secrets.PROD_SUPABASE_DB_URL }}
        run: |
          pg_dump -Fc --no-owner --no-privileges "$DB_URL" -f "${{ steps.filename.outputs.name }}"
          test -s "${{ steps.filename.outputs.name }}"

      - name: Upload do artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ steps.filename.outputs.name }}
          path: ${{ steps.filename.outputs.name }}
          retention-days: 90
```

Notas de design embutidas no workflow:
- `test -s` no step do `pg_dump` falha o job explicitamente se o arquivo sair vazio (além do `pg_dump` já falhar sozinho em erro de conexão, por causa do `set -e` implícito do shell do GitHub Actions em cada `run` step).
- PostgreSQL 17 client é instalado via repositório oficial apt.postgresql.org porque o `postgresql-client` padrão do Ubuntu costuma ficar atrás da versão que o Supabase roda — cliente mais novo é compatível com servidor mais antigo, o inverso não necessariamente.

- [ ] **Step 2: Validar sintaxe YAML localmente**

Run:
```bash
cd "D:/DEV/Site Tesserato + Fiscal/tesserato-backups"
python -c "import yaml, sys; yaml.safe_load(open('.github/workflows/backup-db.yml'))" && echo "YAML válido"
```
Expected: `YAML válido` (usa o `python`/`yaml` já disponível no ambiente; se não houver PyYAML instalado, alternativa é abrir o arquivo e revisar indentação manualmente — não há necessidade de instalar dependência só para essa checagem).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/backup-db.yml
git commit -m "feat: adiciona workflow de backup semanal do banco de produção"
```

## Task 3: Push para o GitHub

**Files:** nenhum arquivo novo — só publica os commits das Tasks 1 e 2.

**Interfaces:** nenhuma.

- [ ] **Step 1: Confirmar com o usuário antes de publicar**

Pergunte ao usuário: "Posso dar `git push` no repositório `tesserato-backups` agora, publicando o README e o workflow?" — só prossiga com um "sim" explícito (push é uma ação que afeta estado compartilhado/visível, exige confirmação a cada vez, mesmo já tendo sido combinado no design).

- [ ] **Step 2: Push**

Run:
```bash
cd "D:/DEV/Site Tesserato + Fiscal/tesserato-backups"
git push -u origin main
```
Expected: push aceito, branch `main` publicada no GitHub.

## Task 4: Cadastro do secret e verificação end-to-end

**Files:** nenhum arquivo — passo operacional + verificação.

**Interfaces:** nenhuma.

- [ ] **Step 1: Pedir para o usuário cadastrar o secret**

Instruir o usuário a seguir as instruções do próprio README (`tesserato-backups/README.md`, seção "Setup necessário"): pegar a connection string direta no Supabase e cadastrar como secret `PROD_SUPABASE_DB_URL` no repo `tesserato-backups` no GitHub. Esse passo é manual porque envolve credencial de banco de produção — o assistente não deve manusear esse valor.

- [ ] **Step 2: Confirmar com o usuário que o secret foi cadastrado**

Aguardar confirmação explícita do usuário de que o secret está salvo antes de prosseguir para o disparo do workflow.

- [ ] **Step 3: Disparar o workflow manualmente e verificar o resultado**

Orientar o usuário (ou, se ele autorizar o uso do `gh` CLI autenticado na conta dele, disparar via `gh workflow run "Backup do banco de produção" --repo murilooneto-dev/tesserato-backups`) a rodar o workflow manualmente pela aba Actions → **Backup do banco de produção** → **Run workflow**.

Verificar:
- O run termina com status verde (sucesso).
- O artifact `backup-producao-<data-de-hoje>` aparece na página do run, com tamanho maior que zero.

Se o run falhar, ler o log do step que falhou (mensagens mais prováveis: erro de autenticação — secret errado ou ausente; erro de rede — connection string usando a porta pooled 6543 em vez da direta 5432) e corrigir antes de considerar a tarefa concluída.

---

## Self-Review

**Cobertura da spec:**
- Repo dedicado `tesserato-backups` → Task 1 (Componente 0 da spec).
- Workflow com cron sexta 18h BRT + `workflow_dispatch` → Task 2 (Componente 1).
- `pg_dump -Fc --no-owner --no-privileges`, nome `backup-producao-YYYY-MM-DD.dump` → Task 2 (Componentes 1 e 3).
- Secret `PROD_SUPABASE_DB_URL` cadastrado pelo usuário → Task 4 (Componente 2).
- Artifact com retenção de 90 dias → Task 2 (workflow, `retention-days: 90`).
- Falha visível em caso de erro → Task 2 (`test -s` + `set -e` do shell) e Task 4 Step 3 (verificação do run).
- Restauração documentada, não automatizada → README (Task 1).
- Push exigindo confirmação explícita → Task 3.

Nenhum requisito da spec ficou sem task correspondente.
