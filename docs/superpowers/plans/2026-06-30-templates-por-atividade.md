# Templates de Tarefas por Atividade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o sistema de tarefas padrão baseado em `grupo` por templates configuráveis por atividade (Serviço/Comércio/Indústria), com UI em Parâmetros e auto-preenchimento no formulário de novo cliente.

**Architecture:** Tabela `atividade_templates` com 3 linhas (bases). Atividades combinadas são resolvidas em runtime pela função `resolverTemplate()`. Templates alimentam `tarefas_personalizadas` incrementalmente — nunca sobrescrevem, nunca removem.

**Tech Stack:** Next.js 16, Supabase, TypeScript, Tailwind CSS, Server Actions

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `lib/atividade-templates.ts` | **Criar** | `basesDeAtividade()` e `resolverTemplate()` |
| `app/fiscal/parametros/actions.ts` | **Modificar** | Adicionar `salvarTemplate` e `aplicarTemplateAClientes` |
| `app/fiscal/parametros/page.tsx` | **Modificar** | Carregar `atividade_templates` do banco |
| `app/fiscal/parametros/ParametrosClient.tsx` | **Modificar** | Nova seção UI de templates |
| `components/fiscal/EmpresaModal.tsx` | **Modificar** | Auto-preencher tarefas ao selecionar atividade |
| `app/fiscal/empresas/EmpresasClient.tsx` | **Modificar** | Receber e repassar prop `templates` |
| `app/fiscal/empresas/page.tsx` | **Modificar** | Carregar templates e passar para EmpresasClient |
| `app/fiscal/clientes/page.tsx` | **Modificar** | Simplificar `tiposCliente()` |
| `app/fiscal/clientes/[id]/page.tsx` | **Modificar** | Simplificar `tiposDoCliente` |
| `app/fiscal/dashboard/page.tsx` | **Modificar** | Simplificar `tiposCliente()` |
| `app/fiscal/empresas/page.tsx` | **Modificar** | Simplificar `tiposCliente()` |

---

## Task 1: SQL — Criar tabela `atividade_templates` no Supabase

**Files:**
- Executar no Supabase → Dashboard → SQL Editor

- [ ] **Step 1: Executar o SQL de criação**

Acesse o Supabase → Database → SQL Editor e execute:

```sql
CREATE TABLE atividade_templates (
  atividade TEXT PRIMARY KEY,
  tarefas   TEXT[] NOT NULL DEFAULT '{}'
);

-- RLS: leitura para autenticados, escrita via service role
ALTER TABLE atividade_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura_autenticados" ON atividade_templates
  FOR SELECT TO authenticated USING (true);

-- Seed das 3 bases (tarefas vazias — admin preenche via Parâmetros)
INSERT INTO atividade_templates (atividade) VALUES
  ('Serviço'),
  ('Comércio'),
  ('Indústria')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Verificar**

No Supabase → Table Editor → `atividade_templates`: deve ter 3 linhas com `tarefas = {}`.

---

## Task 2: Utilitário `lib/atividade-templates.ts`

**Files:**
- Create: `lib/atividade-templates.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// lib/atividade-templates.ts

const BASES = ['Serviço', 'Comércio', 'Indústria'] as const
export type AtividadeBase = typeof BASES[number]

/** Retorna quais bases compõem uma atividade composta */
export function basesDeAtividade(atividade: string): AtividadeBase[] {
  return BASES.filter(base => atividade.includes(base))
}

/**
 * Calcula as tarefas para uma atividade unindo os templates das bases.
 * Ordem: Serviço → Comércio → Indústria. Sem duplicatas.
 */
