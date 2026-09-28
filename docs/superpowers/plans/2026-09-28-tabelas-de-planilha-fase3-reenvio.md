# Tabelas de planilha — Fase 3 (reenvio para atualizar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Atualizar com planilha" no painel "Gerenciar colunas" que reenvia um `.xlsx`/`.csv` pra uma tabela já existente, casa linha pela coluna-chave, mostra prévia clara (novas, sem conflito, com conflito, ausentes) antes de gravar, e nunca apaga nada por padrão.

**Architecture:** Casamento de coluna por nome e conversão de valor reaproveitam funções puras já existentes (`casarColunas`/`calcularDiffReenvio` novas, `montarLinhas`/`casarCliente` já existentes). Toda a lógica de diff é recalculada do zero **duas vezes no servidor** — uma vez na prévia, outra na confirmação, sempre lendo o banco fresco na mesma chamada — nunca reaproveitando um diff calculado antes. A escrita passa por uma função SQL nova (`SECURITY DEFINER`, migration `051`) que segue as mesmas proteções corrigidas na Fase 2C: filtra por `planilha_id` e por um guarda `de`/`para` por célula.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), React 19, Supabase (Postgres + RLS), `xlsx` (já é dependência), Tailwind v4, `node --import tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-28-tabelas-de-planilha-fase3-reenvio-design.md`

## Global Constraints

- **Next.js diferente do treinamento:** ler o guia relevante em `node_modules/next/dist/docs/01-app/` antes de escrever Server Components/Actions novos.
- Conflito é **por linha inteira**, não por célula: uma linha com N células divergentes vira UMA decisão (manter sistema / usar planilha).
- Só conta como conflito quando a célula no banco **já tinha valor não-vazio** e o valor novo é diferente. Célula vazia recebendo valor novo é preenchimento automático, nunca conflito.
- A coluna-chave em si **nunca entra no diff** (por definição, se ela mudasse seria outra linha).
- Coluna do arquivo sem correspondência entre as já existentes só vira coluna nova se a pessoa marcar explicitamente — nunca automático.
- Linhas do banco que não vieram no arquivo (**ausentes**) só aparecem numa lista informativa — nenhuma ação de exclusão acontece pelo reenvio.
- Reenvio **nunca muda `cliente_id` de uma linha já existente** — o casamento de cliente só vale pra linhas novas (mesmo fluxo da Fase 1). Isso evita uma categoria inteira de conflito de vínculo fora do escopo do spec.
- Leitura de `planilha_linhas` sempre paginada em lotes de 1000 até o teto de 5.000 — nunca uma leitura sem paginar (lição da Fase 2C).
- Escrita protegida contra edição concorrente: cada célula só é sobrescrita se o valor atual no banco, no momento da escrita, ainda bater com o que a MESMA chamada acabou de ler — nunca reaproveita um valor lido numa chamada anterior.
- Toda Server Action reautentica e checa `podeAcessarPagina(profile, 'configuracoes', setor)` (mesma regra da Fase 2C) — nunca confia em setor vindo do cliente, sempre lido da tabela no banco.
- Se a tabela não tem `coluna_chave` definida, o reenvio é bloqueado com mensagem clara — não há como definir uma depois da criação (fora do escopo desta fase e da Fase 2C).
- Migration `051` e o teste de fumaça SQL são aplicados/rodados **manualmente pelo usuário no dev** (nunca pelo agente contra o banco). Toda PR mira `dev`; nunca fazer merge.
- Libs puras usam imports **relativos**; componentes/app usam `@/`.
- `npx tsc --noEmit` tem de ficar limpo.
- Texto de UI em português.
- Trabalhar no worktree isolado. **Esta branch foi ramificada da Fase 2C** (`feat/tabelas-fase2c-estrutura`, já com a Fase 2B mesclada dentro), não de `dev` — a Fase 3 depende diretamente de arquivos da Fase 2C (`GerenciarEstrutura.tsx`, `lib/tabelas-estrutura-actions.ts`, migration `050`) que ainda não estão em `dev`. Quando as Fases 2B/2C forem promovidas pra `dev`, este PR deve ser rebaseado/atualizado contra `dev` antes do merge final — isso é feito fora do escopo desta implementação, mas fica registrado aqui.

## Review Focus

1. **Duas linhas do arquivo reenviado com o mesmo valor de coluna-chave** bloqueiam a gravação inteira com mensagem clara — nunca gravam parcialmente nem escolhem uma arbitrariamente. *(Task 2, teste; Task 3)*
2. **Célula vazia no banco recebendo valor da planilha nunca pede confirmação** (aplica direto), mas célula com valor diferente do que já tinha SEMPRE aparece na lista de conflito da linha, mesmo que só uma célula entre várias tenha mudado. *(Task 2, teste)*
3. **A confirmação nunca reaproveita o diff calculado na prévia** — se alguém editar uma célula entre a prévia e a confirmação, a confirmação relê o banco na mesma chamada e escreve em cima do estado mais recente, nunca do estado que a prévia viu. *(Task 3)*
4. **Escrita nunca sai da própria tabela**: mesmo que o payload de atualizações venha adulterado com um id de linha de outra planilha, a escrita SQL filtra por `planilha_id` e não tem efeito nenhum fora da tabela certa. *(Task 1, teste de fumaça)*
5. **Reenvio nunca move o total da tabela acima de 5.000 linhas** (linhas existentes que ficam + linhas novas) — rejeitado antes de gravar, com mensagem clara. *(Task 3)*

---

### Task 1: Migration 051 e teste SQL de fumaça

**Files:**
- Create: `supabase/migrations/051_planilhas_reenvio.sql`
- Create: `supabase/tests/051_reenvio_smoke.sql`

**Interfaces:**
- Produces: tabela `planilha_reenvio_log` (`id`, `planilha_id`, `usuario_id`, `usuario_nome`, `resumo jsonb`, `created_at`); `aplicar_reenvio_planilha(p_planilha uuid, p_linhas_novas jsonb, p_atualizacoes jsonb, p_usuario_id uuid, p_usuario_nome text, p_resumo jsonb) returns boolean`. `p_linhas_novas` é um array `{dados: jsonb, clienteId: uuid|null}`. `p_atualizacoes` é um array flat `{linha: uuid, coluna: uuid, de: valor, para: valor}` — uma entrada por célula a escrever (não por linha), igual ao padrão de `trocar_tipo_coluna_planilha` da Fase 2C.

- [ ] **Step 1: Confirmar que o número 051 está livre**

Run: `git fetch origin && git ls-tree --name-only origin/dev supabase/migrations/ | tail -3 && gh pr list --state open --json headRefName,files`
Expected: nenhum PR aberto reservando `051`. Se houver, usar o próximo número livre em todo o plano.

- [ ] **Step 2: Escrever a migration**

