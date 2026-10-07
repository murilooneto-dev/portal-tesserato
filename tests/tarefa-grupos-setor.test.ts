import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { organizarEmGrupos, erroTarefaEmOutroGrupo, nomeDeGrupoRepetido } from '../lib/tarefa-grupos-setor'
import type { GrupoSetor } from '../lib/types'

const t = (nome: string) => ({ nome })
const g = (id: string, nome: string, tarefas: string[]): GrupoSetor => ({ id, nome, tarefas })

test('tarefa de um grupo vai para dentro dele, na posição da primeira tarefa do grupo', () => {
  const itens = organizarEmGrupos([t('A'), t('B'), t('C'), t('D')], [g('1', 'Fechamento', ['B', 'D'])])
  assert.equal(itens.length, 3)
  assert.deepEqual(itens[0], { tipo: 'tarefa', tarefa: t('A') })
  assert.equal(itens[1].tipo, 'grupo')
  assert.deepEqual(itens[1].tipo === 'grupo' && itens[1].tarefas, [t('B'), t('D')])
  assert.deepEqual(itens[2], { tipo: 'tarefa', tarefa: t('C') })
})

test('cliente com só parte das tarefas do grupo vê o grupo só com elas', () => {
  const itens = organizarEmGrupos([t('B'), t('X')], [g('1', 'G', ['A', 'B', 'C'])])
  assert.equal(itens.length, 2)
  assert.deepEqual(itens[0].tipo === 'grupo' && itens[0].tarefas, [t('B')])
})

test('grupo sem nenhuma tarefa do cliente não aparece', () => {
  const itens = organizarEmGrupos([t('X'), t('Y')], [g('1', 'G', ['A', 'B'])])
  assert.deepEqual(itens, [{ tipo: 'tarefa', tarefa: t('X') }, { tipo: 'tarefa', tarefa: t('Y') }])
})

test('sem grupos, a ordem é a da entrada', () => {
  const entrada = [t('C'), t('A'), t('B')]
  assert.deepEqual(organizarEmGrupos(entrada, []), entrada.map(tarefa => ({ tipo: 'tarefa', tarefa })))
})

test('tarefa presente em dois grupos não duplica: vale o primeiro', () => {
  const itens = organizarEmGrupos([t('A')], [g('1', 'G1', ['A']), g('2', 'G2', ['A'])])
  assert.equal(itens.length, 1)
  assert.equal(itens[0].tipo === 'grupo' && itens[0].grupo.id, '1')
})

test('erroTarefaEmOutroGrupo nomeia a tarefa e o outro grupo', () => {
  const msg = erroTarefaEmOutroGrupo(['A', 'B'], [g('1', 'Fechamento', ['B'])])
  assert.ok(msg && msg.includes('"B"') && msg.includes('"Fechamento"'))
})

test('erroTarefaEmOutroGrupo ignora o próprio grupo na edição', () => {
  assert.equal(erroTarefaEmOutroGrupo(['B'], [g('1', 'Fechamento', ['B'])], '1'), null)
  assert.equal(erroTarefaEmOutroGrupo(['Z'], [g('1', 'Fechamento', ['B'])]), null)
})

test('nomeDeGrupoRepetido compara sem acento nem maiúsculas e ignora o próprio grupo', () => {
  const grupos = [g('1', 'Fechamento do mês', [])]
  assert.equal(nomeDeGrupoRepetido('  FECHAMENTO DO MES ', grupos), true)
  assert.equal(nomeDeGrupoRepetido('fechamento do mes', grupos, '1'), false)
  assert.equal(nomeDeGrupoRepetido('Outro', grupos), false)
})

test('a ficha do Societário não passa grupos ao checklist; a do Financeiro passa', () => {
  const soc = readFileSync('app/societario/clientes/[id]/page.tsx', 'utf8')
  const fin = readFileSync('app/financeiro/clientes/[id]/page.tsx', 'utf8')
  assert.equal(/grupos=/.test(soc), false)
  assert.match(fin, /grupos=\{grupos\}/)
})

test('as actions de escrita usam a mesma guarda das outras configurações do Financeiro', () => {
  const guarda = "podeAcessarPagina(callerProfile, 'configuracoes', 'financeiro')"
  const vizinha = readFileSync('lib/tarefa-tipo-vinculos-financeiro-actions.ts', 'utf8')
  const nova = readFileSync('lib/tarefa-grupos-setor-actions.ts', 'utf8')
  assert.ok(vizinha.includes(guarda))
  assert.ok(nova.includes(guarda))
  for (const nome of ['criarGrupoSetorFinanceiro', 'atualizarGrupoSetorFinanceiro', 'excluirGrupoSetorFinanceiro']) {
    const corpo = nova.slice(nova.indexOf(`export async function ${nome}`))
    assert.ok(corpo.slice(0, 200).includes('await exigirAdmin()'), `${nome} sem guarda`)
  }
})
