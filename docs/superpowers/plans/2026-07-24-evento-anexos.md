# Anexar arquivos ao Evento (tarefas_avulsas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um Evento (`tarefas_avulsas`) pode ter múltiplos arquivos anexados, tanto na criação quanto depois num evento já existente, reaproveitando o padrão de anexos já usado pelas tarefas (`tarefa_arquivos` + rota genérica de servir arquivo).

**Architecture:** Nova tabela `evento_arquivos` (mesma forma de `tarefa_arquivos`: base64 na própria linha, sem Storage), servida pela rota genérica já existente `app/api/arquivos/[tabela]/[id]/route.ts` (só ganha uma entrada no mapa). Backend novo em `lib/tarefas-avulsas.ts` (upload/exclusão de anexo + `criarTarefaAvulsa` passa a retornar o id criado + a busca do mês já traz os anexos). UI: `EventoAvulsoModal.tsx` ganha um input de arquivo múltiplo na criação; `EventosAvulsosSecao.tsx` ganha a lista de anexos por evento com adicionar/remover depois.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Supabase (Postgres + PostgREST + RLS), TypeScript, Tailwind v4. Sem framework de testes automatizado neste repo — verificação via `npx tsc --noEmit -p .` e `npm run build`.

## Global Constraints

- Tipos de arquivo permitidos: PDF, PNG, JPG/JPEG, XLS/XLSX, DOCX (mesma whitelist de `TIPOS_PERMITIDOS_TAREFA` hoje em `app/fiscal/clientes/actions.ts`). Tamanho máximo: 10MB por arquivo.
- Arquivo guardado como `content_base64` na própria linha da tabela — sem Supabase Storage, mesmo padrão de `tarefa_arquivos`/`client_files`.
- `evento_arquivos` é criada com `on delete cascade` a partir de `tarefas_avulsas` — excluir o Evento já apaga seus anexos automaticamente, sem precisar tocar em `excluirTarefaAvulsa`.
- A migration (`create table`, DDL) só é aplicada no banco de dev (`fcpcorqquovvgtoukxry`) e precisa ser rodada manualmente pelo usuário no SQL Editor do Supabase (não dá pra aplicar DDL via REST insert). Nunca em produção.
- Sem mudança em título/descrição/data do Evento, nem nas actions `toggleTarefaAvulsa`/`excluirTarefaAvulsa` além do que já foi dito.

---

### Task 1: Migration — tabela `evento_arquivos` (dev)

**Files:**
- Create: `supabase/migrations/015_evento_arquivos.sql`

**Interfaces:**
- Produces: tabela `evento_arquivos(id, evento_id, name, size, content_base64, uploaded_at)` — consumida pela Task 2 (server actions) e pela Task 3 (rota de servir arquivo).

- [ ] **Step 1: Criar o arquivo da migration**

```sql
-- supabase/migrations/015_evento_arquivos.sql

-- Anexos de Evento (tarefas_avulsas) — mesmo padrão de tarefa_arquivos:
-- arquivo guardado como base64 na própria linha, sem Supabase Storage.
-- Ver docs/superpowers/specs/2026-07-24-evento-anexos-design.md
create table evento_arquivos (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid references tarefas_avulsas(id) on delete cascade not null,
  name           text not null,
  size           integer not null,
  content_base64 text not null,
  uploaded_at    timestamptz not null default now()
);

create index idx_evento_arquivos_evento_id on evento_arquivos (evento_id);

alter table evento_arquivos enable row level security;

create policy "Setor le arquivos de seus eventos" on evento_arquivos for select using (
  is_admin() or exists (
    select 1 from tarefas_avulsas ev
    join profiles p on p.id = auth.uid()
    where ev.id = evento_arquivos.evento_id and ev.setor = any(p.setores)
  )
);

create policy "Setor gerencia arquivos de seus eventos" on evento_arquivos for all using (
  is_admin() or exists (
    select 1 from tarefas_avulsas ev
    join profiles p on p.id = auth.uid()
    where ev.id = evento_arquivos.evento_id and ev.setor = any(p.setores)
  )
);
```

