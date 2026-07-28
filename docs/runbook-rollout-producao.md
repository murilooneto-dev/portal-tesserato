# Runbook: Promoção de produção (rollout/rollback)

> **Rode todos os comandos deste documento no Git Bash, nunca no PowerShell
> nativo ou no `cmd.exe`.** A sintaxe usada aqui (`VAR=valor comando`,
> continuação de linha com `\`, JSON multi-linha entre aspas simples) é
> Bash — em PowerShell nativo ela falha ou faz algo diferente do esperado,
> silenciosamente em alguns casos. Antes de começar, confirme que está no
> shell certo:
> ```bash
> echo $BASH_VERSION
> ```
> Isso precisa imprimir um número de versão (ex: `5.2.21(1)-release`). Se
> vier vazio ou der erro, você está no PowerShell/cmd — abra um terminal
> Git Bash e comece de novo.

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
npx supabase db dump --db-url "$SOURCE_DB_URL" --data-only --schema public --file dump-dados.sql
psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f dump-schema.sql
psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f dump-dados.sql
```

**Atenção ao `--schema public` no segundo comando — não é opcional.**
`supabase db dump` **sem `--data-only`** (dump de schema) exclui os schemas
`auth` e `storage` por padrão, mas o dump **`--data-only`** (dados) tem uma
lista de exclusão diferente e menor — sem `--schema public`, ele traz junto
os dados reais de `auth`/`storage` (senhas, e-mails de usuários reais).
Storage e usuários de teste são tratados separadamente abaixo (1.3 e 1.4) de
propósito — não copiar `auth`/`storage` de verdade aqui é o que garante que
nenhuma credencial real de produção vai parar no projeto de teste
descartável (confirmado rodando `npx supabase db dump --data-only --dry-run`
com e sem `--schema public` e comparando as listas de `--exclude-schema`
geradas).

O comando com `--schema public` continua incluindo `SET
session_replication_role = replica;` no início do dump (visível no
`--dry-run`) — isso desliga a checagem de foreign keys durante a
restauração, então `profiles.id` (que referencia `auth.users`, ainda vazio
neste ponto) é restaurado sem erro mesmo com `auth.users` vazio. Não é
preciso nenhum passo extra para isso — já vem de graça no dump gerado pela
CLI.

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
read-only).

**Atenção — a trigger `on_auth_user_created` vai colidir com a chave
primária de `profiles` para estes 3 usuários.** Os UUIDs escolhidos já têm
uma linha em `public.profiles` restaurada no passo 1.2. A trigger
`handle_new_user()` roda automaticamente a cada `insert` em `auth.users` e
tenta inserir uma linha em `profiles` sem `ON CONFLICT` — como a linha para
esses UUIDs já existe, a trigger colide com a chave primária de `profiles`
e a criação do usuário falha (o mesmo padrão de bug documentado no
`CHANGELOG.md`, v0.6.2). Como o perfil já existe (com os dados reais
restaurados), a trigger não precisa fazer nada para esses 3 usuários.

