# Financeiro: Contas a Pagar + forma de pagamento no Tipo de Saída

Data: 2026-10-07 · Desenho apresentado no chat em 2026-10-06; usuário escolheu começar por esta frente
em 2026-10-07. **Aguardando revisão desta spec.** Os pontos marcados com **[CONFIRMAR]** foram decididos
por mim e precisam do OK do usuário.

## Objetivo
Hoje uma conta que se repete é lançada à mão em Pagamentos, marcando a caixa "Pagamento recorrente", e
fica misturada com o que já foi pago. O usuário quer:

1. dizer **uma vez**, no cadastro do Tipo de Saída, que aquela despesa se repete (todo mês, ou por um
   número de meses) e deixar o sistema criar as contas;
2. uma página **Contas a Pagar** só com o que ainda falta pagar;
3. clicar em **Pagar**, o sistema gravar data e hora e a conta ir para **Pagamentos**, que vira o
   histórico do que foi pago.

## O que o usuário já decidiu
- O **valor** é informado no tipo; as contas nascem com ele.
- **Pagamentos** vira histórico do que foi pago e mantém o botão **Novo pagamento** para avulsos.
- O usuário escolhe o **mês de início**. O Recorrente **renova sozinho** no ano seguinte.

## Comportamento

### 1. Tipo de Saída ganha "Forma de pagamento"
Em Configurações > Financeiro > Tipos de Saída (só admin, como hoje), cada tipo ganha a ação
**Forma de pagamento** no menu ⋯ e uma coluna que mostra a forma atual. Tipos de Entrada e Centros de
Custo não mudam.

| Forma | Campos | O que o sistema cria |
|---|---|---|
| **Avulso** (padrão, todos os tipos de hoje) | nenhum | nada |
| **Recorrente** | valor, dia de vencimento, mês de início | uma conta por mês, do mês de início até dezembro do mesmo ano; renova sozinho (item 5) |
| **Prazo determinado** | valor, dia de vencimento, mês de início, quantidade de meses | uma conta por mês, pela quantidade informada; pode atravessar o ano |

Regras dos campos:
- valor maior que zero; dia de 1 a 31; quantidade de meses de 1 a 120;
- dia que não existe no mês (29, 30, 31) vira o último dia daquele mês (regra que já existe em
  `datasRecorrentes`);
- **mês de início não pode ser anterior ao mês atual** **[CONFIRMAR]**. Motivo: mês passado nasceria
  "Vencido". Um financiamento que já começou entra com os meses que faltam.

Antes de salvar, a tela mostra o que vai acontecer: "Serão criadas 12 contas de R$ 350,00, de
janeiro a dezembro de 2027, com vencimento no dia 10."

### 2. Alterar a forma depois
Conta **paga nunca é alterada nem apagada** por mudança no tipo. Para as não pagas criadas pelo tipo:

- **Mudar valor ou dia**: todas as contas não pagas passam para o novo valor e o novo dia, inclusive
  as que foram editadas à mão em Contas a Pagar. A confirmação diz quantas mudam.
- **Mudar mês de início, quantidade de meses ou a forma**: o sistema recalcula quais meses devem
  existir, cria os que faltam e apaga as não pagas que sobraram. A confirmação diz quantas são criadas
  e quantas apagadas.
- **Voltar para Avulso**: apaga todas as não pagas do tipo, com confirmação.

As contas apagadas vão para a Lixeira (60 dias), como qualquer movimento excluído hoje.

Desativar o tipo não apaga nada; um Recorrente desativado só deixa de renovar. Excluir tipo continua
bloqueado quando há movimentos.

### 3. Página Contas a Pagar (`/financeiro/contas-a-pagar`)
Nova página no menu do Financeiro, antes de Pagamentos.

- Mostra as contas **não pagas com vencimento no mês do seletor do portal** e, no topo, as **vencidas
  de meses anteriores**.
- Colunas: vencimento, tipo, centro de custo, observação, valor, situação (**A pagar** ou **Vencido**).
  Cabeçalho com a quantidade e o total a pagar. Busca e ordenação como em Pagamentos; ordem padrão por
  vencimento, mais antiga primeiro.
- Botão **Pagar** em cada linha: grava data e hora do clique e a conta sai da lista. Aparece o aviso
  "Pago. Foi para Pagamentos." com **Desfazer**. Não há pergunta de confirmação: o Desfazer cobre o
  clique errado.
- Menu ⋯: **Editar** (valor, vencimento, centro de custo, observação; o tipo fica travado) e
  **Excluir** (só aquela conta; para parar a série, muda-se a forma do tipo).
