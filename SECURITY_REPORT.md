# Resumo Executivo

Segunda rodada de revisão de segurança da autenticação step-up da seção ADMIN (TES-3), sobre a branch de remediação `agent/backend-engineer/remediation-de6a41be`, comparada com a branch da implementação `agent/frontend-engineer/55990627`.

**As três vulnerabilidades bloqueantes da primeira rodada foram efetivamente fechadas**, assim como as três médias e as duas baixas endereçadas nesta rodada. As correções são estruturais, não cosméticas: o gate de execução das RPCs foi movido para o mesmo lado do gate de autorização (`service_role`, a partir de Server Actions já validadas), e a verificação de sessão `ts_admin` passou a existir na superfície de escrita — inclusive nas escritas de Vínculos, que foram migradas do browser para Server Actions guardadas.

Restam duas médias novas, identificadas nesta rodada e **não bloqueantes**: uma Server Action de verificação de credencial que ficou fora do escopo da correção (`verificarSenhaDev`, MED-5) e o fator de custo do bcrypt (MED-6). Nenhuma vulnerabilidade crítica ou alta permanece aberta.

**STATUS: APPROVED** — liberado para Code Review, com as recomendações abaixo tratadas antes do Release.

# Escopo da Análise

Diff `origin/agent/frontend-engineer/55990627...origin/agent/backend-engineer/remediation-de6a41be` (9 arquivos, +272/−34):

- `supabase/migrations/019_admin_section_auth.sql`
- `lib/admin-auth/session.ts`, `lib/admin-auth/server.ts`
- `app/admin/bloqueio/actions.ts`, `app/admin/bloqueio/page.tsx`
- `app/fiscal/parametros/actions.ts`
- `app/(comum)/vinculos/actions.ts` (novo), `app/(comum)/vinculos/VinculosClient.tsx`
- `BACKEND.md`

Verificação cruzada fora do diff: `lib/supabase/server.ts`, todos os chamadores de `getAuthenticatedAdmin()` no repositório, `components/fiscal/DevLock.tsx`, `DEPLOY.md`, `proxy.ts`.

Análise estática de código e migrations, sem execução contra ambiente vivo. Os cenários abaixo derivam dos grants declarados e do comportamento documentado do PostgREST e do Next.js.

# Vulnerabilidades Encontradas

## Críticas

Nenhuma. **CRIT-1 fechada.**

**CRIT-1 — RPCs `SECURITY DEFINER` expostas a `authenticated` — RESOLVIDA.**
`019_admin_section_auth.sql:101,136` — `grant execute ... to authenticated` foi substituído por `revoke execute ... from authenticated, anon` nas duas RPCs, mantendo o `revoke all ... from public` que já existia. `admin_login` e `admin_trocar_senha` passaram a ser chamadas via `createAdminClient()` (`service_role`) em `app/admin/bloqueio/actions.ts:47,96`, depois da validação de sessão do portal + `role='admin'`. Confirmado por varredura: não há nenhum outro chamador de `rpc('admin_')` no repositório. A cadeia de ataque da primeira rodada (colaborador sem `role='admin'` chamando `/rest/v1/rpc/admin_trocar_senha` com a anon key e um `p_id` arbitrário) deixa de existir — o PostgREST não expõe mais essas funções ao papel `authenticated`.

Comportamento de falha verificado e correto: se `SUPABASE_SERVICE_ROLE_KEY` não estiver configurada, `createAdminClient()` lança, o `try/catch` retorna o erro genérico e o login da área ADMIN simplesmente não acontece — falha fechada, sem caminho alternativo. Ver LOW-3 sobre a observabilidade dessa falha.

## Altas

Nenhuma. **ALTA-1 e ALTA-2 fechadas.**

**ALTA-1 — step-up não aplicado na superfície de escrita — RESOLVIDA.**
Introduzida `getValidAdminSession()` (`lib/admin-auth/server.ts:60`), variante sem `redirect()` — escolha correta para Server Actions, onde um `redirect()` destruiria o contrato de retorno `{ error }` no meio de uma submissão. Verificado por varredura das declarações do arquivo: **as 11 actions de escrita de `app/fiscal/parametros/actions.ts` chamam `exigirSessaoAdmin()` como primeira linha** (`salvarComunicado`, `atualizarPerfil`, `criarUsuario`, `deletarUsuario`, `salvarConfiguracoes`, `salvarTemplate`, `aplicarTemplateAClientes`, `salvarTemplateGrupo`, `aplicarTemplateGrupoAClientes`, `analisarParcelamentosDuplicados`, `limparParcelamentosDuplicados`). A 12ª export do arquivo, `verificarSenhaDev`, não recebeu a guarda — ver MED-5.

