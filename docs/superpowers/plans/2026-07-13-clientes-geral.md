# Clientes Geral — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a tela `/clientes` (comum, compartilhada entre setores) com lista de clientes + cadastro/edição que atribui setores, reaproveitando os campos fiscais existentes de forma condicional.

**Architecture:** Extrai o bloco de campos específicos do Fiscal de dentro de `EmpresaModal.tsx` para um componente próprio (`CamposFiscais`), usado tanto pelo modal fiscal existente (comportamento inalterado) quanto pelo novo modal Geral (renderizado condicionalmente quando "Fiscal" está marcado nos Setores do cliente). A nova coluna `clientes.setores` é aditiva com default `'{fiscal}'`, então o fluxo de criação do Fiscal não precisa de nenhuma mudança de payload.

**Tech Stack:** Next.js 16 (App Router, Server Components), Supabase (Postgres, client-side CRUD via `@supabase/supabase-js`), TypeScript, Tailwind v4.

## Global Constraints

- **Nada de `git push`, `gh pr create`, ou merge pra `main`** — tudo fica local na branch `feat/clientes-geral` até o usuário liberar.
- Toda migration/teste roda contra o banco de dev (`fcpcorqquovvgtoukxry`, via `.env.development.local`). Nunca contra produção.
- Projeto **não tem suíte de testes automatizada** — verificação de cada task é manual no navegador (ou typecheck, quando aplicável).
- Seguir os tokens de tema já existentes (`var(--fg)`, `var(--bg-surface)`, `var(--accent)`, etc.).
- A extração de `CamposFiscais.tsx` (Task 3) é o item de maior risco de regressão do plano — o fluxo do Fiscal (`EmpresaModal.tsx`) precisa continuar funcionando exatamente como hoje depois da extração.

---

### Task 1: Migration `clientes.setores` + tipo `Cliente`

**Files:**
- Create: `supabase/migrations/005_clientes_setores.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `Cliente.setores: UserSetor[]` (novo campo na interface já existente).

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/005_clientes_setores.sql

alter table clientes add column if not exists setores user_setor[] not null default '{fiscal}';
```

- [ ] **Step 2: Aplicar no banco de dev**

Run: `cd "D:/DEV/Site Tesserato + Fiscal/portal-tesserato" && SUPABASE_ACCESS_TOKEN=sbp_9bc3c793265418cdb693c62e5231e04ea9a5aa46 npx supabase db push --password 'Tesserato@123password' --yes`

Expected: `Applying migration 005_clientes_setores.sql...` seguido de `Finished supabase db push.`, sem erro.

- [ ] **Step 3: Verificar a coluna no dev**

