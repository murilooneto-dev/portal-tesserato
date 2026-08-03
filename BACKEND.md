# BACKEND.md — Autenticação da seção ADMIN (TES-3)

Implementação backend da feature de controle de acesso à seção ADMIN (Parâmetros e Vínculos), conforme `SPEC.md`/`ARCHITECTURE.md`/`DESIGN.md` aprovados na issue TES-3.

**Atualizado após a revisão de Segurança (REJECTED — 1 crítica + 2 altas).** Este documento já reflete a remediação, não a entrega original. Branch de remediação: `agent/backend-engineer/remediation-de6a41be` (a partir de `agent/frontend-engineer/55990627`, que por sua vez partiu de `agent/backend-engineer/de6a41be`). Ver `SECURITY_REPORT.md` (`agent/security-engineer/c31fbf25`) para o relatório completo e a seção **Correções de Segurança** abaixo para o que foi corrigido, o que foi deliberadamente deixado como está (e por quê), e o risco residual.

# Estrutura criada

```
supabase/migrations/019_admin_section_auth.sql   + admin_users, RPCs, RLS, seed
lib/rotas-admin.ts                               + ROTAS_ADMIN (fonte única)
lib/admin-auth/
  constants.ts                                   + parâmetros de sessão/lockout/senha
  session.ts                                      + sign/verify do JWT (Edge-safe, sem cookie I/O)
  server.ts                                        + getAdminSession/requireAdminSection/set-clear cookie
app/admin/bloqueio/actions.ts                     + Server Actions adminLogin/adminLogout/trocarSenhaInicial (~ remediação: chamam as RPCs via service_role)
app/fiscal/parametros/actions.ts                  ~ remediação: guarda de sessão ADMIN em todas as ~11 Server Actions + check de role em salvarComunicado/salvarConfiguracoes
app/(comum)/vinculos/actions.ts                   + remediação: criarVinculo/excluirVinculo (Server Actions guardadas, substituem escrita direta do browser)
app/(comum)/vinculos/VinculosClient.tsx            ~ remediação: usa as Server Actions acima em vez de lib/supabase/client direto
proxy.ts                                          ~ intercepta ROTAS_ADMIN
app/fiscal/parametros/page.tsx                    ~ requireAdminSection() antes das queries
app/(comum)/vinculos/page.tsx                     ~ requireAdminSection() antes das queries
app/admin/bloqueio/page.tsx                       ~ remediação: valida next com ehRotaAdmin() (fecha open redirect)
DEPLOY.md                                         ~ ADMIN_SESSION_SECRET + checklist
```

A UI (`app/admin/bloqueio/page.tsx`, `BloqueioForm.tsx`, `SairAdminButton.tsx`) foi implementada pelo Frontend Engineer (`agent/frontend-engineer/55990627`, ver `FRONTEND.md`); esta branch de remediação só toca nela para o fix de MED-1 (open redirect).

# Rotas implementadas

Nenhuma rota HTTP pública nova — tudo via Server Actions (chamadas internas do Next.js, sem REST exposto), conforme Arquitetura.

| Ação | Arquivo | Efeito |
|---|---|---|
| `adminLogin(username, senha)` | `app/admin/bloqueio/actions.ts` | Exige portal logado + `role='admin'` (defesa em profundidade); chama RPC `admin_login` **via `createAdminClient()` (service_role)**; em sucesso emite cookie `ts_admin`. Retorna `{ error }` (nunca lança para o cliente). |
| `adminLogout()` | idem | Limpa o cookie `ts_admin` e redireciona para `/admin/bloqueio`. Não afeta a sessão do portal. |
| `trocarSenhaInicial(senhaNova, senhaConfirmacao)` | idem | Valida confirmação e comprimento mínimo, chama RPC `admin_trocar_senha` **via `createAdminClient()` (service_role)** com o `id` da sessão atual (nunca de input do form), reemite o cookie com `mustChangePassword=false`. |
| `criarVinculo(input)` / `excluirVinculo(id)` | `app/(comum)/vinculos/actions.ts` (novo) | Exige `role='admin'` **e** sessão `ts_admin` válida antes de escrever em `tarefa_vinculos`. Substitui a escrita direta do browser que existia em `VinculosClient.tsx`. |
| ~11 Server Actions de Parâmetros | `app/fiscal/parametros/actions.ts` | Todas passaram a chamar `exigirSessaoAdmin()` (checa `ts_admin` válida) como primeira linha; `salvarComunicado`/`salvarConfiguracoes` também passaram a checar `role='admin'` (não checavam antes). |

