# Fix: duplicação de tarefa ao desambiguar parcelamentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando a desambiguação de nomes de tarefa de parcelamento muda o `tipo` de uma tarefa já existente (porque um segundo parcelamento da mesma seção apareceu pro mesmo cliente), renomear a tarefa existente em vez de criar uma duplicata; limpar as duplicatas já existentes no banco de dev.

**Architecture:** Uma função pura nova (`separarRenomeacoesEInsercoes`) decide, dado o estado atual de `tarefas`, quais tarefas de parcelamento precisam ser renomeadas (UPDATE) e quais precisam ser criadas (upsert, como já era). `sincronizarTarefasParcelamento` passa a buscar as tarefas existentes antes de decidir. Um script standalone (`tsx`, mesmo padrão dos outros scripts administrativos do repo) limpa as duplicatas já criadas pelo bug, sem precisar recalcular nomes — só remove as linhas extras e deixa a próxima sincronização renomear a sobrevivente automaticamente.

**Tech Stack:** TypeScript, Supabase JS client, `node --test` + `tsx`.

## Global Constraints

- Criar múltiplos parcelamentos na mesma seção pro mesmo cliente continua permitido — decisão explícita do usuário. O fix não bloqueia isso, só garante que cada parcelamento tenha exatamente uma tarefa por mês.
- Renomear uma tarefa nunca deve mexer em `concluida`/`concluida_em` — só o campo `tipo`.
- O script de limpeza roda contra o banco de dev nesta tarefa, com confirmação explícita antes do `--apply`. Não roda contra produção — fica pronto pra rodar depois, quando o usuário decidir.
- Rodar `npm test` antes de cada commit que toque `lib/parcelamento-tarefas.ts`.

---

### Task 1: Renomear em vez de duplicar tarefa de parcelamento

**Files:**
- Modify: `lib/parcelamento-tarefas.ts`
- Test: `tests/parcelamento-tarefas.test.ts`

**Interfaces:**
- Consumes: `nomesTarefaParcelamentos` (já existe em `lib/parcelamento-tarefas.ts`, retorna `Map<string, string>` de `parcelamento.id` → nome calculado).
- Produces: `separarRenomeacoesEInsercoes(parcelamentoIds: string[], nomes: Map<string, string>, tarefasExistentes: { id: string; parcelamento_id: string; tipo: string }[]): { renomear: { tarefaId: string; novoTipo: string }[]; inserirIds: string[] }` — usado só dentro de `sincronizarTarefasParcelamento` nesta mesma task, nenhuma outra task depende dela.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `tests/parcelamento-tarefas.test.ts` (o import de `separarRenomeacoesEInsercoes` vai na linha 3, junto dos outros imports de `'../lib/parcelamento-tarefas'`):

