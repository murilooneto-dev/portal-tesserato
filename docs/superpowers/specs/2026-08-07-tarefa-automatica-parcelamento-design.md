# Tarefa automática de parcelamento — Design

Data: 2026-08-07

## Contexto

Hoje o preenchimento mensal de um parcelamento (a data de emissão/envio de cada mês, `jan`..`dez`) é feito só na tela de Parcelamentos, num formulário de texto livre. O objetivo é mover esse preenchimento pra dentro da ficha do cliente, como uma tarefa mensal de verdade — igual qualquer outra tarefa do checklist — pra que o responsável pelo cliente veja e preencha isso no fluxo normal de trabalho (ficha do cliente, dashboard), sem precisar ir na tela de Parcelamentos.

Parcelamento não tem `cliente_id` — é casado por CNPJ (mesmo mecanismo já usado pelo aviso na ficha, `lib/parcelamentos-aviso.ts`). Alguns parcelamentos são só do setor Fiscal, outros só do Pessoal — precisa de um jeito de marcar isso por parcelamento.

## Escopo

### 1. Setor do parcelamento

Nova coluna `parcelamentos.setores` (`text[] not null default '{}'`). No formulário de cadastro/edição de parcelamento (`app/fiscal/parcelamentos/page.tsx`), um bloco de checkboxes igual ao já usado em `ClienteGeralModal.tsx` (`SETORES.map(...)`), mas restrito a 3 opções: Fiscal, Contábil, Pessoal (sem Societário/Financeiro, que não se aplicam aqui). Controla em quais fichas de setor a tarefa desse parcelamento é gerada.

Nesta entrega, **só Fiscal e Pessoal** de fato geram a tarefa na ficha (ver "Fora de escopo") — o checkbox de Contábil fica disponível no cadastro, mas marcar ele não tem efeito ainda.

### 2. Tarefa vinculada ao parcelamento

Nova coluna `tarefas.parcelamento_id` (`uuid references parcelamentos(id) on delete cascade`, nullable — tarefas normais continuam com esse campo `null`). Quando uma tarefa é gerada a partir de um parcelamento, essa coluna aponta pra ele; isso é o que permite, ao preencher a data da tarefa, saber em qual parcelamento e qual mês gravar de volta.

Apagar o parcelamento apaga (cascade) as tarefas geradas a partir dele — não faz sentido manter uma tarefa "preencha a data desse parcelamento" órfã.

### 3. Nome da tarefa

`Parcelamentos (SEÇÃO)` — ex: `Parcelamentos (PGFN - ECAC)`. Se o mesmo cliente tiver 2+ parcelamentos na mesma seção (acontece na prática, dado real já visto), usa o campo Local/Tipo pra desambiguar: `Parcelamentos (PGFN - ECAC / SEQ 4394823)`.

### 4. Sincronização automática (sem job agendado)

Não existe processo em segundo plano nesse sistema — a criação das tarefas é **reativa**, disparada toda vez que:
- a ficha do cliente (Fiscal ou Pessoal) carrega, ou
- o dashboard do setor (Fiscal ou Pessoal) carrega.

Uma função compartilhada `sincronizarTarefasParcelamento(supabase, setor, mes, ano)` roda nesses dois pontos, para o `mes`/`ano` da competência selecionada no momento:

1. Busca todos os `parcelamentos` com `status = 'EM ANDAMENTO'` e `setores` contendo o setor em questão.
2. Resolve cada um pro `cliente_id` correspondente, casando `parcelamentos.cnpj = clientes.cnpj` — só considera clientes que realmente têm uma linha na tabela de extensão daquele setor (`clientes_fiscal`/`clientes_pessoal`, inner join), pra não criar tarefa "Fiscal" pra um cliente que não está no setor Fiscal.
3. Agrupa por cliente + seção pra aplicar a desambiguação do item 3.
4. Para cada (cliente, parcelamento), se **não existir** ainda uma linha em `tarefas` com esse `cliente_id`+`mes`+`ano`+`tipo`(nome computado)+`setor`, insere uma nova: `parcelamento_id` = id do parcelamento, `usuario_id = null` (task gerada pelo sistema, sem usuário específico). Se o campo do mês correspondente já tiver um valor em `parcelamentos.<col>` (dado histórico, ex: do backfill de dd/mm já feito), a tarefa nasce **já concluída**, com `concluida_em` montado a partir desse dd/mm + o `ano` da competência sendo sincronizada. Se não tiver valor, nasce pendente (`concluida = false`).
5. **Nunca sobrescreve** uma tarefa que já existe — a sincronização só preenche o que falta.

Isso significa que meses passados só ganham a tarefa na primeira vez que alguém navega a competência até ali (seja na ficha, seja no dashboard) — não há preenchimento retroativo automático de todos os meses de uma vez.

### 5. Gravação de volta (checklist → parcelamento)

Preencher a data numa tarefa que tem `parcelamento_id` funciona exatamente como qualquer tarefa do tipo "data" hoje (mesmo campo, mesmo fluxo) — a diferença é um passo extra: depois de gravar `concluida`/`concluida_em` em `tarefas` (mesma lógica que já existe em `toggleTarefa`, no Fiscal, e `toggleTarefaPessoal`, no Pessoal), se a tarefa tiver `parcelamento_id`, grava também a data (convertida pro formato `dd/mm` já usado em `parcelamentos`) na coluna de mês correspondente ao `tarefas.mes` daquela tarefa (mes 1 → `jan`, mes 2 → `fev`, etc). Desmarcar a tarefa (`concluida = false`) limpa esse mesmo campo (`null`).

### 6. Campos de mês na tela de Parcelamentos viram somente leitura

Como esse mesmo dado agora é preenchido pela tarefa, os 12 campos de mês no formulário de criar/editar parcelamento (`app/fiscal/parcelamentos/page.tsx`) deixam de ser `<input>` editáveis e passam a mostrar só o valor atual (texto simples, igual já é exibido na tabela/relatório). A tela de Parcelamentos vira cadastro (empresa, seção, status, setores, regime, etc) + consulta dos meses — a edição do mês em si só acontece pela tarefa na ficha do cliente.

## Fora de escopo

- Integração com a ficha do setor Contábil (o checkbox existe no cadastro, mas não gera tarefa lá nesta entrega).
- Renomear uma seção (via "Gerenciar seções") não renomeia tarefas já criadas com o nome antigo — só parcelamentos futuros/tarefas futuras usam o nome novo.
- Preenchimento retroativo automático de todos os meses/anos passados de uma vez — a tarefa só nasce quando alguém navega até aquela competência.
- Job agendado/cron — a sincronização é sempre reativa, disparada por carregamento de página.
- Qualquer alteração no comportamento de tarefas que não têm `parcelamento_id` (tarefas normais do catálogo continuam exatamente como são hoje).
