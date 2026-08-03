# Resumo da Release

Bugfix de segurança/estabilidade no Portal Tesserato: corrige o redirecionamento inesperado para a tela de login durante a navegação (race condition no refresh de token do Supabase disparada por prefetches automáticos do Next.js) e, no processo de revisão, fecha uma vulnerabilidade de bypass de autorização por setor (IDOR) que a primeira versão da correção havia introduzido. Fluxo completo percorrido: investigação → implementação → 3 rodadas de code review (2 REJECTED, 1 APPROVED) → QA (APPROVED). Não há SPEC/ARCHITECTURE/DESIGN associados por se tratar de bugfix pontual.

Branch: `agent/frontend-engineer/e309f12b` (a partir de `dev`, ponto de partida `e42e20e`).

# Versão

`package.json` na branch: `0.1.1` (não houve bump de versão como parte desta correção — a decisão de versionamento fica com o time, ver Pendências Futuras).

# Funcionalidades Entregues

Nenhuma. Esta release é exclusivamente uma correção de bug.

# Correções

- **Redirecionamento indevido para `/login` durante navegação (bug original relatado pelo usuário).** Causa raiz: `proxy.ts` chamava `supabase.auth.getUser()` em toda requisição que casava com o matcher, inclusive nos prefetches automáticos que o Next.js dispara para cada `<Link>` visível (Sidebar/TopNav renderizam 10+ links simultâneos). Perto da expiração do access token, essas chamadas concorrentes disputavam o mesmo refresh token rotativo do Supabase — só a primeira vencia, as demais (inclusive a navegação real do usuário) recebiam erro e eram redirecionadas ao login. F5 sempre "resolvia" por ser uma única requisição sem concorrência. Corrigido excluindo requisições de prefetch (`next-router-prefetch` / `purpose: prefetch`) do `matcher` do proxy, conforme padrão oficial do Next.js. (commit `118f387`)
- **Bypass de autorização por setor via header de prefetch (achado crítico do Code Review, introduzido pela correção acima e fechado antes de qualquer merge).** Como `proxy.ts` era o único ponto que verificava acesso por setor, excluir prefetches do matcher também pulava essa verificação — e como `purpose`/`next-router-prefetch` são headers HTTP comuns, um usuário autenticado de um setor podia forjá-los para acessar dados de outro setor (`clientes_fiscal`, `clientes_financeiro`, etc., liberados pelo RLS a qualquer autenticado). Corrigido em duas iterações até a defesa definitiva: o setor de cada rota deixou de depender de qualquer header/dado de requisição e passou a vir de um literal estático em cada `layout.tsx` de setor, injetado diretamente em `getPortalContext(setorAtivo)`. Sem nenhum dado do cliente no caminho da decisão, não há mais nada para forjar. (commits `6efe13b`, `d51f7a9`, `1e5dc97`)
- **Perda de cookies de sessão renovados em redirects do proxy (achado correlato encontrado durante o rework).** `NextResponse.redirect(...)` descartava cookies de sessão renovados por `getUser()`; se o access token expirasse no momento de um redirect, o navegador ficava com um refresh token já invalidado, causando logout forçado na requisição seguinte. Corrigido com o helper `redirectComCookies()`. (commit `6efe13b`)

# Melhorias

- Lógica de permissão de setor/página extraída para `lib/route-permissions.ts`, compartilhada entre `proxy.ts` e `getPortalContext()` — evita que as duas camadas divirjam no futuro.
- Checagem de página (`x-pathname`) passou a falhar *aberta* em vez de negar por padrão, eliminando o acoplamento frágil com `loading.tsx` identificado no code review, sem reabrir a fronteira de segurança entre setores (o fail-open só afeta granularidade dentro de um setor já autorizado sem uso de header).
- Suite de testes automatizados nova (`tests/proxy-matcher.test.ts`, `tests/route-permissions.test.ts`, `tests/setor-layouts.test.ts`, 18 testes) usando `node:test` + `tsx`, incluindo guarda de regressão específica para o vetor de bypass de setor e para qualquer `layout.tsx` que volte a chamar `getPortalContext()` sem o literal de setor. Script `npm test` adicionado ao `package.json`.

# Dependências

Nenhuma dependência nova de produção. `tsx` já era devDependency do projeto e passou a ser usado também para rodar a suite de testes (script `test` novo em `package.json`); nenhum framework de teste adicional foi introduzido.

# Variáveis de Ambiente

