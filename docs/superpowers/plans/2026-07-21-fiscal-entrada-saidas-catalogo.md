# Fiscal ENTRADA/SAIDAS pro catálogo genérico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ENTRADA` e `SAIDAS` deixam de ser hard-coded (3 checkboxes fixos, colunas próprias) e passam a ser dois tipos reais do catálogo `tarefa_tipos` (`setor='fiscal'`, `etapas=['Recebido','Importado','Conferido']`), renderizados pelo motor genérico de etapas nomeadas que a Fase 1 já construiu e nunca foi ativado.

**Architecture:** Uma migration SQL nova insere as duas linhas no catálogo (aplicada só no banco de dev, nunca em produção — produção não tem esse schema ainda). `components/fiscal/TarefaChecklist.tsx` perde o caso especial `ehSubEtapaFixa`, deixando `etapasDefinidas`/`tipoResposta` sempre virem do lookup no catálogo — o que já existe (o branch de JSX que renderiza etapas nomeadas, `etapasDefinidas && (...)`, já está no arquivo, só nunca foi alcançado por nenhum tipo real). A função `atualizarSubEtapa` (`app/fiscal/clientes/actions.ts`), que só era chamada pelo branch removido, sai junto — as duas mudanças pousam no mesmo commit pra nunca deixar o build quebrado entre elas (remover a função sem remover o import quebraria o `tsc`).

**Tech Stack:** Next.js 16 (App Router, Server Components), Supabase (Postgres + PostgREST + RLS), TypeScript, Tailwind v4. Sem framework de testes automatizado neste repo — verificação via `npx tsc --noEmit -p .` e `npm run build`.

## Global Constraints

- Nenhuma coluna (`recebido`/`importado`/`conferido`) é dropada ou alterada — ficam no schema, só param de ser lidas/escritas pelo código novo. `concluida`/`concluida_em` de tarefas já concluídas não mudam.
- A migration SQL só é aplicada no banco de **dev** (`fcpcorqquovvgtoukxry`) — nunca em produção. Produção não tem `clientes_fiscal`, `setor` em `tarefas`, nem `tarefa_tipos` ainda; essa mudança só existe nesta branch por enquanto.
- `desbloquearTarefa` (em `app/fiscal/clientes/actions.ts`) **não muda** — continua resetando as 3 colunas mortas junto com o reset genérico, isso é intencional (menos risco que editar essa action).
- `lib/tarefa-tipos-actions.ts` (bloqueio de nomes reservados `ENTRADA`/`SAIDAS` na tela de criar tipo novo) **não muda**.
- Os arrays `TAREFAS_NORMAL`/`TAREFAS_SIMPLES`/`TAREFAS_MEI` em `components/fiscal/TarefaChecklist.tsx`, e as listas equivalentes em `app/fiscal/relatorios/page.tsx`/`components/fiscal/CorrigirTarefasClient.tsx`, **não mudam** — continuam definindo os nomes de tarefa padrão por grupo, sem relação com o formato de renderização.
- `mapaTarefa` (usado por outros trechos do componente) continua existindo — só o uso dele dentro do branch removido some.

---

### Task 1: Migration — semear ENTRADA/SAIDAS no catálogo (dev)

**Files:**
- Create: `supabase/migrations/012_fiscal_entrada_saidas_catalogo.sql`

**Interfaces:**
- Produces: duas linhas em `tarefa_tipos` (`setor='fiscal'`, `nome='ENTRADA'`/`'SAIDAS'`) — consumidas pelo lookup `tarefaTipos[tipo]` já existente em `TarefaChecklist.tsx` (Task 2 remove a barreira que impedia esse lookup de ser alcançado por esses dois nomes).

- [ ] **Step 1: Criar o arquivo da migration**

