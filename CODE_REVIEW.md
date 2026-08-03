# Resumo da Revisão

Revisão técnica da feature de autenticação step-up da seção ADMIN (TES-3), branch `agent/backend-engineer/remediation-de6a41be` (backend + frontend + remediação de segurança), diff contra `dev`. Escopo: `lib/admin-auth/`, `app/admin/bloqueio/actions.ts`, `app/fiscal/parametros/actions.ts`, `app/(comum)/vinculos/actions.ts`, `proxy.ts`, `supabase/migrations/019_admin_section_auth.sql`.

A Segurança já aprovou (sem críticas/altas em aberto); esta revisão não repete a auditoria de segurança. Ela avalia qualidade, coesão e manutenibilidade do código, e consolida os itens residuais que a Segurança deixou "para antes do Release" (MED-5, MED-6, lows), tratando-os como defeitos de código a corrigir, não como observações de segurança novas.

Avaliação geral: a implementação está bem alinhada ao ARCHITECTURE.md/DESIGN.md, com boa separação de responsabilidades (`session.ts` sem I/O de cookie, `server.ts` com a superfície Node, `constants.ts` centralizando parâmetros) e comentários que efetivamente documentam decisões não óbvias em vez de narrar o código. O ponto fraco real não é nenhum arquivo isolado, mas um padrão de duplicação entre `parametros/actions.ts` e `vinculos/actions.ts` que já se provou uma fonte de vulnerabilidades (a raiz do ALTA-2 que a Segurança já corrigiu) e ainda deixou uma exportação sem guarda (MED-5).

# Pontos Positivos

- **Separação Edge/Node correta e documentada:** `session.ts` é Edge-safe e sem I/O de cookie; `server.ts` concentra `next/headers`; o comentário no topo de cada arquivo explica o porquê da fronteira, não só o quê. Evita a armadilha comum de middleware Next.js importar algo pesado por engano.
- **Defesa em profundidade real, não só no papel:** `proxy.ts` intercepta navegação/URL direta, `requireAdminSection()` guarda os RSC antes de qualquer query, e as Server Actions de escrita chamam `getValidAdminSession()`/`exigirSessaoAdmin()` como primeira linha — as três camadas descritas na Arquitetura existem de fato no código revisado.
- **`ROTAS_ADMIN`/`ehRotaAdmin()` como fonte única**, reaproveitada por `proxy.ts` e pela validação de `next` em `bloqueio/page.tsx` — evita a divergência entre camadas que a própria Arquitetura queria prevenir, e já pagou o próprio investimento fechando o MED-1 (open redirect) sem precisar de lógica nova.
- **`constants.ts` bem desenhado:** nenhum valor de tempo/política hardcoded em `session.ts`/`server.ts`/`proxy.ts`; ajustar TTLs ou política de lockout não exige tocar em lógica.
- **Migration organizada e defensiva:** RPCs `SECURITY DEFINER` com `search_path` fixo, `revoke` explícito de `authenticated`/`anon` logo abaixo de cada função (fácil de auditar visualmente), comentários que remetem ao achado de segurança que motivou cada trecho — ajuda muito quem revisar depois sem precisar do histórico da issue.
- **Frontend consistente com o padrão já existente:** `BloqueioForm.tsx` reaproveita literalmente `inputCls` e o vocabulário visual do `LoginForm.tsx`, sem introduzir componente de estilo novo — exatamente o que o DESIGN.md pedia (RNF4).
- **Mensagens de erro fiéis ao SPEC** (RN3 — erro genérico, nunca revela qual campo errou) e implementadas de forma idêntica nos dois pontos onde poderiam divergir (`bloqueio/actions.ts` e a RPC).

# Problemas Encontrados

## Críticos

Nenhum.

## Altos

### A1 — Padrão de autorização duplicado ~9x em `parametros/actions.ts`, sem função central

**Local:** `app/fiscal/parametros/actions.ts` — `salvarComunicado`, `atualizarPerfil`, `criarUsuario`, `deletarUsuario`, `salvarConfiguracoes`, `salvarTemplate`, `aplicarTemplateAClientes`, `salvarTemplateGrupo`, `aplicarTemplateGrupoAClientes`, `analisarParcelamentosDuplicados`, `limparParcelamentosDuplicados`.

**Descrição:** cada uma dessas ~11 funções repete manualmente o mesmo bloco de 4 linhas — `getAuthenticatedAdmin()` + checar `user`/`supabase` + `select role` + comparar com `'admin'` — em vez de chamar um helper único. `app/(comum)/vinculos/actions.ts` já resolveu exatamente esse mesmo problema com `exigirAcessoAdmin()` (uma função que encadeia role do portal + sessão `ts_admin`), mas esse padrão não foi levado para `parametros/actions.ts`, que continua com a checagem de sessão (`exigirSessaoAdmin()`) e a checagem de role como dois blocos manuais separados e repetidos por função.

