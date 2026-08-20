# Campos Grupo/Regime/Atividade do cliente usam o catálogo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os campos Grupo/Regime/Atividade do cadastro de cliente (Fiscal, Contábil, Pessoal) passam a oferecer como opções o que estiver cadastrado em `/admin/configuracoes`, em vez de listas fixas no código — sem mudar como o valor é armazenado (continua texto puro nas colunas existentes).

**Architecture:** Sem migration, sem coluna nova. Um helper server-side novo (`buscarCatalogoCliente`) lê `grupos`/`regimes`/`atividades` (ativos, por setor) e é encaixado no fluxo de fetch já existente de cada página de clientes, que já repassa dados auxiliares (`responsaveis`/`templates`) como prop pros modais de cadastro — o mesmo padrão se estende pro catálogo novo. Os `<select>` dos 3 setores passam a montar suas opções a partir dessa prop, preservando (como opção extra "(atual)") qualquer valor já salvo que não esteja mais na lista ativa.

**Tech Stack:** Next.js (App Router, Server Components), Supabase (`@supabase/ssr`), TypeScript, React (client components pros modais).

## Global Constraints

- Nenhuma migration nova — `clientes_fiscal.grupo/regime/atividade` e os equivalentes em `clientes_contabil`/`clientes_pessoal` continuam sendo colunas de texto, sem FK.
- Ao salvar, grava o `nome` do item do catálogo escolhido como texto puro — mesmo formato de hoje.
- Valor salvo que não bate com nenhum item ativo do catálogo aparece como opção extra `"{valor} (atual)"` no topo do select, nunca é apagado nem força reescolha.
- `lib/atividades-regimes.ts` **não é removido** — `REGIMES`/`labelRegime` continuam em uso pelos filtros de listagem do Contábil/Pessoal (fora de escopo deste projeto). Só a constante `ATIVIDADES` desse arquivo é removida, na Task 5, depois de confirmado que fica sem uso.
- Não criar campo Grupo em Contábil/Pessoal — eles não têm esse campo hoje, não é criado aqui.
- Cada task termina com `npx tsc --noEmit` limpo (rodar do diretório `portal-tesserato`).

---

### Task 1: `lib/catalogo-cliente.ts` — helper de leitura do catálogo

**Files:**
- Create: `lib/catalogo-cliente.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `export interface CatalogoCliente { grupos: string[]; regimes: string[]; atividades: string[] }` e `export async function buscarCatalogoCliente(supabase: SupabaseServer, setor: UserSetor): Promise<CatalogoCliente>` — usados por todas as tasks seguintes.

- [ ] **Step 1: Criar o arquivo**

```ts
// lib/catalogo-cliente.ts
import type { createClient } from '@/lib/supabase/server'
import type { UserSetor } from '@/lib/types'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export interface CatalogoCliente {
  grupos: string[]
  regimes: string[]
  atividades: string[]
}

