# Aviso de Parcelamento na Ficha do Cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o usuário abre a ficha de um cliente (Fiscal, Contábil ou Pessoal) que tem parcelamento em andamento, mostrar um aviso visual no cabeçalho da ficha, indicando o(s) órgão(s)/seção(ões) do(s) parcelamento(s) ativo(s).

**Architecture:** A tabela `parcelamentos` ganha um campo `status` (`EM ANDAMENTO`/`LIQUIDADO`/`CANCELADO`), que passa a ser a fonte de verdade sobre atividade do parcelamento — hoje isso não existe, só há 12 colunas de texto livre por mês. Essas 12 colunas (`jan`..`dez`) viram `date` (data de emissão/envio), preservando o texto antigo em colunas renomeadas `*_obs`. O vínculo cliente↔parcelamento é feito por CNPJ (não há `cliente_id` na tabela). Um helper compartilhado (`lib/parcelamentos-aviso.ts`) busca os parcelamentos ativos de um CNPJ e devolve labels curtos por seção; as 3 páginas de ficha (fiscal, contábil, pessoal) chamam esse helper e renderizam uma pill de alerta no cabeçalho quando há 1+ resultado.

**Tech Stack:** Next.js (App Router) + TypeScript + Supabase (Postgres/PostgREST) + Tailwind. Sem framework de testes automatizados neste repo — verificação via `npx tsc --noEmit` + testes manuais no navegador (dev Supabase, projeto `fcpcorqquovvgtoukxry`).

## Global Constraints

- Migration SQL deve ser aplicada manualmente no SQL Editor do Supabase dev (`fcpcorqquovvgtoukxry`) antes da verificação manual — não há acesso a token do CLI nesta sessão, não tentar `supabase db push`. Quando o trabalho for pra produção, a mesma SQL roda manualmente lá também (protocolo já estabelecido — nunca aplicar migration em produção nesta sessão).
- O texto livre já cadastrado nos 12 campos de mês não pode ser apagado — precisa ser preservado em colunas `*_obs` antes da conversão de tipo (spec: seção 3).
- Entradas "avulsas" (`empresa_avulsa = true`) não têm CNPJ e não devem gerar erro nem falso aviso — o helper trata `cnpj: null` retornando lista vazia.
- Labels curtos por seção (spec: seção 5, tabela fixa) — não usar o nome completo da seção no aviso.
- `app/fiscal/parametros/actions.ts` (ferramenta de dedup de parcelamentos duplicados) não precisa ser tocado por este plano — `status` fica fora da lista de campos mesclados ali, e isso não quebra nada (o padrão `EM ANDAMENTO` já cobre o caso).

---

## File Structure

- Create: `supabase/migrations/019_parcelamento_status_e_datas.sql` — migration aditiva (status + conversão de meses pra date, preservando texto antigo).
- Create: `lib/parcelamentos-aviso.ts` — tipo `StatusParcelamento`, mapa de labels curtos por seção, e `buscarLabelsParcelamentoAtivo(supabase, cnpj)`.
- Modify: `app/fiscal/parcelamentos/page.tsx` — campo Status no formulário (Task 2); campos de mês viram `<input type="date">`, remove `badgeColor` (Task 3).
- Modify: `app/fiscal/clientes/[id]/page.tsx` — busca + pill de aviso no cabeçalho.
- Modify: `app/contabil/clientes/[id]/page.tsx` — mesma mudança, espelhada.
- Modify: `app/pessoal/clientes/[id]/page.tsx` — mesma mudança, espelhada.

---

### Task 1: Migration + helper compartilhado de aviso

**Files:**
- Create: `supabase/migrations/019_parcelamento_status_e_datas.sql`
- Create: `lib/parcelamentos-aviso.ts`

