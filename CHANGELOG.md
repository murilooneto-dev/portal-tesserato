# Changelog

Todas as mudanças relevantes deste projeto estão documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/).

---

## [v0.5.8] - 2026-07-01

### Adicionado
- Seletor global de mês/ano no Sidebar (`MesSeletor`), permitindo a qualquer usuário navegar entre meses e ver o progresso fiscal daquele período em Dashboard, Clientes, Tarefas e Relatórios (que passam a filtrar dados pelo mês/ano selecionado), e em Histórico e Parcelamentos (que passam a exibir o ano selecionado — Histórico também destaca visualmente o mês selecionado)
- A seleção fica guardada num cookie de sessão (expira ao fechar o navegador); Calendário e Agenda mantêm sua navegação de mês própria, independente do seletor global

### Arquivos alterados
- `lib/mes-atual.ts`, `lib/mes-atual-server.ts`, `lib/mes-atual-actions.ts`, `lib/mes-atual-cliente.ts` — novos helpers de leitura/escrita do mês/ano selecionado
- `components/fiscal/MesSeletor.tsx` — novo componente de navegação de mês no Sidebar
- `components/fiscal/Sidebar.tsx`, `app/fiscal/layout.tsx` — integração do seletor
- `app/fiscal/dashboard/page.tsx`, `app/fiscal/clientes/page.tsx`, `app/fiscal/tarefas/page.tsx` — passam a ler o mês/ano selecionado globalmente
- `app/fiscal/relatorios/page.tsx`, `app/fiscal/historico/page.tsx`, `app/fiscal/parcelamentos/page.tsx` — passam a sincronizar o mês/ano (ou só o ano) selecionado via cookie

---

## [v0.5.7] - 2026-06-30

### Corrigido
- Progresso de tarefas ficava "zerado" na lista de clientes mesmo com tarefas concluídas (visíveis no detalhe do cliente, com data e botão "Desbloquear"). Causa: `revalidatePath` ao marcar/desbloquear uma tarefa só invalidava o cache da página de detalhe do próprio cliente (`/fiscal/clientes/[id]`), deixando a lista de clientes e outras páginas que leem `tarefas` com dados em cache desatualizados
- `desbloquearTarefa` (botão "Desbloquear") não revalidava nenhuma página após alterar o status da tarefa

### Arquivos alterados
- `app/fiscal/clientes/[id]/page.tsx` — `toggleTarefa` agora também revalida `/fiscal/clientes`, `/fiscal/dashboard`, `/fiscal/historico`, `/fiscal/relatorios` e `/fiscal/tarefas`
- `app/fiscal/clientes/actions.ts` — `toggleTarefa` e `desbloquearTarefa` ganham as mesmas revalidações

---

## [v0.5.6] - 2026-06-30

### Corrigido
- Ferramenta "Registros sem data de conclusão" agora cruza `tarefas_personalizadas` de todos os clientes com os registros existentes, encontrando também tarefas que nunca foram interagidas (sem registro na tabela `tarefas`)

### Alterado
- `buscarTarefasSemData` recebe também o parâmetro `ano`; agrupa por tipo (não mais por tipo+mês+ano, já que o filtro de mês/ano é obrigatório)
- Interface `RegistroSemData` ganha campo `semRegistro` para indicar quantos clientes não têm nenhum registro no banco
- UI: seletor de ano adicionado ao lado do seletor de mês
- Tabela mostra contagem de clientes "s/reg" por tipo quando aplicável
- Botão de exclusão conta apenas registros que existem (ids), não o total

### Arquivos alterados
- `app/fiscal/parametros/actions.ts` — `buscarTarefasSemData` reescrita com cruzamento de clientes × tarefas_personalizadas
- `app/fiscal/parametros/ParametrosClient.tsx` — seletor de ano, novo campo `semRegistro` na UI

---

## [v0.5.5] - 2026-06-30

### Alterado
- Ferramenta "Registros sem data de conclusão" agora filtra por mês selecionado (padrão: Junho)

### Arquivos alterados
- `app/fiscal/parametros/actions.ts` — `buscarTarefasSemData` aceita parâmetro `mes` opcional
- `app/fiscal/parametros/ParametrosClient.tsx` — seletor de mês adicionado na UI; mudar o mês reseta o resultado anterior

---

## [v0.5.4] - 2026-06-30

