# Empresa Avulsa em Parcelamentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Empresa Avulsa" checkbox to the Parcelamentos create/edit modal that swaps the registered-company `<select>` for a free-text `<input>`, backed by a new `empresa_avulsa` boolean column, and fix the existing bug where editing a record with an unmatched company name silently wipes it.

**Architecture:** Single-file change in the existing client component (`app/fiscal/parcelamentos/page.tsx`) plus a Supabase migration adding one column. No new files, no test framework exists in this codebase — verification is manual via the dev Supabase project and the browser preview.

**Tech Stack:** Next.js (App Router, client component), Supabase (Postgres + JS client), Tailwind classes inline (no CSS modules).

## Global Constraints

- Dev-only: apply the migration only against the dev Supabase project (`fcpcorqquovvgtoukxry`), never prod, per project rule (no push/PR/merge or prod changes until explicitly told).
- No test framework in this repo — verification steps are manual browser checks, not automated tests.
- Follow existing code style in `page.tsx`: inline Tailwind via `inputCls`/`labelCls` constants, `setF` generic setter, no external validation library.

---

### Task 1: Migration — add `empresa_avulsa` column

**Files:**
- Create: `supabase/migrations/004_empresa_avulsa_parcelamentos.sql`

**Interfaces:**
- Produces: `parcelamentos.empresa_avulsa` column (`boolean not null default false`), consumed by Task 2's TypeScript changes.

- [ ] **Step 1: Write the migration file**

```sql
alter table parcelamentos add column if not exists empresa_avulsa boolean not null default false;
```

- [ ] **Step 2: Apply the migration to the dev Supabase project**

