# Seção de Parcelamento Customizável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir criar, renomear e remover a "Seção" de um parcelamento (hoje uma lista fixa de 5 opções hard-coded), com as mudanças persistindo pra uso em parcelamentos futuros.

**Architecture:** A lista fixa `SECOES` vira uma tabela `parcelamento_secoes` (semeada com as 5 seções atuais). O select de Seção no formulário de parcelamento passa a carregar dessa tabela e ganha uma opção "+ Criar nova seção..." que revela um campo de texto inline. Um link "Gerenciar seções" abre um modal separado (`GerenciarSecoesModal`) com editar/remover por linha. Renomear atualiza tanto o catálogo quanto todo `parcelamentos.secao` que usava o nome antigo (não é uma FK — `secao` é texto livre em `parcelamentos`, então o update é feito manualmente na mesma server action). Remover é bloqueado se algum parcelamento ainda usa a seção.

**Tech Stack:** Next.js (App Router) + TypeScript + Supabase (Postgres/PostgREST) + Tailwind. Sem framework de testes automatizados neste repo — verificação via `npx tsc --noEmit` + testes manuais no navegador (dev Supabase, projeto `fcpcorqquovvgtoukxry`).

## Global Constraints

- Migration SQL deve ser aplicada manualmente no SQL Editor do Supabase dev antes da verificação manual, e depois em produção manualmente também — não há acesso a token do CLI nesta sessão.
- Nome de seção é sempre normalizado com `.trim().toUpperCase()` antes de salvar, tanto na criação quanto na renomeação (spec: seções 2 e 3).
- Criar seção com nome já existente (após normalização) é sucesso silencioso — não mostra erro, só seleciona a seção existente (spec: seção 2, mesmo padrão de `criarTipoTarefa` em `lib/tarefa-tipos-actions.ts`).
- Renomear pra um nome que já existe (após normalização, numa seção diferente) é bloqueado com erro visível no modal — não funde seções (spec: seção 3).
- Remover uma seção com 1+ parcelamento usando ela é bloqueado, mostrando a contagem (spec: seção 3).
- Renomear atualiza tanto `parcelamento_secoes.nome` quanto todo `parcelamentos.secao` que tinha o nome antigo, na mesma operação (spec: seção 3).
- Sem checagem de `role`/admin em nenhuma das 3 operações — qualquer usuário que já pode cadastrar parcelamento pode criar/editar/remover seção (spec: seções 2 e 3).
- Próximo número de migration disponível é `021` — já existem dois arquivos `019_*.sql` neste repo (`019_admin_section_auth.sql` e `019_parcelamento_status_e_datas.sql`, de branches diferentes mergeadas em paralelo) e um `020_clientes_ativo.sql`; não renumerar os existentes, só seguir a partir de `021`.

---

## File Structure

- Create: `supabase/migrations/021_parcelamento_secoes_catalogo.sql` — cria a tabela `parcelamento_secoes` e semeia as 5 seções atuais.
- Create: `lib/parcelamento-secoes-actions.ts` — 3 server actions: criar, renomear, remover.
- Create: `components/fiscal/GerenciarSecoesModal.tsx` — modal de listar/editar/remover seções.
- Modify: `app/fiscal/parcelamentos/page.tsx` — remove a constante `SECOES`, busca a lista do banco, adiciona a opção "+ Criar nova seção..." no select e o link "Gerenciar seções".

---

### Task 1: Migration + server actions do catálogo de seções

**Files:**
- Create: `supabase/migrations/021_parcelamento_secoes_catalogo.sql`
- Create: `lib/parcelamento-secoes-actions.ts`

**Interfaces:**
- Produces: tabela `parcelamento_secoes` (`id uuid`, `nome text unique`, `created_at timestamptz`), consumida pelas Tasks 2 e 3.
- Produces: `criarSecaoParcelamento(nome: string): Promise<{ error: string | null }>`, `renomearSecaoParcelamento(id: string, nomeAntigo: string, nomeNovo: string): Promise<{ error: string | null }>`, `removerSecaoParcelamento(id: string, nome: string): Promise<{ error: string | null }>`, todas exportadas de `lib/parcelamento-secoes-actions.ts`, consumidas pelas Tasks 2 e 3.

