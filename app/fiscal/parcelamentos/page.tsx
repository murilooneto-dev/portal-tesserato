'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const ANO = new Date().getFullYear()

const SECOES = [
  'RECEITA FEDERAL - ECAC',
  'PGFN - ECAC',
  'SEFAZ - PARCELAMENTO MULTA AUTONOMA',
  'SEFAZ - PARCELAMENTOS',
  'FGTS DIGITAL',
]

const MESES_ABREV = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']
const MESES_COLS  = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const MESES_NOME  = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO']

interface Parcelamento {
  id: string
  secao: string
  empresa: string
  cnpj: string | null
  regime: string | null
  responsavel: string | null
  local_tipo: string | null
  tarefa: string | null
  senhas: string | null
  jan: string | null; fev: string | null; mar: string | null; abr: string | null
  mai: string | null; jun: string | null; jul: string | null; ago: string | null
  set: string | null; out: string | null; nov: string | null; dez: string | null
}

const EMPTY_FORM: Omit<Parcelamento, 'id'> = {
  secao: SECOES[0], empresa: '', cnpj: '', regime: '', responsavel: '',
  local_tipo: '', tarefa: '', senhas: '',
  jan: null, fev: null, mar: null, abr: null, mai: null, jun: null,
  jul: null, ago: null, set: null, out: null, nov: null, dez: null,
}

// Cores por responsável
const CORES_CACHE: Record<string, string> = {}
const PALETA = ['#0ea5e9','#10b981','#f59e0b','#ec4899','#8b5cf6','#f97316','#14b8a6','#6366f1']
function corResp(nome: string): string {
  if (!CORES_CACHE[nome]) CORES_CACHE[nome] = PALETA[Object.keys(CORES_CACHE).length % PALETA.length]
  return CORES_CACHE[nome]
}

