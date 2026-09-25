# Tabelas de planilha — Fase 1 (criação com conferência) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar um `.xlsx`/`.csv` num setor, conferir colunas/tipos/clientes numa tela de revisão e criar uma tabela nova no sistema, com uma tela de leitura para ver o resultado.

**Architecture:** Leitura do arquivo no navegador (`xlsx`), lógica pura em `lib/tabelas/*` (testada com `node --test`), gravação atômica via função SQL `criar_planilha` chamada por uma Server Action que revalida permissão e payload. Dados em três tabelas (`planilhas`, `planilha_colunas`, `planilha_linhas` com `dados jsonb`). UI compartilhada em `components/tabelas/*`, com uma rota fina por setor.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Supabase (Postgres + RLS), `xlsx` (já é dependência), Tailwind v4, `node --import tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-25-tabelas-de-planilha-design.md` (esta é a Fase 1; Fases 2 e 3 terão planos próprios).

## Global Constraints

- **Next.js diferente do treinamento:** antes de escrever código de rota/Server Action, ler o guia relevante em `node_modules/next/dist/docs/01-app/` (AGENTS.md do repo). `params` de páginas é `Promise<...>` (ver `app/fiscal/clientes/[id]/page.tsx`).
- Setores válidos para tabelas: `fiscal`, `contabil`, `pessoal`, `societario`, `financeiro` (nunca `configuracoes`).
- Tipos de coluna da v1: `texto`, `numero`, `data`, `opcoes`, `cliente`. **Sem** Sim/Não.
- Limite: **5.000 linhas** por tabela na criação; validado no cliente e no servidor.
- Valores das células ficam em `dados` **por id da coluna** (uuid), nunca pelo nome.
- Quem cria: Admin ou quem tem `configuracoes:<setor>` em `paginas_acesso` (mesma regra de `podeConfigurarSetor`, via `podeAcessarPagina(profile, 'configuracoes', setor)` de `lib/route-permissions.ts`).
- Criação é **atômica** (uma função SQL); nada gravado pela metade.
- Vínculo com cliente **não exibe nada na ficha do cliente**; só serve dentro da própria tabela.
- Migration `047` é aplicada **manualmente pelo usuário** (nunca rodar contra produção). Toda PR mira `dev`; nunca fazer merge.
- Libs puras usam imports **relativos** (`./x`), como os testes existentes; código de app usa `@/`.
- Texto de UI em português; mensagens de erro claras.
- Trabalhar em worktree isolado a partir de `origin/dev` (outra sessão pode trocar a branch da pasta principal).

## Review Focus

1. **CNPJ com pontuação/zeros/CPF** na coluna Cliente (`12.345.678/0001-90` vs `12345678000190`): deve casar por dígitos. *(Task 3)*
2. **Cabeçalhos repetidos ou vazios**: renomear com sufixo, nunca perder coluna nem sobrescrever dado. *(Task 4)*
3. **Linhas totalmente vazias no fim da planilha** (muito comum): ignoradas, não contam para o limite. *(Task 4)*
4. **Número em formato brasileiro** (`1.234,56`, `R$ 10,00`) e **data `DD/MM/AAAA`**: convertidos; o que não converte fica como texto original, sem sumir. *(Tasks 2 e 5)*
5. **Payload malicioso ou corrompido** na Server Action (id de coluna inexistente, duas colunas Cliente, tipo inválido, setor `configuracoes`): rejeitado no servidor mesmo que a UI nunca envie. *(Task 5)*

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/047_planilhas.sql` | Tabelas, RLS, função `criar_planilha` |
| `lib/tabelas/tipos.ts` | Tipos de coluna, conversão de número/data, detecção de tipo, opções |
| `lib/tabelas/cliente-match.ts` | Normalização, similaridade e casamento com `clientes` |
| `lib/tabelas/parse-planilha.ts` | Ler `.xlsx/.csv` em cabeçalhos + linhas |
| `lib/tabelas/montar-payload.ts` | Montar linhas convertidas; validar payload no servidor |
| `lib/tabelas/formatar.ts` | Formatar valor de célula para exibição |
| `lib/tabelas-actions.ts` | Server Action `criarPlanilha` |
| `components/tabelas/NovaTabelaWizard.tsx` | Upload + conferência + criar (client) |
| `components/tabelas/TabelasLista.tsx` | Lista de tabelas do setor (server) |
| `components/tabelas/TabelaLeitura.tsx` | Leitura da tabela, 100 linhas (server) |
| `app/<setor>/tabelas/page.tsx` e `[id]/page.tsx` (×5) | Rotas finas |
| `lib/paginas-setor.ts` | Slug `tabelas` no menu/permissões |
| `next.config.ts` | `serverActions.bodySizeLimit` |

---

### Task 1: Migration 047

**Files:**
- Create: `supabase/migrations/047_planilhas.sql`

**Interfaces:**
- Produces: tabelas `planilhas`, `planilha_colunas`, `planilha_linhas`; função `criar_planilha(p_setor text, p_nome text, p_criado_por uuid, p_coluna_chave uuid, p_colunas jsonb, p_linhas jsonb) returns uuid`, executável só por `service_role`. Payload de colunas: `[{id, nome, tipo, ordem, opcoes}]`; de linhas: `[{dados, clienteId, ordem}]`.

- [ ] **Step 1: Confirmar que o número está livre**

Run: `git fetch origin && git ls-tree --name-only origin/dev supabase/migrations/ | tail -2 && gh pr list --state open --json headRefName`
Expected: última migration `046_...`; nenhum PR aberto com migration `047`. Se houver, usar o próximo número livre em todo o plano.

- [ ] **Step 2: Escrever a migration**

```sql
-- supabase/migrations/047_planilhas.sql
--
-- Tabelas de planilha: o usuário envia um .xlsx/.csv e o sistema cria uma
-- tabela viva editável por setor. Linhas em JSONB (chave = id da coluna, não
-- o nome, então renomear coluna não quebra dado). Escrita via Server Actions
-- com service role; RLS só libera leitura por setor (e tudo pro admin).