- [ ] **Step 1: Criar a migration**

Criar `supabase/migrations/021_parcelamento_secoes_catalogo.sql`:

```sql
-- supabase/migrations/021_parcelamento_secoes_catalogo.sql

-- Cria o catálogo de seções de parcelamento, que até aqui era uma lista
-- fixa hard-coded (SECOES) em app/fiscal/parcelamentos/page.tsx. Semeia as
-- 5 seções que já existiam, na mesma ordem, pra não mudar nada pra quem
-- já usa o sistema — daí em diante o usuário pode criar, renomear e
-- remover seções pelo próprio formulário de parcelamento (spec
-- 2026-08-07).
create table if not exists parcelamento_secoes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  created_at timestamptz not null default now()
);

insert into parcelamento_secoes (nome) values
  ('RECEITA FEDERAL - ECAC'),
  ('PGFN - ECAC'),
  ('SEFAZ - PARCELAMENTO MULTA AUTONOMA'),
  ('SEFAZ - PARCELAMENTOS'),
  ('FGTS DIGITAL')
on conflict (nome) do nothing;
```

- [ ] **Step 2: Criar as server actions**

Criar `lib/parcelamento-secoes-actions.ts`:

```ts
'use server'

import { getAuthenticatedAdmin } from './supabase/server'

// Apesar do nome, getAuthenticatedAdmin só devolve um client autenticado
// (com service role quando disponível) — não é uma checagem de role admin.
// Mesmo padrão de lib/tarefa-tipos-actions.ts: qualquer usuário autenticado
// pode chamar essas actions.

export async function criarSecaoParcelamento(nome: string): Promise<{ error: string | null }> {
  const nomeNormalizado = nome.trim().toUpperCase()
  if (!nomeNormalizado) return { error: 'Nome não pode ser vazio.' }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase.from('parcelamento_secoes').insert({ nome: nomeNormalizado })

  if (error) {
    // unique(nome): outra pessoa criou essa seção nesse meio tempo —
    // tratado como sucesso, é exatamente o resultado que queríamos.
    if (error.code === '23505') return { error: null }
    return { error: error.message }
  }

  return { error: null }
}

export async function renomearSecaoParcelamento(
  id: string,
  nomeAntigo: string,
  nomeNovo: string,
): Promise<{ error: string | null }> {
  const nomeNormalizado = nomeNovo.trim().toUpperCase()
  if (!nomeNormalizado) return { error: 'Nome não pode ser vazio.' }
  if (nomeNormalizado === nomeAntigo) return { error: null }

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase
    .from('parcelamento_secoes')
    .update({ nome: nomeNormalizado })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return { error: 'Já existe uma seção com esse nome.' }
    return { error: error.message }
  }

  // secao em parcelamentos é texto livre, não uma FK pra
  // parcelamento_secoes — precisa atualizar manualmente aqui pra nenhum
  // parcelamento existente ficar com um nome de seção que não existe mais
  // no catálogo.
  await supabase.from('parcelamentos').update({ secao: nomeNormalizado }).eq('secao', nomeAntigo)

  return { error: null }
}

export async function removerSecaoParcelamento(id: string, nome: string): Promise<{ error: string | null }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { count } = await supabase
    .from('parcelamentos')
    .select('id', { count: 'exact', head: true })
    .eq('secao', nome)

  if (count && count > 0) {
    return { error: `Não é possível remover: ${count} parcelamento${count !== 1 ? 's' : ''} usa${count !== 1 ? 'm' : ''} essa seção.` }
  }

  const { error } = await supabase.from('parcelamento_secoes').delete().eq('id', id)
  if (error) return { error: error.message }

  return { error: null }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (o arquivo ainda não é importado em lugar nenhum).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/021_parcelamento_secoes_catalogo.sql lib/parcelamento-secoes-actions.ts
git commit -m "feat: catalogo de secoes de parcelamento (criar/renomear/remover)"
```

---

### Task 2: Modal "Gerenciar seções"

**Files:**
- Create: `components/fiscal/GerenciarSecoesModal.tsx`

