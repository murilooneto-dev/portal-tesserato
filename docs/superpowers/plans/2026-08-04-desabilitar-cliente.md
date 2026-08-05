# Desabilitar cliente (por setor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um botão "Desabilitar" na tela de detalhe do cliente de cada setor (Fiscal, Contábil, Pessoal) que — após confirmação com nome do cliente + senha de login do usuário — marca o vínculo daquele cliente naquele setor como inativo. Um cliente desabilitado some das contagens de tarefas/empresas do mês e das listagens ativas, mas seu histórico continua salvo e ele pode ser reabilitado a qualquer momento.

**Architecture:** Cada setor tem sua própria tabela filha 1:1 com `clientes` (`clientes_fiscal`, `clientes_contabil`, `clientes_pessoal`). Cada uma ganha uma coluna `ativo boolean not null default true` (migration `019_clientes_ativo.sql`). Duas novas server actions por setor — `desabilitarCliente`/`reabilitarCliente` — fazem o update, reautenticando a senha via um helper compartilhado (`lib/verificar-senha.ts`) que usa `signInWithPassword` num cliente Supabase descartável, mesmo padrão já usado em `verificarSenhaDev` (`app/fiscal/parametros/actions.ts`). Um modal compartilhado (`components/geral/DesabilitarClienteModal.tsx`) implementa a UI de confirmação (nome + senha) e é reusado pelos três `ClienteXAcoes.tsx`. Nas telas que hoje somam clientes/tarefas do mês (dashboards, `tarefas`, `relatorios`, `parcelamentos`, `ferramentas`, e-mail de relatório fiscal), a query de clientes passa a filtrar `ativo = true`. A listagem de clientes de cada setor (`ClientesLista*.tsx`) já busca todos os clientes sem filtro de `ativo` hoje — só ganha um checkbox "Mostrar desabilitados" e uma badge, sem mudança na página/query que a alimenta.

**Tech Stack:** Next.js 16 (App Router, Server Components/Functions), Supabase (Postgres + PostgREST + RLS), TypeScript, Tailwind v4. Sem framework de testes automatizado neste repo — verificação via `npx tsc --noEmit -p .` e `npm run build`.

## Global Constraints

- Nenhuma exclusão de dado — `ativo` só controla se o cliente aparece nas listas/contagens ativas dali pra frente. Tarefas, observações e arquivos já salvos continuam intactos.
- `ativo` é por setor (coluna nas tabelas filhas), não em `clientes` — desabilitar no Fiscal não afeta o mesmo cliente no Contábil/Pessoal.
- A confirmação de "Desabilitar" exige nome do cliente digitado igual (case-sensitive, mesmo padrão do modal de exclusão em `ClienteAcoes.tsx`) **e** a senha de login do usuário autenticado no momento — validada reautenticando via `signInWithPassword`, nunca comparando string em texto puro.
- "Reabilitar" não exige senha — ação reversível e não destrutiva.
- Autorização de `desabilitarCliente`/`reabilitarCliente` usa o mesmo guard já existente por setor (`podeEditarCliente`/`podeEditarClienteContabil`/`podeEditarClientePessoal` em `lib/supabase/server.ts`) — admin ou o responsável do cliente.
- Migration aplicada no Supabase de **dev** via `npx supabase db push` (feito pelo controller da sessão, não por subagent — precisa de credenciais). Nunca aplicar contra produção nesta sessão.
- Setores Societário e Financeiro ficam fora de escopo (sem tabela filha de cliente equivalente).

---

### Task 1: Migration `019_clientes_ativo.sql` + tipos TypeScript

**Files:**
- Create: `supabase/migrations/019_clientes_ativo.sql`
- Modify: `lib/types.ts:47-63` (`ClienteFiscal`), `lib/types.ts:109-117` (`ClienteContabil`), `lib/types.ts:119-127` (`ClientePessoal`)

**Interfaces:**
- Produces: coluna `ativo boolean not null default true` em `clientes_fiscal`, `clientes_contabil`, `clientes_pessoal`; campo `ativo: boolean` nas três interfaces TypeScript correspondentes — consumido por todas as tasks seguintes.

- [ ] **Step 1: Criar a migration**

```sql
-- supabase/migrations/019_clientes_ativo.sql

-- Estado "desabilitado" por cliente, por setor: cada setor tem sua própria
-- tabela filha 1:1 com `clientes` (clientes_fiscal/clientes_contabil/
-- clientes_pessoal), então o campo fica em cada uma — desabilitar no Fiscal
-- não afeta o mesmo cliente no Contábil/Pessoal. Nenhum dado é apagado;
-- `ativo` só controla se o cliente aparece nas listas/contagens ativas
-- dali pra frente.
alter table clientes_fiscal   add column if not exists ativo boolean not null default true;
alter table clientes_contabil add column if not exists ativo boolean not null default true;
alter table clientes_pessoal  add column if not exists ativo boolean not null default true;
```

- [ ] **Step 2: Adicionar `ativo` às três interfaces em `lib/types.ts`**

Em `ClienteFiscal` (linha 47-63), adicionar ao final, antes do `}` de fechamento:

```ts
export interface ClienteFiscal {
  cliente_id: string
  cod: string | null
  regime: string | null
  atividade: string | null
  responsavel: string | null
  grupo: string | null
  obs: string | null
  prioridade: number
  envia_iss: boolean
  confere_siga: boolean
  login_iss: string | null
  senha_iss: string | null
  email_envio_iss: string | null
  declaracao_anual: boolean
  tarefas_personalizadas: string[]
  ativo: boolean
}
```