```sql
-- supabase/migrations/012_fiscal_entrada_saidas_catalogo.sql

-- ENTRADA/SAIDAS deixam de ser hard-coded (3 checkboxes fixos,
-- recebido/importado/conferido) e passam a ser tipos reais do catálogo,
-- com as mesmas 3 etapas nomeadas, agora pelo motor genérico de etapas
-- que a Fase 1 já construiu. Dado histórico nas colunas
-- recebido/importado/conferido não é migrado — fica intocado no schema,
-- só para de ser lido/escrito pelo código a partir desta mudança.
insert into tarefa_tipos (setor, nome, etapas, tipo_resposta) values
  ('fiscal', 'ENTRADA', array['Recebido', 'Importado', 'Conferido'], 'data'),
  ('fiscal', 'SAIDAS',  array['Recebido', 'Importado', 'Conferido'], 'data');
```

- [ ] **Step 2: Commit (sem aplicar ainda — a aplicação no dev é feita pelo controller na Task 3, não por este subagent, que não tem as credenciais do Supabase de dev)**

```bash
git add supabase/migrations/012_fiscal_entrada_saidas_catalogo.sql
git commit -m "feat: migration semeia ENTRADA/SAIDAS no catalogo tarefa_tipos (dev)"
```

---

### Task 2: Remover o caso especial ENTRADA/SAIDAS

**Files:**
- Modify: `components/fiscal/TarefaChecklist.tsx`
- Modify: `app/fiscal/clientes/actions.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (a migration da Task 1 ainda não precisa estar aplicada pra este código compilar — o lookup `tarefaTipos[tipo]` já existe e simplesmente retorna `undefined`/fallback pra qualquer nome não catalogado, incluindo ENTRADA/SAIDAS até a migration ser aplicada).
- Produces: nenhuma interface nova — só remove código morto/especial.

- [ ] **Step 1: Remover a função `atualizarSubEtapa` de `app/fiscal/clientes/actions.ts`**

Remover (linhas 110-154, incluindo a linha em branco final antes de `excluirCliente`):

```ts
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

  const { data: existing } = await supabase
    .from('tarefas')
    .select('id, recebido, importado, conferido')
    .eq('cliente_id', clienteId).eq('mes', mes).eq('ano', ano).eq('tipo', tipo).eq('setor', 'fiscal')
    .maybeSingle()

  const atual = {
    recebido: existing?.recebido ?? false,
    importado: existing?.importado ?? false,
    conferido: existing?.conferido ?? false,
    [campo]: valor,
  }
  const todasMarcadas = atual.recebido && atual.importado && atual.conferido

  const payload = {
    ...atual,
    concluida: todasMarcadas,
    concluida_em: todasMarcadas ? new Date().toISOString() : null,
  }

  if (existing?.id) {
    await supabase.from('tarefas').update(payload).eq('id', existing.id)
  } else {
    await supabase.from('tarefas').insert({ cliente_id: clienteId, usuario_id: user!.id, mes, ano, tipo, setor: 'fiscal', ...payload })
  }

  revalidatePath('/fiscal/clientes')
  revalidatePath('/fiscal/dashboard')
  revalidatePath('/fiscal/historico')
  revalidatePath('/fiscal/relatorios')
  revalidatePath('/fiscal/tarefas')
}

```

Ou seja, o arquivo passa de:

```ts
}

export async function atualizarSubEtapa(
  ...
  revalidatePath('/fiscal/tarefas')
}

export async function excluirCliente(id: string) {
```

para:

```ts
}

