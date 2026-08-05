// tests/proxy-matcher.test.ts
//
// Trava de regressão para o achado crítico das revisões anteriores: o
// matcher do Proxy precisa continuar pulando exatamente (e só) as
// requisições de prefetch (`next-router-prefetch` / `purpose: prefetch`) —
// isso é o que resolve a race condition de refresh do Supabase que
// originou esta issue. Qualquer outro header, incluindo um `x-pathname`
// forjado pelo cliente, NÃO pode fazer o Proxy ser pulado; se fizesse,
// reabriria o bypass de autorização por setor que motivou duas rejeições
// de code review.
//
// A doc do Next 16 (`node_modules/next/dist/docs/.../proxy.md`) chama essa
// função de `unstable_doesProxyMatch`, mas o pacote instalado nesta versão
// só exporta `unstable_doesMiddlewareMatch` (ver AGENTS.md: a doc descreve
// uma API que ainda não bateu com o código desta versão) — usamos o nome
// que de fato existe em `node_modules`.
import './setup'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { config } from '../proxy'

test('proxy roda numa navegação real, sem headers de prefetch', () => {
  const matches = unstable_doesMiddlewareMatch({
    config,
    url: '/financeiro/dashboard',
    headers: { cookie: 'sb-session=valida' },
  })
  assert.equal(matches, true)
})

test('proxy é pulado quando o header purpose: prefetch está presente', () => {
  const matches = unstable_doesMiddlewareMatch({
    config,
    url: '/financeiro/dashboard',
    headers: { purpose: 'prefetch' },
  })
  assert.equal(matches, false)
})

test('proxy é pulado quando o header next-router-prefetch está presente', () => {
  const matches = unstable_doesMiddlewareMatch({
    config,
    url: '/financeiro/dashboard',
    headers: { 'next-router-prefetch': '1' },
  })
  assert.equal(matches, false)
})

test('um x-pathname forjado sozinho NÃO faz o proxy ser pulado (só os headers de prefetch fazem isso)', () => {
  const matches = unstable_doesMiddlewareMatch({
    config,
    url: '/financeiro/dashboard',
    headers: { 'x-pathname': '/fiscal/dashboard' },
  })
  assert.equal(matches, true)
})

test('_next/static continua fora do proxy independente de headers', () => {
  const matches = unstable_doesMiddlewareMatch({
    config,
    url: '/_next/static/chunk.js',
  })
  assert.equal(matches, false)
})