Em `ClienteContabil` (linha 109-117):

```ts
export interface ClienteContabil {
  cliente_id: string
  atividade: string | null
  regime: string | null
  responsavel: string | null
  prioridade: number
  obs: string | null
  tarefas_personalizadas: string[]
  ativo: boolean
}
```

Em `ClientePessoal` (linha 119-127):

```ts
export interface ClientePessoal {
  cliente_id: string
  atividade: string | null
  regime: string | null
  responsavel: string | null
  prioridade: number
  obs: string | null
  tarefas_personalizadas: string[]
  ativo: boolean
}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros novos (os `SELECT_CLIENTE_*` usam `*, tabela!inner(*)`, então o novo campo já chega tipado via `Cliente & ClienteFiscal` etc. sem precisar tocar em `lib/clientes-fiscal.ts`/`clientes-contabil.ts`/`clientes-pessoal.ts`).

- [ ] **Step 4: Aplicar a migration no Supabase de dev (controller, não subagent — precisa das credenciais de dev)**

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase db push --password '<senha>' --yes
```

Verificar, via SQL Editor do Supabase de dev, que as três colunas existem e vieram com o default correto:

```sql
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_name in ('clientes_fiscal', 'clientes_contabil', 'clientes_pessoal') and column_name = 'ativo';
```

Expected: 3 linhas, `data_type = boolean`, `column_default` contendo `true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/019_clientes_ativo.sql lib/types.ts
git commit -m "feat: coluna ativo por setor nas tabelas filhas de cliente"
```

---

### Task 2: `lib/verificar-senha.ts` — reautenticação de senha compartilhada

**Files:**
- Create: `lib/verificar-senha.ts`

**Interfaces:**
- Consumes: `getAuthenticatedAdmin` (`lib/supabase/server.ts`).
- Produces: `verificarSenhaUsuarioAtual(senha: string): Promise<{ ok: boolean; error?: string }>` — usada pelas Tasks 4-6.

- [ ] **Step 1: Criar o arquivo**

```ts
// lib/verificar-senha.ts
'use server'

import { createClient as createClienteDescartavel } from '@supabase/supabase-js'
import { getAuthenticatedAdmin } from './supabase/server'

// Reautentica a senha digitada contra a conta atualmente logada — mesmo
// padrão de verificarSenhaDev (app/fiscal/parametros/actions.ts), mas usa o
// e-mail da própria sessão em vez de um e-mail fixo. Não compara senha em
// texto puro em nenhum momento: quem confirma é o próprio Supabase Auth.
export async function verificarSenhaUsuarioAtual(senha: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await getAuthenticatedAdmin()
  if (!user?.email) return { ok: false, error: 'Sessão inválida.' }

  const clienteDescartavel = createClienteDescartavel(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { error } = await clienteDescartavel.auth.signInWithPassword({ email: user.email, password: senha })
  if (error) return { ok: false, error: 'Senha incorreta.' }

  return { ok: true }
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/verificar-senha.ts
git commit -m "feat: helper compartilhado de reautenticacao de senha"
```

---

### Task 3: `components/geral/DesabilitarClienteModal.tsx` — modal de confirmação compartilhado

**Files:**
- Create: `components/geral/DesabilitarClienteModal.tsx`

**Interfaces:**
- Produces: componente `DesabilitarClienteModal({ clienteNome: string, onClose: () => void, onConfirm: (senha: string) => Promise<{ error?: string }>, onConfirmado: () => void })` — usado pelas Tasks 4-6.

- [ ] **Step 1: Criar o arquivo**

```tsx
'use client'

import { useState } from 'react'

interface Props {
  clienteNome: string
  onClose: () => void
  onConfirm: (senha: string) => Promise<{ error?: string }>
  onConfirmado: () => void
}

export default function DesabilitarClienteModal({ clienteNome, onClose, onConfirm, onConfirmado }: Props) {
  const [nomeDigitado, setNomeDigitado] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const confirmacaoValida = nomeDigitado.trim() === clienteNome && senha.length > 0

  async function handleConfirmar() {
    if (!confirmacaoValida) return
    setEnviando(true)
    setErro(null)
    try {
      const resultado = await onConfirm(senha)
      if (resultado.error) {
        setErro(resultado.error)
        return
      }
      onConfirmado()
      onClose()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-amber-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-[var(--fg)] font-bold text-base mb-1">Desabilitar cliente</h2>
        <p className="text-[var(--fg)]/50 text-sm mb-4">
          Dali pra frente esse cliente sai das listas ativas e das contagens de tarefas/empresas do mês. O histórico já salvo continua intacto e você pode reabilitar quando quiser. Pra confirmar, digite o nome do cliente e sua senha de login abaixo.
        </p>

        <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">
          Nome do cliente: <span className="text-[var(--fg)]/60 normal-case">{clienteNome}</span>
        </label>
        <input
          type="text"
          value={nomeDigitado}
          onChange={e => setNomeDigitado(e.target.value)}
          placeholder="Digite o nome exatamente como acima"
          className="w-full mb-3 px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-amber-500/50"
        />

        <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">
          Sua senha de login
        </label>
        <input
          type="password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          placeholder="Senha"
          className="w-full mb-2 px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-amber-500/50"
        />

        {erro && <p className="text-red-400 text-xs mb-3">{erro}</p>}

        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onClose}
            className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)] px-4 py-2 rounded-lg border border-[var(--fg)]/10 transition-all">
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={!confirmacaoValida || enviando}
            className="text-xs bg-amber-500/20 border border-amber-500/40 text-amber-300 px-4 py-2 rounded-lg hover:bg-amber-500/30 transition-all disabled:opacity-40">
            {enviando ? 'Desabilitando...' : 'Desabilitar'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/geral/DesabilitarClienteModal.tsx
git commit -m "feat: modal compartilhado de confirmacao para desabilitar cliente"
```

