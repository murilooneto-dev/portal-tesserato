import { test } from 'node:test'
import assert from 'node:assert/strict'
import { donoAtendeRegime, donosNoRegime, filtrarTiposDoProgresso } from '../lib/tarefa-tipo-visibilidade'

test('sem regime marcado o dono atende qualquer cliente', () => {
  assert.equal(donoAtendeRegime(undefined, 'Lucro Real'), true)
  assert.equal(donoAtendeRegime(null, null), true)
  assert.equal(donoAtendeRegime([], 'MEI'), true)
  assert.equal(donoAtendeRegime(['', '  '], 'MEI'), true)
})

test('regime marcado: atende só os clientes daquele regime', () => {
  assert.equal(donoAtendeRegime(['Simples Nacional', 'MEI'], 'MEI'), true)
  assert.equal(donoAtendeRegime(['Simples Nacional', 'MEI'], 'Lucro Real'), false)
})

test('caixa e espaços não importam', () => {
  assert.equal(donoAtendeRegime(['Simples Nacional'], ' simples nacional '), true)
})

test('cliente sem regime fica fora quando há regime marcado', () => {
  assert.equal(donoAtendeRegime(['MEI'], null), false)
  assert.equal(donoAtendeRegime(['MEI'], ''), false)
})

test('donosNoRegime tira do mapa o tipo cujo dono não atende o regime', () => {
  const donos = { DCTF: 'Bia', SPED: 'Caio', DAS: 'Bia' }
  const regimes = { DCTF: ['MEI'], DAS: ['MEI'] }
  assert.deepEqual(donosNoRegime(donos, regimes, 'Lucro Real'), { SPED: 'Caio' })
  assert.deepEqual(donosNoRegime(donos, regimes, 'MEI'), donos)
  assert.deepEqual(donosNoRegime(donos, {}, 'Lucro Real'), donos)
})

test('progresso: tipo volta a contar no cliente fora dos regimes do dono', () => {
  const donos = { DCTF: 'Bia' }
  const regimes = { DCTF: ['MEI'] }
  // Cliente da Ana, MEI: DCTF é da Bia, não conta.
  assert.deepEqual(filtrarTiposDoProgresso(['DCTF', 'DAS'], 'Ana', donosNoRegime(donos, regimes, 'MEI')), ['DAS'])
  // Cliente da Ana, Lucro Real: Bia não atende, DCTF conta para a Ana.
  assert.deepEqual(filtrarTiposDoProgresso(['DCTF', 'DAS'], 'Ana', donosNoRegime(donos, regimes, 'Lucro Real')), ['DCTF', 'DAS'])
})