// Lê as listas ativas de Grupos/Regimes/Atividades cadastradas em
// /admin/configuracoes para um setor — usado pra popular os selects do
// cadastro de cliente (Fiscal/Contábil/Pessoal). RLS de leitura dessas 3
// tabelas já libera qualquer autenticado (migration 024), por isso aceita
// o client de sessão normal, sem precisar de service role.
export async function buscarCatalogoCliente(supabase: SupabaseServer, setor: UserSetor): Promise<CatalogoCliente> {
  const [{ data: grupos }, { data: regimes }, { data: atividades }] = await Promise.all([
    supabase.from('grupos').select('nome').eq('setor', setor).eq('ativo', true).order('nome'),
    supabase.from('regimes').select('nome').eq('setor', setor).eq('ativo', true).order('nome'),
    supabase.from('atividades').select('nome').eq('setor', setor).eq('ativo', true).order('nome'),
  ])

  return {
    grupos: (grupos ?? []).map(g => g.nome as string),
    regimes: (regimes ?? []).map(r => r.nome as string),
    atividades: (atividades ?? []).map(a => a.nome as string),
  }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

Não há teste automatizado pra esse arquivo — segue o padrão já usado em
`lib/vinculos.ts`/`buscarPendenciasVinculoPorCliente` e
`lib/tarefas-paginacao.ts`/`buscarTodasTarefasDoMes`, helpers de leitura
que tocam o Supabase direto e não têm suíte cobrindo (só as funções puras
do projeto — cálculo/formatação — têm teste em `tests/`).

- [ ] **Step 3: Commit**

```bash
git add lib/catalogo-cliente.ts
git commit -m "feat: helper para ler catálogo de grupos/regimes/atividades por setor"
```

---

### Task 2: Fiscal — campos usam o catálogo

**Files:**
- Modify: `components/fiscal/CamposFiscais.tsx`
- Modify: `components/fiscal/EmpresaModal.tsx`
- Modify: `components/fiscal/ClientesLista.tsx`
- Modify: `components/fiscal/ClienteAcoes.tsx`
- Modify: `app/fiscal/clientes/page.tsx`
- Modify: `app/fiscal/clientes/[id]/page.tsx`
- Modify: `components/geral/ClienteGeralModal.tsx`
- Modify: `components/geral/ClientesGeralLista.tsx`
- Modify: `app/(comum)/clientes/page.tsx`

**Interfaces:**
- Consumes: `CatalogoCliente`, `buscarCatalogoCliente(supabase, setor)` da Task 1.
- Produces: nada consumido pelas tasks seguintes (Contábil/Pessoal são independentes).

- [ ] **Step 1: `components/fiscal/CamposFiscais.tsx` — trocar as listas fixas pela prop `catalogo`**

Substituir as linhas 1-20 (import + as duas constantes `GRUPOS`/`ATIVIDADES`):

```ts
'use client'

import { resolverTemplate } from '@/lib/atividade-templates'
```

por:

```ts
'use client'

import { resolverTemplate } from '@/lib/atividade-templates'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props`, adicionar `catalogo: CatalogoCliente` (logo depois de `templates`):

```ts
interface Props {
  form: CamposFiscaisData
  set: <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void
  responsaveis: string[]
  templates: Record<string, string[]>
  catalogo: CatalogoCliente
  isEdit: boolean
  readOnly: boolean
  novaTarefa: string
  setNovaTarefa: (v: string) => void
  addTarefa: () => void
}
```

Na assinatura da função, adicionar `catalogo` à desestruturação:

```ts
export default function CamposFiscais({ form, set, responsaveis, templates, catalogo, isEdit, readOnly, novaTarefa, setNovaTarefa, addTarefa }: Props) {
```

Trocar o campo Regime (hoje um `<input>` texto livre) por um `<select>`:

```tsx
        <div>
          <label className={labelCls}>Regime</label>
          <select className={selectCls} value={form.regime} onChange={e => set('regime', e.target.value)} disabled={readOnly}>
            <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
            {form.regime && !catalogo.regimes.includes(form.regime) && (
              <option value={form.regime} className="bg-[var(--bg-surface)]">{form.regime} (atual)</option>
            )}
            {catalogo.regimes.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
          </select>
        </div>
```

Trocar o `<select>` de Atividade — mesma lógica de `onChange` (não muda), só a origem das `<option>`:

```tsx
      {/* Atividade */}
      <div>
        <label className={labelCls}>Atividade</label>
        <select className={selectCls} value={form.atividade} onChange={e => {
          const novaAtividade = e.target.value
          set('atividade', novaAtividade)
          if (!isEdit && novaAtividade) {
            const tarefasTemplate = resolverTemplate(novaAtividade, templates)
            if (tarefasTemplate.length > 0) {
              set('tarefas_personalizadas', tarefasTemplate)
            }
          }
        }} disabled={readOnly}>
          <option value="">Selecionar...</option>
          {form.atividade && !catalogo.atividades.includes(form.atividade) && (
            <option value={form.atividade} className="bg-[var(--bg-surface)]">{form.atividade} (atual)</option>
          )}
          {catalogo.atividades.map(a => <option key={a} value={a} className="bg-[var(--bg-surface)]">{a}</option>)}
        </select>
      </div>
```

Trocar o `<select>` de Grupo (as opções eram pares `{value, label}`; a nova lista é só nomes, então `value` e o texto exibido são o mesmo):

```tsx
        <div>
          <label className={labelCls}>Grupo</label>
          <select className={selectCls} value={form.grupo} onChange={e => set('grupo', e.target.value)} disabled={readOnly}>
            <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
            {form.grupo && !catalogo.grupos.includes(form.grupo) && (
              <option value={form.grupo} className="bg-[var(--bg-surface)]">{form.grupo} (atual)</option>
            )}
            {catalogo.grupos.map(g => <option key={g} value={g} className="bg-[var(--bg-surface)]">{g}</option>)}
          </select>
        </div>
```

- [ ] **Step 2: `components/fiscal/EmpresaModal.tsx` — repassar `catalogo` pro `CamposFiscais`**

Adicionar o import (junto aos outros imports do topo do arquivo):

```ts
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props` (linhas 33-39), adicionar `catalogo: CatalogoCliente` depois de `templates`:

```ts
interface Props {
  clienteId: string | null  // null = novo
  responsaveis: string[]
  onClose: () => void
  readOnly?: boolean
  templates: Record<string, string[]>
  catalogo: CatalogoCliente
}
```

Na assinatura da função (linha 52), adicionar `catalogo` à desestruturação:

```ts
export default function EmpresaModal({ clienteId, responsaveis, onClose, readOnly = false, templates, catalogo }: Props) {
```

Na chamada de `<CamposFiscais>` (linhas 249-259), adicionar a prop:

```tsx
            <CamposFiscais
              form={form}
              set={set as <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void}
              responsaveis={responsaveis}
              templates={templates}
              catalogo={catalogo}
              isEdit={isEdit}
              readOnly={readOnly}
              novaTarefa={novaTarefa}
              setNovaTarefa={setNovaTarefa}
              addTarefa={addTarefa}
            />
```

- [ ] **Step 3: `components/fiscal/ClientesLista.tsx` — repassar `catalogo` pro `EmpresaModal`**

Adicionar o import:

```ts
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props` (linhas 38-46), adicionar `catalogo: CatalogoCliente`:

```ts
interface Props {
  clientes: ClienteComFiscal[]
  comPendencia: Set<string>
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  templates: Record<string, string[]>
  catalogo: CatalogoCliente
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}
```

Na assinatura da função (linha 50), adicionar `catalogo`:

```ts
export default function ClientesLista({ clientes, comPendencia, progressoMap, mes, ano, templates, catalogo, pendenciasVinculo }: Props) {
```

Na chamada de `<EmpresaModal>` (linhas 147-154), adicionar a prop:

```tsx
      {modalNovoOpen && (
        <EmpresaModal
          clienteId={null}
          responsaveis={responsaveis.slice(1)}
          templates={templates}
          catalogo={catalogo}
          onClose={() => setModalNovoOpen(false)}
        />
      )}
```

- [ ] **Step 4: `components/fiscal/ClienteAcoes.tsx` — repassar `catalogo` pro `EmpresaModal`**

Adicionar o import:

```ts
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props` (linhas 10-14), adicionar `catalogo: CatalogoCliente`:

```ts
interface Props {
  cliente: ClienteComFiscal
  responsaveis: string[]
  templates: Record<string, string[]>
  catalogo: CatalogoCliente
}
```

Na assinatura da função (linha 16), adicionar `catalogo`:

```ts
export default function ClienteAcoes({ cliente, responsaveis, templates, catalogo }: Props) {
```

Na chamada de `<EmpresaModal>` (linhas 104-111), adicionar a prop:

```tsx
      {modalOpen && (
        <EmpresaModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          templates={templates}
          catalogo={catalogo}
          onClose={() => setModalOpen(false)}
        />
      )}
```

- [ ] **Step 5: `app/fiscal/clientes/page.tsx` — buscar o catálogo e repassar**

Adicionar o import:

```ts
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
```

Depois da linha `const { mes, ano } = await getMesAno()`, adicionar a busca (pode rodar em paralelo com o resto, mas como é só essa página que usa e o `Promise.all` existente já busca `clientesQ`/tarefas/templates, adiciona como uma chamada própria simples logo abaixo, sem reorganizar o `Promise.all` existente):

```ts
  const catalogo = await buscarCatalogoCliente(supabase, 'fiscal')
```

Na chamada de `<ClientesLista>` (linhas 64-72), adicionar a prop:

```tsx
      <ClientesLista
        clientes={clientes}
        comPendencia={comPendencia}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        templates={templatesMap}
        catalogo={catalogo}
        pendenciasVinculo={pendenciasVinculo}
      />
```

- [ ] **Step 6: `app/fiscal/clientes/[id]/page.tsx` — buscar o catálogo e repassar**

Adicionar o import:

```ts
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
```

Logo depois do bloco (linhas 125-129):

```ts
  // Dados pro EmpresaModal (editar cliente)
  const [{ data: usuariosFiscal }, { data: atividadeTemplates }] = await Promise.all([
    supabase.from('profiles').select('nome').contains('setores', ['fiscal']),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])
```

adicionar:

```ts
  const catalogo = await buscarCatalogoCliente(supabase, 'fiscal')
```

Na chamada de `<ClienteAcoes>` (linha 227), adicionar a prop:

```tsx
                {podeEditar && <ClienteAcoes cliente={cliente} responsaveis={responsaveis} templates={templatesMap} catalogo={catalogo} />}
```

- [ ] **Step 7: `components/geral/ClienteGeralModal.tsx` — repassar `catalogoFiscal` pro `CamposFiscais`**

Adicionar o import:

```ts
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props`, adicionar `catalogoFiscal: CatalogoCliente`:

```ts
interface Props {
  clienteId: string | null
  responsaveis: string[]
  templates: Record<string, string[]>
  vinculosCatalogo: TarefaVinculo[]
  catalogoFiscal: CatalogoCliente
  onClose: () => void
  readOnly?: boolean
}
```

Na assinatura da função, adicionar `catalogoFiscal`:

```ts
export default function ClienteGeralModal({ clienteId, responsaveis, templates, vinculosCatalogo, catalogoFiscal, onClose, readOnly = false }: Props) {
```

Nas duas chamadas de `<CamposFiscais>` (bloco `mostraFiscal && isEdit`, dentro do `<SectorSection>`, e bloco `mostraFiscal && !isEdit`), adicionar `catalogo={catalogoFiscal}`:

```tsx
            {mostraFiscal && isEdit && (
              <SectorSection title="Dados do Fiscal" note="Somente leitura — edite em Fiscal → Clientes" defaultOpen={false}>
                <CamposFiscais
                  form={form}
                  set={set as <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void}
                  responsaveis={responsaveis}
                  templates={templates}
                  catalogo={catalogoFiscal}
                  isEdit={isEdit}
                  readOnly={true}
                  novaTarefa={novaTarefa}
                  setNovaTarefa={setNovaTarefa}
                  addTarefa={addTarefa}
                />
              </SectorSection>
            )}

            {mostraFiscal && !isEdit && (
              <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/3 p-4 space-y-5">
                <p className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest">Dados do Fiscal</p>
                <CamposFiscais
                  form={form}
                  set={set as <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void}
                  responsaveis={responsaveis}
                  templates={templates}
                  catalogo={catalogoFiscal}
                  isEdit={isEdit}
                  readOnly={readOnly}
                  novaTarefa={novaTarefa}
                  setNovaTarefa={setNovaTarefa}
                  addTarefa={addTarefa}
                />
              </div>
            )}
```

- [ ] **Step 8: `components/geral/ClientesGeralLista.tsx` — repassar `catalogoFiscal` pro `ClienteGeralModal`**

Adicionar o import:

```ts
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props`, adicionar `catalogoFiscal: CatalogoCliente`:

```ts
interface Props {
  clientes: Cliente[]
  isAdmin: boolean
  responsaveis: string[]
  templates: Record<string, string[]>
  vinculosCatalogo: TarefaVinculo[]
  catalogoFiscal: CatalogoCliente
}
```

Na assinatura da função, adicionar `catalogoFiscal`:

```ts
export default function ClientesGeralLista({ clientes, isAdmin, responsaveis, templates, vinculosCatalogo, catalogoFiscal }: Props) {
```

Nas duas chamadas de `<ClienteGeralModal>` (bloco `modalNovoOpen` e bloco `clienteAbertoId`), adicionar `catalogoFiscal={catalogoFiscal}`:

```tsx
      {modalNovoOpen && (
        <ClienteGeralModal
          clienteId={null}
          responsaveis={responsaveis}
          templates={templates}
          vinculosCatalogo={vinculosCatalogo}
          catalogoFiscal={catalogoFiscal}
          onClose={() => setModalNovoOpen(false)}
        />
      )}

      {clienteAbertoId && (
        <ClienteGeralModal
          clienteId={clienteAbertoId}
          responsaveis={responsaveis}
          templates={templates}
          vinculosCatalogo={vinculosCatalogo}
          catalogoFiscal={catalogoFiscal}
          readOnly={!isAdmin}
          onClose={() => setClienteAbertoId(null)}
        />
      )}
```

- [ ] **Step 9: `app/(comum)/clientes/page.tsx` — buscar o catálogo fiscal e repassar**

Adicionar o import:

```ts
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
```

Depois do bloco `Promise.all` existente (linhas 14-20), adicionar:

```ts
  const catalogoFiscal = await buscarCatalogoCliente(supabase, 'fiscal')
```

Na chamada de `<ClientesGeralLista>` (linhas 35-41), adicionar a prop:

```tsx
      <ClientesGeralLista
        clientes={clientes ?? []}
        isAdmin={isAdmin}
        responsaveis={responsaveis}
        templates={templatesMap}
        vinculosCatalogo={(vinculosCatalogo ?? []) as TarefaVinculo[]}
        catalogoFiscal={catalogoFiscal}
      />
```

- [ ] **Step 10: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 11: Commit**

```bash
git add components/fiscal/CamposFiscais.tsx components/fiscal/EmpresaModal.tsx components/fiscal/ClientesLista.tsx components/fiscal/ClienteAcoes.tsx "app/fiscal/clientes/page.tsx" "app/fiscal/clientes/[id]/page.tsx" components/geral/ClienteGeralModal.tsx components/geral/ClientesGeralLista.tsx "app/(comum)/clientes/page.tsx"
git commit -m "feat: campos Grupo/Regime/Atividade do Fiscal passam a puxar do catálogo"
```

---

### Task 3: Contábil — campos usam o catálogo

**Files:**
- Modify: `components/contabil/EmpresaContabilModal.tsx`
- Modify: `components/contabil/ClientesListaContabil.tsx`
- Modify: `components/contabil/ClienteContabilAcoes.tsx`
- Modify: `app/contabil/clientes/page.tsx`
- Modify: `app/contabil/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `CatalogoCliente`, `buscarCatalogoCliente(supabase, setor)` da Task 1.
- Produces: nada consumido pelas tasks seguintes.

- [ ] **Step 1: `components/contabil/EmpresaContabilModal.tsx` — trocar `ATIVIDADES`/`REGIMES` pela prop `catalogo`**

Trocar o import (linha 10):

```ts
import { ATIVIDADES, REGIMES } from '@/lib/atividades-regimes'
```

por:

```ts
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props` (linhas 25-31), adicionar `catalogo: CatalogoCliente`:

```ts
interface Props {
  clienteId: string | null
  responsaveis: string[]
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
  onClose: () => void
  readOnly?: boolean
}
```

Na assinatura da função (linha 42), adicionar `catalogo`:

```ts
export default function EmpresaContabilModal({ clienteId, responsaveis, tarefasPadrao, catalogo, onClose, readOnly = false }: Props) {
```

Trocar o bloco de Atividade + Regime (linhas 199-217):

```tsx
            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <label className={labelCls}>Regime</label>
                <select className={selectCls} value={form.regime} onChange={e => set('regime', e.target.value)} disabled={readOnly}>
                  <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
                  {form.regime && !catalogo.regimes.includes(form.regime) && (
                    <option value={form.regime} className="bg-[var(--bg-surface)]">{form.regime} (atual)</option>
                  )}
                  {catalogo.regimes.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
                </select>
              </div>
            </div>
```

- [ ] **Step 2: `components/contabil/ClientesListaContabil.tsx` — repassar `catalogo` pro `EmpresaContabilModal`**

Adicionar o import (junto aos outros, sem remover o import existente de `REGIMES, labelRegime` — esse continua em uso pelo filtro e badge desta mesma tela, fora de escopo):

```ts
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props` (linhas 28-35), adicionar `catalogo: CatalogoCliente`:

```ts
interface Props {
  clientes: ClienteComContabil[]
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}
```

Na assinatura da função, adicionar `catalogo` à desestruturação (mantendo os outros parâmetros como já estão).

Na chamada de `<EmpresaContabilModal>` (linhas 106-113), adicionar a prop:

```tsx
      {modalNovoOpen && (
        <EmpresaContabilModal
          clienteId={null}
          responsaveis={responsaveis.slice(1)}
          tarefasPadrao={tarefasPadrao}
          catalogo={catalogo}
          onClose={() => setModalNovoOpen(false)}
        />
      )}
```

- [ ] **Step 3: `components/contabil/ClienteContabilAcoes.tsx` — repassar `catalogo` pro `EmpresaContabilModal`**

Adicionar o import:

```ts
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props` (linhas 10-14), adicionar `catalogo: CatalogoCliente`:

```ts
interface Props {
  cliente: ClienteComContabil
  responsaveis: string[]
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
}
```

Na assinatura da função (linha 16), adicionar `catalogo`:

```ts
export default function ClienteContabilAcoes({ cliente, responsaveis, tarefasPadrao, catalogo }: Props) {
```

Na chamada de `<EmpresaContabilModal>` (linhas 105-112), adicionar a prop:

```tsx
      {editando && (
        <EmpresaContabilModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          tarefasPadrao={tarefasPadrao}
          catalogo={catalogo}
          onClose={() => setEditando(false)}
        />
      )}
```

- [ ] **Step 4: `app/contabil/clientes/page.tsx` — buscar o catálogo e repassar**

Adicionar o import:

```ts
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
```

Depois de `const { mes, ano } = await getMesAno()`, adicionar:

```ts
  const catalogo = await buscarCatalogoCliente(supabase, 'contabil')
```

Na chamada de `<ClientesListaContabil>` (linhas 46-54), adicionar a prop:

```tsx
      <ClientesListaContabil
        clientes={clientes}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        tarefasPadrao={tarefasPadrao}
        catalogo={catalogo}
        pendenciasVinculo={pendenciasVinculo}
      />
```

- [ ] **Step 5: `app/contabil/clientes/[id]/page.tsx` — buscar o catálogo e repassar**

Adicionar o import:

```ts
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
```

Logo depois da linha `const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)` (linha 71), adicionar:

```ts
  const catalogo = await buscarCatalogoCliente(supabase, 'contabil')
```

Na chamada de `<ClienteContabilAcoes>` (linha 131), adicionar a prop:

```tsx
              {podeEditar && <ClienteContabilAcoes cliente={cliente} responsaveis={responsaveis} tarefasPadrao={tarefasPadrao} catalogo={catalogo} />}
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add components/contabil/EmpresaContabilModal.tsx components/contabil/ClientesListaContabil.tsx components/contabil/ClienteContabilAcoes.tsx "app/contabil/clientes/page.tsx" "app/contabil/clientes/[id]/page.tsx"
git commit -m "feat: campos Atividade/Regime do Contábil passam a puxar do catálogo"
```

---

### Task 4: Pessoal — campos usam o catálogo

**Files:**
- Modify: `components/pessoal/EmpresaPessoalModal.tsx`
- Modify: `components/pessoal/ClientesListaPessoal.tsx`
- Modify: `components/pessoal/ClientePessoalAcoes.tsx`
- Modify: `app/pessoal/clientes/page.tsx`
- Modify: `app/pessoal/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `CatalogoCliente`, `buscarCatalogoCliente(supabase, setor)` da Task 1.
- Produces: nada consumido pela Task 5.

- [ ] **Step 1: `components/pessoal/EmpresaPessoalModal.tsx` — trocar `ATIVIDADES`/`REGIMES` pela prop `catalogo`**

Mesma mudança do Step 1 da Task 3, neste arquivo (`EmpresaPessoalModal.tsx` é estruturalmente idêntico a `EmpresaContabilModal.tsx`, só o nome do componente muda).

Trocar o import (linha 10):

```ts
import { ATIVIDADES, REGIMES } from '@/lib/atividades-regimes'
```

por:

```ts
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props` (linhas 25-31), adicionar `catalogo: CatalogoCliente`:

```ts
interface Props {
  clienteId: string | null
  responsaveis: string[]
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
  onClose: () => void
  readOnly?: boolean
}
```

Na assinatura da função (linha 42), adicionar `catalogo`:

```ts
export default function EmpresaPessoalModal({ clienteId, responsaveis, tarefasPadrao, catalogo, onClose, readOnly = false }: Props) {
```

Trocar o bloco de Atividade + Regime (linhas 199-217):

```tsx
            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <label className={labelCls}>Regime</label>
                <select className={selectCls} value={form.regime} onChange={e => set('regime', e.target.value)} disabled={readOnly}>
                  <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
                  {form.regime && !catalogo.regimes.includes(form.regime) && (
                    <option value={form.regime} className="bg-[var(--bg-surface)]">{form.regime} (atual)</option>
                  )}
                  {catalogo.regimes.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
                </select>
              </div>
            </div>
```

- [ ] **Step 2: `components/pessoal/ClientesListaPessoal.tsx` — repassar `catalogo` pro `EmpresaPessoalModal`**

Adicionar o import (sem remover o import existente de `REGIMES, labelRegime` — continua em uso pelo filtro e badge desta tela):

```ts
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props` (linhas 28-35), adicionar `catalogo: CatalogoCliente`:

```ts
interface Props {
  clientes: ClienteComPessoal[]
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}
```

Na assinatura da função, adicionar `catalogo` à desestruturação.

Na chamada de `<EmpresaPessoalModal>` (linhas 106-112), adicionar a prop:

```tsx
      {modalNovoOpen && (
        <EmpresaPessoalModal
          clienteId={null}
          responsaveis={responsaveis.slice(1)}
          tarefasPadrao={tarefasPadrao}
          catalogo={catalogo}
          onClose={() => setModalNovoOpen(false)}
        />
      )}
```

- [ ] **Step 3: `components/pessoal/ClientePessoalAcoes.tsx` — repassar `catalogo` pro `EmpresaPessoalModal`**

Adicionar o import:

```ts
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
```

Na interface `Props` (linhas 10-14), adicionar `catalogo: CatalogoCliente`:

```ts
interface Props {
  cliente: ClienteComPessoal
  responsaveis: string[]
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
}
```

Na assinatura da função, adicionar `catalogo` à desestruturação.

Na chamada de `<EmpresaPessoalModal>` (linhas 105-111), adicionar a prop:

```tsx
      {editando && (
        <EmpresaPessoalModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          tarefasPadrao={tarefasPadrao}
          catalogo={catalogo}
          onClose={() => setEditando(false)}
        />
      )}
```

- [ ] **Step 4: `app/pessoal/clientes/page.tsx` — buscar o catálogo e repassar**

Adicionar o import:

```ts
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
```

Depois de `const { mes, ano } = await getMesAno()`, adicionar:

```ts
  const catalogo = await buscarCatalogoCliente(supabase, 'pessoal')
```

Na chamada de `<ClientesListaPessoal>` (linhas 51-59), adicionar a prop:

```tsx
      <ClientesListaPessoal
        clientes={clientes}
        progressoMap={progressoMap}
        mes={mes}
        ano={ano}
        tarefasPadrao={tarefasPadrao}
        catalogo={catalogo}
        pendenciasVinculo={pendenciasVinculo}
      />
```

- [ ] **Step 5: `app/pessoal/clientes/[id]/page.tsx` — buscar o catálogo e repassar**

Adicionar o import:

```ts
import { buscarCatalogoCliente } from '@/lib/catalogo-cliente'
```

Logo depois da linha `const tarefasPadrao = (tiposRaw ?? []).map(t => t.nome as string)` (linha 87), adicionar:

```ts
  const catalogo = await buscarCatalogoCliente(supabase, 'pessoal')
```

Na chamada de `<ClientePessoalAcoes>` (linha 147), adicionar a prop:

```tsx
              {podeEditar && <ClientePessoalAcoes cliente={cliente} responsaveis={responsaveis} tarefasPadrao={tarefasPadrao} catalogo={catalogo} />}
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add components/pessoal/EmpresaPessoalModal.tsx components/pessoal/ClientesListaPessoal.tsx components/pessoal/ClientePessoalAcoes.tsx "app/pessoal/clientes/page.tsx" "app/pessoal/clientes/[id]/page.tsx"
git commit -m "feat: campos Atividade/Regime do Pessoal passam a puxar do catálogo"
```

---

### Task 5: Limpeza final e verificação

**Files:**
- Modify: `lib/atividades-regimes.ts`

**Interfaces:**
- Consumes: estado final das Tasks 1-4 (nenhum arquivo do projeto deve mais importar `ATIVIDADES` de `lib/atividades-regimes.ts`).
- Produces: nada — última task.

- [ ] **Step 1: Confirmar que `ATIVIDADES` (de `lib/atividades-regimes.ts`) não tem mais nenhum consumidor**

Run: `grep -rn "ATIVIDADES" --include="*.ts" --include="*.tsx" lib app components`
Expected: a única ocorrência da palavra `ATIVIDADES` deve ser a própria definição em `lib/atividades-regimes.ts`. Se aparecer em outro arquivo, parar e investigar antes de prosseguir — alguma das Tasks 2-4 não trocou a fonte corretamente.

- [ ] **Step 2: Remover a constante `ATIVIDADES` de `lib/atividades-regimes.ts`**

Estado atual do arquivo:

```ts
// Mesmos valores usados em components/fiscal/CamposFiscais.tsx (ATIVIDADES
// e GRUPOS) — duplicados deliberadamente aqui em vez de importados de lá,
// pra não criar acoplamento com o Fiscal (ver spec 2026-08-03).

export const ATIVIDADES = [
  'Serviço',
  'Comércio',
  'Indústria',
  'Serviço e Comércio',
  'Serviço e Indústria',
  'Comércio e Indústria',
  'Serviço, Comércio e Indústria',
]

export const REGIMES = [
  { value: 'normal',  label: 'Regime Normal' },
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'mei',     label: 'MEI' },
  { value: 'isento',  label: 'Isento' },
]

export function labelRegime(regime: string): string {
  return REGIMES.find(r => r.value === regime)?.label ?? regime
}
```

Substituir por (remove `ATIVIDADES` e o comentário de topo que só fazia sentido enquanto ela existia; `REGIMES`/`labelRegime` continuam intactos — ainda usados pelo filtro e badge de `ClientesListaContabil.tsx`/`ClientesListaPessoal.tsx`):

```ts
// Usado pelo filtro e pelo badge de regime das telas de listagem do
// Contábil e Pessoal (ClientesListaContabil.tsx/ClientesListaPessoal.tsx)
// — o cadastro do cliente em si (EmpresaContabilModal/EmpresaPessoalModal)
// passou a puxar as opções do catálogo (lib/catalogo-cliente.ts) em vez
// dessa lista fixa; ela continua existindo só pra esses dois pontos.
export const REGIMES = [
  { value: 'normal',  label: 'Regime Normal' },
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'mei',     label: 'MEI' },
  { value: 'isento',  label: 'Isento' },
]

export function labelRegime(regime: string): string {
  return REGIMES.find(r => r.value === regime)?.label ?? regime
}
```

- [ ] **Step 3: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui sem erros.

Run: `npm test`
Expected: os 49 testes existentes continuam passando (nenhum deles cobre os arquivos tocados neste plano, mas confirma que nada mais quebrou).

- [ ] **Step 4: Commit**

```bash
git add lib/atividades-regimes.ts
git commit -m "refactor: remove ATIVIDADES de lib/atividades-regimes.ts (sem uso após catálogo)"
```

- [ ] **Step 5: Verificação manual (rodar `npm run dev` e testar no navegador)**

Não é feita automaticamente — o controlador (ou quem executar esta task) deve rodar manualmente e reportar o resultado, não o subagente/implementador:

1. Em `/admin/configuracoes`, cadastrar pelo menos um item ativo em Grupos, Regimes e Atividades pro setor Fiscal, e um item em Regimes e Atividades pro setor Contábil (ou Pessoal).
2. Abrir um cliente existente no Fiscal cujo grupo/regime/atividade não bata com o que acabou de cadastrar — confirmar que aparece a opção "(atual)" no topo de cada select, e que os itens novos aparecem na lista.
3. Trocar pra um valor do catálogo, salvar, reabrir o cliente — confirmar que o valor persistiu.
4. Repetir os passos 2-3 num cliente do Contábil (ou Pessoal) pros campos Atividade e Regime.
5. Confirmar que os filtros de listagem do Contábil/Pessoal (Regime) e a criação de cliente novo em cada setor continuam funcionando sem erro.
