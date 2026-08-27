# Múltiplas Atividades por Cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o seletor de Atividade do cliente (hoje `<select>` de valor único) por checkboxes que permitem marcar 0..N atividades, nos setores Fiscal, Contábil e Pessoal.

**Architecture:** A coluna `atividade` vira `text[]` nas 3 tabelas de setor. Um componente compartilhado novo (`SeletorAtividades`) desenha os checkboxes e é usado nos 4 formulários que hoje têm o `<select>`. Todo consumidor que comparava `atividade` por igualdade (listagens, relatórios, geração automática de tarefas, preenchimento rápido) passa a comparar por "está contido no array".

**Tech Stack:** Next.js (App Router) + TypeScript + Supabase (Postgres) + Tailwind. Testes com `node:test` via `npm run test`.

## Global Constraints

- Nunca aplicar migration em produção — só entregar o SQL pronto. Aplicar em dev é permitido (`supabase db push`, CLI já linkado ao projeto dev `fcpcorqquovvgtoukxry`).
- Nunca fazer merge de PR sozinho; PRs sempre miram a branch `dev`.
- Trabalhar só na branch `feat/multiplas-atividades-cliente` (já criada a partir de `dev`).
- Não rodar verificação de navegador sem o usuário pedir explicitamente — verificação nesta feature é por `npm run test` + `next build` (typecheck).
- Comparação cliente↔catálogo de atividade continua por nome (nunca por id/FK) — mesmo padrão já usado pra grupo/regime.
- Seguir o estilo visual e as classes Tailwind já usadas nos formulários existentes (`inputCls`/`selectCls`/`labelCls`, checkboxes com `accent-[var(--accent)]`).

---

### Task 1: Migration — `atividade` vira array

**Files:**
- Create: `supabase/migrations/026_atividade_multipla.sql`

**Interfaces:**
- Produces: colunas `clientes_fiscal.atividade`, `clientes_contabil.atividade`, `clientes_pessoal.atividade` do tipo `text[] not null default '{}'` (antes: `text` nullable). Todo código das tasks seguintes assume esse tipo.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/026_atividade_multipla.sql

-- Cliente pode exercer mais de uma atividade (ex.: serviço e comércio) — o
-- <select> de valor único virava workaround de texto livre combinando
-- opções (ver scripts/normalizar-atividades.ts, histórico, fora de escopo
-- aqui). atividade vira array de nomes, comparado por nome contra o
-- catálogo `atividades` (por setor) — mesmo padrão sem FK já usado pra
-- grupo/regime. Ver docs/superpowers/specs/2026-08-27-multiplas-atividades-
-- cliente-design.md.

alter table clientes_fiscal
  alter column atividade type text[]
  using case when atividade is null then '{}'::text[] else array[atividade] end;
alter table clientes_fiscal alter column atividade set default '{}'::text[];
alter table clientes_fiscal alter column atividade set not null;

alter table clientes_contabil
  alter column atividade type text[]
  using case when atividade is null then '{}'::text[] else array[atividade] end;
alter table clientes_contabil alter column atividade set default '{}'::text[];
alter table clientes_contabil alter column atividade set not null;

alter table clientes_pessoal
  alter column atividade type text[]
  using case when atividade is null then '{}'::text[] else array[atividade] end;
alter table clientes_pessoal alter column atividade set default '{}'::text[];
alter table clientes_pessoal alter column atividade set not null;
```

- [ ] **Step 2: Aplicar no banco de dev**

Run: `cd "portal-tesserato" && supabase db push`
Expected: a migration `026_atividade_multipla.sql` aparece como aplicada, sem erro. Se `supabase db push` pedir confirmação interativa, use `supabase db push --yes` (ou confirme a lista mostrando só a migration 026 pendente).

- [ ] **Step 3: Conferir no dev**

Run (com as credenciais de `.env.development.local`, via `psql` ou pelo SQL Editor do projeto dev `fcpcorqquovvgtoukxry`):
```sql
select column_name, data_type, udt_name, column_default, is_nullable
from information_schema.columns
where table_name in ('clientes_fiscal','clientes_contabil','clientes_pessoal') and column_name = 'atividade';
```
Expected: `udt_name = '_text'` (array), `column_default = '{}'::text[]`, `is_nullable = 'NO'` nas 3 linhas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/026_atividade_multipla.sql
git commit -m "feat: migration atividade vira text[] nas 3 tabelas de setor"
```