**Por que via `service_role` e não mais via `authenticated`:** a Segurança apontou (CRIT-1) que `admin_login`/`admin_trocar_senha` tinham `grant execute ... to authenticated`, expondo-as em `/rest/v1/rpc/...` para qualquer colaborador logado com a anon key — e `admin_trocar_senha` não validava quem chamava, então um `p_id` arbitrário bastava para trocar a senha de qualquer `admin_users`. A migration `019` agora só concede essas RPCs a `service_role` (revoke explícito de `authenticated`/`anon`); as Server Actions continuam sendo o único chamador possível, e o gate de autorização (sessão do portal + `role='admin'`) e o gate de execução (quem pode chamar a RPC) ficam no mesmo lado — o servidor.

`proxy.ts` intercepta qualquer request cujo `pathname` esteja em `ROTAS_ADMIN` (`/fiscal/parametros`, `/vinculos`): exige `role='admin'` do portal e cookie `ts_admin` válido; sem sessão válida ou com `trocar_senha` pendente, redireciona para `/admin/bloqueio?next=<rota>` (com `&etapa=trocar-senha` no segundo caso). Em acesso válido, renova o cookie (sliding window de inatividade) na própria resposta.

# Modelos

`admin_users` (nova, `supabase/migrations/019_admin_section_auth.sql`):

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `username` | text unique | ex.: `ADMIN` |
| `senha_hash` | text | bcrypt via `pgcrypto` — nunca texto claro |
| `ativo` | boolean | permite revogar acesso sem apagar |
| `trocar_senha` | boolean | força troca no próximo login (semente = `true`) |
| `tentativas_falhas` | smallint | contador de força bruta |
| `bloqueado_ate` | timestamptz | lockout temporário |
| `ultimo_acesso_em` | timestamptz | — |
| `created_at` | timestamptz | — |

RLS habilitado, **sem** policy de select/insert/update para `anon`/`authenticated` — acesso só via as RPCs abaixo (`SECURITY DEFINER`, dono da função bypassa RLS) ou `service_role`.

# Serviços

RPCs `SECURITY DEFINER` (Postgres, `search_path = public` fixado):

- **`admin_login(p_username text, p_senha text) → table(status, id, username, trocar_senha)`** — `status` é `'ok' | 'invalid' | 'locked'`, nunca revela se o usuário existe (RN3). Bcrypt (`crypt`) comparado dentro do banco. Lockout de 15 min após 5 tentativas incorretas (contador por usuário); o contador agora **zera quando o lockout expira** (antes só zerava em login bem-sucedido — permitia manter o admin bloqueado indefinidamente, MED-2). No caminho "usuário não encontrado" paga um `crypt()` descartável, pra não vazar a existência do usuário por diferença de tempo de resposta (BAIXA-2). **Sem `grant` para `authenticated`/`anon`** — só chamável via `service_role` (CRIT-1).
- **`admin_trocar_senha(p_id uuid, p_senha_nova text) → boolean`** — aplica `crypt(..., gen_salt('bf'))`, zera `trocar_senha`. Rejeita senha com menos de 8 caracteres (`raise exception`, mesma regra do Server Action). **Sem `grant` para `authenticated`/`anon`** — só chamável via `service_role` (CRIT-1); antes disso, qualquer autenticado podia trocar a senha de qualquer `admin_users` só sabendo o `id`.
- **`admin_user_create(p_username text, p_senha text) → uuid`** e **`admin_user_set_ativo(p_id uuid, p_ativo boolean) → boolean`** — roadmap (tela de gestão de usuários, fora do escopo desta versão). Sem `grant` para `anon`/`authenticated`: só chamáveis via `service_role`/SQL direto, exatamente como a Arquitetura previu para cadastrar novos administradores até a UI existir.

