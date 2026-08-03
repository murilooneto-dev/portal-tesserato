# Resumo da Revisão

Branch revisado: `agent/frontend-engineer/e309f12b` (a partir de `dev`).

Esta é a **terceira e última rodada** de revisão.

- Rodada 1 (commit `118f387`): reprovada — excluir prefetches do `matcher` também desligava a autorização por setor, que só existia no `proxy.ts`.
- Rodada 2 (commit `6efe13b`): reprovada — moveu a checagem pra `getPortalContext()`, mas a sinalizava por um header (`x-pathname`) que só era preenchido quando o Proxy rodava; nas mesmas requisições em que o Proxy era pulado, esse header também virava forjável, reabrindo o mesmo bypass.
- Rodada 3 (commit `1e5dc97`, revisada agora): o setor deixou de depender de qualquer header — passa a vir como argumento literal (`getPortalContext('fiscal')`, `getPortalContext('financeiro')` etc.), hard-coded em cada `layout.tsx` de setor. Validei o código, rodei a suite de testes nova (18/18 passando), `tsc --noEmit`, `eslint` nos arquivos tocados e `next build` — todos passando. **Aprovado.**

# Pontos Positivos

- O achado crítico está fechado de forma estrutural, não paliativa: `podeAcessarSetor(profile, setorAtivo)` em `lib/get-portal-context.ts:45` usa um `setorAtivo` que vem do parâmetro da função, e cada `layout.tsx` de setor (`app/fiscal`, `app/contabil`, `app/financeiro`, `app/pessoal`, `app/societario`) passa esse valor como string literal hard-coded (`getPortalContext('fiscal')` etc. — conferi os cinco arquivos). Não existe requisição, header, cookie ou parâmetro de rota envolvido nessa decisão — o valor vem do arquivo-fonte que o roteador do Next.js já escolheu executar pra aquela URL. Refiz o PoC das duas rodadas anteriores (`purpose: prefetch` + `x-pathname` forjado) mentalmente contra este código e ele não se aplica mais: não há mais nenhum dado de requisição no caminho da decisão de setor.
- O fail-open na checagem de página (que continua usando `x-pathname` como sinal best-effort) é uma escolha correta e bem justificada no comentário do código (`lib/get-portal-context.ts:50-71`): como o setor já foi decidido acima sem depender de header, um `x-pathname` ausente/forjado na checagem de página, na pior hipótese, libera uma página *dentro do setor ao qual o usuário já tem acesso legítimo* — nunca abre outro setor. Isso é consistente com o próprio desenho original do sistema, que já tratava `dashboard`/`agenda`/`bots`/`tarefas` como "sempre liberadas" (página é regra de negócio dentro do setor, não fronteira de segurança entre setores). Também elimina de vez o risco médio que eu tinha levantado na rodada anterior (regressão se algum setor ganhar `loading.tsx` no futuro): negar por padrão foi trocado por liberar por padrão exatamente na checagem que não é a fronteira de segurança, então não há mais "bomba-relógio" — resolvido, não só documentado.
- `lib/route-permissions.ts` continua como fonte única da lógica de setor/página, sem duplicação entre `proxy.ts` e `getPortalContext`.
- `redirectComCookies()` (da rodada anterior) permanece correto.
- A suite de testes nova é a parte mais forte desta entrega:
  - `tests/proxy-matcher.test.ts` usa `unstable_doesMiddlewareMatch` (nome real exportado por `node_modules/next/experimental/testing/server` nesta versão — confirmei rodando `node -e "require(...)"`, que dá exatamente o erro de `AsyncLocalStorage` que o comentário descreve sem o `tests/setup.ts`, e passa com ele) pra travar que **só** headers de prefetch pulam o Proxy — inclui um teste específico provando que um `x-pathname` forjado sozinho não pula o Proxy, fechando a lacuna que permitiu a rodada 2 passar despercebida.
  - `tests/route-permissions.test.ts` replica o PoC em nível de lógica pura.
  - `tests/setor-layouts.test.ts` é uma guarda de regressão inteligente: falha se qualquer `layout.tsx` de setor voltar a chamar `getPortalContext()` sem o literal correspondente — é exatamente a mudança que reabriria o achado crítico, agora impossível de reverter silenciosamente sem quebrar CI.
  - Rodei `npm test` localmente: 18/18 passando.
- Rodei `npx tsc --noEmit` (limpo), `npx eslint` nos arquivos tocados (limpo) e `npx next build` (compilou, gerou as 33 rotas esperadas, todas as rotas de setor continuam dinâmicas `ƒ` como antes — sem mudança na distribuição estática/dinâmica).

# Problemas Encontrados

## Críticos

Nenhum. O achado das rodadas 1 e 2 está fechado.

## Altos

Nenhum.

## Médios

Nenhum novo. Os dois médios da rodada anterior (acoplamento com `loading.tsx` e ausência de testes) foram endereçados nesta rodada (ver Pontos Positivos).

## Baixos

### 1. `eslint` do projeto como um todo não foi revalidado nesta revisão

**Local:** N/A.

**Descrição:** Rodei `eslint` apenas nos arquivos tocados por esta branch (limpo). Não rodei o lint completo do projeto — o Frontend Engineer mencionou warnings/erros pré-existentes em arquivos não relacionados a esta mudança, o que não é responsabilidade desta branch resolver.

**Impacto:** nenhum pra esta entrega especificamente.

**Recomendação:** nenhuma ação necessária agora; se o time quiser, pode abrir um item de tech debt separado pro lint pré-existente.

# Recomendações

Nenhuma pendência bloqueante. Sugestão opcional pro futuro: se algum dia a checagem de página precisar virar uma fronteira de segurança real (não só regra de negócio dentro do setor), ela vai precisar do mesmo tratamento que o setor recebeu aqui — literal estático por página, não header — mas isso não é necessário para o estado atual do produto.

# Decisão Final

Aprovado. O achado crítico que motivou duas reprovações está fechado de forma estrutural (setor vem de literal de código, não de dado de requisição), o fail-open na checagem de página é uma escolha de design correta e bem justificada, e a nova suite de testes trava exatamente o vetor que escapou da rodada anterior. Build, tipos e lint validados.

STATUS: APPROVED

ARTEFATO GERADO: CODE_REVIEW.md

PRÓXIMA ETAPA: QA Engineer
