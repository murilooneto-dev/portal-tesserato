# Redesign do Portal Tesserato — Plano de implantação

**Criado em:** 01/10/2026
**Situação:** design aprovado pelo usuário ("acredito que esteja tudo 100%"). A implantação (Fase 2 da skill `design`) **ainda não começou** e só começa com OK explícito do usuário para a primeira fase.

---

## 1. Onde está cada coisa

| O quê | Onde |
|---|---|
| Mockups aprovados (fonte da verdade visual) | https://claude.ai/artifact/SdZ3EYdm8CbusrZnGzz7sV (conta tesshub.contato@gmail.com), 130 pranchetas em páginas: Análise, Antes e depois, Design System, Navegação, Geral, Fiscal, Contábil, Pessoal, Societário, Financeiro, Administração, Janelas, Estados, Celular |
| Como ler uma prancheta numa sessão nova | Ferramenta Artifact, `action: "read"`, `url` acima, `path: "project/<arquivo>.dc.html"` (ex.: `project/c-02-clientes.dc.html`). A lista de arquivos sai com `action: "list", scope: "files"` |
| Skill que rege o trabalho | `.claude/skills/design/SKILL.md` |
| Worktree usado na análise | `D:\DEV\Site Tesserato + Fiscal\wt-visual` (branch `chore/revisao-visual`, criada de `origin/dev` no commit `f270966`) |
| Banco de desenvolvimento | Supabase dev `fcpcorqquovvgtoukxry`; credencial no cofre do Termbaker (`DEV_DATABASE_URL`) |

> O gerador dos mockups (HTML/JS) ficou numa pasta temporária da sessão e pode sumir. **Não depende dele**: o artifact guarda todas as telas publicadas.

---

## 2. Decisões do usuário (todas valem para a implantação)

**Identidade**
- Mantém o azul-marinho + ciano em todos os setores. Fundo `#111E3A`, cartões `#162444`, ciano `#00CCEB`.
- Fonte IBM Plex Sans (texto) e IBM Plex Mono (CNPJ, números). Texto mínimo de 12 px.
- Contraste AA em tudo. Tokens já ajustados: texto de apoio `#9AABCB`, vermelho de erro `#FF8F8F`; no tema claro, apoio `#4F5E7E` e link `#006B80`.
- Botão principal: texto azul-escuro `#04202B` sobre o ciano. Hoje é branco sobre ciano, com contraste de 1,94:1.

**Regra do nome do cliente (vale para todas as listas)**
- Nunca quebra linha: sempre uma linha só.
- Pode cortar com reticências, mas mostrando pelo menos 10 a 15 caracteres (`min-width: 15ch`).
- O nome completo aparece ao passar o mouse (`title`).

**Por tela**