```sql
-- supabase/migrations/051_planilhas_reenvio.sql
--
-- Reenvio para atualizar uma tabela de planilha já existente: casa linhas
-- pela coluna-chave, insere linhas novas, atualiza linhas existentes célula
-- a célula, e registra um log resumido do que foi feito.
--
-- Cuidados:
--  * A escrita de atualizações é uma lista FLAT de células (linha, coluna,
--    de, para), não de linhas inteiras — cada célula só é escrita se o
--    valor atual no banco ainda bater com "de" (o valor que a MESMA
--    chamada acabou de ler, não um valor de uma chamada anterior).
--  * Todo UPDATE filtra por planilha_id = p_planilha, derivado da própria
--    tabela (nunca de id solto vindo do cliente): escrita nunca sai da
--    tabela certa, mesmo com payload adulterado.
--  * Linhas novas entram no fim da ordem (max(ordem)+1 em diante).

create table planilha_reenvio_log (
  id           uuid primary key default gen_random_uuid(),
  planilha_id  uuid not null references planilhas(id) on delete cascade,
  usuario_id   uuid references profiles(id) on delete set null,
  usuario_nome text not null,
  resumo       jsonb not null,
  created_at   timestamptz not null default now()
);
create index planilha_reenvio_log_planilha_idx on planilha_reenvio_log (planilha_id, created_at desc);

alter table planilha_reenvio_log enable row level security;

create policy "Setor le planilha_reenvio_log" on planilha_reenvio_log for select using (
  is_admin() or exists (
    select 1 from planilhas pl where pl.id = planilha_reenvio_log.planilha_id
  )
);
create policy "Admin gerencia planilha_reenvio_log" on planilha_reenvio_log for all using (is_admin());

create or replace function aplicar_reenvio_planilha(
  p_planilha uuid,
  p_linhas_novas jsonb,
  p_atualizacoes jsonb,
  p_usuario_id uuid,
  p_usuario_nome text,
  p_resumo jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_ordem_max int;
begin
  perform pg_advisory_xact_lock(hashtext(p_planilha::text));

  select coalesce(max(ordem), -1) into v_ordem_max from planilha_linhas where planilha_id = p_planilha;

  for v_item in select * from jsonb_array_elements(coalesce(p_linhas_novas, '[]'::jsonb))
  loop
    v_ordem_max := v_ordem_max + 1;
    insert into planilha_linhas (planilha_id, dados, cliente_id, ordem)
    values (
      p_planilha,
      coalesce(v_item->'dados', '{}'::jsonb),
      nullif(v_item->>'clienteId', '')::uuid,
      v_ordem_max
    );
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_atualizacoes, '[]'::jsonb))
  loop
    update planilha_linhas
       set dados = jsonb_set(dados, array[v_item->>'coluna'], coalesce(v_item->'para', 'null'::jsonb), true),
           updated_at = now()
     where id = (v_item->>'linha')::uuid
       and planilha_id = p_planilha
       and dados -> (v_item->>'coluna') is not distinct from coalesce(v_item->'de', 'null'::jsonb);
  end loop;

  insert into planilha_reenvio_log (planilha_id, usuario_id, usuario_nome, resumo)
  values (p_planilha, p_usuario_id, coalesce(p_usuario_nome, 'Desconhecido'), coalesce(p_resumo, '{}'::jsonb));

  return true;
end;
$$;

revoke all on function aplicar_reenvio_planilha(uuid, jsonb, jsonb, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function aplicar_reenvio_planilha(uuid, jsonb, jsonb, uuid, text, jsonb) to service_role;
```

- [ ] **Step 3: Escrever o teste de fumaça em SQL**

```sql
-- supabase/tests/051_reenvio_smoke.sql
--
-- Teste de fumaça de aplicar_reenvio_planilha. Rodar SÓ no dev, no SQL
-- Editor. Cria dados de teste, roda asserts e desfaz tudo (rollback).
-- Sucesso = aparece a mensagem "051 OK" e nenhum erro.
begin;

do $$
declare
  v_pl uuid := gen_random_uuid();
  v_pl2 uuid := gen_random_uuid();
  c_chave uuid := gen_random_uuid();
  c_b uuid := gen_random_uuid();
  v_linha1 uuid := gen_random_uuid();
  v_linha_pl2 uuid := gen_random_uuid();
  v_novo_id uuid;
  v_dados jsonb;
  v_ok boolean;
  v_total_log int;
begin
  insert into planilhas (id, setor, nome, coluna_chave) values (v_pl, 'fiscal', 'smoke 051', c_chave);
  insert into planilha_colunas (id, planilha_id, nome, tipo, ordem, opcoes) values
    (c_chave, v_pl, 'Chave', 'texto', 0, null),
    (c_b, v_pl, 'Coluna B', 'texto', 1, null);

  insert into planilha_linhas (id, planilha_id, ordem, dados) values
    (v_linha1, v_pl, 0, jsonb_build_object(c_chave::text, 'ABC', c_b::text, 'valor antigo'));

  insert into planilhas (id, setor, nome) values (v_pl2, 'fiscal', 'smoke 051 (planilha 2)');
  insert into planilha_linhas (id, planilha_id, ordem, dados) values
    (v_linha_pl2, v_pl2, 0, jsonb_build_object(c_chave::text, 'não deveria mudar'));

  -- 1) linha nova inserida
  select aplicar_reenvio_planilha(
    v_pl,
    jsonb_build_array(jsonb_build_object('dados', jsonb_build_object(c_chave::text, 'XYZ', c_b::text, 'novo'), 'clienteId', null)),
    '[]'::jsonb,
    null, 'Teste', '{}'::jsonb
  ) into v_ok;
  assert v_ok, 'aplicar reenvio (linha nova) deveria devolver true';
  perform 1 from planilha_linhas where planilha_id = v_pl and dados ->> c_chave::text = 'XYZ';
  assert found, 'linha nova não foi inserida';

  -- 2) atualização de célula existente (guardada por de/para)
  select aplicar_reenvio_planilha(
    v_pl, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('linha', v_linha1, 'coluna', c_b, 'de', 'valor antigo', 'para', 'valor novo')),
    null, 'Teste', '{}'::jsonb
  ) into v_ok;
  assert v_ok, 'aplicar reenvio (atualização) deveria devolver true';
  select dados into v_dados from planilha_linhas where id = v_linha1;
  assert v_dados ->> c_b::text = 'valor novo', 'célula não foi atualizada: ' || v_dados::text;

  -- 3) escrita bloqueada quando "de" não bate mais (edição concorrente):
  -- tenta escrever de novo com o MESMO "de" antigo ('valor antigo'), que já
  -- não é mais o valor atual ('valor novo') — não deve mudar nada
  select aplicar_reenvio_planilha(
    v_pl, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('linha', v_linha1, 'coluna', c_b, 'de', 'valor antigo', 'para', 'sobrescrito?')),
    null, 'Teste', '{}'::jsonb
  ) into v_ok;
  select dados into v_dados from planilha_linhas where id = v_linha1;
  assert v_dados ->> c_b::text = 'valor novo', 'edição concorrente foi sobrescrita indevidamente: ' || v_dados::text;

  -- 4) escrita cruzada entre tabelas bloqueada: id de linha da planilha 2,
  -- passado como se fosse da planilha 1
  select aplicar_reenvio_planilha(
    v_pl, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('linha', v_linha_pl2, 'coluna', c_chave, 'de', 'não deveria mudar', 'para', 'mudou!')),
    null, 'Teste', '{}'::jsonb
  ) into v_ok;
  select dados into v_dados from planilha_linhas where id = v_linha_pl2;
  assert v_dados ->> c_chave::text = 'não deveria mudar', 'escrita cruzada entre tabelas não deveria ter efeito: ' || v_dados::text;

  -- 5) log gravado com o resumo
  select aplicar_reenvio_planilha(
    v_pl, '[]'::jsonb, '[]'::jsonb, null, 'Teste do resumo',
    jsonb_build_object('novas', 1, 'semConflito', 0)
  ) into v_ok;
  select count(*) into v_total_log from planilha_reenvio_log where planilha_id = v_pl and usuario_nome = 'Teste do resumo';
  assert v_total_log = 1, 'log do reenvio não foi gravado';

  raise notice '051 OK';
end $$;

rollback;
select '051 OK (dados de teste desfeitos com rollback)' as resultado;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/051_planilhas_reenvio.sql supabase/tests/051_reenvio_smoke.sql
git commit -m "feat(tabelas): migration 051 com reenvio de planilha e log resumido"
```

---

### Task 2: Casamento e diff puros (`lib/tabelas/reenvio.ts`)