export function resolverTemplate(
  atividade: string,
  templates: Record<string, string[]>
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const base of basesDeAtividade(atividade)) {
    for (const t of templates[base] ?? []) {
      if (!seen.has(t)) {
        seen.add(t)
        result.push(t)
      }
    }
  }
  return result
}
```

- [ ] **Step 2: Verificar manualmente**

Mentalmente validar:
- `basesDeAtividade('Serviço e Comércio')` → `['Serviço', 'Comércio']` ✓
- `basesDeAtividade('Indústria')` → `['Indústria']` ✓
- `resolverTemplate('Serviço e Comércio', { Serviço: ['A','B'], Comércio: ['C','B'] })` → `['A','B','C']` (sem duplicata 'B') ✓

- [ ] **Step 3: Commit**

```bash
git add lib/atividade-templates.ts
git commit -m "feat: utilitário resolverTemplate por atividade"
```

---

## Task 3: Server actions para templates

**Files:**
- Modify: `app/fiscal/parametros/actions.ts`

- [ ] **Step 1: Adicionar `salvarTemplate` e `aplicarTemplateAClientes` ao arquivo**

Adicione ao final de `app/fiscal/parametros/actions.ts`:

```typescript
export async function salvarTemplate(
  atividade: string,
  tarefas: string[]
): Promise<{ error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { error } = await supabase
    .from('atividade_templates')
    .upsert({ atividade, tarefas }, { onConflict: 'atividade' })

  if (error) return { error: error.message }
  revalidatePath('/fiscal/parametros')
  return {}
}

export async function aplicarTemplateAClientes(
  atividadeBase: string
): Promise<{ error?: string; atualizados: number }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', atualizados: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', atualizados: 0 }

  // Busca as tarefas base desta atividade
  const { data: templateRow } = await supabase
    .from('atividade_templates')
    .select('tarefas')
    .eq('atividade', atividadeBase)
    .single()

  const tarefasBase: string[] = templateRow?.tarefas ?? []
  if (tarefasBase.length === 0) return { atualizados: 0 }

  // Busca todos os clientes cuja atividade inclui esta base
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, atividade, tarefas_personalizadas')

  let atualizados = 0
  for (const c of clientes ?? []) {
    if (!c.atividade?.includes(atividadeBase)) continue

    const existentes: string[] = c.tarefas_personalizadas ?? []
    const novas = tarefasBase.filter(t => !existentes.includes(t))
    if (novas.length === 0) continue

    await supabase
      .from('clientes')
      .update({ tarefas_personalizadas: [...existentes, ...novas] })
      .eq('id', c.id)

    atualizados++
  }

  revalidatePath('/fiscal/clientes')
  return { atualizados }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/fiscal/parametros/actions.ts
git commit -m "feat: actions salvarTemplate e aplicarTemplateAClientes"
```

---

## Task 4: Parâmetros page — carregar templates

**Files:**
- Modify: `app/fiscal/parametros/page.tsx`

- [ ] **Step 1: Adicionar query de templates ao `Promise.all` existente**

No `app/fiscal/parametros/page.tsx`, altere o `Promise.all`:

```typescript
  const [
    { data: profiles },
    { data: appSettings },
    { data: taskLogs },
    { data: deletionLogs },
    { data: atividadeTemplates },
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('nome'),
    supabase.from('app_settings').select('*').eq('id', 1).single(),
    supabase.from('task_unlock_log').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('deletion_log').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])
```

- [ ] **Step 2: Montar o mapa e passar para `ParametrosClient`**

Antes do `return`, adicione:

```typescript
  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }
```

No JSX, adicione a prop ao `<ParametrosClient>`:

```tsx
  return (
    <ParametrosClient
      profiles={profiles ?? []}
      dashboardAnnouncement={s.dashboard_announcement ?? ''}
      taskLogs={taskLogs ?? []}
      deletionLogs={deletionLogs ?? []}
      emailSettings={emailSettings}
      atividadeTemplates={templatesMap}
    />
  )
```

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/parametros/page.tsx
git commit -m "feat: parametros page carrega atividade_templates"
```

---

## Task 5: ParametrosClient — nova seção de templates

**Files:**
- Modify: `app/fiscal/parametros/ParametrosClient.tsx`

- [ ] **Step 1: Adicionar import, prop e estado**

No topo do arquivo, adicione o import:

```typescript
import { salvarTemplate, aplicarTemplateAClientes } from './actions'
import { resolverTemplate } from '@/lib/atividade-templates'
```

Na interface `Props`, adicione:

```typescript
  atividadeTemplates: Record<string, string[]>
```

No componente `ParametrosClient`, adicione ao destructuring:

```typescript
export default function ParametrosClient({ profiles, dashboardAnnouncement, taskLogs, deletionLogs, emailSettings = {}, atividadeTemplates }: Props) {
```

Adicione os estados dentro do componente (após os existentes):