---

### Task 4: Fiscal — actions, `ClienteAcoes`, badge, listagem e filtros de contagem

**Files:**
- Modify: `app/fiscal/clientes/actions.ts` (adicionar `desabilitarCliente`/`reabilitarCliente`)
- Modify: `components/fiscal/ClienteAcoes.tsx` (botão Desabilitar/Reabilitar)
- Modify: `app/fiscal/clientes/[id]/page.tsx` (badge "Desabilitado" no header)
- Modify: `components/fiscal/ClientesLista.tsx` (checkbox "Mostrar desabilitados" + badge na linha)
- Modify: `app/fiscal/dashboard/page.tsx`, `app/fiscal/tarefas/page.tsx`, `app/fiscal/relatorios/page.tsx`, `app/fiscal/parcelamentos/page.tsx`, `app/(comum)/ferramentas/page.tsx`, `app/api/relatorios/fiscal/route.ts` (filtrar `clientes_fiscal.ativo = true`)

**Interfaces:**
- Consumes: `verificarSenhaUsuarioAtual` (Task 2), `DesabilitarClienteModal` (Task 3), `podeEditarCliente`/`getAuthenticatedAdmin` (`lib/supabase/server.ts`), `ClienteComFiscal` (agora com `.ativo: boolean`, `lib/clientes-fiscal.ts`).
- Produces: `desabilitarCliente(clienteId: string, senha: string): Promise<{ error?: string }>`, `reabilitarCliente(clienteId: string): Promise<{ error?: string }>` em `app/fiscal/clientes/actions.ts`.

- [ ] **Step 1: Adicionar as duas actions em `app/fiscal/clientes/actions.ts`**

No topo do arquivo, adicionar o import (a linha 4 já importa `getAuthenticatedAdmin, podeEditarCliente`):

```ts
import { verificarSenhaUsuarioAtual } from '@/lib/verificar-senha'
```

No final do arquivo, depois de `excluirArquivoTarefa` (linha 319):

```ts

export async function desabilitarCliente(clienteId: string, senha: string): Promise<{ error?: string }> {
  if (!(await podeEditarCliente(clienteId))) return { error: 'Não autorizado.' }

  const { ok, error: erroSenha } = await verificarSenhaUsuarioAtual(senha)
  if (!ok) return { error: erroSenha ?? 'Senha incorreta.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }

  const { error } = await supabase.from('clientes_fiscal').update({ ativo: false }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  revalidatePath(`/fiscal/clientes/${clienteId}`)
  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/dashboard')
  revalidatePath('/fiscal/relatorios')
  revalidatePath('/fiscal/tarefas')
  return {}
}

export async function reabilitarCliente(clienteId: string): Promise<{ error?: string }> {
  if (!(await podeEditarCliente(clienteId))) return { error: 'Não autorizado.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }

  const { error } = await supabase.from('clientes_fiscal').update({ ativo: true }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  revalidatePath(`/fiscal/clientes/${clienteId}`)
  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/dashboard')
  revalidatePath('/fiscal/relatorios')
  revalidatePath('/fiscal/tarefas')
  return {}
}
```

- [ ] **Step 2: Botão Desabilitar/Reabilitar em `components/fiscal/ClienteAcoes.tsx`**

Trocar o import da linha 5 (`import { excluirCliente } from '@/app/fiscal/clientes/actions'`) por:

```ts
import { excluirCliente, desabilitarCliente, reabilitarCliente } from '@/app/fiscal/clientes/actions'
import DesabilitarClienteModal from '@/components/geral/DesabilitarClienteModal'
```

Dentro do componente, logo depois de `const [excluindo, setExcluindo] = useState(false)` (linha 19), adicionar:

```ts
  const [desabilitarModalOpen, setDesabilitarModalOpen] = useState(false)
  const [confirmandoReabilitar, setConfirmandoReabilitar] = useState(false)
  const [reabilitando, setReabilitando] = useState(false)

  async function handleReabilitar() {
    setReabilitando(true)
    try {
      await reabilitarCliente(cliente.id)
      router.refresh()
    } finally {
      setReabilitando(false)
      setConfirmandoReabilitar(false)
    }
  }
```

Trocar o `<div className="flex items-center gap-2">` que envolve os botões Editar/Excluir (linha 42) para incluir o novo bloco logo depois do botão Excluir:

