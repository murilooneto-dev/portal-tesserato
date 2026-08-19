# Parcelamento Avulso — meses editáveis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na tela de Parcelamento, parcelamentos marcados como "Empresa Avulsa" passam a ter os 12 campos de mês (jan..dez) editáveis no modal e persistidos no save; parcelamentos vinculados a cliente continuam somente-leitura ali.

**Architecture:** Extrair uma função pura `montarUpdateParcelamento` em `lib/parcelamento-tarefas.ts` que decide se os campos de mês entram ou não no payload de update, testada isoladamente com `node --test`. Depois usar essa função em `handleSave` de `app/fiscal/parcelamentos/page.tsx`, e tornar os inputs de mês do modal condicionais a `form.empresa_avulsa`.

**Tech Stack:** Next.js (App Router, client component), TypeScript, Supabase JS client, `node --test` + `tsx` para testes.

## Global Constraints

- Texto livre nos meses de avulso — sem validação de formato dd/mm (decisão explícita do usuário, spec 2026-08-19).
- Parcelamentos vinculados a cliente (não avulso) devem manter exatamente o comportamento atual: meses somente-leitura no modal, excluídos do update.
- Alternar o checkbox "Empresa Avulsa" não deve apagar os meses já digitados no form.
- Rodar `npm test` (`node --import tsx --test "tests/**/*.test.ts"`) do diretório `portal-tesserato/.worktrees/parcelamento-avulso-editavel` antes de cada commit que toque `lib/parcelamento-tarefas.ts`.

---

### Task 1: Função pura `montarUpdateParcelamento`

**Files:**
- Modify: `lib/parcelamento-tarefas.ts`
- Test: `tests/parcelamento-tarefas.test.ts`