**Files:**
- Create: `lib/tabelas/reenvio.ts`
- Test: `tests/tabelas-reenvio.test.ts`

**Interfaces:**
- Consumes: `TipoColuna`, `OpcaoColuna`, `ValorCelula` de `./tipos`.
- Produces:
  - `interface ColunaExistente { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }`
  - `interface ColunaCasada extends ColunaExistente { indiceOrigem: number }`
  - `interface ColunaNaoReconhecida { nome: string; indiceOrigem: number }`
  - `interface CasamentoColunas { casadas: ColunaCasada[]; naoReconhecidas: ColunaNaoReconhecida[] }`
  - `casarColunas(cabecalhos: string[], existentes: ColunaExistente[]): CasamentoColunas`
  - `chavesDuplicadas(valoresChave: (string | null)[]): string[]`
  - `interface LinhaExistente { id: string; dados: Record<string, ValorCelula> }`
  - `interface LinhaImportada { indiceOrigem: number; chaveValor: string; dados: Record<string, ValorCelula> }`
  - `interface CelulaAlterada { coluna: string; de: ValorCelula; para: ValorCelula }`
  - `interface LinhaNova { indiceOrigem: number; dados: Record<string, ValorCelula> }`
  - `interface LinhaAtualizar { linhaId: string; indiceOrigem: number; semConflito: CelulaAlterada[]; comConflito: CelulaAlterada[] }`
  - `interface DiffReenvio { novas: LinhaNova[]; atualizar: LinhaAtualizar[]; ausentes: LinhaExistente[] }`
  - `calcularDiffReenvio(linhasImportadas: LinhaImportada[], linhasExistentes: LinhaExistente[], colunaChaveId: string): DiffReenvio`
  - `type ResolucaoConflito = 'sistema' | 'planilha'`
  - `montarAtualizacoes(linhas: LinhaAtualizar[], resolucoes: Record<string, ResolucaoConflito>): { linha: string; coluna: string; de: ValorCelula; para: ValorCelula }[]`

- [ ] **Step 1: Escrever os testes**