**Não tente desabilitar a trigger diretamente** (`alter table auth.users
disable trigger ...`) — `auth.users` pertence à role `supabase_auth_admin`,
não à role `postgres` que você usa para conectar (confirmado testando
contra o dev: `ALTER TABLE auth.users ...` retorna `must be owner of table
users`, mesmo com a connection string de superusuário aparente do
Supabase). O contorno é redefinir temporariamente a própria function
`handle_new_user()` — essa você é dona (foi criada pelas migrations do
projeto, rodadas como `postgres`) — para tolerar o conflito, rodar o
script, e devolver a definição original em seguida:
```bash
# 1. Capturar a definição atual de handle_new_user() no projeto de teste
#    (é a que veio do clone de produção em 1.2 — 1.4 roda antes de
#    qualquer fase de migration em 1.8, então ainda não é a versão do dev).
#    O "|| ';'" garante um arquivo .sql válido por si só (pg_get_functiondef
#    não inclui o ; final):
psql "$TARGET_DB_URL" -At -c "select pg_get_functiondef('public.handle_new_user()'::regprocedure) || ';';" > handle_new_user-original.sql

# 2. Copiar para handle_new_user-idempotente.sql e editar manualmente — a
#    única mudança é no bloco final do corpo da function. Localize:
#
#      );
#      return new;
#
#    (o "  );" fecha o "insert into public.profiles (...) values (...)")
#    e troque por:
#
#      )
#      on conflict (id) do nothing;
#      return new;
#
#    Depois aplicar:
cp handle_new_user-original.sql handle_new_user-idempotente.sql
# edite handle_new_user-idempotente.sql manualmente (bloco acima), então:
psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f handle_new_user-idempotente.sql

# 3. Rodar a criação dos usuários de teste normalmente:
TARGET_SUPABASE_URL=... TARGET_SERVICE_ROLE_KEY=... \
npx tsx scripts/rollout/criar-usuarios-teste.ts '[
  {"id":"<uuid-admin>","email":"teste-admin@tesserato.local","senha":"..."},
  {"id":"<uuid-mono-fiscal>","email":"teste-fiscal@tesserato.local","senha":"..."},
  {"id":"<uuid-multi-setor>","email":"teste-multi@tesserato.local","senha":"..."}
]'

# 4. Restaurar a definição original capturada no passo 1 — obrigatório,
#    não pular: a versão idempotente esconde colisões reais de PK em
#    usuários que não deveriam colidir.
psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f handle_new_user-original.sql

# 5. Confirmar que a restauração foi exata — não pressupor que o passo 4
#    funcionou só porque não imprimiu erro:
psql "$TARGET_DB_URL" -At -c "select pg_get_functiondef('public.handle_new_user()'::regprocedure) || ';';" > handle_new_user-restaurada.sql
diff handle_new_user-original.sql handle_new_user-restaurada.sql
```
O `diff` do passo 5 precisa vir **vazio**. Qualquer saída ali significa que
a versão idempotente (ou outra coisa) ainda está em vigor — pare e
investigue antes de seguir para 1.5, porque essa falha ficaria invisível no
checklist de login (que só confirma que o usuário existe e enxerga seus
dados, não qual versão de `handle_new_user()` está ativa).