**Interfaces:**
- Consumes: `MES_PARA_COLUNA` (já existe em `lib/parcelamento-tarefas.ts`, mapeia 1-12 → 'jan'..'dez').
- Produces: `montarUpdateParcelamento<T extends Record<string, unknown>>(form: T, empresaAvulsa: boolean): Partial<T>` — usado pela Task 2 em `handleSave`. Quando `empresaAvulsa` é `true`, retorna `form` inalterado (todas as chaves, incluindo meses). Quando `false`, retorna uma cópia de `form` sem as 12 chaves de mês (`jan`, `fev`, ..., `dez`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `tests/parcelamento-tarefas.test.ts`:

```ts
import { montarUpdateParcelamento } from '../lib/parcelamento-tarefas'

test('montarUpdateParcelamento mantem os meses quando empresa_avulsa=true', () => {
  const form = { empresa: 'Padaria X', secao: 'PGFN', jan: '10/01', fev: null, mar: '15/03' }
  const resultado = montarUpdateParcelamento(form, true)
  assert.deepEqual(resultado, form)
})

test('montarUpdateParcelamento remove os 12 campos de mes quando empresa_avulsa=false', () => {
  const form = {
    empresa: 'Cliente Y', secao: 'PGFN',
    jan: '10/01', fev: null, mar: null, abr: null, mai: null, jun: null,
    jul: null, ago: null, set: null, out: null, nov: null, dez: null,
  }
  const resultado = montarUpdateParcelamento(form, false)
  assert.deepEqual(resultado, { empresa: 'Cliente Y', secao: 'PGFN' })
})

test('montarUpdateParcelamento nao muda o objeto original', () => {
  const form = { empresa: 'Cliente Z', jan: '01/01' }
  montarUpdateParcelamento(form, false)
  assert.equal(form.jan, '01/01')
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run (a partir de `portal-tesserato/.worktrees/parcelamento-avulso-editavel`): `npm test -- --test-name-pattern="montarUpdateParcelamento"`
Expected: FAIL — `montarUpdateParcelamento is not a function` / import error, já que a função ainda não existe.

- [ ] **Step 3: Implementar a função mínima**

Em `lib/parcelamento-tarefas.ts`, adicionar após a definição de `MES_PARA_COLUNA` (não precisa ficar exatamente ali, mas perto por coesão):

```ts
const CAMPOS_MES = Object.values(MES_PARA_COLUNA)

// Decide quais campos vao no update de um parcelamento (spec 2026-08-19,
// item "meses editaveis pra avulso"). Vinculado a cliente: os meses sao
// preenchidos so pela tarefa na ficha do cliente, entao nunca sao
// reenviados aqui (senao o save do admin sobrescreve o que a ficha gravou
// enquanto o modal estava aberto). Avulso: nunca tem tarefa (cnpj null
// nunca resolve cliente_id em sincronizarTarefasParcelamento), entao o
// modal e a unica forma de preencher os meses e eles sao enviados normal.
export function montarUpdateParcelamento<T extends Record<string, unknown>>(
  form: T,
  empresaAvulsa: boolean,
): Partial<T> {
  if (empresaAvulsa) return form
  const resultado = { ...form }
  for (const campo of CAMPOS_MES) delete (resultado as Record<string, unknown>)[campo]
  return resultado
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test -- --test-name-pattern="montarUpdateParcelamento"`
Expected: PASS nos 3 testes novos.

- [ ] **Step 5: Rodar a suite completa**

Run: `npm test`
Expected: PASS em todos os testes (os novos e os pré-existentes de `parcelamento-tarefas.test.ts` e demais arquivos em `tests/`).

- [ ] **Step 6: Commit**

```bash
git add lib/parcelamento-tarefas.ts tests/parcelamento-tarefas.test.ts
git commit -m "feat: montarUpdateParcelamento decide se meses entram no update por empresa_avulsa"
```

---

### Task 2: Wiring na UI — modal editável + handleSave

**Files:**
- Modify: `app/fiscal/parcelamentos/page.tsx`

**Interfaces:**
- Consumes: `montarUpdateParcelamento(form, empresaAvulsa)` de `lib/parcelamento-tarefas.ts` (Task 1).
- Produces: nada consumido por outra task — esta é a última task do plano.

- [ ] **Step 1: Importar a função**

No topo de `app/fiscal/parcelamentos/page.tsx`, junto aos demais imports de `lib/parcelamento-tarefas`:

```ts
import { montarUpdateParcelamento } from '@/lib/parcelamento-tarefas'
```

(Se não houver import desse módulo ainda no arquivo, adicionar como novo import; conferir o caminho `@/lib/...` usado pelos outros imports do arquivo, ex.: `@/lib/parcelamentos-aviso` na linha 7.)

- [ ] **Step 2: Trocar a lógica de `handleSave`**

Localizar em `app/fiscal/parcelamentos/page.tsx` (por volta da linha 157-172):

```ts
  async function handleSave() {
    setSaving(true)
    if (editItem) {
      // Meses sao somente leitura na UI (preenchidos pela tarefa na ficha do
      // cliente) — nao reenviar, senao o save do admin sobrescreve com o
      // valor capturado na abertura do modal e desfaz o que a ficha gravou
      // enquanto o modal estava aberto.
      const { jan, fev, mar, abr, mai, jun, jul, ago, set, out, nov, dez, ...formSemMeses } = form
      await sb.from('parcelamentos').update(formSemMeses).eq('id', editItem.id)
    } else {
      await sb.from('parcelamentos').insert(form)
    }
    await load(isAdmin, userNome)
    setModalOpen(false)
    setSaving(false)
  }
```

Substituir por:

```ts
  async function handleSave() {
    setSaving(true)
    if (editItem) {
      // Vinculado a cliente: meses sao somente leitura na UI (preenchidos
      // pela tarefa na ficha do cliente) — nao reenviar, senao o save do
      // admin sobrescreve com o valor capturado na abertura do modal e
      // desfaz o que a ficha gravou enquanto o modal estava aberto. Avulso:
      // nunca tem tarefa (cnpj null nunca resolve cliente_id), entao os
      // meses sao editados aqui e entram no update normalmente.
      const payload = montarUpdateParcelamento(form, editItem.empresa_avulsa)
      await sb.from('parcelamentos').update(payload).eq('id', editItem.id)
    } else {
      await sb.from('parcelamentos').insert(form)
    }
    await load(isAdmin, userNome)
    setModalOpen(false)
    setSaving(false)
  }
```

- [ ] **Step 3: Tornar o bloco "Parcelas Mensais" do modal condicional**

Localizar o bloco (por volta da linha 654-672):

```tsx
              {/* Meses — somente leitura: preenchidos pela tarefa na ficha do cliente */}
              <div>
                <label className={labelCls}>Parcelas Mensais — data de emissão/envio (preenchido pela tarefa na ficha do cliente)</label>
                <div className="grid grid-cols-6 gap-2">
                  {MESES_COLS.map((mes, i) => {
                    const valor = (form as any)[mes] as string | null
                    return (
                      <div key={mes}>
                        <p className="text-[var(--fg)]/30 text-[10px] text-center mb-1">{MESES_ABREV[i]}</p>
                        <div className={`w-full px-2 py-2 rounded-xl border text-xs text-center ${
                          valor ? 'bg-blue-500/10 border-transparent text-[var(--fg)]' : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/20'
                        }`}>
                          {valor ?? '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
```

Substituir por (mesmo grid, mas renderiza `<input>` quando `form.empresa_avulsa`, mantendo o `<div>` somente-leitura no caso vinculado):

```tsx
              {/* Meses — editavel se avulso (sem tarefa que preencha), somente leitura se vinculado a cliente */}
              <div>
                <label className={labelCls}>
                  Parcelas Mensais — data de emissão/envio
                  {!form.empresa_avulsa && ' (preenchido pela tarefa na ficha do cliente)'}
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {MESES_COLS.map((mes, i) => {
                    const valor = (form as any)[mes] as string | null
                    return (
                      <div key={mes}>
                        <p className="text-[var(--fg)]/30 text-[10px] text-center mb-1">{MESES_ABREV[i]}</p>
                        {form.empresa_avulsa ? (
                          <input
                            value={valor ?? ''}
                            onChange={e => setF(mes as keyof typeof form, (e.target.value || null) as never)}
                            placeholder="dd/mm"
                            className="w-full px-2 py-2 rounded-xl border bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)] text-xs text-center focus:outline-none focus:border-[var(--accent)]/50"
                          />
                        ) : (
                          <div className={`w-full px-2 py-2 rounded-xl border text-xs text-center ${
                            valor ? 'bg-blue-500/10 border-transparent text-[var(--fg)]' : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/20'
                          }`}>
                            {valor ?? '—'}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
```

- [ ] **Step 4: Checar tipos**

Run (a partir de `portal-tesserato/.worktrees/parcelamento-avulso-editavel`): `npx tsc --noEmit`
Expected: sem novos erros introduzidos por este arquivo. Se `setF(mes as keyof typeof form, ...)` disparar erro de tipo, ajustar para `setF(mes as any, e.target.value || null)` — o objetivo é gravar dinamicamente por nome de coluna, igual já é feito em outros pontos do arquivo (ex.: `toggleSetorParcelamento`, que também usa índice dinâmico).

- [ ] **Step 5: Rodar a suite de testes completa (garantir que nada quebrou)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/fiscal/parcelamentos/page.tsx
git commit -m "feat: parcelamento avulso tem meses editaveis no modal da tela de Parcelamento"
```
