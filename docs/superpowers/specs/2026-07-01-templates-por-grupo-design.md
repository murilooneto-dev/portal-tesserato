# Design: Templates de Tarefas por Grupo

**Data:** 2026-07-01
**Status:** Aprovado

---

## Objetivo

Adicionar uma ferramenta paralela à já existente "Templates de Tarefas por Atividade" (em Parâmetros), permitindo configurar tarefas padrão por **Grupo** do cliente (`normal` / `simples` / `mei`) e aplicá-las em massa aos clientes existentes.

---

## Diferença em relação à ferramenta de Atividade

Grupo é um valor único e mutuamente exclusivo por cliente (`clientes.grupo`, um de `normal`/`simples`/`mei` — ver `components/fiscal/EmpresaModal.tsx:8-12`), diferente de Atividade, que pode ser composta (ex: "Serviço e Comércio"). Por isso, esta ferramenta **não tem** a lógica de "bases" nem a seção de preview de combinações — são só 3 templates independentes, e a aplicação a clientes é por igualdade exata (`cliente.grupo === grupo`), não por `.includes()`.

---

## Regras de negócio

- 3 templates fixos e independentes: Regime Normal, Simples Nacional, MEI.
- **Fonte de verdade: sempre `tarefas_personalizadas`** do cliente. Aplicar o template nunca sobrescreve nem remove tarefas existentes — apenas adiciona ao `tarefas_personalizadas` as tarefas do template que ainda não estão lá.
- Cliente sem `grupo` definido não é afetado por nenhum template.
- Fora de escopo: nenhuma mudança no formulário de cadastro/edição de cliente (`EmpresaModal`) — ao trocar o Grupo no cadastro, as tarefas continuam não sendo pré-preenchidas automaticamente (isso só acontece hoje para Atividade).

---

## Banco de dados

### Nova tabela: `grupo_templates`

```sql
create table grupo_templates (
  grupo   text primary key,  -- 'normal' | 'simples' | 'mei'
  tarefas text[] not null default '{}'
);

alter table grupo_templates enable row level security;

create policy "Autenticados leem templates de grupo"
  on grupo_templates for select using (auth.uid() is not null);

-- Escrita feita via service role (getAuthenticatedAdmin() na server action), sem policy de INSERT/UPDATE pra authenticated

insert into grupo_templates (grupo) values
  ('normal'), ('simples'), ('mei');
```

Esse SQL precisa ser rodado manualmente no SQL Editor do Supabase (mesmo processo usado para criar `atividade_templates`, que também não tem migration versionada neste repositório).

---

## Server actions (novas, em `app/fiscal/parametros/actions.ts`)

```typescript
export async function salvarTemplateGrupo(
  grupo: string,
  tarefas: string[]
): Promise<{ error?: string }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.' }

  const { error } = await supabase
    .from('grupo_templates')
    .upsert({ grupo, tarefas }, { onConflict: 'grupo' })

  if (error) return { error: error.message }
  revalidatePath('/fiscal/parametros')
  return {}
}

export async function aplicarTemplateGrupoAClientes(
  grupo: string
): Promise<{ error?: string; atualizados: number }> {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!supabase || !user) return { error: 'Não autorizado.', atualizados: 0 }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return { error: 'Acesso negado.', atualizados: 0 }

  const { data: templateRow, error: templateErr } = await supabase
    .from('grupo_templates')
    .select('tarefas')
    .eq('grupo', grupo)
    .single()

  if (templateErr && templateErr.code !== 'PGRST116') {
    return { error: templateErr.message, atualizados: 0 }
  }
  const tarefasBase: string[] = templateRow?.tarefas ?? []
  if (tarefasBase.length === 0) return { atualizados: 0 }

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, grupo, tarefas_personalizadas')

  let atualizados = 0
  for (const c of clientes ?? []) {
    if (c.grupo !== grupo) continue

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

---

## `app/fiscal/parametros/page.tsx`

Carrega `grupo_templates` junto com `atividade_templates` e passa como nova prop `grupoTemplates` para `ParametrosClient`.

```typescript
{ data: grupoTemplatesRows },
// ...
supabase.from('grupo_templates').select('grupo,tarefas'),