```tsx
      <div className="flex items-center gap-2">
        <button
          onClick={() => setModalOpen(true)}
          className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)] px-3 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:border-[var(--fg)]/20 transition-all">
          Editar
        </button>
        <button
          onClick={abrirConfirmacao}
          className="text-xs text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg border border-red-500/20 hover:border-red-500/40 transition-all">
          Excluir
        </button>
        {cliente.ativo ? (
          <button
            onClick={() => setDesabilitarModalOpen(true)}
            className="text-xs text-amber-400/70 hover:text-amber-400 px-3 py-1.5 rounded-lg border border-amber-500/20 hover:border-amber-500/40 transition-all">
            Desabilitar
          </button>
        ) : (
          <>
            <span className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-[var(--fg)]/10 text-[var(--fg)]/40 border border-[var(--fg)]/15 uppercase tracking-wide">
              Desabilitado
            </span>
            {confirmandoReabilitar ? (
              <button onClick={handleReabilitar} disabled={reabilitando}
                className="text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/30 transition-all disabled:opacity-40">
                {reabilitando ? 'Reabilitando...' : 'Confirmar'}
              </button>
            ) : (
              <button
                onClick={() => setConfirmandoReabilitar(true)}
                className="text-xs text-emerald-400/70 hover:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/20 hover:border-emerald-500/40 transition-all">
                Reabilitar
              </button>
            )}
          </>
        )}
      </div>
```

E, depois do bloco `{confirmandoExclusao && (...)}` no final do componente (antes do `</>` de fechamento), adicionar:

```tsx
      {desabilitarModalOpen && (
        <DesabilitarClienteModal
          clienteNome={cliente.nome}
          onClose={() => setDesabilitarModalOpen(false)}
          onConfirm={senha => desabilitarCliente(cliente.id, senha)}
          onConfirmado={() => router.refresh()}
        />
      )}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros. `cliente.ativo` deve resolver porque `ClienteAcoes` recebe `cliente: Cliente` — checar o tipo da prop `cliente` em `ClienteAcoes.tsx` (linha 9-13): hoje é `import type { Cliente } from '@/lib/types'` e `cliente: Cliente`. **`Cliente` (sem o `Fiscal`) não tem `ativo`** — trocar o import e a prop para usar `ClienteComFiscal`:

```ts
import type { ClienteComFiscal } from '@/lib/clientes-fiscal'
```

E na interface `Props`, trocar `cliente: Cliente` por `cliente: ClienteComFiscal`. Remover o import antigo `import type { Cliente } from '@/lib/types'` se não for mais usado em nenhum outro lugar do arquivo.

Rodar `npx tsc --noEmit -p .` de novo.
Expected: sem erros.

- [ ] **Step 4: Badge "Desabilitado" em `app/fiscal/clientes/[id]/page.tsx`**

Na linha 191 (depois do badge de `municipio`), adicionar:

```tsx
                  {cliente.municipio && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.municipio}{cliente.uf ? `/${cliente.uf}` : ''}</span>}
                  {!cliente.ativo && <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-semibold">Desabilitado</span>}
```

- [ ] **Step 5: Checkbox "Mostrar desabilitados" + badge em `components/fiscal/ClientesLista.tsx`**

Depois de `const [filtroPendencia, setFiltroPendencia] = useFiltroPersistente('clientes:pendencia', false)` (linha 54), adicionar:

```ts
  const [mostrarDesabilitados, setMostrarDesabilitados] = useFiltroPersistente('clientes:mostrarDesabilitados', false)
```

No `filtrados` (linha 66-80), adicionar a condição logo depois de `if (filtroPendencia && !comPendencia.has(c.id)) return false`:

```ts
    if (filtroPendencia && !comPendencia.has(c.id)) return false
    if (!mostrarDesabilitados && c.ativo === false) return false
    return true
  }), [clientes, busca, filtroResponsavel, filtroGrupo, filtroAtividade, filtroPendencia, mostrarDesabilitados, comPendencia])
```

Depois do `<label>` do checkbox "Apenas pendentes" (linha 108-116), adicionar um segundo checkbox:

```tsx
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--fg)]/10 bg-[var(--bg-surface)] cursor-pointer select-none hover:border-[var(--fg)]/20 transition-colors">
          <input
            type="checkbox"
            checked={mostrarDesabilitados}
            onChange={e => setMostrarDesabilitados(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span className="text-sm text-[var(--fg)]/70 whitespace-nowrap">Mostrar desabilitados</span>
        </label>
```

Na área de badges de cada linha (depois do badge de `cliente.responsavel`, linha 200-205), adicionar:

```tsx
                {cliente.ativo === false && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--fg)]/10 text-[var(--fg)]/40 border border-[var(--fg)]/15">
                    Desabilitado
                  </span>
                )}
```

- [ ] **Step 6: Filtrar `ativo = true` nas telas de contagem/relatório do Fiscal**

Em `app/fiscal/dashboard/page.tsx` linha 24, trocar:

```ts
    supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome'),
```

por:

```ts
    supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('clientes_fiscal.ativo', true).order('nome'),
```

Em `app/fiscal/tarefas/page.tsx` linhas 26-28, trocar:

```ts
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome, clientes_fiscal!inner(cod, grupo, responsavel)')
    .order('nome')
```

por:

```ts
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome, clientes_fiscal!inner(cod, grupo, responsavel)')
    .eq('clientes_fiscal.ativo', true)
    .order('nome')
```

Em `app/fiscal/relatorios/page.tsx` linha 47, trocar:

```ts
        let clientesQ = sb.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome')
```

por:

```ts
        let clientesQ = sb.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('clientes_fiscal.ativo', true).order('nome')
