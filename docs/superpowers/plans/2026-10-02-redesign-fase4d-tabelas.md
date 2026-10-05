# Redesign — Fase 4d: Tabelas (todos os setores) — Plano enxuto

> Modo econômico. As **Regras** do plano da 4a (`2026-10-02-redesign-fase4a-fiscal-clientes.md`) valem aqui iguais.

**Base:** worktree `D:\DEV\Site Tesserato + Fiscal\wt-redesign-f4d`, branch `feat/redesign-fase4d-tabelas`, **empilhada em `feat/redesign-fase4c-parcelamentos` (PR #198 → #197 → #196)**. PR contra `dev`, avisando a ordem.

**Alcance:** `components/tabelas/*` é usado por **Fiscal, Contábil, Pessoal, Societário e Financeiro** (páginas `app/<setor>/tabelas/page.tsx` e `[id]/page.tsx` só repassam o setor). A mudança vale para os cinco setores.

**Pranchetas** (`D:\DEV\Site Tesserato + Fiscal\docs\redesign-2026-mockups\preview\<nome>.html`; gerador em `boards\04_fiscal.js`, `boards\09_modais.js`, `boards\12_extra.js`/`14_fidelidade.js` para f-17): `f-12-tabelas`, `f-13-tabela-aberta`, `f-17-tabela-filtros`, `m-12-nova-tabela`, `m-13-colunas`, `m-14-reenviar`.

**Lógica que não pode mudar:** toda a de `lib/tabelas-*` (consulta, paginação, parse da planilha, montar payload, editar célula, trocar tipo, reenvio, exportar xlsx, permissões, casamento de cliente) — há ~12 arquivos de teste `tests/tabelas-*.test.ts` que devem continuar passando **sem alteração**.

## Tarefas

### T1 — Lista e tabela aberta (revisão: sim — edita células)
- Arquivos: `components/tabelas/TabelasLista.tsx`, `TabelaDetalhe.tsx`, `TabelaEditavel.tsx`, `BarraConsulta.tsx`.
- Lista (f-12): `Pagina` + `CabecalhoPagina` ("Nova tabela" primário se permitido hoje), tabela com nome inteiro, linhas e data de atualização; vazio com `EmptyState`.
- Tabela aberta (f-13): primeira coluna fixa ao rolar para o lado, células sem a alça de redimensionar, selo "sem cliente", ordenação no cabeçalho (`aria-sort`), paginação no rodapé; contêiner rolável `relative overflow-x-auto` (regra da 4a); ações (exportar, gerenciar colunas, atualizar com planilha, excluir) com `Button`/`IconButton` e `useConfirmar` onde houver confirmação.
- Filtros (f-17): painel de filtros por tipo de coluna (texto contém, lista, intervalo de datas, intervalo numérico) com contagem de filtros ativos e Aplicar/Limpar — **reaproveitar o que `BarraConsulta` já faz** (os filtros existem); só visual e organização.
- Cuidado: URL/searchParams (pagina, q, filtros, ordem, dir, semCliente) iguais; edição de célula com as mesmas chamadas.

### T2 — Janelas: nova tabela, colunas, atualizar com planilha (revisão: sim — gravam estrutura e linhas)
- Arquivos: `components/tabelas/NovaTabelaWizard.tsx`, `GerenciarEstrutura.tsx`, `ReenviarPlanilhaWizard.tsx`.
- Nova tabela (m-12): **três passos** (Arquivo, Colunas, Clientes) com indicador de passo, rótulos de tipo e chave por coluna, Voltar e Continuar no rodapé; no `Modal`.
- Gerenciar colunas (m-13): vira **gaveta lateral** (`Drawer`), confirmação de excluir **na própria coluna**, rodapé dizendo que tudo salva na hora.
- Atualizar com planilha (m-14): prévia em números, conflitos lado a lado com escolha por linha ou em massa, **botão Voltar** (novo); no `Modal`.
- Cuidado máximo: as chamadas de criação, alteração de estrutura e reenvio **inalteradas** (mesmos argumentos), mesmas validações.

### T3 — Fechamento
- `tests/fase4d-varredura.test.ts`; onda de pendências; conferência no navegador (dev): abrir uma tabela em dois setores, ordenar, filtrar, paginar, editar uma célula de teste e desfazer, abrir as três janelas sem concluir; celular sem rolagem lateral da página. Revisão final; PR; memória + `RETOMAR-REDESIGN.md` + tabela Andamento.

## O que muda de funcionamento (para a PR)
1. Vale para os cinco setores.
2. Nova tabela em três passos; Gerenciar colunas em gaveta lateral; Atualizar com planilha ganha Voltar e escolha de conflitos em massa (se ainda não existir, só reorganizado).
3. Primeira coluna fixa e células sem alça de redimensionar.