```ts
import { separarRenomeacoesEInsercoes } from '../lib/parcelamento-tarefas'

test('separarRenomeacoesEInsercoes: sem tarefas existentes, tudo vai pra insercao', () => {
  const nomes = new Map([['p1', 'Parcelamentos (PGFN)'], ['p2', 'Parcelamentos (DETRAN)']])
  const resultado = separarRenomeacoesEInsercoes(['p1', 'p2'], nomes, [])
  assert.deepEqual(resultado.inserirIds, ['p1', 'p2'])
  assert.deepEqual(resultado.renomear, [])
})

test('separarRenomeacoesEInsercoes: tarefa existente com mesmo tipo calculado nao aparece em nenhuma lista', () => {
  const nomes = new Map([['p1', 'Parcelamentos (PGFN)']])
  const tarefasExistentes = [{ id: 't1', parcelamento_id: 'p1', tipo: 'Parcelamentos (PGFN)' }]
  const resultado = separarRenomeacoesEInsercoes(['p1'], nomes, tarefasExistentes)
  assert.deepEqual(resultado.inserirIds, [])
  assert.deepEqual(resultado.renomear, [])
})

test('separarRenomeacoesEInsercoes: tarefa existente com tipo diferente vai pra renomear', () => {
  const nomes = new Map([['p1', 'Parcelamentos (PGFN) (1)']])
  const tarefasExistentes = [{ id: 't1', parcelamento_id: 'p1', tipo: 'Parcelamentos (PGFN)' }]
  const resultado = separarRenomeacoesEInsercoes(['p1'], nomes, tarefasExistentes)
  assert.deepEqual(resultado.inserirIds, [])
  assert.deepEqual(resultado.renomear, [{ tarefaId: 't1', novoTipo: 'Parcelamentos (PGFN) (1)' }])
})

test('separarRenomeacoesEInsercoes: mistura de inserir, renomear e no-op', () => {
  const nomes = new Map([
    ['p1', 'Parcelamentos (PGFN) (1)'],  // vai renomear (tipo antigo diferente)
    ['p2', 'Parcelamentos (DETRAN)'],     // no-op (tipo ja bate)
    ['p3', 'Parcelamentos (ICMS)'],       // vai inserir (sem tarefa ainda)
  ])
  const tarefasExistentes = [
    { id: 't1', parcelamento_id: 'p1', tipo: 'Parcelamentos (PGFN)' },
    { id: 't2', parcelamento_id: 'p2', tipo: 'Parcelamentos (DETRAN)' },
  ]
  const resultado = separarRenomeacoesEInsercoes(['p1', 'p2', 'p3'], nomes, tarefasExistentes)
  assert.deepEqual(resultado.inserirIds, ['p3'])
  assert.deepEqual(resultado.renomear, [{ tarefaId: 't1', novoTipo: 'Parcelamentos (PGFN) (1)' }])
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run (a partir de `portal-tesserato/.worktrees/fix-duplicacao-tarefa-parcelamento`): `npm test -- --test-name-pattern="separarRenomeacoesEInsercoes"`
Expected: FAIL — `separarRenomeacoesEInsercoes is not a function` / erro de import, já que a função ainda não existe.

- [ ] **Step 3: Implementar a função mínima**

Em `lib/parcelamento-tarefas.ts`, adicionar logo depois da definição de `nomesTarefaParcelamentos` (antes de `gravarDataParcelamento`):

```ts
interface TarefaExistenteParcelamento {
  id: string
  parcelamento_id: string
  tipo: string
}