**Impacto:** este não é um risco hipotético — é a causa raiz confirmada do ALTA-2 que a Segurança já encontrou e corrigiu (`salvarComunicado`/`salvarConfiguracoes` ficaram sem o check de role porque o padrão depende de cada autor colar o bloco certo). E é a causa raiz do MED-5 ainda aberto (`verificarSenhaDev`, ver A2). Um helper único transformaria "esquecer a guarda" de erro silencioso em erro de compilação/óbvio na leitura (uma linha ausente no topo da função, fácil de notar em review), em vez de depender de disciplina de copy-paste em 11+ funções.

**Recomendação:** extrair um helper único em `lib/admin-auth/server.ts` (ex.: `exigirAcessoAdminCompleto(): Promise<{ user, supabase } | null>`, unindo sessão do portal + role + `ts_admin`) e reaproveitá-lo nos três arquivos de Server Actions da seção ADMIN (`bloqueio/actions.ts` já tem lógica equivalente inline no login, mas `parametros/actions.ts` e `vinculos/actions.ts` deveriam convergir para a mesma função). Isso também resolve o MED-5 abaixo como efeito colateral, se `verificarSenhaDev` passar a usá-lo.

### A2 — `verificarSenhaDev` exportada sem guarda de sessão ADMIN (residual MED-5 da Segurança)

**Local:** `app/fiscal/parametros/actions.ts:426-449`.

**Descrição:** é a única das 12 exportações do arquivo que não chama `exigirSessaoAdmin()`/`getValidAdminSession()`. Recebe login/senha e tenta `signInWithPassword` contra a conta master (`DEV_MASTER_EMAIL`), retornando um booleano de sucesso — invocável por qualquer colaborador autenticado via `Next-Action`, sem nunca passar pela credencial ADMIN.

**Impacto:** oráculo de força bruta contra a senha da conta dev, direto do servidor da aplicação (fora do rate-limit por IP do Supabase, que aqui sempre vê a origem do próprio servidor). Confirmado como o único ponto sem a guarda que as outras 11 funções do arquivo têm.

**Recomendação:** adicionar `const erroAdmin = await exigirSessaoAdmin(); if (erroAdmin) return { ok: false, error: erroAdmin }` como primeira linha — mudança de uma linha, sem efeito colateral em nenhum fluxo existente (o `DevLock` no cliente já é gate de UI, não de dados).

## Médios

### M1 — `gen_salt('bf')` sem custo explícito (residual MED-6 da Segurança)

**Local:** `supabase/migrations/019_admin_section_auth.sql:31` (seed), `:61` (hash descartável da equalização de tempo), `:127` (`admin_trocar_senha`), `:156` (`admin_user_create`).

**Descrição:** `gen_salt('bf')` sem parâmetro usa o custo default do pgcrypto (6), abaixo da recomendação atual (≥10, tipicamente 12).

**Recomendação:** subir para `gen_salt('bf', 12)` em **todos** os quatro pontos, incluindo o hash descartável de `:61` — a própria Segurança já sinalizou que subir só os hashes reais e deixar o descartável em custo 6 reabre o oráculo de tempo (BAIXA-2) de forma invertida (o caminho "usuário existe" ficaria ~64× mais lento que o caminho "usuário não existe"). Os quatro literais devem mudar juntos na mesma migration/PR.

### M2 — Risco residual de design não documentado no código: `exigirAcessoAdmin()` devolve cliente `service_role`

**Local:** `app/(comum)/vinculos/actions.ts:13-24`.

**Descrição:** como a Segurança registrou, `exigirAcessoAdmin()` retorna um cliente Supabase autenticado como `service_role` (via `getAuthenticatedAdmin()`), que **ignora RLS**. Isso é intencional e correto hoje (as duas actions do arquivo chamam a função corretamente), mas o arquivo não avisa quem for adicionar a próxima action que, se a chamada a `exigirAcessoAdmin()` for esquecida ou mal posicionada, não há rede de proteção da RLS pegando o erro — o mesmo padrão de falha que já causou o ALTA-2 em `parametros/actions.ts`.

**Recomendação:** comentário de alerta no topo de `app/(comum)/vinculos/actions.ts`, algo como: *"`exigirAcessoAdmin()` retorna cliente `service_role` — RLS não protege este arquivo. Toda action de escrita nova DEVE chamar `exigirAcessoAdmin()` como primeira linha antes de qualquer query."* Baixo custo, alto valor para quem editar o arquivo sem o contexto desta issue.

### M3 — Falha de `createAdminClient()` engolida sem log em `bloqueio/actions.ts`

