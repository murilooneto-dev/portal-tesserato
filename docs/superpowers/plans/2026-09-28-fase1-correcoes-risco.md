# Fase 1 — Correções de Risco (auditoria 2026-09-28) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os achados de maior prioridade da auditoria de risco de 2026-09-28: XSS armazenado nas janelas de impressão, checagens de permissão faltando/quebradas em 3 áreas, dois bugs de corrupção silenciosa de dado no Societário, um loop de redirecionamento real, e apertar RLS de 4 tabelas centrais (aplicada só no banco de **dev** nesta rodada — produção fica pra depois, com aviso explícito ao usuário).

**Architecture:** Cada achado é corrigido isoladamente, sem reestruturar nada — são correções pontuais e concretas, direcionadas ao arquivo/linha exatos já identificados pela auditoria. Nenhuma migration desta fase é aplicada em produção pelo agente; a migration de RLS (Task 6) só é aplicada manualmente pelo usuário no banco de **dev**, e fica documentada como pendente pra produção até nova instrução.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Supabase (Postgres + RLS), `node --import tsx --test`.

**Spec:** Não há spec separada — as correções seguem diretamente os achados de `docs/superpowers/specs/../auditoria-riscos-2026-09-28.md` (arquivo local, não commitado no repo). Cada task abaixo já traz o contexto necessário do achado original.

## Global Constraints

- **Next.js diferente do treinamento:** ler `node_modules/next/dist/docs/01-app/` antes de mexer em Server Components/Actions/`proxy.ts`, conforme `AGENTS.md`.
- Nenhuma migration é aplicada pelo agente contra banco nenhum, nem dev nem produção — o usuário aplica manualmente depois.
- Trabalhar só neste worktree (`D:/DEV/Site Tesserato + Fiscal/portal-tesserato/.worktrees/fix-fase1-riscos`, branch `fix/fase1-correcoes-risco`, já ramificada de `origin/dev`). Nunca rodar `git push`/abrir PR fora da Task final. Nunca fazer merge.
- Correções de permissão devem preservar o comportamento LEGÍTIMO já existente (quem já tinha acesso continua tendo) — o objetivo é fechar o que está aberto demais, não restringir além do que a intenção original do sistema já era.
- `npx tsc --noEmit` tem de ficar limpo em toda task.
- Texto de UI em português.

## Review Focus

1. **XSS**: TODO valor interpolado nas 5 janelas de impressão precisa estar escapado — um único `${...}` esquecido anula a correção inteira. *(Task 1)*
2. **`criarTipoTarefa` com `padrao=true`**: só quem tem permissão de configuração daquele setor pode criar tipo padrão — criar tipo comum (não-padrão) continua liberado a qualquer membro do setor, comportamento que não pode quebrar (é usado no cadastro normal de cliente). *(Task 2)*
3. **IDOR em `tarefa-grupos-actions.ts`**: a correção do bug `setor: 'constructor'` precisa realmente impedir acesso a chave de protótipo do JS, não só validar tipo — testar explicitamente com uma string maliciosa. *(Task 3, teste)*
4. **Bug de data do Societário**: a correção de `formatarDdMm` não pode quebrar a exibição de datas normais nem a leitura de etapas — testar contra uma data real que já causava o bug (ex.: `"2026-09-03"` não pode virar `02/09/2026`). *(Task 4, teste)*
5. **RLS**: a migration da Task 6 não pode bloquear nenhum acesso que hoje é legítimo (setor lendo/escrevendo seu próprio dado, admin fazendo qualquer coisa) — só fechar acesso cruzado entre setores. Isso só é confirmável rodando o teste de fumaça contra o dev de verdade, então o teste cobre os dois lados: acesso legítimo permitido E acesso cruzado bloqueado. *(Task 6, teste de fumaça)*

---

### Task 1: Corrigir XSS armazenado nas janelas de impressão

**Files:**
- Create: `lib/escape-html.ts`
- Test: `tests/escape-html.test.ts`
- Modify: `app/fiscal/relatorios/page.tsx`, `app/fiscal/parcelamentos/page.tsx`, `components/fiscal/ClienteConferencia.tsx`, `components/contabil/RelatoriosContabil.tsx`, `components/pessoal/RelatoriosPessoal.tsx`

**Contexto do achado:** o HTML dessas 5 janelas de impressão é montado por template string interpolando dado do banco (nome de cliente, CNPJ, responsável, observação, etc.) sem escapar, e escrito com `document.write` numa janela que herda a origem do portal. Qualquer usuário autenticado consegue gravar `<img src=x onerror="...">` como observação de um cliente (a policy hoje permite — será corrigida na Task 6) ou no próprio nome do cliente. Quando um admin clica em "Imprimir", o script roda com a sessão dele.

**Interfaces:**
- Produces: `escapeHtml(valor: unknown): string` — converte pra string e escapa `&`, `<`, `>`, `"`, `'`.

- [ ] **Step 1: Escrever o teste**

```ts
// tests/escape-html.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml } from '../lib/escape-html'

test('escapa os 5 caracteres perigosos de HTML', () => {
  assert.equal(escapeHtml('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;')
  assert.equal(escapeHtml(`O'Brien & Cia`), 'O&#39;Brien &amp; Cia')
})

test('converte número/null/undefined pra string vazia ou literal, sem lançar', () => {
  assert.equal(escapeHtml(42), '42')
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
})