- [ ] **Step 2: Commit (sem aplicar ainda — é DDL, o usuário roda manualmente no SQL Editor do Supabase de dev)**

```bash
git add supabase/migrations/015_evento_arquivos.sql
git commit -m "feat: migration cria tabela evento_arquivos (anexos de Evento, dev)"
```

---

### Task 2: Backend — constantes compartilhadas, tipo, rota, e actions de anexo

**Files:**
- Create: `lib/anexos.ts`
- Modify: `lib/types.ts` (adiciona `EventoArquivo`, estende `TarefaAvulsaComCriador`... não, `TarefaAvulsaComCriador` fica em `lib/tarefas-avulsas.ts`, não em `types.ts` — ver Task 3)
- Modify: `app/fiscal/clientes/actions.ts:193-202,261-266` (usa as constantes compartilhadas em vez de declarar localmente)
- Modify: `app/api/arquivos/[tabela]/[id]/route.ts:4-7` (novo mapeamento `evento`)

**Interfaces:**
- Produces: `TIPOS_ARQUIVO_PERMITIDOS: string[]` e `TAMANHO_MAX_ARQUIVO: number` (de `lib/anexos.ts`) — consumidos pela Task 3. `EventoArquivo` interface (de `lib/types.ts`) — consumida pela Task 3. Rota `/api/arquivos/evento/{id}` funcional assim que a Task 1 estiver aplicada no dev — consumida pelas Tasks 4 e 5 (links de abrir/baixar anexo).
- Consumes: nenhuma interface de outra task deste plano (a tabela da Task 1 só precisa existir no banco quando a Task 3 fizer upload de verdade — o código desta task compila independente disso).

- [ ] **Step 1: Criar `lib/anexos.ts` com as constantes compartilhadas**

```ts
// lib/anexos.ts

export const TIPOS_ARQUIVO_PERMITIDOS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]

export const TAMANHO_MAX_ARQUIVO = 10 * 1024 * 1024 // 10 MB
```

- [ ] **Step 2: Atualizar `app/fiscal/clientes/actions.ts` pra usar as constantes compartilhadas**

Adicionar o import no topo do arquivo (depois da linha `import { getAuthenticatedAdmin, podeEditarCliente } from '@/lib/supabase/server'`):

```ts
import { TIPOS_ARQUIVO_PERMITIDOS, TAMANHO_MAX_ARQUIVO } from '@/lib/anexos'
```

Remover a declaração local (linhas 193-202):

```ts
const TIPOS_PERMITIDOS_TAREFA = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]
const TAMANHO_MAX_ARQUIVO_TAREFA = 10 * 1024 * 1024 // 10 MB
```

Trocar os dois usos em `uploadArquivoTarefa` (linhas 261-266):

```ts
  if (!TIPOS_PERMITIDOS_TAREFA.includes(arquivo.type)) {
    return { error: 'Tipo de arquivo não permitido. Use PDF, PNG, JPG, XLSX ou DOCX.' }
  }
  if (arquivo.size > TAMANHO_MAX_ARQUIVO_TAREFA) {
    return { error: 'Arquivo muito grande. Máximo permitido: 10 MB.' }
  }
```

por:

```ts
  if (!TIPOS_ARQUIVO_PERMITIDOS.includes(arquivo.type)) {
    return { error: 'Tipo de arquivo não permitido. Use PDF, PNG, JPG, XLSX ou DOCX.' }
  }
  if (arquivo.size > TAMANHO_MAX_ARQUIVO) {
    return { error: 'Arquivo muito grande. Máximo permitido: 10 MB.' }
  }
```

- [ ] **Step 3: Adicionar `EventoArquivo` em `lib/types.ts`**

Depois da interface `TarefaArquivo` (linhas 184-191), adicionar:

```ts
export interface EventoArquivo {
  id: string
  evento_id: string
  name: string
  size: number
  content_base64: string
  uploaded_at: string
}
```

