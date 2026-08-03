# Resumo da Revisão

Branch revisado: `agent/frontend-engineer/e309f12b` (a partir de `dev`).

Esta é a **segunda rodada** de revisão. A primeira (commit `118f387`) foi reprovada por abrir um bypass de autorização por setor via header de prefetch controlável pelo cliente. O rework (commit `6efe13b`) tentou fechar esse achado movendo a checagem de setor/página para `getPortalContext()`, sinalizada por um header customizado `x-pathname` injetado pelo `proxy.ts`.

O diagnóstico da race condition e a extração da lógica de permissão para `lib/route-permissions.ts` estão corretos. A correção do bug de cookies em redirects (`redirectComCookies`) também está correta. Porém **o achado crítico original não foi fechado — ele foi reintroduzido em uma forma equivalente**: o mecanismo de defesa em profundidade confia em um header HTTP comum (`x-pathname`) que só é confiável quando o Proxy roda, e é exatamente nas requisições em que o Proxy **não** roda (as mesmas excluídas pelo `matcher`) que esse header deixa de ser preenchido pelo `proxy.ts` e passa a ser 100% controlável por quem está fazendo a requisição. Reprovado novamente.

# Pontos Positivos

- `lib/route-permissions.ts` é uma extração limpa e correta: `resolveSetorPagina`/`podeAcessarSetor`/`podeAcessarPagina` reproduzem exatamente a lógica original, agora compartilhada entre `proxy.ts` e `getPortalContext()` — boa prática pra evitar divergência entre as duas camadas.
- `redirectComCookies()` (`proxy.ts:23-27`) está correto: repassa os `Set-Cookie` pendentes de `supabaseResponse` (cookies renovados por `getUser()`) para o `NextResponse.redirect`, seguindo exatamente o padrão de "Setting Headers"/cookies documentado pelo Next.js (`response.cookies.set(cookieObject)` aceita o objeto completo retornado por `getAll()`). Fecha um bug real e correlato (logout forçado quando o refresh acontece bem no momento de um redirect).
- Verifiquei se a checagem de defesa em profundidade poderia reintroduzir o bug original (redirect indevido) para prefetches *legítimos* do Next.js em rotas com `loading.js`, já que rotas dinâmicas só são pré-buscadas até o "loading boundary" quando esse arquivo existe (`node_modules/next/dist/docs/01-app/02-guides/prefetching.md`, tabela "Prefetching static vs. dynamic routes"). Não há nenhum `loading.tsx`/`loading.js` em `app/**` neste projeto hoje, então nenhuma rota de setor é pré-buscada de fato — o redirect por `x-pathname` ausente não deveria disparar em navegação real legítima no estado atual do app. Ver Médio #2 para o porquê isso é frágil a longo prazo.

# Problemas Encontrados

## Críticos

### 1. O bypass de autorização por setor não foi fechado — foi movido para um novo header igualmente forjável

**Local:** `proxy.ts:15,42-46` (definição e preenchimento de `x-pathname`) + `lib/get-portal-context.ts` (uso de `headers().get('x-pathname')` como fonte de verdade da rota).

**Descrição:** `proxy.ts` só escreve o header `x-pathname` **dentro da função `proxy`**, que só é executada quando o `matcher` decide rodá-la. Para as requisições que o `matcher` exclui (`missing: [next-router-prefetch, purpose: prefetch]` — as mesmas do achado da rodada anterior), a função `proxy` nunca é chamada, `buildResponse()` nunca roda, e o Next.js **encaminha a requisição original para o app sem tocar nos headers**. Ou seja: se o header `x-pathname` já vier setado pelo próprio cliente na requisição, ele chega intacto em `getPortalContext()` — que o lê via `headers()` e confia nele cegamente, sem comparar com a URL real que está sendo servida.

`x-pathname` é um header HTTP comum, sem qualquer restrição do Fetch spec (não está na lista de forbidden headers) — qualquer requisição real pode incluí-lo com valor arbitrário.