| Tela | Decisão |
|---|---|
| Início | Calendário na largura toda, links úteis embaixo, comunicado da administração e avisos que o usuário salvar |
| Ferramentas (`/ferramentas`) | Só visual. Mesmos 3 cartões (SIGA índigo, ISS ciano, MEI âmbar), lista com `#`, busca, Exportar planilha e aviso do TessHub |
| Fiscal · Dashboard | Dois modos, **Setor \| Meu**. O modo "Meu" **é funcionalidade nova** (hoje não existe) |
| Fiscal · Clientes | **Sem prioridade**: tirar a marca P, o filtro "Prioridade" e o campo na janela Editar empresa do Fiscal. A coluna fica no banco |
| Fiscal · Ficha do cliente | **Sem o card "Histórico {ano}"** (`app/fiscal/clientes/[id]/page.tsx`, bloco "Histórico anual", ~linhas 183–290). O resto fica: tarefas, MIT, eventos, observação do mês, histórico de responsável e planilhas |
| Fiscal · Parcelamentos | Opção C: lista por seção à esquerda e detalhe ao lado |
| Fiscal · Bots (`/fiscal/bots`) | **Página removida**. Sem uso e sem link no menu. Apagar `app/fiscal/bots/`, `components/fiscal/BotsConfigForm.tsx` e o `'bots'` de `PAGINAS_SEMPRE_LIBERADAS` em `lib/route-permissions.ts`. A tabela `bots_config` fica no banco |
| Relatórios (todos os setores) | **Sem a coluna `#`** de ID |
| Contábil · Clientes (lista geral) | **Opção B, faixa do ano.** Por cliente: linha de cima com o nome (1 linha), P1 e ícone de observação logo depois do nome, vínculo, regime e responsável à direita, CNPJ embaixo do nome; embaixo, a faixa com os 12 meses na largura toda, cada bloco com mês e %, nas mesmas cores de hoje (0% vermelho, 1–99% âmbar, 100% verde) e contorno ciano no mês atual. O ano inteiro sempre visível. O Contábil **mantém** a prioridade P1 |
| Contábil · Ficha do cliente | Troca de mês na própria ficha: seletor `‹ [Setembro 2026 ▾] ›` no título das tarefas, que abre um quadro com os 12 meses e o % de cada um. Nessa tela o mês sai da barra do topo. **Funcionalidade nova** |
| Pessoal | Segue os desenhos do Contábil e do Fiscal |
| Financeiro · Relatórios | Natureza **Entrada verde, Saída vermelha** (selo, valor e total de Saídas) |
| Parâmetros | **Duas abas**: "Comunicado e e-mails" e "Usuários" (usuário editado numa gaveta). **A Manutenção de dados sai inteira**: o bloco `DevLock` + "Manutenção de Dados" em `app/fiscal/parametros/ParametrosClient.tsx` (~linha 577 em diante) e as actions de duplicatas de Parcelamentos que só ele usa |
| Logs | Uma tela com 2 abas: Eventos de clientes e Alterações de tarefas |
| Janela Editar empresa (igual em todos os setores) | Mesmos campos de hoje em seções. Tarefas **iguais a hoje**, em 3 blocos: (1) Tarefas (N) com adicionar, remover e "Agrupar tarefas"; (2) Automáticas pelo vínculo de regime e atividade, com X para excluir só do cliente; (3) Excluídas para este cliente, com Restaurar, que só aparece se houver alguma. Componentes: `CamposFiscais`, `EmpresaContabilModal`, `EmpresaPessoalModal`, `TarefasAutomaticasCampo`. Senha do ISS oculta, com botão de mostrar |

---

## 3. Regras do trabalho (memória do projeto)

- **Uma PR por fase, sempre contra a branch `dev`.** Nunca fazer merge: o usuário testa e mergeia.
- **Worktree isolado**, criado de `origin/dev` **atualizado** no início de cada fase. Outras sessões podem trocar de branch na pasta principal a qualquer momento.
- Execução **subagent-driven**, e conferir pessoalmente o trabalho dos subagentes com `git diff` e `npx tsc --noEmit`, não só confiar no relatório.
- **Nenhuma migration** está prevista neste redesign. Se aparecer necessidade de mexer no banco, vale o protocolo de produção combinado em 01/10/2026:
  1. Tudo é feito e testado no **dev** primeiro, e o usuário aprova.
  2. Antes de produção, pedir OK **para aquela mudança específica**.
  3. **Backup antes, sempre:** `pg_dump` 17 completo pelo cofre (`PROD_DATABASE_URL`, `secrets_run`), salvo em `D:\DEV\backups-prod`, conferido antes de seguir. Mudança de RLS: exportar também o `pg_policies`.
  4. Aplicar em transação com `lock_timeout`, rodar os smoke tests e relatar.
  5. Com dúvida ou risco de perda de dado: parar e perguntar. Nunca rollback destrutivo sem confirmação à parte.
  - Conexão: senha da URL vem codificada (`%xx`), então decodificar antes de usar. Conferir que é o projeto `qilwxzpxkjzbfrwlbydt` e abortar se for o dev. Consulta só-leitura: `begin read only; … rollback;`, porque o `PGOPTIONS` não funciona pelo pooler.