export async function excluirCliente(id: string) {
```

(a função `desbloquearTarefa`, logo acima dessa, e a função `excluirCliente`, logo abaixo, não mudam — só o bloco de `atualizarSubEtapa` inteiro sai.)

- [ ] **Step 2: Remover o import de `atualizarSubEtapa` em `components/fiscal/TarefaChecklist.tsx`**

Trocar (linha 6):

```tsx
import { desbloquearTarefa, salvarMIT, atualizarSubEtapa } from '@/app/fiscal/clientes/actions'
```

por:

```tsx
import { desbloquearTarefa, salvarMIT } from '@/app/fiscal/clientes/actions'
```

- [ ] **Step 3: Remover as constantes `SUB_ETAPAS`/`SUB_ETAPAS_LABEL`**

Remover (linhas 8-14, incluindo a linha em branco final antes de `TAREFAS_NORMAL`):

```tsx
const SUB_ETAPAS = ['recebido', 'importado', 'conferido'] as const
const SUB_ETAPAS_LABEL: Record<typeof SUB_ETAPAS[number], string> = {
  recebido: 'Recebido',
  importado: 'Importado',
  conferido: 'Conferido',
}

```

Ou seja, o arquivo passa de:

```tsx
import { desbloquearTarefa, salvarMIT } from '@/app/fiscal/clientes/actions'

const SUB_ETAPAS = ['recebido', 'importado', 'conferido'] as const
const SUB_ETAPAS_LABEL: Record<typeof SUB_ETAPAS[number], string> = {
  recebido: 'Recebido',
  importado: 'Importado',
  conferido: 'Conferido',
}

const TAREFAS_NORMAL  = ['ENTRADA','SAIDAS', ...]
```

para:

```tsx
import { desbloquearTarefa, salvarMIT } from '@/app/fiscal/clientes/actions'

const TAREFAS_NORMAL  = ['ENTRADA','SAIDAS', ...]
```

- [ ] **Step 4: Remover o caso especial `ehSubEtapaFixa` na definição de `etapasDefinidas`/`tipoResposta`**

Substituir:

```tsx
        {tipos.map(tipo => {
          const ehSubEtapaFixa = tipo === 'ENTRADA' || tipo === 'SAIDAS'
          const etapasDefinidas = !ehSubEtapaFixa ? (tarefaTipos[tipo]?.etapas ?? null) : null
          const tipoResposta: TipoResposta = !ehSubEtapaFixa ? (tarefaTipos[tipo]?.tipoResposta ?? 'data') : 'data'
```

por:

```tsx
        {tipos.map(tipo => {
          const etapasDefinidas = tarefaTipos[tipo]?.etapas ?? null
          const tipoResposta: TipoResposta = tarefaTipos[tipo]?.tipoResposta ?? 'data'
```

- [ ] **Step 5: Remover o branch de JSX dos 3 checkboxes fixos**

Substituir:

```tsx
                {ehSubEtapaFixa ? (
                  <div className="flex items-center gap-3">
                    {SUB_ETAPAS.map(campo => (
                      <label key={campo} className="flex items-center gap-1.5 text-xs text-[var(--fg)]/60 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={mapaTarefa.get(tipo)?.[campo] ?? false}
                          disabled={!podeEditar || feito || isPending || isUnlocking}
                          onChange={e => startTransition(() => atualizarSubEtapa(clienteId, mes, ano, tipo, campo, e.target.checked))}
                          className="w-3.5 h-3.5 accent-[var(--accent)]"
                        />
                        {SUB_ETAPAS_LABEL[campo]}
                      </label>
                    ))}
                  </div>
                ) : tipoResposta === 'data' && !etapasDefinidas ? (
                  <input
                    type="text"
                    value={displayVal}
                    onChange={e => handleTextChange(tipo, e.target.value)}
                    onBlur={() => handleTextBlur(tipo)}
                    disabled={!podeEditar || isPending || isUnlocking}
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                    className={`text-xs px-2 py-1 rounded-lg border transition-all focus:outline-none disabled:opacity-40 w-[106px] text-center ${
                      feito
                        ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)] focus:border-[var(--accent)]/60'
                        : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60 focus:border-[var(--fg)]/30 placeholder-[var(--fg)]/20'
                    }`}
                  />
                ) : null}
```

por:

```tsx
                {tipoResposta === 'data' && !etapasDefinidas ? (
                  <input
                    type="text"
                    value={displayVal}
                    onChange={e => handleTextChange(tipo, e.target.value)}
                    onBlur={() => handleTextBlur(tipo)}
                    disabled={!podeEditar || isPending || isUnlocking}
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                    className={`text-xs px-2 py-1 rounded-lg border transition-all focus:outline-none disabled:opacity-40 w-[106px] text-center ${
                      feito
                        ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)] focus:border-[var(--accent)]/60'
                        : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60 focus:border-[var(--fg)]/30 placeholder-[var(--fg)]/20'
                    }`}
                  />
                ) : null}
```

(o branch `{etapasDefinidas && (...)}` logo depois deste, que renderiza o checklist genérico de etapas nomeadas, já existe no arquivo e não precisa de nenhuma mudança — é ele que passa a ser alcançado por `ENTRADA`/`SAIDAS` depois da Task 1 aplicada.)

- [ ] **Step 6: Verificar compilação**

Run: `npx tsc --noEmit -p .`
Expected: sem erros. Especificamente, confirmar que não sobrou nenhuma referência a `ehSubEtapaFixa`, `SUB_ETAPAS`, `SUB_ETAPAS_LABEL`, ou `atualizarSubEtapa` em nenhum dos dois arquivos.

- [ ] **Step 7: Commit**

```bash
git add components/fiscal/TarefaChecklist.tsx app/fiscal/clientes/actions.ts
git commit -m "feat: ENTRADA/SAIDAS do Fiscal usam o motor generico de etapas em vez de checkboxes fixos"
```

---

### Task 3: Aplicar no dev e verificação final

**Files:** nenhum novo — aplicação de migration + verificação.

- [ ] **Step 1: Build completo**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo, todas as rotas existentes, nenhuma rota nova (essa mudança não adiciona rota).

- [ ] **Step 2: Aplicar a migration no Supabase de dev (controller, não subagent — precisa das credenciais de dev pedidas ao usuário na sessão)**

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase db push --password '<senha>' --yes
```

Verificar depois, via SQL Editor do Supabase de dev ou uma query rápida, que as duas linhas existem:

```sql
select nome, etapas, tipo_resposta from tarefa_tipos where setor = 'fiscal' and nome in ('ENTRADA', 'SAIDAS');
```

Expected: 2 linhas, cada uma com `etapas = {Recebido,Importado,Conferido}` e `tipo_resposta = 'data'`.

- [ ] **Step 3: Roteiro de teste manual (documentado — só executar se o usuário pedir)**

1. Abrir um cliente Fiscal de teste no dev (grupo `normal` ou `simples`, que tenha `ENTRADA`/`SAIDAS` na lista efetiva de tarefas).
2. Confirmar que `ENTRADA` e `SAIDAS` agora renderizam como um checklist de 3 etapas nomeadas (Recebido/Importado/Conferido, cada uma com campo de data) em vez dos 3 checkboxes antigos.
3. Marcar as 3 etapas de uma delas — confirmar que a tarefa fica marcada como concluída (ponto verde, riscado).
4. Com a tarefa concluída, confirmar que o botão "Desbloquear" aparece e funciona (mesmo fluxo de sempre, com motivo obrigatório).
5. Conferir que uma tarefa `ENTRADA`/`SAIDAS` de um mês anterior que já estava concluída continua aparecendo como concluída (dado histórico preservado, mesmo sem ter sido migrado pra `tarefa_etapas`).

- [ ] **Step 4: Nota final**

Sem commit nesta task (só aplicação de migration + verificação). Se os Steps 1 e 2 passarem limpo, a feature está pronta para o usuário revisar/testar manualmente quando quiser, seguindo `superpowers:finishing-a-development-branch` — manter a branch `feat/motor-tarefas-setor` como está (sem push/merge), como em todas as frentes anteriores. Essa mudança **não é aplicável em produção** ainda — só existe no banco de dev até a sincronização da branch ser decidida.