```ts
// tests/tabelas-reenvio.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  casarColunas, chavesDuplicadas, calcularDiffReenvio, montarAtualizacoes,
  type ColunaExistente, type LinhaExistente, type LinhaImportada, type LinhaAtualizar,
} from '../lib/tabelas/reenvio'

const C_CHAVE = '11111111-1111-4111-8111-111111111111'
const C_B = '22222222-2222-4222-8222-222222222222'
const C_C = '33333333-3333-4333-8333-333333333333'

const existentes: ColunaExistente[] = [
  { id: C_CHAVE, nome: 'Chave', tipo: 'texto', opcoes: null },
  { id: C_B, nome: 'Coluna B', tipo: 'texto', opcoes: null },
]

test('casarColunas casa por nome sem diferenciar maiúsculas/minúsculas, aparado', () => {
  const r = casarColunas(['  chave  ', 'COLUNA B', 'Coluna Nova'], existentes)
  assert.deepEqual(r.casadas, [
    { id: C_CHAVE, nome: 'Chave', tipo: 'texto', opcoes: null, indiceOrigem: 0 },
    { id: C_B, nome: 'Coluna B', tipo: 'texto', opcoes: null, indiceOrigem: 1 },
  ])
  assert.deepEqual(r.naoReconhecidas, [{ nome: 'Coluna Nova', indiceOrigem: 2 }])
})

test('chavesDuplicadas ignora valores vazios e devolve só os repetidos', () => {
  assert.deepEqual(chavesDuplicadas(['A', 'B', 'A', null, '', 'C', 'a']), ['A'])
  assert.deepEqual(chavesDuplicadas(['A', 'B', 'C']), [])
})

test('calcularDiffReenvio: chave nova vira linha nova', () => {
  const importadas: LinhaImportada[] = [
    { indiceOrigem: 0, chaveValor: 'NOVA', dados: { [C_CHAVE]: 'NOVA', [C_B]: 'valor' } },
  ]
  const r = calcularDiffReenvio(importadas, [], C_CHAVE)
  assert.equal(r.novas.length, 1)
  assert.deepEqual(r.novas[0].dados, { [C_CHAVE]: 'NOVA', [C_B]: 'valor' })
  assert.equal(r.atualizar.length, 0)
  assert.equal(r.ausentes.length, 0)
})

test('calcularDiffReenvio: célula vazia no banco recebendo valor é sem conflito', () => {
  const existentesDb: LinhaExistente[] = [{ id: 'linha-1', dados: { [C_CHAVE]: 'ABC', [C_B]: null } }]
  const importadas: LinhaImportada[] = [
    { indiceOrigem: 0, chaveValor: 'ABC', dados: { [C_CHAVE]: 'ABC', [C_B]: 'preenchido' } },
  ]
  const r = calcularDiffReenvio(importadas, existentesDb, C_CHAVE)
  assert.equal(r.atualizar.length, 1)
  assert.deepEqual(r.atualizar[0].semConflito, [{ coluna: C_B, de: null, para: 'preenchido' }])
  assert.deepEqual(r.atualizar[0].comConflito, [])
})

test('calcularDiffReenvio: célula com valor divergente é conflito', () => {
  const existentesDb: LinhaExistente[] = [{ id: 'linha-1', dados: { [C_CHAVE]: 'ABC', [C_B]: 'valor antigo' } }]
  const importadas: LinhaImportada[] = [
    { indiceOrigem: 0, chaveValor: 'ABC', dados: { [C_CHAVE]: 'ABC', [C_B]: 'valor novo' } },
  ]
  const r = calcularDiffReenvio(importadas, existentesDb, C_CHAVE)
  assert.equal(r.atualizar.length, 1)
  assert.deepEqual(r.atualizar[0].comConflito, [{ coluna: C_B, de: 'valor antigo', para: 'valor novo' }])
  assert.deepEqual(r.atualizar[0].semConflito, [])
})

test('calcularDiffReenvio: linha com múltiplas colunas divergentes é UMA entrada em atualizar', () => {
  const existentesDb: LinhaExistente[] = [{ id: 'linha-1', dados: { [C_CHAVE]: 'ABC', [C_B]: 'antigo', [C_C]: null } }]
  const importadas: LinhaImportada[] = [
    { indiceOrigem: 0, chaveValor: 'ABC', dados: { [C_CHAVE]: 'ABC', [C_B]: 'novo', [C_C]: 'preenche' } },
  ]
  const r = calcularDiffReenvio(importadas, existentesDb, C_CHAVE)
  assert.equal(r.atualizar.length, 1)
  assert.equal(r.atualizar[0].comConflito.length, 1)
  assert.equal(r.atualizar[0].semConflito.length, 1)
})

test('calcularDiffReenvio: mesma chave, tudo igual, não entra em atualizar', () => {
  const existentesDb: LinhaExistente[] = [{ id: 'linha-1', dados: { [C_CHAVE]: 'ABC', [C_B]: 'igual' } }]
  const importadas: LinhaImportada[] = [
    { indiceOrigem: 0, chaveValor: 'ABC', dados: { [C_CHAVE]: 'ABC', [C_B]: 'igual' } },
  ]
  const r = calcularDiffReenvio(importadas, existentesDb, C_CHAVE)
  assert.equal(r.atualizar.length, 0)
  assert.equal(r.ausentes.length, 0)
})

test('calcularDiffReenvio: chave do banco que não veio no arquivo é ausente', () => {
  const existentesDb: LinhaExistente[] = [
    { id: 'linha-1', dados: { [C_CHAVE]: 'FICOU' } },
    { id: 'linha-2', dados: { [C_CHAVE]: 'SUMIU' } },
  ]
  const importadas: LinhaImportada[] = [{ indiceOrigem: 0, chaveValor: 'FICOU', dados: { [C_CHAVE]: 'FICOU' } }]
  const r = calcularDiffReenvio(importadas, existentesDb, C_CHAVE)
  assert.equal(r.ausentes.length, 1)
  assert.equal(r.ausentes[0].id, 'linha-2')
})

test('montarAtualizacoes: sem conflito sempre aplica; com conflito só se resolução for "planilha"', () => {
  const linhas: LinhaAtualizar[] = [
    { linhaId: 'l1', indiceOrigem: 0, semConflito: [{ coluna: C_B, de: null, para: 'x' }], comConflito: [{ coluna: C_C, de: 'a', para: 'b' }] },
    { linhaId: 'l2', indiceOrigem: 1, semConflito: [], comConflito: [{ coluna: C_B, de: 'c', para: 'd' }] },
  ]
  const r = montarAtualizacoes(linhas, { l1: 'planilha' })
  assert.deepEqual(r, [
    { linha: 'l1', coluna: C_B, de: null, para: 'x' },
    { linha: 'l1', coluna: C_C, de: 'a', para: 'b' },
  ])
})

test('montarAtualizacoes: resolução ausente do mapa conta como "manter sistema" (padrão)', () => {
  const linhas: LinhaAtualizar[] = [
    { linhaId: 'l1', indiceOrigem: 0, semConflito: [], comConflito: [{ coluna: C_B, de: 'a', para: 'b' }] },
  ]
  assert.deepEqual(montarAtualizacoes(linhas, {}), [])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test tests/tabelas-reenvio.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// lib/tabelas/reenvio.ts
import type { TipoColuna, OpcaoColuna, ValorCelula } from './tipos'

export interface ColunaExistente { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }
export interface ColunaCasada extends ColunaExistente { indiceOrigem: number }
export interface ColunaNaoReconhecida { nome: string; indiceOrigem: number }
export interface CasamentoColunas { casadas: ColunaCasada[]; naoReconhecidas: ColunaNaoReconhecida[] }

// Casa cabeçalho do arquivo com coluna já existente pelo NOME (sem
// diferenciar maiúsculas/minúsculas, aparado) — robusto a reordenação de
// colunas no arquivo original.
export function casarColunas(cabecalhos: string[], existentes: ColunaExistente[]): CasamentoColunas {
  const porNome = new Map(existentes.map(c => [c.nome.trim().toLowerCase(), c]))
  const casadas: ColunaCasada[] = []
  const naoReconhecidas: ColunaNaoReconhecida[] = []
  cabecalhos.forEach((cab, indiceOrigem) => {
    const achada = porNome.get(cab.trim().toLowerCase())
    if (achada) casadas.push({ ...achada, indiceOrigem })
    else naoReconhecidas.push({ nome: cab, indiceOrigem })
  })
  return { casadas, naoReconhecidas }
}

export function chavesDuplicadas(valoresChave: (string | null)[]): string[] {
  const contagem = new Map<string, number>()
  for (const v of valoresChave) {
    if (v === null) continue
    const k = v.trim()
    if (k === '') continue
    contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }
  return Array.from(contagem.entries()).filter(([, n]) => n > 1).map(([k]) => k)
}

export interface LinhaExistente { id: string; dados: Record<string, ValorCelula> }
export interface LinhaImportada { indiceOrigem: number; chaveValor: string; dados: Record<string, ValorCelula> }
export interface CelulaAlterada { coluna: string; de: ValorCelula; para: ValorCelula }
export interface LinhaNova { indiceOrigem: number; dados: Record<string, ValorCelula> }
export interface LinhaAtualizar {
  linhaId: string
  indiceOrigem: number
  semConflito: CelulaAlterada[]
  comConflito: CelulaAlterada[]
}
export interface DiffReenvio { novas: LinhaNova[]; atualizar: LinhaAtualizar[]; ausentes: LinhaExistente[] }

const vazio = (v: ValorCelula) => v === null || (typeof v === 'string' && v.trim() === '')

// Casa cada linha importada com uma linha existente pela coluna-chave.
// Célula vazia no banco recebendo valor novo é preenchimento (sem
// conflito); célula com valor não-vazio e diferente é conflito. A
// coluna-chave nunca entra no diff (por definição não muda).
export function calcularDiffReenvio(
  linhasImportadas: LinhaImportada[],
  linhasExistentes: LinhaExistente[],
  colunaChaveId: string,
): DiffReenvio {
  const existentesPorChave = new Map<string, LinhaExistente>()
  for (const l of linhasExistentes) {
    const chave = l.dados[colunaChaveId]
    if (chave !== null && chave !== undefined && String(chave).trim() !== '') {
      existentesPorChave.set(String(chave).trim(), l)
    }
  }

  const tocadas = new Set<string>()
  const novas: LinhaNova[] = []
  const atualizar: LinhaAtualizar[] = []

  for (const imp of linhasImportadas) {
    const existente = existentesPorChave.get(imp.chaveValor)
    if (!existente) {
      novas.push({ indiceOrigem: imp.indiceOrigem, dados: imp.dados })
      continue
    }
    tocadas.add(imp.chaveValor)
    const semConflito: CelulaAlterada[] = []
    const comConflito: CelulaAlterada[] = []
    for (const [coluna, novo] of Object.entries(imp.dados)) {
      if (coluna === colunaChaveId) continue
      const atual = existente.dados[coluna] ?? null
      if (atual === novo) continue
      if (vazio(atual)) semConflito.push({ coluna, de: atual, para: novo })
      else comConflito.push({ coluna, de: atual, para: novo })
    }
    if (semConflito.length > 0 || comConflito.length > 0) {
      atualizar.push({ linhaId: existente.id, indiceOrigem: imp.indiceOrigem, semConflito, comConflito })
    }
  }

  const ausentes = linhasExistentes.filter(l => {
    const chave = l.dados[colunaChaveId]
    const chaveStr = chave === null || chave === undefined ? '' : String(chave).trim()
    return chaveStr !== '' && !tocadas.has(chaveStr)
  })

  return { novas, atualizar, ausentes }
}

export type ResolucaoConflito = 'sistema' | 'planilha'

// Monta a lista flat de células a escrever: sem-conflito sempre entra;
// com-conflito só entra se a linha foi resolvida como "usar planilha" (o
// padrão — resolução ausente do mapa — é "manter sistema", que pula as
// células em conflito mas ainda aplica os preenchimentos da mesma linha).
export function montarAtualizacoes(
  linhas: LinhaAtualizar[],
  resolucoes: Record<string, ResolucaoConflito>,
): { linha: string; coluna: string; de: ValorCelula; para: ValorCelula }[] {
  const saida: { linha: string; coluna: string; de: ValorCelula; para: ValorCelula }[] = []
  for (const l of linhas) {
    for (const c of l.semConflito) saida.push({ linha: l.linhaId, coluna: c.coluna, de: c.de, para: c.para })
    if (l.comConflito.length > 0 && resolucoes[l.linhaId] === 'planilha') {
      for (const c of l.comConflito) saida.push({ linha: l.linhaId, coluna: c.coluna, de: c.de, para: c.para })
    }
  }
  return saida
}
```

- [ ] **Step 4: Rodar e ver passar; type-check**

Run: `node --import tsx --test tests/tabelas-reenvio.test.ts && npx tsc --noEmit`
Expected: PASS (10 testes) e `tsc` limpo.

- [ ] **Step 5: Commit**

```bash
git add lib/tabelas/reenvio.ts tests/tabelas-reenvio.test.ts
git commit -m "feat(tabelas): casamento de coluna/linha e diff puros do reenvio"
```

---

### Task 3: Server Actions do reenvio (`lib/tabelas-reenvio-actions.ts`)