function badgeColor(val: string | null): { bg: string; text: string; label: string } {
  if (!val) return { bg: '', text: '', label: '' }
  const v = val.toLowerCase()
  if (v.includes('liquidado'))  return { bg: 'bg-green-500/20',  text: 'text-green-300',  label: 'LIQUIDADO' }
  if (v.includes('cancelado'))  return { bg: 'bg-red-500/20',    text: 'text-red-300',    label: 'CANCELADO' }
  if (v.includes('comunicado')) return { bg: 'bg-amber-500/20',  text: 'text-amber-300',  label: 'COMUNICADO' }
  return { bg: 'bg-blue-500/20', text: 'text-blue-300', label: 'ENVIADO' }
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
const labelCls = "block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5"

export default function ParcelamentosPage() {
  const [items, setItems] = useState<Parcelamento[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [secaoFiltro, setSecaoFiltro] = useState('TODOS')
  const [respFiltro, setRespFiltro] = useState('TODOS')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<Parcelamento | null>(null)
  const [form, setForm] = useState<Omit<Parcelamento, 'id'>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userNome, setUserNome] = useState<string | null>(null)

  const sb = createClient()

  async function load(admin: boolean, nome: string | null) {
    setLoading(true)
    let q = sb.from('parcelamentos').select('*').order('empresa')
    if (!admin && nome) q = (q as any).ilike('responsavel', nome)
    const { data } = await q
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) return
      sb.from('profiles').select('nome,role').eq('id', data.user.id).single().then(({ data: p }) => {
        const admin = p?.role === 'admin'
        const nome = p?.nome ?? null
        setIsAdmin(admin)
        setUserNome(nome)
        load(admin, nome)
      })
    })
  }, [])

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  function openCreate() { setEditItem(null); setForm(EMPTY_FORM); setModalOpen(true) }
  function openEdit(item: Parcelamento) {
    setEditItem(item)
    const { id, ...rest } = item
    setForm(rest)
    setModalOpen(true)
  }

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Excluir parcelamento de "${nome}"?`)) return
    await sb.from('parcelamentos').delete().eq('id', id)
    setItems(prev => prev.filter(p => p.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  async function handleSave() {
    setSaving(true)
    if (editItem) {
      await sb.from('parcelamentos').update(form).eq('id', editItem.id)
    } else {
      await sb.from('parcelamentos').insert(form)
    }
    await load(isAdmin, userNome)
    setModalOpen(false)
    setSaving(false)
  }

  function setF<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  const responsaveis = Array.from(new Set(items.map(p => p.responsavel).filter(Boolean) as string[])).sort()

  const filtered = items.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !search || p.empresa.toLowerCase().includes(q) ||
      (p.cnpj ?? '').includes(q) || (p.responsavel ?? '').toLowerCase().includes(q)
    const matchSecao = secaoFiltro === 'TODOS' || p.secao === secaoFiltro
    const matchResp  = respFiltro  === 'TODOS' || p.responsavel === respFiltro
    return matchSearch && matchSecao && matchResp
  })

  const secoesMostrar = secaoFiltro === 'TODOS' ? SECOES : [secaoFiltro]

  function imprimir() {
    const agora = new Date().toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })
    const filtroDesc = [
      secaoFiltro !== 'TODOS' ? `Seção: ${secaoFiltro}` : null,
      respFiltro  !== 'TODOS' ? `Responsável: ${respFiltro}` : null,
      search ? `Busca: "${search}"` : null,
    ].filter(Boolean).join(' · ') || 'Todos os registros'

    const secRows = (secaoFiltro === 'TODOS' ? SECOES : [secaoFiltro]).map(secao => {
      const rows = filtered.filter(p => p.secao === secao)
      if (!rows.length) return ''
      const trs = rows.map((p, i) => `
        <tr class="${i % 2 === 0 ? 'even' : ''}">
          <td>${p.empresa}</td>
          <td>${p.cnpj ?? '—'}</td>
          <td>${p.regime ?? '—'}</td>
          <td>${p.responsavel ?? '—'}</td>
          <td>${p.local_tipo ?? '—'}</td>
          ${MESES_COLS.map(m => {
            const v = (p as any)[m] as string | null
            return `<td class="month ${v ? 'filled' : ''}">${v ?? '—'}</td>`
          }).join('')}
        </tr>`).join('')
      return `
        <div class="section-title">${secao} <span class="count">${rows.length} parcelamento${rows.length !== 1 ? 's' : ''}</span></div>
        <table>
          <thead><tr>
            <th>Empresa</th><th>CNPJ</th><th>Regime</th><th>Responsável</th><th>Local/Tipo</th>
            ${MESES_ABREV.map(m => `<th class="month">${m}</th>`).join('')}
          </tr></thead>
          <tbody>${trs}</tbody>
        </table>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8">
    <title>Parcelamentos ${ANO} — Tesserato Contabilidade</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 8px; color: #111; background: white; }
      .header { background: #0d1320; color: white; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
      .header-left h1 { font-size: 18px; font-weight: bold; letter-spacing: -0.5px; }
      .header-left .sub { font-size: 10px; color: rgba(255,255,255,0.55); margin-top: 2px; }
      .header-right { text-align: right; font-size: 9px; color: rgba(255,255,255,0.55); line-height: 1.6; }
      .header-right strong { color: white; }
      .meta { display: flex; gap: 20px; margin-bottom: 14px; }
      .meta-item { background: #f4f6f8; border-radius: 6px; padding: 6px 12px; }
      .meta-item .label { font-size: 7px; text-transform: uppercase; letter-spacing: 0.8px; color: #888; }
      .meta-item .value { font-size: 11px; font-weight: bold; color: #111; }
      .section-title { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.8px; color: #0d1320; border-left: 3px solid #00B8D4; padding-left: 8px; margin: 14px 0 6px; }
      .section-title .count { font-weight: normal; color: #888; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
      th { background: #0d1320; color: white; padding: 4px 6px; text-align: left; font-size: 7px; text-transform: uppercase; letter-spacing: 0.5px; }
      th.month { text-align: center; width: 40px; }
      td { padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: middle; }
      td.month { text-align: center; font-size: 7.5px; font-weight: bold; }
      td.month.filled { color: #1d4ed8; }
      tr.even td { background: #f9fafb; }
      tr:hover td { background: #f0f4ff; }
      footer { margin-top: 16px; text-align: center; color: #aaa; font-size: 7px; border-top: 1px solid #eee; padding-top: 6px; }
      @media print { button { display: none; } }
    </style></head><body>
    <div class="header">
      <div class="header-left">
        <h1>Relatório de Parcelamentos — ${ANO}</h1>
        <div class="sub">Tesserato Contabilidade · Setor Fiscal</div>
      </div>
      <div class="header-right">
        <div>Gerado em: <strong>${agora}</strong></div>
        <div>Filtros aplicados: <strong>${filtroDesc}</strong></div>
        <div>Total de registros: <strong>${filtered.length}</strong></div>
      </div>
    </div>
    <div class="meta">
      <div class="meta-item"><div class="label">Ano de referência</div><div class="value">${ANO}</div></div>
      <div class="meta-item"><div class="label">Total de parcelamentos</div><div class="value">${filtered.length}</div></div>
      <div class="meta-item"><div class="label">Seções</div><div class="value">${(secaoFiltro === 'TODOS' ? SECOES : [secaoFiltro]).filter(s => filtered.some(p => p.secao === s)).length}</div></div>
      ${respFiltro !== 'TODOS' ? `<div class="meta-item"><div class="label">Responsável</div><div class="value">${respFiltro}</div></div>` : ''}
    </div>
    ${secRows}
    <footer>Tesserato Contabilidade — Documento gerado automaticamente em ${agora}</footer>
    </body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-8 py-4 bg-[#0b1019] border-b border-white/8 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-white whitespace-nowrap">Parcelamentos {ANO}</h1>
        <input type="text" placeholder="Buscar empresa, CNPJ ou responsável..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25 text-sm focus:outline-none focus:border-[#00B8D4]/40" />
        <select value={secaoFiltro} onChange={e => setSecaoFiltro(e.target.value)}
          className="px-4 py-2 rounded-xl bg-[#0d1320] border border-white/10 text-white/70 text-sm focus:outline-none min-w-[180px]">
          <option value="TODOS">Todas as seções</option>
          {SECOES.map(s => <option key={s} value={s} className="bg-[#0d1320]">{s}</option>)}
        </select>
        {isAdmin && (
          <select value={respFiltro} onChange={e => setRespFiltro(e.target.value)}
            className="px-4 py-2 rounded-xl bg-[#0d1320] border border-white/10 text-white/70 text-sm focus:outline-none min-w-[150px]">
            <option value="TODOS">Todos os responsáveis</option>
            {responsaveis.map(r => <option key={r} value={r} className="bg-[#0d1320]">{r}</option>)}
          </select>
        )}
        <button onClick={imprimir}
          className="px-4 py-2 rounded-xl bg-white/8 border border-white/12 text-white/70 text-sm hover:bg-white/12 transition-colors whitespace-nowrap">
          Relatório
        </button>
        <button onClick={openCreate}
          className="px-4 py-2 rounded-xl bg-[#00B8D4] text-white text-sm font-semibold hover:bg-[#00a3bc] transition-colors whitespace-nowrap">
          + Novo Parcelamento
        </button>
      </div>

      <div className="p-8 space-y-6">
        {loading && <p className="text-white/30 text-sm">Carregando...</p>}

        {!loading && secoesMostrar.map(secao => {
          const rows = filtered.filter(p => p.secao === secao)
          if (rows.length === 0) return null
          return (
            <div key={secao}>
              {/* Seção header */}
              <div className="flex items-center gap-3 pl-4 border-l-4 border-[#00B8D4] mb-3">
                <div>
                  <p className="text-white font-bold text-sm">{secao}</p>
                  <p className="text-white/35 text-xs">{rows.length} parcelamento{rows.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Tabela */}
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/8 bg-white/2">
                        <th className="text-left px-4 py-3 text-white/40 font-semibold uppercase tracking-wider whitespace-nowrap">Empresa</th>
                        <th className="text-left px-3 py-3 text-white/40 font-semibold uppercase tracking-wider whitespace-nowrap">CNPJ</th>
                        <th className="text-left px-3 py-3 text-white/40 font-semibold uppercase tracking-wider">Regime</th>
                        <th className="text-left px-3 py-3 text-white/40 font-semibold uppercase tracking-wider">Responsável</th>
                        <th className="text-left px-3 py-3 text-white/40 font-semibold uppercase tracking-wider whitespace-nowrap">Local / Tipo</th>
                        {MESES_ABREV.map(m => (
                          <th key={m} className="text-center px-1.5 py-3 text-white/40 font-semibold uppercase tracking-wider w-[72px]">{m}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(item => {
                        const isExp = expandedId === item.id
                        const cor = item.responsavel ? corResp(item.responsavel) : '#6b7280'
                        return (
                          <React.Fragment key={item.id}>
                            <tr
                              onClick={() => toggleExpand(item.id)}
                              className={`border-b border-white/5 cursor-pointer transition-colors ${isExp ? 'bg-white/5' : 'hover:bg-white/2'}`}>
                              <td className="px-4 py-3 text-white font-semibold whitespace-nowrap">{item.empresa}</td>
                              <td className="px-3 py-3 text-white/45 font-mono whitespace-nowrap">{item.cnpj ?? '—'}</td>
                              <td className="px-3 py-3 text-white/50">{item.regime ?? '—'}</td>
                              <td className="px-3 py-3 font-semibold" style={{ color: cor }}>{item.responsavel ?? '—'}</td>
                              <td className="px-3 py-3 text-white/50 max-w-[140px] truncate">{item.local_tipo ?? '—'}</td>
                              {MESES_COLS.map(mes => {
                                const val = (item as any)[mes] as string | null
                                const { bg, text, label } = badgeColor(val)
                                return (
                                  <td key={mes} className="px-1.5 py-2 text-center">
                                    {val ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-white/70 text-[10px] font-mono leading-none">{val}</span>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${bg} ${text}`}>{label}</span>
                                      </div>
                                    ) : (
                                      <span className="text-white/15">—</span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>

                            {/* Linha expandida */}
                            {isExp && (
                              <tr key={`${item.id}-exp`} className="border-b border-white/8">
                                <td colSpan={17} className="px-4 py-3 bg-[#0b1019]">
                                  {/* Botões + Info numa linha */}
                                  <div className="flex items-center gap-6 mb-3">
                                    <button onClick={e => { e.stopPropagation(); openEdit(item) }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shrink-0">
                                      ✏ Editar
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); handleDelete(item.id, item.empresa) }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 text-white text-xs font-semibold transition-colors shrink-0">
                                      🗑 Excluir
                                    </button>
                                    <div className="h-4 w-px bg-white/10" />
                                    {[
                                      { label: 'Empresa', val: item.empresa },
                                      { label: 'CNPJ', val: item.cnpj ?? '—' },
                                      { label: 'Regime', val: item.regime ?? '—' },
                                      { label: 'Responsável', val: item.responsavel ?? '—', cor },
                                      { label: 'Local / Tipo', val: item.local_tipo ?? '—' },
                                    ].map(f => (
                                      <div key={f.label} className="min-w-0">
                                        <p className="text-white/30 text-[9px] uppercase tracking-wider">{f.label}</p>
                                        <p className="text-xs font-semibold truncate" style={f.cor ? { color: f.cor } : { color: 'white' }}>{f.val}</p>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Parcelas mensais — compactas */}
                                  <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest mb-2">Parcelas Mensais</p>
                                  <div className="grid grid-cols-12 gap-1.5">
                                    {MESES_COLS.map((mes, i) => {
                                      const val = (item as any)[mes] as string | null
                                      const { bg, text } = badgeColor(val)
                                      return (
                                        <div key={mes} className={`rounded-lg border px-2 py-1.5 ${val ? `${bg} border-transparent` : 'border-white/8 bg-white/2'}`}>
                                          <p className={`text-[9px] font-bold uppercase ${val ? text : 'text-white/20'}`}>{MESES_NOME[i]}</p>
                                          <p className={`text-sm font-bold mt-0.5 ${val ? 'text-white' : 'text-white/15'}`}>{val ?? '—'}</p>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        })}

        {!loading && filtered.length === 0 && (
          <p className="text-center text-white/20 text-sm py-16">Nenhum parcelamento encontrado.</p>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="bg-[#0d1320] border border-white/12 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
              <h2 className="text-white font-bold text-base">{editItem ? 'Editar Parcelamento' : 'Novo Parcelamento'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-white/30 hover:text-white text-xl">×</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* Seção */}
              <div>
                <label className={labelCls}>Seção</label>
                <select value={form.secao} onChange={e => setF('secao', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0d1320] border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50">
                  {SECOES.map(s => <option key={s} value={s} className="bg-[#0d1320]">{s}</option>)}
                </select>
              </div>

              {/* Empresa + CNPJ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Empresa</label>
                  <input className={inputCls} value={form.empresa} onChange={e => setF('empresa', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>CNPJ</label>
                  <input className={inputCls + ' font-mono'} value={form.cnpj ?? ''} onChange={e => setF('cnpj', e.target.value || null)} />
                </div>
              </div>

              {/* Regime + Responsável + Local/Tipo */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Regime</label>
                  <input className={inputCls} value={form.regime ?? ''} onChange={e => setF('regime', e.target.value || null)} />
                </div>
                <div>
                  <label className={labelCls}>Responsável</label>
                  <input className={inputCls} value={form.responsavel ?? ''} onChange={e => setF('responsavel', e.target.value || null)} />
                </div>
                <div>
                  <label className={labelCls}>Local / Tipo</label>
                  <input className={inputCls} value={form.local_tipo ?? ''} onChange={e => setF('local_tipo', e.target.value || null)} />
                </div>
              </div>

              {/* Tarefa */}
              <div>
                <label className={labelCls}>Tarefa</label>
                <input className={inputCls} value={form.tarefa ?? ''} onChange={e => setF('tarefa', e.target.value || null)} />
              </div>

              {/* Meses */}
              <div>
                <label className={labelCls}>Parcelas Mensais</label>
                <div className="grid grid-cols-6 gap-2">
                  {MESES_COLS.map((mes, i) => (
                    <div key={mes}>
                      <p className="text-white/30 text-[10px] text-center mb-1">{MESES_ABREV[i]}</p>
                      <input
                        value={(form as any)[mes] ?? ''}
                        onChange={e => setF(mes as any, e.target.value || null)}
                        placeholder="—"
                        className="w-full px-2 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs text-center focus:outline-none focus:border-[#00B8D4]/50" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Senhas */}
              <div>
                <label className={labelCls}>Senhas / Obs</label>
                <textarea value={form.senhas ?? ''} onChange={e => setF('senhas', e.target.value || null)}
                  rows={3} className={inputCls + ' resize-none'} />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/8 shrink-0">
              <button onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-white/12 text-white/50 hover:text-white text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving || !form.empresa.trim()}
                className="px-6 py-2.5 rounded-xl bg-[#00B8D4] text-white text-sm font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