```

Em `app/fiscal/parcelamentos/page.tsx` linha 106, trocar:

```ts
    sb.from('clientes').select('nome, cnpj, clientes_fiscal!inner(responsavel)').order('nome').then(({ data }) => {
```

por:

```ts
    sb.from('clientes').select('nome, cnpj, clientes_fiscal!inner(responsavel)').eq('clientes_fiscal.ativo', true).order('nome').then(({ data }) => {
```

Em `app/(comum)/ferramentas/page.tsx` linha 21, trocar:

```ts
  let q = supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome')
```

por:

```ts
  let q = supabase.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('clientes_fiscal.ativo', true).order('nome')
```

Em `app/api/relatorios/fiscal/route.ts` linha 33, trocar:

```ts
    admin.from('clientes').select(SELECT_CLIENTE_FISCAL).order('nome'),
```

por:

```ts
    admin.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('clientes_fiscal.ativo', true).order('nome'),
```

- [ ] **Step 7: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add app/fiscal/clientes/actions.ts components/fiscal/ClienteAcoes.tsx app/fiscal/clientes/[id]/page.tsx components/fiscal/ClientesLista.tsx app/fiscal/dashboard/page.tsx app/fiscal/tarefas/page.tsx app/fiscal/relatorios/page.tsx app/fiscal/parcelamentos/page.tsx "app/(comum)/ferramentas/page.tsx" app/api/relatorios/fiscal/route.ts
git commit -m "feat: desabilitar/reabilitar cliente no setor Fiscal"
```

---

### Task 5: Contábil — actions, `ClienteContabilAcoes`, badge, listagem e filtros de contagem

**Files:**
- Modify: `app/contabil/clientes/actions.ts`
- Modify: `components/contabil/ClienteContabilAcoes.tsx`
- Modify: `app/contabil/clientes/[id]/page.tsx`
- Modify: `components/contabil/ClientesListaContabil.tsx`
- Modify: `app/contabil/dashboard/page.tsx`, `app/contabil/relatorios/page.tsx`

**Interfaces:**
- Consumes: `verificarSenhaUsuarioAtual` (Task 2), `DesabilitarClienteModal` (Task 3), `podeEditarClienteContabil`/`getAuthenticatedAdmin`, `ClienteComContabil` (agora com `.ativo: boolean`, `lib/clientes-contabil.ts`).
- Produces: `desabilitarCliente(clienteId: string, senha: string): Promise<{ error?: string }>`, `reabilitarCliente(clienteId: string): Promise<{ error?: string }>` em `app/contabil/clientes/actions.ts`.

- [ ] **Step 1: Adicionar as duas actions em `app/contabil/clientes/actions.ts`**

Trocar o import da linha 4 (`import { getAuthenticatedAdmin, podeEditarClienteContabil } from '@/lib/supabase/server'`) — manter como está — e adicionar logo abaixo:

```ts
import { verificarSenhaUsuarioAtual } from '@/lib/verificar-senha'
```

No final do arquivo (depois de `excluirArquivoTarefa`, linha ~244-onwards conforme o arquivo atual), adicionar:

```ts

export async function desabilitarCliente(clienteId: string, senha: string): Promise<{ error?: string }> {
  if (!(await podeEditarClienteContabil(clienteId))) return { error: 'Não autorizado.' }

  const { ok, error: erroSenha } = await verificarSenhaUsuarioAtual(senha)
  if (!ok) return { error: erroSenha ?? 'Senha incorreta.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }

  const { error } = await supabase.from('clientes_contabil').update({ ativo: false }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
  revalidatePath('/contabil/dashboard')
  revalidatePath('/contabil/relatorios')
  return {}
}

export async function reabilitarCliente(clienteId: string): Promise<{ error?: string }> {
  if (!(await podeEditarClienteContabil(clienteId))) return { error: 'Não autorizado.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }

  const { error } = await supabase.from('clientes_contabil').update({ ativo: true }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  revalidatePath(`/contabil/clientes/${clienteId}`)
  revalidatePath('/contabil/clientes')
  revalidatePath('/contabil/dashboard')
  revalidatePath('/contabil/relatorios')
  return {}
}
```

- [ ] **Step 2: Botão Desabilitar/Reabilitar em `components/contabil/ClienteContabilAcoes.tsx`**

Trocar a linha 5 (`import { excluirClienteContabil } from '@/app/contabil/clientes/actions'`) por:

```ts
import { excluirClienteContabil, desabilitarCliente, reabilitarCliente } from '@/app/contabil/clientes/actions'
import DesabilitarClienteModal from '@/components/geral/DesabilitarClienteModal'
```

Depois de `const [excluindo, setExcluindo] = useState(false)` (linha 19), adicionar:

```ts
  const [desabilitarModalOpen, setDesabilitarModalOpen] = useState(false)
  const [confirmandoReabilitar, setConfirmandoReabilitar] = useState(false)
  const [reabilitando, setReabilitando] = useState(false)

  async function handleReabilitar() {
    setReabilitando(true)
    try {
      await reabilitarCliente(cliente.id)
      router.refresh()
    } finally {
      setReabilitando(false)
      setConfirmandoReabilitar(false)
    }
  }
```

Substituir todo o `return (...)` do componente (linhas 31-67) por:

```tsx
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setEditando(true)}
        className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] px-3 py-1.5 rounded-lg transition-all">
        Editar
      </button>

      {confirmando ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">Remover do Contábil?</span>
          <button onClick={handleExcluir} disabled={excluindo}
            className="text-xs bg-red-500/20 border border-red-500/40 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-all disabled:opacity-50">
            {excluindo ? 'Removendo...' : 'Confirmar'}
          </button>
          <button onClick={() => setConfirmando(false)}
            className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]/70 px-2 py-1.5">
            Cancelar
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmando(true)}
          className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg transition-all">
          Excluir
        </button>
      )}

      {cliente.ativo ? (
        <button
          onClick={() => setDesabilitarModalOpen(true)}
          className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-amber-400/70 hover:text-amber-400 px-3 py-1.5 rounded-lg transition-all">
          Desabilitar
        </button>
      ) : (
        <>
          <span className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-[var(--fg)]/10 text-[var(--fg)]/40 border border-[var(--fg)]/15 uppercase tracking-wide">
            Desabilitado
          </span>
          {confirmandoReabilitar ? (
            <button onClick={handleReabilitar} disabled={reabilitando}
              className="text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/30 transition-all disabled:opacity-40">
              {reabilitando ? 'Reabilitando...' : 'Confirmar'}
            </button>
          ) : (
            <button
              onClick={() => setConfirmandoReabilitar(true)}
              className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-emerald-400/70 hover:text-emerald-400 px-3 py-1.5 rounded-lg transition-all">
              Reabilitar
            </button>
          )}
        </>
      )}

      {editando && (
        <EmpresaContabilModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          tarefasPadrao={tarefasPadrao}
          onClose={() => setEditando(false)}
        />
      )}

      {desabilitarModalOpen && (
        <DesabilitarClienteModal
          clienteNome={cliente.nome}
          onClose={() => setDesabilitarModalOpen(false)}
          onConfirm={senha => desabilitarCliente(cliente.id, senha)}
          onConfirmado={() => router.refresh()}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros. `cliente: ClienteComContabil` já é o tipo da prop hoje (linha 10), e já ganhou `.ativo` na Task 1 — não precisa trocar tipo aqui (diferente do Fiscal, que usava `Cliente` puro).

- [ ] **Step 4: Badge "Desabilitado" em `app/contabil/clientes/[id]/page.tsx`**

Na linha 118 (depois do badge de `municipio`), adicionar:

```tsx
                  {cliente.municipio && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.municipio}{cliente.uf ? `/${cliente.uf}` : ''}</span>}
                  {!cliente.ativo && <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-semibold">Desabilitado</span>}
```

- [ ] **Step 5: Checkbox "Mostrar desabilitados" + badge em `components/contabil/ClientesListaContabil.tsx`**

Depois de `const [filtroRegime, setFiltroRegime] = useFiltroPersistente('clientes-contabil:regime', 'TODOS')` (linha 41), adicionar:

```ts
  const [mostrarDesabilitados, setMostrarDesabilitados] = useFiltroPersistente('clientes-contabil:mostrarDesabilitados', false)
```

No `filtrados` (linhas 48-56), adicionar a condição:

```ts
    if (filtroRegime !== 'TODOS' && c.regime !== filtroRegime) return false
    if (!mostrarDesabilitados && c.ativo === false) return false
    return true
  }), [clientes, busca, filtroResponsavel, filtroRegime, mostrarDesabilitados])
```

Depois do `<select>` de regime (linhas 73-76), adicionar o checkbox:

```tsx
        <select value={filtroRegime} onChange={e => setFiltroRegime(e.target.value)} className={selectClass}>
          <option value="TODOS" className="bg-[var(--bg-surface)]">Todos os regimes</option>
          {REGIMES.map(r => <option key={r.value} value={r.value} className="bg-[var(--bg-surface)]">{r.label}</option>)}
        </select>
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--fg)]/10 bg-[var(--bg-surface)] cursor-pointer select-none hover:border-[var(--fg)]/20 transition-colors">
          <input
            type="checkbox"
            checked={mostrarDesabilitados}
            onChange={e => setMostrarDesabilitados(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span className="text-sm text-[var(--fg)]/70 whitespace-nowrap">Mostrar desabilitados</span>
        </label>
```

Na área de badges de cada linha (depois do badge de `cliente.responsavel`, linhas 149-154), adicionar:

```tsx
                {cliente.ativo === false && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--fg)]/10 text-[var(--fg)]/40 border border-[var(--fg)]/15">
                    Desabilitado
                  </span>
                )}
