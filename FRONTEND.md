FRONTEND.md — Autenticação da seção ADMIN (TES-3)

Implementação frontend da feature de controle de acesso à seção ADMIN (Parâmetros e Vínculos), conforme SPEC.md/ARCHITECTURE.md/DESIGN.md aprovados. Branch: `agent/frontend-engineer/55990627`, a partir de `agent/backend-engineer/de6a41be` (não de `dev` limpa), para consumir a migration, `lib/admin-auth/`, `proxy.ts` e os Server Actions já implementados no backend.

# Estrutura implementada

```
app/admin/bloqueio/
  page.tsx           + Server Component: le sessão/searchParams, decide sub-estado, renderiza o cartão
  BloqueioForm.tsx    + Client Component: máquina de estados login | trocar_senha
components/admin/
  SairAdminButton.tsx + botão "Sair da área ADMIN", embutido nas páginas ADMIN
app/fiscal/parametros/page.tsx   ~ adiciona <SairAdminButton /> acima do conteúdo
app/(comum)/vinculos/page.tsx    ~ adiciona <SairAdminButton /> acima do conteúdo
```

Nenhum arquivo de backend (`lib/admin-auth/`, `proxy.ts`, `actions.ts`, migration) foi alterado — apenas consumido.

# Componentes

- **`BloqueioForm`**: reaproveita literalmente o `inputCls` e o padrão de máquina de estados (`View`) já usados em `components/auth/LoginForm.tsx`. Dois sub-estados:
  - `login`: campos Usuário e Senha (mascarado, com alternância mostrar/ocultar — mesmo ícone de olho do `LoginForm`), botão "Entrar na área ADMIN", erro genérico exato "Usuário ou senha inválidos." (RN3, retornado pela própria Server Action) e "Muitas tentativas..." em caso de lockout.
  - `trocar_senha`: campos Nova senha / Confirmar nova senha (mascarados), botão "Definir senha e continuar", sem opção de pular (troca obrigatória — RC2/DP4), com saída apenas via "Sair da área ADMIN".
  - A transição entre sub-estados **não é client-side**: acontece via navegação de servidor (o `proxy.ts`/`requireAdminSection` já redirecionam para `/admin/bloqueio?...&etapa=trocar-senha` quando necessário), então `view` é derivado da prop `initialView` vinda do Server Component, sem `useState` de transição.
- **`SairAdminButton`**: faixa fina (`bg-amber-500/10`) com o texto "Você está na área ADMIN" + botão, visualmente distinto do "Sair" do `TopNav` do portal. Chama a Server Action `adminLogout()` diretamente (sem modal de confirmação, conforme DESIGN.md).

Nenhum componente de estilo novo foi criado — apenas composição dos tokens/padrões já existentes (`inputCls`, cartão `bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl`, botão primário `bg-[var(--accent)]`, erro `text-red-400`), conforme RNF4.

# Telas

## `/admin/bloqueio`

Mesma estrutura visual do `/login` (logo 96×96, cartão centralizado `max-w-sm`), com o selo "Área Restrita · Seção ADMIN" no lugar do subtítulo "Portal do Colaborador" — único elemento tipográfico novo, sem nova cor. `page.tsx`:

- Reexige login do portal (`redirect('/login')` se `!user`) — mesmo padrão defensivo já usado em `parametros/page.tsx`/`vinculos/page.tsx`, mesmo com o `proxy.ts` já cobrindo isso.
- Lê `getAdminSession()`: se já autenticado e sem troca de senha pendente, redireciona direto ao `next` (evita mostrar o formulário à toa).
- Deriva o sub-estado inicial de `session.mustChangePassword` OU do query param `etapa=trocar-senha` (o `proxy.ts` envia esse param no redirect do primeiro acesso).
- Preserva `next` (default `/fiscal/parametros` se ausente ou não relativo) e repassa ao `BloqueioForm`.

# Rotas

Nenhuma rota nova além de `/admin/bloqueio` (já prevista no DESIGN.md/ARCHITECTURE.md). `/fiscal/parametros` e `/vinculos` continuam nas rotas atuais, sem route group novo.

# Integrações

Consome exclusivamente o que o Backend Engineer já entregou:

- Server Actions `adminLogin(username, senha)`, `adminLogout()`, `trocarSenhaInicial(senhaNova, senhaConfirmacao)` (`app/admin/bloqueio/actions.ts`).
- `getAdminSession()` (`lib/admin-auth/server.ts`), usado só para leitura em `page.tsx` (não escreve cookie no cliente).

Nenhuma chamada direta ao Supabase, RPC ou manipulação de cookie a partir do frontend — toda a lógica de sessão/senha permanece no servidor.

# Estados

- **Vazio/inicial**: campos vazios, foco automático (`autoFocus`) no primeiro campo, sem erro.
- **Erro de credencial**: mensagem genérica abaixo do botão, campo Senha limpo (RN3 — não revela qual campo errou), campo Usuário mantido.
- **Carregando**: botão com rótulo de progresso ("Entrando..."/"Salvando...") e `disabled`, mesmo padrão `disabled:opacity-50 disabled:cursor-not-allowed` do `LoginForm`.
- **Conta bloqueada (lockout)**: mesma área de erro exibe a mensagem de bloqueio devolvida pela Server Action; botão reabilitado para nova tentativa (variante mais simples do Estado 4 do DESIGN.md, explicitamente aceita como alternativa lá).
- **Definir nova senha**: sub-estado dedicado, campos vazios, foco automático, texto de contexto explicando o motivo.
- Mensagens de erro usam `role="alert"` para leitura por leitores de tela (acessibilidade).

# Dependências

Nenhuma nova dependência de frontend — apenas `next/navigation` (`useRouter`) e `react` (`useState`), já em uso no restante do portal.

# Observações Técnicas

- `npx tsc --noEmit`, `npx eslint` (escopo dos arquivos tocados) e `npx next build` (Turbopack) passam sem erros novos. O único erro de lint pré-existente em `app/fiscal/parametros/page.tsx` (linha deslocada para 43 após o novo import, mesmo problema já relatado pelo Backend Engineer) não é desta feature.
- `SairAdminButton` foi embutido diretamente em `page.tsx` de Parâmetros e Vínculos (não em `PortalShell`/`TopNav`, que são compartilhados por todos os setores do portal) para não alterar comportamento de páginas fora do escopo desta feature.
- Após login/troca de senha bem-sucedidos, o redirecionamento usa `router.push(next)` + `router.refresh()`: se ainda houver troca de senha pendente, o próprio `proxy.ts` intercepta essa navegação e devolve o usuário a `/admin/bloqueio?...&etapa=trocar-senha` — a fonte de verdade do sub-estado continua sendo o servidor, nunca uma suposição do cliente.

# Pendências

- Validação manual end-to-end (login com a credencial semente `ADMIN`/`ADMIN@123PASSWORD`, troca obrigatória, lockout, acesso direto por URL) depende da migration `019_admin_section_auth.sql` aplicada em um Supabase real e de `ADMIN_SESSION_SECRET` configurada — não foi possível neste ambiente (mesma limitação já registrada pelo Backend Engineer no BACKEND.md).
- Tela de gestão de usuários ADMIN e auditoria — roadmap (RC5), fora do escopo desta feature.

---

STATUS: READY

ARTEFATO GERADO: FRONTEND.md

IMPLEMENTAÇÃO: CONCLUÍDA