- As séries antigas, criadas pela caixa "Pagamento recorrente" e ainda não pagas, aparecem aqui sem
  nenhuma conversão de dado. Nelas o Excluir mantém a opção "Este e os próximos".
- Não há botão de criar conta nesta página: conta nasce do tipo.

### 4. Pagamentos vira histórico
- Lista **só o que foi pago**. Somem os selos "A pagar"/"Vencido" e o total "a pagar" do cabeçalho.
- Nova coluna **Pago em**: data e hora para o que foi pago pelo botão Pagar; só a data para
  pagamentos avulsos e para os confirmados antes desta mudança (não há hora guardada).
- Uma conta paga mostra também o vencimento original.
- **O pagamento aparece no mês em que foi pago, não no do vencimento** **[CONFIRMAR]**, em Pagamentos
  e em Relatórios. Conta de setembro paga em 3 de outubro aparece em outubro. A alternativa, mais
  simples, é manter pelo vencimento (como hoje); nesse caso a conta de setembro paga em outubro
  apareceria em setembro.
- **Desfazer pagamento** (menu ⋯, só em contas; pagamento avulso não tem para onde voltar): devolve
  para Contas a Pagar e apaga a data e a hora.
- **Novo pagamento** fica só avulso: saem a caixa "Pagamento recorrente" e o "tornar recorrente" da
  edição. Um tipo Recorrente ou de Prazo determinado continua podendo ser usado num pagamento avulso.

### 5. Renovação do Recorrente
A rotina diária que já existe para o aviso por e-mail (`/api/cron/financeiro-aviso-vencimento`, 8h)
passa a renovar antes de mandar o e-mail: **em dezembro**, cria os 12 meses do ano seguinte para cada
tipo Recorrente ativo. Ela guarda até que mês cada tipo já foi gerado, então:
- rodar de novo não duplica;
- conta que o usuário excluiu não volta;
- se a rotina falhar alguns dias, a próxima execução cria o que faltou.

Falha na renovação não impede o e-mail, e vice-versa.

### 6. Aviso por e-mail
**Continua igual, valendo para toda conta a pagar que vence no dia seguinte** **[CONFIRMAR]**: as
criadas pelo tipo e as séries antigas. O texto troca "pagamentos recorrentes" por "contas a pagar".

### 7. Permissão
- Contas a Pagar entra no controle de acesso por página (`financeiro:contas-a-pagar`).
- **Quem hoje tem acesso a Pagamentos recebe Contas a Pagar automaticamente** **[CONFIRMAR]**, pela
  migration. Depois disso as duas são marcadas separadamente em Parâmetros.
- Pagar, editar e excluir conta: qualquer usuário do setor Financeiro (regra atual dos movimentos).
- Definir a forma de pagamento do tipo: só admin (regra atual do cadastro de tipos).

## Como fica por dentro

### Banco: migration 065 (conferir colisão de número antes de nomear)
`financeiro_tipos`, colunas novas (só fazem sentido em `natureza = 'saida'`):
- `forma_pagamento text not null default 'avulso'` com check `('avulso','recorrente','prazo')`;
- `valor_padrao numeric(12,2)`, `dia_vencimento smallint`, `mes_inicio date` (dia 1 do mês),
  `qtd_meses smallint`;
- `gerado_ate date`: último mês já gerado (controle da renovação);
- check: Avulso com os campos nulos; Recorrente e Prazo com valor, dia e mês preenchidos; Prazo com
  quantidade.

`financeiro_movimentos`, colunas novas:
- `competencia date` (dia 1 do mês): preenchida só nas contas criadas pelo tipo. É o que diz "esta
  conta veio do tipo" e não muda quando o usuário edita o vencimento. Índice único parcial
  `(tipo_id, competencia) where competencia is not null`: o banco impede duas contas do mesmo tipo no
  mesmo mês.
- `pago_em_hora timestamptz`: data e hora do clique em Pagar. Coluna nova em vez de converter
  `pago_em` (hoje `date`), para não deslocar por fuso as confirmações já feitas.

Ajuste de dado, para o item "aparece no mês em que foi pago":
- `pago_em = data` em todo movimento pago que hoje tem `pago_em` nulo (pagamentos avulsos e todos os
  recebimentos). Nenhuma linha muda de mês com isso;
- check `pago = false or pago_em is not null`.

