# Clientes: Visibilidade Total + Filtros Persistentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo usuário autenticado passa a ver todos os clientes na tela de Clientes, mas só o responsável (+ admin) pode editar qualquer coisa relacionada a um cliente; e todos os filtros de listagem do sistema (Clientes, Relatórios, Parcelamentos, Conferência, Histórico) passam a persistir por sessão de navegador em vez de resetar ao trocar de tela.

**Architecture:** Duas mudanças independentes, um PR: (1) remove os dois pontos de bloqueio de visibilidade existentes e adiciona uma checagem de permissão (`podeEditarCliente`) tanto na UI (esconder/desabilitar controles) quanto em cada Server Action que grava dado de cliente (defesa real, já que essas actions usam o client com service role e hoje não checam papel nenhum); (2) hook único `useFiltroPersistente` que troca `useState` por uma versão sincronizada com `sessionStorage`, aplicado nos 14 filtros já mapeados.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS + Auth), TypeScript. Projeto não tem framework de teste automatizado (sem jest/vitest) — verificação é por type-check (`tsc --noEmit`) a cada passo de código, mais uma checagem manual no navegador com o Preview tool ao final de cada parte, usando um usuário de teste criado e removido via script (mesmo padrão já usado nas correções anteriores deste projeto).

---

## Parte A — Clientes: visibilidade total, edição restrita ao responsável

### Task A1: Helper de permissão `podeEditarCliente`

**Files:**
- Modify: `lib/supabase/server.ts`

- [ ] **Step 1: Adicionar a função no fim do arquivo**

```typescript
// Verifica se o usuário logado pode editar um cliente específico:
// é admin, ou o nome dele bate (case-insensitive) com o responsável do cliente.
// Usa o client de sessão (respeita RLS) — select em profiles/clientes já é
// liberado pra qualquer autenticado pelas policies existentes.
export async function podeEditarCliente(clienteId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase.from('profiles').select('role,nome').eq('id', user.id).single()
  if (profile?.role === 'admin') return true

  const { data: cliente } = await supabase.from('clientes').select('responsavel').eq('id', clienteId).single()
  return !!profile?.nome && !!cliente?.responsavel && profile.nome.toLowerCase() === cliente.responsavel.toLowerCase()
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `lib/supabase/server.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/server.ts
git commit -m "feat: adiciona helper podeEditarCliente"
```

---

### Task A2: Remover filtro de visibilidade na lista de Clientes

**Files:**
- Modify: `app/fiscal/clientes/page.tsx:20-21`

- [ ] **Step 1: Remover a linha que filtra por responsável**

Old:
```typescript
  let clientesQ = supabase.from('clientes').select('*').order('nome')
  if (!isAdmin && profile?.nome) clientesQ = clientesQ.ilike('responsavel', profile.nome)
```

New:
```typescript
  const clientesQ = supabase.from('clientes').select('*').order('nome')
```

(`isAdmin` continua declarado — segue sendo usado embaixo? Verificar: se não for mais usado em nenhum outro lugar do arquivo, remover a variável `isAdmin` e a query de `profile` junto, já que sem o filtro elas ficam sem uso.)

- [ ] **Step 2: Conferir se `isAdmin`/`profile`/`user` ainda são usados no resto do arquivo**

Run: `grep -n "isAdmin\|profile\|user" app/fiscal/clientes/page.tsx`

Se não aparecerem mais em nenhum outro lugar (fora da declaração), remover também:
```typescript
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('nome,role').eq('id', user.id).single()
    : { data: null }
  const isAdmin = profile?.role === 'admin'
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/clientes/page.tsx
git commit -m "feat: lista de clientes mostra todos os clientes pra qualquer usuario"
```

---

### Task A3: Remover bloqueio de acesso e calcular `podeEditar` no detalhe do cliente

**Files:**
- Modify: `app/fiscal/clientes/[id]/page.tsx:32-33`, `:72-97`, `:131`

- [ ] **Step 1: Remover o gate de 404 por responsável**

Old:
```typescript
  const { data: cliente } = await supabase.from('clientes').select('*').eq('id', id).single()
  if (!cliente) notFound()

  // Não-admins só podem ver seus próprios clientes
  if (profile?.role !== 'admin' && cliente.responsavel?.toLowerCase() !== profile?.nome?.toLowerCase()) notFound()
```

New:
```typescript
  const { data: cliente } = await supabase.from('clientes').select('*').eq('id', id).single()
  if (!cliente) notFound()

  const podeEditar = profile?.role === 'admin' || cliente.responsavel?.toLowerCase() === profile?.nome?.toLowerCase()