---

### Task 2: `lib/types.ts` — tipos base

**Files:**
- Modify: `lib/types.ts:51`, `lib/types.ts:113`, `lib/types.ts:124`

**Interfaces:**
- Produces: `ClienteFiscal.atividade: string[]`, `ClienteContabil.atividade: string[]`, `ClientePessoal.atividade: string[]` — todo o restante do plano assume esse tipo (nunca `string | null`).

- [ ] **Step 1: Trocar os 3 campos**

Em `lib/types.ts`, troque cada uma das 3 ocorrências de:
```ts
  atividade: string | null
```
por:
```ts
  atividade: string[]
```
(linhas 51 em `ClienteFiscal`, 113 em `ClienteContabil`, 124 em `ClientePessoal`).

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: atividade do cliente vira string[] nos 3 tipos de setor"
```

(Vai quebrar a compilação até as próximas tasks ajustarem os consumidores — normal e esperado, cada task seguinte destrava um pedaço.)

---

### Task 3: `lib/tarefas-esperadas.ts` — união de tarefas por atividade

**Files:**
- Modify: `lib/tarefas-esperadas.ts:60-70`
- Test: `tests/tarefas-esperadas.test.ts`

**Interfaces:**
- Consumes: `MapaVinculosSetor.porAtividade: Record<string, string[]>` (não muda).
- Produces: `calcularTarefasEsperadas(cliente: { grupo?: string | null; regime?: string | null; atividade?: string[] | null; tarefas_personalizadas: string[] }, mapa: MapaVinculosSetor): string[]` — mesma assinatura de retorno de antes, só o tipo de `atividade` no parâmetro muda.

- [ ] **Step 1: Escrever o teste que falha (2 atividades, união sem duplicar)**

Adicione ao final de `tests/tarefas-esperadas.test.ts`:

```ts
test('calcularTarefasEsperadas: cliente com 2 atividades soma os vínculos das duas sem duplicar', () => {
  const mapa: MapaVinculosSetor = {
    porGrupo: {},
    porRegime: {},
    porAtividade: { Serviço: ['ISS', 'DAS'], Comércio: ['DAS', 'ICMS'] },
  }
  const cliente = { grupo: null, regime: null, atividade: ['Serviço', 'Comércio'], tarefas_personalizadas: [] }
  const resultado = calcularTarefasEsperadas(cliente, mapa)
  assert.deepEqual(resultado.sort(), ['DAS', 'ICMS', 'ISS'])
})
```

Também atualize os testes existentes que hoje passam `atividade` como string única, pra usarem array (são os únicos 2 testes do arquivo que preenchem `atividade` com um valor não-null — os demais já usam `null`):
- `'calcularTarefasEsperadas: sem vínculo nenhum, devolve só tarefas_personalizadas'`: troque `atividade: 'Serviço'` por `atividade: ['Serviço']`.
- `'calcularTarefasEsperadas: vínculo só por atividade'`: troque `porAtividade: { Serviço: ['ISS'] }` (mantém) e `atividade: 'Serviço'` por `atividade: ['Serviço']`.
- `'calcularTarefasEsperadas: combinação dos 3 sem duplicar'`: troque `atividade: 'Serviço'` por `atividade: ['Serviço']`.

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npm run test`
Expected: FAIL — `cliente.atividade.flatMap is not a function` (ou erro de tipo, já que o código atual trata `atividade` como string) nos testes que passam array.

- [ ] **Step 3: Implementar**

Em `lib/tarefas-esperadas.ts`, troque a assinatura e o corpo de `calcularTarefasEsperadas`:

```ts
export function calcularTarefasEsperadas(
  cliente: { grupo?: string | null; regime?: string | null; atividade?: string[] | null; tarefas_personalizadas: string[] },
  mapa: MapaVinculosSetor,
): string[] {
  const automaticas = [
    ...(mapa.porGrupo[cliente.grupo ?? ''] ?? []),
    ...(mapa.porRegime[cliente.regime ?? ''] ?? []),
    ...(cliente.atividade ?? []).flatMap(a => mapa.porAtividade[a] ?? []),
  ]
  return Array.from(new Set([...automaticas, ...cliente.tarefas_personalizadas]))
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npm run test`
Expected: PASS em todos os testes de `tests/tarefas-esperadas.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/tarefas-esperadas.ts tests/tarefas-esperadas.test.ts
git commit -m "feat: calcularTarefasEsperadas soma vinculos de todas as atividades do cliente"
```

