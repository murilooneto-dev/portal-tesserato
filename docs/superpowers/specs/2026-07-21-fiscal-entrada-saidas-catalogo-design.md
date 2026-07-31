# Fiscal Fase 2 (parte 1): migrar ENTRADA/SAIDAS pro catálogo genérico

**Data:** 2026-07-21
**Status:** Aprovado

## Contexto

`ENTRADA` e `SAIDAS` são os únicos dois tipos de tarefa do Fiscal que continuam hard-coded desde a Fase 1 (`docs/superpowers/specs/2026-07-17-fiscal-catalogo-tarefa-tipos-fase1-design.md`), que deliberadamente deixou o motor de catálogo (`tarefa_tipos`) pronto mas nunca ativado pra tipos reais. `ENTRADA`/`SAIDAS` são reconhecidos por comparação literal de string (`tipo === 'ENTRADA' || tipo === 'SAIDAS'`) em `components/fiscal/TarefaChecklist.tsx`, antes de qualquer lookup no catálogo, e renderizam 3 checkboxes (`recebido`/`importado`/`conferido`) — colunas booleanas próprias na tabela `tarefas`, em vez do mecanismo genérico de etapas nomeadas (`tarefa_etapas`) que Contábil/Pessoal já usam.

Investigação confirmou:
- `ENTRADA`/`SAIDAS` aparecem na lista efetiva de tarefas de praticamente todo cliente Fiscal hoje — explícita em `tarefas_personalizadas`, ou implícita pelos arrays de fallback `TAREFAS_NORMAL`/`TAREFAS_SIMPLES` (só o grupo MEI não tem).
- `concluida` (usado por relatórios/histórico/dashboard) já é calculado de forma independente do caminho de renderização — trocar de formato não quebra nada rio abaixo.
- O botão "Desbloquear" nunca foi exclusivo de `ENTRADA`/`SAIDAS` — já é genérico, condicionado a qualquer tarefa `tipo_resposta='data'` sem etapas. Hoje só `ENTRADA`/`SAIDAS` batem essa condição por não haver outros tipos reais no catálogo ainda.
- O motor genérico de etapas nomeadas (`atualizarEtapa` em `app/fiscal/clientes/actions.ts`, e o branch de renderização correspondente em `TarefaChecklist.tsx`) já existe desde a Fase 1 e nunca foi exercitado com um tipo real.
- **Produção ainda não tem o schema desta branch** (`clientes_fiscal` separado, coluna `setor` em `tarefas`, `tarefa_tipos`) — produção é uma versão anterior, Fiscal-only, sem o split multi-setor. Essa mudança só existe no banco de dev (`fcpcorqquovvgtoukxry`) e nesta branch por enquanto; não há caminho pra produção até a sincronização da branch (decisão já adiada pelo usuário).
- Auditoria em produção (2026-07-21, adaptada ao schema antigo já que não existe `clientes_fiscal`/`setor` lá): 165 clientes fiscais no total, 143 com `ENTRADA`/`SAIDAS` explícito na lista personalizada + 1 via fallback de grupo = ~144 afetados. 8 tarefas `ENTRADA` do mês corrente com progresso parcial (pelo menos um dos 3 marcado, ainda não concluída) — número modesto, mas irrelevante pro timing de *aplicar esta mudança agora*, já que hoje ela só afeta o dev (sem dado real). Fica registrado pra quando a sincronização com produção for decidida.

## Objetivo

`ENTRADA` e `SAIDAS` deixam de ser hard-coded e passam a ser dois tipos reais no catálogo `tarefa_tipos` (`setor='fiscal'`), com `etapas = ['Recebido', 'Importado', 'Conferido']` — preservando o fluxo de trabalho atual dos operadores (3 itens marcáveis), agora pelo mecanismo genérico.

## Fora de escopo

