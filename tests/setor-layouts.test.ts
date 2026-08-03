// tests/setor-layouts.test.ts
//
// Guarda de regressão específica pro achado crítico das revisões
// anteriores: `getPortalContext` só é seguro contra bypass de setor porque
// cada layout de setor passa seu próprio setor como literal de string
// hard-coded (nada vindo de header, cookie ou qualquer dado de
// requisição). Este teste falha se algum layout voltar a chamar
// `getPortalContext()` sem argumento, ou passar algo que não seja o
// literal esperado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')

const LAYOUTS_POR_SETOR: Record<string, string> = {
  fiscal: 'app/fiscal/layout.tsx',
  contabil: 'app/contabil/layout.tsx',
  pessoal: 'app/pessoal/layout.tsx',
  societario: 'app/societario/layout.tsx',
  financeiro: 'app/financeiro/layout.tsx',
}

for (const [setor, caminho] of Object.entries(LAYOUTS_POR_SETOR)) {
  test(`${caminho} chama getPortalContext('${setor}') com literal estático`, () => {
    const fonte = readFileSync(join(ROOT, caminho), 'utf8')
    const regex = /getPortalContext\(\s*(['"`])([a-z]+)\1\s*\)/
    const match = fonte.match(regex)

    assert.ok(match, `${caminho} deveria chamar getPortalContext com um literal de string`)
    assert.equal(match![2], setor, `${caminho} deveria passar o setor '${setor}', não deveria vir de header/variável`)
  })
}

test('layout de rotas comuns (sem setor) continua chamando getPortalContext sem argumento', () => {
  const fonte = readFileSync(join(ROOT, 'app/(comum)/layout.tsx'), 'utf8')
  assert.match(fonte, /getPortalContext\(\)/)
})
