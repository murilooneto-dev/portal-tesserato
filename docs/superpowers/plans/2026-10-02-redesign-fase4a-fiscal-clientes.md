# Redesign — Fase 4a: Fiscal · Clientes, Ficha e Editar empresa — Plano enxuto

> Modo econômico combinado em 02/10/2026: por tela, arquivos + decisões + cuidados (sem código completo). Revisão por tarefa só nas tarefas que salvam/excluem dados ou mexem em permissão. Uma revisão final. Modelo barato no mecânico.

**Por que "4a":** a Fase 4 do plano geral (Fiscal) tem ~6.000 linhas em 30+ arquivos. Vai em 4 PRs contra `dev`, uma de cada vez:
- **4a** (esta): remoções (bots, prioridade, Histórico anual), Clientes, Editar empresa, Ficha do cliente.
- **4b**: Dashboard (Setor | Meu, novo), Relatórios, Calendário, Tarefas do mês, Preenchimento rápido, Minhas tarefas.
- **4c**: Parcelamentos (opção C) e suas janelas.
- **4d**: Tabelas (componentes compartilhados por todos os setores).

**Spec:** `docs/superpowers/plans/2026-10-01-redesign-implantacao.md` (seção 2 e Fase 4). **Pranchetas** (cópia local, abrir o HTML): `D:\DEV\Site Tesserato + Fiscal\docs\redesign-2026-mockups\preview\<nome>.html` — notas de cada uma no fim de `boards/04_fiscal.js`, `09_modais.js`, `10_estados.js`, `11_mobile.js`.

**Base técnica pronta (Fases 1–3):** `components/ui` (Button, IconButton, Field, Input, Select, Textarea, Checkbox, Switch, Badge, MonthPill, NomeCliente, Tabela/Th/Td, Card, Aviso, EmptyState, Modal, Drawer, useConfirmar, useToast, Pagina, CabecalhoPagina, Segmentado, Chip). Exemplos de tela já migrada: `components/geral/ClientesGeralLista.tsx`, `components/geral/ClienteGeralModal.tsx`, `components/geral/agenda/*`.

## Regras (valem para todas as tarefas)
- Worktree `D:\DEV\Site Tesserato + Fiscal\wt-redesign-f4`, branch `feat/redesign-fase4-fiscal` (de `origin/dev` 0f0aed4). PR contra `dev`, sem merge.
- **Sem banco, sem migration.** Server Actions e consultas **não mudam** (só o que está escrito aqui).
- Visual só com as peças de `components/ui` e classes do Design System; texto ≥ 12 px; ≤ 1 botão `primario` por tela; nome de cliente com `NomeCliente`; `useConfirmar` no lugar de `confirm()`; janelas no `Modal`; nada de `[var(--fg)]/40`, `text-[10px]`, cores fixas (`red-400`, `amber-…`), emojis como ícone.
- Celular: sem rolagem lateral da página; alvos de 44 px onde se toca.
- Rótulos com só a primeira letra maiúscula.
- `npx tsc --noEmit`, `npm test`, `npx eslint` nos arquivos tocados e `npm run build` limpos. Commits com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ao terminar cada tarefa, atualizar o ledger (`.superpowers/sdd/2026-10-02-redesign-fase4a-fiscal-clientes/progress.md`).

## Tarefas

### T1 — Remoções (revisão: sim — mexe em permissão)
- **Bots:** apagar `app/fiscal/bots/` e `components/fiscal/BotsConfigForm.tsx`; tirar `'bots'` de `PAGINAS_SEMPRE_LIBERADAS` em `lib/route-permissions.ts` (e dos comentários de `lib/route-permissions.ts` e `lib/paginas-setor.ts`); ajustar `tests/route-permissions.test.ts:44`. Tipos `BotTipo/BotConfig` e a tabela `bots_config` ficam (não mexer em banco). Conferir com grep que nada mais importa os arquivos apagados.
- **Prioridade no Fiscal:** sai da UI — marca "P" e filtro "Prioridade" em `components/fiscal/ClientesLista.tsx`; campo em `components/fiscal/CamposFiscais.tsx`. **O valor continua no form e no payload** (`EmpresaModal` e `actions.ts` intactos), para não zerar a coluna no banco. Apagar a chave persistida `clientes:prioridade` do uso (não precisa limpar sessionStorage).
- **Histórico anual:** tirar o card "Histórico {ano}" e o cálculo `historicoMeses` (só ele) de `app/fiscal/clientes/[id]/page.tsx` (~linhas 183–290). Se alguma consulta servir só a ele, remover também — conferir.
- Testes: route-permissions atualizado; `npm test` verde.

### T2 — Clientes do Fiscal (revisão: não)
- Arquivos: `app/fiscal/clientes/page.tsx`, `components/fiscal/ClientesLista.tsx`. Prancheta `f-03-clientes`.
- `Pagina` + `CabecalhoPagina` (título, contagem, Imprimir se houver hoje, "Novo cliente" primário se o usuário pode criar hoje).
- Filtros com rótulo (`Field`): busca, regime, responsável e o que mais existir hoje, atividade em `Chip`, **os dois interruptores de hoje** como `Switch` (mesmo efeito).
- Tabela: `NomeCliente` com CNPJ embaixo; selo de vínculo (liberada/aguardando — já existe, migrar para `Badge`) e aviso de observação continuam na linha; demais colunas de hoje.
- Celular: tabela rola dentro do cartão.
- Cuidado: links para a ficha e permissões (quem vê o quê) iguais; filtros persistentes mantêm as chaves.

