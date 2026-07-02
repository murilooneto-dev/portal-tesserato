# Design: Checkboxes Recebido/Importado/Conferido (Entrada/Saídas)

**Data:** 2026-07-02
**Status:** Aprovado

---

## Objetivo

As tarefas `ENTRADA` e `SAIDAS` passam a ter 3 checkboxes — **Recebido**, **Importado**, **Conferido** — em vez do campo único de data. Quando os 3 ficam marcados, a tarefa preenche a data de conclusão automaticamente e trava, igual às outras tarefas.

---

## Banco de dados

```sql
alter table tarefas
  add column recebido boolean not null default false,
  add column importado boolean not null default false,
  add column conferido boolean not null default false;
```

Colunas só relevantes quando `tipo` é `'ENTRADA'` ou `'SAIDAS'` — nas demais tarefas ficam sempre `false`, sem uso.

---

## Comportamento

- Enquanto a tarefa não está concluída (`concluida=false`): os 3 checkboxes ficam livres pra marcar/desmarcar, cada clique salva na hora.
- A cada mudança, o sistema confere se `recebido && importado && conferido`. Se sim, marca `concluida=true` e `concluida_em=now()` — mesmo efeito de digitar uma data nas outras tarefas.
- Travada (`concluida=true`): os 3 checkboxes ficam desabilitados (mostrando marcado), aparece o botão **"Desbloquear"** já existente nas outras tarefas.
- Desbloquear (motivo obrigatório, fluxo já existente) volta `concluida=false`, `concluida_em=null`, **e também** `recebido=false`, `importado=false`, `conferido=false` — os 3 checkboxes voltam a ficar vazios e editáveis.

---

## Mudanças de código

### `app/fiscal/clientes/actions.ts`

Nova action, mesma lógica de upsert-por-natural-key que o `toggleTarefa` inline em `clientes/[id]/page.tsx` já usa:

```typescript
export async function atualizarSubEtapa(
  clienteId: string,
  mes: number,
  ano: number,
  tipo: string,
  campo: 'recebido' | 'importado' | 'conferido',
  valor: boolean
) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: existing } = await supabase
    .from('tarefas')
    .select('id, recebido, importado, conferido')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo)
    .maybeSingle()

  const atual = {
    recebido: existing?.recebido ?? false,
    importado: existing?.importado ?? false,
    conferido: existing?.conferido ?? false,
    [campo]: valor,
  }
  const todasMarcadas = atual.recebido && atual.importado && atual.conferido

  const payload = {
    ...atual,
    concluida: todasMarcadas,
    concluida_em: todasMarcadas ? new Date().toISOString() : null,
  }

  if (existing?.id) {
    await supabase.from('tarefas').update(payload).eq('id', existing.id)
  } else {
    await supabase.from('tarefas').insert({ cliente_id: clienteId, mes, ano, tipo, ...payload })
  }

  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/dashboard')
  revalidatePath('/fiscal/historico')
  revalidatePath('/fiscal/relatorios')
  revalidatePath('/fiscal/tarefas')
}
```

`desbloquearTarefa` ganha duas linhas a mais no `update`:

```typescript
await supabase
  .from('tarefas')
  .update({ concluida: false, concluida_em: null, recebido: false, importado: false, conferido: false })
  .eq('id', tarefaId)
```

(Inofensivo para tarefas que não são ENTRADA/SAIDAS — essas colunas já ficam `false` nelas.)

### `components/fiscal/TarefaChecklist.tsx`

Para `tipo === 'ENTRADA' || tipo === 'SAIDAS'`, renderiza 3 checkboxes lado a lado no lugar do input de data:

```tsx
{(tipo === 'ENTRADA' || tipo === 'SAIDAS') ? (
  <div className="flex items-center gap-3">
    {(['recebido', 'importado', 'conferido'] as const).map(campo => (
      <label key={campo} className="flex items-center gap-1.5 text-xs text-white/60">
        <input
          type="checkbox"
          checked={mapaTarefa.get(tipo)?.[campo] ?? false}
          disabled={feito || isPending}
          onChange={e => atualizarSubEtapa(clienteId, mes, ano, tipo, campo, e.target.checked)}
          className="w-3.5 h-3.5 accent-[#00CCEB]"
        />
        {campo === 'recebido' ? 'Recebido' : campo === 'importado' ? 'Importado' : 'Conferido'}
      </label>
    ))}
  </div>
) : (
  /* input de data existente, sem mudança */
)}
```

O botão "Desbloquear" e o fluxo de motivo já existentes continuam iguais — não dependem do tipo da tarefa.

---

## Fora de escopo

- Mudar o comportamento de qualquer outra tarefa além de ENTRADA/SAIDAS
- Histórico de quem marcou cada uma das 3 sub-etapas (só o valor atual é guardado, igual ao resto do sistema)