- Migrar dado histórico de `recebido`/`importado`/`conferido` pra `tarefa_etapas` — essas colunas ficam no schema, só param de ser lidas/escritas. Tarefas já concluídas continuam concluídas (o campo `concluida` não muda).
- Normalizar nomes de tarefa reais com "drift" (outro pedaço da Fase 2, spec própria).
- Decidir o destino de `atividade_templates`/`grupo_templates` (outro pedaço da Fase 2, spec própria).
- Mexer na ferramenta "Corrigir Tarefas" (`/fiscal/parametros`) — fora disso, também porque `app/fiscal/parametros/ParametrosClient.tsx` está com divergência local não sincronizada com `main` (ver nota abaixo).
- Qualquer aplicação em produção — essa mudança fica só no banco de dev até a sincronização da branch com produção ser decidida.

## Design

### 1. Migration de catálogo (dev)

Nova migration SQL, aplicada só no Supabase de dev (`fcpcorqquovvgtoukxry`):

```sql
insert into tarefa_tipos (setor, nome, etapas, tipo_resposta) values
  ('fiscal', 'ENTRADA', array['Recebido', 'Importado', 'Conferido'], 'data'),
  ('fiscal', 'SAIDAS',  array['Recebido', 'Importado', 'Conferido'], 'data');
```

(`tipo_resposta='data'` é o valor correto pro formato "Opções" — etapas nomeadas — que é distinto de `tipo_resposta='texto'`; ver `lib/types.ts`.)

### 2. `components/fiscal/TarefaChecklist.tsx`

Remove o caso especial: a constante `ehSubEtapaFixa` (e as duas linhas que dependem dela pra decidir `etapasDefinidas`/`tipoResposta`) somem — `etapasDefinidas`/`tipoResposta` passam a vir sempre do lookup no catálogo (`tarefaTipos[tipo]`), sem a ressalva. O branch de JSX que renderizava os 3 checkboxes fixos (`ehSubEtapaFixa ? (...) : ...`) também sai — sobra só o branch já existente de etapas genéricas (que hoje nunca era alcançado por `ENTRADA`/`SAIDAS`, mas já existe e já funciona pra tipos catalogados com `etapas` não-nulo). As constantes `SUB_ETAPAS`/`SUB_ETAPAS_LABEL` (não usadas em mais nenhum lugar depois disso) são removidas.

### 3. `app/fiscal/clientes/actions.ts`

Remove a função `atualizarSubEtapa` — depois da mudança #2 ela fica sem nenhum chamador no código, mas continua sendo uma server action autenticada e alcançável via POST direto; deixá-la viva escreveria `concluida` pela regra antiga (todos os 3 booleanos) e poderia entrar em conflito com o que o motor genérico de etapas escreve pro mesmo registro. `desbloquearTarefa` **não muda** — continua resetando `recebido`/`importado`/`conferido` junto com o reset genérico; são colunas mortas dali pra frente, o reset é inofensivo e não vale o risco de mexer numa action sensível já revisada.

### Erros e casos de borda

- Tarefas `ENTRADA`/`SAIDAS` já concluídas (mês passados ou atual) continuam concluídas — `concluida`/`concluida_em` não são tocados, só o formato de exibição/edição de tarefas *ainda não concluídas* muda.
- Uma tarefa do mês corrente com progresso parcial (ex: só `recebido=true`) deixa de mostrar esse progresso na tela — os 3 booleanos continuam no banco, intocados, mas a UI nova não os lê mais. O operador re-marca do zero pelas novas etapas nomeadas. Não é perda de dado, é uma transição de UX aceita conscientemente (ver auditoria acima).
- `lib/tarefa-tipos-actions.ts` (`NOMES_RESERVADOS_FISCAL = ['ENTRADA', 'SAIDAS']`, do bloqueio de nomes reservados no fluxo de "criar tipo novo") **não muda** — continua bloqueando a criação desses nomes pela tela, o que agora é redundante (já existem no catálogo) mas inofensivo.

## Testes

Sem suíte automatizada no projeto. Verificação via `npx tsc --noEmit -p .` e `npm run build`, mais roteiro manual documentado no plano (aplicar a migration no dev, abrir um cliente fiscal de teste, confirmar que `ENTRADA`/`SAIDAS` renderizam como checklist de 3 etapas nomeadas em vez dos checkboxes antigos, marcar as 3 e confirmar que a tarefa fica concluída, testar o botão Desbloquear).