**Interfaces:**
- Consumes: `renomearSecaoParcelamento(id, nomeAntigo, nomeNovo)` e `removerSecaoParcelamento(id, nome)` de `lib/parcelamento-secoes-actions.ts` (Task 1).
- Produces: componente `GerenciarSecoesModal` com props `{ secoes: { id: string; nome: string }[]; onClose: () => void; onChanged: () => void }`, consumido pela Task 3. `onChanged` é chamado depois de qualquer renomeação/remoção bem-sucedida, pro componente pai recarregar sua própria lista de seções e de parcelamentos.

- [ ] **Step 1: Criar o componente**

Criar `components/fiscal/GerenciarSecoesModal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { renomearSecaoParcelamento, removerSecaoParcelamento } from '@/lib/parcelamento-secoes-actions'

interface SecaoParcelamento {
  id: string
  nome: string
}

interface Props {
  secoes: SecaoParcelamento[]
  onClose: () => void
  onChanged: () => void
}

export default function GerenciarSecoesModal({ secoes, onClose, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function startEdit(s: SecaoParcelamento) {
    setEditingId(s.id)
    setEditValue(s.nome)
    setErro(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValue('')
    setErro(null)
  }

  async function salvarEdicao(s: SecaoParcelamento) {
    setErro(null)
    setBusyId(s.id)
    try {
      const { error } = await renomearSecaoParcelamento(s.id, s.nome, editValue)
      if (error) { setErro(error); return }
      setEditingId(null)
      setEditValue('')
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  async function remover(s: SecaoParcelamento) {
    if (!confirm(`Remover a seção "${s.nome}"?`)) return
    setErro(null)
    setBusyId(s.id)
    try {
      const { error } = await removerSecaoParcelamento(s.id, s.nome)
      if (error) { setErro(error); return }
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Gerenciar seções</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-2">
          {erro && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-2">
              ⚠ {erro}
            </div>
          )}

          {secoes.map(s => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2">
              {editingId === s.id ? (
                <>
                  <input
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    autoFocus
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--accent)]/50 text-[var(--fg)] text-sm focus:outline-none"
                  />
                  <button onClick={() => salvarEdicao(s)} disabled={busyId === s.id || !editValue.trim()}
                    className="text-xs font-semibold text-[var(--accent)] hover:opacity-80 disabled:opacity-40 transition-opacity px-2 py-1">
                    Salvar
                  </button>
                  <button onClick={cancelEdit} disabled={busyId === s.id}
                    className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)] transition-colors px-2 py-1">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-[var(--fg)]">{s.nome}</span>
                  <button onClick={() => startEdit(s)} disabled={busyId !== null}
                    className="text-xs font-semibold text-[var(--fg)]/50 hover:text-[var(--fg)] transition-colors px-2 py-1">
                    Editar
                  </button>
                  <button onClick={() => remover(s)} disabled={busyId !== null}
                    className="text-xs font-semibold text-[var(--fg)]/50 hover:text-red-400 transition-colors px-2 py-1">
                    {busyId === s.id ? '...' : 'Remover'}
                  </button>
                </>
              )}
            </div>
          ))}

          {secoes.length === 0 && (
            <p className="text-center text-[var(--fg)]/20 text-sm py-8">Nenhuma seção cadastrada.</p>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (componente ainda não é importado em lugar nenhum).

- [ ] **Step 3: Commit**

```bash
git add components/fiscal/GerenciarSecoesModal.tsx
git commit -m "feat: modal de gerenciar secoes de parcelamento"
```

---

### Task 3: Integrar tudo em `app/fiscal/parcelamentos/page.tsx`

**Files:**
- Modify: `app/fiscal/parcelamentos/page.tsx`

**Interfaces:**
- Consumes: `criarSecaoParcelamento` de `lib/parcelamento-secoes-actions.ts` (Task 1).
- Consumes: `GerenciarSecoesModal` de `components/fiscal/GerenciarSecoesModal.tsx` (Task 2), com as props `{ secoes, onClose, onChanged }` definidas ali.

- [ ] **Step 1: Remover a constante `SECOES` e adicionar imports/tipo**

Remover o bloco (linhas 9-15 do arquivo atual):

```ts
const SECOES = [
  'RECEITA FEDERAL - ECAC',
  'PGFN - ECAC',
  'SEFAZ - PARCELAMENTO MULTA AUTONOMA',
  'SEFAZ - PARCELAMENTOS',
  'FGTS DIGITAL',
]
```

Adicionar, logo abaixo do import de `StatusParcelamento` (linha 7 do arquivo atual):

```ts
import { criarSecaoParcelamento } from '@/lib/parcelamento-secoes-actions'
import GerenciarSecoesModal from '@/components/fiscal/GerenciarSecoesModal'

