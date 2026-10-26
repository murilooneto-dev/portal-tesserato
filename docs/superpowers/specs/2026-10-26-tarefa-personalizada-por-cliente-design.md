# Tarefa personalizada própria de cada cliente (Contábil)

Data: 2026-10-26. Escopo: **só o setor Contábil**.

## Por que

Hoje o catálogo `tarefa_tipos` é único por `(setor, nome)`. Uma tarefa
personalizada criada na ficha de um cliente vira um tipo do catálogo do setor;
quem digita o mesmo nome em outro cliente reaproveita esse tipo em silêncio, com
o formato e a data de criação (`criado_em`, que define a partir de qual mês a
tarefa conta) de quem criou primeiro.

Caso real em produção (26/10): o Eduardo criou "Banco Santander" (formato Data)
no MERCANTIL JAMILLY em 16/10; o Marcos digitou o mesmo nome no VILA ALTA MOTOS
em 26/10 e recebeu a tarefa do Eduardo, sem escolher formato, contando desde 16/10.
O usuário percebe isso como "exclui e ela não sai do banco".

## O que o usuário decidiu

1. Ao digitar o nome de uma tarefa personalizada na ficha de um cliente do
   Contábil, **sempre** abre a criação (`NovoTipoTarefaModal`): a pessoa escolhe
   o formato e cria. Não importa se outro cliente tem tarefa com o mesmo nome.
2. Cada cliente tem a sua: formato próprio, `criado_em` próprio (mês a partir do
   qual conta), e é apagada de verdade quando sai daquele cliente.
3. Tarefas **padrão** do Contábil (e as que entram por vínculo de
   atividade/regime) continuam compartilhadas, como hoje.
4. As personalizadas que hoje estão em mais de um cliente são separadas em uma
   cópia por cliente, com o mesmo formato e a mesma data de hoje, para nada mudar
   no que já foi preenchido.
5. **Configurações → Tarefas do Contábil mostra só as tarefas padrão.** Nenhuma
   personalizada aparece ali.
6. Só Contábil. Fiscal e Pessoal ficam como estão.

## Não-objetivos / anti-objetivos

- Não mexer no comportamento de Fiscal, Pessoal, Societário, Financeiro.
- Não mudar o histórico já preenchido (`tarefas`, etapas, anexos, respostas).
  Depois da migração, toda ficha do Contábil tem que mostrar exatamente as mesmas
  tarefas, com os mesmos formatos e o mesmo preenchimento de antes.
- Não criar tela nova de edição de formato.

## Estado atual (relevante)

- `tarefa_tipos(id, setor, nome, etapas, ativo, meses_visiveis, tipo_resposta,
  padrao, responsavel_id, criado_em, vigente_ate)`, unique `(setor, nome)`.
  FK de `tarefa_tipo_vinculos.tarefa_tipo_id` (on delete cascade). Triggers de
  `evento_log` (criação/exclusão, migration 058).
- `clientes_contabil.tarefas_personalizadas text[]`: lista de **nomes**.
  `tarefas.tipo` é texto (sem FK), casa por nome + cliente. `tarefa_grupos`
  (Contábil) guarda nomes por cliente.
- Produção, Contábil, 26/10 (depois da limpeza de órfãos): 82 tipos — 7 padrão
  (usados por todos), 1 não-padrão com vínculo e sem cliente, 61 personalizados
  em um cliente só, 13 personalizados compartilhados por 62 clientes no total.
- PR #243 (aberta, outra sessão) muda `criarTipoTarefa` para receber o mês da
  tela (`inicioEm`) e gravar `criado_em` no dia 1º desse mês. **Construir em cima
  da #243** (ramificar dela, ou rebasear quando ela entrar em `dev`): o mês
  escolhido continua valendo para a tarefa criada no cliente.
- Correções anteriores no mesmo assunto: PR #147 (aviso de formato divergente no
  23505) e PR #228 (`apagarTiposSemUso`, `listarNomesDeTiposSemUso`,
  substituição de tipo sem uso). No Contábil elas deixam de ser necessárias para
  personalizadas; Fiscal/Pessoal continuam usando.

## Como fica (decidido)

**Dado:** coluna nova `tarefa_tipos.cliente_id uuid null references clientes(id)
on delete cascade`. Nulo = tipo do setor (padrão, ou ligado a vínculo, ou
Fiscal/Pessoal etc.). Preenchido = tarefa personalizada daquele cliente.
Unicidade passa a ser: `(setor, nome)` entre os de `cliente_id` nulo, e
`(setor, cliente_id, nome)` entre os de cliente. Migration **070** (conferir
número livre antes de nomear).

**Migração dos dados do Contábil** (na mesma migration, em transação):
- tipo `padrao=false`, sem vínculo, usado por exatamente 1 cliente → recebe
  `cliente_id` desse cliente;
- usado por N>1 clientes → o registro original vai para um deles e são criadas
  N−1 cópias (mesmo `tipo_resposta`, `etapas`, `meses_visiveis`, `criado_em`,
  `vigente_ate`, `ativo`, `responsavel_id`) para os demais;
- padrão, ou com vínculo → fica com `cliente_id` nulo;
- tipo personalizado sem cliente e sem vínculo (não deveria existir depois da
  limpeza de 26/10) → apagado.