### Adicionado
- **Registros sem data de conclusão** em Parâmetros → Manutenção de Dados: analisa todos os registros da tabela `tarefas` com `concluida_em IS NULL`, exibe tabela agrupada por tipo/mês/ano com lista de clientes afetados, checkboxes com "Selecionar todos" e botão de exclusão em massa que mostra contagem de registros a excluir

### Arquivos alterados
- `app/fiscal/parametros/actions.ts` — novas actions `buscarTarefasSemData()` e `excluirRegistrosDeTarefas()`; nova interface `RegistroSemData`
- `app/fiscal/parametros/ParametrosClient.tsx` — nova seção com análise, tabela e exclusão de registros sem data

---

## [v0.5.3] - 2026-06-30

### Adicionado
- **Alteração em massa de tarefa** em Parâmetros → Manutenção de Dados: 3 modos de operação com seletor de modo (Renomear / Excluir / Preencher data), dropdown de tarefa, checkboxes de clientes com "Selecionar todos", preview da operação e confirmação
  - **Renomear**: selecione a tarefa e o novo nome (ambos via dropdown das tarefas cadastradas) — aplica em `tarefas_personalizadas` e na tabela `tarefas`
  - **Excluir**: remove a tarefa da lista de tarefas de cada cliente selecionado e exclui todos os registros históricos
  - **Preencher data**: define `concluida = true` e `concluida_em` para os clientes selecionados em um mês/ano específico (upsert)

### Arquivos alterados
- `app/fiscal/parametros/actions.ts` — novas actions `buscarDadosParaAlteracao()`, `renomearTarefaEmClientes()`, `excluirTarefaDeClientes()`, `preencherDataEmClientes()`
- `app/fiscal/parametros/ParametrosClient.tsx` — UI com seletor de modo, dropdowns, checkboxes, campos específicos por modo e preview

---

## [v0.5.2] - 2026-06-30

### Alterado
- **Limpeza de duplicatas — fluxo de 2 etapas**: botão "Analisar duplicatas" agora exibe uma tabela de preview com todas as variantes encontradas antes de aplicar qualquer mudança. Para cada grupo, o dropdown pré-seleciona a versão com acento (quando detectada automaticamente) ou exibe aviso ⚠ para seleção manual. Só aplica ao clicar em "Confirmar e aplicar"

### Arquivos alterados
- `app/fiscal/parametros/actions.ts` — nova action `analisarTarefasDuplicadas()` separada da aplicação; `limparTarefasDuplicadas()` agora recebe mapeamento explícito
- `app/fiscal/parametros/ParametrosClient.tsx` — UI de 2 etapas: analisar → preview+confirmar → aplicar

---

## [v0.5.1] - 2026-06-30

### Adicionado
- **Limpeza de tarefas duplicadas em Parâmetros → Manutenção de Dados**: botão "Executar limpeza" analisa todos os clientes e remove tarefas repetidas mantendo apenas a versão com acentuação correta (ex: remove "SAIDAS" quando "SAÍDAS" já existe). Corrige também os registros históricos na tabela `tarefas`

### Arquivos alterados
- `app/fiscal/parametros/actions.ts` — `limparTarefasDuplicadas()`: deduplicação algorítmica por normalização NFD
- `app/fiscal/parametros/ParametrosClient.tsx` — seção "Manutenção de Dados" com botão e feedback de resultado

---

## [v0.5.0] - 2026-06-30

### Adicionado
- **Templates de tarefas por atividade**: novo sistema que substitui o fallback por grupo. Administrador configura 3 templates base (Serviço, Comércio, Indústria) em Parâmetros; atividades combinadas são resolvidas automaticamente pela união das bases
- **UI de templates em Parâmetros**: 3 cards editáveis (adicionar/remover tarefas, salvar por base), botão "Aplicar a clientes existentes" com merge incremental (nunca remove tarefas existentes), preview ao vivo das atividades combinadas
- **Auto-preenchimento no EmpresaModal**: ao selecionar a atividade de um novo cliente, as tarefas do template correspondente são pré-carregadas em `tarefas_personalizadas`; botão "Restaurar padrão da atividade" disponível

### Refatorado
- **`tiposCliente()` removido**: todas as páginas (`clientes/page`, `dashboard/page`, `clientes/[id]/page`, `empresas/page`) agora usam `tarefas_personalizadas` diretamente como fonte de verdade — sem fallback a `TAREFAS_GRUPOS` por grupo
- **`TAREFAS_PADRAO` e `TAREFAS_GRUPOS` eliminados**: constantes hardcoded de tarefas por grupo removidas de todos os arquivos server-side e do `EmpresaModal`