Módulo de sessão (`lib/admin-auth/`):

- `session.ts` — `signAdminToken`/`verifyAdminToken` (JWT HS256 via `jose`, sem I/O de cookie, usável tanto no Edge (`proxy.ts`) quanto em Node). `verifyAdminToken` checa a assinatura/expiração (via `exp`, deslizante) e o teto de expiração absoluta (`loginAt` + 8h), que o `exp` sozinho não cobre.
- `server.ts` — superfície Node (`next/headers`): `getAdminSession()` (lê sem redirecionar), `requireAdminSection(nextPath?)` (guarda autoritativa — redireciona para `/admin/bloqueio` se não houver sessão válida ou se `trocar_senha` estiver pendente), `setAdminSessionCookie`/`clearAdminSessionCookie`.

# Middlewares

`proxy.ts` (Edge Runtime) — estendido, não substituído: mesmo padrão de interceptação por prefixo de setor já existente, com um bloco novo para `ehRotaAdmin(pathname)` (de `lib/rotas-admin.ts`) que roda **antes** do bloco de setor/página, checando `role='admin'` + cookie `ts_admin`. Só verifica assinatura/expiração do JWT — nenhuma query pesada nem bcrypt no Edge (isso fica só na RPC, disparada no login).

# Integrações

Nenhuma integração externa nova — apenas Postgres (Supabase) via RPC e o pacote `jose` (JWT Edge-safe), conforme Arquitetura.

# Migrations

- `supabase/migrations/019_admin_section_auth.sql` — cria `admin_users`, as 4 RPCs acima, RLS, grants e a semente `ADMIN` / `ADMIN@123PASSWORD` (`trocar_senha=true`). Idempotente na parte de dados (`on conflict (username) do nothing` na seed; `create table/function if not exists`/`create or replace` no resto). **Precisa ser aplicada manualmente no Supabase SQL Editor** (ou pipeline de migrations) antes do primeiro deploy desta feature — não há CI de migration neste repositório.

# Variáveis de ambiente

- **`ADMIN_SESSION_SECRET`** (nova) — segredo de assinatura do JWT `ts_admin`, ≥ 32 bytes aleatórios (ex.: `openssl rand -base64 32`), só no ambiente do servidor (Vercel Production + Preview), nunca versionado. Documentada em `DEPLOY.md`. Trocar o valor invalida todas as sessões ADMIN ativas.

# Dependências

- **Nova:** `jose` (`^6.2.8`) — assinatura/verificação de JWT compatível com Edge Runtime.
- **Reutilizadas:** `@supabase/ssr`, `next`, `react` — nenhuma outra dependência nova.
- **Banco:** `pgcrypto` (já habilitado desde a migration `002`).

# Correções de Segurança (remediação pós-revisão)

Ordem seguida, conforme priorizado pela Segurança: CRIT-1 → ALTA-1 → ALTA-2 → MED-2 → MED-1 → MED-3 → baixas.