Sem alteração — as correções não introduzem nem removem variáveis. Repositório não possui `.env.example`; as variáveis referenciadas no código (necessárias para deploy) são:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`
- `DEV_MASTER_EMAIL`

# Checklist de Implantação

- [x] QA aprovado (`QA_REPORT.md`, commit `8f30e31`).
- [x] Code Review aprovado (`CODE_REVIEW.md`, commit `aa32a3f`).
- [x] `tsc --noEmit`, `eslint` e `next build` (33 rotas) limpos.
- [x] `npm test` — 18/18 testes passando.
- [x] Branch mesclável em `dev` sem conflitos — validado localmente (`git merge --no-ff` de `agent/frontend-engineer/e309f12b` em `origin/dev` completa sem conflitos; a branch está alguns commits atrás de `dev`, mas o three-way merge preserva corretamente as mudanças recentes de `dev` em `components/geral/ClienteGeralModal.tsx`, PR #48).
- [ ] **Abrir Pull Request `agent/frontend-engineer/e309f12b` → `dev`** — pendente, ver Pendências Futuras.
- [ ] Validar em staging a navegação repetida pelo sidebar perto do horário de expiração do access token, confirmando que o redirect indevido não ocorre mais (QA não teve acesso a staging/credenciais para reproduzir a race ao vivo — validação feita por código + teste automatizado).
- [ ] Validar em staging, com dois usuários de setores distintos, que o vetor de bypass (`purpose: prefetch` + `x-pathname` forjado) continua bloqueado em produção.
- [ ] Após merge, deploy padrão do pipeline do projeto (Vercel, conforme `README.md`) — nenhuma migração de banco ou variável de ambiente nova é necessária.

# Checklist de Rollback

- [ ] Reverter o merge commit da PR `agent/frontend-engineer/e309f12b` → `dev` (ou `git revert` dos commits `118f387`, `6efe13b`, `1e5dc97` mais os commits de documentação, nesta ordem) caso o deploy introduza regressão.
- [ ] Sem migração de banco associada — rollback é puramente de código, sem necessidade de reverter dados.
- [ ] Sem variável de ambiente nova — rollback não requer alteração de configuração.
- [ ] Se o rollback for necessário, atentar que ele reintroduz o bug original (redirect indevido em navegação) — comunicar ao time antes de reverter.

# Limitações Conhecidas

- A race condition de refresh de token (bug original) foi validada por leitura de código e teste automatizado do matcher (`tests/proxy-matcher.test.ts`), não por reprodução ao vivo em navegador contra staging — QA não teve acesso a staging/credenciais reais. Recomenda-se validação funcional em staging antes ou logo após o deploy.
- O fail-open da checagem de página (via header `x-pathname`) é best-effort e só garante isolamento entre setores, não granularidade fina dentro de um mesmo setor — comportamento intencional, documentado no `CODE_REVIEW.md`, não uma lacuna de segurança entre setores.
- O Pull Request de `agent/frontend-engineer/e309f12b` para `dev` ainda não foi aberto (ver Pendências Futuras).

# Pendências Futuras

- **Abertura do Pull Request:** nenhum dos ambientes de agente por onde esta correção passou (Frontend Engineer nem este Release Manager) possui `gh` autenticado para abrir o PR automaticamente. Passo manual para o time: abrir PR de `agent/frontend-engineer/e309f12b` para `dev` em https://github.com/murilooneto-dev/portal-tesserato/pull/new/agent/frontend-engineer/e309f12b (o merge foi validado localmente sem conflitos nesta consolidação).
- Validação funcional em staging dos dois pontos listados no Checklist de Implantação (race de refresh e vetor de bypass de setor) antes de considerar o deploy definitivamente encerrado.
- Nenhuma pendência crítica de código identificada — Code Review e QA aprovaram sem ressalvas bloqueantes.

# Observações

- O escopo desta correção acabou incluindo, além do bug relatado, o fechamento de uma vulnerabilidade de autorização por setor que a primeira tentativa de correção (excluir prefetches do matcher) teria introduzido caso fosse mesclada sem revisão — destaque para o processo de code review, que rejeitou duas vezes até a causa raiz estrutural (autorização dependente de header) ser eliminada por completo.
- Esta consolidação verificou, além dos artefatos obrigatórios, que o merge da branch em `dev` é limpo apesar de `dev` ter avançado com 3 commits (PR #48, não relacionados a este bugfix) após o ponto de partida da branch — nenhuma ação adicional é necessária além de abrir o PR.
