# Redesign — Fase 4c: Fiscal · Parcelamentos — Plano enxuto

> Modo econômico. As **Regras** do plano da 4a (`2026-10-02-redesign-fase4a-fiscal-clientes.md`) valem aqui iguais.

**Base:** worktree `D:\DEV\Site Tesserato + Fiscal\wt-redesign-f4c`, branch `feat/redesign-fase4c-parcelamentos`, **empilhada em `feat/redesign-fase4b-fiscal` (PR #197, que depende da #196)**. PR contra `dev`, avisando a dependência.

**Pranchetas** (`D:\DEV\Site Tesserato + Fiscal\docs\redesign-2026-mockups\preview\<nome>.html`; gerador `boards\04_fiscal.js` linha ~81 `parcelamentos`, `boards\09_modais.js` `m-09`/`m-10`, `boards\11_mobile.js` `mob-08`): `f-07-parcelamentos` (opção C aprovada), `m-09-parcelamento`, `m-10-secoes`, `mob-08-parcelamentos`.

**Arquivos de hoje:** `app/fiscal/parcelamentos/page.tsx` (743 linhas, tudo num arquivo cliente), `components/fiscal/GerenciarSecoesModal.tsx`, ações em `lib/parcelamento-secoes-actions.ts`, regras em `lib/parcelamento-campos.ts` (`montarUpdateParcelamento`, `MES_PARA_COLUNA`) e `lib/parcelamento-tarefas.ts`.

## Decisão já tomada pelo usuário (02/10)
Parcelamento liga ao cliente **pelo CNPJ exato** (tarefa automática e aviso na ficha). No formulário:
- cliente cadastrado escolhido **sem CNPJ** → aviso: "Este cliente não tem CNPJ no cadastro: o parcelamento não vai gerar tarefa nem aviso na ficha. Cadastre o CNPJ do cliente primeiro." (e o salvar continua permitido);
- com cliente cadastrado, o campo **CNPJ segue o do cliente e não é editável**; só "empresa avulsa" permite digitar CNPJ.
Não mexer em banco nem na regra de ligação.

## Tarefas

### T1 — Lista e detalhe (opção C) (revisão: sim — exclui parcelamentos e grava datas)
- Quebrar `page.tsx` em componentes em `components/fiscal/parcelamentos/` (lista por seção, detalhe, cabeçalho/filtros) mantendo **toda** a lógica de dados (carregar, filtros por seção/responsável/busca, permissões admin/usuário, gravação das datas dos meses via `montarUpdateParcelamento`/`gravarDataParcelamento` como hoje, status, setores, relatório impresso com `escapeHtml`).
- Layout opção C (f-07): **lista por seção à esquerda** com nome e CNPJ inteiros (sem cortar — exceção do f-07) e **detalhe à direita** com todos os campos, **senhas ocultas por padrão** (botão mostrar) e as 12 parcelas com a data de emissão.
- Celular (mob-08): lista vira cartões com nome, CNPJ e uma régua dos 12 meses; tocar abre o detalhe em tela cheia (Drawer ou painel), com voltar.
- Excluir parcelamento: `useConfirmar` (perigo) no lugar do `confirm()`.
- "Relatório" (impressão) continua igual no conteúdo.

### T2 — Janelas: novo/editar parcelamento e seções (revisão: sim — grava)
- Formulário (m-09) no `Modal`: seções Empresa, Parcelamento, Tarefa automática, Senhas; **Regime vira lista** (opções: regimes do catálogo do Fiscal — a mesma fonte do Editar empresa; manter valor antigo se não estiver na lista); fechar por ×, Esc, Cancelar ou clique fora faz a mesma coisa; **regra do CNPJ acima**.
- `GerenciarSecoesModal` (m-10) no `Modal`: renomear na própria linha, remover com `useConfirmar`, **criar seção aqui mesmo** (usa `criarSecaoParcelamento`, que já existe); props iguais.
- Payload de gravação **inalterado** (`montarUpdateParcelamento(form, form.empresa_avulsa)`), inclusive `empresa_avulsa`, setores e meses.

### T3 — Fechamento
- `tests/fase4c-varredura.test.ts` (formato das anteriores); onda de pendências; conferência no navegador (dev; criar um parcelamento de teste com cliente com CNPJ e ver a tarefa na ficha; ver o aviso com cliente sem CNPJ; excluir o de teste); revisão final; PR; memória + `RETOMAR-REDESIGN.md` + tabela Andamento.

## O que muda de funcionamento (para a PR)
1. Tela em lista + detalhe (opção C); no celular, cartões com régua dos meses.
2. Aviso quando o cliente não tem CNPJ; CNPJ travado no do cliente cadastrado.
3. Regime em lista.
4. Seções: criar, renomear e remover direto na janela de seções.
5. Excluir parcelamento pede confirmação na janela nova.
