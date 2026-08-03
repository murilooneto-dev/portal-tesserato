# BACKEND.md — Autenticação da seção ADMIN (TES-3)

Implementação backend da feature de controle de acesso à seção ADMIN (Parâmetros e Vínculos), conforme `SPEC.md`/`ARCHITECTURE.md`/`DESIGN.md` aprovados na issue TES-3. Branch: `agent/backend-engineer/de6a41be` (a partir de `dev`).

# Estrutura criada

```
supabase/migrations/019_admin_section_auth.sql   + admin_users, RPCs, RLS, seed
lib/rotas-admin.ts                               + ROTAS_ADMIN (fonte única)
lib/admin-auth/
  constants.ts                                   + parâmetros de sessão/lockout/senha
  session.ts                                      + sign/verify do JWT (Edge-safe, sem cookie I/O)
  server.ts                                        + getAdminSession/requireAdminSection/set-clear cookie
app/admin/bloqueio/actions.ts                     + Server Actions adminLogin/adminLogout/trocarSenhaInicial
proxy.ts                                          ~ intercepta ROTAS_ADMIN
app/fiscal/parametros/page.tsx                    ~ requireAdminSection() antes das queries
app/(comum)/vinculos/page.tsx                     ~ requireAdminSection() antes das queries
DEPLOY.md                                         ~ ADMIN_SESSION_SECRET + checklist
```

Não foi criada nenhuma tela (`/admin/bloqueio/page.tsx`, `BloqueioForm.tsx`, `SairAdminButton.tsx`) — isso é escopo da etapa de Frontend, que consome os Server Actions e `getAdminSession()` já prontos aqui.

# Rotas implementadas

Nenhuma rota HTTP pública nova — tudo via Server Actions (chamadas internas do Next.js, sem REST exposto), conforme Arquitetura.

| Ação | Arquivo | Efeito |
|---|---|---|
| `adminLogin(username, senha)` | `app/admin/bloqueio/actions.ts` | Exige portal logado + `role='admin'` (defesa em profundidade); chama RPC `admin_login`; em sucesso emite cookie `ts_admin`. Retorna `{ error }` (nunca lança para o cliente). |
| `adminLogout()` | idem | Limpa o cookie `ts_admin` e redireciona para `/admin/bloqueio`. Não afeta a sessão do portal. |
| `trocarSenhaInicial(senhaNova, senhaConfirmacao)` | idem | Valida confirmação e comprimento mínimo, chama RPC `admin_trocar_senha` com o `id` da sessão atual (nunca de input do form), reemite o cookie com `mustChangePassword=false`. |

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

- **`admin_login(p_username text, p_senha text) → table(status, id, username, trocar_senha)`** — `status` é `'ok' | 'invalid' | 'locked'`, nunca revela se o usuário existe (RN3). Bcrypt (`crypt`) comparado dentro do banco. Lockout de 15 min após 5 tentativas incorretas (contador por usuário).
- **`admin_trocar_senha(p_id uuid, p_senha_nova text) → boolean`** — aplica `crypt(..., gen_salt('bf'))`, zera `trocar_senha`. Rejeita senha com menos de 8 caracteres (`raise exception`, mesma regra do Server Action).
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

# Observações Técnicas

- **Comprimento mínimo de senha:** fixado em **8 caracteres** (`ADMIN_MIN_PASSWORD_LENGTH` em `lib/admin-auth/constants.ts`), aplicado tanto na RPC `admin_trocar_senha`/`admin_user_create` (defesa em profundidade no banco) quanto no Server Action `trocarSenhaInicial` (feedback rápido ao usuário). Segue a sugestão do Design; tratada aqui como regra de segurança confirmada, não apenas de UX.
- **Modelo "ambos" (role do portal + credencial ADMIN):** implementado tanto no `proxy.ts` (fetch de `profiles.role` antes de checar `ts_admin`) quanto reforçado no Server Action `adminLogin` (que também verifica `role='admin'` antes de sequer chamar a RPC) — cobre o caso de a Server Action ser invocada sem passar pelo matcher do `proxy.ts`.
- **Sessão:** expiração absoluta de 8h (`loginAt` fixo, não se move entre renovações) + inatividade de 30 min (sliding, renovada a cada request válida em rota ADMIN no `proxy.ts`). Ambos parametrizados em `constants.ts` — ajustar ali (e, para o lockout, também na migration) se o cliente confirmar valores diferentes.
- **Erro genérico (RN3):** a RPC nunca diferencia "usuário não existe" de "senha errada" — ambos caem em `status = 'invalid'`. O único caso distinguível é `'locked'` (mensagem de bloqueio temporário), conforme Estado 4 do Design.
- **`gen_random_uuid()`** foi usado (em vez de `uuid_generate_v4()`, usado em migrations mais antigas) porque já vem do `pgcrypto`, sem depender de `uuid-ossp` — puramente uma escolha de consistência com a extensão que esta migration já requer.
- Não há tela de "acesso negado" nem UI nesta entrega — só o contrato de backend que a etapa de Frontend vai consumir (`adminLogin`, `adminLogout`, `trocarSenhaInicial`, `getAdminSession`).

# Pendências

- **UI da seção ADMIN** (`/admin/bloqueio/page.tsx`, `BloqueioForm.tsx`, `SairAdminButton.tsx`) — próxima etapa (Frontend Engineer), conforme roteiro da issue.
- **Rodar a migration** `019_admin_section_auth.sql` no Supabase de cada ambiente (dev/staging/prod) antes do merge desta feature ir ao ar — não incluído neste PR porque não há pipeline de migration automatizado no repositório.
- **Configurar `ADMIN_SESSION_SECRET`** no Vercel (Production + Preview) antes do deploy.
- **Tela de gestão de usuários ADMIN e auditoria** — roadmap (RC5 do SPEC), fora do escopo desta versão; `admin_user_create`/`admin_user_set_ativo` já existem no banco para uso via SQL/service role até lá.
- Validação manual das RPCs (`admin_login`/`admin_trocar_senha`) no SQL Editor com um banco Supabase real não foi possível neste ambiente (sem acesso a um projeto Supabase) — recomendo essa validação antes do merge para `main`.