Funções no banco (tudo ou nada, numa transação):
- `financeiro_definir_forma_pagamento(tipo_id, forma, valor, dia, mes_inicio, qtd_meses)`: valida,
  grava o tipo, cria as contas que faltam, atualiza valor e dia das não pagas, apaga as não pagas fora
  do novo período. `security invoker`: vale a RLS de quem chama (admin). Devolve quantas criou,
  alterou e apagou.
- `financeiro_previa_forma_pagamento(...)`: mesmos parâmetros, só conta; alimenta o texto de
  confirmação da tela sem gravar nada.
- `financeiro_renovar_recorrentes()`: usada pela rotina diária com a chave de serviço.

Permissão: `update profiles set paginas_acesso = paginas_acesso || 'financeiro:contas-a-pagar'` em
quem tem `'financeiro:pagamentos'` e ainda não tem a nova.

Acompanham a migration: `supabase/rollback/065_rollback.sql` e `supabase/tests/065_..._smoke.sql`.
RLS das duas tabelas não muda.

### Código
- `lib/financeiro-movimentos.ts`: funções puras para "é conta?" (`competencia` ou `recorrencia_id`
  preenchidos) e para o texto da prévia; sai `datasSeguintesDaSerie`.
- `lib/financeiro-actions.ts`:
  - nova `definirFormaPagamentoTipo` e `previaFormaPagamentoTipo` (admin, chamam as funções do banco);
  - `definirPagamentoConfirmado` grava também `pago_em_hora` e limpa os dois ao desfazer; desfazer
    recusa pagamento avulso;
  - `criarMovimento` perde `recorrente` e passa a gravar `pago_em = data`;
  - `atualizarMovimento` perde `tornarRecorrente`; ao mudar a data de um avulso, `pago_em` acompanha;
  - todas revalidam também `/financeiro/contas-a-pagar`.
- `app/admin/configuracoes/financeiro/`: novo `FormaPagamentoModal.tsx`; `FinanceiroCatalogoTab.tsx`
  ganha a coluna e a ação só quando é a aba de Tipos de Saída (as outras três abas que usam o mesmo
  componente não mudam).
- `app/financeiro/contas-a-pagar/page.tsx` + `components/financeiro/ContasAPagarClient.tsx`: página
  nova. Componente próprio em vez de mais um modo dentro de `MovimentoListClient` (449 linhas, já
  serve Recebimentos e Pagamentos).
- `app/financeiro/pagamentos/page.tsx`: filtra `pago = true` e `pago_em` no mês.
  `MovimentoListClient.tsx`: coluna "Pago em", sem selos de situação, Desfazer só em contas.
- `components/financeiro/NovoMovimentoModal.tsx`: sai a caixa "Pagamento recorrente"; ganha o modo
  de edição de conta (tipo travado).
- `app/financeiro/relatorios/page.tsx`: período e ordenação por `pago_em` em vez de `data`.
- `lib/financeiro-aviso-vencimento-envio.ts`: tira o filtro `recorrencia_id is not null`; texto do
  e-mail.
- `app/api/cron/financeiro-aviso-vencimento/route.ts`: chama a renovação antes do e-mail.
- `lib/paginas-setor.ts` e `lib/navegacao.ts`: página nova no menu, com ícone.

### Efeitos em outras partes
- **Log de Eventos**: cada conta criada ou apagada gera um evento (trigger da 058), como já acontece
  com o recorrente de hoje. Um tipo Recorrente novo gera até 12 eventos; a renovação de dezembro, 12
  por tipo, sem autor.
- **Lixeira**: restaurar uma conta apagada quando o tipo já recriou a do mesmo mês falha com erro do
  índice único. Aceito: é caso raro e a mensagem aparece.

## Fora do escopo
- Criar conta a pagar avulsa direto na página (conta nasce do tipo).
- Centro de custo ou observação padrão no tipo (edita-se na conta).
- Pagar com data diferente de hoje, pagamento parcial, juros e multa.
- Reajuste automático de valor na renovação (muda-se o valor no tipo).
- Contas a receber.

## Teste
- Unitários (vitest) para as funções puras e para as ações alteradas; ajustar
  `tests/fase6-financeiro.test.ts` e `tests/financeiro-aviso-vencimento.test.ts`.
- Smoke SQL no banco de dev, em transação com rollback: criar Recorrente e Prazo (incluindo dia 31 e
  virada de ano), mudar valor, reduzir prazo com conta paga no meio, voltar para Avulso, renovar duas
  vezes seguidas, conta excluída não voltar.
- Migration aplicada só no dev. `tsc`, testes e build antes da PR contra `dev`.
- Teste no navegador é do usuário, na PR. Produção só depois, com OK e backup.