```typescript
  // Templates de atividade
  const BASES = ['Serviço', 'Comércio', 'Indústria'] as const
  const ATIVIDADES_COMBINADAS = [
    'Serviço e Comércio',
    'Serviço e Indústria',
    'Comércio e Indústria',
    'Serviço, Comércio e Indústria',
  ]
  const [templates, setTemplates] = useState<Record<string, string[]>>({
    Serviço:   atividadeTemplates['Serviço']   ?? [],
    Comércio:  atividadeTemplates['Comércio']  ?? [],
    Indústria: atividadeTemplates['Indústria'] ?? [],
  })
  const [novasTarefas, setNovasTarefas] = useState<Record<string, string>>({
    Serviço: '', Comércio: '', Indústria: '',
  })
  const [salvandoTemplate, setSalvandoTemplate] = useState<string | null>(null)
  const [aplicandoTemplate, setAplicandoTemplate] = useState<string | null>(null)
  const [templateMsg, setTemplateMsg] = useState<Record<string, string>>({})
```

- [ ] **Step 2: Adicionar handlers**

Adicione as funções dentro do componente (após `toggleAba`):

```typescript
  async function handleSalvarTemplate(base: string) {
    setSalvandoTemplate(base)
    const result = await salvarTemplate(base, templates[base])
    setSalvandoTemplate(null)
    setTemplateMsg(prev => ({ ...prev, [base]: result.error ? `Erro: ${result.error}` : 'Salvo!' }))
    setTimeout(() => setTemplateMsg(prev => ({ ...prev, [base]: '' })), 3000)
  }

  async function handleAplicarTemplate(base: string) {
    setAplicandoTemplate(base)
    const result = await aplicarTemplateAClientes(base)
    setAplicandoTemplate(null)
    const msg = result.error
      ? `Erro: ${result.error}`
      : `${result.atualizados} cliente(s) atualizados`
    setTemplateMsg(prev => ({ ...prev, [base + '_aplicar']: msg }))
    setTimeout(() => setTemplateMsg(prev => ({ ...prev, [base + '_aplicar']: '' })), 4000)
  }

  function addTarefaTemplate(base: string) {
    const t = (novasTarefas[base] ?? '').trim().toUpperCase()
    if (!t || templates[base].includes(t)) return
    setTemplates(prev => ({ ...prev, [base]: [...prev[base], t] }))
    setNovasTarefas(prev => ({ ...prev, [base]: '' }))
  }

  function removeTarefaTemplate(base: string, idx: number) {
    setTemplates(prev => ({
      ...prev,
      [base]: prev[base].filter((_, i) => i !== idx),
    }))
  }
```

- [ ] **Step 3: Adicionar o bloco JSX da nova seção**

Dentro do `<div className="space-y-6">`, adicione após o bloco de usuários cadastrados:

```tsx
        {/* Templates de Tarefas por Atividade */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
          {sectionHeader('Templates de Tarefas por Atividade')}
          <p className="text-white/30 text-xs mb-5">
            Configure as tarefas padrão para cada atividade base. Atividades combinadas são geradas automaticamente pela união das bases.
          </p>

          {/* 3 cards editáveis */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {BASES.map(base => (
              <div key={base} className="bg-white/3 border border-white/8 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-white font-semibold text-sm">{base}</p>

                {/* Lista de tarefas */}
                <div className="flex flex-wrap gap-1.5 min-h-[40px]">
                  {templates[base].length === 0 && (
                    <p className="text-white/20 text-xs">Nenhuma tarefa</p>
                  )}
                  {templates[base].map((t, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-[#00CCEB]/10 border border-[#00CCEB]/30 text-white px-2 py-0.5 rounded-md">
                      {t}
                      <button
                        onClick={() => removeTarefaTemplate(base, i)}
                        className="text-white/30 hover:text-red-400 transition-colors font-bold ml-0.5">×</button>
                    </span>
                  ))}
                </div>

                {/* Input nova tarefa */}
                <div className="flex gap-1.5">
                  <input
                    value={novasTarefas[base] ?? ''}
                    onChange={e => setNovasTarefas(prev => ({ ...prev, [base]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefaTemplate(base))}
                    placeholder="Nova tarefa..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#00CCEB]/50"
                  />
                  <button
                    onClick={() => addTarefaTemplate(base)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#00CCEB]/20 border border-[#00CCEB]/40 text-[#00CCEB] text-xs font-bold hover:bg-[#00CCEB]/30 transition-colors">
                    +
                  </button>
                </div>

                {/* Botões */}
                <div className="flex flex-col gap-1.5 mt-auto pt-1">
                  <button
                    onClick={() => handleSalvarTemplate(base)}
                    disabled={salvandoTemplate === base}
                    className="w-full py-1.5 rounded-lg bg-[#00CCEB] text-white text-xs font-semibold hover:bg-[#00b3d4] transition-colors disabled:opacity-50">
                    {salvandoTemplate === base ? 'Salvando...' : 'Salvar template'}
                  </button>
                  <button
                    onClick={() => handleAplicarTemplate(base)}
                    disabled={aplicandoTemplate === base}
                    className="w-full py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-white/10 transition-colors disabled:opacity-50">
                    {aplicandoTemplate === base ? 'Aplicando...' : 'Aplicar a clientes existentes'}
                  </button>
                  {templateMsg[base] && (
                    <p className={`text-xs text-center ${templateMsg[base].startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                      {templateMsg[base]}
                    </p>
                  )}
                  {templateMsg[base + '_aplicar'] && (
                    <p className="text-xs text-center text-blue-400">{templateMsg[base + '_aplicar']}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Preview atividades combinadas */}
          <div>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3">Preview — Atividades Combinadas (somente leitura)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ATIVIDADES_COMBINADAS.map(ativ => {
                const tarefas = resolverTemplate(ativ, templates)
                return (
                  <div key={ativ} className="rounded-xl border border-white/6 bg-white/2 px-4 py-3">
                    <p className="text-white/50 text-xs font-semibold mb-2">{ativ}</p>
                    <p className="text-white/30 text-xs">
                      {tarefas.length === 0
                        ? 'Nenhuma tarefa'
                        : tarefas.join(' · ')}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
```

- [ ] **Step 4: Commit**

```bash
git add app/fiscal/parametros/ParametrosClient.tsx
git commit -m "feat: seção de templates por atividade em Parâmetros"
```

---

## Task 6: EmpresaModal — auto-preencher ao selecionar atividade

**Files:**
- Modify: `components/fiscal/EmpresaModal.tsx`

- [ ] **Step 1: Adicionar import e prop `templates`**

No topo do arquivo, adicione:

```typescript
import { resolverTemplate } from '@/lib/atividade-templates'
```

Na interface `Props`, adicione:

```typescript
  templates: Record<string, string[]>
```

No componente, adicione `templates` ao destructuring:

```typescript
export default function EmpresaModal({ clienteId, responsaveis, onClose, readOnly = false, templates }: Props) {
```

- [ ] **Step 2: Atualizar o `<select>` de atividade para auto-preencher tarefas**

Substitua o `<select>` de Atividade (linha ~233):

```tsx
              <div>
                <label className={labelCls}>Atividade</label>
                <select className={selectCls} value={form.atividade} onChange={e => {
                  const novaAtividade = e.target.value
                  set('atividade', novaAtividade)
                  // Em nova empresa: preenche tarefas com o template da atividade
                  if (!isEdit && novaAtividade) {
                    const tarefasTemplate = resolverTemplate(novaAtividade, templates)
                    if (tarefasTemplate.length > 0) {
                      set('tarefas_personalizadas', tarefasTemplate)
                    }
                  }
                }} disabled={readOnly}>
                  <option value="">Selecionar...</option>
                  {ATIVIDADES.map(a => <option key={a} value={a} className="bg-[#162444]">{a}</option>)}
                </select>
              </div>
```

- [ ] **Step 3: Atualizar o header da seção de Tarefas e o botão "Restaurar"**

Substitua o bloco de header das tarefas (linhas ~337–347):

```tsx
              <div className="flex items-center justify-between mb-3">
                <label className={labelCls + ' mb-0'}>
                  Tarefas ({form.tarefas_personalizadas.length})
                </label>
                {!readOnly && !isEdit && form.atividade && (
                  <button type="button"
                    onClick={() => set('tarefas_personalizadas', resolverTemplate(form.atividade, templates))}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors border border-white/10 px-2 py-1 rounded-lg">
                    Restaurar padrão da atividade
                  </button>
                )}
              </div>
```

Substitua também o texto vazio de tarefas (linha ~354):

```tsx
                {form.tarefas_personalizadas.length === 0 && (
                  <p className="text-white/20 text-xs">
                    {form.atividade ? 'Selecione a atividade acima para pré-preencher as tarefas padrão.' : 'Nenhuma tarefa adicionada.'}
                  </p>
                )}
```

- [ ] **Step 4: Remover `TAREFAS_PADRAO` e a lógica de grupo no `<select>` de Grupo**

No início do arquivo, remova o bloco:

```typescript
// REMOVER ESTE BLOCO INTEIRO:
const TAREFAS_PADRAO: Record<string, string[]> = {
  normal:  ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS'],
  simples: ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF'],
  mei:     ['DAS'],
}
```

No `<select>` de Grupo (linha ~286), remova o auto-preenchimento de tarefas:

```tsx
              <div>
                <label className={labelCls}>Grupo</label>
                <select className={selectCls} value={form.grupo} onChange={e => {
                  set('grupo', e.target.value)
                }} disabled={readOnly}>
                  <option value="" className="bg-[#162444]">Selecionar...</option>
                  {GRUPOS.map(g => <option key={g.value} value={g.value} className="bg-[#162444]">{g.label}</option>)}
                </select>
              </div>
```

- [ ] **Step 5: Commit**

```bash
git add components/fiscal/EmpresaModal.tsx lib/atividade-templates.ts
git commit -m "feat: EmpresaModal auto-preenche tarefas pelo template da atividade"
```

---

## Task 7: EmpresasClient e empresas/page — passar prop `templates`

**Files:**
- Modify: `app/fiscal/empresas/page.tsx`
- Modify: `app/fiscal/empresas/EmpresasClient.tsx`

- [ ] **Step 1: Carregar templates em `empresas/page.tsx`**

Substitua a query atual (que busca apenas `clientes`):

```typescript
  const [{ data: clientes }, { data: atividadeTemplates }] = await Promise.all([
    supabase.from('clientes').select('*').order('nome'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])

  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }

  // Conta tarefas configuradas por cliente (template, não registros do banco)
  const contagemTarefas: Record<string, number> = {}
  for (const c of clientes ?? []) {
    contagemTarefas[c.id] = (c.tarefas_personalizadas?.length ?? 0)
  }
```

No JSX, passe `templates`:

```tsx
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <EmpresasClient
        clientes={clientes ?? []}
        contagemTarefas={contagemTarefas}
        profileNome={profile?.nome ?? null}
        isAdmin={isAdmin}
        templates={templatesMap}
      />
    </div>
  )
```

Note: `TAREFAS_GRUPOS` e a lógica de template de grupo foram removidos pois `contagemTarefas` agora usa `tarefas_personalizadas.length` diretamente.

- [ ] **Step 2: Atualizar props em `EmpresasClient.tsx`**

Na interface `Props`, adicione:

```typescript
  templates: Record<string, string[]>
```

No destructuring do componente:

```typescript
export default function EmpresasClient({ clientes, contagemTarefas, profileNome, isAdmin, templates }: Props) {
```

Encontre onde `EmpresaModal` é renderizado em `EmpresasClient.tsx` e adicione a prop:

```tsx
<EmpresaModal
  clienteId={modalId === 'novo' ? null : modalId}
  responsaveis={responsaveis}
  onClose={() => { setModalOpen(false); setModalId(undefined as any) }}
  readOnly={modalReadOnly}
  templates={templates}
/>
```

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/empresas/page.tsx app/fiscal/empresas/EmpresasClient.tsx
git commit -m "feat: empresas page e client passam templates para EmpresaModal"
```

---

## Task 8: Simplificar `tiposCliente()` — clientes/page e dashboard/page

**Files:**
- Modify: `app/fiscal/clientes/page.tsx`
- Modify: `app/fiscal/dashboard/page.tsx`

- [ ] **Step 1: Simplificar `clientes/page.tsx`**

Remova o bloco `TAREFAS_GRUPOS`, o `clienteTiposSet` e substitua o bloco inteiro de progressoMap (em torno das linhas 37–55) por:

```typescript
  // Mapa de tipos por cliente
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of clientes ?? []) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }

  // Progresso por cliente
  const progressoMap: Record<string, { total: number; concluidas: number }> = {}
  for (const [id, tipos] of Object.entries(tiposMap)) {
    progressoMap[id] = { total: tipos.size, concluidas: 0 }
  }
  for (const t of tarefas ?? []) {
    if (t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)) {
      progressoMap[t.cliente_id].concluidas++
    }
  }

  const comPendencia = new Set(
    Object.entries(progressoMap)
      .filter(([, p]) => p.concluidas < p.total)
      .map(([id]) => id)
  )
```

- [ ] **Step 2: Simplificar `dashboard/page.tsx`**

Remova o bloco `TAREFAS_GRUPOS` e a função `tiposCliente`. Substitua por:

```typescript
  // Mapa de tipos válidos por cliente
  const tiposMap: Record<string, Set<string>> = {}
  for (const c of cs) {
    tiposMap[c.id] = new Set(c.tarefas_personalizadas ?? [])
  }

  const totalTarefas = cs.reduce((sum, c) => sum + (c.tarefas_personalizadas?.length ?? 0), 0)
  const concluidasTarefas = ts.filter(t => t.concluida && tiposMap[t.cliente_id]?.has(t.tipo)).length
  const pct = totalTarefas > 0 ? Math.round((concluidasTarefas / totalTarefas) * 100) : 0
```

No bloco de progresso por responsável, substitua `tiposCliente(c).length` por:

```typescript
              const opTotal = opClientes.reduce((sum, c) => sum + (c.tarefas_personalizadas?.length ?? 0), 0)
```

- [ ] **Step 3: Commit**

```bash
git add app/fiscal/clientes/page.tsx app/fiscal/dashboard/page.tsx
git commit -m "refactor: tiposCliente usa tarefas_personalizadas diretamente"
```

---

## Task 9: Simplificar `tiposDoCliente` em `clientes/[id]/page.tsx`

**Files:**
- Modify: `app/fiscal/clientes/[id]/page.tsx`

- [ ] **Step 1: Remover `TAREFAS` e simplificar `tiposDoCliente`**

Remova o bloco (linhas 17–21):

```typescript
// REMOVER:
const TAREFAS: Record<string, string[]> = {
  normal:  [...],
  simples: [...],
  mei:     [...],
}
```

Substitua a linha 82–84:

```typescript
  // Antes:
  // const tiposDoCliente = (cliente.tarefas_personalizadas ?? []).length > 0
  //   ? (cliente.tarefas_personalizadas as string[])
  //   : (TAREFAS[cliente.grupo ?? 'normal'] ?? TAREFAS.normal)

  // Depois:
  const tiposDoCliente = cliente.tarefas_personalizadas ?? []
```

- [ ] **Step 2: Commit**

```bash
git add "app/fiscal/clientes/[id]/page.tsx"
git commit -m "refactor: clientes/[id] usa tarefas_personalizadas sem fallback de grupo"
```

---

## Task 10: Verificação final

- [ ] **Step 1: Build local**

```bash
npm run build
```

Esperado: sem erros de TypeScript.

- [ ] **Step 2: Verificar no Vercel após deploy**

1. Acesse Parâmetros → seção "Templates de Tarefas por Atividade"
2. Adicione tarefas para Serviço, Comércio e Indústria
3. Clique "Salvar template" para cada base — confirme "Salvo!"
4. Veja o preview das atividades combinadas atualizar em tempo real
5. Clique "Aplicar a clientes existentes" para Serviço — confirme "N cliente(s) atualizados"
6. Abra um cliente com atividade Serviço: verifique que as tarefas foram adicionadas
7. Crie nova empresa, selecione atividade "Serviço e Comércio" → tarefas devem ser pré-preenchidas
8. Dashboard e progresso por responsável devem continuar corretos

- [ ] **Step 3: git-versioning**

Acionar `/git-versioning` para versionar como v0.5.0 (nova funcionalidade).

---

## Notas de transição

- Clientes sem `atividade` definida ficam com `tiposDoCliente = []` (comportamento intencional — sem tarefas padrão)
- O componente `TarefaChecklist` ainda usa `grupo` como fallback interno — isso é aceitável durante a transição; após o admin aplicar os templates, todos os clientes terão `tarefas_personalizadas` preenchido
- `TAREFAS_GRUPOS` hardcoded foi removido de todas as páginas server-side; o único lugar com lógica de grupo restante é `TarefaChecklist.tsx` (component client-side de fallback, fora do escopo desta feature)