- Um nome personalizado na ficha que for igual ao de um tipo padrão continua
  resolvendo para o padrão (não cria cópia).

**Regra de leitura (Contábil):** para um cliente, o tipo de um nome é o do
próprio cliente (`cliente_id = cliente`) se existir; senão o do setor
(`cliente_id` nulo). Todo lugar do Contábil que hoje monta mapa nome → tipo
(formato, etapas, `meses_visiveis`, `criado_em`, `vigente_ate`) precisa seguir
essa regra. Lugares que leem o catálogo do setor como um todo passam a ver só
`cliente_id` nulo, salvo quando precisam das do cliente.

**Criar (ficha do cliente):** `addTarefa` no `EmpresaContabilModal` só pula a
criação se o nome for de um tipo do setor (`cliente_id` nulo) ou já estiver na
própria ficha. Caso contrário abre `NovoTipoTarefaModal`, e `criarTipoTarefa`
grava com `cliente_id`. Cliente novo (ainda sem id): o tipo é gravado depois que
o cliente existe (no salvar), não antes.

**Remover:** tirar a tarefa da ficha apaga o tipo daquele cliente (além das
linhas de `tarefas`, como hoje). Excluir o cliente apaga os tipos dele (cascade).

**Configurações → Tarefas do Contábil:** lista e ações só sobre `cliente_id`
nulo. A tela de vínculos também.

## Decisões minhas (não do usuário) — conferir

1. **Tipo do setor** = `padrao=true` OU com vínculo em `tarefa_tipo_vinculos`
   (o caso "1 não-padrão com vínculo"). Fica com `cliente_id` nulo, é
   reaproveitado ao digitar o nome na ficha (não cria cópia) e aparece em
   Configurações (pode ser ligado a atividade/regime, então é do setor).
2. **Dono de um tipo na migração** = clientes cujo `tarefas_personalizadas`
   contém o nome (é o que a ficha mostra). `tarefas` e `tarefa_grupos` não
   contam. Com N>1 clientes, o registro original fica com o de menor
   `cliente_id`; as cópias levam todas as colunas (inclusive `responsavel_id`).
   Fora de `tarefa_tipo_vinculos` nada referencia o tipo por id
   (`evento_log` só guarda texto; `tarefa_grupos` guarda nomes).
3. **#243 ainda aberta:** ramificar da branch da #243 e abrir a PR contra
   `dev`, avisando no corpo que depende dela (merge da #243 antes).
4. **Cliente novo (sem id):** o formato/mês escolhido no
   `NovoTipoTarefaModal` fica guardado no estado do formulário; o
   `salvarClienteContabil` cria o cliente e depois os tipos dele. Se gravar um
   tipo falhar, devolve erro na tela (o cliente já criado fica; a pessoa
   reabre a ficha e adiciona de novo).
5. **Só tirar da ficha apaga o tipo do cliente.** Grupos, Preenchimento
   Rápido e Dossiê só leem nomes; tirar de um grupo não apaga nada.
   Renomear não existe hoje (é remover + criar).
6. **Smoke da migração:** consulta "antes/depois" escrita pelo builder que,
   para cada cliente do Contábil e cada nome da ficha, compara o formato
   resolvido (`tipo_resposta`, `etapas`, `meses_visiveis`, `criado_em`,
   `vigente_ate`). Tem que dar zero diferenças, no dev e em produção.

## Pontos de leitura conhecidos (inventário a completar pelo builder)

`app/contabil/clientes/[id]/page.tsx`, `app/contabil/clientes/page.tsx`,
`app/contabil/clientes/actions.ts` (etapas por nome, ~linha 227),
`app/contabil/preenchimento-rapido/page.tsx`, `components/contabil/EmpresaContabilModal.tsx`,
`lib/tarefas-esperadas.ts` (`criado_em`/`vigente_ate` por nome),
`lib/tarefa-tipos-actions.ts`, `lib/tarefas-do-cliente.ts`,
`lib/tarefa-grupos-setor-actions.ts`, `lib/dossie-actions.ts`,
`lib/tarefa-tipo-vinculos-actions.ts` (`listarTarefaTiposDoSetor` e afins),
`app/(comum)/vinculos/page.tsx`, `lib/tarefa-tipo-donos.ts`,
`lib/supabase/server.ts` (responsavel_id por nome), dashboards/relatórios/Minhas
Tarefas do Contábil se lerem tipo por nome. O builder deve fazer o inventário
completo por `grep` (`tarefa_tipos`, `tarefas_personalizadas`) antes de planejar.

## Deixado para o builder

- Formato exato dos índices únicos e do SQL de migração; script de rollback.
- Como passar o `cliente_id` para os helpers de mapa (assinatura das funções).
- Testes (o projeto usa `npm test`; seguir os existentes de `tarefas-esperadas`,
  `tarefas-do-cliente`, fase7).

## Entrega

Dev primeiro: migration aplicada no banco de dev, PR contra `dev`. Produção só
com OK explícito do usuário, backup e smoke, conforme `CLAUDE.md`. A migração é
dividida para o código antigo nunca quebrar: **070** (só esquema + Lixeira) é
aplicada ANTES do deploy (todas as linhas seguem com cliente_id nulo, então o
código antigo funciona igual); **071** (separação dos dados + autoverificação)
é aplicada DEPOIS do deploy ficar "Ready". Ambas idempotentes.
