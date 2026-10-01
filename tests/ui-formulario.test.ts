// tests/ui-formulario.test.ts — campos do Design System com rótulo ligado e erro acessível.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Field } from '../components/ui/Field'
import { Input, Select, Textarea, Checkbox, Switch } from '../components/ui/Input'

test('rótulo fica ligado ao campo pelo id', () => {
  const html = renderToStaticMarkup(
    h(Field, { rotulo: 'Razão social', children: (c: { id: string }) => h(Input, { id: c.id }) }),
  )
  const idLabel = html.match(/<label[^>]*for="([^"]+)"/)?.[1]
  const idInput = html.match(/<input[^>]*id="([^"]+)"/)?.[1]
  assert.ok(idLabel)
  assert.equal(idLabel, idInput)
})

test('erro aparece com role=alert e o campo aponta para ele', () => {
  const html = renderToStaticMarkup(
    h(Field, {
      rotulo: 'CNPJ',
      erro: 'CNPJ incompleto',
      children: (c: { id: string; describedBy?: string; invalido: boolean }) =>
        h(Input, { id: c.id, 'aria-describedby': c.describedBy, invalido: c.invalido }),
    }),
  )
  assert.match(html, /role="alert"[^>]*>CNPJ incompleto</)
  const idErro = html.match(/id="([^"]+)"[^>]*role="alert"|role="alert"[^>]*id="([^"]+)"/)
  assert.ok(idErro)
  assert.match(html, /aria-invalid="true"/)
  assert.match(html, /aria-describedby="[^"]*-erro/)
})

test('campo obrigatório mostra o asterisco escondido do leitor de tela', () => {
  const html = renderToStaticMarkup(
    h(Field, { rotulo: 'Nome', obrigatorio: true, children: (c: { id: string }) => h(Input, { id: c.id }) }),
  )
  assert.match(html, /aria-hidden="true"[^>]*>\*</)
})

test('input usa as cores do Design System e placeholder legível', () => {
  const html = renderToStaticMarkup(h(Input, { placeholder: 'dd/mm/aaaa' }))
  assert.match(html, /bg-inset/)
  assert.match(html, /placeholder:text-ph/)
})

test('select e textarea marcam inválido', () => {
  assert.match(renderToStaticMarkup(h(Select, { invalido: true }, h('option', null, 'Todos'))), /aria-invalid="true"/)
  assert.match(renderToStaticMarkup(h(Textarea, { invalido: true })), /aria-invalid="true"/)
})

test('checkbox tem rótulo clicável', () => {
  const html = renderToStaticMarkup(h(Checkbox, { rotulo: 'Sem movimento', defaultChecked: true }))
  assert.match(html, /<label[^>]*>.*type="checkbox".*Sem movimento.*<\/label>/s)
})

test('switch expõe o estado para leitor de tela', () => {
  const html = renderToStaticMarkup(h(Switch, { ligado: true, onMudar: () => {}, rotulo: 'Mostrar desabilitados' }))
  assert.match(html, /role="switch"/)
  assert.match(html, /aria-checked="true"/)
  assert.match(html, /Mostrar desabilitados/)
})