Vínculos: `VinculosClient.tsx` não importa mais `lib/supabase/client`; as escritas foram para `app/(comum)/vinculos/actions.ts`, cujo helper `exigirAcessoAdmin()` encadeia usuário autenticado → `role='admin'` → `getValidAdminSession()` antes de qualquer query. O vetor `Next-Action` a partir de rota fora de `ROTAS_ADMIN` deixa de funcionar, porque a autorização não depende mais do `pathname` avaliado pelo `proxy.ts`.

**ALTA-2 — `getAuthenticatedAdmin()` sem check de papel — RESOLVIDA, com desvio aceito.**
O Backend não embutiu o check de `role='admin'` dentro do helper, e a decisão está correta: a varredura confirma que `getAuthenticatedAdmin()` é usado em `app/(comum)/intranet/actions.ts`, `app/contabil/clientes/actions.ts`, `app/fiscal/clientes/actions.ts`, `app/pessoal/clientes/actions.ts`, `app/fiscal/bots/page.tsx` e `lib/tarefa-tipos-actions.ts` — fluxos deliberadamente abertos a colaboradores não-admin. Embutir o check ali quebraria esses fluxos, e minha recomendação original não considerou esse alcance.

O risco concreto que eu apontei era pontual — `salvarComunicado` e `salvarConfiguracoes` eram as duas únicas actions que dependiam apenas do helper — e ambas agora fazem o `select role` e negam quem não for admin (`actions.ts:34-37` e `:150-153`). O risco está fechado. Permanece a observação de design registrada em LOW-4 (o nome do helper sugere uma autorização que ele não faz).

## Médias

### MED-5 (NOVA) — `verificarSenhaDev` é um oráculo de senha sem guarda de sessão ADMIN

**Categoria:** Broken Authentication / Improper Rate Limiting (OWASP A07)
**Arquivo:** `app/fiscal/parametros/actions.ts:426`

Única export do arquivo que não recebeu `exigirSessaoAdmin()`. A action recebe `login`/`senha`, compara o login com `DEV_MASTER_EMAIL` e, se bater, executa `signInWithPassword` contra o Supabase, retornando `ok: true/false`. A única barreira é `getAuthenticatedAdmin()`, que aceita **qualquer** usuário autenticado do portal — nem `role='admin'`, nem sessão `ts_admin`.

Qualquer colaborador logado pode invocá-la via `Next-Action` a partir de qualquer rota e usar o retorno booleano como oráculo de força bruta contra a conta master de desenvolvimento. O rate limit de autenticação do Supabase é por IP de origem, e aqui a origem é o servidor da aplicação — o mesmo IP para todas as tentativas, o que enfraquece a proteção em vez de reforçá-la.

Impacto direto limitado: o `DevLock` que consome essa action só controla estado client-side (`setDestravado`), e as ferramentas que ele esconde já estão protegidas pelas actions guardadas — não há elevação de privilégio no portal. O ativo em risco é a senha da conta `DEV_MASTER_EMAIL`.
**Risco:** Médio. Pré-existente ao TES-3, mas é a única omissão dentro do escopo declarado desta remediação e a correção é uma linha.
**Recomendação:** `exigirSessaoAdmin()` como primeira linha, mais um check de `role='admin'`; opcionalmente um contador de tentativas por sessão.

### MED-6 (NOVA) — Fator de custo do bcrypt em 6 (padrão do `gen_salt('bf')`)

**Categoria:** Cryptographic Failures (OWASP A02)
**Arquivo:** `019_admin_section_auth.sql:31,127,156`

As três chamadas usam `gen_salt('bf')` sem parâmetro, o que no pgcrypto significa custo 6 (2⁶ iterações). A recomendação corrente é ≥ 10, tipicamente 12 — a diferença é de duas ordens de grandeza no custo de quebra offline de um hash roubado.

Exposição limitada: `senha_hash` não é alcançável por cliente algum (RLS sem policies em `admin_users`, RPCs restritas a `service_role`, nenhuma RPC retorna o campo), então isso só importa em cenário de comprometimento do banco ou vazamento de backup.
**Risco:** Baixo-médio.
**Recomendação:** `gen_salt('bf', 12)` nas três ocorrências. **Acoplamento importante:** o hash descartável do caminho de equalização de tempo (`:57`) é `$2a$06$...`; se o custo dos hashes reais subir para 12 e o descartável ficar em 06, o oráculo de tempo da BAIXA-2 reabre invertido (o caminho "usuário existe" passa a ser ~64× mais lento). Os dois valores precisam mudar juntos.

### MED-4 (mantida da 1ª rodada, não bloqueante) — leitura de `tarefa_vinculos` aberta a qualquer autenticado

