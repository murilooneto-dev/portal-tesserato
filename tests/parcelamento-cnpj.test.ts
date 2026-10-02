import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirCnpj } from '../lib/parcelamento-cnpj'

const clientes = [
  { nome: 'ACME', cnpj: '11.222.333/0001-44' },
  { nome: 'SEM CNPJ', cnpj: null },
  { nome: 'VAZIO', cnpj: '  ' },
]

test('cliente cadastrado: CNPJ segue o do cliente e nao e editavel', () => {
  const d = decidirCnpj({ avulsa: false, empresa: 'ACME', cnpjAtual: '99', clientes })
  assert.deepEqual(d, { valor: '11.222.333/0001-44', editavel: false, avisoSemCnpj: false })
})

test('cliente sem CNPJ: valor nulo, travado e com aviso', () => {
  for (const empresa of ['SEM CNPJ', 'VAZIO']) {
    const d = decidirCnpj({ avulsa: false, empresa, cnpjAtual: '99', clientes })
    assert.deepEqual(d, { valor: null, editavel: false, avisoSemCnpj: true })
  }
})

test('empresa avulsa: digita livre, sem aviso', () => {
  const d = decidirCnpj({ avulsa: true, empresa: 'ACME', cnpjAtual: '123', clientes })
  assert.deepEqual(d, { valor: '123', editavel: true, avisoSemCnpj: false })
})

test('nenhum cliente escolhido ou nome fora da lista: travado, sem aviso, mantem o valor', () => {
  assert.deepEqual(decidirCnpj({ avulsa: false, empresa: '', cnpjAtual: null, clientes }), { valor: null, editavel: false, avisoSemCnpj: false })
  assert.deepEqual(decidirCnpj({ avulsa: false, empresa: 'ANTIGA', cnpjAtual: '55', clientes }), { valor: '55', editavel: false, avisoSemCnpj: false })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

for (const arq of [
  'app/fiscal/parcelamentos/page.tsx',
  'components/fiscal/parcelamentos/ParcelamentoModal.tsx',
  'components/fiscal/GerenciarSecoesModal.tsx',
]) {
  test(`${arq}: sem fontes pequenas, [var(--fg)], cores fixas, fixed inset-0 nem alert/confirm`, () => {
    const src = ler(arq)
    assert.doesNotMatch(src, /text-\[(10|11)px\]/)
    assert.ok(!src.includes('[var(--fg)]'))
    assert.doesNotMatch(src, /(red|amber|green|yellow|blue)-\d00/)
    assert.doesNotMatch(src, /fixed inset-0/)
    assert.doesNotMatch(src, /(?<![\w.])(alert|confirm)\(/)
    assert.doesNotMatch(src, /(: any[^a-z]|as any[^a-z]|<any>)/)
  })
}

test('ParcelamentoModal: usa Modal, regra do CNPJ, regime em lista e o mesmo payload', () => {
  const src = ler('components/fiscal/parcelamentos/ParcelamentoModal.tsx')
  assert.match(src, /<Modal[\s\S]*bloqueado=\{saving\}/)
  assert.match(src, /decidirCnpj\(/)
  assert.match(src, /disabled=\{!cnpj\.editavel\}/)
  assert.match(src, /montarUpdateParcelamento\(formFinal, formFinal\.empresa_avulsa\)/)
  assert.match(src, /regimes\.map\(/)
  for (const s of ['Empresa', 'Parcelamento', 'Tarefa automática', 'Senhas']) assert.ok(src.includes(`>${s}</h3>`), s)
})

test('GerenciarSecoesModal: Modal, useConfirmar e criar seção na própria janela', () => {
  const src = ler('components/fiscal/GerenciarSecoesModal.tsx')
  assert.match(src, /<Modal/)
  assert.match(src, /useConfirmar\(\)/)
  assert.match(src, /criarSecaoParcelamento\(/)
})

test('page: as janelas vêm depois do ParcelamentosConteudo (empilham sobre o Drawer)', () => {
  const src = ler('app/fiscal/parcelamentos/page.tsx')
  const conteudo = src.indexOf('<ParcelamentosConteudo')
  assert.ok(conteudo > 0)
  assert.ok(src.indexOf('<ParcelamentoModal') > conteudo)
  assert.ok(src.indexOf('<GerenciarSecoesModal') > conteudo)
})