const grupoTemplatesMap: Record<string, string[]> = {}
for (const row of grupoTemplatesRows ?? []) {
  grupoTemplatesMap[row.grupo] = row.tarefas ?? []
}
```

---

## `app/fiscal/parametros/ParametrosClient.tsx`

### Nova seção "Templates de Tarefas por Grupo"

Renderizada logo abaixo da seção "Templates de Tarefas por Atividade" — mesmo padrão visual (3 cards, lista editável, botões "Salvar template" e "Aplicar a clientes existentes"), sem a seção de preview de combinações.

Labels dos 3 grupos (reaproveitando os mesmos labels já usados em `EmpresaModal.tsx`):
- `normal` → "Regime Normal"
- `simples` → "Simples Nacional"
- `mei` → "MEI"

### Novo estado e handlers (paralelos aos já existentes para Atividade)

```typescript
const GRUPOS_TEMPLATE = [
  { value: 'normal',  label: 'Regime Normal' },
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'mei',     label: 'MEI' },
]
const [templatesGrupo, setTemplatesGrupo] = useState<Record<string, string[]>>({
  normal:  grupoTemplates['normal']  ?? [],
  simples: grupoTemplates['simples'] ?? [],
  mei:     grupoTemplates['mei']     ?? [],
})
const [novasTarefasGrupo, setNovasTarefasGrupo] = useState<Record<string, string>>({
  normal: '', simples: '', mei: '',
})
const [salvandoTemplateGrupo, setSalvandoTemplateGrupo] = useState<string | null>(null)
const [aplicandoTemplateGrupo, setAplicandoTemplateGrupo] = useState<string | null>(null)
const [templateGrupoMsg, setTemplateGrupoMsg] = useState<Record<string, string>>({})

async function handleSalvarTemplateGrupo(grupo: string) {
  setSalvandoTemplateGrupo(grupo)
  const result = await salvarTemplateGrupo(grupo, templatesGrupo[grupo])
  setSalvandoTemplateGrupo(null)
  setTemplateGrupoMsg(prev => ({ ...prev, [grupo]: result.error ? `Erro: ${result.error}` : 'Salvo!' }))
  setTimeout(() => setTemplateGrupoMsg(prev => ({ ...prev, [grupo]: '' })), 3000)
}

async function handleAplicarTemplateGrupo(grupo: string) {
  setAplicandoTemplateGrupo(grupo)
  const result = await aplicarTemplateGrupoAClientes(grupo)
  setAplicandoTemplateGrupo(null)
  const msg = result.error
    ? `Erro: ${result.error}`
    : `${result.atualizados} cliente(s) atualizados`
  setTemplateGrupoMsg(prev => ({ ...prev, [grupo + '_aplicar']: msg }))
  setTimeout(() => setTemplateGrupoMsg(prev => ({ ...prev, [grupo + '_aplicar']: '' })), 4000)
}

function addTarefaTemplateGrupo(grupo: string) {
  const t = (novasTarefasGrupo[grupo] ?? '').trim().toUpperCase()
  if (!t || templatesGrupo[grupo].includes(t)) return
  setTemplatesGrupo(prev => ({ ...prev, [grupo]: [...prev[grupo], t] }))
  setNovasTarefasGrupo(prev => ({ ...prev, [grupo]: '' }))
}

function removeTarefaTemplateGrupo(grupo: string, idx: number) {
  setTemplatesGrupo(prev => ({
    ...prev,
    [grupo]: prev[grupo].filter((_, i) => i !== idx),
  }))
}
```

### Nova prop

```typescript
interface Props {
  // ...props existentes
  grupoTemplates: Record<string, string[]>
}
```

---

## Impacto em código existente

| Arquivo | Mudança |
|---|---|
| `app/fiscal/parametros/actions.ts` | 2 novas server actions: `salvarTemplateGrupo`, `aplicarTemplateGrupoAClientes` |
| `app/fiscal/parametros/page.tsx` | Carrega `grupo_templates`, passa `grupoTemplates` como prop |
| `app/fiscal/parametros/ParametrosClient.tsx` | Nova prop, novo estado, novos handlers, nova seção JSX |
| `components/fiscal/EmpresaModal.tsx` | **Sem mudanças** (fora de escopo, confirmado) |

---

## Sequência de aplicação recomendada

1. Rodar o SQL de criação da tabela `grupo_templates` no Supabase
2. Deploy do código
3. Admin entra em Parâmetros → preenche os 3 templates (Normal, Simples, MEI)
4. Clica "Aplicar a clientes existentes" para cada grupo
5. Clientes sem `grupo` definido ficam com `tarefas_personalizadas` existente intacta

---

## Fora de escopo

- Auto-sugestão de tarefas no formulário de cadastro/edição de cliente (`EmpresaModal`) ao trocar o Grupo
- Qualquer lógica de combinação entre grupos (grupo é sempre um valor único, não composto)
- Histórico de mudanças nos templates
- Remoção de tarefas de clientes ao atualizar template