`009_tarefa_vinculos.sql:23` — `select using (auth.uid() is not null)` inalterado. Com as escritas agora em Server Actions, o step-up protege a alteração dos dados; a leitura via PostgREST continua aberta a qualquer usuário do portal. Confirmo a classificação anterior: é decisão de classificação de dado, não defeito — **não sobe para bloqueante**. Se a política for "só quem passou pelo step-up vê vínculos", restringir o `select` a `is_admin()`; caso contrário, documentar que a proteção de Vínculos é de interface.

### Fechadas nesta rodada

- **MED-1 (open redirect) — RESOLVIDA.** `app/admin/bloqueio/page.tsx:22` troca `startsWith('/')` por `ehRotaAdmin(nextParam)`, validando contra a allowlist real. `//evil.com` e `/\evil.com` caem no `DESTINO_PADRAO`. O `next` que chega ao `BloqueioForm` (e ao `router.push`) é o valor já validado no servidor.
- **MED-2 (DoS do lockout) — RESOLVIDA.** `019:63-68` zera `tentativas_falhas` e `bloqueado_ate` quando o bloqueio anterior já expirou, antes de avaliar a tentativa. Lógica conferida: após o reset o contador volta a 0 e o incremento de uma nova falha parte de 1, de modo que voltam a ser necessárias 5 tentativas para reabrir uma janela — em vez de uma a cada 15 min. Residual esperado e aceito em RISCOS RESIDUAIS.
- **MED-3 (força do secret) — RESOLVIDA.** `lib/admin-auth/session.ts:38-43` exige ≥ 32 bytes e lança com mensagem acionável. O caminho de erro é o mesmo do segredo ausente, que já é falha fechada (`verifyAdminToken` captura e retorna `null`; `signAdminToken` propaga e impede a emissão de token).

## Baixas

- **BAIXA-1 (pin de algoritmo) — RESOLVIDA.** `session.ts:78` — `jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] })`. `iss`/`aud` seguem sem binding; opcional, sem risco no uso atual.
- **BAIXA-2 (oráculo de tempo) — RESOLVIDA.** `019:57` — `perform crypt(p_senha, '$2a$06$...')` no caminho "usuário não encontrado", com custo idêntico ao dos hashes reais. Ver o acoplamento descrito em MED-6.
- **BAIXA-3 (semente versionada) / BAIXA-4 (auditoria) / BAIXA-5 (`secure` fixo)** — mantidas abertas por decisão de escopo, não bloqueantes. Com a CRIT-1 fechada, a mitigação da semente (`trocar_senha=true`) volta a ser efetiva de fato, porque não há mais caminho que a contorne. Reforço BAIXA-4: sem trilha de auditoria do step-up, um abuso continua indetectável a posteriori — é o item que eu priorizaria depois desta entrega.
- **LOW-3 (NOVA) — falha por falta de `SUPABASE_SERVICE_ROLE_KEY` é indistinguível de senha errada.** `app/admin/bloqueio/actions.ts:41-44` converte o erro de configuração em `ERRO_CREDENCIAL`. Correto do ponto de vista de não vazar estado interno, mas transforma um erro de deploy em "senha inválida" para o administrador. A env já consta em `DEPLOY.md:10`; sugiro um `console.error` no catch para o diagnóstico ficar no log do servidor.
- **LOW-4 (NOVA) — `getAuthenticatedAdmin()` tem nome que promete autorização que ele não faz.** Retorna cliente `service_role` a qualquer autenticado; o "Admin" no nome já induziu duas actions ao erro (a ALTA-2 desta revisão). Renomear para algo como `getAuthenticatedServiceClient()` evita a terceira.
- **LOW-5 (NOVA) — ausência de `grant execute ... to service_role` explícito.** As RPCs dependem do default privilege do Supabase para que `service_role` mantenha o `execute` após os revokes. Funciona, mas é implícito: um `grant execute on function ... to service_role` deixa a intenção explícita e imune a variação de default privileges entre ambientes. Falha seria fechada (login quebrado), não aberta.

# Recomendações

Nenhuma bloqueante. Antes do Release, em ordem de prioridade:

1. **MED-5** — `exigirSessaoAdmin()` + check de `role='admin'` em `verificarSenhaDev`. Uma linha, fecha a última omissão do escopo desta remediação.
2. **MED-6** — `gen_salt('bf', 12)` nas três ocorrências, **junto** com o ajuste do hash descartável de equalização de tempo para o mesmo custo.
3. **BAIXA-4** — trilha de auditoria do step-up (sucesso/falha de login, bloqueios, trocas de senha).
4. **LOW-3, LOW-4, LOW-5** — endurecimento e legibilidade.
5. **MED-4** — decisão de produto sobre a política de leitura de `tarefa_vinculos`.
6. **BAIXA-3** — troca da semente como item obrigatório do checklist de release.

