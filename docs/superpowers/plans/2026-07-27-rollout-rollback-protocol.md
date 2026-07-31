# Protocolo de Rollout/Rollback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir as ferramentas (scripts) e o runbook que o usuário vai executar pessoalmente para clonar produção → projeto de teste, ensaiar o rollout das migrations em fases, ensaiar o rollback, e depois seguir o mesmo roteiro em produção real.

**Architecture:** Scripts standalone em `scripts/rollout/`, sem dependência do resto do app Next.js (rodam com `npx tsx`, mesmo padrão dos scripts existentes em `scripts/`). Cada script é parametrizado por variáveis de ambiente (nunca hardcoded) apontando para dois projetos Supabase (origem/destino) por vez. O entregável final é `docs/runbook-rollout-producao.md`, um documento com os comandos exatos na ordem certa, remetendo a esses scripts.

**Tech Stack:** TypeScript + `tsx` (já usado no repo), `@supabase/supabase-js` (já é dependência), `pg` (nova devDependency, para queries diretas via connection string — necessário para contar linhas em todas as tabelas do schema `public` e para o mecanismo de gate), Supabase CLI via `npx supabase` (já disponível, v2.109.1 confirmada).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-27-rollout-rollback-protocol-design.md`.
- O assistente nunca executa comandos contra o projeto de teste ou produção real — só contra o projeto de **dev** (`fcpcorqquovvgtoukxry`, credenciais em `.env.development.local`) para validar que os scripts funcionam, e apenas leitura/dados de teste descartáveis.
- Nenhum script deve hardcodear URLs, connection strings ou chaves — tudo via variáveis de ambiente, seguindo `scripts/rollout/.env.example`.
- Nenhum dado real de produção é copiado nesta fase de implementação — os scripts são construídos e testados contra dev; a execução real do ensaio (clonar produção de verdade) é feita pelo usuário depois, seguindo o runbook.
- Ambiente Windows/PowerShell + Git Bash — comandos no runbook devem funcionar em ambos ou indicar a alternativa.
- Sem framework de testes automatizados neste repo (confirmado: `package.json` não tem `test` script nem jest/vitest) — "testar" cada task aqui significa rodar o script de verdade contra o projeto de dev e conferir o resultado manualmente, seguindo o padrão já usado no resto do repo.

---

### Task 1: Dependência `pg` + template de ambiente + mecanismo de gate

**Files:**
- Modify: `package.json` (adicionar `pg` e `@types/pg` em `devDependencies`)
- Create: `scripts/rollout/.env.example`
- Create: `scripts/rollout/registrar-marco.sql`
- Create: `scripts/rollout/testar-marco.ts` (script de verificação manual, apagado depois de validar — não faz parte do runbook final)

**Interfaces:**
- Produces: tabela `_rollout_controle(etapa text primary key, concluido_em timestamptz)` e função `registrar_marco(p_etapa text) returns void` — usadas por qualquer migration de fase que precise checar um marco antes de rodar (referenciado no runbook, Task 5).

- [ ] **Step 1: Instalar `pg`**

```bash
npm install --save-dev pg @types/pg
```

- [ ] **Step 2: Criar o template de variáveis de ambiente**

Criar `scripts/rollout/.env.example`:

```bash
# Origem (produção) — usado só para leitura/dump, nunca para escrita
SOURCE_DB_URL=postgresql://postgres:SENHA@db.qilwxzpxkjzbfrwlbydt.supabase.co:5432/postgres
SOURCE_SUPABASE_URL=https://qilwxzpxkjzbfrwlbydt.supabase.co
SOURCE_SERVICE_ROLE_KEY=