Run (using the project's existing Supabase CLI/dev workflow — check `supabase/migrations/002_sync_prod_schema_dev.sql` and `003_fix_rls_recursion_dev.sql` for how prior migrations in this repo were applied, e.g. `supabase db push` or running the SQL directly against the dev project via the Supabase dashboard/CLI pointed at `fcpcorqquovvgtoukxry`). Confirm success by checking the `parcelamentos` table schema shows the new column.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_empresa_avulsa_parcelamentos.sql
git commit -m "feat: add empresa_avulsa column to parcelamentos"
```

---

### Task 2: Modal UI — checkbox, free-text input, fix edit bug

**Files:**
- Modify: `app/fiscal/parcelamentos/page.tsx:20-33` (interface `Parcelamento`)
- Modify: `app/fiscal/parcelamentos/page.tsx:35-40` (`EMPTY_FORM`)
- Modify: `app/fiscal/parcelamentos/page.tsx:115-121` (`openEdit`)
- Modify: `app/fiscal/parcelamentos/page.tsx:427-449` (Empresa/CNPJ modal block)

**Interfaces:**
- Consumes: `empresa_avulsa` column from Task 1 (assumed present in Supabase rows returned by `sb.from('parcelamentos').select('*')`).
- Consumes: existing `clientesCadastrados` state (line 75), `setF` generic setter (line 142), `inputCls`/`labelCls` constants (lines 59-60).
- Produces: `form.empresa_avulsa: boolean` in component state, used only within this file.

- [ ] **Step 1: Add `empresa_avulsa` to the `Parcelamento` interface**

In `app/fiscal/parcelamentos/page.tsx`, update the interface (currently lines 20-33):

```typescript
interface Parcelamento {
  id: string
  secao: string
  empresa: string
  empresa_avulsa: boolean
  cnpj: string | null
  regime: string | null
  responsavel: string | null
  local_tipo: string | null
  tarefa: string | null
  senhas: string | null
  jan: string | null; fev: string | null; mar: string | null; abr: string | null
  mai: string | null; jun: string | null; jul: string | null; ago: string | null
  set: string | null; out: string | null; nov: string | null; dez: string | null
}
```

- [ ] **Step 2: Add `empresa_avulsa` to `EMPTY_FORM`**

Update (currently lines 35-40):

```typescript
const EMPTY_FORM: Omit<Parcelamento, 'id'> = {
  secao: SECOES[0], empresa: '', empresa_avulsa: false, cnpj: '', regime: '', responsavel: '',
  local_tipo: '', tarefa: '', senhas: '',
  jan: null, fev: null, mar: null, abr: null, mai: null, jun: null,
  jul: null, ago: null, set: null, out: null, nov: null, dez: null,
}
```

- [ ] **Step 3: Fix `openEdit` to use `empresa_avulsa` instead of name-matching heuristic**

Replace (currently lines 114-121):

```typescript
  function openCreate() { setEditItem(null); setForm(EMPTY_FORM); setModalOpen(true) }
  function openEdit(item: Parcelamento) {
    setEditItem(item)
    const { id, ...rest } = item
    setForm(rest)
    setModalOpen(true)
  }
```

This removes the `empresaValida` check and the silent reset — the form now trusts `item.empresa_avulsa` to pick the right input mode when rendering (Step 5 below), so there's no need to blank out `empresa`.

- [ ] **Step 4: Add the checkbox and conditional rendering to the modal**

Replace the "Empresa + CNPJ" block (currently lines 426-449):

```tsx
              {/* Empresa + CNPJ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={labelCls + ' mb-0'}>Empresa</label>
                    <label className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--fg)]/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.empresa_avulsa}
                        onChange={e => {
                          const avulsa = e.target.checked
                          setF('empresa_avulsa', avulsa)
                          setF('empresa', '')
                          setF('cnpj', null)
                        }}
                        className="accent-[var(--accent)]"
                      />
                      Empresa Avulsa
                    </label>
                  </div>
                  {form.empresa_avulsa ? (
                    <input
                      value={form.empresa}
                      onChange={e => setF('empresa', e.target.value)}
                      placeholder="Digite o nome da empresa..."
                      className={inputCls}
                    />
                  ) : (
                    <select
                      value={form.empresa}
                      onChange={e => {
                        const nomeSelecionado = e.target.value
                        const cliente = clientesCadastrados.find(c => c.nome === nomeSelecionado)
                        setF('empresa', nomeSelecionado)
                        setF('cnpj', cliente?.cnpj ?? null)
                      }}
                      className={inputCls + ' bg-[var(--bg-surface)]'}>
                      <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
                      {clientesCadastrados.map(c => (
                        <option key={c.nome} value={c.nome} className="bg-[var(--bg-surface)]">{c.nome}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className={labelCls}>CNPJ</label>
                  <input className={inputCls + ' font-mono'} value={form.cnpj ?? ''} onChange={e => setF('cnpj', e.target.value || null)} />
                </div>
              </div>
```

Note: `labelCls` is `"block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"` (line 60) — the `mb-1.5` is overridden to `mb-0` here since the flex row wrapper now owns the bottom margin.

- [ ] **Step 5: Start the dev server and manually verify**

Use the browser preview tool against this project's dev command (check `.claude/launch.json`, or `npm run dev` if none exists yet) and navigate to `/fiscal/parcelamentos`.

Verify:
1. Click "+ Novo Parcelamento" — modal opens, "Empresa Avulsa" checkbox is unchecked, Empresa is a `<select>` with registered clients.
2. Check "Empresa Avulsa" — Empresa becomes a text `<input>`, CNPJ clears. Type a free-text company name (e.g. "Empresa Teste XYZ"), fill Seção, save.
3. Confirm the new row appears in the table with the typed name.
4. Reopen it for editing — confirm the checkbox is still checked, the typed name is still present (not wiped), and it's an `<input>` not a `<select>`.
5. Uncheck "Empresa Avulsa" while editing — confirm Empresa clears and switches back to `<select>`.
6. Create/edit a normal (non-avulsa) parcelamento — confirm the `<select>` still lists registered clients and auto-fills CNPJ as before.

- [ ] **Step 6: Commit**

```bash
git add app/fiscal/parcelamentos/page.tsx
git commit -m "feat: add empresa avulsa toggle to parcelamentos modal"
```