```

- [ ] **Step 6: Filtrar `ativo = true` nas telas de contagem/relatório do Contábil**

Em `app/contabil/dashboard/page.tsx` linha 24, trocar:

```ts
    supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).order('nome'),
```

por:

```ts
    supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).eq('clientes_contabil.ativo', true).order('nome'),
```

Em `app/contabil/relatorios/page.tsx` linha 21, trocar:

```ts
  let clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).order('nome')
```

por:

```ts
  let clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_CONTABIL).eq('clientes_contabil.ativo', true).order('nome')
```

- [ ] **Step 7: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add app/contabil/clientes/actions.ts components/contabil/ClienteContabilAcoes.tsx app/contabil/clientes/[id]/page.tsx components/contabil/ClientesListaContabil.tsx app/contabil/dashboard/page.tsx app/contabil/relatorios/page.tsx
git commit -m "feat: desabilitar/reabilitar cliente no setor Contabil"
```

---

### Task 6: Pessoal — actions, `ClientePessoalAcoes`, badge, listagem e filtros de contagem

**Files:**
- Modify: `app/pessoal/clientes/actions.ts`
- Modify: `components/pessoal/ClientePessoalAcoes.tsx`
- Modify: `app/pessoal/clientes/[id]/page.tsx`
- Modify: `components/pessoal/ClientesListaPessoal.tsx`
- Modify: `app/pessoal/dashboard/page.tsx`, `app/pessoal/relatorios/page.tsx`

