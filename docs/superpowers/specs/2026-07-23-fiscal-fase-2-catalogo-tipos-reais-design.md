# Fiscal Fase 2 (parte 2): semear tipos reais restantes, avisar drift em templates, remover "Corrigir Tarefas"

**Data:** 2026-07-23
**Status:** Aprovado

## Contexto

`docs/superpowers/specs/2026-07-21-fiscal-entrada-saidas-catalogo-design.md` migrou `ENTRADA`/`SAIDAS` pro catálogo `tarefa_tipos`, mas deixou de fora, explicitamente, três pontos: os demais tipos reais de tarefa do Fiscal (ainda hard-coded em `TAREFAS_NORMAL`/`TAREFAS_SIMPLES`/`TAREFAS_MEI`, em `components/fiscal/TarefaChecklist.tsx`), o destino de `atividade_templates`/`grupo_templates`, e a ferramenta "Corrigir Tarefas" em `/fiscal/parametros`. Esta spec cobre os três.

Investigação confirmou:
- Além de `ENTRADA`/`SAIDAS`, existem 15 nomes distintos hard-coded: `SIGET`, `SPEED GOV`, `ISS`, `ENV. DAS`, `PIS/COFINS`, `ICMS/ICMS ST`, `IRPJ/CSLL`, `REINF/INSS`, `EFD FISCAL`, `EFD PIS/COFINS`, `FECHAMENTO SIMPLES`, `GUIAS ENVIADAS`, `ICMS ST`, `REINF`, `DAS`. Nenhum está em `tarefa_tipos` hoje — todos caem no fallback padrão (campo de data simples) por ausência de entrada no catálogo.
- O lookup de nome de tarefa contra o catálogo é comparação exata de string (case/acento/espaço sensível), sem normalização. `semAcento()` (`app/fiscal/parametros/actions.ts`) existe, mas hoje só compara `tarefas_personalizadas` contra si mesma (detecção de duplicata na ferramenta "Corrigir Tarefas") — nunca contra `tarefa_tipos`.
- `atividade_templates`/`grupo_templates` geram nomes de tarefa em texto livre, gravados por merge incremental em `clientes_fiscal.tarefas_personalizadas`, sem qualquer validação contra `tarefa_tipos`. São a fonte primária de drift de nome daqui pra frente (templates aplicados no futuro podem gerar nomes que não batem com o catálogo).
- A ferramenta "Corrigir Tarefas" (8 funções em `app/fiscal/parametros/actions.ts`, UI em `ParametrosClient.tsx`) é o único mecanismo manual de correção de drift hoje. Nenhum outro código depende dessas funções; as tabelas que ela toca (`tarefas`, `clientes_fiscal.tarefas_personalizadas`) continuam em uso normal pelo resto do Fiscal sem ela.
- Decisão do usuário: drift já existente nos dados **não** é corrigido nesta fase — fica como está, "usuários no futuro alteram" manualmente. Não há apetite para migração/correção automática de dado agora.
- Segunda opinião (Fable) sobre `atividade_templates`/`grupo_templates`: recomendou aviso não-bloqueante no momento de aplicar o template, em vez de deixar 100% intocado (opção A) ou migrar pra dropdown vinculado ao catálogo (opção C, estrutural demais pro estágio atual do catálogo). Aprovado pelo usuário.

## Objetivo

1. Os 15 nomes reais restantes do Fiscal passam a existir no catálogo `tarefa_tipos` (`setor='fiscal'`), todos como `tipo_resposta='data'`, `etapas=null` — mesmo comportamento do fallback atual, sem mudança visível de UX.
2. Ao aplicar um template (`atividade_templates`/`grupo_templates`) a clientes, o admin vê um aviso não-bloqueante listando nomes gerados que não existem no catálogo do setor — a aplicação do template continua acontecendo normalmente independente do aviso.
3. A ferramenta "Corrigir Tarefas" é removida (código morto a partir daqui), junto com `semAcento` original (reimplementada, minimalista, no ponto 2).

## Fora de escopo

- Corrigir/normalizar dado de drift já existente em `tarefas_personalizadas` — decisão explícita do usuário de não mexer.
- Dar a nenhum dos 15 tipos etapas múltiplas — todos continuam "data simples", igual hoje.
- Alterar `salvarTemplate`/`salvarTemplateGrupo` (criação/edição de template) — o aviso entra só na tela de aplicar template.
- Migrar `atividade_templates`/`grupo_templates` pra usar o catálogo como fonte da verdade (dropdown/autocomplete) — opção C descartada nesta fase, fica pra quando o catálogo cobrir a maioria dos nomes reais.
- Qualquer aplicação em produção — produção ainda roda um schema anterior sem `clientes_fiscal`/`setor`/`tarefa_tipos` (mesma ressalva das frentes anteriores); esta mudança fica só no banco de dev até a sincronização da branch ser decidida.

## Design

### 1. Migration de catálogo (dev)

Nova migration SQL, aditiva (`INSERT` puro), aplicada via REST no dev (`fcpcorqquovvgtoukxry`), mesmo padrão da `012`:

```sql
insert into tarefa_tipos (setor, nome, etapas, tipo_resposta) values
  ('fiscal', 'SIGET',              null, 'data'),
  ('fiscal', 'SPEED GOV',          null, 'data'),
  ('fiscal', 'ISS',                null, 'data'),
  ('fiscal', 'ENV. DAS',           null, 'data'),
  ('fiscal', 'PIS/COFINS',         null, 'data'),
  ('fiscal', 'ICMS/ICMS ST',       null, 'data'),
  ('fiscal', 'IRPJ/CSLL',          null, 'data'),
  ('fiscal', 'REINF/INSS',         null, 'data'),
  ('fiscal', 'EFD FISCAL',         null, 'data'),
  ('fiscal', 'EFD PIS/COFINS',     null, 'data'),
  ('fiscal', 'FECHAMENTO SIMPLES', null, 'data'),
  ('fiscal', 'GUIAS ENVIADAS',     null, 'data'),
  ('fiscal', 'ICMS ST',            null, 'data'),
  ('fiscal', 'REINF',              null, 'data'),
  ('fiscal', 'DAS',                null, 'data');
```

Nomes gravados exatamente como aparecem hoje em `TAREFAS_NORMAL`/`TAREFAS_SIMPLES`/`TAREFAS_MEI` (`components/fiscal/TarefaChecklist.tsx`) — sem consolidar grafias parecidas entre grupos (ex. `ICMS/ICMS ST` vs `ICMS ST` continuam duas entradas distintas), porque já funcionam como listas independentes por grupo hoje; consolidar seria mudança de comportamento fora do que foi pedido.

### 2. Aviso de drift ao aplicar template

Em `app/fiscal/parametros/actions.ts`, `aplicarTemplateAClientes` e `aplicarTemplateGrupoAClientes`:

- Antes de gravar o merge em `clientes_fiscal.tarefas_personalizadas`, buscar `tarefa_tipos.nome` para `setor='fiscal'` e comparar cada nome do template contra essa lista, normalizando os dois lados com uma função `normalizarNome` (NFD + remove diacríticos + `toUpperCase().trim()` — mesma lógica de `semAcento`, reimplementada aqui e usada só neste ponto).
- Nomes do template sem correspondência no catálogo (após normalização) voltam no retorno da action como `avisoForaCatalogo: string[]`.
- A action continua aplicando o merge normalmente independente do resultado dessa checagem — o aviso é só informativo.
- `ParametrosClient.tsx`: quando `avisoForaCatalogo.length > 0`, mostra uma lista/banner não-bloqueante com os nomes fora do catálogo, junto da confirmação de sucesso da aplicação do template.

### 3. Remoção da ferramenta "Corrigir Tarefas"

Remove de `app/fiscal/parametros/actions.ts`: `buscarDadosParaAlteracao`, `renomearTarefaEmClientes`, `excluirTarefaDeClientes`, `preencherDataEmClientes`, `buscarConclusoesTarefa`, `buscarTarefasSemData`, `excluirRegistrosDeTarefas`, `analisarTarefasDuplicadas`, `limparTarefasDuplicadas`, e a função `semAcento` original (substituída pela `normalizarNome` do ponto 2, escopo restrito a ali).

Remove de `ParametrosClient.tsx` a seção de UI correspondente (aba/painel "Corrigir Tarefas") e os imports das funções acima.

Nenhuma tabela fica órfã — `tarefas` e `clientes_fiscal.tarefas_personalizadas` continuam em uso normal pelo resto do Fiscal (checklist de tarefas, dashboards, relatórios) independente desta ferramenta.

### Erros e casos de borda

- Se `tarefa_tipos` não tiver nenhuma linha pro setor (não deveria acontecer, mas defensivamente), `avisoForaCatalogo` lista todos os nomes do template — comportamento correto (nada está no catálogo mesmo).
- Aplicar um template que já foi aplicado antes (nomes já presentes em `tarefas_personalizadas`) continua idempotente — o merge já filtra `novas = tarefasBase.filter(t => !existentes.includes(t))`, isso não muda.
- `lib/tarefa-tipos-actions.ts` (`NOMES_RESERVADOS_FISCAL`) não precisa crescer com os 15 novos nomes — o bloqueio de nomes reservados existe pra impedir *recriação* de um tipo já semeado pela tela de "criar tipo novo"; como esses 15 tipos não tinham essa proteção antes e não é um requisito citado, fica fora de escopo (risco baixo: criar de novo um tipo já existente falharia normalmente por constraint de unicidade no banco, não por essa lista).

## Testes

Sem suíte automatizada no projeto. Verificação via `npx tsc --noEmit -p .` e `npm run build`, mais roteiro manual documentado no plano:
- Aplicar a migration no dev e confirmar os 15 tipos em `tarefa_tipos`.
- Abrir um cliente fiscal de teste com alguma dessas tarefas na lista e confirmar que continuam renderizando como campo de data simples (sem mudança visível).
- Aplicar um template (`atividade_templates` ou `grupo_templates`) que gere pelo menos um nome fora do catálogo (proposital) e confirmar que o aviso aparece, mas o merge acontece normalmente.
- Confirmar que a aba "Corrigir Tarefas" não existe mais em `/fiscal/parametros`, e que o restante da tela (templates, cadastro de usuário, permissões por página) continua funcionando.