**Files:**
- Create: `lib/tabelas-reenvio-actions.ts`

**Interfaces:**
- Consumes: `getAuthenticatedAdmin` de `./supabase/server`; `podeAcessarPagina` de `./route-permissions`; `ehUuid` de `./tabelas/editar-celula`; `montarLinhas`, `LIMITE_LINHAS`, `type ColunaConfig` de `./tabelas/montar-payload`; `casarColunas`, `chavesDuplicadas`, `calcularDiffReenvio`, `montarAtualizacoes`, `type ColunaExistente`, `type LinhaExistente`, `type LinhaImportada`, `type ResolucaoConflito`, `type DiffReenvio` de `./tabelas/reenvio`; `SetorTabela` de `./tabelas/montar-payload`; `TipoColuna`, `OpcaoColuna`, `ValorCelula` de `./tabelas/tipos`. Chama a RPC `aplicar_reenvio_planilha` da Task 1.
- Produces:
  - `interface EntradaArquivo { planilhaId: string; cabecalhos: string[]; linhas: ValorCelula[][]; clientePorLinha: (string | null)[] }`
  - `interface PreviaReenvio { novas: number; semConflito: number; comConflito: { linhaId: string; celulas: { coluna: string; de: ValorCelula; para: ValorCelula }[] }[]; ausentes: number; naoConvertidas: number; naoReconhecidas: string[] }`
  - `preVisualizarReenvio(entrada: unknown): Promise<{ error: string | null; previa?: PreviaReenvio }>`
  - `aplicarReenvio(entrada: unknown, resolucoes: Record<string, ResolucaoConflito>): Promise<{ error: string | null }>`

- [ ] **Step 1: Ler o padrão existente**

Run: `sed -n 1,60p lib/tabelas-estrutura-actions.ts`
Expected: confirmar o padrão de `contextoConfig`/`contextoDaColuna`/permissão já usado na Fase 2C — este arquivo novo segue a mesma forma (reautentica, lê setor da tabela no banco, checa `podeAcessarPagina(profile, 'configuracoes', setor)`), mas com um contexto próprio que também exige `coluna_chave` definida.

- [ ] **Step 2: Implementar**