---

### Task 4: `lib/preenchimento-rapido.ts` — filtro por atividade vira "contém"

**Files:**
- Modify: `lib/preenchimento-rapido.ts:6-45`
- Test: `tests/preenchimento-rapido.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `ClienteFiltro.atividade?: string[] | null`; `valoresDistintos`/`clientesPorValor` continuam com a mesma assinatura pública, só o comportamento interno pro campo `'atividade'` muda (flatten / `includes` em vez de igualdade).

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `tests/preenchimento-rapido.test.ts`:

```ts
test('valoresDistintos: campo atividade achata os arrays e ordena', () => {
  const valores = valoresDistintos(
    [
      { id: '1', nome: 'A', atividade: ['Serviço', 'Comércio'] },
      { id: '2', nome: 'B', atividade: ['Comércio'] },
      { id: '3', nome: 'C', atividade: null },
    ],
    'atividade',
  )
  assert.deepEqual(valores, ['Comércio', 'Serviço'])
})

test('clientesPorValor: campo atividade filtra quem tem aquele valor entre as suas', () => {
  const clientes = [
    { id: '1', nome: 'A', atividade: ['Serviço', 'Comércio'] },
    { id: '2', nome: 'B', atividade: ['Comércio'] },
    { id: '3', nome: 'C', atividade: ['Indústria'] },
  ]
  const filtrados = clientesPorValor(clientes, 'atividade', 'Comércio')
  assert.deepEqual(filtrados.map(c => c.id), ['1', '2'])
})
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npm run test`
Expected: FAIL — hoje `valoresDistintos`/`clientesPorValor` tratam `c.atividade` como valor escalar (`if (v) valores.add(v)` recebendo um array quebra a comparação esperada nos asserts acima).

- [ ] **Step 3: Implementar**

Em `lib/preenchimento-rapido.ts`, troque a interface e as duas funções:

```ts
export interface ClienteFiltro {
  id: string
  nome: string
  grupo?: string | null
  regime?: string | null
  atividade?: string[] | null
}

