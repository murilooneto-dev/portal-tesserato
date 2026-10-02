# Redesign — Fase 4b: Fiscal · Dashboard, Relatórios, Calendário, Tarefas do mês, Preenchimento rápido, Minhas tarefas — Plano enxuto

> Modo econômico (02/10/2026): por tela, arquivos + decisões + cuidados. Revisão por tarefa só onde salva/exclui dados. Uma revisão final. Ver também o plano da 4a (`2026-10-02-redesign-fase4a-fiscal-clientes.md`), cujas **Regras valem aqui iguais**.

**Base:** branch `feat/redesign-fase4b-fiscal`, worktree `D:\DEV\Site Tesserato + Fiscal\wt-redesign-f4b`, **empilhada em `feat/redesign-fase4-fiscal` (PR #196, Fase 4a, ainda aberta)**. PR contra `dev`; avisar na PR que depende da #196.

**Pranchetas** (`D:\DEV\Site Tesserato + Fiscal\docs\redesign-2026-mockups\preview\<nome>.html`; gerador em `boards\04_fiscal.js`, `09_modais.js`, `11_mobile.js`): `f-01-dashboard`, `f-02-dashboard-meu`, `f-05-calendario`, `f-06-relatorios`, `f-08-preenchimento`, `f-09-minhas-tarefas`, `f-10-minhas-eventos`, `f-11-minhas-dossie`, `f-14-tarefas`, `m-07-evento`, `m-08-evento-calendario`, `mob-09-dashboard`, `mob-10-minhas-tarefas`, `mob-11-relatorio`.

**Padrões já prontos para copiar:** `components/ui/*` (inclui Pagina, CabecalhoPagina, Segmentado, Chip, Tabela com contêiner rolável `relative overflow-x-auto`), `components/fiscal/ClientesLista.tsx`, `components/fiscal/TarefaChecklist.tsx`, `components/geral/agenda/CalendarioMes.tsx` (grade de mês), `components/fiscal/AbasFichaCelular.tsx` (abas).

## Tarefas

### T1 — Dashboard Setor | Meu (revisão: não — só leitura; nova funcionalidade vai na revisão final)
- Arquivos: `app/fiscal/dashboard/page.tsx` (+ um `lib/dashboard-meu.ts` com a regra pura e teste).
- Prancheta `f-01` (Setor) e `f-02` (Meu), `mob-09`. Alternador **Setor | Meu** (`Segmentado`) no lugar da ação principal; estado na URL (`?visao=meu`), padrão "setor".
- **Meu (novo):** mesmo esqueleto, só com os clientes cujo `responsavel` é o usuário logado (comparação sem maiúsculas/acentos, como o resto do sistema compara `responsavel` com `profile.nome`) e as tarefas desses clientes; mais as tarefas encaminhadas ao usuário (dono do tipo, `buscarDonoNomePorTipoFiscal`) e um bloco "O que falta fazer" com link para Minhas tarefas. Admin vê o próprio "Meu".
- Setor: progresso geral, clientes por regime, próximos prazos, progresso por responsável, clientes com observação — os mesmos números de hoje.
- Cuidado: os cálculos de hoje (tiposMap, parcelamentos, encaminhadas fora da %) não mudam; "Meu" reaproveita filtrando.

### T2 — Relatórios e Tarefas do mês (revisão: não)
- Arquivos: `app/fiscal/relatorios/page.tsx`, `app/fiscal/tarefas/page.tsx`. Pranchetas `f-06`, `f-14`, `mob-11`.
- Relatórios: **sem coluna `#`** (decisão do usuário); mantém todas as outras colunas (inclusive Observação e MIT); pendências em `Badge`; Imprimir no `CabecalhoPagina`; impressão continua funcionando. Celular: números no topo e um cartão por cliente (mob-11).
- Tarefas do mês: mesma tabela padrão.

### T3 — Calendário (revisão: sim — cria/edita/exclui eventos)
- Arquivos: `app/fiscal/calendario/page.tsx`, `components/calendario/CalendarioSetor.tsx`, `components/calendario/CalendarioEventoModal.tsx`. Pranchetas `f-05`, `m-08`.
- Vira **calendário de mês de verdade** com os prazos (interno e oficial) nos dias e a **lista de próximos prazos ao lado**; editar/excluir no menu de cada prazo (`useConfirmar` no excluir).
- Janela do evento no `Modal`: "Todo mês" ou "Uma data só" (`Segmentado`), prazo interno e vencimento oficial lado a lado, regra de preencher ao menos um (mensagem no campo).
- Compartilhado com Contábil e Pessoal (`app/contabil|pessoal/calendario`): props iguais; esses setores ganham o visual novo junto (avisar na PR).
- Cuidado: regras de `lib/calendario` (proximoPrazo, normalizarTitulo, etc.) e as gravações em `calendario_eventos` iguais.

### T4 — Preenchimento rápido (revisão: sim — grava tarefas em lote)
- Arquivos: `components/PreenchimentoRapido.tsx`, `app/fiscal/preenchimento-rapido/page.tsx`. Prancheta `f-08`.
- **Três passos visíveis desde o início** (hoje abre só com um seletor); "—" quando a tarefa não se aplica ao cliente; grade/tabela no padrão.
- Compartilhado com Contábil e Pessoal (`app/contabil|pessoal/preenchimento-rapido`): props iguais.
- Cuidado máximo: a gravação (datas, modo direto, aplicabilidade via `calcularTarefasEsperadas`) não muda.

### T5 — Minhas tarefas (revisão: sim — grava tarefas, eventos e dossiê)
- Arquivos: `app/fiscal/minhas-tarefas/page.tsx`, `components/fiscal/MinhasTarefasTabs.tsx`, `MinhasTarefasSecao.tsx`, `MinhasTarefasFiltro.tsx`, `MinhasTarefasSeletorUsuario.tsx`, `DossieSecao.tsx`, `EventosConsolidados.tsx`. Pranchetas `f-09`, `f-10`, `f-11`, `mob-10`.
- Abas **Tarefas · Eventos · Dossiê**; admin com seletor de usuário e aviso de **somente leitura** quando vê outro usuário; uma tabela por tipo de tarefa com contagem; Eventos com busca e "Novo evento" (escolhe o cliente e abre a janela de evento, já no `Modal`); Dossiê com situação editável e "Finalizado" travando a linha.
- Celular: abas no topo, uma tarefa por cartão, data de 44 px, "Sem movimento" ao lado do nome.
- Cuidado: regras de somente leitura (admin vendo outro usuário), gravações e o botão de eventos consolidados (some no somente leitura) iguais.

### T6 — Fechamento
- `tests/fase4b-varredura.test.ts` (mesmo formato das anteriores) com os arquivos tocados.
- Onda de pendências (todos os achados menores).
- Conferência no navegador (banco **dev**, `.env.development.local` copiado de `portal-tesserato/` e apagado no fim, Runner porta 3120, ADMIN e FISCAL do cofre): Dashboard Setor e Meu, Relatórios (imprimir), Calendário (criar/editar/excluir um prazo de teste), Preenchimento rápido (sem gravar ou gravando num cliente de teste e desfazendo), Minhas tarefas nas 3 abas; desktop e iPhone 13; sem rolagem lateral.
- Revisão final (modelo mais capaz), uma onda, PR contra `dev` com "o que muda de funcionamento". Atualizar memória, `RETOMAR-REDESIGN.md` e tabela Andamento.

## O que muda de funcionamento (para a PR)
1. Dashboard ganha o modo **Meu** (novo).
2. Relatórios sem a coluna `#`.
3. Calendário vira grade de mês com lista de próximos prazos; vale também para Contábil e Pessoal.
4. Preenchimento rápido mostra os três passos desde o início; vale também para Contábil e Pessoal.