create table planilhas (
  id           uuid primary key default gen_random_uuid(),
  setor        text not null check (setor in ('fiscal','contabil','pessoal','societario','financeiro')),
  nome         text not null,
  coluna_chave uuid,
  criado_por   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index planilhas_setor_idx on planilhas (setor);

create table planilha_colunas (
  id          uuid primary key default gen_random_uuid(),
  planilha_id uuid not null references planilhas(id) on delete cascade,
  nome        text not null,
  tipo        text not null check (tipo in ('texto','numero','data','opcoes','cliente')),
  ordem       int  not null,
  opcoes      jsonb
);
create index planilha_colunas_ordem_idx on planilha_colunas (planilha_id, ordem);

create table planilha_linhas (
  id          uuid primary key default gen_random_uuid(),
  planilha_id uuid not null references planilhas(id) on delete cascade,
  dados       jsonb not null default '{}'::jsonb,
  -- Excluir o cliente do sistema não apaga a linha da planilha: ela vira
  -- "sem cliente".
  cliente_id  uuid references clientes(id) on delete set null,
  ordem       int  not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index planilha_linhas_ordem_idx on planilha_linhas (planilha_id, ordem);
create index planilha_linhas_cliente_idx on planilha_linhas (cliente_id);

alter table planilhas        enable row level security;
alter table planilha_colunas enable row level security;
alter table planilha_linhas  enable row level security;

create policy "Setor le planilhas" on planilhas for select using (
  is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and planilhas.setor = any(p.setores)
  )
);
create policy "Admin gerencia planilhas" on planilhas for all using (is_admin());

-- A RLS de planilhas já se aplica dentro do exists, então herdamos o filtro
-- por setor sem repetir a regra.
create policy "Setor le planilha_colunas" on planilha_colunas for select using (
  exists (select 1 from planilhas pl where pl.id = planilha_colunas.planilha_id)
);
create policy "Admin gerencia planilha_colunas" on planilha_colunas for all using (is_admin());

create policy "Setor le planilha_linhas" on planilha_linhas for select using (
  exists (select 1 from planilhas pl where pl.id = planilha_linhas.planilha_id)
);
create policy "Admin gerencia planilha_linhas" on planilha_linhas for all using (is_admin());

-- Criação atômica (uma função = uma transação): ou grava planilha, colunas e
-- linhas, ou não grava nada. Só o service role chama (a Server Action já
-- validou permissão e payload).
create or replace function criar_planilha(
  p_setor text,
  p_nome text,
  p_criado_por uuid,
  p_coluna_chave uuid,
  p_colunas jsonb,
  p_linhas jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into planilhas (setor, nome, criado_por, coluna_chave)
  values (p_setor, p_nome, p_criado_por, p_coluna_chave)
  returning id into v_id;

  insert into planilha_colunas (id, planilha_id, nome, tipo, ordem, opcoes)
  select (c->>'id')::uuid, v_id, c->>'nome', c->>'tipo', (c->>'ordem')::int,
         nullif(c->'opcoes', 'null'::jsonb)
  from jsonb_array_elements(p_colunas) c;

  insert into planilha_linhas (planilha_id, dados, cliente_id, ordem)
  select v_id, l->'dados', nullif(l->>'clienteId', '')::uuid, (l->>'ordem')::int
  from jsonb_array_elements(p_linhas) l;

  return v_id;
end;
$$;

revoke all on function criar_planilha(text, text, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function criar_planilha(text, text, uuid, uuid, jsonb, jsonb) to service_role;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/047_planilhas.sql
git commit -m "feat(tabelas): migration 047 com planilhas, colunas, linhas e criar_planilha"
```

---

### Task 2: Tipos e conversões (`lib/tabelas/tipos.ts`)

**Files:**
- Create: `lib/tabelas/tipos.ts`
- Test: `tests/tabelas-tipos.test.ts`

**Interfaces:**
- Produces:
  - `type TipoColuna = 'texto'|'numero'|'data'|'opcoes'|'cliente'`; `const TIPOS_COLUNA: TipoColuna[]`
  - `type ValorCelula = string | number | null`
  - `interface OpcaoColuna { valor: string; cor: string }`
  - `paraNumero(v: unknown): number | null`
  - `paraDataISO(v: unknown): string | null` (só strings `AAAA-MM-DD` ou `DD/MM/AAAA`)
  - `opcoesDosValores(valores: string[]): OpcaoColuna[]`
  - `detectarTipoColuna(valores: ValorCelula[]): { tipo: Exclude<TipoColuna,'cliente'>; opcoes?: OpcaoColuna[] }`

- [ ] **Step 1: Escrever os testes**

```ts
// tests/tabelas-tipos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paraNumero, paraDataISO, detectarTipoColuna, opcoesDosValores } from '../lib/tabelas/tipos'

test('paraNumero: formatos brasileiros e simples', () => {
  assert.equal(paraNumero(12.5), 12.5)
  assert.equal(paraNumero('1.234,56'), 1234.56)
  assert.equal(paraNumero('R$ 10,00'), 10)
  assert.equal(paraNumero('12,5'), 12.5)
  assert.equal(paraNumero('1234.56'), 1234.56)
  assert.equal(paraNumero('-7'), -7)
})

test('paraNumero: o que não é número vira null', () => {
  assert.equal(paraNumero('abc'), null)
  assert.equal(paraNumero(''), null)
  assert.equal(paraNumero(null), null)
  assert.equal(paraNumero('12-34'), null)
})

test('paraDataISO: aceita AAAA-MM-DD e DD/MM/AAAA, rejeita datas impossíveis', () => {
  assert.equal(paraDataISO('2026-03-15'), '2026-03-15')
  assert.equal(paraDataISO('15/03/2026'), '2026-03-15')
  assert.equal(paraDataISO('5/3/2026'), '2026-03-05')
  assert.equal(paraDataISO('31/02/2026'), null)
  assert.equal(paraDataISO('texto'), null)
  assert.equal(paraDataISO(45000), null)
})

test('detectarTipoColuna: data, número, texto e vazio', () => {
  assert.equal(detectarTipoColuna(['2026-01-01', '15/02/2026', null]).tipo, 'data')
  assert.equal(detectarTipoColuna([1, '2,5', 3]).tipo, 'numero')
  assert.equal(detectarTipoColuna(['Empresa A', 'Empresa B', 'Empresa C']).tipo, 'texto')
  assert.equal(detectarTipoColuna([null, '', '  ']).tipo, 'texto')
})

test('detectarTipoColuna: poucos valores repetidos viram opções', () => {
  const r = detectarTipoColuna(['Pendente', 'Feito', 'Pendente', 'Feito', 'Pendente', 'Feito'])
  assert.equal(r.tipo, 'opcoes')
  assert.deepEqual(r.opcoes?.map(o => o.valor), ['Pendente', 'Feito'])
})

test('detectarTipoColuna: valores todos distintos não viram opções', () => {
  assert.equal(detectarTipoColuna(['a', 'b', 'c', 'd']).tipo, 'texto')
})

test('opcoesDosValores: únicos, sem vazios, com cor', () => {
  const o = opcoesDosValores(['A', ' B ', 'A', ''])
  assert.deepEqual(o.map(x => x.valor), ['A', 'B'])
  assert.ok(o.every(x => /^#[0-9a-f]{6}$/i.test(x.cor)))
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/tabelas-tipos.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// lib/tabelas/tipos.ts
export type TipoColuna = 'texto' | 'numero' | 'data' | 'opcoes' | 'cliente'
export const TIPOS_COLUNA: TipoColuna[] = ['texto', 'numero', 'data', 'opcoes', 'cliente']
export type ValorCelula = string | number | null

export interface OpcaoColuna { valor: string; cor: string }

export const CORES_OPCOES = ['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#6b7280', '#ec4899', '#14b8a6']

const vazio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

// "1.234" é lido como mil duzentos e trinta e quatro (convenção brasileira);
// "1234.56" e "12,5" são decimais.
export function paraNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  if (s === '') return null
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.')
  else if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function paraDataISO(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  let ano: number, mes: number, dia: number
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(s)
  if (m) {
    ano = +m[1]; mes = +m[2]; dia = +m[3]
  } else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
    if (!m) return null
    dia = +m[1]; mes = +m[2]; ano = +m[3]
  }
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function opcoesDosValores(valores: string[]): OpcaoColuna[] {
  const unicos = Array.from(new Set(valores.map(v => v.trim()).filter(v => v !== '')))
  return unicos.map((valor, i) => ({ valor, cor: CORES_OPCOES[i % CORES_OPCOES.length] }))
}

export function detectarTipoColuna(
  valores: ValorCelula[],
): { tipo: Exclude<TipoColuna, 'cliente'>; opcoes?: OpcaoColuna[] } {
  const preenchidos = valores.filter(v => !vazio(v)) as (string | number)[]
  if (preenchidos.length === 0) return { tipo: 'texto' }
  if (preenchidos.every(v => paraDataISO(v) !== null)) return { tipo: 'data' }
  if (preenchidos.every(v => paraNumero(v) !== null)) return { tipo: 'numero' }
  const distintos = Array.from(new Set(preenchidos.map(v => String(v).trim())))
  if (
    distintos.length >= 2 && distintos.length <= 8 &&
    preenchidos.length >= distintos.length * 2 &&
    distintos.every(d => d.length <= 30)
  ) {
    return { tipo: 'opcoes', opcoes: opcoesDosValores(distintos) }
  }
  return { tipo: 'texto' }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/tabelas-tipos.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/tabelas/tipos.ts tests/tabelas-tipos.test.ts
git commit -m "feat(tabelas): tipos de coluna, conversão de número/data e detecção por amostragem"
```

---

### Task 3: Casamento com clientes (`lib/tabelas/cliente-match.ts`)

**Files:**
- Create: `lib/tabelas/cliente-match.ts`
- Test: `tests/tabelas-cliente-match.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `interface ClienteMatch { id: string; nome: string; cnpj: string | null }`
  - `type StatusMatch = 'exato' | 'sugerido' | 'sem_match'`
  - `interface ResultadoMatch { status: StatusMatch; clienteId: string | null; score: number }` (para `sem_match`, `clienteId` é `null`)
  - `interface GrupoCliente { valor: string; linhas: number; match: ResultadoMatch }`
  - `somenteDigitos(s: string | null | undefined): string`
  - `normalizarNome(s: string): string`
  - `similaridade(a: string, b: string): number` (0..1)
  - `casarCliente(valor: string | null | undefined, clientes: ClienteMatch[]): ResultadoMatch`
  - `agruparValoresCliente(valores: (string | number | null)[], clientes: ClienteMatch[]): GrupoCliente[]`

- [ ] **Step 1: Escrever os testes**

```ts
// tests/tabelas-cliente-match.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  somenteDigitos, normalizarNome, similaridade, casarCliente, agruparValoresCliente,
  type ClienteMatch,
} from '../lib/tabelas/cliente-match'

const clientes: ClienteMatch[] = [
  { id: 'c1', nome: 'Padaria São José LTDA', cnpj: '12.345.678/0001-90' },
  { id: 'c2', nome: 'Mercado Bom Preço ME', cnpj: '98.765.432/0001-10' },
  { id: 'c3', nome: 'Oficina do João', cnpj: null },
]

test('somenteDigitos remove pontuação', () => {
  assert.equal(somenteDigitos('12.345.678/0001-90'), '12345678000190')
  assert.equal(somenteDigitos(null), '')
})

test('normalizarNome ignora acento, caixa, pontuação e sufixo societário', () => {
  assert.equal(normalizarNome('Padaria São José LTDA'), 'padaria sao jose')
  assert.equal(normalizarNome('PADARIA SAO JOSE - ME'), 'padaria sao jose')
  assert.equal(normalizarNome('Fulano S.A.'), 'fulano')
})

test('casarCliente: CNPJ com ou sem pontuação casa exato', () => {
  assert.deepEqual(casarCliente('12345678000190', clientes), { status: 'exato', clienteId: 'c1', score: 1 })
  assert.equal(casarCliente('98.765.432/0001-10', clientes).clienteId, 'c2')
})

test('casarCliente: nome igual após normalização é exato', () => {
  const r = casarCliente('padaria sao jose', clientes)
  assert.equal(r.status, 'exato')
  assert.equal(r.clienteId, 'c1')
})

test('casarCliente: nome parecido é sugerido, não exato', () => {
  const r = casarCliente('Padaria Sao Jose Comercio', clientes)
  assert.equal(r.status, 'sugerido')
  assert.equal(r.clienteId, 'c1')
})

test('casarCliente: sem parecido é sem_match com clienteId nulo', () => {
  const r = casarCliente('Escritório de Advocacia Zeta', clientes)
  assert.equal(r.status, 'sem_match')
  assert.equal(r.clienteId, null)
})

test('casarCliente: vazio é sem_match', () => {
  assert.equal(casarCliente('   ', clientes).status, 'sem_match')
  assert.equal(casarCliente(null, clientes).status, 'sem_match')
})

test('similaridade: idênticos 1, sem nada em comum 0', () => {
  assert.equal(similaridade('abc', 'abc'), 1)
  assert.equal(similaridade('abcd', 'wxyz'), 0)
})

test('agruparValoresCliente: conta linhas por valor distinto e ignora vazios', () => {
  const g = agruparValoresCliente(['Oficina do João', 'Oficina do João', null, '', 12345678000190], clientes)
  assert.equal(g.length, 2)
  const oficina = g.find(x => x.valor === 'Oficina do João')!
  assert.equal(oficina.linhas, 2)
  assert.equal(oficina.match.clienteId, 'c3')
  assert.equal(g.find(x => x.valor === '12345678000190')!.match.clienteId, 'c1')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/tabelas-cliente-match.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// lib/tabelas/cliente-match.ts
export interface ClienteMatch { id: string; nome: string; cnpj: string | null }
export type StatusMatch = 'exato' | 'sugerido' | 'sem_match'
export interface ResultadoMatch { status: StatusMatch; clienteId: string | null; score: number }
export interface GrupoCliente { valor: string; linhas: number; match: ResultadoMatch }

// Abaixo disso o nome não é sugerido (fica "sem cliente" até o usuário escolher).
export const LIMIAR_SUGESTAO = 0.6

const SUFIXOS = new Set(['ltda', 'eireli', 'epp', 'me', 'mei', 'sa'])

export function somenteDigitos(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

export function normalizarNome(s: string): string {
  const base = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const limpo = base.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\bs a\b/g, 'sa')
  return limpo.split(' ').filter(p => p && !SUFIXOS.has(p)).join(' ')
}

function bigramas(s: string): string[] {
  const t = s.replace(/ /g, '')
  if (t.length < 2) return t ? [t] : []
  const r: string[] = []
  for (let i = 0; i < t.length - 1; i++) r.push(t.slice(i, i + 2))
  return r
}

// Coeficiente de Dice sobre bigramas do nome normalizado.
export function similaridade(a: string, b: string): number {
  const na = normalizarNome(a)
  const nb = normalizarNome(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ba = bigramas(na)
  const bb = bigramas(nb)
  if (!ba.length || !bb.length) return 0
  const contagem = new Map<string, number>()
  for (const x of bb) contagem.set(x, (contagem.get(x) ?? 0) + 1)
  let inter = 0
  for (const x of ba) {
    const c = contagem.get(x) ?? 0
    if (c > 0) { inter++; contagem.set(x, c - 1) }
  }
  return (2 * inter) / (ba.length + bb.length)
}

export function casarCliente(valor: string | null | undefined, clientes: ClienteMatch[]): ResultadoMatch {
  const v = (valor ?? '').trim()
  if (!v) return { status: 'sem_match', clienteId: null, score: 0 }

  const digitos = somenteDigitos(v)
  if (digitos.length >= 11) {
    const porDoc = clientes.find(c => somenteDigitos(c.cnpj) === digitos)
    if (porDoc) return { status: 'exato', clienteId: porDoc.id, score: 1 }
  }

  let melhor: ClienteMatch | null = null
  let melhorScore = 0
  for (const c of clientes) {
    const s = similaridade(v, c.nome)
    if (s > melhorScore) { melhorScore = s; melhor = c }
  }
  if (melhor && melhorScore === 1) return { status: 'exato', clienteId: melhor.id, score: 1 }
  if (melhor && melhorScore >= LIMIAR_SUGESTAO) return { status: 'sugerido', clienteId: melhor.id, score: melhorScore }
  return { status: 'sem_match', clienteId: null, score: melhorScore }
}

export function agruparValoresCliente(
  valores: (string | number | null)[],
  clientes: ClienteMatch[],
): GrupoCliente[] {
  const contagem = new Map<string, number>()
  for (const v of valores) {
    const s = v === null || v === undefined ? '' : String(v).trim()
    if (!s) continue
    contagem.set(s, (contagem.get(s) ?? 0) + 1)
  }
  return Array.from(contagem, ([valor, linhas]) => ({ valor, linhas, match: casarCliente(valor, clientes) }))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/tabelas-cliente-match.test.ts`
Expected: PASS (9 testes). Se o teste "nome parecido é sugerido" falhar por pontuação abaixo de 0,6, aumentar a proximidade do exemplo do teste (não baixar o limiar sem falar com o usuário).

- [ ] **Step 5: Commit**

```bash
git add lib/tabelas/cliente-match.ts tests/tabelas-cliente-match.test.ts
git commit -m "feat(tabelas): casamento de cliente por CNPJ e nome parecido"
```

---

### Task 4: Leitura da planilha (`lib/tabelas/parse-planilha.ts`)

**Files:**
- Create: `lib/tabelas/parse-planilha.ts`
- Test: `tests/tabelas-parse-planilha.test.ts`

**Interfaces:**
- Consumes: `ValorCelula` de `./tipos`.
- Produces:
  - `interface PlanilhaLida { abas: string[]; aba: string; cabecalhos: string[]; linhas: ValorCelula[][]; linhaCabecalho: number }`
  - `lerPlanilha(buffer: ArrayBuffer, opts?: { aba?: string; linhaCabecalho?: number }): PlanilhaLida` — `linhaCabecalho` é 1-based entre as linhas **não vazias**; lança `Error` com mensagem em português se o arquivo não tiver dados.
  - `nomesUnicos(cabs: string[]): string[]`
  - Datas viram string `AAAA-MM-DD`; booleanos viram `'Sim'`/`'Não'`; strings vazias viram `null`.

- [ ] **Step 1: Escrever os testes**

```ts
// tests/tabelas-parse-planilha.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { lerPlanilha, nomesUnicos } from '../lib/tabelas/parse-planilha'

function xlsx(aoa: unknown[][], nomeAba = 'Plan1'): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, nomeAba)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

test('lê cabeçalho e linhas, converte data e ignora linhas vazias', () => {
  const buf = xlsx([
    ['Cliente', 'Valor', 'Vencimento'],
    ['Empresa A', 10, new Date(2026, 2, 15)],
    [null, null, null],
    ['Empresa B', 20.5, new Date(2026, 3, 1)],
    [null, null, null],
  ])
  const r = lerPlanilha(buf)
  assert.deepEqual(r.cabecalhos, ['Cliente', 'Valor', 'Vencimento'])
  assert.equal(r.linhas.length, 2)
  assert.deepEqual(r.linhas[0], ['Empresa A', 10, '2026-03-15'])
  assert.deepEqual(r.linhas[1], ['Empresa B', 20.5, '2026-04-01'])
})

test('cabeçalhos vazios e repetidos ganham nome único', () => {
  const buf = xlsx([['Nome', 'Nome', null, 'Nome'], ['a', 'b', 'c', 'd']])
  const r = lerPlanilha(buf)
  assert.deepEqual(r.cabecalhos, ['Nome', 'Nome (2)', 'Coluna 3', 'Nome (3)'])
})

test('nomesUnicos ignora caixa ao detectar repetição', () => {
  assert.deepEqual(nomesUnicos(['a', 'A']), ['a', 'A (2)'])
})

test('linhaCabecalho permite pular título acima do cabeçalho', () => {
  const buf = xlsx([['Relatório de junho'], ['Cliente', 'Valor'], ['A', 1]])
  const r = lerPlanilha(buf, { linhaCabecalho: 2 })
  assert.deepEqual(r.cabecalhos, ['Cliente', 'Valor'])
  assert.deepEqual(r.linhas, [['A', 1]])
})

test('escolhe a aba pedida e lista todas', () => {
  const ws1 = XLSX.utils.aoa_to_sheet([['X'], ['1']])
  const ws2 = XLSX.utils.aoa_to_sheet([['Y'], ['2']])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, 'Um')
  XLSX.utils.book_append_sheet(wb, ws2, 'Dois')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const r = lerPlanilha(buf, { aba: 'Dois' })
  assert.deepEqual(r.abas, ['Um', 'Dois'])
  assert.equal(r.aba, 'Dois')
  assert.deepEqual(r.cabecalhos, ['Y'])
})

test('booleano vira Sim/Não e texto é aparado', () => {
  const buf = xlsx([['Ok', 'Obs'], [true, '  oi  '], [false, '   ']])
  const r = lerPlanilha(buf)
  assert.deepEqual(r.linhas, [['Sim', 'oi'], ['Não', null]])
})

test('planilha vazia lança erro claro', () => {
  const buf = xlsx([[null]])
  assert.throws(() => lerPlanilha(buf), /vazia|dados/i)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/tabelas-parse-planilha.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// lib/tabelas/parse-planilha.ts
import * as XLSX from 'xlsx'
import type { ValorCelula } from './tipos'

export interface PlanilhaLida {
  abas: string[]
  aba: string
  cabecalhos: string[]
  linhas: ValorCelula[][]
  linhaCabecalho: number
}

export function nomesUnicos(cabs: string[]): string[] {
  const usados = new Map<string, number>()
  return cabs.map((c, i) => {
    const base = c.trim() || `Coluna ${i + 1}`
    const chave = base.toLowerCase()
    const n = (usados.get(chave) ?? 0) + 1
    usados.set(chave, n)
    return n === 1 ? base : `${base} (${n})`
  })
}

const pad = (n: number) => String(n).padStart(2, '0')

// O SheetJS entrega datas como Date em horário local com pequenas derivas
// (segundos); somar 12h antes de ler o dia local evita cair no dia anterior.
function dataParaISO(d: Date): string {
  const meioDia = new Date(d.getTime() + 12 * 60 * 60 * 1000)
  return `${meioDia.getFullYear()}-${pad(meioDia.getMonth() + 1)}-${pad(meioDia.getDate())}`
}

function celula(v: unknown): ValorCelula {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : dataParaISO(v)
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  return s === '' ? null : s
}

export function lerPlanilha(
  buffer: ArrayBuffer,
  opts: { aba?: string; linhaCabecalho?: number } = {},
): PlanilhaLida {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const abas = wb.SheetNames
  if (abas.length === 0) throw new Error('O arquivo não tem nenhuma aba com dados.')
  const aba = opts.aba && abas.includes(opts.aba) ? opts.aba : abas[0]

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], {
    header: 1, raw: true, defval: null, blankrows: false,
  })
  if (matriz.length === 0) throw new Error('A aba está vazia: não há cabeçalho nem dados.')

  const linhaCabecalho = Math.min(Math.max(opts.linhaCabecalho ?? 1, 1), matriz.length)
  const cab = matriz[linhaCabecalho - 1]
  const restante = matriz.slice(linhaCabecalho)
  const largura = restante.reduce((m, r) => Math.max(m, r.length), cab.length)

  const cabecalhos = nomesUnicos(
    Array.from({ length: largura }, (_, i) => {
      const c = celula(cab[i])
      return c === null ? '' : String(c)
    }),
  )
  const linhas = restante
    .map(r => Array.from({ length: largura }, (_, i) => celula(r[i])))
    .filter(r => r.some(v => v !== null))

  return { abas, aba, cabecalhos, linhas, linhaCabecalho }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/tabelas-parse-planilha.test.ts`
Expected: PASS (7 testes). Se a data sair um dia errado, ajustar **só** `dataParaISO` (deriva de fuso do SheetJS) até o teste passar, sem alterar o teste.

- [ ] **Step 5: Commit**

```bash
git add lib/tabelas/parse-planilha.ts tests/tabelas-parse-planilha.test.ts
git commit -m "feat(tabelas): leitura de xlsx/csv em cabeçalhos e linhas"
```

---

### Task 5: Montar e validar o payload (`lib/tabelas/montar-payload.ts`)

**Files:**
- Create: `lib/tabelas/montar-payload.ts`
- Test: `tests/tabelas-montar-payload.test.ts`

**Interfaces:**
- Consumes: `TipoColuna`, `TIPOS_COLUNA`, `OpcaoColuna`, `ValorCelula`, `paraNumero`, `paraDataISO` de `./tipos`.
- Produces:
  - `const LIMITE_LINHAS = 5000`; `const SETORES_TABELA = ['fiscal','contabil','pessoal','societario','financeiro'] as const`; `type SetorTabela`
  - `interface ColunaConfig { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null; indiceOrigem: number }`
  - `interface ColunaPayload { id: string; nome: string; tipo: TipoColuna; ordem: number; opcoes: OpcaoColuna[] | null }`
  - `interface LinhaPayload { dados: Record<string, ValorCelula>; clienteId: string | null; ordem: number }`
  - `interface PayloadCriacao { setor: SetorTabela; nome: string; colunaChaveId: string | null; colunas: ColunaPayload[]; linhas: LinhaPayload[] }`
  - `montarLinhas(linhasBrutas: ValorCelula[][], colunas: ColunaConfig[], clientePorLinha: (string | null)[]): { linhas: LinhaPayload[]; naoConvertidas: number }`
  - `validarPayload(entrada: unknown): { ok: true; payload: PayloadCriacao } | { ok: false; erro: string }`

- [ ] **Step 1: Escrever os testes**

```ts
// tests/tabelas-montar-payload.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarLinhas, validarPayload, LIMITE_LINHAS, type ColunaConfig } from '../lib/tabelas/montar-payload'

const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const ID3 = '33333333-3333-4333-8333-333333333333'
const CLI = '44444444-4444-4444-8444-444444444444'

const colunas: ColunaConfig[] = [
  { id: ID1, nome: 'Cliente', tipo: 'cliente', opcoes: null, indiceOrigem: 0 },
  { id: ID2, nome: 'Valor', tipo: 'numero', opcoes: null, indiceOrigem: 1 },
  { id: ID3, nome: 'Vence', tipo: 'data', opcoes: null, indiceOrigem: 2 },
]

test('montarLinhas converte por tipo e guarda por id da coluna', () => {
  const r = montarLinhas(
    [['Empresa A', '1.234,50', '15/03/2026'], ['Empresa B', 20, '2026-04-01']],
    colunas,
    [CLI, null],
  )
  assert.equal(r.naoConvertidas, 0)
  assert.deepEqual(r.linhas[0], {
    dados: { [ID1]: 'Empresa A', [ID2]: 1234.5, [ID3]: '2026-03-15' },
    clienteId: CLI,
    ordem: 0,
  })
  assert.equal(r.linhas[1].clienteId, null)
  assert.equal(r.linhas[1].ordem, 1)
})

test('montarLinhas: valor que não converte fica como texto original e é contado', () => {
  const r = montarLinhas([['A', 'abc', 'ontem']], colunas, [null])
  assert.equal(r.linhas[0].dados[ID2], 'abc')
  assert.equal(r.linhas[0].dados[ID3], 'ontem')
  assert.equal(r.naoConvertidas, 2)
})

test('montarLinhas: célula vazia vira null e não conta como não convertida', () => {
  const r = montarLinhas([['A', null, null]], colunas, [null])
  assert.equal(r.linhas[0].dados[ID2], null)
  assert.equal(r.naoConvertidas, 0)
})

function payloadValido() {
  return {
    setor: 'fiscal',
    nome: 'Certificados',
    colunaChaveId: ID1,
    colunas: [
      { id: ID1, nome: 'Cliente', tipo: 'cliente', ordem: 0, opcoes: null },
      { id: ID2, nome: 'Status', tipo: 'opcoes', ordem: 1, opcoes: [{ valor: 'Ok', cor: '#10b981' }] },
    ],
    linhas: [{ dados: { [ID1]: 'A', [ID2]: 'Ok' }, clienteId: CLI, ordem: 0 }],
  }
}

test('validarPayload aceita um payload válido', () => {
  const r = validarPayload(payloadValido())
  assert.equal(r.ok, true)
})

test('validarPayload rejeita setor inválido (inclui configuracoes)', () => {
  assert.equal(validarPayload({ ...payloadValido(), setor: 'configuracoes' }).ok, false)
  assert.equal(validarPayload({ ...payloadValido(), setor: 'x' }).ok, false)
})

test('validarPayload rejeita nome vazio e sem colunas', () => {
  assert.equal(validarPayload({ ...payloadValido(), nome: '  ' }).ok, false)
  assert.equal(validarPayload({ ...payloadValido(), colunas: [] }).ok, false)
})

test('validarPayload rejeita tipo inválido e duas colunas Cliente', () => {
  const p = payloadValido()
  p.colunas[1] = { ...p.colunas[1], tipo: 'sim_nao' as never }
  assert.equal(validarPayload(p).ok, false)
  const q = payloadValido()
  q.colunas[1] = { id: ID2, nome: 'Outro', tipo: 'cliente', ordem: 1, opcoes: null }
  assert.equal(validarPayload(q).ok, false)
})

test('validarPayload rejeita id de coluna repetido ou não-uuid', () => {
  const p = payloadValido()
  p.colunas[1] = { ...p.colunas[1], id: ID1 }
  assert.equal(validarPayload(p).ok, false)
  const q = payloadValido()
  q.colunas[0] = { ...q.colunas[0], id: 'nao-e-uuid' }
  assert.equal(validarPayload(q).ok, false)
})

test('validarPayload rejeita dado com chave de coluna inexistente', () => {
  const p = payloadValido()
  p.linhas[0].dados = { [ID1]: 'A', [ID3]: 'x' }
  assert.equal(validarPayload(p).ok, false)
})

test('validarPayload rejeita coluna-chave inexistente e clienteId inválido', () => {
  assert.equal(validarPayload({ ...payloadValido(), colunaChaveId: ID3 }).ok, false)
  const p = payloadValido()
  p.linhas[0].clienteId = 'abc'
  assert.equal(validarPayload(p).ok, false)
})

test('validarPayload rejeita acima do limite de linhas', () => {
  const p = payloadValido()
  p.linhas = Array.from({ length: LIMITE_LINHAS + 1 }, (_, i) => ({ dados: {}, clienteId: null, ordem: i }))
  const r = validarPayload(p)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /5\.?000/)
})

test('validarPayload rejeita lixo (não objeto)', () => {
  assert.equal(validarPayload(null).ok, false)
  assert.equal(validarPayload('x').ok, false)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/tabelas-montar-payload.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// lib/tabelas/montar-payload.ts
import { TIPOS_COLUNA, paraNumero, paraDataISO } from './tipos'
import type { TipoColuna, OpcaoColuna, ValorCelula } from './tipos'

export const LIMITE_LINHAS = 5000
export const SETORES_TABELA = ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro'] as const
export type SetorTabela = typeof SETORES_TABELA[number]

const MAX_COLUNAS = 100
const MAX_TEXTO = 120
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ColunaConfig {
  id: string
  nome: string
  tipo: TipoColuna
  opcoes: OpcaoColuna[] | null
  indiceOrigem: number
}
export interface ColunaPayload { id: string; nome: string; tipo: TipoColuna; ordem: number; opcoes: OpcaoColuna[] | null }
export interface LinhaPayload { dados: Record<string, ValorCelula>; clienteId: string | null; ordem: number }
export interface PayloadCriacao {
  setor: SetorTabela
  nome: string
  colunaChaveId: string | null
  colunas: ColunaPayload[]
  linhas: LinhaPayload[]
}

const vazio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

// Converte cada célula pro tipo da coluna. O que não converte fica como o
// texto original (nunca some) e é contado pra avisar o usuário.
export function montarLinhas(
  linhasBrutas: ValorCelula[][],
  colunas: ColunaConfig[],
  clientePorLinha: (string | null)[],
): { linhas: LinhaPayload[]; naoConvertidas: number } {
  let naoConvertidas = 0
  const linhas = linhasBrutas.map((bruta, i) => {
    const dados: Record<string, ValorCelula> = {}
    for (const col of colunas) {
      const raw = bruta[col.indiceOrigem] ?? null
      if (vazio(raw)) { dados[col.id] = null; continue }
      if (col.tipo === 'numero') {
        const n = paraNumero(raw)
        if (n === null) { naoConvertidas++; dados[col.id] = String(raw) } else dados[col.id] = n
      } else if (col.tipo === 'data') {
        const d = paraDataISO(raw)
        if (d === null) { naoConvertidas++; dados[col.id] = String(raw) } else dados[col.id] = d
      } else {
        dados[col.id] = typeof raw === 'number' ? raw : String(raw).trim()
      }
    }
    return { dados, clienteId: clientePorLinha[i] ?? null, ordem: i }
  })
  return { linhas, naoConvertidas }
}

type Resultado = { ok: true; payload: PayloadCriacao } | { ok: false; erro: string }
const falha = (erro: string): Resultado => ({ ok: false, erro })
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// A UI nunca deveria mandar nada inválido, mas a Server Action é uma
// fronteira pública: tudo é revalidado aqui.
export function validarPayload(entrada: unknown): Resultado {
  if (!ehObjeto(entrada)) return falha('Dados inválidos.')

  const setor = entrada.setor
  if (typeof setor !== 'string' || !(SETORES_TABELA as readonly string[]).includes(setor)) return falha('Setor inválido.')

  const nome = typeof entrada.nome === 'string' ? entrada.nome.trim() : ''
  if (!nome) return falha('Informe o nome da tabela.')
  if (nome.length > MAX_TEXTO) return falha(`O nome da tabela pode ter no máximo ${MAX_TEXTO} caracteres.`)

  if (!Array.isArray(entrada.colunas) || entrada.colunas.length === 0) return falha('A tabela precisa de pelo menos uma coluna.')
  if (entrada.colunas.length > MAX_COLUNAS) return falha(`No máximo ${MAX_COLUNAS} colunas.`)

  const ids = new Set<string>()
  const colunas: ColunaPayload[] = []
  let qtdCliente = 0
  for (const c of entrada.colunas) {
    if (!ehObjeto(c)) return falha('Coluna inválida.')
    if (typeof c.id !== 'string' || !UUID.test(c.id)) return falha('Identificador de coluna inválido.')
    if (ids.has(c.id)) return falha('Identificador de coluna repetido.')
    ids.add(c.id)
    const nomeCol = typeof c.nome === 'string' ? c.nome.trim() : ''
    if (!nomeCol || nomeCol.length > MAX_TEXTO) return falha('Cada coluna precisa de um nome de até 120 caracteres.')
    if (typeof c.tipo !== 'string' || !(TIPOS_COLUNA as string[]).includes(c.tipo)) return falha('Tipo de coluna inválido.')
    if (c.tipo === 'cliente') qtdCliente++
    let opcoes: OpcaoColuna[] | null = null
    if (c.tipo === 'opcoes') {
      if (!Array.isArray(c.opcoes)) return falha('Coluna de opções sem lista de opções.')
      opcoes = []
      for (const o of c.opcoes) {
        if (!ehObjeto(o) || typeof o.valor !== 'string' || typeof o.cor !== 'string' || !/^#[0-9a-f]{6}$/i.test(o.cor)) {
          return falha('Opção inválida.')
        }
        opcoes.push({ valor: o.valor.slice(0, 60), cor: o.cor })
      }
    }
    colunas.push({ id: c.id, nome: nomeCol, tipo: c.tipo as TipoColuna, ordem: colunas.length, opcoes })
  }
  if (qtdCliente > 1) return falha('Só pode haver uma coluna do tipo Cliente.')

  let colunaChaveId: string | null = null
  if (entrada.colunaChaveId !== null && entrada.colunaChaveId !== undefined) {
    if (typeof entrada.colunaChaveId !== 'string' || !ids.has(entrada.colunaChaveId)) return falha('Coluna-chave inexistente.')
    colunaChaveId = entrada.colunaChaveId
  }

  if (!Array.isArray(entrada.linhas)) return falha('Linhas inválidas.')
  if (entrada.linhas.length > LIMITE_LINHAS) return falha('O limite é de 5.000 linhas por tabela nesta versão.')

  const linhas: LinhaPayload[] = []
  for (const l of entrada.linhas) {
    if (!ehObjeto(l) || !ehObjeto(l.dados)) return falha('Linha inválida.')
    const dados: Record<string, ValorCelula> = {}
    for (const [k, v] of Object.entries(l.dados)) {
      if (!ids.has(k)) return falha('Linha com valor para coluna inexistente.')
      if (v !== null && typeof v !== 'string' && typeof v !== 'number') return falha('Valor de célula inválido.')
      dados[k] = typeof v === 'string' ? v.slice(0, 5000) : v
    }
    let clienteId: string | null = null
    if (l.clienteId !== null && l.clienteId !== undefined) {
      if (typeof l.clienteId !== 'string' || !UUID.test(l.clienteId)) return falha('Cliente da linha inválido.')
      clienteId = l.clienteId
    }
    linhas.push({ dados, clienteId, ordem: linhas.length })
  }

  return { ok: true, payload: { setor: setor as SetorTabela, nome, colunaChaveId, colunas, linhas } }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/tabelas-montar-payload.test.ts`
Expected: PASS (12 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/tabelas/montar-payload.ts tests/tabelas-montar-payload.test.ts
git commit -m "feat(tabelas): montagem de linhas convertidas e validação do payload"
```

---

### Task 6: Server Action `criarPlanilha` + limite do corpo

**Files:**
- Create: `lib/tabelas-actions.ts`
- Modify: `next.config.ts` (adicionar `experimental.serverActions.bodySizeLimit`)

**Interfaces:**
- Consumes: `validarPayload` de `./tabelas/montar-payload`; `podeAcessarPagina` de `./route-permissions`; `getAuthenticatedAdmin` de `./supabase/server`.
- Produces: `criarPlanilha(entrada: unknown): Promise<{ error: string | null; id?: string }>`.

- [ ] **Step 1: Ler a doc do Next para Server Actions**

Run: `ls node_modules/next/dist/docs/01-app/02-guides/ | head -30` e abrir a doc de forms/mutations se necessário. Confirmar que `'use server'` no topo do arquivo e retorno de objeto simples continuam válidos (é o padrão de `lib/tarefa-tipos-actions.ts`).

- [ ] **Step 2: Aumentar o limite do corpo (confirmado em `.../next-config-js/serverActions.md`)**

Em `next.config.ts`, dentro de `nextConfig`, acrescentar (o limite padrão de 1 MB não comporta 5.000 linhas; 4 MB fica abaixo do teto de 4,5 MB do Vercel):

```ts
const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
  async headers() {
```

- [ ] **Step 3: Escrever a action**

```ts
// lib/tabelas-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from './supabase/server'
import { podeAcessarPagina } from './route-permissions'
import { validarPayload } from './tabelas/montar-payload'

export async function criarPlanilha(entrada: unknown): Promise<{ error: string | null; id?: string }> {
  const validado = validarPayload(entrada)
  if (!validado.ok) return { error: validado.erro }
  const p = validado.payload

  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  // Mesma regra de quem configura o setor (ver podeConfigurarSetor em
  // lib/tarefa-tipo-vinculos-actions.ts): admin ou configuracoes:<setor>.
  const { data: profile } = await supabase
    .from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single()
  if (!podeAcessarPagina(profile, 'configuracoes', p.setor)) return { error: 'Acesso negado.' }

  const { data, error } = await supabase.rpc('criar_planilha', {
    p_setor: p.setor,
    p_nome: p.nome,
    p_criado_por: user.id,
    p_coluna_chave: p.colunaChaveId,
    p_colunas: p.colunas,
    p_linhas: p.linhas,
  })
  if (error || !data) return { error: error?.message ?? 'Não foi possível criar a tabela.' }

  revalidatePath(`/${p.setor}/tabelas`)
  return { error: null, id: data as string }
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/tabelas-actions.ts next.config.ts
git commit -m "feat(tabelas): Server Action criarPlanilha e limite de corpo de 4mb"
```

---

### Task 7: Menu, formatação e leitura da tabela

**Files:**
- Modify: `lib/paginas-setor.ts` (acrescentar `{ slug: 'tabelas', label: 'Tabelas' }` ao final de cada um dos 5 setores)
- Create: `lib/tabelas/formatar.ts`
- Test: `tests/tabelas-formatar.test.ts`
- Create: `components/tabelas/TabelaLeitura.tsx`
- Create: `app/{fiscal,contabil,pessoal,societario,financeiro}/tabelas/[id]/page.tsx` (5 arquivos iguais, mudando só o setor)

**Interfaces:**
- Consumes: `TipoColuna`, `OpcaoColuna`, `ValorCelula` de `lib/tabelas/tipos`; `SetorTabela` de `lib/tabelas/montar-payload`.
- Produces: `formatarValor(tipo: TipoColuna, valor: ValorCelula): string`; componente `<TabelaLeitura setor={SetorTabela} id={string} />` (Server Component que chama `notFound()` se a planilha não existir ou for de outro setor).

- [ ] **Step 1: Teste do formatador**

```ts
// tests/tabelas-formatar.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatarValor } from '../lib/tabelas/formatar'

test('data ISO vira DD/MM/AAAA', () => {
  assert.equal(formatarValor('data', '2026-03-15'), '15/03/2026')
})

test('data que não é ISO aparece como veio', () => {
  assert.equal(formatarValor('data', 'ontem'), 'ontem')
})

test('número usa formato brasileiro; texto de número não convertido aparece como veio', () => {
  assert.equal(formatarValor('numero', 1234.5), '1.234,5')
  assert.equal(formatarValor('numero', 'abc'), 'abc')
})

test('vazio vira traço', () => {
  assert.equal(formatarValor('texto', null), '—')
  assert.equal(formatarValor('texto', ''), '—')
})

test('texto, opções e cliente passam como estão', () => {
  assert.equal(formatarValor('texto', 'oi'), 'oi')
  assert.equal(formatarValor('opcoes', 'Ok'), 'Ok')
  assert.equal(formatarValor('cliente', 'Empresa A'), 'Empresa A')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/tabelas-formatar.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o formatador**

```ts
// lib/tabelas/formatar.ts
import type { TipoColuna, ValorCelula } from './tipos'

export function formatarValor(tipo: TipoColuna, valor: ValorCelula): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (tipo === 'data' && typeof valor === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : valor
  }
  if (tipo === 'numero' && typeof valor === 'number') {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 6 })
  }
  return String(valor)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test tests/tabelas-formatar.test.ts`
Expected: PASS (5 testes). (`toLocaleString('pt-BR')` precisa de ICU completo; o Node 18+ já traz.)

- [ ] **Step 5: Slug no menu**

Em `lib/paginas-setor.ts`, adicionar `{ slug: 'tabelas', label: 'Tabelas' },` como último item de cada array (`fiscal`, `contabil`, `pessoal`, `societario`, `financeiro`). Não mexer em `configuracoes`. Isso faz a página aparecer na sidebar (`components/fiscal/Sidebar.tsx` lê `PAGINAS_POR_SETOR`) e na tela de permissões por página (`app/fiscal/parametros`); usuários não-admin só a veem depois de o Admin conceder `<setor>:tabelas`.

- [ ] **Step 6: Componente de leitura**

```tsx
// components/tabelas/TabelaLeitura.tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatarValor } from '@/lib/tabelas/formatar'
import type { OpcaoColuna, TipoColuna, ValorCelula } from '@/lib/tabelas/tipos'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'

const POR_PAGINA = 100

interface Coluna { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }
interface Linha { id: string; dados: Record<string, ValorCelula>; cliente_id: string | null }

export default async function TabelaLeitura({ setor, id }: { setor: SetorTabela; id: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: planilha } = await supabase.from('planilhas').select('id, nome, setor').eq('id', id).maybeSingle()
  if (!planilha || planilha.setor !== setor) notFound()

  const [{ data: colunasRaw }, { data: linhasRaw, count }] = await Promise.all([
    supabase.from('planilha_colunas').select('id, nome, tipo, opcoes').eq('planilha_id', id).order('ordem'),
    supabase.from('planilha_linhas').select('id, dados, cliente_id', { count: 'exact' })
      .eq('planilha_id', id).order('ordem').range(0, POR_PAGINA - 1),
  ])
  const colunas = (colunasRaw ?? []) as Coluna[]
  const linhas = (linhasRaw ?? []) as Linha[]

  return (
    <div className="p-8">
      <Link href={`/${setor}/tabelas`} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">← Tabelas</Link>
      <h1 className="text-2xl font-bold text-[var(--fg)] mt-2">{planilha.nome}</h1>
      <p className="text-sm text-[var(--fg)]/40 mt-1 mb-6">
        {count ?? linhas.length} linhas · mostrando as primeiras {Math.min(POR_PAGINA, linhas.length)} (somente leitura)
      </p>

      <div className="overflow-x-auto rounded-xl border border-[var(--fg)]/12">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--fg)]/12">
              {colunas.map(c => (
                <th key={c.id} className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                  {c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.id} className="border-b border-[var(--fg)]/8">
                {colunas.map(c => {
                  const valor = l.dados[c.id] ?? null
                  const texto = formatarValor(c.tipo, valor)
                  const cor = c.tipo === 'opcoes' ? c.opcoes?.find(o => o.valor === valor)?.cor : undefined
                  return (
                    <td key={c.id} className="px-4 py-2.5 text-sm text-[var(--fg)] whitespace-nowrap">
                      {cor ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: cor + '25', color: cor, border: `1px solid ${cor}50` }}>{texto}</span>
                      ) : texto}
                      {c.tipo === 'cliente' && !l.cliente_id && valor !== null && (
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30">sem cliente</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {linhas.length === 0 && <p className="text-center text-[var(--fg)]/30 py-12 text-sm">Tabela sem linhas.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Rotas finas de leitura (5 arquivos)**

Para cada setor `S` em `fiscal contabil pessoal societario financeiro`, criar `app/S/tabelas/[id]/page.tsx`:

```tsx
import TabelaLeitura from '@/components/tabelas/TabelaLeitura'

export const metadata = { title: 'Tabela — Tesserato' }

export default async function TabelaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TabelaLeitura setor="S" id={id} />
}
```
(trocar `"S"` pelo setor literal em cada arquivo.)

- [ ] **Step 8: Verificar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros de tipo; todos os testes passam.

- [ ] **Step 9: Commit**

```bash
git add lib/paginas-setor.ts lib/tabelas/formatar.ts tests/tabelas-formatar.test.ts components/tabelas/TabelaLeitura.tsx app
git commit -m "feat(tabelas): slug no menu, formatação e página de leitura da tabela"
```

---

### Task 8: Lista, wizard de criação e rotas de lista

**Files:**
- Create: `components/tabelas/NovaTabelaWizard.tsx`
- Create: `components/tabelas/TabelasLista.tsx`
- Create: `app/{fiscal,contabil,pessoal,societario,financeiro}/tabelas/page.tsx` (5 arquivos)

**Interfaces:**
- Consumes: `lerPlanilha`, `PlanilhaLida` (Task 4); `detectarTipoColuna`, `opcoesDosValores`, `TIPOS_COLUNA`, `TipoColuna`, `OpcaoColuna`, `ValorCelula` (Task 2); `agruparValoresCliente`, `ClienteMatch`, `GrupoCliente` (Task 3); `montarLinhas`, `ColunaConfig`, `LIMITE_LINHAS`, `SetorTabela` (Task 5); `criarPlanilha` (Task 6).
- Produces: `<NovaTabelaWizard setor={SetorTabela} clientes={ClienteMatch[]} />` (client) e `<TabelasLista setor={SetorTabela} />` (server).

- [ ] **Step 1: Ler o guia de Client Components do Next**

Run: `ls node_modules/next/dist/docs/01-app/01-getting-started/` e conferir a página de Server/Client Components (padrão `'use client'`, `useRouter` de `next/navigation`, como em `components/geral/ClienteGeralModal.tsx`).

- [ ] **Step 2: Escrever o wizard**

```tsx
// components/tabelas/NovaTabelaWizard.tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { lerPlanilha, type PlanilhaLida } from '@/lib/tabelas/parse-planilha'
import {
  detectarTipoColuna, opcoesDosValores, TIPOS_COLUNA,
  type TipoColuna, type OpcaoColuna, type ValorCelula,
} from '@/lib/tabelas/tipos'
import { agruparValoresCliente, type ClienteMatch } from '@/lib/tabelas/cliente-match'
import { montarLinhas, LIMITE_LINHAS, type ColunaConfig, type SetorTabela } from '@/lib/tabelas/montar-payload'
import { criarPlanilha } from '@/lib/tabelas-actions'

interface ColunaEdit { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null; indiceOrigem: number }

const ROTULO_TIPO: Record<TipoColuna, string> = {
  texto: 'Texto', numero: 'Número', data: 'Data', opcoes: 'Lista de opções', cliente: 'Cliente',
}

const inputCls = 'px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50'

function colunasDetectadas(p: PlanilhaLida): ColunaEdit[] {
  return p.cabecalhos.map((nome, i) => {
    const det = detectarTipoColuna(p.linhas.map(l => l[i]))
    return { id: crypto.randomUUID(), nome, tipo: det.tipo, opcoes: det.opcoes ?? null, indiceOrigem: i }
  })
}

export default function NovaTabelaWizard({ setor, clientes }: { setor: SetorTabela; clientes: ClienteMatch[] }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [planilha, setPlanilha] = useState<PlanilhaLida | null>(null)
  const [nome, setNome] = useState('')
  const [colunas, setColunas] = useState<ColunaEdit[]>([])
  const [colunaChaveId, setColunaChaveId] = useState<string | null>(null)
  // valor da coluna Cliente -> cliente escolhido (null = "sem cliente")
  const [escolhas, setEscolhas] = useState<Record<string, string | null>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  function carregar(buf: ArrayBuffer, opts?: { aba?: string; linhaCabecalho?: number }) {
    try {
      const p = lerPlanilha(buf, opts)
      if (p.linhas.length === 0) throw new Error('Não há linhas de dados abaixo do cabeçalho.')
      if (p.linhas.length > LIMITE_LINHAS) {
        throw new Error(`A planilha tem ${p.linhas.length.toLocaleString('pt-BR')} linhas; o limite é ${LIMITE_LINHAS.toLocaleString('pt-BR')}.`)
      }
      setPlanilha(p)
      setColunas(colunasDetectadas(p))
      setColunaChaveId(null)
      setEscolhas({})
      setErro(null)
    } catch (e) {
      setPlanilha(null)
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.')
    }
  }

  async function aoEscolherArquivo(f: File | undefined) {
    if (!f) return
    const buf = await f.arrayBuffer()
    setBuffer(buf)
    setNome(f.name.replace(/\.[^.]+$/, ''))
    carregar(buf)
  }

  const colCliente = colunas.find(c => c.tipo === 'cliente') ?? null

  const grupos = useMemo(() => {
    if (!planilha || !colCliente) return []
    return agruparValoresCliente(planilha.linhas.map(l => l[colCliente.indiceOrigem]), clientes)
  }, [planilha, colCliente, clientes])

  // Resolução final por valor: escolha do usuário; senão exato/sugerido.
  function clienteDoValor(valor: string): string | null {
    if (valor in escolhas) return escolhas[valor]
    return grupos.find(g => g.valor === valor)?.match.clienteId ?? null
  }

  function mudarTipo(id: string, tipo: TipoColuna) {
    setColunas(cs => cs.map(c => {
      if (c.id === id) {
        const valores = planilha ? planilha.linhas.map(l => l[c.indiceOrigem]) : []
        const opcoes = tipo === 'opcoes' ? opcoesDosValores(valores.filter((v): v is string | number => v !== null).map(String)) : null
        return { ...c, tipo, opcoes }
      }
      // só uma coluna Cliente: a anterior volta a texto
      return tipo === 'cliente' && c.tipo === 'cliente' ? { ...c, tipo: 'texto' as const } : c
    }))
    setEscolhas({})
  }

  const semMatch = grupos.filter(g => clienteDoValor(g.valor) === null)

  async function criar() {
    if (!planilha) return
    setCriando(true)
    setErro(null)
    const config: ColunaConfig[] = colunas.map(c => ({ ...c }))
    const clientePorLinha = planilha.linhas.map(l => {
      if (!colCliente) return null
      const v = l[colCliente.indiceOrigem]
      return v === null ? null : clienteDoValor(String(v).trim())
    })
    const { linhas } = montarLinhas(planilha.linhas as ValorCelula[][], config, clientePorLinha)
    const resposta = await criarPlanilha({
      setor,
      nome,
      colunaChaveId,
      colunas: colunas.map((c, i) => ({ id: c.id, nome: c.nome, tipo: c.tipo, ordem: i, opcoes: c.opcoes })),
      linhas,
    })
    setCriando(false)
    if (resposta.error || !resposta.id) { setErro(resposta.error ?? 'Não foi possível criar a tabela.'); return }
    router.push(`/${setor}/tabelas/${resposta.id}`)
  }

  function fechar() {
    setAberto(false); setBuffer(null); setPlanilha(null); setErro(null)
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)}
        className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
        Nova tabela
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && !criando && fechar()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Nova tabela a partir de planilha</h2>
          <button onClick={fechar} disabled={criando} className="text-[var(--fg)]/30 hover:text-[var(--fg)] text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">Arquivo (.xlsx ou .csv)</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => aoEscolherArquivo(e.target.files?.[0])}
              className="text-sm text-[var(--fg)]/70" />
          </div>

          {erro && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">⚠ {erro}</div>}

          {planilha && buffer && (<>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">Nome da tabela</label>
                <input className={`${inputCls} w-full`} value={nome} onChange={e => setNome(e.target.value)} maxLength={120} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">Linha do cabeçalho</label>
                <input type="number" min={1} className={`${inputCls} w-full`} value={planilha.linhaCabecalho}
                  onChange={e => carregar(buffer, { aba: planilha.aba, linhaCabecalho: Number(e.target.value) || 1 })} />
              </div>
              {planilha.abas.length > 1 && (
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">Aba</label>
                  <select className={`${inputCls} w-full`} value={planilha.aba}
                    onChange={e => carregar(buffer, { aba: e.target.value })}>
                    {planilha.abas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-[var(--fg)]/50 mb-2">
                {planilha.linhas.length.toLocaleString('pt-BR')} linhas · confira o nome e o tipo de cada coluna. A coluna-chave será usada depois para atualizar a tabela com uma nova planilha (opcional).
              </p>
              <div className="rounded-xl border border-[var(--fg)]/12 divide-y divide-[var(--fg)]/8">
                {colunas.map(c => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <input className={`${inputCls} flex-1 min-w-[10rem]`} value={c.nome} maxLength={120}
                      onChange={e => setColunas(cs => cs.map(x => x.id === c.id ? { ...x, nome: e.target.value } : x))} />
                    <select className={inputCls} value={c.tipo} onChange={e => mudarTipo(c.id, e.target.value as TipoColuna)}>
                      {TIPOS_COLUNA.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-[var(--fg)]/60">
                      <input type="radio" name="chave" checked={colunaChaveId === c.id}
                        onChange={() => setColunaChaveId(c.id)} className="accent-[var(--accent)]" />
                      chave
                    </label>
                    {c.tipo === 'opcoes' && c.opcoes && (
                      <div className="w-full flex flex-wrap gap-1">
                        {c.opcoes.map(o => (
                          <span key={o.valor} className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: o.cor + '25', color: o.cor, border: `1px solid ${o.cor}50` }}>{o.valor}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {colunaChaveId && (
                <button onClick={() => setColunaChaveId(null)} className="mt-2 text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">Limpar coluna-chave</button>
              )}
            </div>

            {colCliente && (
              <div>
                <p className="text-sm font-semibold text-[var(--fg)] mb-1">Clientes da coluna “{colCliente.nome}”</p>
                <p className="text-xs text-[var(--fg)]/50 mb-2">
                  {grupos.length - semMatch.length} de {grupos.length} valores ligados a um cliente.
                  {semMatch.length > 0 && ` ${semMatch.length} sem cliente — escolha abaixo ou deixe assim (poderão ser ligados depois).`}
                </p>
                <div className="rounded-xl border border-[var(--fg)]/12 divide-y divide-[var(--fg)]/8 max-h-72 overflow-y-auto">
                  {grupos.filter(g => g.match.status !== 'exato').map(g => (
                    <div key={g.valor} className="flex flex-wrap items-center gap-3 px-4 py-2">
                      <span className="flex-1 min-w-[10rem] text-sm text-[var(--fg)]">
                        {g.valor} <span className="text-[var(--fg)]/30 text-xs">({g.linhas} {g.linhas === 1 ? 'linha' : 'linhas'})</span>
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${g.match.status === 'sugerido' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                        {g.match.status === 'sugerido' ? 'confirmar' : 'sem match'}
                      </span>
                      <select className={`${inputCls} max-w-xs`} value={clienteDoValor(g.valor) ?? ''}
                        onChange={e => setEscolhas(es => ({ ...es, [g.valor]: e.target.value || null }))}>
                        <option value="">Sem cliente</option>
                        {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
                      </select>
                    </div>
                  ))}
                  {grupos.every(g => g.match.status === 'exato') && (
                    <p className="px-4 py-3 text-sm text-emerald-400">Todos os valores casaram com um cliente cadastrado.</p>
                  )}
                </div>
              </div>
            )}
          </>)}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={fechar} disabled={criando}
            className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm">Cancelar</button>
          <button onClick={criar} disabled={!planilha || !nome.trim() || criando}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50">
            {criando ? 'Criando...' : 'Criar tabela'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Lista (Server Component)**

```tsx
// components/tabelas/TabelasLista.tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { podeAcessarPagina } from '@/lib/route-permissions'
import NovaTabelaWizard from './NovaTabelaWizard'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'

export default async function TabelasLista({ setor }: { setor: SetorTabela }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single()
  const podeCriar = podeAcessarPagina(profile, 'configuracoes', setor)

  const [{ data: planilhas }, { data: clientes }] = await Promise.all([
    supabase.from('planilhas').select('id, nome, created_at, planilha_linhas(count)').eq('setor', setor).order('created_at', { ascending: false }),
    podeCriar
      ? supabase.from('clientes').select('id, nome, cnpj').order('nome')
      : Promise.resolve({ data: [] as { id: string; nome: string; cnpj: string | null }[] }),
  ])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--fg)]">Tabelas</h1>
          <p className="text-sm text-[var(--fg)]/40 mt-1">Planilhas mantidas dentro do sistema</p>
        </div>
        {podeCriar && <NovaTabelaWizard setor={setor} clientes={clientes ?? []} />}
      </div>

      <div className="flex flex-col gap-2">
        {(planilhas ?? []).map(p => {
          const linhas = (p.planilha_linhas as unknown as { count: number }[] | null)?.[0]?.count ?? 0
          return (
            <Link key={p.id} href={`/${setor}/tabelas/${p.id}`}
              className="flex items-center justify-between p-4 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/6 hover:bg-[var(--fg)]/6 transition-all">
              <span className="text-sm font-medium text-[var(--fg)]">{p.nome}</span>
              <span className="text-xs text-[var(--fg)]/40">{linhas.toLocaleString('pt-BR')} linhas · {new Date(p.created_at).toLocaleDateString('pt-BR')}</span>
            </Link>
          )
        })}
        {(planilhas ?? []).length === 0 && (
          <p className="text-center text-[var(--fg)]/30 py-12 text-sm">
            Nenhuma tabela ainda.{podeCriar ? ' Use “Nova tabela” para enviar uma planilha.' : ''}
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rotas finas de lista (5 arquivos)**

Para cada setor `S`, criar `app/S/tabelas/page.tsx`:

```tsx
import TabelasLista from '@/components/tabelas/TabelasLista'

export const metadata = { title: 'Tabelas — Tesserato' }

export default function TabelasPage() {
  return <TabelasLista setor="S" />
}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx eslint components/tabelas lib/tabelas lib/tabelas-actions.ts app/*/tabelas && npm test`
Expected: sem erros de tipo nem de lint nos arquivos novos (avisos pré-existentes em outros arquivos não contam); testes verdes.

- [ ] **Step 6: Commit**

```bash
git add components/tabelas app
git commit -m "feat(tabelas): lista, wizard de criação com conferência e rotas por setor"
```

---

### Task 9: Verificação final e PR

**Files:** nenhum novo.

- [ ] **Step 1: Suíte completa**

Run: `npx tsc --noEmit && npm test`
Expected: `tsc` limpo; todos os testes passam.

- [ ] **Step 2: Conferir escopo do diff**

Run: `git diff --stat origin/dev...HEAD`
Expected: só os arquivos da tabela "File Structure" (mais spec e plano). Nada em `app/*/clientes`, `tarefas` etc.

- [ ] **Step 3: Abrir o PR contra `dev`**

Corpo do PR: resumo da Fase 1, **migration 047 pendente de aplicação manual no dev** (arquivo `supabase/migrations/047_planilhas.sql`), roteiro de teste manual (criar tabela com CNPJ certo, nome parecido e sem match; conferir "sem cliente"; abrir a tabela), e o limite de 5.000 linhas. Sem merge.

- [ ] **Step 4: Avisar o usuário do que ele precisa fazer**

1) Aplicar `047_planilhas.sql` no Supabase de dev. 2) Como Admin, conceder `<setor>:tabelas` aos usuários não-admin em Parâmetros para eles verem a página. 3) Testar: planilha com 3 colunas (cliente/valor/data), uma com status repetido (vira opções), uma linha com cliente inexistente.
