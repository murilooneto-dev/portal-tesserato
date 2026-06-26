'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Todos os tipos de tarefa padrão conhecidos (ASCII — nunca quebram)
const TIPOS_PADRAO = [
  'ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS',
  'ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS',
  'FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF','DAS',
]

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function estaBroken(s: string) {
  // Contém replacement char ou outros caracteres de controle inesperados
  return /[�￾￿]/.test(s)
}

interface ItemPersonalizada {
  tipo: 'personalizada'
  clienteId: string
  clienteNome: string
  arrayAtual: string[]
  indice: number
  valorQuebrado: string
  correcao: string | null
  correcaoManual: string
  selecionado: boolean
}

interface ItemTarefa {
  tipo: 'tarefa'
  tarefaIds: string[]    // todos os ids com esse tipo quebrado
  clienteNome: string
  clienteId: string
  valorQuebrado: string
  correcao: string | null
  correcaoManual: string
  selecionado: boolean
}

type Item = ItemPersonalizada | ItemTarefa

export default function CorrigirTarefasClient() {
  const [itens, setItens] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  useEffect(() => {
    const sb = createClient()

    Promise.all([
      sb.from('clientes').select('id,nome,tarefas_personalizadas').not('tarefas_personalizadas', 'is', null),
      sb.from('tarefas').select('id,cliente_id,tipo').order('tipo'),
      sb.from('clientes').select('nome').order('nome'), // só pra join de nomes
    ]).then(([{ data: clientes }, { data: tarefas }]) => {
      const clienteMap: Record<string, string> = {}
      for (const c of clientes ?? []) clienteMap[c.id] = c.nome

      // Coleta todos os valores "limpos" das tarefas_personalizadas de todos os clientes
      // para usar como base de correção de tipos personalizados
      const todosLimpos: string[] = [...TIPOS_PADRAO]
      for (const c of clientes ?? []) {
        for (const t of (c.tarefas_personalizadas ?? []) as string[]) {
          if (t && !estaBroken(t)) todosLimpos.push(t)
        }
      }
      const mapaCorretos = Object.fromEntries(todosLimpos.map(t => [norm(t), t]))

      const resultado: Item[] = []

      // 1. Quebrados em clientes.tarefas_personalizadas
      for (const c of clientes ?? []) {
        const arr = (c.tarefas_personalizadas ?? []) as string[]
        arr.forEach((val, idx) => {
          if (!val || !estaBroken(val)) return
          const correcao = mapaCorretos[norm(val)] ?? null
          resultado.push({
            tipo: 'personalizada',
            clienteId: c.id,
            clienteNome: c.nome,
            arrayAtual: arr,
            indice: idx,
            valorQuebrado: val,
            correcao,
            correcaoManual: correcao ?? '',
            selecionado: !!correcao,
          })
        })
      }

      // 2. Quebrados em tarefas.tipo — agrupa por clienteId + valorQuebrado
      const grupoBroken: Record<string, { ids: string[]; clienteId: string; val: string }> = {}
      for (const t of tarefas ?? []) {
        if (!t.tipo || !estaBroken(t.tipo)) continue
        const key = `${t.cliente_id}::${t.tipo}`
        if (!grupoBroken[key]) grupoBroken[key] = { ids: [], clienteId: t.cliente_id, val: t.tipo }
        grupoBroken[key].ids.push(t.id)
      }
      for (const { ids, clienteId, val } of Object.values(grupoBroken)) {
        const correcao = mapaCorretos[norm(val)] ?? null
        resultado.push({
          tipo: 'tarefa',
          tarefaIds: ids,
          clienteId,
          clienteNome: clienteMap[clienteId] ?? clienteId,
          valorQuebrado: val,
          correcao,
          correcaoManual: correcao ?? '',
          selecionado: !!correcao,
        })
      }

      setItens(resultado)
      setLoading(false)
    })
  }, [])

  function setCorrecaoManual(idx: number, val: string) {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, correcaoManual: val, selecionado: val.trim().length > 0 } : item))
  }

  function toggleSelecionado(idx: number) {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, selecionado: !item.selecionado } : item))
  }

  function toggleTodos(v: boolean) {
    setItens(prev => prev.map(item => ({ ...item, selecionado: v && item.correcaoManual.trim().length > 0 })))
  }

  const selecionados = itens.filter(i => i.selecionado && i.correcaoManual.trim())

  async function corrigir() {
    if (selecionados.length === 0) return
    setSalvando(true)
    const sb = createClient()

    // Para clientes.tarefas_personalizadas, agrupa por clienteId para fazer um único update por cliente
    const updateClientes: Record<string, string[]> = {}
    for (const item of selecionados) {
      if (item.tipo !== 'personalizada') continue
      if (!updateClientes[item.clienteId]) {
        updateClientes[item.clienteId] = [...(item as ItemPersonalizada).arrayAtual]
      }
      updateClientes[item.clienteId][(item as ItemPersonalizada).indice] = item.correcaoManual.trim()
    }

    // Para tarefas.tipo, atualiza cada grupo
    const updateTarefas = selecionados.filter(i => i.tipo === 'tarefa') as ItemTarefa[]

    await Promise.all([
      ...Object.entries(updateClientes).map(([id, arr]) =>
        sb.from('clientes').update({ tarefas_personalizadas: arr }).eq('id', id)
      ),
      ...updateTarefas.flatMap(item =>
        item.tarefaIds.map(tid =>
          sb.from('tarefas').update({ tipo: item.correcaoManual.trim() }).eq('id', tid)
        )
      ),
    ])

    setSalvando(false)
    setConcluido(true)
    setItens(prev => prev.filter(i => !i.selecionado))
  }

  if (loading) return <p className="text-white/30 text-sm">Verificando tarefas...</p>

  if (concluido && itens.length === 0)
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
        ✓ Todos os valores de tarefas foram corrigidos com sucesso.
      </div>
    )

  if (itens.length === 0)
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/40 text-sm">
        Nenhum valor de tarefa quebrado encontrado.
      </div>
    )

  const semSugestao = itens.filter(i => !i.correcao)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-sm">
          {itens.length} valor{itens.length > 1 ? 'es' : ''} quebrado{itens.length > 1 ? 's' : ''} detectado{itens.length > 1 ? 's' : ''}.
          {semSugestao.length > 0 && (
            <span className="text-amber-400 ml-2">{semSugestao.length} sem sugestão automática — preencha manualmente.</span>
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
              <th className="text-left text-xs font-semibold text-white/40 uppercase tracking-widest px-4 py-2.5">Origem</th>
              <th className="text-left text-xs font-semibold text-white/40 uppercase tracking-widest px-4 py-2.5">Empresa</th>
              <th className="text-left text-xs font-semibold text-white/40 uppercase tracking-widest px-4 py-2.5">Valor quebrado</th>
              <th className="text-left text-xs font-semibold text-white/40 uppercase tracking-widest px-4 py-2.5">Corrigir para</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item, idx) => (
              <tr key={idx}
                className={`border-b border-white/5 transition-colors ${item.selecionado ? 'bg-white/2' : 'opacity-40'}`}>
                <td className="px-4 py-2.5">
                  <input type="checkbox" checked={item.selecionado}
                    onChange={() => toggleSelecionado(idx)}
                    className="w-4 h-4 accent-[#00B8D4]" />
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    item.tipo === 'personalizada'
                      ? 'bg-purple-500/15 text-purple-400'
                      : 'bg-blue-500/15 text-blue-400'
                  }`}>
                    {item.tipo === 'personalizada' ? 'Template' : `${(item as ItemTarefa).tarefaIds.length}x Tarefa`}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-white font-medium text-xs">{item.clienteNome}</td>
                <td className="px-4 py-2.5 text-red-400 font-mono text-xs">{item.valorQuebrado}</td>
                <td className="px-4 py-2.5">
                  {item.correcao ? (
                    <span className="text-green-400 font-medium text-xs">{item.correcaoManual}</span>
                  ) : (
                    <input
                      value={item.correcaoManual}
                      onChange={e => setCorrecaoManual(idx, e.target.value)}
                      placeholder="Digite o valor correto..."
                      className="w-full px-2 py-1 rounded-lg bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#00B8D4]/50"
                    />
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