export function valoresDistintos(clientes: ClienteFiltro[], campo: CampoFiltro): string[] {
  const valores = new Set<string>()
  for (const c of clientes) {
    if (campo === 'atividade') {
      for (const v of c.atividade ?? []) valores.add(v)
      continue
    }
    const v = c[campo]
    if (v) valores.add(v)
  }
  return Array.from(valores).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function clientesPorValor(
  clientes: ClienteFiltro[],
  campo: CampoFiltro,
  valor: string,
): ClienteFiltro[] {
  if (campo === 'atividade') {
    return clientes.filter(c => (c.atividade ?? []).includes(valor))
  }
  return clientes.filter(c => c[campo] === valor)
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npm run test`
Expected: PASS em todos os testes de `tests/preenchimento-rapido.test.ts` (os antigos de `grupo`/`regime` continuam passando sem alteração).

- [ ] **Step 5: Commit**

```bash
git add lib/preenchimento-rapido.ts tests/preenchimento-rapido.test.ts
git commit -m "feat: preenchimento rapido filtra atividade por 'contem' em vez de igualdade"
```

---

### Task 5: `components/geral/SeletorAtividades.tsx` — componente novo

**Files:**
- Create: `components/geral/SeletorAtividades.tsx`

**Interfaces:**
- Produces: `export default function SeletorAtividades({ valores, opcoes, onChange, readOnly }: { valores: string[]; opcoes: string[]; onChange: (novos: string[]) => void; readOnly?: boolean })`. Tasks 6, 9, 10 importam esse componente.

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

interface Props {
  valores: string[]
  opcoes: string[]
  onChange: (novos: string[]) => void
  readOnly?: boolean
}

export default function SeletorAtividades({ valores, opcoes, onChange, readOnly = false }: Props) {
  const extras = valores.filter(v => !opcoes.includes(v))
  const todas = [...opcoes, ...extras]

  function toggle(nome: string) {
    if (readOnly) return
    onChange(valores.includes(nome) ? valores.filter(v => v !== nome) : [...valores, nome])
  }

  if (todas.length === 0) {
    return <p className="text-[var(--fg)]/20 text-xs">Nenhuma atividade cadastrada no catálogo.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {todas.map(nome => (
        <label key={nome} className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={valores.includes(nome)}
            onChange={() => toggle(nome)}
            className="w-3.5 h-3.5 accent-[var(--accent)]"
            disabled={readOnly}
          />
          <span className="text-[var(--fg)]/60 text-xs">
            {nome}{extras.includes(nome) ? ' (atual)' : ''}
          </span>
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: nenhum erro relacionado a `components/geral/SeletorAtividades.tsx` (erros em outros arquivos ainda por ajustar são esperados nesse ponto do plano).

- [ ] **Step 3: Commit**

```bash
git add components/geral/SeletorAtividades.tsx
git commit -m "feat: componente SeletorAtividades (checkboxes) compartilhado entre os 3 setores"
```

---

### Task 6: `components/fiscal/CamposFiscais.tsx` — usar o novo seletor

**Files:**
- Modify: `components/fiscal/CamposFiscais.tsx:1-19` (imports/tipo), `components/fiscal/CamposFiscais.tsx:58-68` (JSX)

**Interfaces:**
- Consumes: `SeletorAtividades` (Task 5).
- Produces: `CamposFiscaisData.atividade: string[]` — usado por `EmpresaModal.tsx` (Task 7) e `ClienteGeralModal.tsx` (Task 8), que estendem esse tipo.

- [ ] **Step 1: Importar o componente e trocar o tipo do campo**

No topo do arquivo, adicione o import:
```ts
import SeletorAtividades from '@/components/geral/SeletorAtividades'
```

Na interface `CamposFiscaisData`, troque:
```ts
  atividade: string
```
por:
```ts
  atividade: string[]
```

- [ ] **Step 2: Trocar o `<select>` pelo componente**

Troque o bloco (linhas 58-68):
```tsx
      {/* Atividade */}
      <div>
        <label className={labelCls}>Atividade</label>
        <select className={selectCls} value={form.atividade} onChange={e => set('atividade', e.target.value)} disabled={readOnly}>
          <option value="">Selecionar...</option>
          {form.atividade && !catalogo.atividades.includes(form.atividade) && (
            <option value={form.atividade} className="bg-[var(--bg-surface)]">{form.atividade} (atual)</option>
          )}
          {catalogo.atividades.map(a => <option key={a} value={a} className="bg-[var(--bg-surface)]">{a}</option>)}
        </select>
      </div>
```
por:
```tsx
      {/* Atividade */}
      <div>
        <label className={labelCls}>Atividade</label>
        <SeletorAtividades
          valores={form.atividade}
          opcoes={catalogo.atividades}
          onChange={v => set('atividade', v)}
          readOnly={readOnly}
        />
      </div>
```

- [ ] **Step 3: Commit**

```bash
git add components/fiscal/CamposFiscais.tsx
git commit -m "feat: CamposFiscais usa SeletorAtividades (checkboxes) em vez de select"
```

(A compilação só volta a fechar totalmente depois das Tasks 7 e 8, que ajustam os dois consumidores deste componente — normal.)

---

### Task 7: `components/fiscal/EmpresaModal.tsx`

**Files:**
- Modify: `components/fiscal/EmpresaModal.tsx:13-32` (tipo), `:42-48` (emptyForm), `:85-104` (load), `:165-179` (save)

**Interfaces:**
- Consumes: `CamposFiscaisData.atividade: string[]` (Task 6).

- [ ] **Step 1: Tipo do form**

Troque `atividade: string` por `atividade: string[]` na interface `FormData` (linha 18).

- [ ] **Step 2: `emptyForm`**

Troque `atividade: ''` por `atividade: []` na função `emptyForm` (linha 43).

- [ ] **Step 3: Load do cliente existente**

No `useEffect` de carregamento (dentro de `setForm({...})`), troque:
```ts
        atividade: data.atividade ?? '',
```
por:
```ts
        atividade: data.atividade ?? [],
```

- [ ] **Step 4: Save**

Em `fiscalPayload` (dentro de `handleSave`), troque:
```ts
      atividade:              form.atividade || null,
```
por:
```ts
      atividade:              form.atividade,
```

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `EmpresaModal.tsx` ou `CamposFiscais.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/fiscal/EmpresaModal.tsx
git commit -m "feat: EmpresaModal fiscal salva atividade como array"
```

---

### Task 8: `components/geral/ClienteGeralModal.tsx`

**Files:**
- Modify: `components/geral/ClienteGeralModal.tsx:35-42` (emptyForm), `:71-92` (load), `:178-192` (fiscalPayload)

**Interfaces:**
- Consumes: `CamposFiscaisData.atividade: string[]` (Task 6) — `FormData` deste arquivo já estende `CamposFiscaisData`, então nenhum tipo novo precisa ser declarado aqui.

- [ ] **Step 1: `emptyForm`**

Troque `atividade: ''` por `atividade: []` (linha 38).

- [ ] **Step 2: Load do cliente existente**

Troque:
```ts
        atividade: data.atividade ?? '',
```
por:
```ts
        atividade: data.atividade ?? [],
```

- [ ] **Step 3: Save**

Em `fiscalPayload`, troque:
```ts
      atividade:              form.atividade || null,
```
por:
```ts
      atividade:              form.atividade,
```

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `ClienteGeralModal.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/geral/ClienteGeralModal.tsx
git commit -m "feat: ClienteGeralModal salva atividade fiscal como array"
```

---

### Task 9: `components/contabil/EmpresaContabilModal.tsx`

**Files:**
- Modify: `components/contabil/EmpresaContabilModal.tsx:1-15` (import/tipo), `:35-36` (emptyForm), `:65` (load), `:127` (save), `:200-210` (JSX)

**Interfaces:**
- Consumes: `SeletorAtividades` (Task 5).

- [ ] **Step 1: Import + tipo**

Adicione o import:
```ts
import SeletorAtividades from '@/components/geral/SeletorAtividades'
```
Na interface `FormData`, troque `atividade: string` por `atividade: string[]`.

- [ ] **Step 2: `emptyForm`**

Troque `atividade: '',` por `atividade: [],` na função `emptyForm`.

- [ ] **Step 3: Load**

Troque `atividade: data.atividade ?? '',` por `atividade: data.atividade ?? [],`.

- [ ] **Step 4: Save**

Em `contabilPayload`, troque `atividade: form.atividade || null,` por `atividade: form.atividade,`.

- [ ] **Step 5: JSX — trocar o `<select>` pelo componente**

Troque o bloco:
```tsx
              <div>
                <label className={labelCls}>Atividade</label>
                <select className={selectCls} value={form.atividade} onChange={e => set('atividade', e.target.value)} disabled={readOnly}>
                  <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
                  {form.atividade && !catalogo.atividades.includes(form.atividade) && (
                    <option value={form.atividade} className="bg-[var(--bg-surface)]">{form.atividade} (atual)</option>
                  )}
                  {catalogo.atividades.map(a => <option key={a} value={a} className="bg-[var(--bg-surface)]">{a}</option>)}
                </select>
              </div>
```
por:
```tsx
              <div>
                <label className={labelCls}>Atividade</label>
                <SeletorAtividades
                  valores={form.atividade}
                  opcoes={catalogo.atividades}
                  onChange={v => set('atividade', v)}
                  readOnly={readOnly}
                />
              </div>
```

- [ ] **Step 6: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `EmpresaContabilModal.tsx`.

- [ ] **Step 7: Commit**

```bash
git add components/contabil/EmpresaContabilModal.tsx
git commit -m "feat: EmpresaContabilModal usa SeletorAtividades e salva array"
```

---

### Task 10: `components/pessoal/EmpresaPessoalModal.tsx`

**Files:**
- Modify: idêntico à Task 9, trocando `contabil`/`Contabil` por `pessoal`/`Pessoal` onde aplicável (`components/pessoal/EmpresaPessoalModal.tsx:1-15,35-36,65,127,200-210`).

**Interfaces:**
- Consumes: `SeletorAtividades` (Task 5).

- [ ] **Step 1: Import + tipo**

Adicione `import SeletorAtividades from '@/components/geral/SeletorAtividades'`. Na interface `FormData`, troque `atividade: string` por `atividade: string[]`.

- [ ] **Step 2: `emptyForm`, load, save**

Mesmas 3 trocas da Task 9 (`atividade: [],` / `atividade: data.atividade ?? [],` / `atividade: form.atividade,` em `pessoalPayload`).

- [ ] **Step 3: JSX**

Mesma troca de `<select>` por `<SeletorAtividades valores={form.atividade} opcoes={catalogo.atividades} onChange={v => set('atividade', v)} readOnly={readOnly} />` da Task 9.

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `EmpresaPessoalModal.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/pessoal/EmpresaPessoalModal.tsx
git commit -m "feat: EmpresaPessoalModal usa SeletorAtividades e salva array"
```

---

### Task 11: `components/fiscal/ClientesLista.tsx` — filtro e badges

**Files:**
- Modify: `components/fiscal/ClientesLista.tsx:66-68` (lista distinta), `:85` (filtro), `:217-221` (badge)

**Interfaces:**
- Consumes: `ClienteComFiscal.atividade: string[]` (via `lib/types.ts`, Task 2).

- [ ] **Step 1: Lista de valores distintos pro dropdown**

Troque:
```ts
  const atividades = useMemo(() => ['TODOS', ...Array.from(new Set(
    clientes.map(c => c.atividade ?? '').filter(Boolean)
  )).sort()], [clientes])
```
por:
```ts
  const atividades = useMemo(() => ['TODOS', ...Array.from(new Set(
    clientes.flatMap(c => c.atividade ?? [])
  )).sort()], [clientes])
```

- [ ] **Step 2: Filtro**

Troque:
```ts
    if (filtroAtividade !== 'TODOS' && c.atividade !== filtroAtividade) return false
```
por:
```ts
    if (filtroAtividade !== 'TODOS' && !(c.atividade ?? []).includes(filtroAtividade)) return false
```

- [ ] **Step 3: Badge (uma tag por atividade)**

Troque:
```tsx
                {cliente.atividade && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                    {cliente.atividade}
                  </span>
                )}
```
por:
```tsx
                {(cliente.atividade ?? []).map(a => (
                  <span key={a} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                    {a}
                  </span>
                ))}
```

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a `ClientesLista.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/fiscal/ClientesLista.tsx
git commit -m "feat: listagem fiscal filtra e exibe multiplas atividades por cliente"
```

---

### Task 12: `ClientesListaContabil.tsx` + `ClientesListaPessoal.tsx` — badges

**Files:**
- Modify: `components/contabil/ClientesListaContabil.tsx:170-174`
- Modify: `components/pessoal/ClientesListaPessoal.tsx:170-174`

(Essas 2 listagens não têm dropdown de filtro por atividade — só o badge muda.)

**Interfaces:**
- Consumes: `ClienteComContabil.atividade: string[]`, `ClienteComPessoal.atividade: string[]` (Task 2).

- [ ] **Step 1: Badge em `ClientesListaContabil.tsx`**

Troque:
```tsx
                {cliente.atividade && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                    {cliente.atividade}
                  </span>
                )}
