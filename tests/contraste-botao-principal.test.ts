// tests/contraste-botao-principal.test.ts
//
// Texto claro sobre o ciano (bg-[var(--accent)] + text-[var(--fg)]) tem contraste
// 1,94:1 no tema escuro. O botão principal usa --accent-ink (#04202B).
// Este teste falha se algum className voltar a juntar os dois.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return arquivos(p)
    return p.endsWith('.tsx') ? [p] : []
  })
}

test('nenhum botão com fundo ciano usa texto claro', () => {
  const ruins: string[] = []
  for (const f of [...arquivos(join(ROOT, 'app')), ...arquivos(join(ROOT, 'components'))]) {
    const linhas = readFileSync(f, 'utf8').split('\n')
    linhas.forEach((l, i) => {
      if (/bg-\[var\(--accent\)\](?![\/\w-])/.test(l) && /text-\[var\(--fg\)\](?![\/\w-])/.test(l)) {
        ruins.push(`${f.replace(ROOT, '')}:${i + 1}`)
      }
    })
  }
  assert.deepEqual(ruins, [], `texto claro sobre ciano em:\n${ruins.join('\n')}`)
})

test('texto escuro do ciano não vaza para trechos sem fundo ciano', () => {
  const ruins: string[] = []
  for (const f of [...arquivos(join(ROOT, 'app')), ...arquivos(join(ROOT, 'components'))]) {
    readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      for (const trecho of l.match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? []) {
        if (trecho.includes('text-[var(--accent-ink)]') && !/bg-\[var\(--accent\)\](?![\/\w-])/.test(trecho)) {
          ruins.push(`${f.replace(ROOT, '')}:${i + 1}`)
        }
      }
    })
  }
  assert.deepEqual(ruins, [], `texto escuro fora de fundo ciano em:\n${ruins.join('\n')}`)
})
