# Resumo Executivo

Revisão de segurança da autenticação step-up da seção ADMIN (TES-3), branch `agent/frontend-engineer/55990627` (backend + frontend), comparada com `origin/dev`.

O desenho central está correto: bcrypt é calculado e comparado exclusivamente dentro do Postgres, `admin_users` tem RLS habilitada sem nenhuma policy (nenhum `select` para `anon`/`authenticated`), o hash nunca trafega para o cliente, as mensagens de erro são genéricas (RN3), o cookie `ts_admin` é `HttpOnly` + `Secure` + `SameSite=Strict`, e há janela deslizante de 30 min com teto absoluto de 8h corretamente implementado (`loginAt` preservado nas renovações).

O problema não está na criptografia — está na **camada de autorização em volta dela**. Duas RPCs `SECURITY DEFINER` recebem `grant execute ... to authenticated` sem nenhuma verificação de autorização interna, e a senha semente está versionada no repositório. A combinação permite que **qualquer usuário logado no portal (inclusive não-admin) assuma a credencial ADMIN chamando o PostgREST diretamente**, sem passar por nenhuma linha do código Next.js. Além disso, a "defesa em profundidade" descrita em RNF2/CA5 cobre a renderização das páginas, mas **não cobre a superfície de escrita** (Server Actions de Parâmetros e escritas diretas de Vínculos).

**STATUS: REJECTED** — 1 vulnerabilidade CRÍTICA e 2 ALTAS precisam ser corrigidas antes do Code Review/QA.

# Escopo da Análise

Diff `origin/dev...agent/frontend-engineer/55990627` (17 arquivos):

- `supabase/migrations/019_admin_section_auth.sql` — tabela `admin_users`, RLS, semente, RPCs `admin_login`, `admin_trocar_senha`, `admin_user_create`, `admin_user_set_ativo`
- `lib/admin-auth/session.ts`, `lib/admin-auth/server.ts`, `lib/admin-auth/constants.ts`
- `proxy.ts` (middleware — verificação e renovação do `ts_admin`)
- `lib/rotas-admin.ts`
- `app/admin/bloqueio/{page.tsx,actions.ts,BloqueioForm.tsx}`
- `components/admin/SairAdminButton.tsx`
- `app/fiscal/parametros/page.tsx`, `app/(comum)/vinculos/page.tsx`
- `DEPLOY.md`, `package.json` (`jose@^6.2.8`)

Contexto adicional consultado (fora do diff, mas na superfície de ataque da feature): `app/fiscal/parametros/actions.ts`, `app/(comum)/vinculos/VinculosClient.tsx`, `lib/supabase/server.ts`, `supabase/migrations/009_tarefa_vinculos.sql`, `supabase/migrations/003_fix_rls_recursion_dev.sql`.

Análise estática de código e de migrations. Não houve execução contra ambiente vivo (sem acesso a instância Supabase); os cenários de exploração abaixo são derivados dos grants declarados nas migrations e do comportamento documentado do PostgREST e do Next.js.

# Vulnerabilidades Encontradas

## Críticas

### CRIT-1 — RPCs `SECURITY DEFINER` expostas a `authenticated` sem autorização interna → tomada da credencial ADMIN

**Categoria:** Broken Access Control / Broken Authentication (OWASP A01, A07)
**Arquivo:** `supabase/migrations/019_admin_section_auth.sql:82`, `:110`

**Descrição.** `admin_login(text, text)` e `admin_trocar_senha(uuid, text)` recebem `grant execute ... to authenticated`. Como são funções do schema `public`, o PostgREST as expõe em `/rest/v1/rpc/admin_login` e `/rest/v1/rpc/admin_trocar_senha` para qualquer portador de um JWT de usuário autenticado, usando a `NEXT_PUBLIC_SUPABASE_ANON_KEY` (que é pública por definição).