### Corrigido
- **Logo quebrada na primeira visita**: `proxy.ts` agora exclui `logo.png` do middleware (antes só excluía `logo.ico`)

### Arquivos alterados
- `lib/atividade-templates.ts` — novo utilitário: `basesDeAtividade()` e `resolverTemplate()`
- `app/fiscal/parametros/actions.ts` — novas server actions: `salvarTemplate` e `aplicarTemplateAClientes`
- `app/fiscal/parametros/page.tsx` — carrega `atividade_templates` do banco e passa para ParametrosClient
- `app/fiscal/parametros/ParametrosClient.tsx` — nova seção "Templates de Tarefas por Atividade"
- `components/fiscal/EmpresaModal.tsx` — auto-preenche tarefas pela atividade; remove `TAREFAS_PADRAO`
- `app/fiscal/empresas/page.tsx` — carrega templates e simplifica `contagemTarefas`
- `app/fiscal/empresas/EmpresasClient.tsx` — passa prop `templates` para `EmpresaModal`
- `app/fiscal/clientes/page.tsx` — simplifica `tiposMap` para usar `tarefas_personalizadas`
- `app/fiscal/dashboard/page.tsx` — simplifica `tiposMap` e `tiposCliente`
- `app/fiscal/clientes/[id]/page.tsx` — simplifica `tiposDoCliente` sem fallback de grupo
- `proxy.ts` — exclui `logo.png` do matcher do middleware

---

## [v0.4.10] - 2026-06-30

### Corrigido
- **Erro de build TypeScript no Vercel**: expressão `?.length > 0` substituída por `(?.length ?? 0) > 0` em `clientes/page.tsx`, `empresas/page.tsx` e `dashboard/page.tsx` — TypeScript strict não aceita comparação com `undefined`
- **Contador Normal/Simples/MEI no dashboard zerava**: filtro usava campo `regime` (texto livre como "Presumido", "Lucro Real") em vez do campo categórico `grupo` (`normal` / `simples` / `mei`)
- **Progresso por responsável inflado no dashboard**: `opConcluidas` contava todas as tarefas concluídas no banco, incluindo tipos que foram removidos do template do cliente — agora filtra pelo `tiposMap`, igual à lógica de `clientes/page.tsx`

### Alterado
- **Filtro de grupo na lista de clientes**: substituídas as opções dinâmicas do banco ("normal", "simples") por labels legíveis fixos ("Regime Normal", "Simples Nacional", "MEI"), alinhado ao filtro da página de Relatórios

### Arquivos alterados
- `app/fiscal/clientes/page.tsx` — fix `?.length > 0`
- `app/fiscal/dashboard/page.tsx` — fix TS; fix contador grupo; fix progresso por responsável com `tiposMap`
- `app/fiscal/empresas/page.tsx` — fix `?.length > 0`; contagem de tarefas via template (sem query extra ao banco)
- `components/fiscal/ClientesLista.tsx` — filtro de grupo com labels "Regime Normal", "Simples Nacional", "MEI"

---

## [v0.4.8] - 2026-06-30

### Corrigido
- **`getAuthenticatedAdmin()` não trava mais quando `SUPABASE_SERVICE_ROLE_KEY` está ausente**: adicionado fallback para cliente JWT autenticado, evitando crash silencioso. Operações de leitura e escrita passam a funcionar mesmo sem a variável de ambiente, desde que as políticas RLS do Supabase permitam o role `authenticated`
- **Erros de configuração agora visíveis ao usuário**: quando a service role key está faltando, `criarUsuario` retorna mensagem clara `"SUPABASE_SERVICE_ROLE_KEY não configurada no servidor."` em vez do enganoso `"Acesso negado."`
- **`createAdminClient()` lança exceção clara** se a key não estiver configurada, facilitando diagnóstico em logs do Vercel

### ⚠️ Passos necessários para ativação completa