**Interfaces:**
- Consumes: `verificarSenhaUsuarioAtual` (Task 2), `DesabilitarClienteModal` (Task 3), `podeEditarClientePessoal`/`getAuthenticatedAdmin`, `ClienteComPessoal` (agora com `.ativo: boolean`, `lib/clientes-pessoal.ts`).
- Produces: `desabilitarCliente(clienteId: string, senha: string): Promise<{ error?: string }>`, `reabilitarCliente(clienteId: string): Promise<{ error?: string }>` em `app/pessoal/clientes/actions.ts`.

- [ ] **Step 1: Adicionar as duas actions em `app/pessoal/clientes/actions.ts`**

Adicionar logo abaixo do import existente na linha 4 (`import { getAuthenticatedAdmin, podeEditarClientePessoal } from '@/lib/supabase/server'`):

```ts
import { verificarSenhaUsuarioAtual } from '@/lib/verificar-senha'
```

No final do arquivo, adicionar:

```ts

export async function desabilitarCliente(clienteId: string, senha: string): Promise<{ error?: string }> {
  if (!(await podeEditarClientePessoal(clienteId))) return { error: 'Não autorizado.' }

  const { ok, error: erroSenha } = await verificarSenhaUsuarioAtual(senha)
  if (!ok) return { error: erroSenha ?? 'Senha incorreta.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }

  const { error } = await supabase.from('clientes_pessoal').update({ ativo: false }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
  revalidatePath('/pessoal/dashboard')
  revalidatePath('/pessoal/relatorios')
  return {}
}

export async function reabilitarCliente(clienteId: string): Promise<{ error?: string }> {
  if (!(await podeEditarClientePessoal(clienteId))) return { error: 'Não autorizado.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado.' }

  const { error } = await supabase.from('clientes_pessoal').update({ ativo: true }).eq('cliente_id', clienteId)
  if (error) return { error: error.message }

  revalidatePath(`/pessoal/clientes/${clienteId}`)
  revalidatePath('/pessoal/clientes')
  revalidatePath('/pessoal/dashboard')
  revalidatePath('/pessoal/relatorios')
  return {}
}
```

- [ ] **Step 2: Botão Desabilitar/Reabilitar em `components/pessoal/ClientePessoalAcoes.tsx`**

Trocar a linha 5 (`import { excluirClientePessoal } from '@/app/pessoal/clientes/actions'`) por:

```ts
import { excluirClientePessoal, desabilitarCliente, reabilitarCliente } from '@/app/pessoal/clientes/actions'
import DesabilitarClienteModal from '@/components/geral/DesabilitarClienteModal'
```

Depois de `const [excluindo, setExcluindo] = useState(false)` (linha 19), adicionar:

```ts
  const [desabilitarModalOpen, setDesabilitarModalOpen] = useState(false)
  const [confirmandoReabilitar, setConfirmandoReabilitar] = useState(false)
  const [reabilitando, setReabilitando] = useState(false)

  async function handleReabilitar() {
    setReabilitando(true)
    try {
      await reabilitarCliente(cliente.id)
      router.refresh()
    } finally {
      setReabilitando(false)
      setConfirmandoReabilitar(false)
    }
  }
```

Substituir todo o `return (...)` do componente (linhas 31-67) por:

```tsx
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setEditando(true)}
        className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] px-3 py-1.5 rounded-lg transition-all">
        Editar
      </button>

      {confirmando ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">Remover do Pessoal?</span>
          <button onClick={handleExcluir} disabled={excluindo}
            className="text-xs bg-red-500/20 border border-red-500/40 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-all disabled:opacity-50">
            {excluindo ? 'Removendo...' : 'Confirmar'}
          </button>
          <button onClick={() => setConfirmando(false)}
            className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]/70 px-2 py-1.5">
            Cancelar
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmando(true)}
          className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg transition-all">
          Excluir
        </button>
      )}

      {cliente.ativo ? (
        <button
          onClick={() => setDesabilitarModalOpen(true)}
          className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-amber-400/70 hover:text-amber-400 px-3 py-1.5 rounded-lg transition-all">
          Desabilitar
        </button>
      ) : (
        <>
          <span className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-[var(--fg)]/10 text-[var(--fg)]/40 border border-[var(--fg)]/15 uppercase tracking-wide">
            Desabilitado
          </span>
          {confirmandoReabilitar ? (
            <button onClick={handleReabilitar} disabled={reabilitando}
              className="text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/30 transition-all disabled:opacity-40">
              {reabilitando ? 'Reabilitando...' : 'Confirmar'}
            </button>
          ) : (
            <button
              onClick={() => setConfirmandoReabilitar(true)}
              className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-emerald-400/70 hover:text-emerald-400 px-3 py-1.5 rounded-lg transition-all">
              Reabilitar
            </button>
          )}
        </>
      )}

      {editando && (
        <EmpresaPessoalModal
          clienteId={cliente.id}
          responsaveis={responsaveis}
          tarefasPadrao={tarefasPadrao}
          onClose={() => setEditando(false)}
        />
      )}

      {desabilitarModalOpen && (
        <DesabilitarClienteModal
          clienteNome={cliente.nome}
          onClose={() => setDesabilitarModalOpen(false)}
          onConfirm={senha => desabilitarCliente(cliente.id, senha)}
          onConfirmado={() => router.refresh()}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros. `cliente: ClienteComPessoal` já é o tipo da prop hoje e já ganhou `.ativo` na Task 1.

- [ ] **Step 4: Badge "Desabilitado" em `app/pessoal/clientes/[id]/page.tsx`**

Localizar a linha do badge de `municipio` (mesmo padrão de Fiscal/Contábil, dentro do `<div className="flex gap-2 mt-2 flex-wrap">`) e adicionar logo depois:

```tsx
                  {cliente.municipio && <span className="text-xs text-[var(--fg)]/50 bg-[var(--fg)]/5 px-2 py-0.5 rounded-full">{cliente.municipio}{cliente.uf ? `/${cliente.uf}` : ''}</span>}
                  {!cliente.ativo && <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-semibold">Desabilitado</span>}
```

- [ ] **Step 5: Checkbox "Mostrar desabilitados" + badge em `components/pessoal/ClientesListaPessoal.tsx`**

Mesma alteração da Task 5 Step 5, adaptada pro Pessoal (chave de `useFiltroPersistente` vira `'clientes-pessoal:mostrarDesabilitados'`, componente `ClientesListaPessoal`). Depois de `const [filtroRegime, setFiltroRegime] = useFiltroPersistente('clientes-pessoal:regime', 'TODOS')`, adicionar:

```ts
  const [mostrarDesabilitados, setMostrarDesabilitados] = useFiltroPersistente('clientes-pessoal:mostrarDesabilitados', false)
```

No `filtrados`, adicionar a condição:

```ts
    if (filtroRegime !== 'TODOS' && c.regime !== filtroRegime) return false
    if (!mostrarDesabilitados && c.ativo === false) return false
    return true
  }), [clientes, busca, filtroResponsavel, filtroRegime, mostrarDesabilitados])
```

Depois do `<select>` de regime, adicionar o checkbox (mesmo bloco JSX da Task 5 Step 5).

Na área de badges de cada linha, adicionar o badge "Desabilitado" (mesmo bloco JSX da Task 5 Step 5).

- [ ] **Step 6: Filtrar `ativo = true` nas telas de contagem/relatório do Pessoal**

Em `app/pessoal/dashboard/page.tsx`, trocar:

```ts
    supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).order('nome'),
```

por:

```ts
    supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).eq('clientes_pessoal.ativo', true).order('nome'),
```

Em `app/pessoal/relatorios/page.tsx`, trocar:

```ts
  let clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).order('nome')
```

por:

```ts
  let clientesQ = supabase.from('clientes').select(SELECT_CLIENTE_PESSOAL).eq('clientes_pessoal.ativo', true).order('nome')
```

- [ ] **Step 7: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add app/pessoal/clientes/actions.ts components/pessoal/ClientePessoalAcoes.tsx app/pessoal/clientes/[id]/page.tsx components/pessoal/ClientesListaPessoal.tsx app/pessoal/dashboard/page.tsx app/pessoal/relatorios/page.tsx
git commit -m "feat: desabilitar/reabilitar cliente no setor Pessoal"
```

---

### Task 7: Build final e roteiro de teste manual

**Files:** nenhum novo — verificação apenas.

- [ ] **Step 1: Build completo**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo, todas as rotas existentes, nenhuma rota nova (essa mudança não adiciona rota).

- [ ] **Step 2: Roteiro de teste manual (documentado — só executar se o usuário pedir)**

1. Abrir um cliente de teste no Fiscal (dev), ainda ativo. Confirmar que aparece o botão "Desabilitar" ao lado de "Editar"/"Excluir".
2. Clicar em "Desabilitar" — confirmar que o modal abre, o botão "Desabilitar" do modal fica desabilitado até nome **e** senha estarem preenchidos, e que digitar o nome errado ou a senha errada mostra "Senha incorreta." sem fechar o modal.
3. Confirmar com nome certo + senha certa — modal fecha, a página atualiza mostrando a badge "Desabilitado" no header e o botão vira "Reabilitar".
4. Ir para `/fiscal/clientes` — confirmar que o cliente desabilitado não aparece na lista por padrão, e que marcar "Mostrar desabilitados" o traz de volta com a badge "Desabilitado".
5. Ir para `/fiscal/dashboard` — confirmar que "Total de Clientes" e o progresso geral não contam mais esse cliente.
6. Ir para `/fiscal/tarefas` — confirmar que o cliente não aparece na visão geral do mês.
7. Voltar no cliente e clicar "Reabilitar" (sem pedir senha) — confirmar que ele volta a aparecer normalmente em `/fiscal/clientes` e nas contagens do dashboard.
8. Repetir os passos 1-7 num cliente de teste do Contábil e um do Pessoal, confirmando que desabilitar num setor não afeta o mesmo cliente nos outros setores (se ele estiver cadastrado em mais de um).

- [ ] **Step 3: Nota final**

Nenhum step de commit aqui — esta task é só verificação. Se o build ou o roteiro manual revelar algo quebrado, corrigir na task correspondente (4, 5 ou 6) e recomitar lá.