```ts
// lib/tabelas-reenvio-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedAdmin } from './supabase/server'
import { podeAcessarPagina } from './route-permissions'
import { ehUuid } from './tabelas/editar-celula'
import { montarLinhas, LIMITE_LINHAS, type ColunaConfig, type SetorTabela } from './tabelas/montar-payload'
import {
  casarColunas, chavesDuplicadas, calcularDiffReenvio, montarAtualizacoes,
  type ColunaExistente, type LinhaExistente, type LinhaImportada, type ResolucaoConflito, type DiffReenvio,
} from './tabelas/reenvio'
import type { ValorCelula } from './tabelas/tipos'

type Admin = NonNullable<Awaited<ReturnType<typeof getAuthenticatedAdmin>>['supabase']>
type Contexto =
  | { error: string }
  | {
      error: null
      supabase: Admin
      planilhaId: string
      setor: SetorTabela
      colunaChaveId: string
      colunas: ColunaExistente[]
      usuarioId: string
      usuarioNome: string
    }

const LOTE_LINHAS = 1000

// Sessão + tabela + permissão de quem configura o setor + coluna-chave
// definida (sem ela não há como casar linha nenhuma). Setor sempre lido do
// banco, nunca do cliente.
async function contexto(planilhaId: string): Promise<Contexto> {
  if (!ehUuid(planilhaId)) return { error: 'Tabela inválida.' }
  const { user, supabase } = await getAuthenticatedAdmin()
  if (!user || !supabase) return { error: 'Sessão inválida.' }

  const { data: planilha } = await supabase.from('planilhas').select('id, setor, coluna_chave').eq('id', planilhaId).maybeSingle()
  if (!planilha) return { error: 'Tabela não encontrada.' }

  const { data: profile } = await supabase.from('profiles').select('role, setores, paginas_acesso, nome').eq('id', user.id).single()
  if (!podeAcessarPagina(profile, 'configuracoes', planilha.setor as SetorTabela)) return { error: 'Acesso negado.' }

  if (!planilha.coluna_chave) {
    return { error: 'Esta tabela não tem uma coluna-chave definida. Defina uma coluna-chave na criação para poder reenviar.' }
  }

  const { data: colunasRaw } = await supabase
    .from('planilha_colunas').select('id, nome, tipo, opcoes').eq('planilha_id', planilhaId)
  const colunas = (colunasRaw ?? []) as ColunaExistente[]

  return {
    error: null,
    supabase,
    planilhaId: planilha.id as string,
    setor: planilha.setor as SetorTabela,
    colunaChaveId: planilha.coluna_chave as string,
    colunas,
    usuarioId: user.id,
    usuarioNome: (profile?.nome as string | undefined) ?? 'Desconhecido',
  }
}

async function lerLinhasExistentes(supabase: Admin, planilhaId: string): Promise<LinhaExistente[]> {
  const linhas: LinhaExistente[] = []
  for (let offset = 0; offset < LIMITE_LINHAS; offset += LOTE_LINHAS) {
    const { data } = await supabase
      .from('planilha_linhas').select('id, dados')
      .eq('planilha_id', planilhaId)
      .order('id')
      .range(offset, offset + LOTE_LINHAS - 1)
    const lote = data ?? []
    for (const l of lote) linhas.push({ id: l.id as string, dados: l.dados as Record<string, ValorCelula> })
    if (lote.length < LOTE_LINHAS) break
  }
  return linhas
}

export interface EntradaArquivo {
  planilhaId: string
  cabecalhos: string[]
  linhas: ValorCelula[][]
  clientePorLinha: (string | null)[]
}

function validarEntrada(e: unknown): e is EntradaArquivo {
  if (typeof e !== 'object' || e === null) return false
  const x = e as Record<string, unknown>
  return (
    typeof x.planilhaId === 'string' &&
    Array.isArray(x.cabecalhos) && x.cabecalhos.every(c => typeof c === 'string') &&
    Array.isArray(x.linhas) &&
    Array.isArray(x.clientePorLinha)
  )
}

// Recalcula tudo a partir do arquivo cru: casamento de coluna, conversão de
// valor por tipo, e o diff contra as linhas atuais do banco. Chamada tanto
// pela prévia quanto pela confirmação — a confirmação NUNCA reaproveita um
// diff calculado antes, sempre lê o banco de novo dentro desta mesma
// chamada.
async function recalcularDiff(entrada: EntradaArquivo): Promise<
  | { error: string }
  | { error: null; ctx: Extract<Contexto, { error: null }>; diff: DiffReenvio; naoConvertidas: number; naoReconhecidas: string[] }
> {
  const ctx = await contexto(entrada.planilhaId)
  if (ctx.error !== null) return { error: ctx.error }
  if (entrada.linhas.length === 0) return { error: 'Não há linhas de dados no arquivo.' }
  if (entrada.linhas.length > LIMITE_LINHAS) return { error: `O limite é de ${LIMITE_LINHAS.toLocaleString('pt-BR')} linhas por arquivo.` }

  const { casadas, naoReconhecidas } = casarColunas(entrada.cabecalhos, ctx.colunas)
  if (!casadas.some(c => c.id === ctx.colunaChaveId)) {
    return { error: 'O arquivo não tem uma coluna com o mesmo nome da coluna-chave da tabela.' }
  }

  const config: ColunaConfig[] = casadas.map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo, opcoes: c.opcoes, indiceOrigem: c.indiceOrigem }))
  const { linhas: convertidas, naoConvertidas } = montarLinhas(entrada.linhas, config, entrada.clientePorLinha)

  const linhasImportadas: LinhaImportada[] = convertidas.map((l, i) => {
    const dados: Record<string, ValorCelula> = {}
    casadas.forEach((c, j) => { dados[c.id] = l.v[j] })
    const chaveValor = String(dados[ctx.colunaChaveId] ?? '').trim()
    return { indiceOrigem: i, chaveValor, dados }
  })

  const duplicadas = chavesDuplicadas(linhasImportadas.map(l => l.chaveValor || null))
  if (duplicadas.length > 0) {
    return {
      error: `O arquivo tem valores repetidos na coluna-chave: ${duplicadas.slice(0, 5).join(', ')}${duplicadas.length > 5 ? '…' : ''}. Corrija o arquivo antes de reenviar.`,
    }
  }

  const linhasExistentes = await lerLinhasExistentes(ctx.supabase, ctx.planilhaId)
  const diff = calcularDiffReenvio(linhasImportadas, linhasExistentes, ctx.colunaChaveId)

  const totalFinal = linhasExistentes.length + diff.novas.length
  if (totalFinal > LIMITE_LINHAS) {
    return { error: `Esse reenvio deixaria a tabela com ${totalFinal.toLocaleString('pt-BR')} linhas; o limite é ${LIMITE_LINHAS.toLocaleString('pt-BR')}.` }
  }

  return { error: null, ctx, diff, naoConvertidas, naoReconhecidas: naoReconhecidas.map(n => n.nome) }
}

export interface PreviaReenvio {
  novas: number
  semConflito: number
  comConflito: { linhaId: string; celulas: { coluna: string; de: ValorCelula; para: ValorCelula }[] }[]
  ausentes: number
  naoConvertidas: number
  naoReconhecidas: string[]
}

export async function preVisualizarReenvio(entrada: unknown): Promise<{ error: string | null; previa?: PreviaReenvio }> {
  if (!validarEntrada(entrada)) return { error: 'Dados inválidos.' }
  const r = await recalcularDiff(entrada)
  if (r.error !== null) return { error: r.error }

  const semConflito = r.diff.atualizar.reduce((n, l) => n + l.semConflito.length, 0)
  return {
    error: null,
    previa: {
      novas: r.diff.novas.length,
      semConflito,
      comConflito: r.diff.atualizar
        .filter(l => l.comConflito.length > 0)
        .map(l => ({ linhaId: l.linhaId, celulas: l.comConflito })),
      ausentes: r.diff.ausentes.length,
      naoConvertidas: r.naoConvertidas,
      naoReconhecidas: r.naoReconhecidas,
    },
  }
}

export async function aplicarReenvio(
  entrada: unknown,
  resolucoes: Record<string, ResolucaoConflito>,
): Promise<{ error: string | null }> {
  if (!validarEntrada(entrada)) return { error: 'Dados inválidos.' }
  if (typeof resolucoes !== 'object' || resolucoes === null) return { error: 'Resoluções inválidas.' }

  const r = await recalcularDiff(entrada)
  if (r.error !== null) return { error: r.error }
  const { ctx, diff } = r

  const linhasNovas = diff.novas.map(n => ({ dados: n.dados, clienteId: entrada.clientePorLinha[n.indiceOrigem] ?? null }))
  const atualizacoes = montarAtualizacoes(diff.atualizar, resolucoes)

  const comConflitoPlanilha = diff.atualizar.filter(l => l.comConflito.length > 0 && resolucoes[l.linhaId] === 'planilha').length
  const comConflitoSistema = diff.atualizar.filter(l => l.comConflito.length > 0).length - comConflitoPlanilha

  const { error } = await ctx.supabase.rpc('aplicar_reenvio_planilha', {
    p_planilha: ctx.planilhaId,
    p_linhas_novas: linhasNovas,
    p_atualizacoes: atualizacoes,
    p_usuario_id: ctx.usuarioId,
    p_usuario_nome: ctx.usuarioNome,
    p_resumo: {
      novas: diff.novas.length,
      semConflito: diff.atualizar.reduce((n, l) => n + l.semConflito.length, 0),
      comConflitoSistema,
      comConflitoPlanilha,
      ausentes: diff.ausentes.length,
    },
  })
  if (error) return { error: 'Não foi possível aplicar o reenvio.' }
  revalidatePath(`/${ctx.setor}/tabelas/${ctx.planilhaId}`)
  return { error: null }
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx eslint lib/tabelas-reenvio-actions.ts`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/tabelas-reenvio-actions.ts
git commit -m "feat(tabelas): Server Actions do reenvio (prévia e aplicar)"
```

---

### Task 4: Wizard de reenvio e integração no painel

**Files:**
- Create: `components/tabelas/ReenviarPlanilhaWizard.tsx`
- Modify: `components/tabelas/GerenciarEstrutura.tsx`

**Interfaces:**
- Consumes: `lerPlanilha`, `type PlanilhaLida` de `@/lib/tabelas/parse-planilha`; `detectarTipoColuna`, `opcoesDosValores` de `@/lib/tabelas/tipos`; `agruparValoresCliente`, `type ClienteMatch` de `@/lib/tabelas/cliente-match`; `casarColunas` de `@/lib/tabelas/reenvio`; `adicionarColuna` de `@/lib/tabelas-estrutura-actions` (reaproveita a ação já existente da Fase 2C pra criar as colunas marcadas ANTES de calcular a prévia); `preVisualizarReenvio`, `aplicarReenvio`, `type PreviaReenvio` de `@/lib/tabelas-reenvio-actions`.
- Produces: `ReenviarPlanilhaWizard({ planilhaId, setor, colunas, temColunaChave, clientes }: { planilhaId: string; setor: SetorTabela; colunas: { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }[]; temColunaChave: boolean; clientes: ClienteMatch[] })` — componente client autocontido (botão + modal), desabilitado se `!temColunaChave`.

- [ ] **Step 1: Ler o padrão do wizard existente**

Run: `sed -n 1,100p components/tabelas/NovaTabelaWizard.tsx`
Expected: confirmar a estrutura de upload de arquivo, leitura com `lerPlanilha`, e o bloco de revisão de cliente (`grupos`/`clienteDoValor`/render da lista de "sem match"/"sugerido") — o wizard novo reaproveita esse MESMO bloco de revisão de cliente quase sem alteração, só trocando o que acontece ao confirmar.

- [ ] **Step 2: Criar `ReenviarPlanilhaWizard.tsx`**

```tsx
// components/tabelas/ReenviarPlanilhaWizard.tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { lerPlanilha, type PlanilhaLida } from '@/lib/tabelas/parse-planilha'
import { detectarTipoColuna, opcoesDosValores, type TipoColuna, type OpcaoColuna, type ValorCelula } from '@/lib/tabelas/tipos'
import { agruparValoresCliente, type ClienteMatch } from '@/lib/tabelas/cliente-match'
import { casarColunas } from '@/lib/tabelas/reenvio'
import { adicionarColuna } from '@/lib/tabelas-estrutura-actions'
import { preVisualizarReenvio, aplicarReenvio, type PreviaReenvio } from '@/lib/tabelas-reenvio-actions'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'

interface ColunaTabela { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }
interface Props {
  planilhaId: string
  setor: SetorTabela
  colunas: ColunaTabela[]
  temColunaChave: boolean
  clientes: ClienteMatch[]
}

const inputCls = 'px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50'
const btnCls = 'px-3 py-1.5 rounded-lg border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-xs'