**Passo 1 — SQL no Supabase** (resolve operações de operadores imediatamente):
Execute no Supabase → Database → SQL Editor:
```sql
CREATE POLICY "autenticados_acesso_total" ON tarefas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "autenticados_acesso_total" ON clientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "autenticados_acesso_total" ON client_files
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "autenticados_acesso_total" ON profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "autenticados_acesso_total" ON task_unlock_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "autenticados_acesso_total" ON bots_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "autenticados_acesso_total" ON app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**Passo 2 — Vercel** (necessário apenas para criar usuários novos):
Adicione `SUPABASE_SERVICE_ROLE_KEY` em Vercel → Settings → Environment Variables → Redeploy

### Arquivos alterados
- `lib/supabase/server.ts` — fallback JWT em `getAuthenticatedAdmin()`; validação antecipada em `createAdminClient()`

---

## [v0.4.7] - 2026-06-30

### Corrigido
- **Causa raiz identificada e resolvida**: o `@supabase/ssr` é criado com `autoRefreshToken: false` e `skipAutoInitialize: true`. Isso faz com que `getSession()` leia do storage local (cookies) sem renovar — se o token estiver expirado ou o storage não inicializado, retorna `null`. O `getAuthenticatedClient()` retornava `{ supabase: null }` silenciosamente e todos os server actions faziam `if (!supabase) return` sem salvar nada e sem erro visível
- **`middleware.ts` adicionado**: renova a sessão do Supabase em cada request (obrigatório pelo `@supabase/ssr`). Garante que os cookies de sessão estejam sempre frescos antes de qualquer Server Component ou Server Action
- **`getAuthenticatedAdmin()` substitui `getAuthenticatedClient()`**: usa `getUser()` para verificar identidade (faz request ao servidor Supabase, sempre funciona) e retorna `createAdminClient()` (service role) para operações no banco — não depende de `getSession()` em nenhum momento. A service role key bypass RLS e foi provada funcionar no diagnóstico SQL inicial
- **Todos os server actions atualizados** para usar `getAuthenticatedAdmin()`

### ⚠️ Ação necessária para funcionar em produção
Adicione `SUPABASE_SERVICE_ROLE_KEY` nas variáveis de ambiente do Vercel:
1. Abra o Vercel → seu projeto → **Settings → Environment Variables**
2. Clique **Add New**
3. Nome: `SUPABASE_SERVICE_ROLE_KEY`
4. Valor: (copie do arquivo `.env.local` do projeto)
5. Clique **Save** → **Redeploy**

### Arquivos alterados
- `middleware.ts` — novo arquivo, renova sessão em cada request
- `lib/supabase/server.ts` — `getAuthenticatedAdmin()` com service role; removida abordagem JWT quebrada
- `app/fiscal/clientes/[id]/page.tsx` — `toggleTarefa` usa `getAuthenticatedAdmin()`
- `app/fiscal/clientes/actions.ts` — todos os actions usam `getAuthenticatedAdmin()`
- `app/fiscal/empresas/actions.ts` — todos os actions usam `getAuthenticatedAdmin()`
- `app/fiscal/parametros/actions.ts` — todos os actions usam `getAuthenticatedAdmin()`
- `app/fiscal/bots/page.tsx` — `salvarConfig` usa `getAuthenticatedAdmin()`

---

## [v0.4.6] - 2026-06-29

### Corrigido
- **Fix global: todos os server actions agora usam JWT explícito** — o v0.4.5 corrigiu apenas `toggleTarefa` (tarefas) e `desbloquearTarefa`. Este release aplica a mesma correção em todos os actions de escrita do sistema: `salvarMIT`, `salvarObs`, `uploadArquivo`, `excluirArquivo` (clientes), `criarEmpresa`, `atualizarEmpresa`, `excluirEmpresa` (empresas), `salvarComunicado`, `atualizarPerfil`, `criarUsuario`, `salvarConfiguracoes` (parâmetros) e `salvarConfig` (bots)
- **Novo helper `getAuthenticatedClient()`** em `lib/supabase/server.ts` — encapsula o padrão `getUser() + getSession() + createClientWithToken()` para reutilização em todos os server actions

### Arquivos alterados
- `lib/supabase/server.ts` — nova função `getAuthenticatedClient()` reutilizável
- `app/fiscal/clientes/actions.ts` — todos os actions usam `getAuthenticatedClient()`
- `app/fiscal/empresas/actions.ts` — todos os actions usam `getAuthenticatedClient()`
- `app/fiscal/parametros/actions.ts` — todos os actions usam `getAuthenticatedClient()`
- `app/fiscal/bots/page.tsx` — `salvarConfig` usa `createClientWithToken` explícito

---

## [v0.4.5] - 2026-06-29

### Corrigido
- **Tarefas (operador) — fix definitivo**: o `@supabase/ssr` não garante que o JWT do usuário seja incluído nas requests PostgREST do server action — as operações chegavam ao banco como role `anon`, violando a RLS (erro 42501). Solução: após `getUser()`, o access_token da sessão é extraído e um novo cliente Supabase é criado com o header `Authorization: Bearer <token>` explícito, garantindo que INSERT e UPDATE sejam feitos como `authenticated`

### Arquivos alterados
- `lib/supabase/server.ts` — nova função `createClientWithToken(token)` para cliente com JWT explícito
- `app/fiscal/clientes/[id]/page.tsx` — `toggleTarefa` usa `createClientWithToken` para operações no banco
- `app/fiscal/clientes/actions.ts` — `desbloquearTarefa` usa `createClientWithToken` para operações no banco

---

## [v0.4.4] - 2026-06-29

### Corrigido
- **Tarefas — input de data**: substituído `type="date"` (controlado pelo React, apagava ao digitar) por `type="text"` com máscara automática DD/MM/AAAA — o usuário digita os dígitos e as barras são inseridas automaticamente; salva quando a data está completa e válida; descarta entrada parcial ao sair do campo

### Arquivos alterados
- `components/fiscal/TarefaChecklist.tsx` — novo input de texto com auto-formatação DD/MM/AAAA, estado local `localText` separado do estado salvo

---

## [v0.4.3] - 2026-06-29

### Corrigido
- **Tarefas (operador)**: revertido uso de `createAdminClient()` — RLS corrigida diretamente no Supabase com policy permissiva para usuários autenticados; código volta a usar `createClient()` padrão sem dependência de `SUPABASE_SERVICE_ROLE_KEY` no Vercel

### Arquivos alterados
- `app/fiscal/clientes/[id]/page.tsx` — `toggleTarefa` usa `createClient()` novamente
- `app/fiscal/clientes/actions.ts` — `toggleTarefa` e `desbloquearTarefa` sem `createAdminClient()`

---

## [v0.4.2] - 2026-06-29

### Corrigido
- **Tarefas (operador)**: usuários com role `operador` agora conseguem salvar tarefas — `toggleTarefa` e `desbloquearTarefa` passaram a usar `createAdminClient()` (service role key) para bypassar as RLS policies do Supabase que bloqueavam INSERTs e UPDATEs de não-admins
- **Contador / progresso na lista de clientes**: `TIPOS_VALIDOS` hardcoded substituído por `clienteTiposSet` calculado por cliente — tipos personalizados (`tarefas_personalizadas`) agora contam no total e no progresso; `comPendencia` passa a refletir todos os clientes com tarefas ainda não concluídas

### Arquivos alterados
- `lib/supabase/server.ts` — nova função `createAdminClient()` usando `SUPABASE_SERVICE_ROLE_KEY`
- `app/fiscal/clientes/[id]/page.tsx` — `toggleTarefa` usa admin client após verificar auth
- `app/fiscal/clientes/actions.ts` — `toggleTarefa` e `desbloquearTarefa` usam admin client
- `app/fiscal/clientes/page.tsx` — `TIPOS_VALIDOS` substituído por `clienteTiposSet` por cliente; `progressoMap.total` agora reflete tarefas configuradas

---

## [v0.4.1] - 2026-06-29

### Alterado
- **Tema visual**: paleta ajustada de Azul Vívido (Opção 3) para Azul Aço (Opção 2) — fundo `#111e3a`, surfaces `#162444`, accent `#00CCEB`

