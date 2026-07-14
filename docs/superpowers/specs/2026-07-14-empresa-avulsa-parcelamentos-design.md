# Empresa Avulsa em Parcelamentos

## Contexto

A página `/fiscal/parcelamentos` ([page.tsx](../../../app/fiscal/parcelamentos/page.tsx)) tem um modal de criar/editar parcelamento onde o campo "Empresa" é hoje um `<select>` restrito à lista de clientes cadastrados (tabela `clientes`). Na prática, existem parcelamentos acompanhados pelo usuário que são avulsos — não pertencem a nenhuma empresa cadastrada no portal — e hoje não há forma de registrá-los corretamente.

Além disso, existe um bug relacionado: em `openEdit` (linhas 115-121), se o nome salvo em `empresa` não bate com nenhum nome da lista `clientesCadastrados`, o campo é silenciosamente zerado ao reabrir o registro para edição.

## Objetivo

Adicionar ao modal de parcelamento uma opção "Empresa Avulsa" que, quando marcada, libera o campo Empresa para digitação livre, sem exigir vínculo com um cliente cadastrado. E corrigir o bug de reset ao editar registros avulsos.

## Escopo

- Nova coluna `empresa_avulsa boolean not null default false` na tabela `parcelamentos` (migration no schema dev primeiro).
- Checkbox "Empresa Avulsa" no modal, junto ao campo Empresa.
- Quando marcado: campo Empresa vira `<input>` de texto livre; CNPJ auto-vinculado é limpo (usuário pode digitar manualmente, já que CNPJ já é um `<input>` livre hoje).
- Quando desmarcado (padrão, comportamento atual): campo Empresa continua `<select>` com `clientesCadastrados`.
- `openEdit` passa a decidir select vs. input com base em `item.empresa_avulsa`, não mais por heurística de nome — elimina o bug de reset.
- Validação de salvar continua igual: `form.empresa.trim()` não vazio, independente do modo.

## Fora de escopo

- Alterar o campo CNPJ ou Regime além do que já existe (ambos já são inputs de texto livre hoje, não precisam de mudança).
- Migrar dados existentes retroativamente (registros antigos ficam com `empresa_avulsa = false` por padrão; se o usuário quiser marcar algum já existente como avulso, faz isso editando manualmente pelo modal).
- Alterações na tabela `clientes` ou em qualquer outra página que também usa esse padrão de select de empresa (fora do escopo deste pedido).

## Detalhes de implementação

### 1. Migration (dev)
Nova migration em `supabase/migrations/` adicionando:
```sql
alter table parcelamentos add column if not exists empresa_avulsa boolean not null default false;
```
Aplicar somente no projeto Supabase de dev (`fcpcorqquovvgtoukxry`), conforme regra do projeto — nada de prod até autorização explícita.

### 2. Tipos e estado (`page.tsx`)
- `Parcelamento` interface: adicionar `empresa_avulsa: boolean`.
- `EMPTY_FORM`: adicionar `empresa_avulsa: false`.

### 3. UI do modal
No bloco "Empresa + CNPJ" (linhas 427-449):
- Acima do `<select>`/`<input>` de Empresa, adicionar checkbox com label "Empresa Avulsa".
- `onChange` do checkbox: ao marcar, `setF('empresa_avulsa', true)` e limpar `empresa`/`cnpj` (para não carregar resíduo de uma seleção anterior); ao desmarcar, `setF('empresa_avulsa', false)` e limpar `empresa`/`cnpj` também (evita ficar com nome digitado que não existe na lista).
- Renderização condicional: se `form.empresa_avulsa`, mostrar `<input>` de texto livre para Empresa; senão, mostrar o `<select>` atual.

### 4. Corrigir `openEdit`
Trocar a lógica de `empresaValida` (comparação de nome) por uso direto de `item.empresa_avulsa` — não precisa mais zerar nada, o formulário já sabe qual modo renderizar.

### 5. Salvar
Nenhuma mudança em `handleSave` — o objeto `form` já inclui `empresa_avulsa` e é enviado direto pro Supabase como está hoje.

## Testes / verificação

- Criar parcelamento avulso: marcar checkbox, digitar nome livre, salvar, confirmar que aparece na listagem.
- Editar parcelamento avulso: reabrir, confirmar que o nome digitado permanece (não é zerado) e o checkbox continua marcado.
- Criar/editar parcelamento normal (não avulso): confirmar que o select de empresas cadastradas continua funcionando como antes.
- Alternar o checkbox durante a edição de um registro existente e confirmar que o campo Empresa é limpo corretamente ao trocar de modo.