```
por:
```tsx
                {(cliente.atividade ?? []).map(a => (
                  <span key={a} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                    {a}
                  </span>
                ))}
```

- [ ] **Step 2: Mesma troca em `ClientesListaPessoal.tsx`**

Aplique exatamente a mesma substituição do Step 1 em `components/pessoal/ClientesListaPessoal.tsx`.

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados aos 2 arquivos.

- [ ] **Step 4: Commit**

```bash
git add components/contabil/ClientesListaContabil.tsx components/pessoal/ClientesListaPessoal.tsx
git commit -m "feat: listagens contabil e pessoal exibem multiplas atividades por cliente"
```

---

### Task 13: `app/fiscal/relatorios/page.tsx` — filtro e lista

**Files:**
- Modify: `app/fiscal/relatorios/page.tsx:87` (lista distinta), `:93` (filtro)

**Interfaces:**
- Consumes: `ClienteComFiscal.atividade: string[]` (Task 2).

- [ ] **Step 1: Lista de valores distintos**

Troque:
```ts
  const atividades = Array.from(new Set(clientes.map(c => c.atividade).filter(Boolean) as string[])).sort()
```
por:
```ts
  const atividades = Array.from(new Set(clientes.flatMap(c => c.atividade ?? []))).sort()
```

- [ ] **Step 2: Filtro**

Troque:
```ts
    .filter(c => filtroAtividade === 'TODAS' || c.atividade === filtroAtividade)