| # | Achado | Correção | Arquivo(s) |
|---|---|---|---|
| CRIT-1 | RPCs abertas a `authenticated` sem authz interna → tomada da credencial ADMIN via PostgREST direto | Revogado `grant` a `authenticated`/`anon`; `admin_login`/`admin_trocar_senha` só chamáveis via `service_role`, a partir das Server Actions já autorizadas | `019_admin_section_auth.sql`, `app/admin/bloqueio/actions.ts` |
| ALTA-1 | Step-up não protegia a superfície de escrita (~11 Server Actions de Parâmetros; escrita direta de Vínculos no browser) | `exigirSessaoAdmin()`/`getValidAdminSession()` em todas as actions de escrita de Parâmetros; escrita de Vínculos movida para Server Actions guardadas (`criarVinculo`/`excluirVinculo`) | `app/fiscal/parametros/actions.ts`, `app/(comum)/vinculos/actions.ts` (novo), `VinculosClient.tsx` |
| ALTA-2 | `salvarComunicado`/`salvarConfiguracoes` não checavam `role='admin'` | Adicionado o mesmo check de role já usado nas outras actions do arquivo — **ver desvio da recomendação literal abaixo** | `app/fiscal/parametros/actions.ts` |
| MED-2 | `tentativas_falhas` nunca zerava ao expirar o lockout (DoS permanente do único ADMIN) | `admin_login` zera o contador quando `bloqueado_ate` já expirou, antes de avaliar a tentativa atual | `019_admin_section_auth.sql` |
| MED-1 | Open redirect via `next` (`//evil.com` passava em `startsWith('/')`) | Validação trocada para `ehRotaAdmin(next)` (allowlist real de rotas ADMIN) | `app/admin/bloqueio/page.tsx` |
| MED-3 | `ADMIN_SESSION_SECRET` sem validação de força | `getSecretKey()` rejeita segredo com menos de 32 bytes, falha fechada | `lib/admin-auth/session.ts` |
| BAIXA (alg pin) | `jwtVerify` sem pin de algoritmo | `jwtVerify(token, key, { algorithms: ['HS256'] })` | `lib/admin-auth/session.ts` |
| BAIXA (timing oracle) | Caminho "usuário não encontrado" não pagava custo de bcrypt (diferença de tempo revelava existência do usuário) | `crypt()` descartável contra hash fixo nesse caminho | `019_admin_section_auth.sql` (`admin_login`) |

**Desvio deliberado da recomendação literal de ALTA-2.** O `SECURITY_REPORT.md` recomenda fazer `getAuthenticatedAdmin()` (`lib/supabase/server.ts:42`) validar `role='admin'` internamente. Não apliquei essa mudança ao helper: ele é usado por diversas outras Server Actions do portal que são **intencionalmente** acessíveis a qualquer colaborador autenticado, não só admins — por exemplo `salvarMit`/`salvarObs`/`desbloquearTarefa` (`app/fiscal/clientes/actions.ts`) e `criarTipoTarefa` (`lib/tarefa-tipos-actions.ts`), nenhuma das quais checa `role` hoje, por design (usam `podeEditarCliente()` ou nenhuma restrição adicional). Bakear o check de admin no helper compartilhado quebraria esses fluxos, que estão fora do escopo de TES-3. Em vez disso, corrigi cirurgicamente os dois únicos call-sites que o relatório apontou como vulneráveis (`salvarComunicado`, `salvarConfiguracoes`), replicando o padrão de check que as outras ~9 actions do mesmo arquivo já usavam. Sinalizando explicitamente para quem revisar: `getAuthenticatedAdmin()` continua sendo "cliente autenticado com privilégio elevado", não "cliente só-admin" — cada action que precisa restringir a admin continua responsável por checar `role` (ou, na seção ADMIN, sessão `ts_admin`) por conta própria.

**Risco residual (registrado a pedido da Segurança/PM):** a revogação de sessão é **temporal, não imediata**. Desativar um `admin_users` (`ativo=false`) ou trocar sua senha **não invalida** um cookie `ts_admin` já emitido, porque `verifyAdminToken` é stateless (só verifica assinatura/expiração, nunca consulta o banco). Um cookie roubado ou de um usuário desativado continua válido até expirar por inatividade (30 min) ou pelo teto absoluto (8h). Mitigação futura possível: checar `ativo` do `admin_users` a cada `requireAdminSection()`/no `proxy.ts` (troca stateless por uma consulta leve) ou versionar a senha/sessão num claim e comparar contra o banco. Não implementado nesta remediação — não fazia parte do escopo bloqueante (CRIT-1/ALTA-1/ALTA-2) e é uma mudança de arquitetura (sessão deixa de ser puramente stateless), não um bug pontual.