### Corrigido
- **Tarefas**: input de data não bloqueia mais ao digitar os primeiros 2 dígitos do ano — agora aguarda ano completo (≥ 1000) antes de salvar

### Arquivos alterados
- `app/globals.css`, `app/fiscal/layout.tsx` e 29 outros componentes — substituição da paleta de cores
- `components/fiscal/TarefaChecklist.tsx` — validação de ano completo no input de data

---

## [v0.4.0] - 2026-06-29

### Adicionado
- **Tema visual**: nova paleta Azul Vívido em todo o portal — fundo `#162546`, surfaces `#1c2e52`, accent `#34CEFF`
- **Tarefas**: input de data substitui o checkbox de conclusão — exibe a data de conclusão e permite edição direta
- **Relatórios**: linhas de clientes clicáveis, visual mais claro e legível

### Corrigido
- **Login**: logo quebrada na primeira carga — substituído `<img>` por `<Image unoptimized priority>` para forçar preload no Turbopack
- **Sidebar**: removida propriedade CSS `background` (shorthand) conflitante com `backgroundImage`/`backgroundSize`

### Arquivos alterados
- `app/globals.css` — cor de fundo global atualizada
- `app/fiscal/layout.tsx` — bg atualizado
- `app/login/page.tsx` — logo com `<Image priority unoptimized>`
- `components/fiscal/Sidebar.tsx` — novo gradiente azul, fix de shorthand CSS
- `app/fiscal/relatorios/page.tsx` — linhas clicáveis
- `components/fiscal/TarefaChecklist.tsx` — input de data em vez de checkbox
- `app/fiscal/clientes/[id]/page.tsx` — `toggleTarefa` aceita data de conclusão
- 24 outros arquivos — substituição da paleta de cores (`#00B8D4` → `#34CEFF`, fundos e surfaces)