### T3 — Editar empresa (revisão: sim — salva dados)
- Arquivos: `components/fiscal/EmpresaModal.tsx`, `components/fiscal/CamposFiscais.tsx`, `components/fiscal/ClienteAcoes.tsx`, `components/geral/TarefasAutomaticasCampo.tsx`, `components/geral/SeletorAtividades.tsx`, `components/geral/GruposTarefasModal.tsx`. Pranchetas `m-01-empresa-fiscal`, `m-06-grupos`.
- `EmpresaModal` no `Modal` (largura `g`), campos em **quatro seções** como na prancheta; **senha do ISS oculta com botão de mostrar**; **UF vira lista** (27 UFs); rótulo "Contato Chat" → "Contato".
- Tarefas **iguais a hoje** em 3 blocos: tarefas do cliente (adicionar, remover, "Agrupar tarefas"); automáticas do vínculo regime/atividade (X = excluir só deste cliente); excluídas para este cliente (Restaurar; só aparece se houver).
- `confirm()` de remover tarefas → `useConfirmar` (mesmo texto). `GruposTarefasModal` no `Modal`, `confirm()` → `useConfirmar`, aviso "As alterações aqui são salvas na hora." (m-06).
- `TarefasAutomaticasCampo`, `SeletorAtividades`, `GruposTarefasModal` também são usados pelas janelas do Contábil e Pessoal (`EmpresaContabilModal`, `EmpresaPessoalModal`): **props iguais**, só visual; não mexer nessas janelas (Fase 5).
- `ClienteAcoes` (botões Editar/Excluir da ficha): `Button`/`IconButton`; fluxo de exclusão igual.
- Cuidado: payload de `handleSave` e as actions **inalterados** (inclusive `prioridade`); `NovoTipoTarefaModal` (já no Modal) abre por cima.

### T4 — Ficha do cliente: cabeçalho e tarefas (revisão: sim — salva tarefas)
- Arquivos: `app/fiscal/clientes/[id]/page.tsx` (layout), `components/fiscal/TarefaChecklist.tsx`. Pranchetas `f-04-ficha`, `e-01-tarefa`.
- Cabeçalho: voltar, `NomeCliente`/CNPJ, selos (regime, atividade, responsável), ações; **aviso de parcelamento em destaque** (`Aviso` warn) quando houver; MIT para regime normal como hoje.
- `TarefaChecklist`: todos os estados de `e-01` (a fazer, liberada, aguardando, prazo perto, concluída, travada, desbloqueio com motivo, sem movimento, etapas, texto com anexo + erro de formato, sem permissão, grupo recolhido) com `Badge`, `Checkbox`, `Input`, `Modal` para o desbloqueio, `useConfirmar` onde houver `confirm`.
- Cuidado máximo: **nenhuma mudança** nas chamadas `toggleTarefaFiscal`, `atualizarEtapa`, `salvarRespostaTexto`, `uploadArquivoTarefa`, `excluirArquivoTarefa`, nem nas regras de trava/desbloqueio/visibilidade.

### T5 — Ficha do cliente: demais seções e celular (revisão: sim — salva observação/arquivos/eventos)
- Arquivos: `components/fiscal/ClienteObs.tsx`, `components/fiscal/ClienteArquivos.tsx`, `components/fiscal/ClienteConferencia.tsx`, `components/geral/EventosAvulsosSecao.tsx`, `components/geral/EventoAvulsoModal.tsx`, `components/HistoricoResponsavel.tsx`, e um componente novo de abas para o celular. Pranchetas `f-04-ficha`, `e-02-conferencia`, `m-07-evento`, `mob-05-fiscal-ficha`.
- Cada seção num `Card`; `ClienteArquivos` com `useConfirmar` no remover; `ClienteConferencia` com ícones lucide no lugar de 📂 🔍 ⏳ ⬇, três números e tabela de divergências.
- `EventoAvulsoModal` no `Modal`; **se um anexo falhar, a janela fica aberta e mostra o erro** (hoje fecha e o erro some) — mudança de funcionamento.
- **Celular (< 1024 px):** as seções da ficha viram abas **Tarefas · Eventos · Histórico · Arquivos** (mob-05). Desktop continua tudo empilhado. Implementar como componente cliente que recebe os painéis prontos (renderizados pelo servidor) e só esconde/mostra no celular — sem buscar dados de novo.
- `EventosAvulsosSecao`/`EventoAvulsoModal`/`HistoricoResponsavel` são usados também por Contábil/Pessoal: **props iguais**.

### T6 — Fechamento
- Estender `tests/fase3-varredura.test.ts` (ou criar `tests/fase4a-varredura.test.ts` igual) com os arquivos desta fase.
- Onda de pendências: corrigir todos os achados menores das revisões (regra do usuário: nada fica para depois).
- Conferência no navegador (controller, banco de **dev**, `.env.development.local` copiado de `portal-tesserato/` e apagado no fim, Runner na porta 3120, login ADMIN e FISCAL do cofre): `/fiscal/clientes`, uma ficha (marcar e desmarcar uma tarefa de teste, abrir Editar empresa sem salvar), desktop e iPhone 13.
- Revisão final da branch (modelo mais capaz), uma onda de correção, PR contra `dev` com a lista do que muda de funcionamento. Atualizar tabela Andamento do plano geral, memória e `RETOMAR-REDESIGN.md`.

## O que muda de funcionamento (para a PR)
1. `/fiscal/bots` deixa de existir.
2. Fiscal sem prioridade na tela (lista e Editar empresa); o valor fica no banco.
3. Ficha do Fiscal sem o card "Histórico {ano}".
4. Editar empresa: UF em lista; senha do ISS oculta por padrão.
5. Evento do cliente: anexo com erro mantém a janela aberta com o erro.
6. Celular: ficha em abas.