`admin_trocar_senha` **não verifica absolutamente nada** sobre quem chama: recebe `p_id` como parâmetro, valida só o comprimento da senha nova e faz `update admin_users set senha_hash = ...`. O comentário na migration afirma que "`p_id` vem sempre da sessão `ts_admin` já verificada no servidor" — isso é verdade no caminho da Server Action (`app/admin/bloqueio/actions.ts:76`), mas é uma garantia da aplicação, não da função. A função aceita qualquer `p_id` de qualquer chamador autenticado.

Do mesmo modo, a checagem `profiles.role = 'admin'` que restringe quem pode tentar o login existe **apenas** em `app/admin/bloqueio/actions.ts:31`; a RPC não a replica.

**Cenário de exploração (pré-primeira troca de senha):**

1. Um colaborador qualquer do portal — setor Pessoal, sem `role='admin'` — abre o DevTools e pega a anon key e seu próprio access token.
2. `POST /rest/v1/rpc/admin_login {"p_username":"ADMIN","p_senha":"ADMIN@123PASSWORD"}`. A senha está versionada em texto puro na migration `019` (linha 31) e no corpo desta issue. Resposta: `status='ok'`, **e o `id` (uuid) do usuário ADMIN**.
3. `POST /rest/v1/rpc/admin_trocar_senha {"p_id":"<id do passo 2>","p_senha_nova":"..."}`. A senha do ADMIN é trocada e `trocar_senha` vai a `false`.

O atacante agora controla a credencial da seção ADMIN, o fluxo de troca obrigatória (DP4) foi consumido sem que nenhum administrador legítimo tenha passado por ele, e o admin real fica sem acesso à área restrita (a senha que ele deveria definir já foi definida por outro). O passo 3 sozinho também é explorável por qualquer um que obtenha o uuid por outra via.

**Impacto.** Comprometimento total do controle de acesso que esta feature existe para criar; negação de acesso ao administrador legítimo; a troca obrigatória da semente deixa de ser uma mitigação.
**Risco:** Alto (exploração trivial, pré-condição = ter qualquer conta no portal; a credencial semente é conhecida).
**Recomendação.**
1. Remover `grant execute ... to authenticated` das duas RPCs. Chamá-las a partir do servidor com o `SUPABASE_SERVICE_ROLE_KEY` (`createAdminClient()`), depois de a Server Action ter validado sessão + `role='admin'`. Assim o gate de autorização e o gate de execução ficam no mesmo lado.
2. Se por alguma razão o `grant` a `authenticated` precisar ficar: `admin_trocar_senha` **tem** que exigir a senha atual (`p_senha_atual`, verificada com `crypt`) e `admin_login` precisa validar internamente que `auth.uid()` corresponde a um `profiles.role='admin'`.
3. Não retornar o `id` de `admin_users` para o cliente na resposta da RPC quando ela for chamada por um caminho que não seja o servidor confiável.
**Prioridade:** Imediata — bloqueia a liberação.

## Altas

### ALTA-1 — Step-up não é aplicado na superfície de escrita (Server Actions de Parâmetros e escritas de Vínculos)

**Categoria:** Broken Access Control (OWASP A01)
**Arquivos:** `app/fiscal/parametros/actions.ts` (todas as ~11 actions), `app/(comum)/vinculos/VinculosClient.tsx:18`, `proxy.ts:63`

**Descrição.** `requireAdminSection()` foi adicionada apenas aos dois RSC de página (`app/fiscal/parametros/page.tsx:23` e `app/(comum)/vinculos/page.tsx:19`). Ela protege a **renderização** — o que é correto e cobre o acesso direto por URL. Mas:

- **Parâmetros:** nenhuma das Server Actions em `app/fiscal/parametros/actions.ts` chama `requireAdminSection()`. `criarUsuario`, `deletarUsuario`, `atualizarPerfil`, `salvarConfiguracoes`, `salvarTemplate`, `aplicarTemplateAClientes`, `limparParcelamentosDuplicados` etc. continuam checando só `profiles.role='admin'`, exatamente como antes da feature.
- **Vínculos:** `VinculosClient.tsx` escreve em `tarefa_vinculos` **direto do browser** via `lib/supabase/client`, sem passar por Server Action nenhuma. O único controle é a RLS `Admin gerencia tarefa_vinculos ... using (is_admin())` (`009_tarefa_vinculos.sql:24`), que não sabe o que é `ts_admin`.