Para o QA, testes negativos que recomendo explicitamente: chamar `/rest/v1/rpc/admin_login` e `/rest/v1/rpc/admin_trocar_senha` com a anon key e um JWT de usuário comum (deve retornar erro de permissão); invocar uma Server Action de Parâmetros via `Next-Action` a partir de `/intranet` com sessão do portal válida mas sem `ts_admin` (deve retornar acesso negado); `/admin/bloqueio?next=//exemplo.com` (deve cair no destino padrão); e 5 falhas de login seguidas de espera pelo fim do bloqueio, confirmando que a senha correta volta a funcionar.

# Riscos Residuais

- **Revogação de sessão é temporal, não imediata.** Desativar um usuário (`ativo=false`) ou trocar sua senha não invalida um `ts_admin` já emitido — a verificação é stateless. O cookie segue válido por até 30 min de inatividade / 8h absolutas. Mitigável com uma checagem de estado em `getValidAdminSession()` ou versionamento de senha no claim.
- **Lockout ainda permite negação de serviço em janelas.** Com o reset da MED-2, um atacante que conheça o username ainda consegue bloquear o administrador por 15 min a cada 5 tentativas erradas. É inerente a lockout por conta; só some com throttling por IP/sessão na Server Action.
- **A autorização das escritas de Vínculos agora depende inteiramente do código.** Como `exigirAcessoAdmin()` devolve um cliente `service_role`, a RLS `is_admin()` deixa de ser rede de proteção nesse caminho: uma action futura nesse arquivo que esqueça a guarda escreve sem nenhum obstáculo no banco. É a contrapartida aceita da correção da ALTA-1; vale um comentário de alerta no topo do arquivo.
- **Sem segundo fator.** A proteção da seção ADMIN continua sendo "algo que você sabe", duas vezes.
- **Gestão multiusuário só por SQL direto**, sem UI e sem auditoria de quem criou quem.
- **Sem execução em ambiente vivo**, o efeito real dos revokes e da RLS não foi verificado empiricamente — daí os testes negativos sugeridos ao QA.

# Conformidade com OWASP Top 10

| # | Categoria | Situação |
|---|---|---|
| A01 | Broken Access Control | **Conforme** — CRIT-1, ALTA-1 e ALTA-2 fechadas; MED-4 é decisão de classificação de dado |
| A02 | Cryptographic Failures | Parcial — MED-3 fechada; MED-6 (custo do bcrypt) em aberto, exposição limitada |
| A03 | Injection | Conforme |
| A04 | Insecure Design | **Conforme** — a defesa em profunidade especificada passou a existir também na superfície de escrita |
| A05 | Security Misconfiguration | **Conforme** — grants excessivos removidos; LOW-5 é hardening |
| A06 | Vulnerable Components | Conforme — `jose@^6.2.8`, sem CVE conhecida na linha 6.x |
| A07 | Identification and Authentication Failures | Parcial — CRIT-1, MED-2 e BAIXA-2 fechadas; MED-5 (`verificarSenhaDev`) em aberto |
| A08 | Software and Data Integrity Failures | Conforme no escopo revisado |
| A09 | Logging and Monitoring Failures | **Não conforme** — BAIXA-4, sem trilha de auditoria do step-up (não bloqueante, mas é a maior lacuna remanescente) |
| A10 | SSRF | Não aplicável |

Checklist adicional: SQL/NoSQL Injection, XSS, Command Injection, Path Traversal, File Upload — OK ou não aplicáveis. CSRF — mitigado por `SameSite=Strict` + Server Actions. Secrets no código — apenas a semente (BAIXA-3). Senhas em texto puro — nenhuma armazenada; `senha_hash` inalcançável por qualquer cliente. Logs com dados sensíveis — nenhum log de senha. CORS — inalterado. CSP — ausente no projeto (pré-existente, fora do escopo).

# Parecer Final

A remediação atacou a causa das falhas, não os sintomas: os grants foram removidos na origem em vez de compensados no app, a guarda de sessão passou a existir em todas as actions de escrita, e as escritas de Vínculos saíram do browser. O desvio na ALTA-2 foi tecnicamente justificado — a varredura dos chamadores de `getAuthenticatedAdmin()` confirma que a mudança ampla que eu havia sugerido quebraria fluxos legítimos de não-admins, e a correção cirúrgica fecha o risco concreto. Não há vulnerabilidade crítica ou alta em aberto.

STATUS: APPROVED

ARTEFATO GERADO: SECURITY_REPORT.md

PRÓXIMA ETAPA: QA Engineer

Observação de fluxo: como o Gerente de Projeto encaminha esta feature ao Code Reviewer antes do QA, a liberação da Segurança vale para essa etapa. MED-5 e MED-6 devem entrar antes do Release, não do Code Review.
