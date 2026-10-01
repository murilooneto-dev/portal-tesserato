// tests/design-fonte.test.ts — a fonte do Design System (IBM Plex) é carregada no layout raiz.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const LAYOUT = readFileSync(join(__dirname, '..', 'app', 'layout.tsx'), 'utf8')

test('layout carrega IBM Plex Sans e Mono pelo next/font', () => {
  assert.match(LAYOUT, /from ["']next\/font\/google["']/)
  assert.match(LAYOUT, /IBM_Plex_Sans\(/)
  assert.match(LAYOUT, /IBM_Plex_Mono\(/)
  assert.match(LAYOUT, /variable:\s*["']--font-plex-sans["']/)
  assert.match(LAYOUT, /variable:\s*["']--font-plex-mono["']/)
})

test('as variáveis da fonte vão para o <html>', () => {
  assert.match(LAYOUT, /<html[^>]*className=\{`\$\{plexSans\.variable\} \$\{plexMono\.variable\}`\}/)
})
