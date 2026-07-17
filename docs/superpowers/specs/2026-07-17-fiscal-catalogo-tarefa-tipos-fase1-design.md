# Fiscal ganha o catálogo `tarefa_tipos` — Fase 1 (aditiva, sem migração de dados)

**Data:** 2026-07-17
**Branch:** `feat/motor-tarefas-setor` (local, dev-only)

> **Nota:** este spec foi escrito em modo assíncrono (Auto Mode), sem resposta ao vivo do usuário à pergunta de escopo feita durante o brainstorming. As decisões abaixo seguem a opção mais conservadora que eu tinha recomendado, documentadas explicitamente pra confirmação na segunda-feira. Nenhuma implementação começa até esse spec ser revisado e aprovado.

## Contexto

Fiscal é o único setor com dados reais em produção. Hoje ele não tem catálogo de tipos de tarefa: `clientes_fiscal.tarefas_personalizadas` é um array de texto livre por cliente, e `TarefaChecklist.tsx` trata toda tarefa de forma uniforme — exceto duas, `ENTRADA` e `SAIDAS`, que ganham 3 sub-etapas fixas (`recebido`/`importado`/`conferido`, colunas booleanas em `tarefas`) só porque o **nome literal** bate com essas duas strings, hard-coded no componente.

Contábil e Pessoal já têm `tarefa_tipos` (catálogo com `etapas` nomeadas genéricas e `tipo_resposta` DATA/TEXTO+anexo, construído nas duas sessões anteriores). O pedido do usuário foi trazer o Fiscal pro mesmo padrão — mas o Fiscal carrega três coisas que o Contábil/Pessoal não tinham quando foram criados: dados reais de produção, uma ferramenta de correção de tarefas (`app/fiscal/parametros` → "Corrigir Tarefas": renomear/excluir/deduplicar) que existe precisamente *porque* hoje é texto livre, e dois sistemas de template (`atividade_templates`, `grupo_templates`) que geram `tarefas_personalizadas` por merge incremental.

Investigação prévia (relatório completo do subagent explorador, resumo abaixo) confirmou: não existe nenhum plano documentado de portar o Fiscal pro catálogo — esta é a primeira vez que essa frente é aberta. O spec original do motor de tarefas (14/07) deixou o Fiscal de fora do catálogo deliberadamente, tratando isso como decisão de arquitetura permanente, não débito técnico com prazo.

## Objetivo desta fase

Dar ao Fiscal a **capacidade** de usar `tarefa_tipos` (etapas genéricas + tipo de resposta DATA/TEXTO) — a mesma máquina que Contábil/Pessoal já têm — **sem migrar nenhum dado de cliente e sem mudar o comportamento de nenhuma tarefa existente**. Uma tarefa cujo nome não está no catálogo (todas, no dia em que este plano for implementado) continua se comportando exatamente como hoje.

Analogamente ao que já foi feito com `tipo_resposta` no Contábil/Pessoal: entrega-se a máquina primeiro, ativação específica (marcar um tipo real como usando etapas do catálogo) é decisão de negócio posterior, feita via migration SQL pontual — nunca automática, nunca via este spec.

## Fora de escopo (explicitamente adiado pra fases futuras, cada uma com seu próprio spec)

- **Migrar `ENTRADA`/`SAIDAS` do hard-code pro catálogo.** O comportamento especial dessas duas tarefas (3 sub-etapas booleanas fixas) continua exatamente como está — mesmas colunas `tarefas.recebido/importado/conferido`, mesmo `atualizarSubEtapa`, mesmo `desbloquearTarefa`/`task_unlock_log`. Migrar isso significaria converter estado real de produção (boolean → linhas em `tarefa_etapas`) — risco desproporcional pra uma fase aditiva. Fica pra uma Fase 2, com plano de migração de dados dedicado.
- **Normalizar/consolidar os nomes de tarefa já digitados livremente pelos clientes reais** (o "drift" que a ferramenta "Corrigir Tarefas" existe pra mitigar hoje). Nenhum dado de `clientes_fiscal.tarefas_personalizadas` é tocado nesta fase.
- **Migrar `atividade_templates`/`grupo_templates` pra seed de catálogo.** Continuam gerando texto livre exatamente como hoje; nenhuma mudança nos dois sistemas de template.
- **Descontinuar a ferramenta "Corrigir Tarefas"** (`app/fiscal/parametros`, `CorrigirTarefasClient.tsx`). Continua existindo e sendo útil enquanto o universo de tarefas do Fiscal for majoritariamente texto livre sem catálogo.
- **Tela de admin pra gerenciar o catálogo do Fiscal.** Mesmo padrão já decidido pra Contábil/Pessoal: catálogo administrado via migration SQL pontual, sem UI.
- **Aplicar isso em produção.** Este spec e o plano subsequente continuam dev-only, na branch local. Nenhuma migration deste plano roda contra produção sem pedido explícito e revisão separada.

## Design

### 1. Modelo de dados

