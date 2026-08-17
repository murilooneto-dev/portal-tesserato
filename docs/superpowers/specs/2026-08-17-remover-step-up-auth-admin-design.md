# Remover autenticação step-up da seção ADMIN

- Data: 2026-08-17
- Status: aprovado

## Contexto

A seção ADMIN (`/fiscal/parametros`, `/admin/configuracoes`, `/vinculos`) tem
hoje duas camadas de proteção empilhadas:

1. Login do portal (Supabase Auth) + `profiles.role = 'admin'`.
2. Uma camada extra própria ("step-up"): tela de usuário/senha
   (`/admin/bloqueio`), sessão assinada em cookie `ts_admin` (JWT via
   `jose`), tabela `admin_users` com hash bcrypt no Postgres
   (migration `019_admin_section_auth.sql`).

Essa segunda camada gerou fricção operacional repetida (senha esquecida,
migration nunca aplicada em produção, `pgcrypto` fora do `search_path`, env
var `ADMIN_SESSION_SECRET` faltando) sem agregar valor percebido pelo
usuário — que já confia no controle de acesso por `role='admin'` usado no
resto do portal. Decisão: remover a camada 2, manter só a camada 1.

## Objetivo

Desligar completamente a autenticação step-up no código, sem tocar no banco
de dados: a tabela `admin_users` e as RPCs (`admin_login`,
`admin_trocar_senha`, `admin_user_create`, `admin_user_set_ativo`)
continuam existindo em produção e dev, só ficam sem nenhum chamador.

## Fora de escopo

- Apagar a tabela `admin_users`/RPCs do banco (decisão explícita do usuário:
  deixar existindo, sem uso).
- Qualquer mudança na proteção por `role='admin'` em si — ela já existe e
  continua exatamente como está.
- Remover a env var `ADMIN_SESSION_SECRET` da Vercel (fica órfã, sem efeito;
  pode ser removida manualmente pelo usuário depois, não faz parte deste
  trabalho).

## Design

### 1. `proxy.ts`

Hoje, ao interceptar uma rota de `ehRotaAdmin(pathname)`, o proxy checa
`role='admin'` e, na sequência, verifica/renova o cookie `ts_admin`
(redirecionando para `/admin/bloqueio` se ausente/expirado/trocar senha
pendente).

Remove-se todo o bloco de verificação/renovação do `ts_admin` (imports de
`ADMIN_SESSION_COOKIE`, `ADMIN_SESSION_INACTIVITY_TTL_SECONDS`,
`signAdminToken`, `verifyAdminToken` inclusive). Mantém-se apenas a
checagem de `role='admin'` com redirect para `/intranet` em caso negativo —
comportamento que já existe hoje e é a defesa em profundidade real.

### 2. Páginas da seção ADMIN

`app/fiscal/parametros/page.tsx`, `app/admin/configuracoes/page.tsx` e
`app/(comum)/vinculos/page.tsx` já fazem, cada uma, sua própria checagem de
login + `role='admin'` antes de chamar `requireAdminSection()` — essa
chamada é hoje redundante com a checagem que já roda logo acima dela. As
três perdem a chamada a `requireAdminSection()` (e o import) e o
`<SairAdminButton />` (e o import), sem substituição — a checagem de
`role='admin'` que já está no topo de cada página passa a ser a única
guarda de página.

### 3. Server Actions

Quatro arquivos guardam suas Server Actions com uma checagem de sessão
`ts_admin` antes (ou depois, dependendo do arquivo) da checagem de
`role='admin'`:

- `lib/config-entidades-actions.ts` (`exigirAdmin()`)
- `lib/tarefa-tipo-vinculos-actions.ts` (`exigirAdmin()`)
- `app/(comum)/vinculos/actions.ts` (`exigirAcessoAdmin()`)
- `app/fiscal/parametros/actions.ts` (`exigirSessaoAdmin()`, chamada em 12
  funções exportadas)

Em todos os quatro, remove-se apenas a chamada a `getValidAdminSession()` (e
o import de `@/lib/admin-auth/server`) — a checagem de `role='admin'`, que
já existe em paralelo em cada um desses arquivos, fica como está e passa a
ser a única guarda dessas actions. Em `fiscal/parametros/actions.ts`, como
`exigirSessaoAdmin()` só fazia essa checagem (nada mais), a função inteira e
suas 12 chamadas são removidas.

### 4. Arquivos apagados

Ficam sem nenhum chamador depois dos itens acima — apagados por completo:

- `app/admin/bloqueio/page.tsx`
- `app/admin/bloqueio/actions.ts`
- `app/admin/bloqueio/BloqueioForm.tsx`
- `lib/admin-auth/server.ts`
- `lib/admin-auth/session.ts`
- `lib/admin-auth/constants.ts`
- `components/admin/SairAdminButton.tsx`

`lib/rotas-admin.ts` (`ROTAS_ADMIN`/`ehRotaAdmin`) continua existindo — o
`proxy.ts` ainda precisa saber quais rotas exigem `role='admin'`.

### 5. Banco de dados

Nenhuma migration nova. `admin_users` e as 4 RPCs continuam no schema, sem
uso — consistente com a decisão do usuário de não apagar.

## Testes

Não há suíte automatizada cobrindo login/rotas admin hoje (`tests/` cobre
lógica de domínio, não auth). Verificação é manual: navegar para as 3
páginas ADMIN logado como usuário `role='admin'` (deve entrar direto, sem
tela de bloqueio) e como usuário sem essa role (deve continuar bloqueado,
redirecionado pra `/intranet`).