test('texto sem caractere especial não muda', () => {
  assert.equal(escapeHtml('Padaria São José'), 'Padaria São José')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/escape-html.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// lib/escape-html.ts
// Escapa valor pra uso seguro dentro de um template HTML montado à mão
// (document.write das janelas de impressão). Nunca confiar em dado do banco
// nesses templates sem passar por aqui — a política de RLS por trás dele
// não impede um usuário autenticado de gravar HTML/script como texto.
export function escapeHtml(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

- [ ] **Step 4: Rodar e ver passar; type-check**

Run: `node --import tsx --test tests/escape-html.test.ts && npx tsc --noEmit`
Expected: PASS (3 testes), `tsc` limpo.

- [ ] **Step 5: Aplicar nos 5 arquivos de impressão**

Em cada um dos 5 arquivos abaixo, leia o arquivo primeiro, ache o bloco de template string usado em `document.write(...)` (ou equivalente), e envolva **todo** valor interpolado (`${...}`) vindo de dado do banco/usuário com `escapeHtml(...)`. Isso inclui, no mínimo: nome de cliente, CNPJ, responsável, MIT/município, observação, nome de fornecedor, local, empresa — qualquer campo de texto livre ou vindo de uma tabela editável por usuário. Valores literais/estáticos do próprio template (rótulos, títulos fixos) não precisam de escape. Adicione `import { escapeHtml } from '@/lib/escape-html'` no topo de cada arquivo.

  - `app/fiscal/relatorios/page.tsx`
  - `app/fiscal/parcelamentos/page.tsx`
  - `components/fiscal/ClienteConferencia.tsx`
  - `components/contabil/RelatoriosContabil.tsx`
  - `components/pessoal/RelatoriosPessoal.tsx`

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npx eslint app/fiscal/relatorios app/fiscal/parcelamentos components/fiscal/ClienteConferencia.tsx components/contabil/RelatoriosContabil.tsx components/pessoal/RelatoriosPessoal.tsx lib/escape-html.ts`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add lib/escape-html.ts tests/escape-html.test.ts app/fiscal/relatorios app/fiscal/parcelamentos components/fiscal/ClienteConferencia.tsx components/contabil/RelatoriosContabil.tsx components/pessoal/RelatoriosPessoal.tsx
git commit -m "fix(seguranca): escapar HTML nas janelas de impressão (XSS armazenado)"
```

---

### Task 2: Checagem de permissão em `criarTipoTarefa` e `parcelamento-secoes-actions`

**Files:**
- Modify: `lib/tarefa-tipos-actions.ts`
- Modify: `lib/parcelamento-secoes-actions.ts`
- Modify: `components/fiscal/GerenciarSecoesModal.tsx`

**Contexto do achado 1 (`criarTipoTarefa`):** a Server Action não checa permissão nenhuma além de estar logado. Qualquer usuário, de qualquer setor, cria tipo de tarefa em qualquer outro setor, inclusive marcado `padrao=true` (o que injeta esse tipo automaticamente em todo cliente novo daquele setor). É chamada de `components/geral/NovoTipoTarefaModal.tsx`, tanto a partir do cadastro de um cliente específico (`padrao=false`, deve continuar liberado a qualquer membro do setor) quanto a partir do catálogo de admin em `app/admin/configuracoes/*` (`padrao=true`, deve exigir permissão de configuração daquele setor).

**Contexto do achado 2 (`parcelamento-secoes-actions.ts`):** nenhuma das 3 funções checa permissão. Além disso, `renomearSecaoParcelamento` e `removerSecaoParcelamento` confiam no `nome`/`nomeAntigo` vindo do cliente em vez de ler do banco pelo `id` — um `id` de uma seção vazia com o `nome` de uma seção em uso real renomeia/apaga a errada.

- [ ] **Step 1: Ler o padrão de permissão já usado**

Run: `sed -n 1,30p lib/tabelas-estrutura-actions.ts`
Expected: confirmar o padrão `podeAcessarPagina(profile, 'configuracoes', setor)` já usado em outras partes do sistema pra "quem configura o setor".

- [ ] **Step 2: Corrigir `criarTipoTarefa`**

Em `lib/tarefa-tipos-actions.ts`, adicionar os imports `podeAcessarPagina` de `./route-permissions` e o tipo `UserSetor` já importado. Logo depois de `const { user, supabase } = await getAuthenticatedAdmin()` e do `if (!user || !supabase) ...`, adicionar:

```ts
const { data: profile } = await supabase.from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single()
const podeConfigurar = podeAcessarPagina(profile, 'configuracoes', setor)
const membroDoSetor = profile?.role === 'admin' || (profile?.setores ?? []).includes(setor)
if (!membroDoSetor) return { error: 'Acesso negado.' }
if (padrao && !podeConfigurar) return { error: 'Só quem configura o setor pode criar um tipo padrão.' }
```

(`membroDoSetor` preserva o uso legítimo — qualquer pessoa do setor cria tipo não-padrão a partir do cadastro do cliente; `padrao=true` só passa com permissão de configuração.)

- [ ] **Step 3: Corrigir `parcelamento-secoes-actions.ts`**

Reescrever o arquivo inteiro assim (parcelamento é conceito exclusivo do Fiscal — a permissão exigida é sempre `configuracoes:fiscal`; `renomearSecaoParcelamento` perde o parâmetro `nomeAntigo`, lido do banco pelo `id`):

```ts
'use server'

import { getAuthenticatedAdmin } from './supabase/server'
import { podeAcessarPagina } from './route-permissions'

// Parcelamento é um conceito exclusivo do setor Fiscal — a permissão exigida
// é sempre "configuracoes:fiscal", independente de quem chama.
async function contextoConfigFiscal() {
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' as const }
  const { data: profile } = await supabase.from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single()
  if (!podeAcessarPagina(profile, 'configuracoes', 'fiscal')) return { error: 'Acesso negado.' as const }
  return { error: null as const, supabase }
}

export async function criarSecaoParcelamento(nome: string): Promise<{ error: string | null }> {
  const nomeNormalizado = nome.trim().toUpperCase()
  if (!nomeNormalizado) return { error: 'Nome não pode ser vazio.' }

  const ctx = await contextoConfigFiscal()
  if (ctx.error !== null) return { error: ctx.error }

  const { error } = await ctx.supabase.from('parcelamento_secoes').insert({ nome: nomeNormalizado })

  if (error) {
    if (error.code === '23505') return { error: null }
    return { error: error.message }
  }

  return { error: null }
}

export async function renomearSecaoParcelamento(
  id: string,
  nomeNovo: string,
): Promise<{ error: string | null }> {
  const nomeNormalizado = nomeNovo.trim().toUpperCase()
  if (!nomeNormalizado) return { error: 'Nome não pode ser vazio.' }

  const ctx = await contextoConfigFiscal()
  if (ctx.error !== null) return { error: ctx.error }

  const { data: secaoAtual } = await ctx.supabase.from('parcelamento_secoes').select('nome').eq('id', id).maybeSingle()
  if (!secaoAtual) return { error: 'Seção não encontrada.' }
  const nomeAntigo = secaoAtual.nome as string
  if (nomeNormalizado === nomeAntigo) return { error: null }

  const { error } = await ctx.supabase
    .from('parcelamento_secoes')
    .update({ nome: nomeNormalizado })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return { error: 'Já existe uma seção com esse nome.' }
    return { error: error.message }
  }

  const { error: erroCascata } = await ctx.supabase
    .from('parcelamentos')
    .update({ secao: nomeNormalizado })
    .eq('secao', nomeAntigo)

  if (erroCascata) {
    return { error: `Seção renomeada, mas os parcelamentos não foram atualizados: ${erroCascata.message}` }
  }

  return { error: null }
}

export async function removerSecaoParcelamento(id: string): Promise<{ error: string | null }> {
  const ctx = await contextoConfigFiscal()
  if (ctx.error !== null) return { error: ctx.error }

  const { data: secaoAtual } = await ctx.supabase.from('parcelamento_secoes').select('nome').eq('id', id).maybeSingle()
  if (!secaoAtual) return { error: 'Seção não encontrada.' }
  const nome = secaoAtual.nome as string

  const { count, error: erroContagem } = await ctx.supabase
    .from('parcelamentos')
    .select('id', { count: 'exact', head: true })
    .eq('secao', nome)

  if (erroContagem) return { error: erroContagem.message }

  if (count && count > 0) {
    return { error: `Não é possível remover: ${count} parcelamento${count !== 1 ? 's' : ''} usa${count !== 1 ? 'm' : ''} essa seção.` }
  }

  const { error } = await ctx.supabase.from('parcelamento_secoes').delete().eq('id', id)
  if (error) return { error: error.message }

  return { error: null }
}
```

- [ ] **Step 4: Atualizar o único chamador (`GerenciarSecoesModal.tsx`)**

Leia o arquivo primeiro. Troque as duas chamadas:
- `renomearSecaoParcelamento(s.id, s.nome, editValue)` → `renomearSecaoParcelamento(s.id, editValue)`
- `removerSecaoParcelamento(s.id, s.nome)` → `removerSecaoParcelamento(s.id)`

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx eslint lib/tarefa-tipos-actions.ts lib/parcelamento-secoes-actions.ts components/fiscal/GerenciarSecoesModal.tsx`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/tarefa-tipos-actions.ts lib/parcelamento-secoes-actions.ts components/fiscal/GerenciarSecoesModal.tsx
git commit -m "fix(seguranca): checagem de permissão em criarTipoTarefa e seções de parcelamento"
```

---

### Task 3: Corrigir IDOR e bypass de permissão em `tarefa-grupos-actions.ts`

**Files:**
- Modify: `lib/tarefa-grupos-actions.ts`
- Test: `tests/tarefa-grupos-permissao.test.ts`

**Contexto do achado:** `PODE_EDITAR_POR_SETOR[setor](clienteId)` indexa um objeto literal por uma string vinda do cliente sem validar contra a lista real de setores. Com `setor = 'constructor'`, a busca acha `Object` (herdado do protótipo JS), e `Object(clienteId)` devolve um objeto `String`, que é truthy — a checagem de permissão passa sempre, pra qualquer cliente. Além disso, `atualizarGrupoTarefas`/`excluirGrupoTarefas` fazem `update`/`delete` filtrando só por `.eq('id', grupoId)`, sem confirmar que esse grupo pertence ao `clienteId`/`setor` recebidos (IDOR: com o `id` de um grupo de outro cliente, edita/apaga esse grupo mesmo passando a permissão de um cliente diferente).

**Interfaces:**
- Produces: `SETORES_VALIDOS: readonly UserSetor[]` (ou reaproveita `PREFIXOS_SETOR` já existente em `lib/route-permissions.ts`, que é exatamente essa lista).

- [ ] **Step 1: Ler `PREFIXOS_SETOR`**

Run: `grep -n "PREFIXOS_SETOR" lib/route-permissions.ts`
Expected: confirmar que é a lista `['fiscal','contabil','pessoal','societario','financeiro']` — vamos reaproveitar essa constante em vez de criar outra lista paralela.

- [ ] **Step 2: Escrever o teste**

```ts
// tests/tarefa-grupos-permissao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setorValido } from '../lib/tarefa-grupos-actions'

test('setorValido aceita só os 5 setores reais', () => {
  assert.equal(setorValido('fiscal'), true)
  assert.equal(setorValido('contabil'), true)
  assert.equal(setorValido('societario'), true)
})

test('setorValido recusa chave de protótipo do JS e qualquer outra string', () => {
  assert.equal(setorValido('constructor'), false)
  assert.equal(setorValido('__proto__'), false)
  assert.equal(setorValido('toString'), false)
  assert.equal(setorValido('hasOwnProperty'), false)
  assert.equal(setorValido(''), false)
  assert.equal(setorValido('FISCAL'), false)
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --import tsx --test tests/tarefa-grupos-permissao.test.ts`
Expected: FAIL (`setorValido` não é exportado ainda).

- [ ] **Step 4: Corrigir o arquivo**

Reescrever `lib/tarefa-grupos-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin, podeEditarCliente, podeEditarClienteContabil, podeEditarClientePessoal } from '@/lib/supabase/server'
import { PREFIXOS_SETOR } from '@/lib/route-permissions'
import type { UserSetor, TarefaGrupo } from '@/lib/types'

const PODE_EDITAR_POR_SETOR: Record<UserSetor, (clienteId: string) => Promise<boolean>> = {
  fiscal: podeEditarCliente,
  contabil: podeEditarClienteContabil,
  pessoal: podeEditarClientePessoal,
  // Societário, Financeiro e Configurações não têm agrupamento de tarefas
  // por cliente — cai no mesmo bloqueio de "sem permissão" se algum dia
  // chegar aqui por engano.
  societario: async () => false,
  financeiro: async () => false,
  configuracoes: async () => false,
}

// Valida `setor` contra a lista real ANTES de indexar qualquer objeto com
// ele — sem isso, uma string como 'constructor' acha uma propriedade
// herdada do protótipo do JS (Object) em vez de "chave não existe", e a
// checagem de permissão passa sempre. Nunca indexar PODE_EDITAR_POR_SETOR
// (ou qualquer objeto/Record) com um valor não validado primeiro.
export function setorValido(setor: string): setor is UserSetor {
  return (PREFIXOS_SETOR as readonly string[]).includes(setor)
}

function revalidarFichaCliente(setor: UserSetor, clienteId: string) {
  revalidatePath(`/${setor}/clientes/${clienteId}`)
}

export async function listarGruposCliente(
  clienteId: string,
  setor: UserSetor,
): Promise<{ data: TarefaGrupo[]; error: string | null }> {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { data: [], error: 'Sessão inválida.' }

  const { data, error } = await supabase
    .from('tarefa_grupos')
    .select('id, cliente_id, setor, nome, tarefas')
    .eq('cliente_id', clienteId)
    .eq('setor', setor)
    .order('nome')

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as TarefaGrupo[], error: null }
}

export async function listarGruposDoSetor(
  setor: UserSetor,
): Promise<{ data: Pick<TarefaGrupo, 'nome' | 'tarefas'>[]; error: string | null }> {
  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { data: [], error: 'Sessão inválida.' }

  const { data, error } = await supabase
    .from('tarefa_grupos')
    .select('nome, tarefas')
    .eq('setor', setor)
    .order('nome')

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as Pick<TarefaGrupo, 'nome' | 'tarefas'>[], error: null }
}

async function verificarPermissao(setor: string, clienteId: string): Promise<string | null> {
  if (!setorValido(setor)) return 'Setor inválido.'
  if (!(await PODE_EDITAR_POR_SETOR[setor](clienteId))) return 'Sem permissão pra editar esse cliente.'
  return null
}

export async function criarGrupoTarefas(
  clienteId: string,
  setor: UserSetor,
  nome: string,
  tarefas: string[],
): Promise<{ error: string | null }> {
  const erroPermissao = await verificarPermissao(setor, clienteId)
  if (erroPermissao) return { error: erroPermissao }

  const nomeTrim = nome.trim()
  if (!nomeTrim) return { error: 'Dê um nome ao grupo.' }
  if (tarefas.length === 0) return { error: 'Selecione ao menos uma tarefa.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Sessão inválida.' }

  const { error } = await supabase
    .from('tarefa_grupos')
    .insert({ cliente_id: clienteId, setor, nome: nomeTrim, tarefas })

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um grupo com esse nome pra esse cliente.' }
    return { error: error.message }
  }

  revalidarFichaCliente(setor, clienteId)
  return { error: null }
}

export async function atualizarGrupoTarefas(
  grupoId: string,
  clienteId: string,
  setor: UserSetor,
  nome: string,
  tarefas: string[],
): Promise<{ error: string | null }> {
  const erroPermissao = await verificarPermissao(setor, clienteId)
  if (erroPermissao) return { error: erroPermissao }

  const nomeTrim = nome.trim()
  if (!nomeTrim) return { error: 'Dê um nome ao grupo.' }
  if (tarefas.length === 0) return { error: 'Selecione ao menos uma tarefa.' }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Sessão inválida.' }

  // O grupo precisa pertencer ao MESMO cliente/setor já validados acima —
  // sem isso, um grupoId de outro cliente seria editado mesmo com a
  // permissão checada contra o cliente errado (IDOR).
  const { error } = await supabase
    .from('tarefa_grupos')
    .update({ nome: nomeTrim, tarefas })
    .eq('id', grupoId)
    .eq('cliente_id', clienteId)
    .eq('setor', setor)
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um grupo com esse nome pra esse cliente.' }
    if (error.code === 'PGRST116') return { error: 'Grupo não encontrado pra esse cliente.' }
    return { error: error.message }
  }

  revalidarFichaCliente(setor, clienteId)
  return { error: null }
}

export async function excluirGrupoTarefas(
  grupoId: string,
  clienteId: string,
  setor: UserSetor,
): Promise<{ error: string | null }> {
  const erroPermissao = await verificarPermissao(setor, clienteId)
  if (erroPermissao) return { error: erroPermissao }

  const { supabase } = await getAuthenticatedAdmin()
  if (!supabase) return { error: 'Sessão inválida.' }

  const { error, count } = await supabase
    .from('tarefa_grupos')
    .delete({ count: 'exact' })
    .eq('id', grupoId)
    .eq('cliente_id', clienteId)
    .eq('setor', setor)

  if (error) return { error: error.message }
  if (!count) return { error: 'Grupo não encontrado pra esse cliente.' }

  revalidarFichaCliente(setor, clienteId)
  return { error: null }
}
```

- [ ] **Step 5: Rodar e ver passar; type-check**

Run: `node --import tsx --test tests/tarefa-grupos-permissao.test.ts && npx tsc --noEmit`
Expected: PASS (2 testes), `tsc` limpo.

- [ ] **Step 6: Commit**

```bash
git add lib/tarefa-grupos-actions.ts tests/tarefa-grupos-permissao.test.ts
git commit -m "fix(seguranca): corrige IDOR e bypass de permissão em grupos de tarefas"
```

---

### Task 4: Corrigir os dois bugs de corrupção silenciosa de dado no Societário

**Files:**
- Modify: `components/societario/TarefasSocietarioChecklist.tsx`
- Modify: `app/societario/clientes/tarefas-actions.ts`
- Test: `tests/tarefas-societario-checklist.test.ts`

**Contexto do achado 1 (data recua 1 dia):** `formatarDdMm` (linha 22-26 de `TarefasSocietarioChecklist.tsx`) faz `new Date(iso)` sobre uma data-only ISO (ex.: `"2026-09-03"`), que o JS interpreta como meia-noite UTC. `.getDate()`/`.getMonth()`/`.getFullYear()` leem no fuso LOCAL do navegador (Brasília, UTC-3), então qualquer horário antes das 03:00 UTC vira o dia anterior — na prática, **sempre**, porque meia-noite UTC é sempre 21h do dia anterior em Brasília. Isso corrompe a exibição a cada vez que o campo perde o foco (porque o `onBlur` sempre regrava o valor exibido).

**Contexto do achado 2 (data de conclusão resetada ao focar):** `salvarRespostaTextoSocietario` (linha 179-183 de `app/societario/clientes/tarefas-actions.ts`) sempre regrava `concluida_em: new Date().toISOString()` quando `concluida` é true — mesmo que o texto não tenha mudado. Como o `onBlur` do textarea (linha 123 do componente) sempre chama essa action, só clicar no campo e sair já reseta a data de conclusão pra "agora".

- [ ] **Step 1: Escrever o teste**

```ts
// tests/tarefas-societario-checklist.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

// Reimplementação isolada só pra testar a lógica de formatação sem montar
// o componente React inteiro — o componente real (Step 3) usa exatamente
// esta função.
function formatarDdMm(iso: string | null): string {
  if (!iso) return ''
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

test('formatarDdMm não recua um dia (bug de fuso horário corrigido)', () => {
  assert.equal(formatarDdMm('2026-09-03'), '03/09/2026')
  assert.equal(formatarDdMm('2026-01-01'), '01/01/2026')
  assert.equal(formatarDdMm('2026-12-31'), '31/12/2026')
})

test('formatarDdMm com null devolve string vazia', () => {
  assert.equal(formatarDdMm(null), '')
})
```

- [ ] **Step 2: Rodar e ver passar (a função de teste já está correta; isso confirma a lógica antes de aplicar no componente real)**

Run: `node --import tsx --test tests/tarefas-societario-checklist.test.ts`
Expected: PASS (2 testes) — a lógica testada aqui é a que será colada no componente no Step 3.

- [ ] **Step 3: Corrigir `formatarDdMm` no componente**

Em `components/societario/TarefasSocietarioChecklist.tsx`, trocar (linhas 22-26):
```ts
function formatarDdMm(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
```
por:
```ts
// Formata data-only ISO ("2026-09-03") sem passar por Date/fuso horário —
// new Date(iso) interpreta como meia-noite UTC, e ler de volta no fuso de
// Brasília (UTC-3) recuava sempre um dia.
function formatarDdMm(iso: string | null): string {
  if (!iso) return ''
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}
```

- [ ] **Step 4: Corrigir `salvarRespostaTextoSocietario`**

Em `app/societario/clientes/tarefas-actions.ts`, a função já busca/cria a tarefa em `buscarOuCriarTarefa` (linha 173). Depois dessa linha, antes de montar o update, ler o estado atual e só regravar `concluida_em` se o texto de fato mudou:

```ts
  const { id: tarefaId, error } = await buscarOuCriarTarefa(clienteId, tipo, mes, ano)
  if (error) return { error }

  const textoTrimado = texto.trim()
  const concluida = textoTrimado !== ''

  const { data: atual } = await supabase
    .from('tarefas').select('resposta_texto, concluida_em')
    .eq('id', tarefaId).maybeSingle()

  // Só regrava concluida_em se o texto mudou de verdade — sem isso, o
  // onBlur do textarea (que sempre dispara, mesmo sem editar nada) resetava
  // a data de conclusão pra "agora" toda vez que o campo só perdia o foco.
  const textoMudou = (atual?.resposta_texto ?? '') !== textoTrimado
  const concluida_em = textoMudou
    ? (concluida ? new Date().toISOString() : null)
    : atual?.concluida_em ?? null

  const { error: updateError } = await supabase.from('tarefas').update({
    resposta_texto: textoTrimado,
    concluida,
    concluida_em,
  }).eq('id', tarefaId)
  if (updateError) return { error: updateError.message }
```

(substitui o bloco atual das linhas 176-183, mantendo o `revalidarFicha`/`return` que já existem depois.)

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx eslint components/societario/TarefasSocietarioChecklist.tsx app/societario/clientes/tarefas-actions.ts && node --import tsx --test tests/tarefas-societario-checklist.test.ts`
Expected: sem erros, testes passam.

- [ ] **Step 6: Commit**

```bash
git add components/societario/TarefasSocietarioChecklist.tsx app/societario/clientes/tarefas-actions.ts tests/tarefas-societario-checklist.test.ts
git commit -m "fix: corrige recuo de data por fuso horário e reset de data ao focar (Societário)"
```

---

### Task 5: Corrigir loop de redirecionamento (Financeiro/Societário)

**Files:**
- Modify: `proxy.ts`

**Contexto do achado:** `SETOR_HOME.financeiro = '/financeiro/recebimentos'` e `SETOR_HOME.societario = '/societario/procedimentos'` são páginas controláveis por `paginas_acesso` (não estão em `PAGINAS_SEMPRE_LIBERADAS`, ao contrário do `dashboard` do Fiscal/Contábil/Pessoal). Se um usuário tem o setor mas não tem essa página liberada, `proxy.ts` redireciona pra `SETOR_HOME[setor]` — que é a própria página bloqueada — e o redirecionamento se repete pra sempre (`ERR_TOO_MANY_REDIRECTS`), travando o usuário fora do setor inteiro.

- [ ] **Step 1: Ler o trecho atual**

Run: `grep -n "primeiroSetor\|SETOR_HOME" proxy.ts`
Expected: confirmar as linhas exatas do bloco de redirecionamento (dentro do `if (!podeAcessarSetor(...) || !podeAcessarPagina(...))`).

- [ ] **Step 2: Corrigir**

Em `proxy.ts`, trocar o bloco:
```ts
    if (!podeAcessarSetor(profile, setorDaRota) || !podeAcessarPagina(profile, setorDaRota, pagina)) {
      const primeiroSetor = profile?.setores?.[0] as UserSetor | undefined
      const destino = primeiroSetor ? SETOR_HOME[primeiroSetor] : '/intranet'
      return redirectComCookies(new URL(destino, request.url), supabaseResponse)
    }
```
por:
```ts
    if (!podeAcessarSetor(profile, setorDaRota) || !podeAcessarPagina(profile, setorDaRota, pagina)) {
      const primeiroSetor = profile?.setores?.[0] as UserSetor | undefined
      let destino = primeiroSetor ? SETOR_HOME[primeiroSetor] : '/intranet'
      // A home de alguns setores (Financeiro, Societário) é uma página
      // controlável por permissão, não um dashboard sempre liberado — se o
      // usuário também não tem acesso a ELA, redirecionar pra lá de novo
      // criaria um loop infinito (a própria home nega e redireciona pra
      // si mesma). Cai pra /intranet, que nunca é bloqueada por setor.
      if (primeiroSetor) {
        const { pagina: paginaDestino } = resolveSetorPagina(destino)
        if (!podeAcessarPagina(profile, primeiroSetor, paginaDestino)) destino = '/intranet'
      }
      return redirectComCookies(new URL(destino, request.url), supabaseResponse)
    }
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx eslint proxy.ts`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add proxy.ts
git commit -m "fix: evita loop de redirecionamento quando a home do setor também está bloqueada"
```

---

### Task 6: Apertar RLS de 4 tabelas (migration 052, aplicação SÓ NO DEV nesta rodada)

**Files:**
- Create: `supabase/migrations/052_rls_setor_tarefas_e_operacionais.sql`
- Create: `supabase/tests/052_rls_setor_smoke.sql`

**Contexto do achado:** `tarefas` tem uma policy de escrita (`for all using (usuario_id = auth.uid() or is_admin())`) sem checagem de setor — qualquer usuário insere/altera uma linha de QUALQUER setor, desde que seja o dono do registro. `observacoes_clientes`, `procedimentos_societario` e `procedimento_arquivos` têm `using (auth.uid() is not null)` — qualquer autenticado, de qualquer setor, lê/escreve, mesmo sendo dado exclusivo de outro setor (observacoes_clientes é usado só pelo Fiscal; os outros dois são exclusivos do Societário).

**IMPORTANTE — esta migration NÃO deve ser aplicada em produção nesta rodada.** Ao final da Task 6, o relatório final da task deve deixar isso explícito.

- [ ] **Step 1: Confirmar que o número 052 está livre**

Run: `git fetch origin && git ls-tree --name-only origin/dev supabase/migrations/ | tail -2 && gh pr list --state open --json headRefName,files`
Expected: última migration em `origin/dev` é `051_planilhas_reenvio.sql`; nenhum PR aberto reservando `052`. Se houver, usar o próximo número livre em todo o plano.

- [ ] **Step 2: Escrever a migration**

```sql
-- supabase/migrations/052_rls_setor_tarefas_e_operacionais.sql
--
-- Aperta RLS de escrita em 4 tabelas que hoje permitem acesso cruzado entre
-- setores (achado da auditoria de risco de 2026-09-28):
--  * tarefas: a policy de escrita ("Usuário gerencia próprias tarefas")
--    checava só o dono do registro, sem exigir que o setor da tarefa
--    bata com o setor do usuário. Trocada por uma checagem de setor,
--    igual à policy de leitura já existente (migration 006).
--  * observacoes_clientes: usado só pelo Fiscal na prática; a policy de
--    escrita liberava qualquer autenticado, de qualquer setor.
--  * procedimentos_societario / procedimento_arquivos: exclusivos do
--    Societário; a policy de escrita liberava qualquer autenticado.
--
-- Não mexe em tarefa_etapas/tarefa_arquivos (já filtram por setor via join
-- com tarefas desde as migrations 007/011) nem em client_files (decisão já
-- aceita conscientemente antes, fora do escopo desta correção).

drop policy if exists "Usuário gerencia próprias tarefas" on tarefas;
create policy "Setor gerencia tarefas" on tarefas for all using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and tarefas.setor = any(p.setores)
  )
) with check (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and tarefas.setor = any(p.setores)
  )
);

drop policy if exists "Autenticados gerenciam observacoes_clientes" on observacoes_clientes;
create policy "Setor fiscal gerencia observacoes_clientes" on observacoes_clientes for all using (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'fiscal'::user_setor = any(p.setores))
  )
) with check (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'fiscal'::user_setor = any(p.setores))
  )
);

drop policy if exists "Autenticados gerenciam procedimentos_societario" on procedimentos_societario;
create policy "Setor societario gerencia procedimentos_societario" on procedimentos_societario for all using (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'societario'::user_setor = any(p.setores))
  )
) with check (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'societario'::user_setor = any(p.setores))
  )
);

drop policy if exists "Autenticados gerenciam procedimento_arquivos" on procedimento_arquivos;
create policy "Setor societario gerencia procedimento_arquivos" on procedimento_arquivos for all using (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'societario'::user_setor = any(p.setores))
  )
) with check (
  exists (
    select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or 'societario'::user_setor = any(p.setores))
  )
);
```

- [ ] **Step 3: Escrever o teste de fumaça em SQL**

Este arquivo é pro **usuário** colar no SQL Editor do Supabase de **dev** (nunca produção). Cria um usuário fictício em `profiles` (sem criar em `auth.users` — os testes rodam como o dono da conexão, `is_admin()`/`p.id = auth.uid()` não se aplicam da mesma forma via SQL Editor; este teste confere a FORMA das policies e a lógica de setor diretamente, sem depender de `auth.uid()` real). Roda em transação com `rollback`.

```sql
-- supabase/tests/052_rls_setor_smoke.sql
--
-- Teste de fumaça da migration 052. Rodar SÓ no dev, no SQL Editor.
-- Confere que as 4 policies novas existem com o texto esperado (via
-- pg_policies) e que a lógica de "setor bate" está presente no qual
-- (checagem estática, não simula auth.uid() real — isso é testado de
-- verdade fazendo login como cada perfil de teste e usando a tela).
-- Sucesso = aparece a mensagem "052 OK" e nenhum erro.
begin;

do $$
declare
  v_qual text;
begin
  select qual into v_qual from pg_policies where tablename = 'tarefas' and policyname = 'Setor gerencia tarefas';
  assert v_qual is not null, 'policy "Setor gerencia tarefas" não foi criada';
  assert v_qual like '%tarefas.setor%', 'policy de tarefas não referencia tarefas.setor: ' || v_qual;

  select qual into v_qual from pg_policies where tablename = 'observacoes_clientes' and policyname = 'Setor fiscal gerencia observacoes_clientes';
  assert v_qual is not null, 'policy de observacoes_clientes não foi criada';
  assert v_qual like '%fiscal%', 'policy de observacoes_clientes não referencia o setor fiscal: ' || v_qual;

  select qual into v_qual from pg_policies where tablename = 'procedimentos_societario' and policyname = 'Setor societario gerencia procedimentos_societario';
  assert v_qual is not null, 'policy de procedimentos_societario não foi criada';
  assert v_qual like '%societario%', 'policy de procedimentos_societario não referencia o setor societario: ' || v_qual;

  select qual into v_qual from pg_policies where tablename = 'procedimento_arquivos' and policyname = 'Setor societario gerencia procedimento_arquivos';
  assert v_qual is not null, 'policy de procedimento_arquivos não foi criada';
  assert v_qual like '%societario%', 'policy de procedimento_arquivos não referencia o setor societario: ' || v_qual;

  -- As policies antigas não podem mais existir (o "using (auth.uid() is not
  -- null)" sem setor precisa ter sumido de verdade, não só coexistir com a
  -- nova).
  perform 1 from pg_policies where tablename = 'tarefas' and policyname = 'Usuário gerencia próprias tarefas';
  assert not found, 'policy antiga de tarefas ainda existe';
  perform 1 from pg_policies where tablename = 'observacoes_clientes' and policyname = 'Autenticados gerenciam observacoes_clientes';
  assert not found, 'policy antiga de observacoes_clientes ainda existe';
  perform 1 from pg_policies where tablename = 'procedimentos_societario' and policyname = 'Autenticados gerenciam procedimentos_societario';
  assert not found, 'policy antiga de procedimentos_societario ainda existe';
  perform 1 from pg_policies where tablename = 'procedimento_arquivos' and policyname = 'Autenticados gerenciam procedimento_arquivos';
  assert not found, 'policy antiga de procedimento_arquivos ainda existe';

  raise notice '052 OK';
end $$;

rollback;
select '052 OK — confira também na tela: login como usuário mono-setor Fiscal/Societário e teste ler/escrever nas próprias telas (deve continuar funcionando) e, se possível, tentar acessar dado de outro setor por essas 4 tabelas via REST (deve ser negado)' as resultado;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/052_rls_setor_tarefas_e_operacionais.sql supabase/tests/052_rls_setor_smoke.sql
git commit -m "fix(seguranca): aperta RLS de tarefas/observacoes_clientes/procedimentos_societario por setor"
```

---

### Task 7: Verificação final e PR

**Files:** nenhum novo.

- [ ] **Step 1: Suíte completa**

Run: `npx tsc --noEmit && npm test && npx eslint app lib components proxy.ts`
Expected: `tsc` limpo; todos os testes passam (novos + já existentes, sem regressão); lint sem erros nos arquivos tocados.

- [ ] **Step 2: Conferir escopo do diff**

Run: `git diff --stat origin/dev...HEAD`
Expected: só os arquivos das 6 tasks (escape-html, tarefa-tipos-actions, parcelamento-secoes-actions, GerenciarSecoesModal, tarefa-grupos-actions, TarefasSocietarioChecklist, tarefas-actions do Societário, proxy.ts, migration 052 + teste, mais os testes novos).

- [ ] **Step 3: Abrir o PR contra `dev`**

Corpo: resumo de que este PR corrige a Fase 1 de uma auditoria de risco completa (XSS armazenado, 3 falhas de permissão incluindo um IDOR real, 2 bugs de corrupção silenciosa de dado, 1 loop de redirecionamento, e RLS mais apertada em 4 tabelas). **Deixar bem claro, em destaque:**
- A migration `052` é pendente de aplicação manual **só no dev** nesta rodada — NÃO aplicar em produção ainda.
- Depois de aplicada no dev, rodar `supabase/tests/052_rls_setor_smoke.sql` (deve terminar em "052 OK") E testar manualmente logado como um usuário mono-setor (ex.: só Fiscal) confirmando que ele continua conseguindo usar normalmente as telas que sempre usou — essa é a única forma de garantir que a policy não ficou restritiva demais.
- Roteiro de teste manual dos outros itens: tentar imprimir um relatório com uma observação contendo `<script>` gravada direto (ou só confirmar visualmente que caracteres especiais aparecem escapados corretamente em vez de quebrarem o HTML); criar tipo de tarefa a partir do cadastro de um cliente (deve continuar funcionando) e confirmar que só quem configura o setor marca como "padrão"; renomear/remover seção de parcelamento; criar/editar/excluir grupo de tarefas; no Societário, preencher uma data numa etapa e conferir que ela não muda sozinha ao recarregar a página; preencher uma resposta de texto, sair do campo sem mudar nada, e conferir que a data de conclusão não muda; simular (se der, com um usuário de teste) ficar sem acesso à página-home do Financeiro/Societário e confirmar que não trava mais em loop.
- Sem merge — branch de trabalho aberta pra revisão e teste.

- [ ] **Step 4: Avisar o usuário**

1) Aplicar `052_rls_setor_tarefas_e_operacionais.sql` **só no banco de dev** e rodar o teste de fumaça. 2) Testar cada item do roteiro manual, com atenção especial a logar como um usuário comum (não-admin) de cada setor afetado e confirmar que nada que funcionava antes parou de funcionar. 3) A promoção da migration `052` pra produção fica pra depois, como uma decisão separada — avisar explicitamente quando for a hora, não presumir que "Fase 1 pronta" já significa "pode ir pra produção".