**Interfaces:**
- Produces: `StatusParcelamento = 'EM ANDAMENTO' | 'LIQUIDADO' | 'CANCELADO'`, exportado de `lib/parcelamentos-aviso.ts`, consumido pela Task 2.
- Produces: `SECAO_LABEL_CURTO: Record<string, string>`, exportado de `lib/parcelamentos-aviso.ts`, consumido pelas Tasks 4, 5, 6 (indiretamente, via `buscarLabelsParcelamentoAtivo`).
- Produces: `buscarLabelsParcelamentoAtivo(supabase: SupabaseClient, cnpj: string | null): Promise<string[]>`, exportado de `lib/parcelamentos-aviso.ts`, consumido pelas Tasks 4, 5, 6.

- [ ] **Step 1: Criar a migration**

Criar `supabase/migrations/019_parcelamento_status_e_datas.sql`:

```sql
-- supabase/migrations/019_parcelamento_status_e_datas.sql

-- Status geral do parcelamento — usado pro aviso na ficha do cliente
-- (spec 2026-08-05). Até aqui não existia um campo único dizendo se o
-- parcelamento como um todo está ativo; só havia texto livre por mês.
alter table parcelamentos add column if not exists status text not null default 'EM ANDAMENTO';
alter table parcelamentos add constraint parcelamentos_status_check
  check (status in ('EM ANDAMENTO', 'LIQUIDADO', 'CANCELADO'));

-- Preserva o texto livre já cadastrado nos 12 meses (ex: "LIQUIDADO",
-- "COMUNICADO 15/03") antes de trocar essas colunas pra tipo `date`. Os
-- campos `*_obs` não aparecem em nenhuma tela — ficam só no banco, pra
-- consulta manual se precisar resgatar o histórico algum dia.
alter table parcelamentos rename column jan to jan_obs;
alter table parcelamentos rename column fev to fev_obs;
alter table parcelamentos rename column mar to mar_obs;
alter table parcelamentos rename column abr to abr_obs;
alter table parcelamentos rename column mai to mai_obs;
alter table parcelamentos rename column jun to jun_obs;
alter table parcelamentos rename column jul to jul_obs;
alter table parcelamentos rename column ago to ago_obs;
alter table parcelamentos rename column set to set_obs;
alter table parcelamentos rename column out to out_obs;
alter table parcelamentos rename column nov to nov_obs;
alter table parcelamentos rename column dez to dez_obs;

alter table parcelamentos add column if not exists jan date;
alter table parcelamentos add column if not exists fev date;
alter table parcelamentos add column if not exists mar date;
alter table parcelamentos add column if not exists abr date;
alter table parcelamentos add column if not exists mai date;
alter table parcelamentos add column if not exists jun date;
alter table parcelamentos add column if not exists jul date;
alter table parcelamentos add column if not exists ago date;
alter table parcelamentos add column if not exists set date;
alter table parcelamentos add column if not exists out date;
alter table parcelamentos add column if not exists nov date;
alter table parcelamentos add column if not exists dez date;

-- Usado por buscarLabelsParcelamentoAtivo (lib/parcelamentos-aviso.ts) pra
-- casar parcelamento ↔ cliente por CNPJ e filtrar só os em andamento.
create index if not exists idx_parcelamentos_cnpj_status on parcelamentos (cnpj, status);
```

- [ ] **Step 2: Criar o helper compartilhado**

Criar `lib/parcelamentos-aviso.ts`:

