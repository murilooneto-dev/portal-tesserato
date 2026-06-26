'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
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

const STATUS_COR: Record<string, string> = {
  pendente:  '#00B8D4',
  concluido: '#10b981',
  cancelado: '#6b7280',
}
const STATUS_COR_LEMBRETE = '#f59e0b'

const emptyItem = (): Omit<AgendaItem, 'id' | 'usuario_id'> => ({
  titulo: '', descricao: '', data_compromisso: '',
  hora_compromisso: '', status: 'pendente', lembrete_3_dias: false,
})

export default function AgendaPessoal() {
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())
  const [itens, setItens] = useState<AgendaItem[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  // Modal de dia selecionado
  const [diaSel, setDiaSel] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalForm, setModalForm] = useState(false)
  const [form, setForm] = useState(emptyItem())
  const [editId, setEditId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const sb = createClient()

  const carregar = useCallback(async (uid: string) => {
    const { data } = await sb.from('agenda').select('*').eq('usuario_id', uid).order('data_compromisso')
    setItens(data ?? [])
  }, [])

  useEffect(() => {
    sb.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); carregar(user.id) }
    })
  }, [carregar])

  const primeiroDia = new Date(ano, mes, 1).getDay()
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const celulas = Array.from({ length: primeiroDia + diasNoMes }, (_, i) =>
    i < primeiroDia ? null : i - primeiroDia + 1
  )
  // Preenche até múltiplo de 7
  while (celulas.length % 7 !== 0) celulas.push(null)

  const itensDia = (dia: number) => {
    const d = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    return itens.filter(i => i.data_compromisso === d)
  }

  function corDot(item: AgendaItem) {
    if (item.lembrete_3_dias) {
      const d = new Date(item.data_compromisso + 'T00:00:00')
      const diff = Math.ceil((d.getTime() - new Date().setHours(0,0,0,0)) / 86400000)
      if (diff >= 0 && diff <= 3) return STATUS_COR_LEMBRETE
    }
    return STATUS_COR[item.status]
  }

  function navMes(dir: number) {
    let nm = mes + dir, na = ano
    if (nm < 0) { nm = 11; na-- } else if (nm > 11) { nm = 0; na++ }
    setMes(nm); setAno(na); setDiaSel(null)
  }

  function abrirDia(dia: number) {
    setDiaSel(dia)
    setModalForm(false)
    setEditId(null)
    setExpandedId(null)
  }

  function abrirFormNovo(dia?: number) {
    const data = dia
      ? `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      : diaSel
        ? `${ano}-${String(mes + 1).padStart(2, '0')}-${String(diaSel).padStart(2, '0')}`
        : ''
    setForm({ ...emptyItem(), data_compromisso: data })
    setEditId(null)
    setModalForm(true)
  }

  function abrirFormEditar(item: AgendaItem) {
    setForm({
      titulo: item.titulo, descricao: item.descricao ?? '',
      data_compromisso: item.data_compromisso,
      hora_compromisso: item.hora_compromisso ?? '',
      status: item.status, lembrete_3_dias: item.lembrete_3_dias,
    })
    setEditId(item.id)
    setModalForm(true)
  }

  async function salvar() {
    if (!userId || !form.titulo || !form.data_compromisso) return
    setSalvando(true)
    if (editId) {
      await sb.from('agenda').update({ ...form }).eq('id', editId)
    } else {
      await sb.from('agenda').insert({ usuario_id: userId, ...form })
    }
    await carregar(userId)
    setModalForm(false)
    setSalvando(false)
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este compromisso?') || !userId) return
    await sb.from('agenda').delete().eq('id', id)
    await carregar(userId)
  }

  const itensDiaSel = diaSel ? itensDia(diaSel) : []
  const dataDiaSel = diaSel
    ? `${ano}-${String(mes + 1).padStart(2, '0')}-${String(diaSel).padStart(2, '0')}`
    : ''

  // Lembretes: compromissos pendentes nos próximos 3 dias (inclusive hoje)
  const hoje2 = new Date()
  hoje2.setHours(0, 0, 0, 0)
  const lembretes = itens.filter(it => {
    if (it.status !== 'pendente') return false
    const d = new Date(it.data_compromisso + 'T00:00:00')
    const diff = Math.ceil((d.getTime() - hoje2.getTime()) / 86400000)
    return diff >= 0 && diff <= 3
  }).sort((a, b) => a.data_compromisso.localeCompare(b.data_compromisso))

  function labelDia(dataStr: string) {
    const d = new Date(dataStr + 'T00:00:00')
    const diff = Math.ceil((d.getTime() - hoje2.getTime()) / 86400000)
    if (diff === 0) return 'Hoje'
    if (diff === 1) return 'Amanhã'
    return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2,'0')}`
  }

  return (
    <div>
      <h2 className="text-xs font-bold text-[#00B8D4] uppercase tracking-widest mb-5">Minha Agenda</h2>

      {/* Lembretes próximos 3 dias */}
      {lembretes.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/8 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-400 text-sm">🔔</span>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Lembretes — Próximos 3 dias</p>
          </div>
          <div className="flex flex-col gap-2">
            {lembretes.map(it => (
              <div key={it.id} className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2">
                <span className="w-2 h-2 rounded-full shrink-0 bg-amber-400" />
                <span className="text-white text-sm font-medium flex-1">{it.titulo}</span>
                {it.hora_compromisso && (
                  <span className="text-amber-400/80 text-xs font-mono">{it.hora_compromisso}</span>
                )}
                <span className="text-white/50 text-xs ml-2">{labelDia(it.data_compromisso)}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Pendente
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendário */}
      <div className="rounded-2xl border border-white/10 bg-white/2">
        {/* Cabeçalho navegação */}
        <div className="flex items-center justify-between px-6 py-4">
          <button onClick={() => navMes(-1)}
            className="w-8 h-8 rounded-lg bg-white/8 hover:bg-white/12 text-white/60 hover:text-white transition-all flex items-center justify-center text-sm font-bold">
            ‹
          </button>
          <span className="text-white font-bold text-lg">{MESES[mes]} {ano}</span>
          <button onClick={() => navMes(1)}
            className="w-8 h-8 rounded-lg bg-white/8 hover:bg-white/12 text-white/60 hover:text-white transition-all flex items-center justify-center text-sm font-bold">
            ›
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 border-t border-white/8">
          {/* Dias da semana */}
          {DIAS_SEMANA.map(d => (
            <div key={d} className="text-center text-xs font-semibold py-3 border-b border-white/8"
              style={{ color: d === 'Dom' || d === 'Sáb' ? '#ffffff50' : '#ffffff70' }}>
              {d}
            </div>
          ))}

          {/* Células */}
          {celulas.map((dia, i) => {
            const isHoje = dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear()
            const its = dia ? itensDia(dia) : []
            const isSel = dia === diaSel

            return (
              <div key={i}
                onClick={() => dia && abrirDia(dia)}
                className={`min-h-[72px] p-2 border-b border-r border-white/5 transition-colors ${
                  dia ? 'cursor-pointer hover:bg-white/4' : ''
                } ${isSel ? 'bg-white/6' : ''}`}
              >
                {dia && (
                  <>
                    <div className={`w-7 h-7 flex items-center justify-center rounded-full mx-auto text-sm font-medium mb-1 ${
                      isHoje ? 'bg-[#00B8D4] text-white font-bold' : 'text-white/50'
                    }`}>
                      {dia}
                    </div>
                    <div className="flex flex-wrap justify-center gap-1">
                      {its.map(it => (
                        <span key={it.id} className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: corDot(it) }} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

      </div>

      {/* Legenda */}
      <div className="flex items-center gap-6 mt-3 px-1 flex-wrap">
        {[
          { cor: STATUS_COR_LEMBRETE, label: 'Pendente (≤3 dias)' },
          { cor: STATUS_COR.concluido, label: 'Concluído' },
          { cor: STATUS_COR.pendente,  label: 'Pendente' },
          { cor: STATUS_COR.cancelado, label: 'Cancelado' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.cor }} />
            <span className="text-white/40 text-xs">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Modal — dia selecionado */}
      {diaSel && !modalForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setDiaSel(null)}>
          <div className="bg-[#0f1623] border border-white/12 rounded-2xl w-full max-w-xl shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <p className="text-white font-semibold">
                {diaSel} de {MESES[mes]} {ano}
              </p>
              <div className="flex gap-2">
                <button onClick={() => abrirFormNovo()}
                  className="text-xs bg-[#00B8D4]/20 border border-[#00B8D4]/40 text-[#00B8D4] px-3 py-1.5 rounded-lg hover:bg-[#00B8D4]/30 transition-all">
                  + Novo
                </button>
                <button onClick={() => setDiaSel(null)}
                  className="text-white/30 hover:text-white/70 text-lg px-1 transition-all">×</button>
              </div>
            </div>

            <div className="p-5 max-h-[32rem] overflow-y-auto">
              {itensDiaSel.length === 0 ? (
                <p className="text-white/25 text-sm text-center py-6">Nenhum compromisso neste dia.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {itensDiaSel.map(it => {
                    const aberto = expandedId === it.id
                    return (
                      <div key={it.id} className="rounded-xl bg-white/5 border border-white/8 transition-all"
                        style={{ borderColor: aberto ? corDot(it) + '60' : undefined }}>
                        <div className="p-3 flex items-start gap-3">
                          <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: corDot(it) }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium">{it.titulo}</p>
                            {it.hora_compromisso && <p className="text-white/40 text-xs">{it.hora_compromisso}</p>}
                            {!aberto && it.descricao && (
                              <p className="text-white/40 text-xs mt-0.5 line-clamp-2 leading-relaxed">{it.descricao}</p>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => abrirFormEditar(it)}
                              className="text-white/30 hover:text-white/70 text-xs px-1.5 py-1 rounded border border-white/10 transition-all">✏</button>
                            <button onClick={() => excluir(it.id)}
                              className="text-white/30 hover:text-red-400 text-xs px-1.5 py-1 rounded border border-white/10 transition-all">✕</button>
                          </div>
                        </div>
                        {aberto && (
                          <div className="px-3 pb-3 ml-8 overflow-hidden">
                            {it.descricao
                              ? <p className="text-white/70 text-xs whitespace-pre-wrap break-words leading-relaxed">{it.descricao}</p>
                              : <p className="text-white/25 text-xs italic">Sem descrição.</p>
                            }
                          </div>
                        )}
                        <button
                          onClick={() => setExpandedId(aberto ? null : it.id)}
                          className="w-full flex items-center justify-center gap-1 py-1.5 border-t border-white/8 text-white/40 hover:text-white/70 hover:bg-white/5 transition-all text-xs rounded-b-xl"
                        >
                          <ChevronDown size={11} className={`transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`} />
                          {aberto ? 'Fechar' : 'Ver descrição'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal — formulário */}
      {modalForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setModalForm(false)}>
          <div className="bg-[#0f1623] border border-white/12 rounded-2xl w-full max-w-xl shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <p className="text-white font-semibold">{editId ? 'Editar Compromisso' : 'Novo Compromisso'}</p>
              <button onClick={() => setModalForm(false)}
                className="text-white/30 hover:text-white/70 text-lg px-1 transition-all">×</button>
            </div>

            <div className="px-6 py-6 flex flex-col gap-5">
              <div>
                <label className="text-xs text-white/40 mb-1.5 block">Título *</label>
                <textarea value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                  rows={1} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50 resize-none leading-relaxed" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Data *</label>
                  <input type="date" value={form.data_compromisso}
                    onChange={e => setForm(p => ({ ...p, data_compromisso: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50" />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Horário</label>
                  <input type="time" value={form.hora_compromisso ?? ''}
                    onChange={e => setForm(p => ({ ...p, hora_compromisso: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50" />
                </div>
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1.5 block">Descrição</label>
                <textarea value={form.descricao ?? ''} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                  rows={8} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50 resize-none leading-relaxed" />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as AgendaItem['status'] }))}
                  className="w-full bg-[#0d1320] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50">
                  <option value="pendente">Pendente</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.lembrete_3_dias}
                  onChange={e => setForm(p => ({ ...p, lembrete_3_dias: e.target.checked }))}
                  className="w-4 h-4 accent-[#00B8D4]" />
                <span className="text-sm text-white/60">Lembrete 3 dias antes</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 px-6 py-5 border-t border-white/8">
              <button onClick={() => setModalForm(false)}
                className="text-sm text-white/40 hover:text-white px-4 py-2 rounded-xl border border-white/10 transition-all">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando || !form.titulo || !form.data_compromisso}
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