Run (Node, de dentro do repo, usando a service role key do dev):

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://fcpcorqquovvgtoukxry.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjcGNvcnFxdW92dmd0b3VreHJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzk1MjU4OSwiZXhwIjoyMDk5NTI4NTg5fQ.dKzBJ5VEhVmODw3JWSqC_D1zIvgyDV-UPUTvsNyDA50',
  { auth: { autoRefreshToken: false, persistSession: false } }
);
sb.from('clientes').select('id,nome,setores').limit(3).then(({ data, error }) => {
  if (error) { console.log('ERROR:', error.message); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
});
"
```

Expected: cada linha retornada mostra `"setores": ["fiscal"]`.

- [ ] **Step 4: Atualizar `lib/types.ts`**

Adicionar `setores: UserSetor[]` à interface `Cliente` (a interface já importa/usa outros tipos do arquivo; `UserSetor` já está definido no topo do mesmo arquivo desde a fundação multi-setor):

```typescript
export interface Cliente {
  id: string
  cod: string | null
  nome: string
  cnpj: string | null
  regime: string | null
  atividade: string | null
  responsavel: string | null
  contato_chat: string | null
  grupo: string | null
  obs: string | null
  prioridade: number
  mit: string | null
  municipio: string | null
  uf: string | null
  envia_iss: boolean | null
  confere_siga: boolean | null
  login_iss: string | null
  senha_iss: string | null
  email_envio_iss: string | null
  declaracao_anual: string | null
  tarefas_personalizadas: string[] | null
  setores: UserSetor[]
  created_at: string
}
```

- [ ] **Step 5: Rodar o typecheck**

Run: `npx tsc --noEmit 2>&1`
Expected: sem erros novos (o `Cliente` ganhou um campo obrigatório, mas nenhum código hoje constrói um objeto `Cliente` inteiro à mão sem vir do banco — os locais que já leem `select('*')` continuam recebendo o campo automaticamente).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/005_clientes_setores.sql lib/types.ts
git commit -m "feat: adiciona clientes.setores (multi-setor por cliente)"
```

---

### Task 2: Extrair `lib/buscar-cnpj.ts`

**Files:**
- Create: `lib/buscar-cnpj.ts`
- Modify: `components/fiscal/EmpresaModal.tsx`

**Interfaces:**
- Produces: `buscarCnpj(cnpjRaw: string): Promise<{ nome?: string; municipio?: string; uf?: string } | null>` — retorna `null` se o CNPJ não tiver 14 dígitos ou a busca falhar; retorna os campos encontrados (podem vir `undefined` individualmente) caso contrário.

- [ ] **Step 1: Criar `lib/buscar-cnpj.ts`**

```typescript
// lib/buscar-cnpj.ts

/** Busca dados de uma empresa pelo CNPJ na BrasilAPI. Retorna null se o CNPJ for inválido/incompleto ou a busca falhar. */
export async function buscarCnpj(cnpjRaw: string): Promise<{ nome?: string; municipio?: string; uf?: string } | null> {
  const digits = cnpjRaw.replace(/\D/g, '')
  if (digits.length !== 14) return null
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
    if (!res.ok) return null
    const data = await res.json()
    return {
      nome: data.razao_social || undefined,
      municipio: data.municipio || undefined,
      uf: data.uf || undefined,
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Atualizar `EmpresaModal.tsx` para usar o helper**

Substituir a função `fetchCnpj` existente (linhas 119-134 do arquivo atual) por:

```typescript
import { buscarCnpj } from '@/lib/buscar-cnpj'

// ... (dentro do componente, substitui a função fetchCnpj original)
async function fetchCnpj(raw: string) {
  setLoadingCnpj(true)
  const resultado = await buscarCnpj(raw)
  if (resultado) {
    setForm(p => ({
      ...p,
      nome: resultado.nome || p.nome,
      municipio: resultado.municipio || p.municipio,
      uf: resultado.uf || p.uf,
    }))
  }
  setLoadingCnpj(false)
}
```

Adicionar o import `import { buscarCnpj } from '@/lib/buscar-cnpj'` no topo do arquivo, junto aos demais imports.

- [ ] **Step 3: Rodar o typecheck**

Run: `npx tsc --noEmit 2>&1`
Expected: sem erros.

- [ ] **Step 4: Verificação manual — CNPJ autofill no Fiscal continua funcionando**

1. `preview_start` com a config `dev`.
2. Login como `admin.dev@tesserato.local` / `DevAdmin@123`.
3. Ir em `/fiscal/clientes`, clicar "+ Novo Cliente".
4. Digitar um CNPJ válido (14 dígitos) no campo CNPJ (ex: `11222333000181` — ou qualquer CNPJ real de teste).
5. Confirmar que "Buscando..." aparece brevemente e os campos Razão Social/Município/UF são preenchidos automaticamente (ou, se a BrasilAPI não reconhecer o CNPJ de teste, ao menos confirmar que não há erro no console e o formulário continua utilizável).

- [ ] **Step 5: Commit**

```bash
git add lib/buscar-cnpj.ts components/fiscal/EmpresaModal.tsx
git commit -m "refactor: extrai busca de CNPJ para lib/buscar-cnpj.ts"
```

---

### Task 3: Extrair `components/fiscal/CamposFiscais.tsx`

**Files:**
- Create: `components/fiscal/CamposFiscais.tsx`
- Modify: `components/fiscal/EmpresaModal.tsx`

**Interfaces:**
- Consumes: `resolverTemplate` de `@/lib/atividade-templates` (já existe, assinatura `resolverTemplate(atividade: string, templates: Record<string, string[]>): string[]`).
- Produces: `CamposFiscaisData` (tipo), `<CamposFiscais form set responsaveis templates isEdit readOnly novaTarefa setNovaTarefa addTarefa />`.

- [ ] **Step 1: Criar `components/fiscal/CamposFiscais.tsx`**

```typescript
'use client'

import { resolverTemplate } from '@/lib/atividade-templates'

const GRUPOS = [
  { value: 'normal',  label: 'Regime Normal' },
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'mei',     label: 'MEI' },
]

const ATIVIDADES = [
  'Serviço',
  'Comércio',
  'Indústria',
  'Serviço e Comércio',
  'Serviço e Indústria',
  'Comércio e Indústria',
  'Serviço, Comércio e Indústria',
]