- Credenciais só pelo cofre do Termbaker. Nunca ler `.env`.
- Servidor de dev pelo Runner do Termbaker, não pelo terminal.
- Antes de afirmar se uma PR está aberta ou mergeada: `gh pr view <n> --json state,mergedAt`.
- Next.js 16 (Turbopack) tem mudanças de API: ler `node_modules/next/dist/docs/` antes de usar algo novo (ver `AGENTS.md`).
- Antes de cada fase, conferir o que entrou em `dev` desde a última (`git log origin/dev`). Há PRs abertas que mexem nas mesmas telas, por exemplo a #183.

**Checklist de cada fase, antes de abrir a PR**
1. `npx tsc --noEmit` sem erro e `npm run build` ok.
2. Cada tela da fase aberta no navegador do Termbaker, logado no banco de dev, e comparada com a prancheta do artifact. Ver em 1440 px e no celular (`browser_responsive`).
3. Nenhum texto abaixo de 12 px; nome de cliente sem quebra de linha; sem rolagem horizontal da página.
4. Na descrição da PR, destacar o que **muda de funcionamento** (não só visual) para o usuário testar com atenção.

---

## 4. Fases

### Fase 1 — Base visual (maior alcance, PR sozinha)
**Objetivo:** cores, fonte e peças comuns. Muda a aparência do sistema todo de uma vez, sem mexer no layout das telas.
- `app/globals.css`: tokens novos do Design System (fundos, textos fg/fg-2/fg-3, ciano, ok, warn, danger, info, versões "soft", linhas, sombras), tema escuro e claro. **Manter os nomes atuais** (`--bg-page`, `--bg-surface`, `--fg`, `--accent`, `--accent-hover`) apontando para os valores novos, para nada quebrar.
- Tirar o "remendo" de 11 regras do tema claro quando os tokens novos cobrirem.
- Fonte IBM Plex via `next/font` em `app/layout.tsx`.
- Criar `components/ui/` com as peças comuns:
  - `Button` (principal, secundário, ghost, perigo);
  - `Field` (rótulo ligado ao campo, ajuda, erro), `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`;
  - `Badge` (ok, warn, dng, info, acc, neu), `MonthPill` (pílula de %);
  - `Table`, `NomeCliente` (regra de 1 linha), `EmptyState`;
  - `Modal` (Esc, clique fora, foco preso), `Drawer`, `ConfirmDialog` (substitui `confirm()`/`alert()`), aviso de "salvo" (toast).
- Nesta fase as peças só são criadas. As telas passam a usar nas fases seguintes.

### Fase 2 — Casca (navegação)
- `components/shell/PortalShell.tsx`, `components/fiscal/TopNav.tsx`, `components/fiscal/Sidebar.tsx`, `components/fiscal/MesSeletor.tsx`.
- Barra do topo com os setores, mês, tema e usuário. Menu lateral por grupos (Geral, setor, Administração), alimentado por `lib/paginas-setor.ts`, que já controla as permissões. Não mudar a lógica de permissão.
- Celular: gaveta de menu e barra inferior com 44 px de altura de toque. Metadado de viewport no layout raiz.
- Arquivos `loading.tsx`, `error.tsx` e `not-found.tsx` (hoje não existem nenhum).

### Fase 3 — Geral
- Login (`components/auth/LoginForm.tsx`, `app/login`) e Redefinir senha (`app/auth/reset-password`).
- Início (`app/(comum)/intranet`, `components/fiscal/AgendaPessoal.tsx`, `components/fiscal/LinksRapidos.tsx`): calendário na largura toda, links embaixo, comunicado. A agenda do Início e `/fiscal/agenda` passam a usar o mesmo componente.
- Cadastro de clientes (`app/(comum)/clientes`, `components/geral/ClientesGeralLista.tsx`, `ClienteGeralModal.tsx`).
- Ferramentas (`app/(comum)/ferramentas/FerramentasClient.tsx`): **só visual**.
- Vínculos (`app/(comum)/vinculos`).