O middleware não fecha essa lacuna. `ehRotaAdmin(pathname)` casa por caminho, e no Next.js os IDs de Server Action são globais: um `POST` com o header `Next-Action: <id>` para **qualquer** rota da aplicação (ex.: `/intranet`) executa a action, e nesse request `ehRotaAdmin('/intranet')` é `false`, então o bloco de verificação do `ts_admin` em `proxy.ts:63` nem roda. A própria documentação do Next.js orienta a não tratar middleware como camada de autorização por esse motivo.

**Cenário de exploração.** Um admin do portal (ou alguém em uma máquina destravada com a sessão do portal aberta — que é exatamente o cenário que o step-up quer bloquear) que nunca digitou a senha ADMIN: `POST /intranet` com `Next-Action: <id de deletarUsuario>` e o payload correspondente. A action executa, o usuário é deletado, e a tela de bloqueio nunca apareceu. Em Vínculos, basta o mesmo ator chamar `supabase.from('tarefa_vinculos').delete()` do console.

**Impacto.** O step-up vira um controle de navegação/UI, não de dados. RNF2/RN1/CA5 ("proteção antes de qualquer query", "defesa em profundidade") não são atendidos para operações de escrita, que são justamente as de maior impacto (criar/apagar usuários do portal, alterar configurações globais).
**Risco:** Alto.
**Recomendação.**
1. `await requireAdminSection()` como primeira linha de **cada** Server Action de `app/fiscal/parametros/actions.ts` (ou uma variante que lance `Error('Acesso negado.')` em vez de `redirect()`, mais adequada a contexto de action).
2. Migrar as escritas de `VinculosClient.tsx` para Server Actions guardadas pela mesma função, removendo o acesso direto do browser à tabela.
3. Ajustar a redação de `BACKEND.md`/`FRONTEND.md`, que hoje afirmam cobertura de Server Actions que não existe.
**Prioridade:** Antes do QA.

### ALTA-2 — `getAuthenticatedAdmin()` entrega cliente `service_role` a qualquer usuário autenticado (pré-existente)

**Categoria:** Privilege Escalation / Broken Access Control (OWASP A01)
**Arquivo:** `lib/supabase/server.ts:42-50`

**Descrição.** `getAuthenticatedAdmin()` verifica apenas que existe um `user` logado e, se `SUPABASE_SERVICE_ROLE_KEY` estiver definida, retorna um cliente **service_role** — que ignora toda a RLS. Não há checagem de `role='admin'` dentro do helper, apesar do nome. A maior parte das actions compensa isso com um `if (callerProfile?.role !== 'admin')` logo depois, mas **`salvarComunicado` (`actions.ts:11-18`) e `salvarConfiguracoes` (`actions.ts:110-117`) não fazem essa checagem** — confiam só no helper.

**Cenário de exploração.** Qualquer colaborador autenticado invoca `salvarConfiguracoes` (via `Next-Action`, conforme ALTA-1) e sobrescreve `app_settings` com privilégio de service_role.

**Impacto.** Escrita não autorizada em configurações globais do portal (comunicado do dashboard, configurações de e-mail e demais chaves de `app_settings`).
**Risco:** Médio-alto. Não foi introduzido por TES-3, mas está dentro da superfície que esta feature declara proteger, então entra no parecer.
**Recomendação.** Fazer o próprio `getAuthenticatedAdmin()` validar `profiles.role='admin'` antes de devolver o cliente service_role (retornando `{ user: null, supabase: null }` caso contrário), e acrescentar `requireAdminSection()` conforme ALTA-1.
**Prioridade:** Antes do Release.

## Médias

### MED-1 — Open redirect via parâmetro `next` (URL protocol-relative)

**Arquivo:** `app/admin/bloqueio/page.tsx:21`, `app/admin/bloqueio/BloqueioForm.tsx:66,83`