---

## [v0.3.3] - 2026-06-26

### Corrigido
- **Tarefas**: marcar tarefa como concluída agora funciona corretamente — server action substituído de `upsert` (que exigia unique constraint ausente no banco) para `select + update/insert` explícito
- **Tarefas**: checkbox responde visualmente de imediato ao clique via estado otimista, sem aguardar round-trip ao servidor

### Arquivos alterados
- `app/fiscal/clientes/[id]/page.tsx` — `toggleTarefa` reescrito com select+update/insert em vez de upsert
- `components/fiscal/TarefaChecklist.tsx` — estado otimista adicionado para resposta imediata ao clique

---

## [v0.3.2] - 2026-06-26

### Corrigido
- **Relatórios**: cálculo de progresso agora usa os registros reais da tabela `tarefas` (total e concluídas por cliente/mês/ano), igual ao Dashboard e Histórico — antes usava lista hardcoded que ignorava tarefas dinâmicas/personalizadas
- **Relatórios**: filtro "Apenas pendências" e lista de tarefas pendentes passam a refletir o estado real do banco

### Arquivos alterados
- `app/fiscal/relatorios/page.tsx` — função `progresso` reescrita para usar tarefas reais em vez de tipos hardcoded

---

## [v0.3.1] - 2026-06-26

### Corrigido
- **Agenda (Intranet)**: botão "Ver descrição" adicionado em cada compromisso do modal de dia — expande a descrição completa com `break-words` para evitar overflow de texto longo
- **Agenda (Intranet)**: modais de ver dia e de formulário ampliados (`max-w-xl`), painel de itens com altura maior (`max-h-[32rem]`)
- **Agenda (Intranet)**: campo Título convertido de `<input>` para `<textarea rows={1}>` para quebrar linha em textos longos; Descrição com `rows={8}`
- **Login**: logo carregada via `<img>` nativo em vez de `<Image>` do Next.js (evita falha de serving intermitente no Vercel)
- **Sidebar**: logo corrigida para `<img>` nativo; link Admin já incluído desde v0.3.0

### Arquivos alterados
- `components/fiscal/AgendaPessoal.tsx` — expand de descrição por item, modais maiores, wrap de texto, textarea de título
- `app/fiscal/agenda/page.tsx` — AgendaCard com botão "Ver descrição" (página standalone)
- `app/login/page.tsx` — logo via `<img>` nativo
- `components/fiscal/Sidebar.tsx` — logo via `<img>` nativo

---

## [v0.3.0] - 2026-06-26

### Adicionado
- Ferramenta **Corrigir Encoding de Atividades** na página Admin: detecta qualquer valor de atividade fora do padrão (não só chars quebrados), sugere correção via normalização NFD + Levenshtein fuzzy, e oferece `<select>` manual para casos sem sugestão automática
- Ferramenta **Corrigir Encoding de Tarefas** na página Admin: escaneia `clientes.tarefas_personalizadas` e `tarefas.tipo` com a mesma lógica, agrupando por cliente e tipo; campo de texto livre para tipos personalizados sem sugestão
- Link **Admin** na Sidebar com ícone `ShieldCheck` (visível apenas para admins)
- Filtro de **Atividade** na página de Relatórios, populado dinamicamente dos clientes cadastrados

### Alterado
- Relatórios: filtro de Tarefas removido e substituído pelo filtro de Atividade
- Página Admin expandida para `max-w-4xl` para acomodar as tabelas de correção

