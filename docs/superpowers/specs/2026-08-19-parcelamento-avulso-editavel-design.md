# Parcelamento Avulso — meses editáveis na tela de Parcelamento

Data: 2026-08-19

## Contexto

Na tela de Parcelamento ([app/fiscal/parcelamentos/page.tsx](../../../app/fiscal/parcelamentos/page.tsx)), o modal de edição tem 12 campos de mês ("Parcelas Mensais") que hoje são **sempre somente-leitura**. Esses campos normalmente são preenchidos automaticamente quando alguém marca, na ficha do cliente, a tarefa gerada a partir do parcelamento (`gravarDataParcelamento` em [lib/parcelamento-tarefas.ts](../../../lib/parcelamento-tarefas.ts)).

Esse mecanismo depende de resolver o `cnpj` do parcelamento para um `cliente_id` cadastrado (`sincronizarTarefasParcelamento`). Parcelamentos marcados como **Empresa Avulsa** (`empresa_avulsa = true`) têm `cnpj = null` por definição — nunca resolvem a um cliente, portanto **nunca geram tarefa** e hoje não têm nenhuma forma de ter seus meses preenchidos.

## Objetivo

Parcelamentos avulsos passam a ter os 12 campos de mês editáveis diretamente no modal da tela de Parcelamento. Parcelamentos vinculados a cliente continuam somente-leitura ali, preenchidos apenas via tarefa na ficha do cliente.

## Mudanças

Todas em `app/fiscal/parcelamentos/page.tsx`.

### 1. Bloco "Parcelas Mensais" do modal

Quando `form.empresa_avulsa === true`: cada mês vira um `<input type="text">` de texto livre (sem validação de formato — mesmo estilo dos demais inputs de texto da tela), com `onChange` gravando em `form[mes]`. Label sem a ressalva "preenchido pela tarefa na ficha do cliente".

Quando `form.empresa_avulsa === false` (padrão, vinculado a cliente): mantém exatamente o comportamento atual — `<div>` somente-leitura, label com a ressalva.

### 2. `handleSave`

Hoje, ao editar (`editItem` presente), os campos de mês são sempre excluídos do update:

```ts
const { jan, fev, ..., dez, ...formSemMeses } = form
await sb.from('parcelamentos').update(formSemMeses).eq('id', editItem.id)
```

Passa a excluir os meses **apenas quando `editItem.empresa_avulsa === false`**. Quando `true`, envia `form` completo (incluindo meses) no update.

Criação (`insert`) não muda — já envia o form completo.

### 3. Toggle "Empresa Avulsa"

Alternar o checkbox não deve zerar os meses já digitados — só `empresa` e `cnpj` são limpos ao marcar/desmarcar, como já acontece hoje. O usuário pode trocar o tipo sem perder o que já preencheu.

## Fora de escopo

- `sincronizarTarefasParcelamento`: já ignora avulsos por falta de `cliente_id` resolvido; não muda.
- Linha expandida da tabela (fora do modal): permanece somente leitura; edição continua sendo só via modal, como é hoje para todos os campos.
- Validação de formato dd/mm nos meses de avulso: decisão explícita do usuário — texto livre, sem validação.

## Teste manual

1. Criar parcelamento com "Empresa Avulsa" marcado → meses devem ser editáveis no modal, salvar e reabrir deve manter os valores.
2. Criar/editar parcelamento vinculado a cliente (não avulso) → meses continuam somente-leitura, comportamento inalterado.
3. Alternar o checkbox "Empresa Avulsa" com meses já preenchidos → valores dos meses não somem.
