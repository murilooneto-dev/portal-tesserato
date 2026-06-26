'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const ATIVIDADES = [
  'Serviço',
  'Comércio',
  'Indústria',
  'Serviço e Comércio',
  'Serviço e Indústria',
  'Comércio e Indústria',
  'Serviço, Comércio e Indústria',
]

// Normaliza para comparação: remove acentos via NFD, trata / e , como separadores,
// remove o "e" conjuntivo, ordena as palavras — "Serviço/Comércio" == "Serviço e Comércio"
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // é→e, ç→c, ã→a, etc.
    .toLowerCase()
    .replace(/[/,]/g, ' ')           // / e , viram espaço
    .replace(/[^a-z\s]/g, '')        // remove demais chars especiais
    .split(/\s+/)
    .filter(w => w && w !== 'e')     // remove conjunção
    .sort()
    .join(' ')
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

const MAPA_NORM = Object.fromEntries(ATIVIDADES.map(a => [norm(a), a]))

function melhorSugestao(valor: string): string | null {
  if (!valor || ATIVIDADES.includes(valor)) return null
  const n = norm(valor)

  // 1. Correspondência exata no mapa normalizado
  if (MAPA_NORM[n]) return MAPA_NORM[n]

  // 2. Fuzzy: menor distância de edição nas formas normalizadas
  let melhor: string | null = null
  let menorDist = Infinity
  for (const a of ATIVIDADES) {
    const d = levenshtein(n, norm(a))
    const limite = Math.max(n.length, norm(a).length) * 0.4
    if (d < menorDist && d <= limite) {
      menorDist = d
      melhor = a
    }
  }
  return melhor
}

interface Item {
  id: string
  nome: string
  atividade: string
  sugestao: string | null
  correcaoManual: string
  selecionado: boolean
}

export default function CorrigirAtividadesClient() {
  const [itens, setItens] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  useEffect(() => {
    const sb = createClient()
    sb.from('clientes').select('id,nome,atividade').not('atividade', 'is', null).order('nome')
      .then(({ data }) => {
        const fora = (data ?? [])
          .filter(c => c.atividade && !ATIVIDADES.includes(c.atividade))
          .map(c => {
            const sugestao = melhorSugestao(c.atividade)
            return {
              id: c.id,
              nome: c.nome,
              atividade: c.atividade,
              sugestao,
              correcaoManual: sugestao ?? '',
              selecionado: !!sugestao,
            }
          })
        setItens(fora)
        setLoading(false)
      })
  }, [])

  const selecionados = itens.filter(i => i.selecionado && i.correcaoManual.trim())

  async function corrigir() {
    if (selecionados.length === 0) return
    setSalvando(true)
    const sb = createClient()
    await Promise.all(
      selecionados.map(i =>
        sb.from('clientes').update({ atividade: i.correcaoManual.trim() }).eq('id', i.id)
      )
    )
    setSalvando(false)
    setConcluido(true)
    setItens(prev => prev.filter(i => !i.selecionado))
  }

  function setManual(id: string, val: string) {
    setItens(prev => prev.map(i => i.id === id
      ? { ...i, correcaoManual: val, selecionado: val.trim().length > 0 }
      : i))
  }

  function toggleTodos(v: boolean) {
    setItens(prev => prev.map(i => ({ ...i, selecionado: v && i.correcaoManual.trim().length > 0 })))
  }

  if (loading) return <p className="text-white/30 text-sm">Verificando valores...</p>

  if (concluido && itens.length === 0)
    return (
      <div className="px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
        ✓ Todos os valores foram corrigidos com sucesso.
      </div>
    )

  if (itens.length === 0)
    return (
      <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/40 text-sm">
        Nenhum valor de atividade fora do padrão encontrado.
      </div>
    )

  const semSugestao = itens.filter(i => !i.sugestao).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-sm">
          {itens.length} valor{itens.length !== 1 ? 'es' : ''} fora do padrão.
          {semSugestao > 0 && (
            <span className="text-amber-400 ml-2">{semSugestao} sem sugestão automática — preencha manualmente.</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => toggleTodos(true)} className="text-xs text-white/40 hover:text-white/70 transition-colors">Selecionar todos</button>
          <span className="text-white/20">·</span>
          <button onClick={() => toggleTodos(false)} className="text-xs text-white/40 hover:text-white/70 transition-colors">Desmarcar todos</button>
        </div>
      </div>

      <div className="rounded-xl border border-white/8 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8">
              <th className="w-10 px-4 py-2.5">
                <input type="checkbox"
                  checked={itens.length > 0 && itens.every(i => i.selecionado)}
                  onChange={e => toggleTodos(e.target.checked)}
                  className="w-4 h-4 accent-[#00B8D4]" />
              </th>
              <th className="text-left text-xs font-semibold text-white/40 uppercase tracking-widest px-4 py-2.5">Empresa</th>
              <th className="text-left text-xs font-semibold text-white/40 uppercase tracking-widest px-4 py-2.5">Valor atual</th>
              <th className="text-left text-xs font-semibold text-white/40 uppercase tracking-widest px-4 py-2.5">Corrigir para</th>
            </tr>
          </thead>
          <tbody>
            {itens.map(item => (
              <tr key={item.id}
                className={`border-b border-white/5 transition-colors cursor-pointer ${item.selecionado ? 'bg-white/2' : 'opacity-50'}`}
                onClick={() => setItens(prev => prev.map(i => i.id === item.id ? { ...i, selecionado: !i.selecionado && i.correcaoManual.trim().length > 0 } : i))}>
                <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={item.selecionado}
                    onChange={e => setItens(prev => prev.map(i => i.id === item.id ? { ...i, selecionado: e.target.checked } : i))}
                    className="w-4 h-4 accent-[#00B8D4]" />
                </td>
                <td className="px-4 py-2.5 text-white font-medium text-sm">{item.nome}</td>
                <td className="px-4 py-2.5 text-red-400 font-mono text-xs">{item.atividade}</td>
                <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                  {item.sugestao ? (
                    <span className="text-green-400 font-medium text-sm">{item.correcaoManual}</span>
                  ) : (
                    <select
                      value={item.correcaoManual}
                      onChange={e => setManual(item.id, e.target.value)}
                      className="w-full px-2 py-1 rounded-lg bg-[#0d1320] border border-white/15 text-white text-xs focus:outline-none focus:border-[#00B8D4]/50">
                      <option value="">Selecionar correção...</option>
                      {ATIVIDADES.map(a => <option key={a} value={a} className="bg-[#0d1320]">{a}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button onClick={corrigir} disabled={salvando || selecionados.length === 0}
          className="px-5 py-2.5 rounded-xl bg-[#00B8D4] text-white text-sm font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50">
          {salvando ? 'Corrigindo...' : `Corrigir ${selecionados.length} registro${selecionados.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