- [ ] **Step 4: Adicionar `evento` ao mapa `TABELAS` da rota de servir arquivo**

Em `app/api/arquivos/[tabela]/[id]/route.ts`, trocar (linhas 4-7):

```ts
const TABELAS: Record<string, string> = {
  tarefa: 'tarefa_arquivos',
  client: 'client_files',
}
```

por:

```ts
const TABELAS: Record<string, string> = {
  tarefa: 'tarefa_arquivos',
  client: 'client_files',
  evento: 'evento_arquivos',
}
```

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/anexos.ts lib/types.ts app/fiscal/clientes/actions.ts app/api/arquivos/[tabela]/[id]/route.ts
git commit -m "feat: constantes de anexo compartilhadas, tipo EventoArquivo, rota reconhece evento_arquivos"
```

---

### Task 3: Backend — actions de Evento com suporte a anexo (`lib/tarefas-avulsas.ts`)

**Files:**
- Modify: `lib/tarefas-avulsas.ts` (arquivo inteiro — 77 linhas hoje)

**Interfaces:**
- Consumes: `TIPOS_ARQUIVO_PERMITIDOS`/`TAMANHO_MAX_ARQUIVO` de `lib/anexos.ts` (Task 2), `EventoArquivo` de `lib/types.ts` (Task 2).
- Produces:
  - `criarTarefaAvulsa(input): Promise<{ id: string } | { error: string }>` (mudou de `Promise<void>` — retorna o id do evento criado)
  - `uploadArquivoEvento(eventoId: string, clienteId: string, setor: UserSetor, formData: FormData): Promise<{ error: string | null }>`
  - `excluirArquivoEvento(arquivoId: string, clienteId: string, setor: UserSetor): Promise<void>`
  - `TarefaAvulsaComCriador` ganha o campo `arquivos: Omit<EventoArquivo, 'content_base64'>[]`
  - Consumidos pelas Tasks 4 e 5.

- [ ] **Step 1: Atualizar os imports no topo do arquivo**

Trocar:

```ts
import type { TarefaAvulsa, UserSetor } from './types'
```

por:

```ts
import type { TarefaAvulsa, UserSetor, EventoArquivo } from './types'
import { TIPOS_ARQUIVO_PERMITIDOS, TAMANHO_MAX_ARQUIVO } from './anexos'
```

- [ ] **Step 2: Estender `TarefaAvulsaComCriador` com o campo `arquivos`**

Trocar:

```ts
export interface TarefaAvulsaComCriador extends TarefaAvulsa {
  criado_por_nome: string | null
}
```

por:

```ts
export interface TarefaAvulsaComCriador extends TarefaAvulsa {
  criado_por_nome: string | null
  arquivos: Omit<EventoArquivo, 'content_base64'>[]
}
```

- [ ] **Step 3: `buscarTarefasAvulsasDoMes` passa a trazer os anexos de cada evento**

Trocar a função inteira:

```ts
export async function buscarTarefasAvulsasDoMes(
  clienteId: string,
  setor: UserSetor,
  mes: number,
  ano: number,
): Promise<TarefaAvulsaComCriador[]> {
  const supabase = await createClient()
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
  const proxMes = mes === 12 ? 1 : mes + 1
  const proxAno = mes === 12 ? ano + 1 : ano
  const fim = `${proxAno}-${String(proxMes).padStart(2, '0')}-01`

  const { data } = await supabase
    .from('tarefas_avulsas')
    .select('*, profiles(nome)')
    .eq('cliente_id', clienteId)
    .eq('setor', setor)
    .gte('data', inicio)
    .lt('data', fim)
    .order('data')

  return (data ?? []).map(row => {
    const { profiles, ...resto } = row as unknown as { profiles: { nome: string } | null } & TarefaAvulsa
    return { ...resto, criado_por_nome: profiles?.nome ?? null }
  })
}
```

por:

```ts
export async function buscarTarefasAvulsasDoMes(
  clienteId: string,
  setor: UserSetor,
  mes: number,
  ano: number,
): Promise<TarefaAvulsaComCriador[]> {
  const supabase = await createClient()
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
  const proxMes = mes === 12 ? 1 : mes + 1
  const proxAno = mes === 12 ? ano + 1 : ano
  const fim = `${proxAno}-${String(proxMes).padStart(2, '0')}-01`

  const { data } = await supabase
    .from('tarefas_avulsas')
    .select('*, profiles(nome), evento_arquivos(id, evento_id, name, size, uploaded_at)')
    .eq('cliente_id', clienteId)
    .eq('setor', setor)
    .gte('data', inicio)
    .lt('data', fim)
    .order('data')

  return (data ?? []).map(row => {
    const { profiles, evento_arquivos, ...resto } = row as unknown as {
      profiles: { nome: string } | null
      evento_arquivos: Omit<EventoArquivo, 'content_base64'>[]
    } & TarefaAvulsa
    return { ...resto, criado_por_nome: profiles?.nome ?? null, arquivos: evento_arquivos ?? [] }
  })
}
```

- [ ] **Step 4: `criarTarefaAvulsa` passa a retornar o id do evento criado**

Trocar:

```ts
export async function criarTarefaAvulsa(input: {
  clienteId: string
  setor: UserSetor
  titulo: string
  descricao: string | null
  data: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('tarefas_avulsas').insert({
    cliente_id: input.clienteId,
    setor: input.setor,
    titulo: input.titulo,
    descricao: input.descricao,
    data: input.data,
    criado_por: user.id,
  })

  revalidatePath(`/${input.setor}/clientes/${input.clienteId}`)
}
```

por:

```ts
export async function criarTarefaAvulsa(input: {
  clienteId: string
  setor: UserSetor
  titulo: string
  descricao: string | null
  data: string
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  const { data: novo, error } = await supabase.from('tarefas_avulsas').insert({
    cliente_id: input.clienteId,
    setor: input.setor,
    titulo: input.titulo,
    descricao: input.descricao,
    data: input.data,
    criado_por: user.id,
  }).select('id').single()

  if (error || !novo) return { error: error?.message ?? 'Falha ao criar evento' }

  revalidatePath(`/${input.setor}/clientes/${input.clienteId}`)
  return { id: novo.id }
}
```

- [ ] **Step 5: Adicionar `uploadArquivoEvento` e `excluirArquivoEvento` no final do arquivo**

Depois da função `excluirTarefaAvulsa`, adicionar:

```ts
export async function uploadArquivoEvento(
  eventoId: string,
  clienteId: string,
  setor: UserSetor,
  formData: FormData,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  const arquivo = formData.get('arquivo') as File | null
  if (!arquivo) return { error: 'Nenhum arquivo' }
  if (!TIPOS_ARQUIVO_PERMITIDOS.includes(arquivo.type)) {
    return { error: 'Tipo de arquivo não permitido. Use PDF, PNG, JPG, XLSX ou DOCX.' }
  }
  if (arquivo.size > TAMANHO_MAX_ARQUIVO) {
    return { error: 'Arquivo muito grande. Máximo permitido: 10 MB.' }
  }

  const bytes = await arquivo.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const { error } = await supabase.from('evento_arquivos').insert({
    evento_id: eventoId,
    name: arquivo.name,
    size: arquivo.size,
    content_base64: base64,
    uploaded_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }

  revalidatePath(`/${setor}/clientes/${clienteId}`)
  return { error: null }
}

export async function excluirArquivoEvento(arquivoId: string, clienteId: string, setor: UserSetor) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('evento_arquivos').delete().eq('id', arquivoId)

  revalidatePath(`/${setor}/clientes/${clienteId}`)
}
```

- [ ] **Step 6: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: erros nos dois arquivos que ainda usam a assinatura antiga de `criarTarefaAvulsa` sem checar o retorno (`components/geral/EventoAvulsoModal.tsx`) — isso é esperado, a Task 4 resolve. Confirmar que não há erro dentro do próprio `lib/tarefas-avulsas.ts`.

- [ ] **Step 7: Commit**

```bash
git add lib/tarefas-avulsas.ts
git commit -m "feat: actions de anexo de Evento (upload/exclusao), criarTarefaAvulsa retorna id, busca do mes traz anexos"
```

---

### Task 4: UI — anexar na criação (`components/geral/EventoAvulsoModal.tsx`)

**Files:**
- Modify: `components/geral/EventoAvulsoModal.tsx` (arquivo inteiro — 82 linhas hoje)

**Interfaces:**
- Consumes: `criarTarefaAvulsa` (retorno mudou pra `{ id: string } | { error: string }`, Task 3), `uploadArquivoEvento(eventoId, clienteId, setor, formData)` (Task 3).

- [ ] **Step 1: Reescrever o componente inteiro**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarTarefaAvulsa, uploadArquivoEvento } from '@/lib/tarefas-avulsas'
import type { UserSetor } from '@/lib/types'

interface Props {
  clienteId: string
  setor: UserSetor
  onClose: () => void
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function EventoAvulsoModal({ clienteId, setor, onClose }: Props) {
  const router = useRouter()
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [data, setData] = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function handleSelecionarArquivos(files: FileList | null) {
    if (!files) return
    setArquivos(prev => [...prev, ...Array.from(files)])
  }

  function handleRemoverArquivoSelecionado(idx: number) {
    setArquivos(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!titulo.trim() || !data) { setErro('Título e data são obrigatórios.'); return }
    setSaving(true)
    setErro(null)

    const resultado = await criarTarefaAvulsa({ clienteId, setor, titulo: titulo.trim(), descricao: descricao.trim() || null, data })
    if ('error' in resultado) {
      setSaving(false)
      setErro(resultado.error)
      return
    }

    for (const arquivo of arquivos) {
      const formData = new FormData()
      formData.append('arquivo', arquivo)
      const uploadResult = await uploadArquivoEvento(resultado.id, clienteId, setor, formData)
      if (uploadResult.error) setErro(prev => prev ? `${prev} · ${uploadResult.error}` : uploadResult.error)
    }

    setSaving(false)
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Novo evento</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div>
            <label className={labelCls}>Título *</label>
            <input className={inputCls} value={titulo} onChange={e => setTitulo(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Descrição</label>
            <textarea className={inputCls} rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Data *</label>
            <input className={inputCls} type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Anexos</label>
            <label className="inline-block text-xs px-3 py-2 rounded-lg border border-[var(--fg)]/12 text-[var(--fg)]/60 hover:text-[var(--fg)] cursor-pointer transition-colors">
              + Selecionar arquivo(s)
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"
                multiple
                className="hidden"
                onChange={e => handleSelecionarArquivos(e.target.files)}
              />
            </label>
            {arquivos.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {arquivos.map((arq, idx) => (
                  <span key={idx} className="flex items-center gap-1.5 text-[10px] bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 px-2 py-1 rounded-lg">
                    📎 {arq.name}
                    <button type="button" onClick={() => handleRemoverArquivoSelecionado(idx)}
                      className="text-[var(--fg)]/40 hover:text-red-400 font-bold">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !titulo.trim() || !data}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar evento'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

(Nota: `setErro(prev => ...)` dentro do loop de upload usa a forma funcional do setState porque o loop é sequencial e cada iteração precisa ver o erro acumulado da anterior — sem isso, uploads que falham em sequência se sobrescreveriam um ao outro.)

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/geral/EventoAvulsoModal.tsx
git commit -m "feat: modal de criar Evento permite selecionar e anexar multiplos arquivos"
```

---

### Task 5: UI — listar, adicionar e remover anexos depois (`components/geral/EventosAvulsosSecao.tsx`)

**Files:**
- Modify: `components/geral/EventosAvulsosSecao.tsx` (arquivo inteiro — 89 linhas hoje)

**Interfaces:**
- Consumes: `uploadArquivoEvento`, `excluirArquivoEvento` (Task 3), `TarefaAvulsaComCriador.arquivos` (Task 3), rota `/api/arquivos/evento/{id}` (Task 2).

- [ ] **Step 1: Reescrever o componente inteiro**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { toggleTarefaAvulsa, excluirTarefaAvulsa, uploadArquivoEvento, excluirArquivoEvento, type TarefaAvulsaComCriador } from '@/lib/tarefas-avulsas'
import EventoAvulsoModal from './EventoAvulsoModal'
import type { UserSetor } from '@/lib/types'

interface Props {
  clienteId: string
  setor: UserSetor
  eventos: TarefaAvulsaComCriador[]
  podeEditar: boolean
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function EventosAvulsosSecao({ clienteId, setor, eventos, podeEditar }: Props) {
  const [modalAberto, setModalAberto] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [erroUpload, setErroUpload] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  function handleToggle(id: string, concluida: boolean) {
    startTransition(() => { toggleTarefaAvulsa(id, clienteId, setor, concluida) })
  }

  function handleExcluir(id: string) {
    startTransition(() => { excluirTarefaAvulsa(id, clienteId, setor) })
    setExcluindoId(null)
  }

  async function handleUploadArquivo(eventoId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingId(eventoId)
    setErroUpload(prev => { const n = { ...prev }; delete n[eventoId]; return n })
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('arquivo', file)
        const result = await uploadArquivoEvento(eventoId, clienteId, setor, formData)
        if (result.error) setErroUpload(prev => ({ ...prev, [eventoId]: result.error! }))
      }
    } finally {
      setUploadingId(null)
    }
  }

  function handleExcluirArquivo(arquivoId: string) {
    startTransition(() => { excluirArquivoEvento(arquivoId, clienteId, setor) })
  }

  return (
    <div className="mt-8 pt-6 border-t border-[var(--fg)]/8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--fg)]/40 uppercase tracking-widest">Eventos do mês</h3>
        {podeEditar && (
          <button onClick={() => setModalAberto(true)}
            className="text-xs bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 px-3 py-1.5 rounded-lg transition-all font-semibold">
            + Evento
          </button>
        )}
      </div>

      {eventos.length === 0 ? (
        <p className="text-[var(--fg)]/25 text-xs py-2">Nenhum evento avulso neste mês.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {eventos.map(ev => (
            <div key={ev.id} className={`flex flex-col gap-2 px-3 py-2.5 rounded-xl border transition-all ${
              ev.concluida ? 'bg-[var(--accent)]/8 border-[var(--accent)]/25' : 'bg-[var(--fg)]/3 border-[var(--fg)]/8'
            }`}>
              <div className="flex items-start gap-3">
                <button onClick={() => handleToggle(ev.id, !ev.concluida)} disabled={!podeEditar || isPending}
                  className={`w-4 h-4 mt-0.5 rounded-full border shrink-0 transition-colors disabled:opacity-40 ${
                    ev.concluida ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--fg)]/25'
                  }`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${ev.concluida ? 'text-[var(--fg)]/50 line-through' : 'text-[var(--fg)]'}`}>{ev.titulo}</p>
                  {ev.descricao && <p className="text-xs text-[var(--fg)]/40 mt-0.5">{ev.descricao}</p>}
                  <p className="text-[10px] text-[var(--fg)]/25 mt-1">
                    {formatarData(ev.data)} · criado por {ev.criado_por_nome ?? 'desconhecido'}
                  </p>
                </div>
                {podeEditar && (
                  excluindoId === ev.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => handleExcluir(ev.id)}
                        className="text-[10px] bg-red-500/20 border border-red-500/40 text-red-400 px-2 py-1 rounded-md">Confirmar</button>
                      <button onClick={() => setExcluindoId(null)}
                        className="text-[10px] text-[var(--fg)]/40 px-1">Cancelar</button>
                    </div>
                  ) : (
                    <button onClick={() => setExcluindoId(ev.id)}
                      className="text-[var(--fg)]/25 hover:text-red-400 text-xs shrink-0 transition-colors">×</button>
                  )
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap ml-7">
                {podeEditar && (
                  <label className={`text-[10px] px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${
                    uploadingId === ev.id
                      ? 'opacity-50 pointer-events-none'
                      : 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/25'
                  }`}>
                    {uploadingId === ev.id ? 'Enviando...' : '+ Anexo'}
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"
                      multiple
                      className="hidden"
                      onChange={e => handleUploadArquivo(ev.id, e.target.files)}
                      disabled={isPending}
                    />
                  </label>
                )}
                {ev.arquivos.map(arq => (
                  <span key={arq.id} className="flex items-center gap-1.5 text-[10px] bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 px-2 py-1 rounded-lg">
                    <a href={`/api/arquivos/evento/${arq.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      📎 {arq.name}
                    </a>
                    · {formatBytes(arq.size)}
                    {podeEditar && (
                      <button type="button" onClick={() => handleExcluirArquivo(arq.id)}
                        className="text-[var(--fg)]/40 hover:text-red-400 font-bold">×</button>
                    )}
                  </span>
                ))}
              </div>
              {erroUpload[ev.id] && <p className="text-red-400 text-[10px] ml-7">{erroUpload[ev.id]}</p>}
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <EventoAvulsoModal clienteId={clienteId} setor={setor} onClose={() => setModalAberto(false)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/geral/EventosAvulsosSecao.tsx
git commit -m "feat: lista de Eventos mostra anexos, permite adicionar e remover depois de criado"
```

---

### Task 6: Aplicar a migration no dev e verificação final

**Files:** nenhum novo — aplicação de migration + verificação.

- [ ] **Step 1: Build completo**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo, mesmas rotas de antes (nenhuma rota nova — anexo de evento usa a rota genérica já existente `/api/arquivos/[tabela]/[id]`, só ganhou uma entrada no mapa interno).

- [ ] **Step 2: Aplicar a migration no Supabase de dev (controller, não subagent — é DDL, precisa ser rodada manualmente no SQL Editor com as credenciais de dev)**

Copiar o conteúdo de `supabase/migrations/015_evento_arquivos.sql` e rodar no SQL Editor do Supabase de dev (`fcpcorqquovvgtoukxry`).

Verificar depois:

```sql
select table_name from information_schema.tables where table_name = 'evento_arquivos';
```

Expected: 1 linha.

- [ ] **Step 3: Roteiro de teste manual (documentado — só executar se o usuário pedir)**

1. Abrir um cliente de teste (qualquer setor), criar um Evento novo anexando 2 arquivos de tipos diferentes (ex: um PDF e uma imagem) no próprio formulário de criação.
2. Confirmar que os dois anexos aparecem na lista do evento, cada um clicável (abre/baixa).
3. Num evento já existente (criado antes, sem anexo), usar o botão "+ Anexo" pra adicionar um arquivo novo — confirmar que aparece na lista sem precisar recarregar a página.
4. Excluir um anexo individual (×) — confirmar que some da lista, os demais continuam.
5. Tentar anexar um tipo de arquivo não permitido (ex: um `.txt`) — confirmar a mensagem de erro, sem quebrar a tela.
6. Excluir o evento inteiro — confirmar que ele e seus anexos restantes somem juntos (cascade), sem erro.

- [ ] **Step 4: Nota final**

Sem commit nesta task (só aplicação de migration + verificação). Se os Steps 1 e 2 passarem limpo, a feature está pronta para o usuário revisar/testar manualmente quando quiser, seguindo `superpowers:finishing-a-development-branch` — manter a branch `feat/motor-tarefas-setor` como está (sem push/merge), como em todas as frentes anteriores. Esta mudança **não é aplicável em produção** ainda — só existe no banco de dev até a sincronização da branch ser decidida.