Nenhuma migration nova necessária além de garantir que `tarefa_tipos`/`tarefa_etapas` já aceitam `setor = 'fiscal'` — e aceitam: `setor` é do tipo `user_setor`, que já inclui `'fiscal'` desde `001_initial.sql`, e nenhuma das duas tabelas tem restrição adicional por setor além do enum. **Nenhuma linha é inserida no catálogo por esta fase** — `tarefa_tipos` continua sem nenhuma entrada `setor = 'fiscal'` até uma decisão de negócio futura pontual.

### 2. `TarefaChecklist.tsx` ganha o mesmo fallback gracioso que Contábil/Pessoal já têm

Hoje, `TarefaChecklist.tsx` decide a renderização assim:
```ts
{(tipo === 'ENTRADA' || tipo === 'SAIDAS') ? (/* 3 sub-etapas fixas */) : (/* 1 input de data */)}
```

Passa a:
```ts
{(tipo === 'ENTRADA' || tipo === 'SAIDAS') ? (
  /* 3 sub-etapas fixas — inalterado, checado ANTES de olhar o catálogo */
) : tarefaTipos[tipo]?.etapas ? (
  /* sub-checklist genérico, igual TarefaChecklistContabil — novo */
) : tarefaTipos[tipo]?.tipoResposta === 'texto' ? (
  /* textarea + anexo, igual TarefaChecklistContabil — novo */
) : (
  /* 1 input de data — mesmo comportamento de sempre, agora também o fallback de catálogo ausente */
)}
```

`ENTRADA`/`SAIDAS` continuam checados primeiro, por nome literal, exatamente como hoje — nunca passam pelo catálogo, então nunca são afetados por esta fase. Qualquer outro nome de tarefa sem entrada em `tarefa_tipos` cai no mesmo input de data de sempre (`tarefaTipos[tipo]` é `undefined`, os dois `?.` retornam `undefined`, cai no `else`).

`app/fiscal/clientes/[id]/page.tsx` passa a buscar `tarefa_tipos` filtrado por `setor = 'fiscal'` (hoje devolve array vazio, já que não há seed) e `tarefa_arquivos`/`tarefa_etapas` das tarefas do cliente — mesmo padrão de fetch já usado em `app/contabil/clientes/[id]/page.tsx`.

### 3. Server actions

O Fiscal ganha as mesmas 4 funções que Contábil/Pessoal já têm — `atualizarEtapa`, `salvarRespostaTexto`, `uploadArquivoTarefa`, `excluirArquivoTarefa` — adicionadas em `app/fiscal/clientes/actions.ts`, usando `podeEditarCliente` (já existe) em vez de criar uma nova função de permissão. `toggleTarefa` (hoje definida inline em `page.tsx`) permanece como está — não é necessário centralizá-la em `actions.ts` para esta fase, embora seja uma limpeza natural pra uma fase futura.

### 4. Dashboard/Relatórios/Histórico do Fiscal

**Sem mudança.** Continuam calculando progresso 100% a partir de `tarefas_personalizadas` (texto livre) e `tarefas.concluida`, exatamente como hoje — o campo `concluida` de uma tarefa que passa a usar etapas genéricas ou texto continua sendo recalculado do mesmo jeito que já é recalculado hoje pras etapas fixas de ENTRADA/SAIDAS (todas as sub-partes concluídas → `concluida = true`), então nenhuma tela de agregação precisa saber a diferença.

## Critério de sucesso

- `npx tsc --noEmit -p .` e `npm run build` limpos, nenhuma rota do Fiscal quebrada.
- Nenhum cliente real (ou de teste) muda de comportamento visível — todo teste manual em `/fiscal/clientes/[id]` looks identical a antes desta fase, pra qualquer tarefa existente.
- Um tipo de tarefa de teste (nome que não existe em nenhum cliente real) pode ser inserido no catálogo via SQL pontual (`insert into tarefa_tipos (setor, nome, etapas) values ('fiscal', 'Teste QA', array['Passo 1','Passo 2'])`) e, se um cliente de teste tiver esse nome exato em `tarefas_personalizadas`, a checklist renderiza o sub-checklist genérico — prova de que a máquina funciona, sem tocar em nenhum dado real.
- `ENTRADA`/`SAIDAS` continuam funcionando bit-a-bit como hoje pra todo cliente real, incluindo `desbloquearTarefa` e o log em `task_unlock_log`.

## Perguntas em aberto pra segunda-feira

1. A estratégia de fases proposta (aditiva, zero migração de dados) é a que você quer, ou prefere já incluir a migração de `ENTRADA`/`SAIDAS` pro catálogo nesta mesma leva?
2. Depois desta Fase 1 (a máquina existir), qual é o próximo passo real — migrar nomes de tarefa específicos pro catálogo aos poucos (um de cada vez, via SQL, como já fazemos pra Contábil/Pessoal), ou você já tem em mente um conjunto maior a converter de uma vez?
3. Confirma que "Corrigir Tarefas" e os dois sistemas de template devem ficar intocados por enquanto?