interface SecaoParcelamento {
  id: string
  nome: string
}
```

- [ ] **Step 2: Ajustar `EMPTY_FORM`**

Trocar (linhas 38-43 do arquivo atual):

```ts
const EMPTY_FORM: Omit<Parcelamento, 'id'> = {
  secao: SECOES[0], empresa: '', empresa_avulsa: false, cnpj: '', regime: '', responsavel: '',
  local_tipo: '', status: 'EM ANDAMENTO', tarefa: '', senhas: '',
  jan: null, fev: null, mar: null, abr: null, mai: null, jun: null,
  jul: null, ago: null, set: null, out: null, nov: null, dez: null,
}
```

por:

```ts
const EMPTY_FORM: Omit<Parcelamento, 'id'> = {
  secao: '', empresa: '', empresa_avulsa: false, cnpj: '', regime: '', responsavel: '',
  local_tipo: '', status: 'EM ANDAMENTO', tarefa: '', senhas: '',
  jan: null, fev: null, mar: null, abr: null, mai: null, jun: null,
  jul: null, ago: null, set: null, out: null, nov: null, dez: null,
}
```

(`secao` não pode mais vir de uma constante estática — as seções só existem depois de buscadas do banco, então o valor padrão é preenchido dinamicamente em `openCreate`, no Step 4.)

- [ ] **Step 3: Adicionar estado e função de carregar seções**

Logo após a declaração de `clientesCadastrados` (por volta da linha 75 do arquivo atual):

```ts
  const [secoes, setSecoes] = useState<SecaoParcelamento[]>([])
  const [gerenciarSecoesOpen, setGerenciarSecoesOpen] = useState(false)
  const [criandoSecao, setCriandoSecao] = useState(false)
  const [novaSecaoNome, setNovaSecaoNome] = useState('')
  const [novaSecaoErro, setNovaSecaoErro] = useState<string | null>(null)
  const [novaSecaoSalvando, setNovaSecaoSalvando] = useState(false)
```

Logo após a função `load` (por volta da linha 92 do arquivo atual, antes do `useEffect`):

```ts
  async function carregarSecoes() {
    const { data } = await sb.from('parcelamento_secoes').select('id, nome').order('created_at')
    setSecoes(data ?? [])
  }
```

No `useEffect` existente (linhas 94-112 do arquivo atual), adicionar a chamada de `carregarSecoes()` junto às outras duas chamadas iniciais:

```ts
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) return
      sb.from('profiles').select('nome,role').eq('id', data.user.id).single().then(({ data: p }) => {
        const admin = p?.role === 'admin'
        const nome = p?.nome ?? null
        setIsAdmin(admin)
        setUserNome(nome)
        load(admin, nome)
      })
    })
    sb.from('clientes').select('nome, cnpj, clientes_fiscal!inner(responsavel)').eq('clientes_fiscal.ativo', true).order('nome').then(({ data }) => {
      setClientesCadastrados(data?.map((c: any) => ({
        nome: c.nome,
        cnpj: c.cnpj,
        responsavel: c.clientes_fiscal?.responsavel ?? null
      })) ?? [])
    })
    carregarSecoes()
  }, [])
```

- [ ] **Step 4: Ajustar `openCreate` pra usar a primeira seção carregada**

Trocar (linha 118 do arquivo atual):

```ts
  function openCreate() { setEditItem(null); setForm(EMPTY_FORM); setModalOpen(true) }
```

por:

```ts
  function openCreate() {
    setEditItem(null)
    setForm({ ...EMPTY_FORM, secao: secoes[0]?.nome ?? '' })
    setModalOpen(true)
  }