```

- [ ] **Step 2: Checar permissão dentro da action `toggleTarefa` local, antes de gravar**

Old (início da função, linha ~72):
```typescript
  async function toggleTarefa(tipo: string, concluida: boolean, data?: string) {
    'use server'
    const { user, supabase } = await getAuthenticatedAdmin()
    if (!supabase) return
```

New:
```typescript
  async function toggleTarefa(tipo: string, concluida: boolean, data?: string) {
    'use server'
    if (!(await podeEditarCliente(id))) return
    const { user, supabase } = await getAuthenticatedAdmin()
    if (!supabase) return
```

- [ ] **Step 3: Importar `podeEditarCliente`**

No topo do arquivo, junto do import existente:
```typescript
import { createClient, getAuthenticatedAdmin, podeEditarCliente } from '@/lib/supabase/server'
```

- [ ] **Step 4: Passar `podeEditar` pros componentes filhos e esconder `ClienteAcoes` quando `false`**

Old:
```typescript
                <ClienteAcoes cliente={cliente} responsaveis={responsaveis} templates={templatesMap} />
```

New:
```typescript
                {podeEditar && <ClienteAcoes cliente={cliente} responsaveis={responsaveis} templates={templatesMap} />}
```

Old:
```typescript
      <TarefaChecklist
        clienteId={id}
        clienteNome={cliente.nome}
        grupo={cliente.grupo ?? 'normal'}
        tarefasPersonalizadas={cliente.tarefas_personalizadas ?? []}
        tarefas={tarefas ?? []}
        mes={mes}
        ano={ano}
        usuarioId={user.id}
        usuarioNome={profile?.nome ?? user.email ?? ''}
        mitInicial={cliente.mit ?? ''}
        onToggle={toggleTarefa}
      />

      <ClienteObs clienteId={id} obsInicial={observacao?.texto ?? ''} mes={mes} ano={ano} />

      <ClienteArquivos clienteId={id} arquivosIniciais={arquivos ?? []} />
```

New:
```typescript
      <TarefaChecklist
        clienteId={id}
        clienteNome={cliente.nome}
        grupo={cliente.grupo ?? 'normal'}
        tarefasPersonalizadas={cliente.tarefas_personalizadas ?? []}
        tarefas={tarefas ?? []}
        mes={mes}
        ano={ano}
        usuarioId={user.id}
        usuarioNome={profile?.nome ?? user.email ?? ''}
        mitInicial={cliente.mit ?? ''}
        onToggle={toggleTarefa}
        podeEditar={podeEditar}
      />

      <ClienteObs clienteId={id} obsInicial={observacao?.texto ?? ''} mes={mes} ano={ano} podeEditar={podeEditar} />

      <ClienteArquivos clienteId={id} arquivosIniciais={arquivos ?? []} podeEditar={podeEditar} />
```

- [ ] **Step 5: Type-check (vai falhar até as Tasks A4/A5/A6 adicionarem o prop `podeEditar` nos componentes — normal, checar de novo no fim da Task A6)**

Run: `npx tsc --noEmit`
Expected: erros do tipo `Property 'podeEditar' does not exist on type 'Props'` em TarefaChecklist/ClienteObs/ClienteArquivos — esperado nesta task, resolvido nas próximas 3

- [ ] **Step 6: Commit**

```bash
git add "app/fiscal/clientes/[id]/page.tsx"
git commit -m "feat: pagina de detalhe do cliente calcula e propaga podeEditar"
```

---

### Task A4: `TarefaChecklist` — desabilitar controles quando `!podeEditar`

**Files:**
- Modify: `components/fiscal/TarefaChecklist.tsx`

- [ ] **Step 1: Adicionar prop `podeEditar`**

Old:
```typescript
interface Props {
  clienteId: string
  clienteNome: string
  grupo: string
  tarefasPersonalizadas?: string[]
  tarefas: Tarefa[]
  mes: number
  ano: number
  usuarioId: string
  usuarioNome: string
  mitInicial?: string
  onToggle: (tipo: string, concluida: boolean, data?: string) => Promise<void>
  onOptimisticUnlock?: (tipo: string) => void
}
```

New:
```typescript
interface Props {
  clienteId: string
  clienteNome: string
  grupo: string
  tarefasPersonalizadas?: string[]
  tarefas: Tarefa[]
  mes: number
  ano: number
  usuarioId: string
  usuarioNome: string
  mitInicial?: string
  onToggle: (tipo: string, concluida: boolean, data?: string) => Promise<void>
  onOptimisticUnlock?: (tipo: string) => void
  podeEditar: boolean
}
```

- [ ] **Step 2: Receber o prop na assinatura da função**

Old:
```typescript
export default function TarefaChecklist({
  clienteId,
  clienteNome,
  grupo,
  tarefasPersonalizadas = [],
  tarefas,
  mes,
  ano,
  usuarioNome,
  mitInicial = '',
  onToggle,
  onOptimisticUnlock,
}: Props) {
```

New:
```typescript
export default function TarefaChecklist({
  clienteId,
  clienteNome,
  grupo,
  tarefasPersonalizadas = [],
  tarefas,
  mes,
  ano,
  usuarioNome,
  mitInicial = '',
  onToggle,
  onOptimisticUnlock,
  podeEditar,
}: Props) {
```

- [ ] **Step 3: Desabilitar checkboxes de sub-etapa (Recebido/Importado/Conferido)**

Old:
```typescript
                        <input
                          type="checkbox"
                          checked={mapaTarefa.get(tipo)?.[campo] ?? false}
                          disabled={feito || isPending || isUnlocking}
                          onChange={e => startTransition(() => atualizarSubEtapa(clienteId, mes, ano, tipo, campo, e.target.checked))}
                          className="w-3.5 h-3.5 accent-[#00CCEB]"
                        />
```

New:
```typescript
                        <input
                          type="checkbox"
                          checked={mapaTarefa.get(tipo)?.[campo] ?? false}
                          disabled={!podeEditar || feito || isPending || isUnlocking}
                          onChange={e => startTransition(() => atualizarSubEtapa(clienteId, mes, ano, tipo, campo, e.target.checked))}
                          className="w-3.5 h-3.5 accent-[#00CCEB]"
                        />
```

- [ ] **Step 4: Desabilitar o campo de data das demais tarefas**

Old:
```typescript
                  <input
                    type="text"
                    value={displayVal}
                    onChange={e => handleTextChange(tipo, e.target.value)}
                    onBlur={() => handleTextBlur(tipo)}
                    disabled={isPending || isUnlocking}
                    placeholder="DD/MM/AAAA"
```

New:
```typescript
                  <input
                    type="text"
                    value={displayVal}
                    onChange={e => handleTextChange(tipo, e.target.value)}
                    onBlur={() => handleTextBlur(tipo)}
                    disabled={!podeEditar || isPending || isUnlocking}
                    placeholder="DD/MM/AAAA"
```

- [ ] **Step 5: Esconder o botão "Desbloquear"**

Old:
```typescript
                {feito && (
                  <button
                    onClick={() => setUnlockingTipo(isUnlocking ? null : tipo)}
                    className="text-xs text-white/30 hover:text-white/60 px-2 py-1 rounded-lg border border-white/8 hover:border-white/20 transition-all whitespace-nowrap"
                  >
                    {isUnlocking ? 'Cancelar' : 'Desbloquear'}
                  </button>
                )}
```

New:
```typescript
                {feito && podeEditar && (
                  <button
                    onClick={() => setUnlockingTipo(isUnlocking ? null : tipo)}
                    className="text-xs text-white/30 hover:text-white/60 px-2 py-1 rounded-lg border border-white/8 hover:border-white/20 transition-all whitespace-nowrap"
                  >
                    {isUnlocking ? 'Cancelar' : 'Desbloquear'}
                  </button>
                )}
```

- [ ] **Step 6: Desabilitar o campo MIT**

Old:
```typescript
          <input
            type="text"
            value={mit}
            onChange={e => setMit(e.target.value)}
            onBlur={handleMITBlur}
            placeholder="Anotação MIT..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#00CCEB]/50 transition-colors"
          />
```

New:
```typescript
          <input
            type="text"
            value={mit}
            onChange={e => setMit(e.target.value)}
            onBlur={handleMITBlur}
            disabled={!podeEditar}
            placeholder="Anotação MIT..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#00CCEB]/50 transition-colors disabled:opacity-40"
          />
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros em `TarefaChecklist.tsx` (o erro do prop faltando em `[id]/page.tsx` desaparece pra este componente)

- [ ] **Step 8: Commit**

```bash
git add components/fiscal/TarefaChecklist.tsx
git commit -m "feat: TarefaChecklist desabilita controles quando usuario nao pode editar"
```

---

### Task A5: `ClienteObs` — modo somente-leitura quando `!podeEditar`

**Files:**
- Modify: `components/fiscal/ClienteObs.tsx`

- [ ] **Step 1: Adicionar prop `podeEditar` e esconder botão "Editar"**

Old:
```typescript
interface Props {
  clienteId: string
  obsInicial: string
  mes: number
  ano: number
}

export default function ClienteObs({ clienteId, obsInicial, mes, ano }: Props) {
  const [obs, setObs] = useState(obsInicial)
  const [editando, setEditando] = useState(false)
  const [isPending, startTransition] = useTransition()

  function salvar() {
    startTransition(async () => {
      await salvarObs(clienteId, mes, ano, obs)
      setEditando(false)
    })
  }

  return (
    <div className="mt-6 pt-5 border-t border-white/8">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">
          Observação
        </label>
        {!editando && (
          <button
            onClick={() => setEditando(true)}
            className="text-xs text-white/30 hover:text-white/70 px-2 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-all"
          >
            ✏ Editar
          </button>
        )}
      </div>
```

New:
```typescript
interface Props {
  clienteId: string
  obsInicial: string
  mes: number
  ano: number
  podeEditar: boolean
}

export default function ClienteObs({ clienteId, obsInicial, mes, ano, podeEditar }: Props) {
  const [obs, setObs] = useState(obsInicial)
  const [editando, setEditando] = useState(false)
  const [isPending, startTransition] = useTransition()

  function salvar() {
    startTransition(async () => {
      await salvarObs(clienteId, mes, ano, obs)
      setEditando(false)
    })
  }

  return (
    <div className="mt-6 pt-5 border-t border-white/8">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">
          Observação
        </label>
        {!editando && podeEditar && (
          <button
            onClick={() => setEditando(true)}
            className="text-xs text-white/30 hover:text-white/70 px-2 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-all"
          >
            ✏ Editar
          </button>
        )}
      </div>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros em `ClienteObs.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/fiscal/ClienteObs.tsx
git commit -m "feat: ClienteObs esconde edicao quando usuario nao pode editar"
```

---

### Task A6: `ClienteArquivos` — esconder upload/exclusão quando `!podeEditar`

**Files:**
- Modify: `components/fiscal/ClienteArquivos.tsx`

- [ ] **Step 1: Adicionar prop `podeEditar`**

Old:
```typescript
interface Props {
  clienteId: string
  arquivosIniciais: Arquivo[]
}
```

New:
```typescript
interface Props {
  clienteId: string
  arquivosIniciais: Arquivo[]
  podeEditar: boolean
}
```

Old:
```typescript
export default function ClienteArquivos({ clienteId, arquivosIniciais }: Props) {
```

New:
```typescript
export default function ClienteArquivos({ clienteId, arquivosIniciais, podeEditar }: Props) {
```

- [ ] **Step 2: Esconder o botão de anexar**

Old:
```typescript
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
          Planilhas Anexadas
        </h3>
        <label className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
          isPending
            ? 'opacity-50 pointer-events-none'
            : 'bg-[#00CCEB]/15 border-[#00CCEB]/40 text-[#00CCEB] hover:bg-[#00CCEB]/25'
        }`}>
          {isPending ? 'Enviando...' : '+ Anexar'}
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx,.csv"
            multiple
            className="hidden"
            onChange={handleUpload}
            disabled={isPending}
          />
        </label>
      </div>
```

New:
```typescript
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
          Planilhas Anexadas
        </h3>
        {podeEditar && (
          <label className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
            isPending
              ? 'opacity-50 pointer-events-none'
              : 'bg-[#00CCEB]/15 border-[#00CCEB]/40 text-[#00CCEB] hover:bg-[#00CCEB]/25'
          }`}>
            {isPending ? 'Enviando...' : '+ Anexar'}
            <input
              ref={inputRef}
              type="file"
              accept=".xls,.xlsx,.csv"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={isPending}
            />
          </label>
        )}
      </div>
```

- [ ] **Step 3: Esconder o botão de excluir arquivo**

Old:
```typescript
              <button
                onClick={() => handleExcluir(arq.id)}
                disabled={isPending}
                className="text-white/20 hover:text-red-400 text-sm px-2 py-1 rounded-lg border border-white/10 hover:border-red-400/30 transition-all opacity-0 group-hover:opacity-100"
              >
                ✕
              </button>
```

New:
```typescript
              {podeEditar && (
                <button
                  onClick={() => handleExcluir(arq.id)}
                  disabled={isPending}
                  className="text-white/20 hover:text-red-400 text-sm px-2 py-1 rounded-lg border border-white/10 hover:border-red-400/30 transition-all opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros em nenhum arquivo (última peça que fechava os erros pendentes da Task A3)

- [ ] **Step 5: Commit**

```bash
git add components/fiscal/ClienteArquivos.tsx
git commit -m "feat: ClienteArquivos esconde upload e exclusao quando usuario nao pode editar"
```

---

### Task A7: Checagem de permissão nas Server Actions (`app/fiscal/clientes/actions.ts`)

**Files:**
- Modify: `app/fiscal/clientes/actions.ts`

- [ ] **Step 1: Importar o helper e remover o `toggleTarefa` morto**

Old (topo do arquivo):
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from '@/lib/supabase/server'

export async function toggleTarefa(tarefaId: string, concluida: boolean) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
  await supabase
    .from('tarefas')
    .update({ concluida, concluida_em: concluida ? new Date().toISOString() : null })
    .eq('id', tarefaId)
  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/dashboard')
  revalidatePath('/fiscal/historico')
  revalidatePath('/fiscal/relatorios')
  revalidatePath('/fiscal/tarefas')
}
```

New:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, podeEditarCliente } from '@/lib/supabase/server'
```

(`toggleTarefa` removida — não é importada em lugar nenhum do app; o toggle real usado pela UI é a função local dentro de `app/fiscal/clientes/[id]/page.tsx`, já protegida na Task A3.)

- [ ] **Step 2: Proteger `desbloquearTarefa` (busca `cliente_id` da tarefa primeiro)**

Old:
```typescript
export async function desbloquearTarefa(
  tarefaId: string,
  motivo: string,
  usuarioNome: string,
  clienteNome: string,
  tarefaTipo: string,
  competencia: string,
) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  await supabase
    .from('tarefas')
    .update({ concluida: false, concluida_em: null, recebido: false, importado: false, conferido: false })
    .eq('id', tarefaId)
```

New:
```typescript
export async function desbloquearTarefa(
  tarefaId: string,
  motivo: string,
  usuarioNome: string,
  clienteNome: string,
  tarefaTipo: string,
  competencia: string,
) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return

  const { data: tarefa } = await supabase.from('tarefas').select('cliente_id').eq('id', tarefaId).single()
  if (!tarefa || !(await podeEditarCliente(tarefa.cliente_id))) return

  await supabase
    .from('tarefas')
    .update({ concluida: false, concluida_em: null, recebido: false, importado: false, conferido: false })
    .eq('id', tarefaId)
```

- [ ] **Step 3: Proteger `salvarMIT`**

Old:
```typescript
export async function salvarMIT(clienteId: string, valor: string) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
  await supabase.from('clientes').update({ mit: valor }).eq('id', clienteId)
}
```

New:
```typescript
export async function salvarMIT(clienteId: string, valor: string) {
  if (!(await podeEditarCliente(clienteId))) return
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
  await supabase.from('clientes').update({ mit: valor }).eq('id', clienteId)
}
```

- [ ] **Step 4: Proteger `salvarObs`**

Old:
```typescript
export async function salvarObs(clienteId: string, mes: number, ano: number, texto: string) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
  await supabase
    .from('observacoes_clientes')
    .upsert({ cliente_id: clienteId, mes, ano, texto }, { onConflict: 'cliente_id,mes,ano' })
}
```

New:
```typescript
export async function salvarObs(clienteId: string, mes: number, ano: number, texto: string) {
  if (!(await podeEditarCliente(clienteId))) return
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
  await supabase
    .from('observacoes_clientes')
    .upsert({ cliente_id: clienteId, mes, ano, texto }, { onConflict: 'cliente_id,mes,ano' })
}
```

- [ ] **Step 5: Proteger `uploadArquivo`**

Old:
```typescript
export async function uploadArquivo(clienteId: string, formData: FormData) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado' }
```

New:
```typescript
export async function uploadArquivo(clienteId: string, formData: FormData) {
  if (!(await podeEditarCliente(clienteId))) return { error: 'Não autorizado' }
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Não autorizado' }
```

- [ ] **Step 6: Proteger `excluirArquivo` (busca `cliente_id` do arquivo primeiro)**

Old:
```typescript
export async function excluirArquivo(arquivoId: string) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
  await supabase.from('client_files').delete().eq('id', arquivoId)
}
```

New:
```typescript
export async function excluirArquivo(arquivoId: string) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
  const { data: arquivo } = await supabase.from('client_files').select('cliente_id').eq('id', arquivoId).single()
  if (!arquivo || !(await podeEditarCliente(arquivo.cliente_id))) return
  await supabase.from('client_files').delete().eq('id', arquivoId)
}
```

- [ ] **Step 7: Proteger `atualizarSubEtapa`**

Old:
```typescript
export async function atualizarSubEtapa(
  clienteId: string,
  mes: number,
  ano: number,
  tipo: string,
  campo: 'recebido' | 'importado' | 'conferido',
  valor: boolean,
) {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
```

New:
```typescript
export async function atualizarSubEtapa(
  clienteId: string,
  mes: number,
  ano: number,
  tipo: string,
  campo: 'recebido' | 'importado' | 'conferido',
  valor: boolean,
) {
  if (!(await podeEditarCliente(clienteId))) return
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase) return
```

- [ ] **Step 8: Proteger `excluirCliente`**

Old:
```typescript
export async function excluirCliente(id: string) {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) throw new Error('Não autorizado')
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/clientes')
}
```

New:
```typescript
export async function excluirCliente(id: string) {
  if (!(await podeEditarCliente(id))) throw new Error('Não autorizado')
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) throw new Error('Não autorizado')
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/fiscal/clientes')
}
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 10: Commit**

```bash
git add app/fiscal/clientes/actions.ts
git commit -m "feat: server actions de clientes checam permissao antes de gravar"
```

---

### Task A8: Policy de RLS pro fluxo de edição via `EmpresaModal`

**Files:**
- Modify: `supabase/migrations/001_initial.sql` (documentação — o efetivo é rodar o SQL direto no Supabase)

- [ ] **Step 1: Adicionar a policy nova, logo após a policy `"Admin gerencia clientes"`**

Old:
```sql
create policy "Admin gerencia clientes"
  on clientes for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
```

New:
```sql
create policy "Admin gerencia clientes"
  on clientes for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Responsavel atualiza seu cliente"
  on clientes for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and lower(p.nome) = lower(clientes.responsavel))
  );
```

- [ ] **Step 2: Rodar o mesmo bloco `create policy "Responsavel atualiza seu cliente" ...` (Step 1, só a parte nova) no SQL Editor do Supabase, em produção**

Pedir confirmação ao usuário de que rodou antes de prosseguir pra verificação manual (Task A9) — sem isso, um responsável não-admin vai continuar tomando erro de RLS ao tentar salvar edição de cadastro.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_initial.sql
git commit -m "feat: policy de RLS permite responsavel atualizar seu proprio cliente"
```

---

### Task A9: Verificação manual — Parte A completa

**Files:** nenhum (só verificação)

- [ ] **Step 1: Descobrir um cliente real com `responsavel` preenchido, pra usar no teste**

Script temporário (`scripts/_tmp-buscar-cliente-teste.ts`, apagar depois de rodar):
```typescript
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
;(async () => {
  const { data } = await admin.from('clientes').select('id,nome,responsavel').not('responsavel', 'is', null).limit(1).single()
  console.log(data)
})()
```
Run: `npx tsx scripts/_tmp-buscar-cliente-teste.ts`
Anotar `id`, `nome`, `responsavel` do cliente retornado (vai ser "Cliente X" e "Responsável X" abaixo).

- [ ] **Step 2: Criar dois usuários de teste (um com o nome do responsável do Cliente X, outro sem relação nenhuma com ele)**

Script temporário (`scripts/_tmp-criar-usuarios-teste.ts`, apagar depois de rodar):
```typescript
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const RESPONSAVEL_CLIENTE_X = 'COLAR AQUI O responsavel DO STEP 1'

;(async () => {
  for (const [email, nome] of [
    ['teste-responsavel@tesserato-teste.com', RESPONSAVEL_CLIENTE_X],
    ['teste-outro@tesserato-teste.com', 'Ninguém Relacionado'],
  ] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: 'SenhaTeste123!', email_confirm: true })
    if (error) { console.log('erro criando', email, error); continue }
    await admin.from('profiles').update({ nome, role: 'operador' }).eq('id', data.user.id)
    console.log('criado:', email, '->', nome, data.user.id)
  }
})()
```
Run: `npx tsx scripts/_tmp-criar-usuarios-teste.ts`

- [ ] **Step 3: Verificar visibilidade e edição pelo navegador (Preview tool)**

1. Iniciar o dev server (`npm run dev`) via Preview tool.
2. Logar como `teste-outro@tesserato-teste.com` / `SenhaTeste123!`.
3. Abrir `/fiscal/clientes` — confirmar que o Cliente X aparece na lista (visibilidade total).
4. Abrir o detalhe do Cliente X — confirmar que a página abre (sem 404), mas: sem botões Editar/Excluir no cabeçalho, checkboxes do checklist desabilitados, sem botão "✏ Editar" em Observação, sem botão "+ Anexar" em Planilhas Anexadas, sem "✕" nos arquivos existentes (se houver).
5. Deslogar, logar como `teste-responsavel@tesserato-teste.com` / `SenhaTeste123!`.
6. Abrir o detalhe do Cliente X — confirmar que Editar/Excluir aparecem, checkboxes ficam habilitados, Observação e Arquivos ficam editáveis.
7. Clicar em "Editar" (abre `EmpresaModal`), mudar um campo qualquer (ex: `obs` ou `cor`) e salvar — confirmar que salva sem erro de RLS (valida a Task A8).

- [ ] **Step 4: Limpar usuários de teste e scripts temporários**

Script temporário (`scripts/_tmp-limpar-usuarios-teste.ts`, apagar depois de rodar):
```typescript
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
;(async () => {
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data.users) {
    if (u.email?.endsWith('@tesserato-teste.com')) {
      await admin.auth.admin.deleteUser(u.id)
      console.log('removido:', u.email)
    }
  }
})()
```
Run: `npx tsx scripts/_tmp-limpar-usuarios-teste.ts`

Depois: `rm scripts/_tmp-buscar-cliente-teste.ts scripts/_tmp-criar-usuarios-teste.ts scripts/_tmp-limpar-usuarios-teste.ts`

- [ ] **Step 5: Confirmar que todos os itens do Step 3 passaram antes de seguir pra Parte B**

---

## Parte B — Filtros persistentes por sessão

### Task B1: Hook `useFiltroPersistente`

**Files:**
- Create: `lib/use-filtro-persistente.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
import { useEffect, useState } from 'react'

export function useFiltroPersistente<T>(chave: string, valorInicial: T): [T, (valor: T) => void] {
  const [valor, setValorState] = useState<T>(valorInicial)

  useEffect(() => {
    const salvo = sessionStorage.getItem(chave)
    if (salvo === null) return
    try {
      setValorState(JSON.parse(salvo))
    } catch {
      // valor corrompido no storage — ignora, mantém o default
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setValor(novoValor: T) {
    setValorState(novoValor)
    sessionStorage.setItem(chave, JSON.stringify(novoValor))
  }

  return [valor, setValor]
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add lib/use-filtro-persistente.ts
git commit -m "feat: adiciona hook useFiltroPersistente"
```

---

### Task B2: Aplicar em `ClientesLista.tsx` (5 filtros)

**Files:**
- Modify: `components/fiscal/ClientesLista.tsx:1-50`

- [ ] **Step 1: Importar o hook**

Old:
```typescript
import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Cliente } from '@/lib/types'
import EmpresaModal from './EmpresaModal'
```

New:
```typescript
import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Cliente } from '@/lib/types'
import EmpresaModal from './EmpresaModal'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
```

- [ ] **Step 2: Trocar os 4 filtros + busca (busca não estava na lista original mas também é filtro de lista — persiste também)**

Old:
```typescript
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('TODOS')
  const [filtroGrupo, setFiltroGrupo] = useState('TODOS')
  const [filtroAtividade, setFiltroAtividade] = useState('TODOS')
  const [filtroPendencia, setFiltroPendencia] = useState(false)
```

New:
```typescript
  const [busca, setBusca] = useFiltroPersistente('clientes:busca', '')
  const [filtroResponsavel, setFiltroResponsavel] = useFiltroPersistente('clientes:responsavel', 'TODOS')
  const [filtroGrupo, setFiltroGrupo] = useFiltroPersistente('clientes:grupo', 'TODOS')
  const [filtroAtividade, setFiltroAtividade] = useFiltroPersistente('clientes:atividade', 'TODOS')
  const [filtroPendencia, setFiltroPendencia] = useFiltroPersistente('clientes:pendencia', false)
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add components/fiscal/ClientesLista.tsx
git commit -m "feat: filtros de Clientes persistem por sessao"
```

---

### Task B3: Aplicar em `app/fiscal/relatorios/page.tsx` (4 filtros)

**Files:**
- Modify: `app/fiscal/relatorios/page.tsx:1-33`

- [ ] **Step 1: Importar o hook**

Old:
```typescript
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Cliente, Tarefa } from '@/lib/types'
import { useMesAno } from '@/lib/mes-atual-context'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
```

New:
```typescript
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Cliente, Tarefa } from '@/lib/types'
import { useMesAno } from '@/lib/mes-atual-context'
import { buscarTodasTarefasDoMes } from '@/lib/tarefas-paginacao'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
```

- [ ] **Step 2: Trocar os 4 filtros**

Old:
```typescript
  const [filtroResp, setFiltroResp] = useState('TODOS')
  const [filtroGrupo, setFiltroGrupo] = useState('TODOS')
  const [filtroAtividade, setFiltroAtividade] = useState('TODAS')
  const [apenasP, setApenasP] = useState(false)
```

New:
```typescript
  const [filtroResp, setFiltroResp] = useFiltroPersistente('relatorios:responsavel', 'TODOS')
  const [filtroGrupo, setFiltroGrupo] = useFiltroPersistente('relatorios:grupo', 'TODOS')
  const [filtroAtividade, setFiltroAtividade] = useFiltroPersistente('relatorios:atividade', 'TODAS')
  const [apenasP, setApenasP] = useFiltroPersistente('relatorios:pendencia', false)
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/relatorios/page.tsx
git commit -m "feat: filtros de Relatorios persistem por sessao"
```

---

### Task B4: Aplicar em `app/fiscal/parcelamentos/page.tsx` (3 filtros)

**Files:**
- Modify: `app/fiscal/parcelamentos/page.tsx:1-66`

- [ ] **Step 1: Importar o hook**

Old:
```typescript
import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMesAno } from '@/lib/mes-atual-context'
```

New:
```typescript
import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMesAno } from '@/lib/mes-atual-context'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
```

- [ ] **Step 2: Trocar os 3 filtros (`search`, `secaoFiltro`, `respFiltro`) — os outros `useState` da linha 67 em diante (`expandedId`, `modalOpen`, etc.) NÃO mudam, não são filtro de lista**

Old:
```typescript
  const [search, setSearch] = useState('')
  const [secaoFiltro, setSecaoFiltro] = useState('TODOS')
  const [respFiltro, setRespFiltro] = useState('TODOS')
```

New:
```typescript
  const [search, setSearch] = useFiltroPersistente('parcelamentos:busca', '')
  const [secaoFiltro, setSecaoFiltro] = useFiltroPersistente('parcelamentos:secao', 'TODOS')
  const [respFiltro, setRespFiltro] = useFiltroPersistente('parcelamentos:responsavel', 'TODOS')
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/parcelamentos/page.tsx
git commit -m "feat: filtros de Parcelamentos persistem por sessao"
```

---

### Task B5: Aplicar em `app/fiscal/conferencia/page.tsx` (1 filtro)

**Files:**
- Modify: `app/fiscal/conferencia/page.tsx:1-53`

- [ ] **Step 1: Importar o hook**

Old:
```typescript
import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import type { Cliente } from '@/lib/types'
```

New:
```typescript
import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import type { Cliente } from '@/lib/types'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
```

- [ ] **Step 2: Trocar `busca` (os outros `useState` da linha 52+ como `clienteSel`, `arquivosDTE` etc. NÃO mudam, não são filtro de lista)**

Old:
```typescript
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busca, setBusca] = useState('')
```

New:
```typescript
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busca, setBusca] = useFiltroPersistente('conferencia:busca', '')
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/conferencia/page.tsx
git commit -m "feat: filtro de busca de Conferencia persiste por sessao"
```

---

### Task B6: Aplicar em `app/fiscal/historico/page.tsx` (1 filtro)

**Files:**
- Modify: `app/fiscal/historico/page.tsx:1-20`

- [ ] **Step 1: Importar o hook**

Old:
```typescript
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cliente, Tarefa } from '@/lib/types'
import { useMesAno } from '@/lib/mes-atual-context'
```

New:
```typescript
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cliente, Tarefa } from '@/lib/types'
import { useMesAno } from '@/lib/mes-atual-context'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
```

- [ ] **Step 2: Trocar `selectedResp` (os outros `useState` da linha 18-22 como `clientes`, `tarefas`, `loading`, `isAdmin` NÃO mudam, não são filtro)**

Old:
```typescript
  const [selectedResp, setSelectedResp] = useState<string | null>(null)
```

New:
```typescript
  const [selectedResp, setSelectedResp] = useFiltroPersistente<string | null>('historico:responsavel', null)
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/historico/page.tsx
git commit -m "feat: filtro de responsavel de Historico persiste por sessao"
```

---

### Task B7: Verificação manual — Parte B completa

**Files:** nenhum (só verificação)

- [ ] **Step 1: Pelo Preview tool, com o dev server rodando e logado (qualquer usuário)**

Pra cada tela — Clientes, Relatórios, Parcelamentos, Conferência, Histórico:
1. Mudar pelo menos um filtro (ex: escolher um responsável específico no dropdown, digitar algo na busca).
2. Navegar pra outra tela (ex: Dashboard) usando o menu lateral.
3. Voltar pra tela original.
4. Confirmar que o filtro continua com o valor escolhido (não voltou pro default).
5. Dar refresh na página (F5).
6. Confirmar que o filtro continua com o valor escolhido (sessionStorage sobrevive a refresh).

- [ ] **Step 2: Confirmar isolamento por chave**

Em Clientes, mudar o filtro de responsável. Ir em Relatórios, confirmar que o filtro de responsável de lá começa em "TODOS" (não herdou o valor de Clientes — chaves são independentes).

- [ ] **Step 3: Confirmar que todos os itens acima passaram**

---

## Fim do plano

Depois de Parte A e Parte B verificadas, o trabalho está pronto pra passar pelo fluxo de versionamento (`anthropic-skills:git-versioning`) — branch já criada (`v0.7.0`), specs já commitadas, falta só o CHANGELOG + PR.