**Não corrigido nesta remediação (fora da lista bloqueante/priorizada pelo PM):**
- **MED-4** (`tarefa_vinculos` legível por qualquer autenticado na RLS, mesmo com o step-up na tela) — decisão de produto pendente, documentada no `SECURITY_REPORT.md`, não pedida nesta rodada.
- **BAIXA-3** (senha semente versionada em texto puro) — mitigada pela troca obrigatória (`trocar_senha=true`), que agora é uma proteção real depois do CRIT-1; nenhuma mudança adicional pedida.
- **BAIXA-4** (ausência de auditoria do step-up) — roadmap.
- **BAIXA-5** (`secure: true` fixo no cookie) — comportamento correto para produção, sem mudança pedida.

# Observações Técnicas

- **Comprimento mínimo de senha:** fixado em **8 caracteres** (`ADMIN_MIN_PASSWORD_LENGTH` em `lib/admin-auth/constants.ts`), aplicado tanto na RPC `admin_trocar_senha`/`admin_user_create` (defesa em profundidade no banco) quanto no Server Action `trocarSenhaInicial` (feedback rápido ao usuário). Segue a sugestão do Design; tratada aqui como regra de segurança confirmada, não apenas de UX.
- **Modelo "ambos" (role do portal + credencial ADMIN):** implementado tanto no `proxy.ts` (fetch de `profiles.role` antes de checar `ts_admin`) quanto reforçado no Server Action `adminLogin` (que também verifica `role='admin'` antes de sequer chamar a RPC) — cobre o caso de a Server Action ser invocada sem passar pelo matcher do `proxy.ts`.
- **Sessão:** expiração absoluta de 8h (`loginAt` fixo, não se move entre renovações) + inatividade de 30 min (sliding, renovada a cada request válida em rota ADMIN no `proxy.ts`). Ambos parametrizados em `constants.ts` — ajustar ali (e, para o lockout, também na migration) se o cliente confirmar valores diferentes.
- **Erro genérico (RN3):** a RPC nunca diferencia "usuário não existe" de "senha errada" — ambos caem em `status = 'invalid'`. O único caso distinguível é `'locked'` (mensagem de bloqueio temporário), conforme Estado 4 do Design.
- **`gen_random_uuid()`** foi usado (em vez de `uuid_generate_v4()`, usado em migrations mais antigas) porque já vem do `pgcrypto`, sem depender de `uuid-ossp` — puramente uma escolha de consistência com a extensão que esta migration já requer.
- Não há tela de "acesso negado" nem UI nesta entrega — só o contrato de backend que a etapa de Frontend vai consumir (`adminLogin`, `adminLogout`, `trocarSenhaInicial`, `getAdminSession`).

# Pendências

- **Nova revisão de Segurança** sobre esta branch de remediação antes do Code Review (pedido explícito do PM/Security ao encerrar esta rodada).
- **Rodar a migration** `019_admin_section_auth.sql` (já com os grants corrigidos) no Supabase de cada ambiente (dev/staging/prod) antes do merge desta feature ir ao ar — não incluído neste PR porque não há pipeline de migration automatizado no repositório. Se a versão anterior (com `grant ... to authenticated`) já tiver sido aplicada em algum ambiente, os `revoke` desta migration cobrem a correção; não é necessário recriar a tabela.
- **Configurar `ADMIN_SESSION_SECRET`** no Vercel (Production + Preview), agora com **≥ 32 bytes** (a validação de força passou a rejeitar segredos curtos — ver MED-3).
- **Tela de gestão de usuários ADMIN e auditoria** — roadmap (RC5 do SPEC), fora do escopo desta versão; `admin_user_create`/`admin_user_set_ativo` já existem no banco para uso via SQL/service role até lá.
- **MED-4** (RLS de leitura de `tarefa_vinculos`) — decisão de produto pendente, não bloqueante, documentada no `SECURITY_REPORT.md`.
- Validação manual das RPCs (`admin_login`/`admin_trocar_senha`, agora só via `service_role`) e do fluxo completo (login, lockout, troca obrigatória, Server Actions de Parâmetros/Vínculos negando sem sessão `ts_admin`) num banco Supabase real não foi possível neste ambiente — recomendo essa validação, incluindo os cenários negativos de CRIT-1/ALTA-1 como testes explícitos, antes do merge para `main`.