### Arquivos alterados
- `components/fiscal/CorrigirAtividadesClient.tsx` — novo componente de correção de atividades (NFD + fuzzy Levenshtein)
- `components/fiscal/CorrigirTarefasClient.tsx` — novo componente de correção de tarefas (template + registros)
- `app/fiscal/admin/page.tsx` — duas novas seções de correção adicionadas
- `components/fiscal/Sidebar.tsx` — link Admin com ShieldCheck
- `app/fiscal/relatorios/page.tsx` — filtro de atividade substituindo filtro de tarefas

---

## [v0.2.0] - 2026-06-26

### Adicionado
- Sidebar lateral com lucide-react, logo PNG e dot pattern gradient — substituiu TopNav horizontal
- Controle de acesso na aba Empresas: todos os usuários veem todas as empresas; Editar/Excluir disponível apenas para o responsável ou admin
- Modal de visualização read-only de empresa (botão "Ver" para não-responsáveis) — reutiliza EmpresaModal com prop `readOnly`
- Guard server-side na página de edição de empresa: redireciona para `/fiscal/empresas` se não for responsável nem admin
- Cards de agenda expandíveis: clique para ver descrição completa (componente `AgendaCard` com `useState` isolado)
- Comparação DTE: upload de planilha XLSX, extração de campos por keyword (Chave NF-e, Valor, Data, Fornecedor, UF, Número)
- Export da conferência DTE em XLSX formatado (com título) e PDF (`window.print()`)

### Alterado
- Dashboard e Histórico: headers de seção em `text-white/40`, alertas como pills `rounded-full`
- Upload de arquivos: MIME types `xlsx`/`xls` adicionados em `TIPOS_PERMITIDOS`
- Logo transparente (`public/logo.png`) na Sidebar e na tela de login

### Corrigido
- Import estático `import * as XLSX from 'xlsx'` — dynamic import retornava `undefined` no browser
- Alinhamento do PDF de conferência: tabela à esquerda, título/resumo centralizados

### Arquivos alterados
- `app/fiscal/layout.tsx` — Sidebar lateral substituindo TopNav
- `components/fiscal/Sidebar.tsx` — reescrito com lucide-react, logo PNG, dot pattern
- `app/fiscal/dashboard/page.tsx` — headers white/40, pills de alerta, progress bar gradient
- `app/fiscal/historico/page.tsx` — headers white/40
- `app/login/page.tsx` — logo PNG 96×96 com `unoptimized`
- `app/fiscal/clientes/actions.ts` — MIME types xlsx/xls adicionados
- `app/fiscal/clientes/[id]/page.tsx` — filtra `.xlsx?` antes de passar para ClienteConferencia
- `components/fiscal/ClienteConferencia.tsx` — XLSX estático, extração por column-keyword, export XLSX+PDF
- `app/fiscal/agenda/page.tsx` — AgendaCard extraído como componente com useState isolado
- `app/fiscal/empresas/page.tsx` — removido filtro por responsável; passa `profileNome` e `isAdmin`
- `app/fiscal/empresas/EmpresasClient.tsx` — lógica `podeEditar`, botões condicionais Editar/Ver/Excluir
- `app/fiscal/empresas/[id]/editar/page.tsx` — guard server-side com redirect
- `components/fiscal/EmpresaModal.tsx` — prop `readOnly` para modo visualização
- `package.json` — `lucide-react` adicionado
- `public/logo.png` — PNG 507×510 com fundo transparente (novo)
- `public/ICONESTART.png` — ícone adicional (novo)

---

## [v0.1.1] - 2026-06-26

### Corrigido
- Layout fiscal não desconecta mais usuários autenticados que não possuem registro na tabela `profiles`
- TopNav não crasha se `profile.nome` for null (null guard com fallback para inicial do e-mail)
- Checklist de tarefas agora usa os tipos personalizados do cliente quando disponíveis

### Arquivos alterados
- `app/fiscal/layout.tsx` — safeProfile: não redireciona se profile null, apenas se user null
- `components/fiscal/TopNav.tsx` — `(profile.nome ?? 'U').charAt(0)` para evitar crash
- `app/fiscal/clientes/[id]/page.tsx` — passa `tarefasPersonalizadas` ao TarefaChecklist
- `components/fiscal/TarefaChecklist.tsx` — usa `tarefasPersonalizadas` se disponível, fallback para tipos por grupo

---