export default function ReenviarPlanilhaWizard({ planilhaId, setor, colunas, temColunaChave, clientes }: Props) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [planilha, setPlanilha] = useState<PlanilhaLida | null>(null)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [colunasNovasMarcadas, setColunasNovasMarcadas] = useState<Set<string>>(new Set())
  const [escolhasCliente, setEscolhasCliente] = useState<Record<string, string | null>>({})
  const [previa, setPrevia] = useState<PreviaReenvio | null>(null)
  const [resolucoes, setResolucoes] = useState<Record<string, 'sistema' | 'planilha'>>({})
  const [processando, setProcessando] = useState(false)

  const casamento = useMemo(() => {
    if (!planilha) return null
    return casarColunas(planilha.cabecalhos, colunas)
  }, [planilha, colunas])

  const colCliente = colunas.find(c => c.tipo === 'cliente') ?? null
  const indiceColCliente = casamento?.casadas.find(c => c.id === colCliente?.id)?.indiceOrigem ?? null

  const grupos = useMemo(() => {
    if (!planilha || indiceColCliente === null) return []
    return agruparValoresCliente(planilha.linhas.map(l => l[indiceColCliente]), clientes)
  }, [planilha, indiceColCliente, clientes])

  function clienteDoValor(valor: string): string | null {
    if (valor in escolhasCliente) return escolhasCliente[valor]
    return grupos.find(g => g.valor === valor)?.match.clienteId ?? null
  }

  async function aoEscolherArquivo(f: File | undefined) {
    if (!f) return
    try {
      const buf = await f.arrayBuffer()
      const p = lerPlanilha(buf)
      if (p.linhas.length === 0) throw new Error('Não há linhas de dados abaixo do cabeçalho.')
      setPlanilha(p)
      setColunasNovasMarcadas(new Set())
      setEscolhasCliente({})
      setPrevia(null)
      setResolucoes({})
      setErroLeitura(null)
      setErro(null)
    } catch (e) {
      setPlanilha(null)
      setErroLeitura(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.')
    }
  }

  function montarClientePorLinha(): (string | null)[] {
    if (!planilha || indiceColCliente === null) return planilha ? planilha.linhas.map(() => null) : []
    return planilha.linhas.map(l => {
      const v = l[indiceColCliente]
      return v === null ? null : clienteDoValor(String(v).trim())
    })
  }

  async function calcularPrevia() {
    if (!planilha || !casamento) return
    setErro(null)
    setProcessando(true)
    try {
      // Cria as colunas marcadas ANTES de calcular a prévia: depois de
      // criadas, casarColunas vai casá-las normalmente na próxima chamada
      // (feita pela Server Action, que relê as colunas do banco).
      for (const nome of colunasNovasMarcadas) {
        const naoReconhecida = casamento.naoReconhecidas.find(n => n.nome === nome)
        if (!naoReconhecida) continue
        const valores = planilha.linhas.map(l => l[naoReconhecida.indiceOrigem])
        const det = detectarTipoColuna(valores)
        const opcoes = det.tipo === 'opcoes' ? det.opcoes ?? null : null
        const { error } = await adicionarColuna({ planilhaId, nome, tipo: det.tipo, opcoes })
        if (error) { setErro(`Não foi possível criar a coluna "${nome}": ${error}`); return }
      }

      const entrada = {
        planilhaId,
        cabecalhos: planilha.cabecalhos,
        linhas: planilha.linhas as ValorCelula[][],
        clientePorLinha: montarClientePorLinha(),
      }
      const { error, previa: p } = await preVisualizarReenvio(entrada)
      if (error || !p) { setErro(error ?? 'Não foi possível calcular a prévia.'); return }
      setPrevia(p)
      setResolucoes({})
    } finally {
      setProcessando(false)
    }
  }

  function aplicarResolucaoATodas(valor: 'sistema' | 'planilha') {
    if (!previa) return
    const novo: Record<string, 'sistema' | 'planilha'> = {}
    for (const c of previa.comConflito) novo[c.linhaId] = valor
    setResolucoes(novo)
  }

  async function confirmar() {
    if (!planilha) return
    setErro(null)
    setProcessando(true)
    try {
      const entrada = {
        planilhaId,
        cabecalhos: planilha.cabecalhos,
        linhas: planilha.linhas as ValorCelula[][],
        clientePorLinha: montarClientePorLinha(),
      }
      const { error } = await aplicarReenvio(entrada, resolucoes)
      if (error) { setErro(error); return }
      fechar()
      router.refresh()
    } finally {
      setProcessando(false)
    }
  }

  function fechar() {
    setAberto(false)
    setPlanilha(null)
    setErroLeitura(null)
    setErro(null)
    setPrevia(null)
    setResolucoes({})
  }

  if (!aberto) {
    return (
      <button onClick={() => temColunaChave && setAberto(true)} disabled={!temColunaChave}
        className={`${btnCls} disabled:opacity-40 disabled:cursor-not-allowed`}
        title={temColunaChave ? undefined : 'Esta tabela não tem uma coluna-chave definida. Defina uma coluna-chave na criação para poder reenviar.'}>
        Atualizar com planilha
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && !processando && fechar()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Atualizar com planilha</h2>
          <button onClick={fechar} disabled={processando} className="text-[var(--fg)]/30 hover:text-[var(--fg)] text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">Arquivo (.xlsx ou .csv)</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => aoEscolherArquivo(e.target.files?.[0])} className="text-sm text-[var(--fg)]/70" />
          </div>

          {erroLeitura && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">⚠ {erroLeitura}</div>}
          {erro && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">⚠ {erro}</div>}

          {planilha && casamento && !previa && (<>
            <p className="text-xs text-[var(--fg)]/50">{planilha.linhas.length.toLocaleString('pt-BR')} linhas · {casamento.casadas.length} coluna(s) reconhecida(s).</p>

            {casamento.naoReconhecidas.length > 0 && (
              <div className="rounded-xl border border-[var(--fg)]/12 p-4 space-y-2">
                <p className="text-xs font-bold text-[var(--fg)]/40 uppercase tracking-widest">Colunas não reconhecidas</p>
                {casamento.naoReconhecidas.map(n => (
                  <label key={n.nome} className="flex items-center gap-2 text-sm text-[var(--fg)]">
                    <input type="checkbox" checked={colunasNovasMarcadas.has(n.nome)}
                      onChange={e => setColunasNovasMarcadas(s => {
                        const novo = new Set(s)
                        if (e.target.checked) novo.add(n.nome); else novo.delete(n.nome)
                        return novo
                      })} className="accent-[var(--accent)]" />
                    {n.nome} <span className="text-[var(--fg)]/40 text-xs">— criar como coluna nova</span>
                  </label>
                ))}
              </div>
            )}

            {colCliente && indiceColCliente !== null && (
              <div>
                <p className="text-sm font-semibold text-[var(--fg)] mb-1">Clientes da coluna "{colCliente.nome}"</p>
                <div className="rounded-xl border border-[var(--fg)]/12 divide-y divide-[var(--fg)]/8 max-h-56 overflow-y-auto">
                  {grupos.filter(g => g.match.status !== 'exato').map(g => (
                    <div key={g.valor} className="flex flex-wrap items-center gap-3 px-4 py-2">
                      <span className="flex-1 min-w-[10rem] text-sm text-[var(--fg)]">{g.valor}</span>
                      <select className={`${inputCls} max-w-xs`} value={clienteDoValor(g.valor) ?? ''}
                        onChange={e => setEscolhasCliente(es => ({ ...es, [g.valor]: e.target.value || null }))}>
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

            <button onClick={calcularPrevia} disabled={processando}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {processando ? 'Calculando…' : 'Calcular prévia'}
            </button>
          </>)}

          {previa && (<>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-emerald-400 font-bold">{previa.novas}</p>
                <p className="text-[var(--fg)]/60 text-xs">linha(s) nova(s)</p>
              </div>
              <div className="rounded-xl border border-[var(--fg)]/12 p-3">
                <p className="text-[var(--fg)] font-bold">{previa.semConflito}</p>
                <p className="text-[var(--fg)]/60 text-xs">célula(s) preenchidas sem conflito</p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-amber-400 font-bold">{previa.comConflito.length}</p>
                <p className="text-[var(--fg)]/60 text-xs">linha(s) com conflito</p>
              </div>
              <div className="rounded-xl border border-[var(--fg)]/12 p-3">
                <p className="text-[var(--fg)] font-bold">{previa.ausentes}</p>
                <p className="text-[var(--fg)]/60 text-xs">linha(s) ausente(s) no arquivo</p>
              </div>
            </div>

            {previa.naoConvertidas > 0 && (
              <p className="text-xs text-amber-400">{previa.naoConvertidas} valor(es) não puderam ser convertidos para o tipo da coluna e serão mantidos como texto.</p>
            )}

            {previa.comConflito.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[var(--fg)]/40 uppercase tracking-widest">Linhas em conflito</p>
                  <div className="flex gap-2">
                    <button className={btnCls} onClick={() => aplicarResolucaoATodas('sistema')}>Manter sistema (todas)</button>
                    <button className={btnCls} onClick={() => aplicarResolucaoATodas('planilha')}>Usar planilha (todas)</button>
                  </div>
                </div>
                <div className="divide-y divide-[var(--fg)]/8 max-h-64 overflow-y-auto">
                  {previa.comConflito.map(c => (
                    <div key={c.linhaId} className="py-2 space-y-1">
                      {c.celulas.map((cel, i) => (
                        <p key={i} className="text-xs text-[var(--fg)]/70">{String(cel.de)} → {String(cel.para)}</p>
                      ))}
                      <div className="flex gap-3 text-xs">
                        <label className="flex items-center gap-1">
                          <input type="radio" name={`res-${c.linhaId}`} checked={(resolucoes[c.linhaId] ?? 'sistema') === 'sistema'}
                            onChange={() => setResolucoes(r => ({ ...r, [c.linhaId]: 'sistema' }))} className="accent-[var(--accent)]" />
                          Manter sistema
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="radio" name={`res-${c.linhaId}`} checked={resolucoes[c.linhaId] === 'planilha'}
                            onChange={() => setResolucoes(r => ({ ...r, [c.linhaId]: 'planilha' }))} className="accent-[var(--accent)]" />
                          Usar planilha
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={confirmar} disabled={processando}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {processando ? 'Aplicando…' : 'Aplicar reenvio'}
            </button>
          </>)}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Ligar em `GerenciarEstrutura.tsx`**

1. Acrescentar aos imports:
```ts
import ReenviarPlanilhaWizard from './ReenviarPlanilhaWizard'
```
2. Acrescentar à interface `Props`: `temColunaChave: boolean; clientes: ClienteMatch[]` (importar `type { ClienteMatch }` de `@/lib/tabelas/cliente-match`), e na desestruturação dos parâmetros do componente.
3. No cabeçalho do painel (logo depois do campo "Nome da tabela", antes da lista de colunas), acrescentar:
```tsx
<ReenviarPlanilhaWizard planilhaId={planilhaId} setor={setor} colunas={colunas} temColunaChave={temColunaChave} clientes={clientes} />
```
   (`colunas` aqui é o `ColunaResumo[]` já existente no componente — como `casarColunas` só usa `id`/`nome`/`tipo`/`opcoes`, e `ColunaResumo` não tem `opcoes`, ajuste `ColunaResumo` pra incluir `opcoes: OpcaoColuna[] | null` também, e o `Props` de `TabelaDetalhe` que já passa `colunas` — que já tem esse campo vindo do banco — continua funcionando sem mudança adicional.)

- [ ] **Step 4: Ligar em `TabelaDetalhe.tsx`**

1. Buscar `coluna_chave` junto com o resto dos dados da planilha: trocar `supabase.from('planilhas').select('id, nome, setor')` por `supabase.from('planilhas').select('id, nome, setor, coluna_chave')`.
2. Passar as duas novas props pro `<GerenciarEstrutura>`:
```tsx
<GerenciarEstrutura planilhaId={id} nome={planilha.nome} setor={setor} colunas={colunas}
  temColunaChave={planilha.coluna_chave !== null} clientes={clientes} />
```
   (`clientes` já é buscado no componente, mas hoje só quando `podeEditar && temColunaCliente` — troque a condição pra `(podeEditar || podeConfigurar) && temColunaCliente`, pra cobrir quem configura mas não edita linha.)

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx eslint components/tabelas app/*/tabelas && npm test`
Expected: sem erros de tipo/lint; todos os testes passam.

- [ ] **Step 6: Commit**

```bash
git add components/tabelas/ReenviarPlanilhaWizard.tsx components/tabelas/GerenciarEstrutura.tsx components/tabelas/TabelaDetalhe.tsx
git commit -m "feat(tabelas): wizard de reenvio e integração no painel de estrutura"
```

---

### Task 5: Verificação final e PR

**Files:** nenhum novo.

- [ ] **Step 1: Suíte completa**

Run: `npx tsc --noEmit && npm test && npx eslint components/tabelas lib/tabelas lib/tabelas-reenvio-actions.ts app/*/tabelas`
Expected: `tsc` limpo; todos os testes passam; lint sem erros nos arquivos novos.

- [ ] **Step 2: Conferir escopo do diff**

Run: `git diff --stat origin/feat/tabelas-fase2c-estrutura...HEAD`
Expected: só os arquivos desta fase (`supabase/migrations/051_...`, `supabase/tests/051_...`, `lib/tabelas/reenvio.ts`, `lib/tabelas-reenvio-actions.ts`, `components/tabelas/ReenviarPlanilhaWizard.tsx`, mudanças pontuais em `GerenciarEstrutura.tsx`/`TabelaDetalhe.tsx`, `tests/tabelas-reenvio.test.ts`, docs desta fase).

- [ ] **Step 3: Abrir o PR contra `dev`**

Corpo: resumo da Fase 3; **migration `051` pendente de aplicação manual no dev** (`supabase/migrations/051_planilhas_reenvio.sql`) **e o teste de fumaça `supabase/tests/051_reenvio_smoke.sql` para rodar logo depois** (deve terminar com "051 OK"); **este PR depende das Fases 2B/2C ainda não estarem em `dev`** — a base real deste PR é a branch da Fase 2C (`feat/tabelas-fase2c-estrutura`), então o PR só deve ser mergeado depois que 2B e 2C já estiverem em `dev` (senão o diff mostra tudo junto); se a base mudar nesse meio tempo, rebasear antes de pedir revisão. Roteiro de teste manual: tentar reenviar numa tabela sem coluna-chave (botão desabilitado); reenviar um arquivo com uma linha nova, uma linha que só preenche célula vazia (sem pedir confirmação), uma linha com célula que já tinha valor diferente (aparece em conflito), e uma linha do banco que não veio no arquivo (aparece como ausente, sem ação); marcar uma coluna não reconhecida pra criar e conferir que ela aparece na tabela depois; escolher "usar planilha" numa linha em conflito e conferir que sobrescreve; escolher "manter sistema" e conferir que preserva a célula em conflito mas ainda aplica os preenchimentos da mesma linha; enviar um arquivo com chave duplicada e conferir que bloqueia com mensagem clara.

- [ ] **Step 4: Avisar o usuário**

1) Aplicar `051_planilhas_reenvio.sql` no dev **e em seguida rodar** `supabase/tests/051_reenvio_smoke.sql` (deve mostrar "051 OK"; se falhar, mandar a mensagem do erro). 2) Testar conforme o roteiro. 3) Lembrar que este PR depende das Fases 2B/2C chegarem em `dev` primeiro — a promoção pra produção de 047-050 também segue pendente.