A validação é `nextParam.startsWith('/')`. `//evil.com` e `/\evil.com` passam nesse teste e são interpretados pelo browser (e por `redirect()`/`router.push()`) como URL absoluta para outro host. O `next` chega por query string, então um link `/admin/bloqueio?next=//evil.com` enviado a um administrador o leva, após um login bem-sucedido na área restrita, para um domínio controlado pelo atacante — cenário clássico de phishing com contexto de confiança.
**Recomendação:** validar contra a allowlist que já existe: aceitar `next` apenas se `ehRotaAdmin(next)` for verdadeiro; senão usar `DESTINO_PADRAO`. Rejeitar explicitamente `//` e `/\`.

### MED-2 — Lockout permite DoS permanente da única credencial ADMIN

**Arquivo:** `supabase/migrations/019_admin_section_auth.sql:67-77`

O contador `tentativas_falhas` **nunca é zerado quando o bloqueio expira** — só um login bem-sucedido o zera. Depois das 5 primeiras falhas, cada nova tentativa incorreta cai em `tentativas_falhas + 1 >= 5` e reabre uma janela de 15 minutos. Como só existe um usuário ADMIN e o username é público (`ADMIN`, na migration e no enunciado da issue), qualquer usuário autenticado consegue manter o administrador legítimo permanentemente bloqueado com uma tentativa errada a cada 15 minutos — e, pela CRIT-1, direto na RPC, sem tocar na UI.
**Recomendação:** zerar `tentativas_falhas` quando `bloqueado_ate` já expirou (antes de avaliar a tentativa atual); adicionar throttling por IP/sessão na Server Action, além do contador por conta; e prever um caminho administrativo de desbloqueio.

### MED-3 — `ADMIN_SESSION_SECRET` sem validação de força

**Arquivo:** `lib/admin-auth/session.ts:23-31`

`getSecretKey()` só rejeita valor ausente/vazio. Um segredo de 6 caracteres é aceito silenciosamente. Com HS256, um segredo fraco permite recuperação offline por força bruta a partir de **um único** cookie `ts_admin` capturado, e a partir daí forjar sessões ADMIN arbitrárias (`sub`/`username`/`mustChangePassword=false` à escolha).

Comportamento na ausência da env está correto e vale registrar como ponto positivo: o `throw` cai dentro do `try` de `verifyAdminToken`, que retorna `null` → falha fechada (nega acesso); e `signAdminToken` propaga o erro, quebrando o login em vez de emitir um token inseguro.
**Recomendação:** rejeitar segredos com menos de 32 bytes no `getSecretKey()` com mensagem explícita, e manter o item já adicionado ao checklist de `DEPLOY.md`.

### MED-4 — Dados de Vínculos legíveis por qualquer autenticado na camada de banco

**Arquivo:** `supabase/migrations/009_tarefa_vinculos.sql:23`

`create policy "Autenticados leem tarefa_vinculos" ... using (auth.uid() is not null)` — a página `/vinculos` passou a exigir sessão ADMIN, mas o dado continua legível por qualquer usuário do portal via PostgREST. O step-up protege a tela, não a tabela.
**Recomendação:** se a classificação do dado justifica exigir step-up para vê-lo, restringir o `select` a `is_admin()`. Caso contrário, documentar explicitamente que a proteção de Vínculos é de interface, para não gerar falsa expectativa.

## Baixas

### BAIXA-1 — `jwtVerify` sem pin explícito de algoritmo e sem binding de `iss`/`aud`
`lib/admin-auth/session.ts:62` — `jwtVerify(token, getSecretKey())`. Com chave simétrica o `jose` já restringe a família HMAC e recusa `alg: none`, então não há confusão de algoritmo explorável aqui; ainda assim, passar `{ algorithms: ['HS256'], issuer, audience }` é defesa barata contra regressão futura e contra reuso do mesmo segredo em outro contexto.

### BAIXA-2 — Oráculo de tempo para enumeração de usuários em `admin_login`
`019_admin_section_auth.sql:47-52` — no caminho "usuário inexistente/inativo" a função retorna sem executar `crypt()`; no caminho "usuário existe" paga o custo do bcrypt. A diferença de latência é mensurável e revela a existência do usuário, contradizendo a intenção da RN3 (a mensagem de erro é genérica, o tempo de resposta não é). Impacto real baixo hoje (um único usuário, de nome conhecido), relevante quando a gestão multiusuário do roadmap existir.
**Recomendação:** executar um `crypt()` descartável contra um hash fixo no caminho "não encontrado".

### BAIXA-3 — Senha semente versionada no repositório
`019_admin_section_auth.sql:31` — `ADMIN@123PASSWORD` em texto puro no controle de versão. Foi um requisito explícito do cliente e a mitigação (`trocar_senha=true`) está implementada, então não classifico como alta por si só; mas essa mitigação vale **apenas** no caminho da aplicação (é a CRIT-1 que a anula), e não há prazo de validade: se ninguém acessar a área ADMIN, a credencial conhecida continua válida indefinidamente.
**Recomendação:** após corrigir a CRIT-1, tratar a troca da semente como item obrigatório do checklist de release (`DEPLOY.md`) e considerar gerar a senha inicial fora do repositório na primeira execução.

### BAIXA-4 — Ausência de trilha de auditoria do step-up
Só existe `ultimo_acesso_em`. Não há registro de tentativas falhas, de bloqueios, de logouts nem de trocas de senha — o portal já tem `task_logs`/`deletion_logs`, então o padrão existe. Sem isso, uma exploração da CRIT-1 é indetectável a posteriori.
**Recomendação:** registrar sucesso/falha de login ADMIN, bloqueios e trocas de senha em tabela de auditoria.

### BAIXA-5 — `secure: true` fixo no cookie
`lib/admin-auth/server.ts:12` e `proxy.ts:90`. Correto para produção; em desenvolvimento local sobre HTTP o cookie simplesmente não é setado, o que pode induzir alguém a relaxar a flag por conveniência. **Recomendação:** documentar o uso de HTTPS local (ou `next dev --experimental-https`) em vez de tornar a flag condicional.

# Recomendações

Ordem sugerida de correção:

1. **(Backend Engineer)** CRIT-1 — revogar os `grant ... to authenticated` das RPCs `admin_login`/`admin_trocar_senha` e passar a chamá-las via `service_role` a partir das Server Actions já autorizadas; alternativamente, exigir senha atual em `admin_trocar_senha` e validar `auth.uid()`/role dentro das funções. **Bloqueante.**
2. **(Backend Engineer)** ALTA-1 — `requireAdminSection()` (variante que lança, não que redireciona) em todas as Server Actions de `app/fiscal/parametros/actions.ts`; migrar as escritas de `VinculosClient.tsx` para Server Actions guardadas. **Bloqueante.**
3. **(Backend Engineer)** ALTA-2 — checar `role='admin'` dentro de `getAuthenticatedAdmin()`.
4. **(Backend Engineer)** MED-2 — zerar `tentativas_falhas` na expiração do bloqueio + throttling por IP.
5. **(Frontend/Backend)** MED-1 — validar `next` com `ehRotaAdmin()`.
6. **(Backend Engineer)** MED-3 — exigir ≥ 32 bytes em `ADMIN_SESSION_SECRET`.
7. **(Produto/Backend)** MED-4 — decidir e documentar a política de leitura de `tarefa_vinculos`.
8. Baixas — endurecimento (pin de algoritmo, `crypt()` dummy, auditoria, checklist da semente).

# Riscos Residuais

Mesmo após as correções acima permanecem, por decisão de arquitetura e fora do escopo desta feature:

- O step-up compartilha o browser e a sessão do portal; um comprometimento do dispositivo (malware, XSS em outra página do portal) alcança o cookie `ts_admin` dentro da janela de 30 min. `HttpOnly` mitiga leitura por script, não uso por CSRF de mesma origem.
- Não há segundo fator. A proteção da seção ADMIN é "algo que você sabe" duas vezes (senha do portal + senha ADMIN).
- A revogação de sessão é temporal, não imediata: desativar um usuário (`ativo=false`) ou trocar sua senha **não** invalida um `ts_admin` já emitido, porque a verificação é stateless. O cookie continua válido por até 30 min de inatividade / 8h absolutas. Mitigável com uma checagem de estado no `requireAdminSection()` ou versionamento de senha no claim.
- A gestão multiusuário existe apenas via SQL direto (`admin_user_create` só para `service_role`) — sem UI e sem auditoria de quem criou quem.
- Sem execução em ambiente vivo, o comportamento efetivo dos grants e da RLS não foi verificado empiricamente; recomendo que o QA inclua os cenários de CRIT-1 e ALTA-1 como testes negativos explícitos contra o ambiente de preview.

# Conformidade com OWASP Top 10

| # | Categoria | Situação |
|---|---|---|
| A01 | Broken Access Control | **Não conforme** — CRIT-1, ALTA-1, ALTA-2, MED-4 |
| A02 | Cryptographic Failures | Parcial — bcrypt e hash no banco corretos; MED-3 (força do segredo HS256) |
| A03 | Injection | Conforme — RPCs parametrizadas, `set search_path = public` nas `SECURITY DEFINER`, sem SQL dinâmico; React escapa a saída (sem `dangerouslySetInnerHTML` na feature) |
| A04 | Insecure Design | Parcial — o desenho de defesa em profundidade está especificado corretamente, mas não foi implementado na superfície de escrita (ALTA-1) |
| A05 | Security Misconfiguration | **Não conforme** — grants excessivos a `authenticated` (CRIT-1); MED-3 |
| A06 | Vulnerable Components | Conforme — dependência nova é `jose@^6.2.8`, mantida e sem CVE conhecida na linha 6.x |
| A07 | Identification and Authentication Failures | **Não conforme** — CRIT-1 (troca de senha sem autenticação), MED-2 (DoS de lockout), BAIXA-2 (enumeração por tempo). Pontos corretos: erro genérico, lockout existente, troca obrigatória da semente, cookie endurecido |
| A08 | Software and Data Integrity Failures | Conforme no escopo revisado |
| A09 | Logging and Monitoring Failures | **Não conforme** — BAIXA-4, sem trilha de auditoria do step-up |
| A10 | SSRF | Não aplicável — a feature não faz requisições de saída |

Checklist adicional: SQL/NoSQL Injection — OK. XSS — OK. CSRF — mitigado por `SameSite=Strict` + Server Actions do Next.js. Command Injection / Path Traversal / File Upload — não aplicável. Secrets no código — apenas a semente (BAIXA-3), nenhum outro segredo versionado; `ADMIN_SESSION_SECRET` corretamente só em env. Senhas em texto puro — nenhuma armazenada; hash bcrypt nunca exposto ao cliente (confirmado: RLS sem policies em `admin_users` e nenhuma RPC retorna `senha_hash`). Logs com dados sensíveis — nenhum log de senha encontrado. CORS — inalterado. CSP — ausente no projeto (pré-existente, fora do escopo).

# Parecer Final

A base criptográfica e o modelo de sessão estão bem construídos. O que reprova a entrega é a camada de autorização: as RPCs `SECURITY DEFINER` estão abertas a todo usuário autenticado sem verificação interna (CRIT-1), o que — somado à senha semente versionada — permite tomada da credencial ADMIN por qualquer colaborador do portal; e o step-up não protege a superfície de escrita (ALTA-1), o que descumpre RNF2/RN1/CA5 justamente nas operações de maior impacto.

STATUS: REJECTED

ARTEFATO GERADO: SECURITY_REPORT.md

AÇÃO NECESSÁRIA:

Corrigir todas as vulnerabilidades classificadas como críticas e altas antes de prosseguir — CRIT-1, ALTA-1 e ALTA-2. Após a correção, solicitar nova revisão de segurança antes do Code Review.