export interface CamposFiscaisData {
  cod: string
  regime: string
  atividade: string
  grupo: string
  responsavel: string
  prioridade: number
  declaracao_anual: boolean
  envia_iss: boolean
  confere_siga: boolean
  login_iss: string
  senha_iss: string
  email_envio_iss: string
  tarefas_personalizadas: string[]
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const selectCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

interface Props {
  form: CamposFiscaisData
  set: <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void
  responsaveis: string[]
  templates: Record<string, string[]>
  isEdit: boolean
  readOnly: boolean
  novaTarefa: string
  setNovaTarefa: (v: string) => void
  addTarefa: () => void
}

export default function CamposFiscais({ form, set, responsaveis, templates, isEdit, readOnly, novaTarefa, setNovaTarefa, addTarefa }: Props) {
  return (
    <>
      {/* Código + Regime */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Código</label>
          <input className={inputCls} value={form.cod} onChange={e => set('cod', e.target.value)} placeholder="00000" disabled={readOnly} />
        </div>
        <div>
          <label className={labelCls}>Regime</label>
          <input className={inputCls} value={form.regime} onChange={e => set('regime', e.target.value)} placeholder="Ex: Isenta" disabled={readOnly} />
        </div>
      </div>

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
          {ATIVIDADES.map(a => <option key={a} value={a} className="bg-[var(--bg-surface)]">{a}</option>)}
        </select>
      </div>

      {/* Checkbox Envia ISS */}
      <div>
        <label className={`flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl border transition-all ${
          form.envia_iss ? 'border-amber-500/50 bg-amber-500/8' : 'border-[var(--fg)]/8 bg-[var(--fg)]/2'
        }`}>
          <input type="checkbox" checked={form.envia_iss} onChange={e => set('envia_iss', e.target.checked)} className="w-4 h-4 accent-amber-400" disabled={readOnly} />
          <span className={`text-xs font-bold uppercase tracking-widest ${form.envia_iss ? 'text-amber-400' : 'text-[var(--fg)]/40'}`}>
            Envia ISS?
          </span>
          {form.envia_iss && <span className="text-amber-400/70 text-xs">✓ SIM — preencha as credenciais abaixo</span>}
        </label>
      </div>

      {/* Credenciais ISS */}
      {form.envia_iss && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
          <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-widest">🔒 Credenciais ISS</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Login ISS</label>
              <input className={inputCls} value={form.login_iss} onChange={e => set('login_iss', e.target.value)} disabled={readOnly} />
            </div>
            <div>
              <label className={labelCls}>Senha ISS</label>
              <input className={inputCls} value={form.senha_iss} onChange={e => set('senha_iss', e.target.value)} disabled={readOnly} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Email Envio</label>
            <input className={inputCls} type="email" value={form.email_envio_iss} onChange={e => set('email_envio_iss', e.target.value)} disabled={readOnly} />
          </div>
        </div>
      )}

      {/* Checkbox Confere SIGA */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 transition-all">
          <input type="checkbox" checked={form.confere_siga} onChange={e => set('confere_siga', e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" disabled={readOnly} />
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--fg)]/40">Confere SIGA?</span>
        </label>
      </div>

      {/* Grupo + Responsável */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Grupo</label>
          <select className={selectCls} value={form.grupo} onChange={e => set('grupo', e.target.value)} disabled={readOnly}>
            <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
            {GRUPOS.map(g => <option key={g.value} value={g.value} className="bg-[var(--bg-surface)]">{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Responsável</label>
          <select className={selectCls} value={form.responsavel} onChange={e => set('responsavel', e.target.value)} disabled={readOnly}>
            <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
            {responsaveis.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
          </select>
        </div>
      </div>

      {/* Prioridade */}
      <div>
        <label className={labelCls}>Prioridade (0–5)</label>
        <input className={inputCls} type="number" min={0} max={5} value={form.prioridade}
          onChange={e => set('prioridade', Number(e.target.value))} disabled={readOnly} />
      </div>

      {/* Declaração Anual */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2">
          <input type="checkbox" checked={form.declaracao_anual} onChange={e => set('declaracao_anual', e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" disabled={readOnly} />
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--fg)]/40">Declaração Anual</span>
        </label>
      </div>

      {/* Tarefas */}
      <div className="rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-4">
        <div className="flex items-center justify-between mb-3">
          <label className={labelCls + ' mb-0'}>
            Tarefas ({form.tarefas_personalizadas.length})
          </label>
          {!readOnly && !isEdit && form.atividade && (
            <button type="button"
              onClick={() => set('tarefas_personalizadas', resolverTemplate(form.atividade, templates))}
              className="text-xs text-[var(--fg)]/30 hover:text-[var(--fg)]/60 transition-colors border border-[var(--fg)]/10 px-2 py-1 rounded-lg">
              Restaurar padrão da atividade
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
          {form.tarefas_personalizadas.length === 0 && (
            <p className="text-[var(--fg)]/20 text-xs">
              {form.atividade ? 'Selecione a atividade acima para pré-preencher as tarefas padrão.' : 'Nenhuma tarefa adicionada.'}
            </p>
          )}
          {form.tarefas_personalizadas.map((t, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--fg)] px-2.5 py-1 rounded-lg">
              {t}
              {!readOnly && (
                <button type="button"
                  onClick={() => set('tarefas_personalizadas', form.tarefas_personalizadas.filter((_, idx) => idx !== i))}
                  className="text-[var(--fg)]/40 hover:text-red-400 transition-colors font-bold">×</button>
              )}
            </span>
          ))}
        </div>

        {!readOnly && (
          <div className="flex gap-2">
            <input value={novaTarefa} onChange={e => setNovaTarefa(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefa())}
              placeholder="Digitar nome da tarefa e pressionar Enter..."
              className={inputCls + ' flex-1 text-xs'} />
            <button type="button" onClick={addTarefa}
              className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 text-xs font-semibold transition-colors whitespace-nowrap">
              + Adicionar
            </button>
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Atualizar `EmpresaModal.tsx` para usar `CamposFiscais`**

No corpo do JSX (dentro do `<div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">`, depois do bloco "Razão Social" e antes do fechamento `</>`), substituir TODOS os blocos abaixo por um único `<CamposFiscais>`:

- "Código + CNPJ" → mantém só o CNPJ inline em `EmpresaModal` (Código sai pro `CamposFiscais`); ver reorganização abaixo.
- "Regime + Atividade" → sai inteiro.
- "Checkbox Envia ISS" → sai inteiro.
- "Credenciais ISS" → sai inteiro.
- "Checkbox Confere SIGA" → sai inteiro.
- "Grupo + Município" → Município fica em `EmpresaModal` (campo base), Grupo sai pro `CamposFiscais`.
- "UF + Responsável" → UF fica em `EmpresaModal`, Responsável sai pro `CamposFiscais`.
- "Contato Chat + Prioridade" → Contato Chat fica em `EmpresaModal`, Prioridade sai pro `CamposFiscais`.
- "Declaração Anual" → sai inteiro.
- "Tarefas" → sai inteiro.

O JSX de `EmpresaModal.tsx` (dentro do bloco `loading ? (...) : (<>...</>)`) fica:

```tsx
{/* CNPJ */}
<div>
  <label className={labelCls}>CNPJ {loadingCnpj && <span className="text-[var(--accent)] normal-case tracking-normal">Buscando...</span>}</label>
  <input className={inputCls + ' font-mono'} value={form.cnpj}
    onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }}
    placeholder="00.000.000/0000-00" disabled={readOnly} />
</div>

{/* Razão Social */}
<div>
  <label className={labelCls}>Razão Social *</label>
  <input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} required disabled={readOnly} />
</div>

{/* Município + UF */}
<div className="grid grid-cols-2 gap-4">
  <div>
    <label className={labelCls}>Município</label>
    <input className={inputCls} value={form.municipio} onChange={e => set('municipio', e.target.value)} disabled={readOnly} />
  </div>
  <div>
    <label className={labelCls}>UF</label>
    <input className={inputCls + ' uppercase'} value={form.uf}
      onChange={e => set('uf', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} disabled={readOnly} />
  </div>
</div>

{/* Contato Chat */}
<div>
  <label className={labelCls}>Contato Chat</label>
  <input className={inputCls} value={form.contato_chat}
    onChange={e => set('contato_chat', e.target.value)} disabled={readOnly} />
</div>

<CamposFiscais
  form={form}
  set={set}
  responsaveis={responsaveis}
  templates={templates}
  isEdit={isEdit}
  readOnly={readOnly}
  novaTarefa={novaTarefa}
  setNovaTarefa={setNovaTarefa}
  addTarefa={addTarefa}
/>
```

Adicionar o import no topo do arquivo: `import CamposFiscais from './CamposFiscais'`.

Manter em `EmpresaModal.tsx`, sem alteração: a interface `FormData` completa (ela já contém todos os campos, tanto os que ficaram no `EmpresaModal` quanto os que foram pro `CamposFiscais` — não precisa mudar, já que `set`/`form` são passados como estão para `CamposFiscais`, que só usa o subconjunto de chaves de `CamposFiscaisData`), `emptyForm`, o `useEffect` de carregamento, `handleSave`, `addTarefa`, `novaTarefa`/`setNovaTarefa`, e o header/footer do modal.

- [ ] **Step 3: Rodar o typecheck**

Run: `npx tsc --noEmit 2>&1`
Expected: sem erros. Se houver erro de tipo em `set={set}` (porque `EmpresaModal`'s `set` é genérico sobre `FormData` inteiro, mais amplo que `CamposFiscaisData`), confirmar que a assinatura de `set` em `EmpresaModal.tsx` continua exatamente `function set<K extends keyof FormData>(k: K, v: FormData[K])` — isso é estruturalmente compatível com o tipo esperado por `CamposFiscaisProps.set` porque todo `K extends keyof CamposFiscaisData` também é `keyof FormData` (já que `CamposFiscaisData`'s campos são um subconjunto exato dos campos de `FormData`).

- [ ] **Step 4: Verificação manual — regressão completa do fluxo Fiscal**

1. Com o dev server rodando, logado como admin, ir em `/fiscal/clientes`.
2. Clicar "+ Novo Cliente", preencher Razão Social, CNPJ, Município, UF, Contato Chat (campos que ficaram em `EmpresaModal`).
3. Selecionar uma Atividade (ex: "Comércio") e confirmar que as Tarefas são pré-preenchidas automaticamente pelo template (campo que foi pro `CamposFiscais`, testando a integração entre os dois componentes).
4. Marcar "Envia ISS?" e confirmar que os campos de credencial aparecem.
5. Salvar o cliente novo — confirmar que ele aparece na listagem do Fiscal com os dados corretos.
6. Abrir esse cliente recém-criado pra edição, confirmar que todos os campos (base + fiscal) carregam corretamente.
7. Editar um campo de cada bloco (ex: mudar Prioridade e mudar Município), salvar, confirmar persistência.

- [ ] **Step 5: Commit**

```bash
git add components/fiscal/CamposFiscais.tsx components/fiscal/EmpresaModal.tsx
git commit -m "refactor: extrai CamposFiscais de EmpresaModal para reaproveitamento"
```

---

### Task 4: `components/geral/ClienteGeralModal.tsx`

**Files:**
- Create: `components/geral/ClienteGeralModal.tsx`

**Interfaces:**
- Consumes: `CamposFiscaisData`, `CamposFiscais` de `@/components/fiscal/CamposFiscais`; `buscarCnpj` de `@/lib/buscar-cnpj`; `SETORES`, `SETOR_LABEL`, `type UserSetor`, `type Cliente` de `@/lib/types`; `createClient` de `@/lib/supabase/client`.
- Produces: `<ClienteGeralModal clienteId responsaveis templates onClose readOnly />` (mesma assinatura de props que `EmpresaModal`, mais `responsaveis`/`templates` — `clienteId: string | null` sendo `null` para criação).

- [ ] **Step 1: Criar `components/geral/ClienteGeralModal.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import CamposFiscais, { type CamposFiscaisData } from '@/components/fiscal/CamposFiscais'
import { SETORES, SETOR_LABEL, type UserSetor } from '@/lib/types'

interface FormData extends CamposFiscaisData {
  nome: string
  cnpj: string
  municipio: string
  uf: string
  contato_chat: string
  setores: UserSetor[]
}

interface Props {
  clienteId: string | null
  responsaveis: string[]
  templates: Record<string, string[]>
  onClose: () => void
  readOnly?: boolean
}

const emptyForm = (): FormData => ({
  nome: '', cnpj: '', municipio: '', uf: '', contato_chat: '', setores: ['fiscal'],
  cod: '', regime: '', atividade: '', grupo: '', responsavel: '', prioridade: 3,
  declaracao_anual: false, envia_iss: false, confere_siga: false,
  login_iss: '', senha_iss: '', email_envio_iss: '',
  tarefas_personalizadas: [],
})

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function ClienteGeralModal({ clienteId, responsaveis, templates, onClose, readOnly = false }: Props) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = !!clienteId

  const [form, setForm] = useState<FormData>(emptyForm())
  const [novaTarefa, setNovaTarefa] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!clienteId) return
    sb.from('clientes').select('*').eq('id', clienteId).single().then(({ data }) => {
      if (!data) return
      const mitParts = (data.mit ?? '').split('/')
      setForm({
        nome: data.nome ?? '',
        cnpj: data.cnpj ?? '',
        municipio: data.municipio ?? mitParts[0] ?? '',
        uf: data.uf ?? mitParts[1] ?? '',
        contato_chat: data.contato_chat ?? '',
        setores: (data.setores ?? ['fiscal']) as UserSetor[],
        cod: data.cod ?? '',
        regime: data.regime ?? '',
        atividade: data.atividade ?? '',
        grupo: data.grupo ?? '',
        responsavel: data.responsavel ?? '',
        prioridade: data.prioridade ?? 3,
        declaracao_anual: data.declaracao_anual ?? false,
        envia_iss: data.envia_iss ?? false,
        confere_siga: data.confere_siga ?? false,
        login_iss: data.login_iss ?? '',
        senha_iss: data.senha_iss ?? '',
        email_envio_iss: data.email_envio_iss ?? '',
        tarefas_personalizadas: data.tarefas_personalizadas ?? [],
      })
      setLoading(false)
    })
  }, [clienteId])

  async function fetchCnpj(raw: string) {
    setLoadingCnpj(true)
    const resultado = await buscarCnpj(raw)
    if (resultado) {
      setForm(p => ({
        ...p,
        nome: resultado.nome || p.nome,
        municipio: resultado.municipio || p.municipio,
        uf: resultado.uf || p.uf,
      }))
    }
    setLoadingCnpj(false)
  }

  function set<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function toggleSetor(setor: UserSetor) {
    setForm(p => ({
      ...p,
      setores: p.setores.includes(setor) ? p.setores.filter(s => s !== setor) : [...p.setores, setor],
    }))
  }

  function addTarefa() {
    const t = novaTarefa.trim()
    if (!t) return
    set('tarefas_personalizadas', [...form.tarefas_personalizadas, t])
    setNovaTarefa('')
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    setErro(null)

    const payload = {
      nome:                   form.nome,
      cnpj:                   form.cnpj || null,
      municipio:              form.municipio || null,
      uf:                     form.uf || null,
      contato_chat:           form.contato_chat || null,
      setores:                form.setores.length > 0 ? form.setores : ['fiscal'],
      cod:                    form.cod || null,
      regime:                 form.regime || null,
      atividade:              form.atividade || null,
      grupo:                  form.grupo || null,
      responsavel:            form.responsavel || null,
      prioridade:             form.prioridade,
      declaracao_anual:       form.declaracao_anual,
      envia_iss:              form.envia_iss,
      confere_siga:           form.confere_siga,
      login_iss:              form.envia_iss ? form.login_iss || null : null,
      senha_iss:              form.envia_iss ? form.senha_iss || null : null,
      email_envio_iss:        form.envia_iss ? form.email_envio_iss || null : null,
      tarefas_personalizadas: form.tarefas_personalizadas,
    }

    const { error } = isEdit
      ? await sb.from('clientes').update(payload).eq('id', clienteId)
      : await sb.from('clientes').insert(payload)

    setSaving(false)
    if (error) {
      setErro(error.message)
      return
    }
    router.refresh()
    onClose()
  }

  const mostraFiscal = form.setores.includes('fiscal')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">{readOnly ? 'Visualizar Cliente' : isEdit ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-[var(--fg)]/30 text-sm text-center py-8">Carregando...</p>
          ) : (<>

            <div>
              <label className={labelCls}>CNPJ {loadingCnpj && <span className="text-[var(--accent)] normal-case tracking-normal">Buscando...</span>}</label>
              <input className={inputCls + ' font-mono'} value={form.cnpj}
                onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }}
                placeholder="00.000.000/0000-00" disabled={readOnly} />
            </div>

            <div>
              <label className={labelCls}>Razão Social *</label>
              <input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} required disabled={readOnly} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Município</label>
                <input className={inputCls} value={form.municipio} onChange={e => set('municipio', e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <label className={labelCls}>UF</label>
                <input className={inputCls + ' uppercase'} value={form.uf}
                  onChange={e => set('uf', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} disabled={readOnly} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Contato</label>
              <input className={inputCls} value={form.contato_chat} onChange={e => set('contato_chat', e.target.value)} disabled={readOnly} />
            </div>

            <div>
              <label className={labelCls}>Setores</label>
              <div className="grid grid-cols-2 gap-2">
                {SETORES.map(setor => (
                  <label key={setor} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={form.setores.includes(setor)} onChange={() => toggleSetor(setor)}
                      className="w-3.5 h-3.5 accent-[var(--accent)]" disabled={readOnly} />
                    <span className="text-[var(--fg)]/60 text-xs">{SETOR_LABEL[setor]}</span>
                  </label>
                ))}
              </div>
            </div>

            {mostraFiscal && (
              <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/3 p-4 space-y-5">
                <p className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest">Dados do Fiscal</p>
                <CamposFiscais
                  form={form}
                  set={set}
                  responsaveis={responsaveis}
                  templates={templates}
                  isEdit={isEdit}
                  readOnly={readOnly}
                  novaTarefa={novaTarefa}
                  setNovaTarefa={setNovaTarefa}
                  addTarefa={addTarefa}
                />
              </div>
            )}

          </>)}
        </div>

        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          {readOnly ? (
            <button onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-sm transition-colors">
              Fechar
            </button>
          ) : (<>
            <button onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !form.nome.trim()}
              className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar cliente'}
            </button>
          </>)}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `npx tsc --noEmit 2>&1`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/geral/ClienteGeralModal.tsx
git commit -m "feat: adiciona ClienteGeralModal (criar/editar cliente com setores)"
```

---

### Task 5: Lista `/clientes` + integração na Sidebar

**Files:**
- Create: `app/(comum)/clientes/page.tsx`
- Create: `components/geral/ClientesGeralLista.tsx`
- Modify: `components/fiscal/Sidebar.tsx`

**Interfaces:**
- Consumes: `ClienteGeralModal` (Task 4). O layout `app/(comum)/layout.tsx` (já existe, fundação multi-setor) já cuida de auth/shell pra qualquer página dentro do route group — `page.tsx` só busca os dados que precisa, mesmo padrão de `app/(comum)/intranet/page.tsx` e `app/(comum)/ferramentas/page.tsx` já existentes.
- Produces: rota `/clientes` funcional; item "Clientes" na seção Comum da Sidebar.

- [ ] **Step 1: Criar `app/(comum)/clientes/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientesGeralLista from '@/components/geral/ClientesGeralLista'

export const metadata = { title: 'Clientes — Tesserato' }

export default async function ClientesGeralPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: clientes }, { data: atividadeTemplates }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('clientes').select('*').order('nome'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])

  const isAdmin = profile?.role === 'admin'

  const responsaveis = Array.from(new Set(
    (clientes ?? []).map(c => c.responsavel ?? '').filter(Boolean)
  )).sort()

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <ClientesGeralLista
        clientes={clientes ?? []}
        isAdmin={isAdmin}
        responsaveis={responsaveis}
        templates={templatesMap}
      />
    </div>
  )
}
```

- [ ] **Step 2: Criar `components/geral/ClientesGeralLista.tsx`**

```typescript
'use client'

import { useState, useMemo } from 'react'
import type { Cliente } from '@/lib/types'
import ClienteGeralModal from './ClienteGeralModal'

interface Props {
  clientes: Cliente[]
  isAdmin: boolean
  responsaveis: string[]
  templates: Record<string, string[]>
}

export default function ClientesGeralLista({ clientes, isAdmin, responsaveis, templates }: Props) {
  const [busca, setBusca] = useState('')
  const [modalNovoOpen, setModalNovoOpen] = useState(false)
  const [clienteAbertoId, setClienteAbertoId] = useState<string | null>(null)

  const filtrados = useMemo(() => clientes.filter(c => {
    if (!busca) return true
    const q = busca.toLowerCase()
    return c.nome.toLowerCase().includes(q) || (c.cnpj ?? '').includes(q)
  }), [clientes, busca])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Clientes</h1>
        {isAdmin && (
          <button
            onClick={() => setModalNovoOpen(true)}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap">
            + Novo Cliente
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="Buscar por nome ou CNPJ..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
        className="w-full mb-4 px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
      />

      <div className="overflow-x-auto rounded-xl border border-[var(--fg)]/12">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--fg)]/12">
              {['Razão Social', 'CNPJ', 'Endereço'].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map(c => (
              <tr key={c.id} onClick={() => setClienteAbertoId(c.id)}
                className="border-b border-[var(--fg)]/8 hover:bg-[var(--fg)]/6 cursor-pointer transition-colors">
                <td className="px-4 py-3 text-[var(--fg)] text-sm font-medium">{c.nome}</td>
                <td className="px-4 py-3 text-[var(--fg)]/50 text-xs font-mono">{c.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--fg)]/60 text-xs">
                  {[c.municipio, c.uf].filter(Boolean).join('/') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <p className="text-center text-[var(--fg)]/30 py-12 text-sm">Nenhum cliente encontrado.</p>
        )}
      </div>

      {modalNovoOpen && (
        <ClienteGeralModal
          clienteId={null}
          responsaveis={responsaveis}
          templates={templates}
          onClose={() => setModalNovoOpen(false)}
        />
      )}

      {clienteAbertoId && (
        <ClienteGeralModal
          clienteId={clienteAbertoId}
          responsaveis={responsaveis}
          templates={templates}
          readOnly={!isAdmin}
          onClose={() => setClienteAbertoId(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Adicionar "Clientes" na seção Comum da Sidebar**

Em `components/fiscal/Sidebar.tsx`, localizar a constante `ITENS_COMUNS` (hoje com Intranet e Ferramentas) e adicionar o item Clientes:

```typescript
const ITENS_COMUNS: NavItem[] = [
  { href: '/intranet',   label: 'Intranet',   icon: Zap   },
  { href: '/clientes',   label: 'Clientes',   icon: Users },
  { href: '/ferramentas', label: 'Ferramentas', icon: Wrench },
]
```

`Users` já está importado no topo do arquivo (usado antes no item "Clientes" da seção Fiscal) — não precisa adicionar import novo.

- [ ] **Step 4: Rodar o typecheck**

Run: `npx tsc --noEmit 2>&1`
Expected: sem erros.

- [ ] **Step 5: Verificação manual completa**

1. `preview_start` com a config `dev`, logado como `admin.dev@tesserato.local`.
2. Navegar pra `/clientes` (direto na URL, ou clicando "Clientes" na seção Comum da Sidebar — deve aparecer entre Intranet e Ferramentas).
3. Confirmar que a lista mostra "Empresa Teste Dev LTDA" (o cliente de teste já existente) com Razão Social/CNPJ/Endereço corretos.
4. Buscar por parte do nome ou do CNPJ, confirmar que filtra.
5. Clicar "+ Novo Cliente", criar um cliente marcando só "Societário" (nenhum outro setor) — confirmar que NENHUM campo fiscal aparece no formulário, salvar, confirmar que aparece na lista.
6. Criar outro cliente marcando "Fiscal" — confirmar que o bloco "Dados do Fiscal" aparece (Código, Regime, Atividade, Grupo, Responsável, Envia ISS, Confere SIGA, Declaração Anual, Prioridade, Tarefas), preencher Atividade e confirmar que Tarefas são pré-preenchidas, salvar.
7. Confirmar que esse cliente com Fiscal marcado também aparece em `/fiscal/clientes` (mesma tabela).
8. Abrir o cliente "Empresa Teste Dev LTDA" (que já tem `setores = {fiscal}` por default) pela tela Geral, adicionar o setor "Pessoal" também, salvar — reabrir e confirmar que os dois setores estão marcados e os dados fiscais continuam intactos.
9. Deslogar, logar como `mono-fiscal.dev@tesserato.local` (não-admin) — navegar pra `/clientes`, confirmar que a lista aparece mas SEM o botão "+ Novo Cliente", e que clicar numa linha abre o modal em modo somente-leitura (campos desabilitados, botão só "Fechar").

- [ ] **Step 6: Commit**

```bash
git add app/\(comum\)/clientes components/geral/ClientesGeralLista.tsx components/fiscal/Sidebar.tsx
git commit -m "feat: tela Clientes Geral (/clientes) com criacao e atribuicao de setores"
```

---

### Task 6: Verificação final (checklist do spec)

**Files:** nenhum arquivo novo — só roteiro de verificação, consolidando o que o spec pede.

- [ ] **Step 1: Rodar o checklist completo do spec**

Reconfirmar cada item da seção "Testes e verificação" do spec (`docs/superpowers/specs/2026-07-13-clientes-geral-design.md`) — a maioria já foi exercitada nas Tasks 2, 3 e 5:

1. Cliente novo só com setor sem padrão (ex: Societário) → sem campo fiscal. ✅ (Task 5, Step 5.5)
2. Cliente novo com Fiscal marcado → bloco fiscal aparece, tarefas por template funcionam. ✅ (Task 5, Step 5.6)
3. Cliente com Fiscal aparece também em `/fiscal/clientes`. ✅ (Task 5, Step 5.7)
4. Editar cliente Fiscal-only pela tela Geral, adicionar outro setor, dados fiscais preservados. ✅ (Task 5, Step 5.8)
5. Desmarcar Fiscal de um cliente com dados fiscais, remarcar depois, confirmar que os dados reaparecem intactos — **ainda não testado, fazer agora**: abrir o cliente criado no Step 5.6 (com Fiscal), desmarcar "Fiscal", salvar (bloco fiscal desaparece do formulário mas o registro no banco continua com os campos antigos), reabrir, marcar "Fiscal" de novo — confirmar que Regime/Atividade/Tarefas voltam exatamente como estavam.
6. Busca por nome/CNPJ filtra corretamente. ✅ (Task 5, Step 5.4)
7. `EmpresaModal.tsx` (Fiscal) continua funcionando exatamente como antes. ✅ (Task 3, Step 4)

- [ ] **Step 2: Typecheck final do projeto inteiro**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Reportar ao usuário**

Resumir quais dos 7 itens passaram, com qualquer observação divergente. Não fazer push nem abrir PR — branch fica local aguardando decisão do usuário, conforme os Global Constraints deste plano.