### Fase 4 — Fiscal
- Dashboard (`app/fiscal/dashboard`): troca Setor | Meu (**nova**).
- Clientes (`components/fiscal/ClientesLista.tsx`): **tirar prioridade** (P, filtro, campo em `CamposFiscais.tsx` e `EmpresaModal.tsx`).
- Ficha (`app/fiscal/clientes/[id]/page.tsx`, `TarefaChecklist.tsx`, `ClienteObs.tsx`, `ClienteArquivos.tsx`, `ClienteConferencia.tsx`): **tirar o Histórico anual**.
- Calendário, Relatórios (**sem `#`**), Parcelamentos (opção C), Preenchimento rápido (`components/PreenchimentoRapido.tsx`), Minhas tarefas (abas Tarefas, Eventos, Dossiê), Tabelas (`components/tabelas/*`), Tarefas do mês (`app/fiscal/tarefas`), Agenda.
- **Remover** `/fiscal/bots` (ver tabela da seção 2).
- Janela Editar empresa e janelas do Fiscal no `Modal` novo.

### Fase 5 — Contábil e Pessoal
- Contábil · Clientes (`components/contabil/ClientesListaContabil.tsx`): **opção B, faixa do ano** (ver seção 2).
- Contábil · Ficha (`app/contabil/clientes/[id]`, `TarefaChecklistContabil.tsx`): seletor de mês na ficha (**novo**).
- Relatórios sem `#` (`RelatoriosContabil.tsx`, `RelatoriosPessoal.tsx`).
- Dashboard, Calendário, Preenchimento rápido e Tabelas dos dois setores.
- Pessoal: `components/pessoal/*` no mesmo padrão.

### Fase 6 — Societário e Financeiro
- Societário: Procedimentos (`app/societario/procedimentos`), Clientes e Ficha (`components/societario/*`), Tabelas.
- Financeiro: Recebimentos, Pagamentos (`MovimentoListClient.tsx`, `NovoMovimentoModal.tsx`), Clientes, Ficha, **Relatórios com Saída vermelha**, Tabelas.

### Fase 7 — Administração
- Configurações (`app/admin/configuracoes/**`): página com os cartões dos setores e as abas de cada setor.
- Parâmetros (`app/fiscal/parametros/ParametrosClient.tsx`): **2 abas**, Usuários em gaveta, **remover Manutenção de dados**.
- Logs (`app/fiscal/parametros/logs`): 2 abas.
- Lixeira (`app/admin/lixeira`).

### Fase 8 — Acabamento
- Varredura de celular e tablet em todas as telas.
- Janelas que sobrarem sem Esc ou clique fora (eram 25) e `confirm()`/`alert()` restantes (eram 21).
- Estados de vazio, carregando, sem permissão e página não encontrada em todos os setores.
- Revisão final: comparar tela a tela com o artifact.

**Depois:** promoção de `dev` para `main` pelo fluxo normal do usuário.

---

## 5. Como retomar numa sessão nova

Mensagem sugerida para colar:

> Leia `docs/superpowers/plans/2026-10-01-redesign-implantacao.md` (está no worktree `wt-visual`). É o plano de implantação do redesign aprovado. O design está no artifact https://claude.ai/artifact/SdZ3EYdm8CbusrZnGzz7sV. Estamos na Fase **N**. Siga as regras da seção 3.

**Andamento** (atualizar a cada PR):

| Fase | Branch | PR | Situação |
|---|---|---|---|
| 1 Base visual | feat/redesign-fase1-base-visual | #192 | mergeada em dev |
| 2 Casca | feat/redesign-fase2-casca | #193 | mergeada em dev |
| 3 Geral | feat/redesign-fase3-geral | #194 | mergeada em dev |
| 4 Fiscal | feat/redesign-fase4-fiscal | 4a: #196 | dividida em 4a (clientes, ficha, editar empresa), 4b, 4c, 4d; 4a pronta, PR contra dev |
| 5 Contábil e Pessoal | — | — | não iniciada |
| 6 Societário e Financeiro | — | — | não iniciada |
| 7 Administração | — | — | não iniciada |
| 8 Acabamento | — | — | não iniciada |
