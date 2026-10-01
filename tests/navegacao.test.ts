// tests/navegacao.test.ts — o que aparece no menu, por perfil.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarMenu, estaAtivo, setoresVisiveis, atalhosCelular, ITENS_GERAIS, type PerfilMenu } from '../lib/navegacao'

const admin: PerfilMenu = { role: 'admin', setores: ['fiscal'], paginas_acesso: [] }
const operadorFiscal: PerfilMenu = { role: 'operador', setores: ['fiscal'], paginas_acesso: [] }
const operadorClientes: PerfilMenu = { role: 'operador', setores: ['fiscal', 'contabil'], paginas_acesso: ['fiscal:clientes', 'fiscal:relatorios'] }

const rotulos = (grupos: ReturnType<typeof montarMenu>, id: string) => grupos.find(g => g.id === id)?.itens.map(i => i.rotulo)

test('grupo Geral fixo: Início, Cadastro de clientes, Ferramentas', () => {
  assert.deepEqual(ITENS_GERAIS.map(i => [i.rotulo, i.href]), [
    ['Início', '/intranet'], ['Cadastro de clientes', '/clientes'], ['Ferramentas', '/ferramentas'],
  ])
})

test('admin vê todas as páginas do setor e o grupo Administração', () => {
  const g = montarMenu(admin, 'fiscal')
  assert.deepEqual(g.map(x => x.id), ['geral', 'setor', 'admin'])
  assert.equal(g[1].titulo, 'Fiscal')
  assert.deepEqual(rotulos(g, 'setor'), ['Dashboard', 'Clientes', 'Calendário', 'Relatórios', 'Parcelamentos', 'Preenchimento rápido', 'Minhas tarefas', 'Tabelas'])
  assert.deepEqual(rotulos(g, 'admin'), ['Configurações', 'Vínculos de tarefas', 'Parâmetros', 'Lixeira'])
  assert.equal(g[1].itens[0].href, '/fiscal/dashboard')
})

test('operador de um setor sem páginas liberadas vê só o Dashboard e nada de Administração', () => {
  const g = montarMenu(operadorFiscal, 'fiscal')
  assert.deepEqual(g.map(x => x.id), ['geral', 'setor'])
  assert.deepEqual(rotulos(g, 'setor'), ['Dashboard'])
})

test('operador vê só as páginas liberadas, na ordem do menu', () => {
  assert.deepEqual(rotulos(montarMenu(operadorClientes, 'fiscal'), 'setor'), ['Dashboard', 'Clientes', 'Relatórios'])
})

test('setor sem nenhuma página liberada não aparece vazio', () => {
  const soc: PerfilMenu = { role: 'operador', setores: ['societario'], paginas_acesso: [] }
  assert.deepEqual(montarMenu(soc, 'societario').map(x => x.id), ['geral'])
})

test('setor Configurações aparece para quem tem o setor, com Configurações em Administração', () => {
  const cfg: PerfilMenu = { role: 'operador', setores: ['configuracoes'], paginas_acesso: ['configuracoes:fiscal'] }
  const g = montarMenu(cfg, 'configuracoes')
  assert.deepEqual(rotulos(g, 'setor'), ['Fiscal'])
  assert.equal(g.find(x => x.id === 'setor')!.itens[0].href, '/admin/configuracoes/fiscal')
  assert.deepEqual(rotulos(g, 'admin'), ['Configurações'])
})

test('página atual: igual ou subpágina, nunca prefixo parecido', () => {
  assert.equal(estaAtivo('/fiscal/tabelas/123', '/fiscal/tabelas'), true)
  assert.equal(estaAtivo('/fiscal/tabelas', '/fiscal/tabelas'), true)
  assert.equal(estaAtivo('/clientes-antigos', '/clientes'), false)
  assert.equal(estaAtivo('/fiscal/clientes', '/clientes'), false)
})

test('abas de setor: sem Configurações; admin vê todos os setores de trabalho', () => {
  assert.deepEqual(setoresVisiveis(admin), ['fiscal', 'contabil', 'pessoal', 'societario', 'financeiro'])
  assert.deepEqual(setoresVisiveis({ role: 'operador', setores: ['contabil', 'configuracoes'], paginas_acesso: [] }), ['contabil'])
})

test('atalhos do celular: Início e até duas páginas do setor', () => {
  assert.deepEqual(atalhosCelular(montarMenu(admin, 'fiscal')).map(i => i.rotulo), ['Início', 'Dashboard', 'Clientes'])
  assert.deepEqual(atalhosCelular(montarMenu(operadorFiscal, 'fiscal')).map(i => i.rotulo), ['Início', 'Dashboard'])
  assert.deepEqual(atalhosCelular(montarMenu({ role: 'operador', setores: ['societario'], paginas_acesso: [] }, 'societario')).map(i => i.rotulo), ['Início'])
})

test('setor do cookie que o usuário não tem não aparece no menu', () => {
  const g = montarMenu({ role: 'operador', setores: ['fiscal'], paginas_acesso: [] }, 'contabil')
  assert.deepEqual(g.map(x => x.id), ['geral'])
})

test('Configurações sem o setor não aparece como grupo do setor', () => {
  const g = montarMenu({ role: 'operador', setores: ['fiscal'], paginas_acesso: ['configuracoes:fiscal'] }, 'configuracoes')
  assert.deepEqual(g.map(x => x.id), ['geral'])
})

test('admin continua vendo o grupo de qualquer setor', () => {
  const g = montarMenu({ role: 'admin', setores: [], paginas_acesso: [] }, 'pessoal')
  assert.ok(g.some(x => x.id === 'setor' && x.titulo === 'Pessoal'))
})