```

- [ ] **Step 5: Handler de criar seção nova**

Adicionar logo após `setF` (por volta da linha 147 do arquivo atual):

```ts
  async function handleCriarSecao() {
    const nome = novaSecaoNome.trim()
    if (!nome) return
    setNovaSecaoSalvando(true)
    setNovaSecaoErro(null)
    try {
      const { error } = await criarSecaoParcelamento(nome)
      if (error) { setNovaSecaoErro(error); return }
      await carregarSecoes()
      setF('secao', nome.toUpperCase())
      setCriandoSecao(false)
      setNovaSecaoNome('')
    } finally {
      setNovaSecaoSalvando(false)
    }
  }

  async function handleSecoesChanged() {
    await Promise.all([carregarSecoes(), load(isAdmin, userNome)])
  }
```

- [ ] **Step 6: Trocar todo uso de `SECOES` por `secoes`**

Trocar (linha 160 do arquivo atual):

```ts
  const secoesMostrar = secaoFiltro === 'TODOS' ? SECOES : [secaoFiltro]
```

por:

```ts
  const secoesMostrar = secaoFiltro === 'TODOS' ? secoes.map(s => s.nome) : [secaoFiltro]
```

Dentro de `imprimir()`, trocar as duas ocorrências de `SECOES` (linhas 170 e 240 do arquivo atual):

```ts
    const secRows = (secaoFiltro === 'TODOS' ? SECOES : [secaoFiltro]).map(secao => {
```

por:

```ts
    const secRows = (secaoFiltro === 'TODOS' ? secoes.map(s => s.nome) : [secaoFiltro]).map(secao => {
```

e:

```ts
      <div class="meta-item"><div class="label">Seções</div><div class="value">${(secaoFiltro === 'TODOS' ? SECOES : [secaoFiltro]).filter(s => filtered.some(p => p.secao === s)).length}</div></div>
```

por:

```ts
      <div class="meta-item"><div class="label">Seções</div><div class="value">${(secaoFiltro === 'TODOS' ? secoes.map(s => s.nome) : [secaoFiltro]).filter(s => filtered.some(p => p.secao === s)).length}</div></div>
```

- [ ] **Step 7: Filtro do topo — trocar o `<select>` de seções**

Trocar (linhas 262-266 do arquivo atual):

```tsx
        <select value={secaoFiltro} onChange={e => setSecaoFiltro(e.target.value)}
          className="px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)]/70 text-sm focus:outline-none min-w-[180px]">
          <option value="TODOS">Todas as seções</option>
          {SECOES.map(s => <option key={s} value={s} className="bg-[var(--bg-surface)]">{s}</option>)}
        </select>
```

por:

```tsx
        <select value={secaoFiltro} onChange={e => setSecaoFiltro(e.target.value)}
          className="px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)]/70 text-sm focus:outline-none min-w-[180px]">
          <option value="TODOS">Todas as seções</option>
          {secoes.map(s => <option key={s.id} value={s.nome} className="bg-[var(--bg-surface)]">{s.nome}</option>)}
        </select>
```

- [ ] **Step 8: Select de Seção no modal de cadastro — adicionar "criar nova" e "gerenciar"**

Trocar o bloco inteiro de Seção no modal (linhas 423-430 do arquivo atual):

```tsx
              {/* Seção */}
              <div>
                <label className={labelCls}>Seção</label>
                <select value={form.secao} onChange={e => setF('secao', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50">
                  {SECOES.map(s => <option key={s} value={s} className="bg-[var(--bg-surface)]">{s}</option>)}
                </select>
              </div>
```

por:

```tsx
              {/* Seção */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls + ' mb-0'}>Seção</label>
                  <button type="button" onClick={() => setGerenciarSecoesOpen(true)}
                    className="text-[10px] font-semibold text-[var(--fg)]/40 hover:text-[var(--fg)] transition-colors">
                    Gerenciar seções
                  </button>
                </div>
                <select
                  value={criandoSecao ? '__nova__' : form.secao}
                  onChange={e => {
                    if (e.target.value === '__nova__') {
                      setCriandoSecao(true)
                      setNovaSecaoNome('')
                      setNovaSecaoErro(null)
                    } else {
                      setF('secao', e.target.value)
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50">
                  {secoes.map(s => <option key={s.id} value={s.nome} className="bg-[var(--bg-surface)]">{s.nome}</option>)}
                  <option value="__nova__" className="bg-[var(--bg-surface)]">+ Criar nova seção...</option>
                </select>
                {criandoSecao && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={novaSecaoNome}
                      onChange={e => setNovaSecaoNome(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCriarSecao())}
                      placeholder="Nome da nova seção..."
                      autoFocus
                      className={inputCls + ' flex-1'}
                    />
                    <button type="button" onClick={handleCriarSecao} disabled={novaSecaoSalvando || !novaSecaoNome.trim()}
                      className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 whitespace-nowrap">
                      {novaSecaoSalvando ? 'Criando...' : 'Criar'}
                    </button>
                    <button type="button" onClick={() => { setCriandoSecao(false); setNovaSecaoNome(''); setNovaSecaoErro(null) }}
                      className="px-3 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
                      Cancelar
                    </button>
                  </div>
                )}
                {novaSecaoErro && (
                  <p className="mt-1.5 text-xs text-red-400">⚠ {novaSecaoErro}</p>
                )}
              </div>
```

- [ ] **Step 9: Renderizar `GerenciarSecoesModal`**

No final do componente, logo antes do `</div>` de fechamento final (depois do bloco `{modalOpen && (...)}`, por volta da linha 560-561 do arquivo atual), adicionar:

```tsx
      {gerenciarSecoesOpen && (
        <GerenciarSecoesModal
          secoes={secoes}
          onClose={() => setGerenciarSecoesOpen(false)}
          onChanged={handleSecoesChanged}
        />
      )}
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros. Nenhum outro arquivo do repo referencia a constante `SECOES` de `app/fiscal/parcelamentos/page.tsx` (é local ao componente), então a remoção é segura.

- [ ] **Step 11: Verificação manual**

Com a migration da Task 1 aplicada no dev:

1. Abrir `/fiscal/parcelamentos`, clicar em "+ Novo Parcelamento".
2. Confirmar que o select de Seção mostra as 5 seções originais, na mesma ordem de sempre, mais a opção "+ Criar nova seção..." no final.
3. Escolher "+ Criar nova seção...", digitar um nome novo (ex: "TESTE MANUAL"), clicar em "Criar". Confirmar que o select passa a mostrar "TESTE MANUAL" selecionado, e que essa seção também aparece no filtro do topo da página.
4. Salvar o parcelamento nessa seção nova.
5. Clicar em "Gerenciar seções", editar o nome de "TESTE MANUAL" pra "TESTE RENOMEADO", salvar. Fechar o modal, abrir o parcelamento criado no passo 4 e confirmar que a Seção dele já mostra "TESTE RENOMEADO" (a renomeação atualizou o parcelamento existente).
6. Tentar remover a seção "TESTE RENOMEADO" (que ainda tem o parcelamento do passo 4) — confirmar que aparece o erro de bloqueio com a contagem.
7. Excluir o parcelamento de teste (botão Excluir na linha expandida), depois tentar remover "TESTE RENOMEADO" de novo — confirmar que agora remove com sucesso e some do select/filtro.

- [ ] **Step 12: Commit**

```bash
git add app/fiscal/parcelamentos/page.tsx
git commit -m "feat: secao de parcelamento customizavel (criar/renomear/remover)"
```

---

## Nota sobre a migration

A Task 1 cria o arquivo de migration, mas **não** roda `create table`/`insert` no banco — não há token do Supabase CLI disponível nesta sessão. Antes da verificação manual (Task 3, Step 11), a migration `021_parcelamento_secoes_catalogo.sql` precisa ser aplicada manualmente no SQL Editor do projeto dev (`fcpcorqquovvgtoukxry`); sem isso, `sb.from('parcelamento_secoes')` falha com erro de tabela inexistente. Quando o trabalho for pra produção, a mesma SQL roda manualmente lá (`qilwxzpxkjzbfrwlbydt`), conforme protocolo já combinado — nunca aplicar em produção nesta sessão.

## Nota sobre a PR

Ao final da Task 3, seguir o protocolo já estabelecido: push da branch `feat/secao-parcelamento-customizavel` e abrir PR contra `dev` (nunca `main`), sem fazer merge.