```
por:
```ts
    .filter(c => filtroAtividade === 'TODAS' || (c.atividade ?? []).includes(filtroAtividade))
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados a este arquivo.

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/relatorios/page.tsx
git commit -m "feat: relatorio fiscal filtra por atividade contida no array do cliente"
```

---

### Task 14: `RelatoriosContabil.tsx` + `RelatoriosPessoal.tsx` — filtro e lista

**Files:**
- Modify: `components/contabil/RelatoriosContabil.tsx:42,47`
- Modify: `components/pessoal/RelatoriosPessoal.tsx:45,50`

**Interfaces:**
- Consumes: `ClienteComContabil.atividade: string[]`, `ClienteComPessoal.atividade: string[]` (Task 2).

- [ ] **Step 1: `RelatoriosContabil.tsx`**

Troque:
```ts
  const atividades = Array.from(new Set(clientes.map(c => c.atividade).filter(Boolean) as string[])).sort()
```
por:
```ts
  const atividades = Array.from(new Set(clientes.flatMap(c => c.atividade ?? []))).sort()
```
E troque:
```ts
    .filter(c => filtroAtividade === 'TODAS' || c.atividade === filtroAtividade)
```
por:
```ts
    .filter(c => filtroAtividade === 'TODAS' || (c.atividade ?? []).includes(filtroAtividade))