Conferir também a saída do script em si: ele agora encerra com código de
saída 1 (e uma linha final de aviso) se qualquer usuário falhar — não trate
um batch com falhas reportadas como sucesso só porque o processo
"terminou".

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
npx supabase db dump --db-url "$TARGET_DB_URL" --data-only --schema public --file backup-antes-rollout-dados.sql
```
Mesmo motivo do `--schema public` em 1.2: sem ele, este dump traria também os
3 usuários de teste (schema `auth`) e os arquivos de Storage já copiados
(schema `storage`). Isso não é sensível aqui (são dados de teste, não reais),
mas quebraria a restauração em 1.10 — o restore ali só recria o schema
`public` (`drop schema public cascade`), então tentar reinserir linhas de
`auth.users`/`storage.objects` que ainda existem no projeto de teste bateria
em violação de chave primária.

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
   coluna substituída). O **primeiro statement do arquivo**, antes de
   qualquer `drop column`/`drop table`, precisa ser:
   ```sql
   select exigir_marco('deploy_novo_validado');
   ```
   (função definida em `scripts/rollout/registrar-marco.sql` — aplicar esse
   arquivo uma vez no banco alvo antes de rodar `003_limpeza.sql`, se ainda
   não aplicado). `exigir_marco` aborta a migration inteira com exceção se
   o marco não existir — é uma trava real, não só uma checagem de prosa.
   **Ponto de não-retorno: sim.** Depois desta fase não existe reversão
   graciosa — coluna já foi removida. O único recurso é restaurar o clone
   completo tirado antes do rollout real (1.6, ou o equivalente da Parte 2).
   Por isso ela só roda depois de tempo suficiente de confiança nas duas
   fases anteriores, e idealmente numa janela de manutenção/modo leitura.

### 1.8. Aplicar as três fases no projeto de teste (incluindo limpeza)
```bash
psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f supabase/migrations/prod/001_aditiva.sql
# navegar no app local apontando pro teste, checklist de perfis
psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f supabase/migrations/prod/002_correcao.sql
# navegar de novo
```

O projeto de teste não tem deploy Vercel de verdade para gerar o marco
`deploy_novo_validado` — simule esse gate manualmente, exatamente como você
vai confirmar de verdade em produção depois do "Promote to Production"
(Parte 2, item 3):
```bash
psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f scripts/rollout/registrar-marco.sql
```

**Teste negativo do gate — não pular.** Antes de registrar o marco, confirme
que `003_limpeza.sql` realmente aborta sem ele (prova que a trava funciona
de verdade, não só "acredito que funciona"):
```bash
psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f supabase/migrations/prod/003_limpeza.sql
```
Esperado: erro do `exigir_marco` ("Marco... não encontrado"), a transação
inteira faz rollback. Confirme que a coluna não foi removida:
```bash
psql "$TARGET_DB_URL" -c "select column_name from information_schema.columns where table_name = 'profiles' and column_name = 'setor';"
```
Esperado: uma linha (a coluna `setor` ainda existe). Só depois de ver esse
erro e essa confirmação é que o gate está provado, não só suposto — agora
registre o marco de verdade e aplique a limpeza:
```bash
psql "$TARGET_DB_URL" -c "select registrar_marco('deploy_novo_validado');"
```

Só então aplicar a fase de limpeza — o ensaio precisa exercitar de verdade a
migration `003_limpeza.sql` e o gate do marco (que ela consulta) antes do
projeto de teste ser descartado, senão a parte mais irreversível do
protocolo nunca teria sido validada:
```bash
psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f supabase/migrations/prod/003_limpeza.sql
# navegar mais uma vez, checklist de perfis
```

### 1.9. Verificação final contra o dev (depois das três fases, incluindo limpeza)
```bash
npx supabase db dump --db-url "$TARGET_DB_URL" --file schema-teste-pos-rollout.sql
diff schema-teste-pos-rollout.sql schema-dev.sql
```
Esperado: vazio (ou só diferenças esperadas, ex: a tabela `_rollout_controle`
que não existe no dev). Se houver qualquer outra diferença, alguma parte do
diff do passo 1.7 foi mal traduzida em migration — corrigir antes de seguir.

### 1.10a. Rollback granular (fases aditiva e de correção) — referência para uso na Parte 2
Isto é o que você usaria numa promoção real se precisasse abortar **antes**
da fase de limpeza — não faz parte da sequência linear deste ensaio (que em
1.8 já aplicou as três fases, incluindo a limpeza, propositalmente). É mais
barato que o restore completo para as duas primeiras fases:
- **Fase aditiva:** `DROP` de cada objeto criado em `001_aditiva.sql` (na
  ordem inversa de criação, respeitando FKs) — não perde dado gravado
  depois do rollout, porque nada existente foi alterado.
- **Fase de correção:** reaplicar a definição original de cada
  policy/function capturada no passo 1.7 (item 2) antes da mudança —
  instantâneo, sem perda de dado.

A fase de limpeza não tem equivalente aqui — uma vez rodada (como já
aconteceu neste ensaio, em 1.8), só o restore completo (1.10) resolve. Por
isso, se quiser exercitar esses dois comandos na prática (não só documentá-los),
faça isso antes de registrar o marco em 1.8: logo depois de validar
`002_correcao.sql`, teste o `DROP`/reaplicação de definição, confirme que
volta ao estado pré-correção, reaplique `001_aditiva.sql` + `002_correcao.sql`
de novo, e só então prossiga para o marco e a limpeza.

### 1.10. Ensaiar o rollback completo (restore)
```bash
psql "$TARGET_DB_URL" -c "drop schema public cascade; create schema public;"
psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f backup-antes-rollout.sql
psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f backup-antes-rollout-dados.sql
```

**Recriar a trigger `on_auth_user_created` — não pular.** `drop schema
public cascade` derruba não só as tabelas do `public`, mas qualquer objeto
dependente delas, incluindo a trigger `on_auth_user_created` (vive em
`auth.users`, mas chama `public.handle_new_user()` — a dependência a torna
alvo do `cascade`). O restore acima recria `public.handle_new_user()` (veio
no dump de schema), mas **não** recria a trigger em si, porque `auth.users`
está fora do dump por design (1.2/1.6 excluem `auth`). Sem este passo, o
projeto restaurado fica silenciosamente incapaz de criar o perfil de novos
usuários — um jeito confuso de descobrir isso depois. Recriar manualmente:
```bash
psql "$TARGET_DB_URL" -c "create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();"
psql "$TARGET_DB_URL" -c "select tgname, tgrelid::regclass, tgenabled from pg_trigger where tgname = 'on_auth_user_created';"
```
A segunda linha precisa devolver uma linha (`on_auth_user_created`). Se vier
vazia, a trigger não foi recriada — repita antes de considerar o restore
concluído.

Rodar `verificar-paridade.ts` de novo para confirmar que voltou exatamente
ao estado anterior — mas note o que o script realmente compara: ele conecta
em duas connection strings (`SOURCE_DB_URL`/`TARGET_DB_URL`) e conta linhas
ao vivo, não lê arquivos `.sql` de dump. Nesta rehearsal isso funciona porque
você aponta `SOURCE_DB_URL` para **outro clone intocado do estado
pré-rollout** (não o projeto de dev — dev tem um dataset completamente
diferente do de produção, comparar contra ele só produz uma parede de
`DIF` sem sinal útil nenhum; precisa ser um segundo banco parado
exatamente no estado anterior ao rollout, não o próprio `TARGET_DB_URL`,
que é o projeto de teste que você acabou de sobrescrever com o restore) e
`TARGET_DB_URL` para o projeto de teste recém-restaurado. Esse truque só é
seguro num ambiente descartável com um segundo banco parado no tempo para
comparar; **não é um substituto genérico plugável na Parte 2** — em
produção real não existe um segundo banco "antes" ao vivo para apontar (só
o arquivo de backup em disco), então o equivalente lá é comparar
manualmente contagens do backup restaurado localmente, não rodar este
script contra produção.

**Nota sobre `_rollout_controle`:** se em algum momento você rodar
`verificar-paridade.ts` comparando o clone pré-rollout (1.6, antes das três
fases) contra o projeto de teste logo depois de 1.8 (que já rodou a fase de
limpeza e portanto já criou `_rollout_controle`) — antes de restaurar em
1.10 — é esperado um `DIF` isolado nessa única tabela, porque ela só existe
do lado que já passou pela limpeza. Não é uma falha real; só reflita que,
depois do restore completo abaixo, essa tabela deixa de existir dos dois
lados de novo (o restore volta ao estado anterior à limpeza) e a paridade
volta a fechar sem exceção.

### 1.11. Descartar o projeto de teste
Apagar o projeto no painel do Supabase assim que 1.9 e 1.10 estiverem
validados.

## Parte 2 — Promoção real (só depois da Parte 1 validada)

**Isto NÃO é "repetir 1.2–1.9 contra produção".** Produção é o `SOURCE`, não
o `TARGET` — não existe um segundo projeto para onde clonar dessa vez. Vários
passos da Parte 1 existem só para montar o projeto de teste descartável e
**não se aplicam aqui**. Aplique exatamente esta lista, passo a passo da
Parte 1 por passo da Parte 1:

- **1.1 (criar projeto de teste) — não se aplica.** Produção já existe.
- **1.2 (clonar schema para o target) — não se aplica.** Não há um projeto
  separado para restaurar o dump de produção "dentro" — produção já é a
  origem. Rodar `psql -v ON_ERROR_STOP=1 --single-transaction "$TARGET_DB_URL" -f dump-schema.sql` aqui recriaria
  os mesmos objetos sobre eles mesmos (erro de objeto duplicado, na melhor
  das hipóteses).
- **1.3 (copiar Storage) — não se aplica.** Copiaria os buckets de produção
  para eles mesmos; inofensivo mas inútil, e não é isso que este passo faz
  de verdade — não rodar.
- **1.4 (criar usuários de teste) — nunca se aplica em produção, em nenhuma
  hipótese.** Este script cria `auth.users` fixando o `id` para bater com
  UUIDs reais — rodá-lo contra o `TARGET_SUPABASE_URL` de produção real
  colidiria com a primary key de usuários reais existentes. Esse passo
  existe exclusivamente para o projeto de teste descartável (Parte 1). O
  `auth.users` real de produção nunca é tocado por este protocolo, nem no
  ensaio nem na promoção real.
- **1.5 (verificar paridade) — não se aplica.** Não há um par origem/destino
  separado para comparar nesta etapa; a verificação relevante aqui é a 1.9
  (diff estrutural contra dev), listada abaixo.
- **1.6 (backup) — aplica-se, e é obrigatório aqui.** É o único mecanismo de
  rollback real (produção está no plano Free, sem PITR). Esse mesmo clone
  completo é o backup usado no restore da fase de limpeza e deve ser tirado
  imediatamente antes do rollout real, exatamente como foi ensaiado na
  Parte 1 — não uma versão simplificada. Ver item 1 abaixo.
- **1.7 (gerar diff e migrations) — aplica-se, mas como reaproveitamento, não
  regeneração.** As três migrations (`001_aditiva.sql`, `002_correcao.sql`,
  `003_limpeza.sql`) já foram produzidas e revisadas na Parte 1 — são as
  mesmas que você já ensaiou. Rodar o diff de novo aqui serve só para
  confirmar que produção não mudou desde o ensaio (nenhuma migration nova
  deveria aparecer); se aparecer algo novo, pare e reavalie antes de seguir.
- **1.8 (aplicar as fases) — aplica-se: é o rollout real em si**, seguindo a
  mesma sequência fase a fase + gate já validada na Parte 1, com as
  diferenças detalhadas no item 3 abaixo (o marco não é mais simulado — ele
  depende do deploy real do Vercel).
- **1.9 (verificação final contra o dev) — aplica-se**, como o mesmo
  checklist objetivo pós-rollout.
- **1.10 / 1.10a (rollback) — servem como referência caso algo dê errado**,
  não como passo a executar na sequência feliz. Ver item 5 abaixo.
- **1.11 (descartar o projeto) — não se aplica.** Produção não é descartável.

Diferenças e passos adicionais específicos da promoção real:

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
     psql -v ON_ERROR_STOP=1 --single-transaction "$SOURCE_DB_URL" -f scripts/rollout/registrar-marco.sql
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
   **O mesmo procedimento de 1.10 se aplica aqui, incluindo o passo que
   costuma ser esquecido:** `drop schema public cascade` derruba a trigger
   `on_auth_user_created` (dependente de `public.handle_new_user()`) e o
   restore do backup não a recria (o dump de backup exclui `auth` por
   design, igual em 1.2/1.6). Depois de restaurar o backup desta Parte 2,
   recriar a trigger manualmente e confirmar antes de considerar a
   recuperação concluída:
   ```bash
   psql "$SOURCE_DB_URL" -c "create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();"
   psql "$SOURCE_DB_URL" -c "select tgname, tgrelid::regclass, tgenabled from pg_trigger where tgname = 'on_auth_user_created';"
   ```
   Sem isso, produção volta a funcionar aparentemente normal, mas para de
   criar o perfil de qualquer usuário novo — um jeito ruim de descobrir o
   problema, bem depois do incidente que motivou o restore.

**Limpeza final (opcional, depois de tudo confirmado estável):**
`_rollout_controle`, `registrar_marco()` e `exigir_marco()` ficam em
produção depois de uma promoção bem-sucedida — não têm mais função depois
que a fase de limpeza já rodou, e vão aparecer como diferença permanente em
qualquer diff futuro contra o dev (a menos que você também aplique
`scripts/rollout/registrar-marco.sql` no dev, o que não é o objetivo dele).
Uma vez com a promoção confirmada estável, é seguro rodar em produção:
```sql
drop table if exists _rollout_controle;
drop function if exists registrar_marco(text);
drop function if exists exigir_marco(text);
```