**Local:** `app/admin/bloqueio/actions.ts:40-45` (`adminLogin`) e `:89-94` (`trocarSenhaInicial`).

**Descrição:** quando `createAdminClient()` lança (tipicamente `SUPABASE_SERVICE_ROLE_KEY` ausente), o `catch` devolve o mesmo erro genérico de credencial inválida, sem nenhum log. Comportamento de segurança correto (falha fechada, não vaza detalhe ao usuário), mas em produção um erro de configuração fica indistinguível de "todo mundo está digitando a senha errada" — só visível investigando manualmente.

**Recomendação:** `console.error` (server-side, não afeta a resposta ao cliente) no `catch`, como a Segurança já sugeriu.

### M4 — `getAuthenticatedAdmin()` com nome que promete autorização que não faz

**Local:** `lib/supabase/server.ts:42-68` (pré-existente, fora do diff desta feature, mas na superfície que ela declara proteger).

**Descrição:** o nome sugere "cliente para admin autenticado", mas a função só verifica que existe um `user` — devolve `service_role` sem checar `role='admin'`. Já inseriu duas actions vulneráveis nesta mesma feature (ALTA-2, já corrigido) precisamente por esse nome enganoso.

**Recomendação:** renomear para algo como `getAuthenticatedServiceClient()` (sugestão da própria Segurança), deixando claro no nome que devolve poder de `service_role`, não autorização. É um rename de baixo risco (mesma assinatura, mesmos call sites), mas toca ~15+ arquivos fora do escopo direto de TES-3 — avaliar se entra nesta rodada ou vira um item de tech debt separado, já que não é regressão introduzida por esta feature.

## Baixos

- **`grant execute ... to service_role` implícito nas RPCs** (`admin_login`, `admin_trocar_senha`, `admin_user_create`, `admin_user_set_ativo`) — funciona hoje pelo default privilege do Supabase, mas fica implícito. Adicionar o `grant execute ... to service_role` explícito ao lado de cada `revoke` deixa a intenção auditável só lendo o SQL, sem depender de saber a convenção do Supabase.
- **Cookie options duplicadas:** o objeto de opções do cookie `ts_admin` (`httpOnly`, `secure`, `sameSite: 'strict'`, `path: '/'`, `maxAge`) está escrito duas vezes — em `lib/admin-auth/server.ts:10-18` (`cookieOptions()`) e inline em `proxy.ts:88-94`. A duplicação existe pela fronteira Edge/Node (não dá para importar `cookieOptions()` de `server.ts` dentro do `proxy.ts`), mas o literal em si poderia ser uma constante compartilhada em `constants.ts` (sem I/O, só o objeto de configuração) para os dois lados importarem, evitando que uma mudança de política de cookie seja aplicada em um lugar e esquecida no outro.

# Recomendações

1. Antes do QA: aplicar A2 (uma linha) e M1 (quatro literais, mesma migration) — ambos triviais e o report de Segurança já os classificou como pendências para antes do Release; não há motivo para não fechá-los nesta mesma rodada de remediação.
2. Antes do QA, fortemente recomendado mas não estritamente bloqueante: A1 (helper único de autorização). Justificativa para tratar como quase-bloqueante: é a causa raiz comprovada de uma vulnerabilidade já corrigida (ALTA-2) e de uma ainda aberta (MED-5/A2) — sem a refatoração, o próximo desenvolvedor que adicionar uma Server Action a `parametros/actions.ts` tem o mesmo risco de esquecer a guarda.
3. M2 (comentário de alerta em `vinculos/actions.ts`) e M3 (`console.error`) são de custo mínimo — recomendo incluir na mesma remediação por serem rápidos, mas não bloqueiam o QA se o tempo apertar.
4. M4 (rename de `getAuthenticatedAdmin`) e o baixo de `grant` explícito podem ficar como recomendação para uma rodada separada de tech debt, já que tocam código fora do diff direto desta feature.

# Decisão Final

**Aprovado com correções obrigatórias antes do QA.** A arquitetura, a organização do módulo `lib/admin-auth/` e a cobertura de defesa em profundidade estão sólidas e alinhadas ao ARCHITECTURE.md/DESIGN.md — não há bloqueio estrutural. Mas dois itens residuais da Segurança (MED-5/A2 e MED-6/M1) são correções de código triviais e já mapeadas; não faz sentido levá-las ao QA em aberto quando o backend já está sendo tocado nesta mesma remediação. Peço que o Backend Engineer aplique A2 e M1 (e, idealmente, A1) antes de seguir para o QA.

---

STATUS: APPROVED (com correções obrigatórias antes do QA — ver A2 e M1)

ARTEFATO GERADO: CODE_REVIEW.md

PRÓXIMA ETAPA: QA Engineer, após A2 e M1 aplicados