```

- [ ] **Step 2: Mesmas 2 trocas em `RelatoriosPessoal.tsx`**

Aplique exatamente as mesmas 2 substituições do Step 1 em `components/pessoal/RelatoriosPessoal.tsx`.

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados aos 2 arquivos.

- [ ] **Step 4: Commit**

```bash
git add components/contabil/RelatoriosContabil.tsx components/pessoal/RelatoriosPessoal.tsx
git commit -m "feat: relatorios contabil e pessoal filtram por atividade contida no array"
```

---

### Task 15: Páginas de preenchimento rápido — tipo de `ClienteRow`

**Files:**
- Modify: `app/fiscal/preenchimento-rapido/page.tsx:16-21`
- Modify: `app/contabil/preenchimento-rapido/page.tsx:16-20`
- Modify: `app/pessoal/preenchimento-rapido/page.tsx:16-20`

(Mudança só de tipo — o valor que vem do Supabase já é o array direto, a query `select(...atividade...)` não muda.)

**Interfaces:**
- Consumes: `ClienteFiltro.atividade?: string[] | null` (Task 4).

- [ ] **Step 1: `app/fiscal/preenchimento-rapido/page.tsx`**

Na interface `ClienteRow`, dentro de `clientes_fiscal`, troque:
```ts
    atividade: string | null
```
por:
```ts
    atividade: string[]
```

- [ ] **Step 2: `app/contabil/preenchimento-rapido/page.tsx`**

Mesma troca, dentro de `clientes_contabil`.

- [ ] **Step 3: `app/pessoal/preenchimento-rapido/page.tsx`**

Mesma troca, dentro de `clientes_pessoal`.

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados aos 3 arquivos.

- [ ] **Step 5: Commit**

```bash
git add app/fiscal/preenchimento-rapido/page.tsx app/contabil/preenchimento-rapido/page.tsx app/pessoal/preenchimento-rapido/page.tsx
git commit -m "feat: paginas de preenchimento rapido tipam atividade como array"
```

---

### Task 16: Verificação final

**Files:** nenhum (só verificação).

- [ ] **Step 1: Rodar a suíte de testes completa**

Run: `npm run test`
Expected: todos os testes passam, incluindo os novos de `tests/tarefas-esperadas.test.ts` e `tests/preenchimento-rapido.test.ts`.

- [ ] **Step 2: Build completo (typecheck + Next.js)**

Run: `npm run build`
Expected: build conclui sem erros de tipo. Se aparecer qualquer referência residual a `atividade` como `string` (por exemplo em algum arquivo não listado neste plano), corrigir seguindo o mesmo padrão das tasks acima antes de prosseguir.

- [ ] **Step 3: Revisão manual do diff**

Run: `git diff dev --stat`
Expected: só os arquivos listados nas Tasks 1–15 aparecem alterados — nenhuma mudança acidental fora do escopo (em especial, nada do stash da branch `feat/societario-config-processos-documentacoes`, que não deve ter voltado pra esta branch).

Este plano não inclui verificação manual no navegador (fora do escopo desta sessão, conforme preferência do usuário) — fica pendente pro usuário testar os 4 formulários e os filtros das listagens/relatórios antes de abrir o PR.
