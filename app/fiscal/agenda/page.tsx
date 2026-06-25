'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface AgendaItem {
  id: string
  usuario_id: string
  titulo: string
  descricao?: string
  data_compromisso: string
  hora_compromisso?: string
  status: 'pendente' | 'concluido' | 'cancelado'
  lembrete_3_dias: boolean
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const STATUS_COR: Record<string, string> = { pendente: '#f59e0b', concluido: '#10b981', cancelado: '#6b7280' }
const STATUS_LABEL: Record<string, string> = { pendente: 'Pendente', concluido: 'Concluído', cancelado: 'Cancelado' }

const empty: AgendaItem = {
  id: '', usuario_id: '', titulo: '', descricao: '', data_compromisso: '',
  hora_compromisso: '', status: 'pendente', lembrete_3_dias: false,
}

export default function AgendaPage() {
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())
  const [itens, setItens] = useState<AgendaItem[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [diaSelecionado, setDiaSelecionado] = useState<number | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<AgendaItem>(empty)
  const [salvando, setSalvando] = useState(false)

  const supabase = createClient()

  const carregar = useCallback(async (uid: string) => {
    const { data } = await supabase.from('agenda').select('*').eq('usuario_id', uid).order('data_compromisso')
    setItens(data ?? [])
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); carregar(user.id) }
    })
  }, [carregar])

  // Calendar grid
  const primeiroDia = new Date(ano, mes, 1).getDay()
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const celulas = Array.from({ length: primeiroDia + diasNoMes }, (_, i) => i < primeiroDia ? null : i - primeiroDia + 1)

  const itensPorDia = (dia: number) => {
    const data = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    return itens.filter(i => i.data_compromisso === data)
  }

  // Lembretes: próximos 3 dias
  const lembretes = itens.filter(i => {
    if (!i.lembrete_3_dias) return false
    const d = new Date(i.data_compromisso + 'T00:00:00')
    const diff = Math.ceil((d.getTime() - hoje.setHours(0,0,0,0)) / 86400000)
    return diff >= 0 && diff <= 3
  })

  function abrirNovo(dia?: number) {
    const data = dia
      ? `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      : ''
    setEditando({ ...empty, data_compromisso: data })
    setModalAberto(true)
  }

  function abrirEditar(item: AgendaItem) {
    setEditando(item)
    setModalAberto(true)
  }

  async function salvar() {
    if (!userId || !editando.titulo || !editando.data_compromisso) return
    setSalvando(true)
    if (editando.id) {
      await supabase.from('agenda').update({ titulo: editando.titulo, descricao: editando.descricao, data_compromisso: editando.data_compromisso, hora_compromisso: editando.hora_compromisso, status: editando.status, lembrete_3_dias: editando.lembrete_3_dias }).eq('id', editando.id)
    } else {
      await supabase.from('agenda').insert({ usuario_id: userId, titulo: editando.titulo, descricao: editando.descricao, data_compromisso: editando.data_compromisso, hora_compromisso: editando.hora_compromisso, status: editando.status, lembrete_3_dias: editando.lembrete_3_dias })
    }
    await carregar(userId)
    setModalAberto(false)
    setSalvando(false)
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este compromisso?') || !userId) return
    await supabase.from('agenda').delete().eq('id', id)
    await carregar(userId)
    setDiaSelecionado(null)
  }

  const navMes = (dir: number) => {
    let nm = mes + dir; let na = ano
    if (nm < 0) { nm = 11; na-- } else if (nm > 11) { nm = 0; na++ }
    setMes(nm); setAno(na); setDiaSelecionado(null)
  }

  const itensDia = diaSelecionado ? itensPorDia(diaSelecionado) : []

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Agenda</h1>
        <p className="text-white/40 text-sm mt-1">Minha agenda pessoal</p>
      </div>

      {lembretes.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest mb-2">🔔 Lembretes — próximos 3 dias</p>
          <div className="flex flex-col gap-1">
            {lembretes.map(l => (
              <p key={l.id} className="text-sm text-white/80">{l.data_compromisso} {l.hora_compromisso && `às ${l.hora_compromisso}`} — {l.titulo}</p>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-8">
        {/* Calendar */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navMes(-1)} className="text-white/50 hover:text-white px-3 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-all">←</button>
            <h2 className="text-white font-semibold">{MESES[mes]} {ano}</h2>
            <div className="flex gap-2">
              <button onClick={() => navMes(1)} className="text-white/50 hover:text-white px-3 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-all">→</button>
              <button onClick={() => abrirNovo()} className="text-xs bg-[#00B8D4]/20 border border-[#00B8D4]/40 text-[#00B8D4] px-3 py-1 rounded-lg hover:bg-[#00B8D4]/30 transition-all">+ Novo</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-white/5 rounded-xl overflow-hidden">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="bg-[#0d1117] text-center text-xs text-white/30 py-2 font-medium">{d}</div>
            ))}
            {celulas.map((dia, i) => {
              const isHoje = dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear()
              const itsDia = dia ? itensPorDia(dia) : []
              return (
                <div
                  key={i}
                  onClick={() => dia && setDiaSelecionado(dia === diaSelecionado ? null : dia)}
                  className={`bg-[#0d1117] min-h-[60px] p-1.5 cursor-pointer transition-colors ${dia ? 'hover:bg-white/5' : ''} ${dia === diaSelecionado ? 'bg-white/5' : ''}`}
                >
                  {dia && (
                    <>
                      <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isHoje ? 'bg-[#00B8D4] text-white' : 'text-white/50'}`}>{dia}</span>
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {itsDia.map(it => (
                          <span key={it.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COR[it.status] }} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Day panel */}
        <div>
          {diaSelecionado ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">
                  {diaSelecionado} de {MESES[mes]}
                </h3>
                <button onClick={() => abrirNovo(diaSelecionado)} className="text-xs bg-[#00B8D4]/20 border border-[#00B8D4]/40 text-[#00B8D4] px-3 py-1 rounded-lg hover:bg-[#00B8D4]/30 transition-all">+ Novo</button>
              </div>
              {itensDia.length === 0 ? (
                <p className="text-white/30 text-sm">Nenhum compromisso neste dia.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {itensDia.map(it => (
                    <div key={it.id} className="p-3 rounded-xl bg-white/5 border border-white/8">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium">{it.titulo}</p>
                          {it.hora_compromisso && <p className="text-white/40 text-xs">{it.hora_compromisso}</p>}
                          {it.descricao && <p className="text-white/50 text-xs mt-1">{it.descricao}</p>}
                          <span className="text-xs mt-1 inline-block px-2 py-0.5 rounded-full" style={{ backgroundColor: STATUS_COR[it.status] + '30', color: STATUS_COR[it.status] }}>
                            {STATUS_LABEL[it.status]}
                          </span>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => abrirEditar(it)} className="text-white/30 hover:text-white/70 text-xs px-1.5 py-1 rounded border border-white/10 hover:border-white/20 transition-all">✏</button>
                          <button onClick={() => excluir(it.id)} className="text-white/30 hover:text-red-400 text-xs px-1.5 py-1 rounded border border-white/10 hover:border-red-400/30 transition-all">✕</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-white/20 text-sm text-center mt-8">
              Clique em um dia para ver os compromissos
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-semibold mb-5">{editando.id ? 'Editar Compromisso' : 'Novo Compromisso'}</h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Título *</label>
                <input value={editando.titulo} onChange={e => setEditando(p => ({ ...p, titulo: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Data *</label>
                  <input type="date" value={editando.data_compromisso} onChange={e => setEditando(p => ({ ...p, data_compromisso: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Horário</label>
                  <input type="time" value={editando.hora_compromisso ?? ''} onChange={e => setEditando(p => ({ ...p, hora_compromisso: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50" />
                </div>
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Descrição</label>
                <textarea value={editando.descricao ?? ''} onChange={e => setEditando(p => ({ ...p, descricao: e.target.value }))} rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50 resize-none" />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Status</label>
                <select value={editando.status} onChange={e => setEditando(p => ({ ...p, status: e.target.value as AgendaItem['status'] }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50">
                  <option value="pendente">Pendente</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editando.lembrete_3_dias} onChange={e => setEditando(p => ({ ...p, lembrete_3_dias: e.target.checked }))}
                  className="w-4 h-4 accent-[#00B8D4]" />
                <span className="text-sm text-white/70">Lembrete 3 dias antes</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModalAberto(false)} className="text-sm text-white/50 hover:text-white px-4 py-2 rounded-xl border border-white/10 hover:border-white/20 transition-all">Cancelar</button>
              <button onClick={salvar} disabled={salvando || !editando.titulo || !editando.data_compromisso}
                className="text-sm bg-[#00B8D4] text-white px-5 py-2 rounded-xl hover:bg-[#00a3bc] transition-all disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
