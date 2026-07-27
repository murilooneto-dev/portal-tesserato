# Runbook: Promoção de produção (rollout/rollback)

Referência: `docs/superpowers/specs/2026-07-27-rollout-rollback-protocol-design.md`.
Você executa todos os comandos abaixo pessoalmente — este documento só reúne
a ordem certa e o que cada comando faz.

Convenção usada abaixo: cada fase que tem um jeito barato de desfazer traz uma
linha "**Ponto de não-retorno:**" dizendo a partir de onde só resta o restore
completo (passo 1.6/backup). Fases de correção e de limpeza em produção real
são candidatas a rodar numa janela de manutenção com o app em modo leitura
(ou fora do horário de uso), especialmente a fase de limpeza — não é
obrigatório para o ensaio no projeto de teste, mas é recomendado para a
Parte 2.

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

`supabase db dump` exclui deliberadamente os schemas `auth` e `storage` do
dump por padrão (são gerenciados pela própria plataforma) — é isso mesmo que
queremos aqui, Storage e usuários são tratados separadamente abaixo (1.3 e
1.4).

**Inventário de configuração (manual, não assumir que "veio junto"):**
depois de restaurar o schema, conferir no projeto de teste, comparando com
produção:
- Extensões do Postgres habilitadas (`select * from pg_extension;`).
- Triggers existentes no schema `public` (`select tgname, tgrelid::regclass from pg_trigger where not tgisinternal;`).
- Functions existentes, especialmente as `SECURITY DEFINER` (`select proname, prosecdef from pg_proc join pg_namespace on pronamespace = pg_namespace.oid where nspname = 'public';`).

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
Só prosseguir se terminar em "Paridade confirmada." (contagem de linhas de
todas as tabelas do `public` e de arquivos/bytes por bucket de Storage
batendo entre origem e destino).

**Login funcional (não pular):** além da paridade de dados, logar de fato no
app apontando para o projeto de teste com cada um dos 3 usuários criados em
1.4 (admin, mono-fiscal, multi-setor) e confirmar que cada um enxerga seus
próprios dados — isso valida que as RLS policies reconhecem `auth.uid()`
contra `public.profiles` no clone, não só que os dados foram copiados.

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
Revisar `diff-bruto.txt` manualmente — não aplicar direto. Além das
diferenças de tabelas/colunas, revisar à mão (um diff de schema puro não
captura tudo isso corretamente):
- Policies de RLS, triggers, functions — em especial `SECURITY DEFINER` e o
  `search_path` de cada uma.
- Grants.
- Dados de seed (`atividade_templates`, `grupo_templates`) — comparar
  conteúdo, não só existência da tabela.

Separar o resultado em três migrations dentro de `supabase/migrations/prod/`:

1. **`001_aditiva.sql`** — tudo que só cria/adiciona (tabelas novas,
   `profiles.setores` adicionada mantendo `profiles.setor`, colunas novas
   com default). Não quebra o app antigo rodando durante o deploy.
   **Ponto de não-retorno:** nenhum — reverte com `DROP` do que foi criado,
   sem perder dado gravado depois (ver 1.10a).
2. **`002_correcao.sql`** — RLS recursion fix (confirmar antes com uma query
   read-only em produção que o bug 42P17 realmente ocorre lá — hoje é só
   suposição baseada no dev) e restauração do fallback legado em
   `handle_new_user()` para aceitar `setor` string única. Trocas de RLS
   sempre dentro de uma única transação; `DISABLE ROW LEVEL SECURITY`
   proibido em qualquer etapa deste runbook.

   **Auditoria de retrocompatibilidade obrigatória, statement a statement:**
   entre esta migration rodar e o deploy novo publicar (Parte 2, item 2), o
   código velho ainda em produção continua rodando contra o schema já
   alterado — essa janela não é instantânea. Classificar cada alteração
   como:
   - *Segura sob código velho* (ex: criar function nova, corrigir uma
     policy sem mudar a forma como o código velho já consulta) → pode
     entrar em `002_correcao.sql`.
   - *Exige código novo* (ex: `NOT NULL`, rename, mudança de tipo, trigger
     que muda comportamento observável) → **não entra** em
     `002_correcao.sql` como está hoje; adiar para depois do deploy novo
     confirmado (ou mover para a fase de limpeza, que já tem esse gate).

   **Ponto de não-retorno:** nenhum ainda — capturar a definição original de
   cada policy/function alterada (via `pg_get_ruledef`/`\d+`/exportar a
   definição atual antes de rodar) e guardar junto da migration, para
   reversão instantânea (ver 1.10a).
3. **`003_limpeza.sql`** — remoção de `profiles.setor` (e qualquer outra
   coluna substituída). Começa aplicando `registrar-marco.sql` uma vez (se
   ainda não aplicado) e checando o marco `deploy_novo_validado` antes de
   rodar qualquer `drop column`/`drop table`.
   **Ponto de não-retorno: sim.** Depois desta fase não existe reversão
   graciosa — coluna já foi removida. O único recurso é restaurar o clone
   completo tirado antes do rollout real (1.6, ou o equivalente da Parte 2).
   Por isso ela só roda depois de tempo suficiente de confiança nas duas
   fases anteriores, e idealmente numa janela de manutenção/modo leitura.

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

### 1.10a. Rollback granular (fases aditiva e de correção)
Antes de recorrer ao restore completo (1.10), o rollback em camadas é mais
barato para as duas primeiras fases:
- **Fase aditiva:** `DROP` de cada objeto criado em `001_aditiva.sql` (na
  ordem inversa de criação, respeitando FKs) — não perde dado gravado
  depois do rollout, porque nada existente foi alterado.
- **Fase de correção:** reaplicar a definição original de cada
  policy/function capturada no passo 1.7 (item 2) antes da mudança —
  instantâneo, sem perda de dado.

A fase de limpeza não tem equivalente aqui — uma vez rodada, só o restore
completo (1.10) resolve.

### 1.10. Ensaiar o rollback completo (restore)
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
   mecanismo de rollback real (produção está no plano Free, sem PITR). Esse
   mesmo clone completo é o backup usado no restore da fase de limpeza (ver
   1.10) e deve ser tirado imediatamente antes do rollout real, exatamente
   como foi ensaiado na Parte 1 — não uma versão simplificada.
2. **Branch protection no GitHub:** antes de mexer no código, confirmar (ou
   configurar) que `main` exige PR para merge — mesmo que aprovado pelo
   próprio usuário — evitando um merge acidental fora da sequência deste
   runbook (ex: código novo publicado antes das migrations de produção
   rodarem, o que quebraria o app imediatamente).
3. Depois da fase de correção (equivalente ao 1.8, fase 002) aplicada com
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
4. Só depois do marco registrado, aplicar a fase de limpeza
   (`003_limpeza.sql`) em produção. Considerar uma janela de manutenção com
   o app em modo leitura para esta fase — é o único ponto do protocolo sem
   rollback gracioso.
5. Se algo der errado a qualquer momento antes da fase de limpeza: usar o
   rollback granular (1.10a: `DROP` para a fase aditiva, reaplicar
   definição original para a fase de correção) ou, para o código, o
   "Instant Rollback" do Vercel, sem mexer no banco — o código anterior
   ainda é compatível com o schema (fases aditiva/correção são
   retrocompatíveis por design). Se algo der errado **depois** da limpeza:
   restaurar o backup do passo 1 desta Parte 2 (único recurso — reverter só
   o código não resolve, o código anterior esperava a coluna já removida).