**Cenário de exploração concreto** (mesmo usuário do PoC da rodada anterior — autenticado no setor Fiscal, sem acesso a Financeiro):
```
curl -H "Cookie: <sessão válida do usuário fiscal>" \
     -H "purpose: prefetch" \
     -H "x-pathname: /fiscal/dashboard" \
     https://portal/financeiro/dashboard
```
1. O `matcher` vê `purpose: prefetch` presente → a condição `missing` não é satisfeita → o Proxy **não roda** pra essa requisição (comportamento intencional, é a correção da race condition).
2. Como o Proxy não rodou, o header `x-pathname: /fiscal/dashboard` forjado pelo cliente chega intocado no App Router.
3. A rota real servida continua sendo `/financeiro/dashboard` (o Next.js roteia pela URL, não pelo header) — `FinanceiroLayout` chama `getPortalContext()`.
4. `getPortalContext()` lê `x-pathname` = `/fiscal/dashboard` (forjado), calcula `setor = 'fiscal'`, confirma que o usuário tem acesso a `fiscal` (tem mesmo) → **libera o acesso**, sem nunca checar `financeiro`.
5. `app/financeiro/dashboard/page.tsx` renderiza normalmente com os dados de Financeiro, entregues a um usuário que só deveria ver Fiscal.

**Impacto:** idêntico ao achado crítico da rodada anterior — escalonamento de privilégio / IDOR entre setores para qualquer usuário autenticado, explorável com dois headers arbitrários, sem ferramentas especiais. A "defesa em profundidade" adicionada não é uma defesa de verdade porque a fonte do dado que ela confia (`x-pathname`) tem exatamente a mesma fraqueza que o `matcher` original: é um header que o cliente controla justamente nas requisições que escapam do Proxy.

**Recomendação:** não derivar a autorização de setor de um header preenchido condicionalmente pelo Proxy. Alternativas mais robustas (decisão técnica do Frontend Engineer):
- Cada `layout.tsx` de setor já conhece seu próprio setor estaticamente (`setorAtivo="fiscal"` hard-coded em `app/fiscal/layout.tsx`, idem para os outros quatro). Passar esse valor direto pra `getPortalContext(setorAtivo)` e checar `podeAcessarSetor(profile, setorAtivo)` ali dentro elimina a necessidade de qualquer header pra o nível de setor — não há nada pro cliente forjar, o valor vem do código, não da requisição.
- Para a checagem por página (mais granular, hoje só existe no Proxy), como os `layout.tsx` de setor não recebem a página-folha diretamente, uma opção é fazer cada `page.tsx` (ou um helper chamado por elas) declarar sua própria página de forma estática, do mesmo jeito que o setor — e não depender de reconstruir isso a partir de uma URL vinda de header.
- Se algum mecanismo baseado em header for realmente necessário (ex.: para diferenciar segmentos dinâmicos), ele precisa vir de algo que o Next.js garanta ser interno/não-sobrescrevível pelo cliente (e essa garantia precisaria ser validada com a mesma atenção dada aqui — não assumir).

## Altos

_Nenhum problema adicional de severidade alta além do crítico acima — ele cobre o risco central desta rodada._

## Médios

### 2. Fragilidade futura: se algum setor ganhar `loading.tsx`, o novo negar-por-padrão pode reintroduzir o bug original

**Local:** `lib/get-portal-context.ts` (redirect quando `x-pathname` ausente) + ausência atual de `loading.tsx` em `app/**`.