// Decide, pra cada parcelamento resolvido, se a tarefa dele precisa ser
// renomeada (ja existe uma linha em `tarefas` pro parcelamento_id neste
// mes/ano/setor, mas com um `tipo` diferente do calculado agora por
// nomesTarefaParcelamentos) ou inserida (ainda nao existe nenhuma linha).
// Sem isso, o upsert com ignoreDuplicates (mais abaixo) trata um `tipo`
// novo como uma tarefa nova em vez de renomear a existente, duplicando a
// tarefa toda vez que a desambiguacao muda o nome de um parcelamento ja
// sincronizado (bug confirmado no banco de dev 2026-08-19: duas linhas em
// `tarefas` com o mesmo parcelamento_id, uma com nome sem sufixo orfa).
export function separarRenomeacoesEInsercoes(
  parcelamentoIds: string[],
  nomes: Map<string, string>,
  tarefasExistentes: TarefaExistenteParcelamento[],
): { renomear: { tarefaId: string; novoTipo: string }[]; inserirIds: string[] } {
  const existentePorParcelamento = new Map(
    tarefasExistentes.map(t => [t.parcelamento_id, t]),
  )
  const renomear: { tarefaId: string; novoTipo: string }[] = []
  const inserirIds: string[] = []
  for (const id of parcelamentoIds) {
    const nomeAtual = nomes.get(id)
    if (!nomeAtual) continue
    const existente = existentePorParcelamento.get(id)
    if (!existente) {
      inserirIds.push(id)
    } else if (existente.tipo !== nomeAtual) {
      renomear.push({ tarefaId: existente.id, novoTipo: nomeAtual })
    }
  }
  return { renomear, inserirIds }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test -- --test-name-pattern="separarRenomeacoesEInsercoes"`
Expected: PASS nos 4 testes novos.

- [ ] **Step 5: Ligar a função em `sincronizarTarefasParcelamento`**

Em `lib/parcelamento-tarefas.ts`, a função `sincronizarTarefasParcelamento` hoje termina assim (linhas aproximadas 161-192):

```ts
  const nomes = nomesTarefaParcelamentos(resolvidos.map(({ parcelamento, clienteId }) => ({
    id: parcelamento.id,
    clienteId,
    secao: parcelamento.secao,
    localTipo: parcelamento.local_tipo,
  })))

  const novasTarefas = resolvidos.map(({ parcelamento, clienteId }) => {
    const valorMes = (parcelamento[coluna] as string | null) ?? null
    const concluida = !!valorMes
    const concluida_em = concluida ? ddMmParaIso(valorMes!, ano) : null
    return {
      cliente_id: clienteId,
      usuario_id: null,
      mes,
      ano,
      tipo: nomes.get(parcelamento.id)!,
      setor,
      concluida,
      concluida_em,
      parcelamento_id: parcelamento.id,
    }
  })

  const { supabase: admin } = await getAuthenticatedAdmin()
  if (!admin) return

  await admin.from('tarefas').upsert(novasTarefas, {
    onConflict: 'cliente_id,mes,ano,tipo,setor',
    ignoreDuplicates: true,
  })
}
```

Substituir esse trecho (do `const nomes = ...` até o fechamento da função) por:

```ts
  const nomes = nomesTarefaParcelamentos(resolvidos.map(({ parcelamento, clienteId }) => ({
    id: parcelamento.id,
    clienteId,
    secao: parcelamento.secao,
    localTipo: parcelamento.local_tipo,
  })))

  const { supabase: admin } = await getAuthenticatedAdmin()
  if (!admin) return

  const parcelamentoIds = resolvidos.map(({ parcelamento }) => parcelamento.id)
  const { data: tarefasExistentesRaw } = await admin
    .from('tarefas')
    .select('id, parcelamento_id, tipo')
    .in('parcelamento_id', parcelamentoIds)
    .eq('mes', mes)
    .eq('ano', ano)
    .eq('setor', setor)

  const tarefasExistentes = (tarefasExistentesRaw ?? []) as TarefaExistenteParcelamento[]
  const { renomear, inserirIds } = separarRenomeacoesEInsercoes(parcelamentoIds, nomes, tarefasExistentes)

  for (const { tarefaId, novoTipo } of renomear) {
    await admin.from('tarefas').update({ tipo: novoTipo }).eq('id', tarefaId)
  }

  if (inserirIds.length === 0) return

  const idsParaInserir = new Set(inserirIds)
  const novasTarefas = resolvidos
    .filter(({ parcelamento }) => idsParaInserir.has(parcelamento.id))
    .map(({ parcelamento, clienteId }) => {
      const valorMes = (parcelamento[coluna] as string | null) ?? null
      const concluida = !!valorMes
      const concluida_em = concluida ? ddMmParaIso(valorMes!, ano) : null
      return {
        cliente_id: clienteId,
        usuario_id: null,
        mes,
        ano,
        tipo: nomes.get(parcelamento.id)!,
        setor,
        concluida,
        concluida_em,
        parcelamento_id: parcelamento.id,
      }
    })

  await admin.from('tarefas').upsert(novasTarefas, {
    onConflict: 'cliente_id,mes,ano,tipo,setor',
    ignoreDuplicates: true,
  })
}
```

Note que `getAuthenticatedAdmin()` foi movido pra antes da busca de `tarefasExistentes` (precisa do client `admin` pra ler `tarefas` sem restrição de RLS, já que essa leitura é nova).

- [ ] **Step 6: Rodar a suite completa**

Run: `npm test`
Expected: PASS em todos os testes (os novos e os pré-existentes).

- [ ] **Step 7: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 8: Commit**

```bash
git add lib/parcelamento-tarefas.ts tests/parcelamento-tarefas.test.ts
git commit -m "fix: renomeia tarefa de parcelamento em vez de duplicar ao desambiguar"
```

---

### Task 2: Script de limpeza das duplicatas já existentes

**Files:**
- Create: `scripts/limpar-duplicatas-parcelamento.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (script standalone, conecta direto no Supabase via `@supabase/supabase-js`, mesmo padrão de `scripts/normalizar-tarefas.ts` e `scripts/normalizar-responsaveis-parcelamentos.ts` já existentes no repo).
- Produces: nada consumido por outra task — última task do plano.

- [ ] **Step 1: Criar o script**

Criar `scripts/limpar-duplicatas-parcelamento.ts` com o seguinte conteúdo completo:

```ts
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface TarefaRow {
  id: string
  parcelamento_id: string
  mes: number
  ano: number
  setor: string
  tipo: string
  concluida: boolean
}

async function main() {
  const apply = process.argv.includes('--apply')

  const { data, error } = await supabase
    .from('tarefas')
    .select('id, parcelamento_id, mes, ano, setor, tipo, concluida')
    .not('parcelamento_id', 'is', null)

  if (error) { console.error(error.message); process.exit(1) }

  const tarefas = (data ?? []) as TarefaRow[]
  console.log(`\n${tarefas.length} tarefas com parcelamento_id carregadas\n`)

  const grupos = new Map<string, TarefaRow[]>()
  for (const t of tarefas) {
    const chave = `${t.parcelamento_id}|${t.mes}|${t.ano}|${t.setor}`
    const grupo = grupos.get(chave) ?? []
    grupo.push(t)
    grupos.set(chave, grupo)
  }

  const duplicados = Array.from(grupos.values()).filter(g => g.length > 1)
  console.log(`${duplicados.length} grupo(s) duplicado(s) encontrado(s)\n`)

  let totalApagadas = 0

  for (const grupo of duplicados) {
    const ordenado = [...grupo].sort((a, b) => a.id.localeCompare(b.id))
    // Sobrevivente: prioriza a que ja esta concluida (nunca perde progresso
    // ja marcado); empate ou nenhuma concluida, fica a de menor id.
    const sobrevivente = ordenado.find(t => t.concluida) ?? ordenado[0]
    const restante = ordenado.filter(t => t.id !== sobrevivente.id)

    console.log(`Grupo parcelamento_id=${sobrevivente.parcelamento_id} mes=${sobrevivente.mes}/${sobrevivente.ano} setor=${sobrevivente.setor}:`)
    console.log(`  sobrevive: ${sobrevivente.id} ("${sobrevivente.tipo}", concluida=${sobrevivente.concluida})`)
    for (const t of restante) {
      console.log(`  apaga:     ${t.id} ("${t.tipo}", concluida=${t.concluida})`)
    }

    if (apply) {
      const idsParaApagar = restante.map(t => t.id)
      const { error: delErr } = await supabase.from('tarefas').delete().in('id', idsParaApagar)
      if (delErr) {
        console.error(`  ERRO ao apagar: ${delErr.message}`)
      } else {
        totalApagadas += idsParaApagar.length
      }
    }
  }

  console.log(`\n${apply ? 'Aplicado' : 'Dry-run (nada foi alterado)'}: ${duplicados.length} grupo(s), ${totalApagadas} tarefa(s) apagada(s).`)
  if (!apply && duplicados.length > 0) {
    console.log('\nRode de novo com --apply pra aplicar de verdade.')
  }
  if (apply && duplicados.length > 0) {
    console.log('\nO nome da sobrevivente pode continuar com o nome antigo ate a proxima\nsincronizacao automatica (abra o Dashboard Fiscal/Pessoal do mes em\nquestao uma vez, com o fix ja aplicado, pra renomear).')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Rodar em dry-run contra o banco de dev**

Run (a partir de `portal-tesserato/.worktrees/fix-duplicacao-tarefa-parcelamento`, precisa de um `.env.local` com `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` apontando pro projeto de dev — mesmas credenciais de `.env.development.local`, copiadas ou symlinkadas se `.env.local` não existir no worktree):

```bash
npx tsx scripts/limpar-duplicatas-parcelamento.ts
```

Expected: imprime pelo menos 1 grupo duplicado (o caso confirmado: `parcelamento_id=fc2d11ac-668e-4824-88e1-ea94e7cc1003`, mes=8, ano=2026, setor=fiscal — tarefas "Parcelamentos (PGFN - ECAC)" e "Parcelamentos (PGFN - ECAC) (2)"), e termina com "Dry-run (nada foi alterado)".

- [ ] **Step 3: Aguardar confirmação explícita do usuário, depois aplicar**

Mostrar a saída do dry-run pro usuário. Só depois de confirmação explícita, rodar:

```bash
npx tsx scripts/limpar-duplicatas-parcelamento.ts --apply
```

Expected: imprime "Aplicado: N grupo(s), M tarefa(s) apagada(s)."

- [ ] **Step 4: Verificar no banco que a duplicata sumiu**

Consultar a tabela `tarefas` filtrando por `parcelamento_id=eq.fc2d11ac-668e-4824-88e1-ea94e7cc1003` (mesma query REST usada na investigação) e confirmar que sobrou só 1 linha pra esse grupo.

- [ ] **Step 5: Commit**

```bash
git add scripts/limpar-duplicatas-parcelamento.ts
git commit -m "chore: script de limpeza de tarefas duplicadas de parcelamento"
```