# Destino (projeto de teste descartável, criado antes do ensaio)
TARGET_DB_URL=postgresql://postgres:SENHA@db.SEU-PROJETO-TESTE.supabase.co:5432/postgres
TARGET_SUPABASE_URL=https://SEU-PROJETO-TESTE.supabase.co
TARGET_SERVICE_ROLE_KEY=
```

- [ ] **Step 3: Criar o SQL do mecanismo de gate**

Criar `scripts/rollout/registrar-marco.sql`:

```sql
-- Tabela de controle do protocolo de rollout/rollback — usada para travar
-- fases que dependem de uma confirmação manual (ex: "deploy novo já está
-- estável em produção") em vez de depender só de disciplina/checklist.
create table if not exists _rollout_controle (
  etapa text primary key,
  concluido_em timestamptz not null default now()
);

create or replace function registrar_marco(p_etapa text)
returns void
language sql
as $$
  insert into _rollout_controle (etapa) values (p_etapa)
  on conflict (etapa) do nothing;
$$;

-- Uso em uma migration de fase que deve abortar sem o marco:
--
--   do $$ begin
--     if not exists (
--       select 1 from _rollout_controle where etapa = 'deploy_novo_validado'
--     ) then
--       raise exception 'Marco "deploy_novo_validado" não encontrado — rode '
--         'select registrar_marco(''deploy_novo_validado''); manualmente após '
--         'confirmar o deploy novo estável em produção, antes desta fase.';
--     end if;
--   end $$;
```

- [ ] **Step 4: Criar o script de verificação manual (temporário)**

Criar `scripts/rollout/testar-marco.ts`:

```typescript
import { Client } from 'pg'
import 'dotenv/config'

async function main() {
  const dbUrl = process.env.TEST_DB_URL
  if (!dbUrl) {
    console.error('Defina TEST_DB_URL antes de rodar (aponte para o dev).')
    process.exit(1)
  }

  const client = new Client({ connectionString: dbUrl })
  await client.connect()

  const sql = await (await import('node:fs/promises')).readFile(
    'scripts/rollout/registrar-marco.sql',
    'utf-8',
  )
  await client.query(sql)

  const antes = await client.query(
    `select exists(select 1 from _rollout_controle where etapa = 'teste_manual') as existe`,
  )
  console.log('Marco existe antes de registrar?', antes.rows[0].existe)

  await client.query(`select registrar_marco('teste_manual')`)

  const depois = await client.query(
    `select exists(select 1 from _rollout_controle where etapa = 'teste_manual') as existe`,
  )
  console.log('Marco existe depois de registrar?', depois.rows[0].existe)

  await client.query(`delete from _rollout_controle where etapa = 'teste_manual'`)
  await client.query(`drop function if exists registrar_marco(text)`)
  await client.query(`drop table if exists _rollout_controle`)
  console.log('Limpeza feita — tabela/função de teste removidas do dev.')

  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 5: Rodar contra o dev para validar**

Pegar a connection string direta do projeto de dev (perguntar ao usuário a senha do banco de dev se não estiver disponível — não fica armazenada em nenhum arquivo) e rodar:

```bash
TEST_DB_URL="postgresql://postgres:SENHA_DEV@db.fcpcorqquovvgtoukxry.supabase.co:5432/postgres" npx tsx scripts/rollout/testar-marco.ts
```

Expected:
```
Marco existe antes de registrar? false
Marco existe depois de registrar? true
Limpeza feita — tabela/função de teste removidas do dev.
```

- [ ] **Step 6: Apagar o script temporário de teste**

```bash
rm scripts/rollout/testar-marco.ts
```

(Ele existiu só para provar que o SQL do Step 3 funciona; o runbook final referencia `registrar-marco.sql` diretamente.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/rollout/.env.example scripts/rollout/registrar-marco.sql
git commit -m "chore: add rollout gate mechanism and env template"
```

---

### Task 2: Criação de usuários de teste com UUID fixo

**Files:**
- Create: `scripts/rollout/criar-usuarios-teste.ts`

**Interfaces:**
- Consumes: `TARGET_SUPABASE_URL`, `TARGET_SERVICE_ROLE_KEY` (de `scripts/rollout/.env.example`).
- Produces: usuários em `auth.users` do projeto de destino com `id` (UUID) igual ao informado, usável pelo runbook (Task 5) para logar como cada perfil (admin/mono-fiscal/multi-setor) durante o ensaio.

- [ ] **Step 1: Escrever o script**

Criar `scripts/rollout/criar-usuarios-teste.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

type UsuarioTeste = {
  id: string
  email: string
  senha: string
}

async function criarUsuariosTeste(usuarios: UsuarioTeste[]) {
  const url = process.env.TARGET_SUPABASE_URL
  const serviceRoleKey = process.env.TARGET_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Defina TARGET_SUPABASE_URL e TARGET_SERVICE_ROLE_KEY antes de rodar.')
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (const usuario of usuarios) {
    const { data, error } = await admin.auth.admin.createUser({
      id: usuario.id,
      email: usuario.email,
      password: usuario.senha,
      email_confirm: true,
    })

    if (error) {
      console.error(`Falha ao criar ${usuario.email} (id ${usuario.id}):`, error.message)
      continue
    }

    console.log(`Criado: ${usuario.email} — id ${data.user.id}`)
  }
}

const usuarios: UsuarioTeste[] = JSON.parse(process.argv[2] ?? '[]')

if (usuarios.length === 0) {
  console.error(
    'Uso: npx tsx scripts/rollout/criar-usuarios-teste.ts \'[{"id":"UUID","email":"...","senha":"..."}]\'',
  )
  process.exit(1)
}

criarUsuariosTeste(usuarios).catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Rodar contra o dev para validar (com um UUID novo, não um real)**

```bash
TARGET_SUPABASE_URL="https://fcpcorqquovvgtoukxry.supabase.co" \
TARGET_SERVICE_ROLE_KEY="<a service role key do dev, de .env.development.local>" \
npx tsx scripts/rollout/criar-usuarios-teste.ts '[{"id":"11111111-1111-1111-1111-111111111111","email":"teste-rollout@tesserato.local","senha":"SenhaTeste123!"}]'
```

Expected:
```
Criado: teste-rollout@tesserato.local — id 11111111-1111-1111-1111-111111111111
```

- [ ] **Step 3: Confirmar e limpar no painel do Supabase (dev)**

Confirmar no painel do projeto de dev (Authentication → Users) que o usuário `teste-rollout@tesserato.local` foi criado com o UUID esperado, depois apagá-lo manualmente pelo painel (não faz parte do dev de verdade).

- [ ] **Step 4: Commit**

```bash
git add scripts/rollout/criar-usuarios-teste.ts
git commit -m "feat: add test-user creation script for rollout rehearsal"
```

---

### Task 3: Script de cópia de Storage

**Files:**
- Create: `scripts/rollout/copiar-storage.ts`

**Interfaces:**
- Consumes: `SOURCE_SUPABASE_URL`, `SOURCE_SERVICE_ROLE_KEY`, `TARGET_SUPABASE_URL`, `TARGET_SERVICE_ROLE_KEY`.
- Produces: cópia de todos os buckets/objetos de origem para destino; usado pelo runbook (Task 5) na etapa de clone.

- [ ] **Step 1: Escrever o script**

Criar `scripts/rollout/copiar-storage.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

function clienteDe(url: string, key: string) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function listarTodosObjetos(
  storage: ReturnType<typeof clienteDe>['storage'],
  bucket: string,
  prefixo = '',
): Promise<string[]> {
  const { data, error } = await storage.from(bucket).list(prefixo, { limit: 1000 })
  if (error) throw new Error(`Falha ao listar "${bucket}/${prefixo}": ${error.message}`)

  const caminhos: string[] = []
  for (const item of data ?? []) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
    if (item.id === null) {
      // pasta — desce recursivamente
      caminhos.push(...(await listarTodosObjetos(storage, bucket, caminho)))
    } else {
      caminhos.push(caminho)
    }
  }
  return caminhos
}

async function copiarStorage(dryRun: boolean) {
  const sourceUrl = process.env.SOURCE_SUPABASE_URL
  const sourceKey = process.env.SOURCE_SERVICE_ROLE_KEY
  const targetUrl = process.env.TARGET_SUPABASE_URL
  const targetKey = process.env.TARGET_SERVICE_ROLE_KEY
  if (!sourceUrl || !sourceKey || !targetUrl || !targetKey) {
    throw new Error(
      'Defina SOURCE_SUPABASE_URL, SOURCE_SERVICE_ROLE_KEY, TARGET_SUPABASE_URL e TARGET_SERVICE_ROLE_KEY.',
    )
  }

  const origem = clienteDe(sourceUrl, sourceKey)
  const destino = clienteDe(targetUrl, targetKey)

  const { data: buckets, error: erroBuckets } = await origem.storage.listBuckets()
  if (erroBuckets) throw new Error(`Falha ao listar buckets: ${erroBuckets.message}`)

  for (const bucket of buckets ?? []) {
    console.log(`\n=== Bucket: ${bucket.name} ===`)

    if (!dryRun) {
      const { error: erroCriar } = await destino.storage.createBucket(bucket.name, {
        public: bucket.public,
      })
      if (erroCriar && !erroCriar.message.includes('already exists')) {
        throw new Error(`Falha ao criar bucket "${bucket.name}" no destino: ${erroCriar.message}`)
      }
    }

    const objetos = await listarTodosObjetos(origem.storage, bucket.name)
    console.log(`${objetos.length} objeto(s) encontrado(s).`)

    if (dryRun) {
      for (const caminho of objetos) console.log(`  [dry-run] copiaria: ${caminho}`)
      continue
    }

    for (const caminho of objetos) {
      const { data: arquivo, error: erroDownload } = await origem.storage
        .from(bucket.name)
        .download(caminho)
      if (erroDownload) {
        console.error(`  Falha ao baixar "${caminho}": ${erroDownload.message}`)
        continue
      }

      const { error: erroUpload } = await destino.storage
        .from(bucket.name)
        .upload(caminho, arquivo, { upsert: true })
      if (erroUpload) {
        console.error(`  Falha ao subir "${caminho}": ${erroUpload.message}`)
        continue
      }

      console.log(`  copiado: ${caminho}`)
    }
  }
}

const dryRun = process.argv.includes('--dry-run')
copiarStorage(dryRun).catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Rodar em `--dry-run` contra o dev (origem e destino iguais, só pra validar a listagem)**

```bash
SOURCE_SUPABASE_URL="https://fcpcorqquovvgtoukxry.supabase.co" \
SOURCE_SERVICE_ROLE_KEY="<service role key do dev>" \
TARGET_SUPABASE_URL="https://fcpcorqquovvgtoukxry.supabase.co" \
TARGET_SERVICE_ROLE_KEY="<service role key do dev>" \
npx tsx scripts/rollout/copiar-storage.ts --dry-run
```

Expected: lista cada bucket existente no dev e, para cada um, `[dry-run] copiaria: <caminho>` para cada objeto real encontrado — sem nenhum erro de listagem. Conferir que a contagem de objetos bate com o que aparece no painel do Supabase (Storage) do dev.

- [ ] **Step 3: Commit**

```bash
git add scripts/rollout/copiar-storage.ts
git commit -m "feat: add storage bucket copy script for rollout rehearsal"
```

---

### Task 4: Script de verificação de paridade (linhas + arquivos)

**Files:**
- Create: `scripts/rollout/verificar-paridade.ts`

**Interfaces:**
- Consumes: `SOURCE_DB_URL`, `TARGET_DB_URL`, `SOURCE_SUPABASE_URL`, `SOURCE_SERVICE_ROLE_KEY`, `TARGET_SUPABASE_URL`, `TARGET_SERVICE_ROLE_KEY`.
- Produces: relatório impresso no terminal; `process.exit(1)` se alguma tabela ou bucket não bater — usado pelo runbook (Task 5) como o critério objetivo de verificação pós-clone e pós-rollback.

- [ ] **Step 1: Escrever o script**

Criar `scripts/rollout/verificar-paridade.ts`:

```typescript
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

async function contarLinhasPorTabela(dbUrl: string): Promise<Map<string, number>> {
  const client = new Client({ connectionString: dbUrl })
  await client.connect()

  const { rows: tabelas } = await client.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  )

  const contagens = new Map<string, number>()
  for (const { tablename } of tabelas) {
    const { rows } = await client.query(`select count(*)::int as total from "${tablename}"`)
    contagens.set(tablename, rows[0].total)
  }

  await client.end()
  return contagens
}

async function contarArquivosPorBucket(
  url: string,
  key: string,
): Promise<Map<string, { arquivos: number; bytes: number }>> {
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`Falha ao listar buckets: ${error.message}`)

  const resultado = new Map<string, { arquivos: number; bytes: number }>()
  for (const bucket of buckets ?? []) {
    const { data: objetos, error: erroList } = await supabase.storage
      .from(bucket.name)
      .list(undefined, { limit: 10000 })
    if (erroList) throw new Error(`Falha ao listar "${bucket.name}": ${erroList.message}`)

    const arquivos = (objetos ?? []).filter((o) => o.id !== null)
    const bytes = arquivos.reduce((soma, o) => soma + (o.metadata?.size ?? 0), 0)
    resultado.set(bucket.name, { arquivos: arquivos.length, bytes })
  }
  return resultado
}

async function main() {
  const sourceDbUrl = process.env.SOURCE_DB_URL
  const targetDbUrl = process.env.TARGET_DB_URL
  const sourceUrl = process.env.SOURCE_SUPABASE_URL
  const sourceKey = process.env.SOURCE_SERVICE_ROLE_KEY
  const targetUrl = process.env.TARGET_SUPABASE_URL
  const targetKey = process.env.TARGET_SERVICE_ROLE_KEY

  if (!sourceDbUrl || !targetDbUrl || !sourceUrl || !sourceKey || !targetUrl || !targetKey) {
    throw new Error(
      'Defina SOURCE_DB_URL, TARGET_DB_URL, SOURCE_SUPABASE_URL, SOURCE_SERVICE_ROLE_KEY, TARGET_SUPABASE_URL, TARGET_SERVICE_ROLE_KEY.',
    )
  }

  console.log('=== Contando linhas por tabela (schema public) ===')
  const linhasOrigem = await contarLinhasPorTabela(sourceDbUrl)
  const linhasDestino = await contarLinhasPorTabela(targetDbUrl)

  let tudoOk = true
  const todasTabelas = new Set([...linhasOrigem.keys(), ...linhasDestino.keys()])
  for (const tabela of [...todasTabelas].sort()) {
    const origem = linhasOrigem.get(tabela) ?? 0
    const destino = linhasDestino.get(tabela) ?? 0
    const bate = origem === destino
    if (!bate) tudoOk = false
    console.log(`  ${bate ? 'OK ' : 'DIF'} ${tabela}: origem=${origem} destino=${destino}`)
  }

  console.log('\n=== Contando arquivos por bucket de Storage ===')
  const storageOrigem = await contarArquivosPorBucket(sourceUrl, sourceKey)
  const storageDestino = await contarArquivosPorBucket(targetUrl, targetKey)

  const todosBuckets = new Set([...storageOrigem.keys(), ...storageDestino.keys()])
  for (const bucket of [...todosBuckets].sort()) {
    const origem = storageOrigem.get(bucket) ?? { arquivos: 0, bytes: 0 }
    const destino = storageDestino.get(bucket) ?? { arquivos: 0, bytes: 0 }
    const bate = origem.arquivos === destino.arquivos && origem.bytes === destino.bytes
    if (!bate) tudoOk = false
    console.log(
      `  ${bate ? 'OK ' : 'DIF'} ${bucket}: origem=${origem.arquivos} arquivos/${origem.bytes} bytes ` +
        `destino=${destino.arquivos} arquivos/${destino.bytes} bytes`,
    )
  }

  console.log(tudoOk ? '\nParidade confirmada.' : '\nDIVERGÊNCIAS ENCONTRADAS — não prosseguir.')
  process.exit(tudoOk ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Rodar contra o dev, origem e destino iguais (deve dar tudo `OK`)**

```bash
SOURCE_DB_URL="postgresql://postgres:SENHA_DEV@db.fcpcorqquovvgtoukxry.supabase.co:5432/postgres" \
TARGET_DB_URL="postgresql://postgres:SENHA_DEV@db.fcpcorqquovvgtoukxry.supabase.co:5432/postgres" \
SOURCE_SUPABASE_URL="https://fcpcorqquovvgtoukxry.supabase.co" \
SOURCE_SERVICE_ROLE_KEY="<service role key do dev>" \
TARGET_SUPABASE_URL="https://fcpcorqquovvgtoukxry.supabase.co" \
TARGET_SERVICE_ROLE_KEY="<service role key do dev>" \
npx tsx scripts/rollout/verificar-paridade.ts
```

Expected: toda tabela e todo bucket marcados `OK` (origem e destino são o mesmo banco), terminando em `Paridade confirmada.` e exit code 0.

- [ ] **Step 3: Confirmar que o script detecta divergência (teste negativo)**

Inserir temporariamente uma linha extra numa tabela pequena e sem RLS restritiva do dev (ex: `app_settings`, se existir, ou qualquer tabela de catálogo), rodar de novo, confirmar que aparece `DIF` para essa tabela e o exit code é 1. Depois desfazer a inserção (`delete` da linha criada).

- [ ] **Step 4: Commit**

```bash
git add scripts/rollout/verificar-paridade.ts
git commit -m "feat: add row/file parity verification script for rollout rehearsal"
```

---

### Task 5: Runbook final

**Files:**
- Create: `docs/runbook-rollout-producao.md`

**Interfaces:**
- Consumes: os 4 scripts das Tasks 1–4 (`registrar-marco.sql`, `criar-usuarios-teste.ts`, `copiar-storage.ts`, `verificar-paridade.ts`) e as decisões da spec `docs/superpowers/specs/2026-07-27-rollout-rollback-protocol-design.md`.
- Produces: documento final que o usuário segue passo a passo para executar o ensaio completo e, depois, a promoção real.

- [ ] **Step 1: Escrever o runbook**

Criar `docs/runbook-rollout-producao.md` com esta estrutura (conteúdo completo, sem placeholders):

```markdown
# Runbook: Promoção de produção (rollout/rollback)

Referência: `docs/superpowers/specs/2026-07-27-rollout-rollback-protocol-design.md`.
Você executa todos os comandos abaixo pessoalmente — este documento só reúne
a ordem certa e o que cada comando faz.

## Parte 1 — Ensaio no projeto de teste

### 1.1. Criar o projeto de teste
No painel do Supabase, criar um novo projeto (plano Free, mesma região dos
outros). Guardar a connection string do Postgres e as chaves (anon +
service_role) — vão em `TARGET_*` no seu `.env` local (copie de
`scripts/rollout/.env.example`, nunca commite).

### 1.2. Clonar o schema `public` de produção para o teste
```bash
npx supabase db dump --db-url "$SOURCE_DB_URL" --file dump-schema.sql
npx supabase db dump --db-url "$SOURCE_DB_URL" --data-only --file dump-dados.sql
psql "$TARGET_DB_URL" -f dump-schema.sql
psql "$TARGET_DB_URL" -f dump-dados.sql
```

### 1.3. Copiar os arquivos de Storage
```bash
SOURCE_SUPABASE_URL=... SOURCE_SERVICE_ROLE_KEY=... \
TARGET_SUPABASE_URL=... TARGET_SERVICE_ROLE_KEY=... \
npx tsx scripts/rollout/copiar-storage.ts
```

### 1.4. Criar os usuários de teste
Escolher 3 UUIDs reais de produção (um admin, um mono-fiscal, um
multi-setor — consultar `select id, email from auth.users` em produção,
read-only) e rodar:
```bash
TARGET_SUPABASE_URL=... TARGET_SERVICE_ROLE_KEY=... \
npx tsx scripts/rollout/criar-usuarios-teste.ts '[
  {"id":"<uuid-admin>","email":"teste-admin@tesserato.local","senha":"..."},
  {"id":"<uuid-mono-fiscal>","email":"teste-fiscal@tesserato.local","senha":"..."},
  {"id":"<uuid-multi-setor>","email":"teste-multi@tesserato.local","senha":"..."}
]'
```

### 1.5. Verificar paridade pós-clone
```bash
SOURCE_DB_URL=... TARGET_DB_URL=... \
SOURCE_SUPABASE_URL=... SOURCE_SERVICE_ROLE_KEY=... \
TARGET_SUPABASE_URL=... TARGET_SERVICE_ROLE_KEY=... \
npx tsx scripts/rollout/verificar-paridade.ts
```
Só prosseguir se terminar em "Paridade confirmada."

### 1.6. Tirar o backup de referência (usado no ensaio de rollback)
```bash
npx supabase db dump --db-url "$TARGET_DB_URL" --file backup-antes-rollout.sql
npx supabase db dump --db-url "$TARGET_DB_URL" --data-only --file backup-antes-rollout-dados.sql
```

### 1.7. Gerar o diff real entre produção e dev
```bash
npx supabase db dump --db-url "$SOURCE_DB_URL" --file schema-producao.sql
npx supabase db dump --db-url "$DEV_DB_URL" --file schema-dev.sql
diff schema-producao.sql schema-dev.sql > diff-bruto.txt
```
Revisar `diff-bruto.txt` manualmente — não aplicar direto. Separar em três
migrations dentro de `supabase/migrations/prod/`: aditiva, correção pontual
(RLS + fallback `handle_new_user`, confirmando antes com uma query
read-only em produção que o bug de recursão 42P17 realmente ocorre lá),
limpeza. A fase de limpeza deve começar aplicando `registrar-marco.sql`
uma vez (se ainda não aplicado) e checar o marco `deploy_novo_validado`
antes de rodar qualquer `drop column`/`drop table`.

### 1.8. Aplicar as fases no projeto de teste
```bash
psql "$TARGET_DB_URL" -f supabase/migrations/prod/001_aditiva.sql
# navegar no app local apontando pro teste, checklist de perfis
psql "$TARGET_DB_URL" -f supabase/migrations/prod/002_correcao.sql
# navegar de novo
# (a fase de limpeza só roda depois da Parte 2 — deploy real — mesmo aqui no teste,
#  para ensaiar a sequência completa exatamente como vai acontecer de verdade)
```

### 1.9. Verificação final contra o dev
```bash
npx supabase db dump --db-url "$TARGET_DB_URL" --file schema-teste-pos-rollout.sql
diff schema-teste-pos-rollout.sql schema-dev.sql
```
Esperado: vazio (ou só diferenças esperadas, ex: a tabela `_rollout_controle`
que não existe no dev). Se houver qualquer outra diferença, alguma parte do
diff do passo 1.7 foi mal traduzida em migration — corrigir antes de seguir.

### 1.10. Ensaiar o rollback
```bash
psql "$TARGET_DB_URL" -c "drop schema public cascade; create schema public;"
psql "$TARGET_DB_URL" -f backup-antes-rollout.sql
psql "$TARGET_DB_URL" -f backup-antes-rollout-dados.sql
```
Rodar `verificar-paridade.ts` de novo (contra o backup original) para
confirmar que voltou exatamente ao estado anterior.

### 1.11. Descartar o projeto de teste
Apagar o projeto no painel do Supabase assim que 1.9 e 1.10 estiverem
validados.

## Parte 2 — Promoção real (só depois da Parte 1 validada)

Repetir 1.2–1.9 contra produção real, com estas diferenças:

1. O passo 1.6 (backup) é **obrigatório e não opcional** aqui — é o único
   mecanismo de rollback real (produção está no plano Free, sem PITR).
2. Depois da fase de correção (equivalente ao 1.8, fase 002) aplicada com
   sucesso em produção:
   - Verificar no painel do Vercel que as variáveis de ambiente de
     produção do Supabase estão marcadas só para "Production", não
     herdadas por "Preview".
   - Rodar `npm run build` localmente com as env vars de produção, ou
     conferir que o preview deployment da branch buildou sem erro.
   - Publicar via "Promote to Production" no painel do Vercel (não só
     confiar no merge disparando o deploy sozinho).
   - Confirmar o deploy novo estável (navegar no site real, checklist de
     perfis) e só então rodar:
     ```bash
     psql "$SOURCE_DB_URL" -f scripts/rollout/registrar-marco.sql
     psql "$SOURCE_DB_URL" -c "select registrar_marco('deploy_novo_validado');"
     ```
3. Só depois do marco registrado, aplicar a fase de limpeza
   (`003_limpeza.sql`) em produção.
4. Se algo der errado a qualquer momento antes da fase de limpeza: usar o
   "Instant Rollback" do Vercel para o código, sem mexer no banco — o
   código anterior ainda é compatível com o schema (fases aditiva/correção
   são retrocompatíveis por design). Se algo der errado **depois** da
   limpeza: restaurar o backup do passo 1 desta Parte 2 (único recurso).
```

- [ ] **Step 2: Self-review do runbook**

Reler o documento inteiro comparando com a spec (`docs/superpowers/specs/2026-07-27-rollout-rollback-protocol-design.md`) seção por seção — clone, migrations em fases, rollback em camadas, sincronização com `main`, gate técnico. Confirmar que cada item da Arquitetura da spec tem um passo correspondente no runbook. Corrigir qualquer lacuna encontrada diretamente no arquivo.

- [ ] **Step 3: Commit**

```bash
git add docs/runbook-rollout-producao.md
git commit -m "docs: add step-by-step rollout/rollback runbook"
```