**Descrição:** Hoje nenhuma rota sob `app/fiscal`, `app/contabil`, `app/financeiro`, `app/pessoal`, `app/societario` tem `loading.tsx`, então (pela tabela de prefetch da doc do Next 16) essas rotas dinâmicas não são pré-buscadas de verdade — só o clique real bate no servidor, e o clique real sempre chega com o header certo (quando o Proxy roda para valer, ignorando o achado crítico #1). Se no futuro alguém adicionar um `loading.tsx` a qualquer um desses segmentos, o layout passaria a ser pré-buscável (prefetch de "layout até o loading boundary"), e esse prefetch é justamente uma das requisições que o `matcher` exclui do Proxy — reintroduzindo, por um caminho diferente, o mesmo sintoma que abriu esta issue (redirect indevido em navegação, resolvido só com F5), porque `getPortalContext()` bateria o "negar por padrão" durante esse prefetch legítimo.

**Impacto:** regressão silenciosa e adiada — só aparece quando alguém, sem saber desse acoplamento, adicionar um `loading.tsx` num setor.

**Recomendação:** deixar um comentário explícito em `getPortalContext.ts` avisando sobre esse acoplamento com a ausência de `loading.tsx`, ou (melhor) resolver o achado crítico #1 de um jeito que não dependa de "o Proxy rodou ou não" como sinal — isso também elimina este risco.

### 3. Nenhum teste cobrindo os cenários de regressão (mantido da rodada anterior)

**Local:** branch inteiro (nenhum arquivo de teste adicionado/alterado nas duas rodadas).

**Descrição:** A mudança mexe em duas camadas de segurança (Proxy + defesa em profundidade) e nenhuma delas tem cobertura automatizada. O Next 16 traz `unstable_doesProxyMatch` (`next/experimental/testing/server`) para testar se o matcher casa ou não para uma dada combinação de headers/URL.

**Impacto:** regressões futuras no matcher ou na lógica de `route-permissions.ts` não seriam pegas antes de produção — como aconteceu aqui, onde a correção do achado crítico da primeira rodada teve que ser revisada de novo por não ter sido validada contra o próprio cenário de ataque que motivou a mudança.

**Recomendação:** adicionar um teste unitário com `unstable_doesProxyMatch` cobrindo o matcher, e um teste de `getPortalContext`/`route-permissions` simulando exatamente o PoC do achado crítico #1 (header de setor/página forjado numa requisição que também escapa do Proxy) — esse teste falharia com o código atual e serve de guarda contra a próxima tentativa de correção.

## Baixos

### 4. Validação de build/lint não reproduzida nesta revisão (mantido da rodada anterior)

**Local:** N/A.

**Descrição:** O relatório do Frontend Engineer cita `tsc --noEmit`, `eslint` e `next build` passando. Esta revisão não reexecutou esses comandos.

**Impacto:** baixo — as mudanças são sintaticamente simples, risco de erro de tipo/lint é mínimo.

**Recomendação:** o QA, ao validar, pode rodar `next build` uma vez mais como checagem de sanidade, quando o achado crítico for endereçado.

# Recomendações

1. Antes de reabrir para revisão: resolver o achado Crítico #1 sem introduzir um novo canal de header forjável — usar o `setorAtivo` já hard-coded em cada `layout.tsx` de setor é o caminho mais direto pra eliminar a dependência de qualquer header nessa decisão.
2. Adicionar teste cobrindo exatamente o PoC do achado crítico (Médio #3) — isso teria pego o problema desta rodada antes de chegar à revisão.
3. Deixar comentário/aviso sobre o acoplamento com `loading.tsx` (Médio #2) enquanto o achado crítico não for resolvido de forma independente desse sinal.

# Decisão Final

Reprovado novamente. O trabalho desta rodada corrigiu corretamente o bug de cookies em redirects e organizou bem a lógica de permissão em `lib/route-permissions.ts`, mas a defesa em profundidade adicionada para o achado crítico da rodada anterior não fecha o bypass — ela troca um header forjável (`purpose`/`next-router-prefetch`) por outro (`x-pathname`) que só é confiável quando o Proxy roda, e é exatamente quando o Proxy não roda que esse novo header também fica sob controle do cliente. O cenário de exploração é o mesmo de antes, só precisa de um header a mais.

STATUS: REJECTED

ARTEFATO GERADO: CODE_REVIEW.md

AÇÃO NECESSÁRIA:

Corrigir os problemas apontados antes de prosseguir.