```ts
// lib/parcelamentos-aviso.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type StatusParcelamento = 'EM ANDAMENTO' | 'LIQUIDADO' | 'CANCELADO'

// Labels curtos pra não mostrar o nome completo da seção no aviso da ficha
// (ex: "RECEITA FEDERAL - ECAC" → "Ecac"). Lista fixa espelhando as seções
// de app/fiscal/parcelamentos/page.tsx (SECOES).
export const SECAO_LABEL_CURTO: Record<string, string> = {
  'RECEITA FEDERAL - ECAC': 'Ecac',
  'PGFN - ECAC': 'PGFN',
  'SEFAZ - PARCELAMENTO MULTA AUTONOMA': 'Sefaz (Multa)',
  'SEFAZ - PARCELAMENTOS': 'Sefaz',
  'FGTS DIGITAL': 'FGTS',
}

// Busca as seções distintas de parcelamento em andamento pro CNPJ do
// cliente, já traduzidas pro label curto. Retorna [] se o cliente não tem
// CNPJ cadastrado ou não tem parcelamento ativo — nunca lança erro.
export async function buscarLabelsParcelamentoAtivo(
  supabase: SupabaseClient,
  cnpj: string | null,
): Promise<string[]> {
  if (!cnpj) return []

  const { data } = await supabase
    .from('parcelamentos')
    .select('secao')
    .eq('cnpj', cnpj)
    .eq('status', 'EM ANDAMENTO')

  if (!data || data.length === 0) return []

  const secoesUnicas = Array.from(new Set(data.map(p => p.secao as string)))
  return secoesUnicas.map(s => SECAO_LABEL_CURTO[s] ?? s)
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `lib/parcelamentos-aviso.ts` (o arquivo ainda não é importado em lugar nenhum, então não deve gerar nenhum erro).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/019_parcelamento_status_e_datas.sql lib/parcelamentos-aviso.ts
git commit -m "feat: status do parcelamento + helper de aviso por CNPJ"
```

---

### Task 2: Campo Status no formulário de Parcelamentos

**Files:**
- Modify: `app/fiscal/parcelamentos/page.tsx`

**Interfaces:**
- Consumes: `StatusParcelamento` de `lib/parcelamentos-aviso.ts` (Task 1).

- [ ] **Step 1: Importar o tipo**

Em `app/fiscal/parcelamentos/page.tsx`, logo abaixo do import existente (linha 6):

```ts
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { StatusParcelamento } from '@/lib/parcelamentos-aviso'
```

- [ ] **Step 2: Adicionar `status` na interface e no form vazio**

Modificar a interface `Parcelamento` (linhas 20-34), adicionando o campo logo após `local_tipo`:

```ts
interface Parcelamento {
  id: string
  secao: string
  empresa: string
  empresa_avulsa: boolean
  cnpj: string | null
  regime: string | null
  responsavel: string | null
  local_tipo: string | null
  status: StatusParcelamento
  tarefa: string | null
  senhas: string | null
  jan: string | null; fev: string | null; mar: string | null; abr: string | null
  mai: string | null; jun: string | null; jul: string | null; ago: string | null
  set: string | null; out: string | null; nov: string | null; dez: string | null
}
```

Modificar `EMPTY_FORM` (linhas 36-41), adicionando `status: 'EM ANDAMENTO'` logo após `local_tipo: ''`:

```ts
const EMPTY_FORM: Omit<Parcelamento, 'id'> = {
  secao: SECOES[0], empresa: '', empresa_avulsa: false, cnpj: '', regime: '', responsavel: '',
  local_tipo: '', status: 'EM ANDAMENTO', tarefa: '', senhas: '',
  jan: null, fev: null, mar: null, abr: null, mai: null, jun: null,
  jul: null, ago: null, set: null, out: null, nov: null, dez: null,
}
```

- [ ] **Step 3: Badge de status na linha da tabela**

Adicionar uma função de cor por status, logo abaixo de `badgeColor` (após a linha 58):

```ts
function statusBadge(status: StatusParcelamento): { bg: string; text: string; label: string } {
  if (status === 'LIQUIDADO') return { bg: 'bg-green-500/20', text: 'text-green-300', label: 'LIQUIDADO' }
  if (status === 'CANCELADO') return { bg: 'bg-red-500/20', text: 'text-red-300', label: 'CANCELADO' }
  return { bg: 'bg-blue-500/20', text: 'text-blue-300', label: 'EM ANDAMENTO' }
}
```

Na linha da tabela (dentro do `<tr onClick={() => toggleExpand(item.id)}>`, logo depois da célula de `Local / Tipo`, por volta da linha 329), adicionar uma célula de status antes das células de mês:

```tsx
<td className="px-3 py-3 text-[var(--fg)]/50 max-w-[140px] truncate">{item.local_tipo ?? '—'}</td>
<td className="px-3 py-3 whitespace-nowrap">
  {(() => { const { bg, text, label } = statusBadge(item.status); return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${bg} ${text}`}>{label}</span>
  )})()}
</td>
```

Adicionar o `<th>` correspondente no cabeçalho da tabela (por volta da linha 310), logo após `<th>...Local / Tipo</th>`:

```tsx
<th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider whitespace-nowrap">Local / Tipo</th>
<th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider whitespace-nowrap">Status</th>
```

E no `colSpan` da linha expandida (linha 351), incrementar de `17` para `18` (uma coluna nova foi adicionada).

- [ ] **Step 4: Status no card expandido**

No array de campos exibido na linha expandida (por volta da linha 363-369), adicionar Status após Local/Tipo:

```tsx
{[
  { label: 'Empresa', val: item.empresa },
  { label: 'CNPJ', val: item.cnpj ?? '—' },
  { label: 'Regime', val: item.regime ?? '—' },
  { label: 'Responsável', val: item.responsavel ?? '—', cor },
  { label: 'Local / Tipo', val: item.local_tipo ?? '—' },
  { label: 'Status', val: item.status },
].map(f => (
```

- [ ] **Step 5: Select de Status no modal de cadastro**

Substituir o grid "Regime + Responsável + Local/Tipo" (linhas 480-502) por um grid de 2 colunas com 4 campos (Regime, Responsável, Local/Tipo, Status):

```tsx
{/* Regime + Responsável + Local/Tipo + Status */}
<div className="grid grid-cols-2 gap-3">
  <div>
    <label className={labelCls}>Regime</label>
    <input className={inputCls} value={form.regime ?? ''} onChange={e => setF('regime', e.target.value || null)} />
  </div>
  <div>
    <label className={labelCls}>Responsável</label>
    <select
      value={form.responsavel ?? ''}
      onChange={e => setF('responsavel', e.target.value || null)}
      className={inputCls + ' bg-[var(--bg-surface)]'}>
      <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
      {responsaveisCadastrados.map(r => (
        <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>
      ))}
    </select>
  </div>
  <div>
    <label className={labelCls}>Local / Tipo</label>
    <input className={inputCls} value={form.local_tipo ?? ''} onChange={e => setF('local_tipo', e.target.value || null)} />
  </div>
  <div>
    <label className={labelCls}>Status</label>
    <select
      value={form.status}
      onChange={e => setF('status', e.target.value as StatusParcelamento)}
      className={inputCls + ' bg-[var(--bg-surface)]'}>
      <option value="EM ANDAMENTO" className="bg-[var(--bg-surface)]">Em andamento</option>
      <option value="LIQUIDADO" className="bg-[var(--bg-surface)]">Liquidado</option>
      <option value="CANCELADO" className="bg-[var(--bg-surface)]">Cancelado</option>
    </select>
  </div>
</div>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Verificação manual**

Com o dev server rodando contra o Supabase dev (**depois** que a migration da Task 1 tiver sido aplicada manualmente lá — sem isso, `sb.from('parcelamentos').insert(form)` falha com erro de coluna `status` inexistente):

1. Abrir `/fiscal/parcelamentos`, clicar em "+ Novo Parcelamento".
2. Preencher Empresa, escolher um Status (ex: "Liquidado"), salvar.
3. Confirmar que a linha da tabela mostra o badge de status correto, e que o card expandido mostra "Status: LIQUIDADO".
4. Editar um parcelamento já existente (criado antes desta mudança) e confirmar que o Status aparece como "Em andamento" (valor padrão) e pode ser trocado.

- [ ] **Step 8: Commit**

```bash
git add app/fiscal/parcelamentos/page.tsx
git commit -m "feat: campo Status no cadastro de parcelamentos"
```

---

### Task 3: Campos de mês viram data

**Files:**
- Modify: `app/fiscal/parcelamentos/page.tsx`

**Interfaces:**
- Nenhuma nova — esta task só muda a representação/exibição dos campos `jan`..`dez` já existentes na interface `Parcelamento` (Task 2).

- [ ] **Step 1: Remover `badgeColor` e adicionar `formatarDataBR`**

Remover a função `badgeColor` (linhas 51-58 do arquivo original) e substituir por:

```ts
function formatarDataBR(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}
```

(Mantém `statusBadge`, adicionada na Task 2, intocada.)

- [ ] **Step 2: Trocar a renderização das células de mês na tabela**

Substituir o bloco de células de mês na linha da tabela (por volta da linha 330-345 do arquivo original):

```tsx
{MESES_COLS.map(mes => {
  const val = (item as any)[mes] as string | null
  return (
    <td key={mes} className="px-1.5 py-2 text-center">
      {val ? (
        <span className="text-[var(--fg)]/70 text-[10px] font-mono">{formatarDataBR(val)}</span>
      ) : (
        <span className="text-[var(--fg)]/15">—</span>
      )}
    </td>
  )
})}
```

- [ ] **Step 3: Trocar a renderização das parcelas mensais no card expandido**

Substituir o bloco "Parcelas Mensais" (por volta da linha 377-390 do arquivo original):

```tsx
<p className="text-[9px] font-bold text-[var(--fg)]/25 uppercase tracking-widest mb-2">Parcelas Mensais (data de emissão/envio)</p>
<div className="grid grid-cols-12 gap-1.5">
  {MESES_COLS.map((mes, i) => {
    const val = (item as any)[mes] as string | null
    return (
      <div key={mes} className={`rounded-lg border px-2 py-1.5 ${val ? 'bg-blue-500/15 border-transparent' : 'border-[var(--fg)]/8 bg-[var(--fg)]/2'}`}>
        <p className={`text-[9px] font-bold uppercase ${val ? 'text-blue-300' : 'text-[var(--fg)]/20'}`}>{MESES_NOME[i]}</p>
        <p className={`text-sm font-bold mt-0.5 ${val ? 'text-[var(--fg)]' : 'text-[var(--fg)]/15'}`}>{val ? formatarDataBR(val) : '—'}</p>
      </div>
    )
  })}
</div>
```

- [ ] **Step 4: Trocar os inputs do modal de cadastro pra `type="date"`**

Substituir o bloco "Parcelas Mensais" do modal (por volta da linha 510-525 do arquivo original):

```tsx
<div>
  <label className={labelCls}>Parcelas Mensais — data de emissão/envio</label>
  <div className="grid grid-cols-6 gap-2">
    {MESES_COLS.map((mes, i) => (
      <div key={mes}>
        <p className="text-[var(--fg)]/30 text-[10px] text-center mb-1">{MESES_ABREV[i]}</p>
        <input
          type="date"
          value={(form as any)[mes] ?? ''}
          onChange={e => setF(mes as any, e.target.value || null)}
          className="w-full px-2 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs text-center focus:outline-none focus:border-[var(--accent)]/50" />
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 5: Atualizar o relatório de impressão (`imprimir()`)**

Na função `imprimir()`, dentro do map que gera as linhas da tabela (por volta da linha 181-184 do arquivo original), trocar:

```ts
${MESES_COLS.map(m => {
  const v = (p as any)[m] as string | null
  return `<td class="month ${v ? 'filled' : ''}">${v ?? '—'}</td>`
}).join('')}
```

por:

```ts
${MESES_COLS.map(m => {
  const v = (p as any)[m] as string | null
  return `<td class="month ${v ? 'filled' : ''}">${v ? formatarDataBR(v) : '—'}</td>`
}).join('')}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros. Nenhum outro arquivo do repo referencia `badgeColor` (é uma função local do componente), então a remoção é segura.

- [ ] **Step 7: Verificação manual**

Com a migration da Task 1 já aplicada no dev:

1. Abrir `/fiscal/parcelamentos`, criar ou editar um parcelamento, preencher a data de Janeiro (seletor de data).
2. Confirmar que a tabela mostra "dd/mm" na coluna JAN, e que o card expandido mostra o mesmo valor formatado no bloco "Parcelas Mensais".
3. Deixar um mês vazio e confirmar que mostra "—" tanto na tabela quanto no card expandido.
4. Clicar em "Relatório" e confirmar que o PDF/impressão mostra a data formatada (não a string ISO crua) nos meses preenchidos.

- [ ] **Step 8: Commit**

```bash
git add app/fiscal/parcelamentos/page.tsx
git commit -m "feat: campos de mes do parcelamento viram data de emissao"
```

---

### Task 4: Aviso na ficha do cliente — Fiscal

**Files:**
- Modify: `app/fiscal/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `buscarLabelsParcelamentoAtivo(supabase, cnpj)` de `lib/parcelamentos-aviso.ts` (Task 1).

- [ ] **Step 1: Importar o helper**

Em `app/fiscal/clientes/[id]/page.tsx`, junto aos outros imports de `lib/` (por volta da linha 9):

```ts
import { buscarVinculosDoCliente } from '@/lib/vinculos'
import { buscarLabelsParcelamentoAtivo } from '@/lib/parcelamentos-aviso'
```

- [ ] **Step 2: Buscar os labels após carregar o cliente**

Logo depois de `const cliente = flattenClienteFiscal(clienteRaw)` (linha 39), adicionar:

```ts
const labelsParcelamento = await buscarLabelsParcelamentoAtivo(supabase, cliente.cnpj ?? null)
```

- [ ] **Step 3: Renderizar a pill de aviso**

No cabeçalho, logo depois do `<div className="flex gap-2 mt-2 flex-wrap">...</div>` de selos (fecha na linha 192 do arquivo original), adicionar:

```tsx
{labelsParcelamento.length > 0 && (
  <div className="mt-2">
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/15 px-3 py-1 rounded-full">
      ⚠️ Cliente possui parcelamento! {labelsParcelamento.join(' / ')}
    </span>
  </div>
)}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Verificação manual**

Com a migration da Task 1 aplicada no dev e ao menos um parcelamento com `status = 'EM ANDAMENTO'` cadastrado com o mesmo CNPJ de um cliente Fiscal existente:

1. Abrir a ficha desse cliente em `/fiscal/clientes/[id]`.
2. Confirmar que a pill "⚠️ Cliente possui parcelamento!" aparece com o label curto correto da seção.
3. Cadastrar um segundo parcelamento pro mesmo CNPJ, em seção diferente, e confirmar que a pill passa a mostrar os dois labels separados por " / ".
4. Marcar um dos parcelamentos como "Liquidado" e confirmar que ele some da pill (some completamente se só havia esse).
5. Abrir a ficha de um cliente sem nenhum parcelamento e confirmar que a pill não aparece.

- [ ] **Step 6: Commit**

```bash
git add app/fiscal/clientes/[id]/page.tsx
git commit -m "feat: aviso de parcelamento na ficha do cliente (fiscal)"
```

---

### Task 5: Aviso na ficha do cliente — Contábil

**Files:**
- Modify: `app/contabil/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `buscarLabelsParcelamentoAtivo(supabase, cnpj)` de `lib/parcelamentos-aviso.ts` (Task 1).

- [ ] **Step 1: Importar o helper**

Em `app/contabil/clientes/[id]/page.tsx`, junto aos outros imports de `lib/` (por volta da linha 6):

```ts
import { buscarVinculosDoCliente } from '@/lib/vinculos'
import { buscarLabelsParcelamentoAtivo } from '@/lib/parcelamentos-aviso'
```

- [ ] **Step 2: Buscar os labels após carregar o cliente**

Logo depois de `const cliente = flattenClienteContabil(clienteRaw)` (linha 32), adicionar:

```ts
const labelsParcelamento = await buscarLabelsParcelamentoAtivo(supabase, cliente.cnpj ?? null)
```

- [ ] **Step 3: Renderizar a pill de aviso**

No cabeçalho, logo depois do `<div className="flex gap-2 mt-2 flex-wrap">...</div>` de selos (fecha na linha 119 do arquivo original), adicionar:

```tsx
{labelsParcelamento.length > 0 && (
  <div className="mt-2">
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/15 px-3 py-1 rounded-full">
      ⚠️ Cliente possui parcelamento! {labelsParcelamento.join(' / ')}
    </span>
  </div>
)}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Verificação manual**

Mesmo roteiro da Task 4, Step 5, mas em `/contabil/clientes/[id]` — usar o mesmo CNPJ já testado (o parcelamento é global por CNPJ, não por setor), confirmando que a pill aparece igual na ficha Contábil.

- [ ] **Step 6: Commit**

```bash
git add app/contabil/clientes/[id]/page.tsx
git commit -m "feat: aviso de parcelamento na ficha do cliente (contabil)"
```

---

### Task 6: Aviso na ficha do cliente — Pessoal

**Files:**
- Modify: `app/pessoal/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `buscarLabelsParcelamentoAtivo(supabase, cnpj)` de `lib/parcelamentos-aviso.ts` (Task 1).

- [ ] **Step 1: Importar o helper**

Em `app/pessoal/clientes/[id]/page.tsx`, junto aos outros imports de `lib/` (por volta da linha 6):

```ts
import { buscarVinculosDoCliente } from '@/lib/vinculos'
import { buscarLabelsParcelamentoAtivo } from '@/lib/parcelamentos-aviso'
```

- [ ] **Step 2: Buscar os labels após carregar o cliente**

Logo depois de `const cliente = flattenClientePessoal(clienteRaw)` (linha 32), adicionar:

```ts
const labelsParcelamento = await buscarLabelsParcelamentoAtivo(supabase, cliente.cnpj ?? null)
```

- [ ] **Step 3: Renderizar a pill de aviso**

No cabeçalho, logo depois do `<div className="flex gap-2 mt-2 flex-wrap">...</div>` de selos (fecha na linha 124 do arquivo original), adicionar:

```tsx
{labelsParcelamento.length > 0 && (
  <div className="mt-2">
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/15 px-3 py-1 rounded-full">
      ⚠️ Cliente possui parcelamento! {labelsParcelamento.join(' / ')}
    </span>
  </div>
)}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Verificação manual**

Mesmo roteiro da Task 4, Step 5, mas em `/pessoal/clientes/[id]`.

- [ ] **Step 6: Commit**

```bash
git add app/pessoal/clientes/[id]/page.tsx
git commit -m "feat: aviso de parcelamento na ficha do cliente (pessoal)"
```

---

## Nota sobre a migration

A Task 1 cria o arquivo de migration, mas **não** roda `alter table` no banco — não há token do Supabase CLI disponível nesta sessão (mesma limitação de plans anteriores, ex. migration 018). Antes de fazer qualquer verificação manual (Tasks 2-6), a migration `019_parcelamento_status_e_datas.sql` precisa ser aplicada manualmente no SQL Editor do projeto dev (`fcpcorqquovvgtoukxry`); sem isso, tanto o insert/update de parcelamento quanto a leitura de `status`/`jan`..`dez` como data vão falhar com erro de coluna. Quando o trabalho for promovido pra produção, a mesma SQL roda manualmente lá (`qilwxzpxkjzbfrwlbydt`), conforme protocolo já combinado — nunca aplicar em produção nesta sessão.

## Nota sobre a PR

Ao final da Task 6, seguir o protocolo já estabelecido: push da branch `feat/aviso-parcelamento-ficha-cliente` e abrir PR contra `dev` (nunca `main`), sem fazer merge.
