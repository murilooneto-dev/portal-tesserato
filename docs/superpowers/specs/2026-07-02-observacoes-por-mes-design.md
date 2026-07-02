# Design: Observações por Mês

**Data:** 2026-07-02
**Status:** Aprovado

---

## Objetivo

Hoje `clientes.obs` é um campo único, sem noção de mês — a mesma observação aparece pra qualquer mês selecionado no seletor global. Precisa virar uma observação por (cliente, mês, ano): trocar de mês limpa o campo, e o que foi escrito num mês fica preservado ao voltar pra ele.

---

## Regra de migração (importante)

Julho/2026 já está em uso — o texto atualmente salvo em `clientes.obs` não pode ser perdido nem duplicado incorretamente pros outros meses. A migração copia o valor atual de `clientes.obs` para virar especificamente a observação de **Julho/2026** de cada cliente. Todos os outros meses (Jan-Jun/2026 passados, Ago/2026+ futuros) começam sem nenhuma observação salva (campo em branco).

A coluna `clientes.obs` não é removida do banco — só deixa de ser lida/escrita pelo código. Fica como histórico morto, sem risco de perda de dado.

---

## Banco de dados

```sql
create table observacoes_clientes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  mes int not null,
  ano int not null,
  texto text not null default '',
  updated_at timestamptz not null default now(),
  unique (cliente_id, mes, ano)
);

alter table observacoes_clientes enable row level security;

create policy "Autenticados leem observacoes"
  on observacoes_clientes for select using (auth.uid() is not null);

-- Escrita via service role (getAuthenticatedAdmin na server action), sem policy de insert/update pra authenticated

-- Migração: preserva o texto atual como observação de Julho/2026
insert into observacoes_clientes (cliente_id, mes, ano, texto)
select id, 7, 2026, obs from clientes where obs is not null and obs <> '';
```

Esse SQL precisa ser rodado manualmente no Supabase (mesmo processo das outras tabelas criadas neste projeto).

---

## Comportamento

- Qualquer mês (passado, atual ou futuro) permite editar normalmente — cada um guarda seu próprio texto, sem restrição de somente-leitura.
- Se não existe linha em `observacoes_clientes` pro (cliente, mês, ano) selecionado, o campo aparece vazio (placeholder "Nenhuma observação").
- Salvar faz upsert por `(cliente_id, mes, ano)`.

---

## Mudanças de código

### `app/fiscal/clientes/actions.ts`

Trocar `salvarObs(clienteId, obs)` por:

```typescript
export async function salvarObs(clienteId: string, mes: number, ano: number, texto: string) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
  await supabase
    .from('observacoes_clientes')
    .upsert({ cliente_id: clienteId, mes, ano, texto }, { onConflict: 'cliente_id,mes,ano' })
}
```

### `app/fiscal/clientes/[id]/page.tsx`

Já tem `const { mes, ano } = await getMesAno()` (do seletor global). Adicionar busca da observação do mês:

```typescript
const { data: observacao } = await supabase
  .from('observacoes_clientes')
  .select('texto')
  .eq('cliente_id', id)
  .eq('mes', mes)
  .eq('ano', ano)
  .maybeSingle()
```

Passar `obsInicial={observacao?.texto ?? ''}` e `mes={mes}` `ano={ano}` para `<ClienteObs>`.

### `components/fiscal/ClienteObs.tsx`

Recebe `mes`/`ano` como novas props; `salvar()` passa a chamar `salvarObs(clienteId, mes, ano, obs)`. Quando `mes`/`ano` mudam (o componente é remontado, já que a página inteira recarrega ao trocar o seletor global), o campo reflete o `obsInicial` novo automaticamente — sem lógica extra de reset necessária.

---

## Fora de escopo

- Remoção da coluna `clientes.obs` do banco
- Histórico de edições da observação (só o valor atual de cada mês é guardado)
- Notificação ou destaque visual indicando "observação de mês anterior existe"
