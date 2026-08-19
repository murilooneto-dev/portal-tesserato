'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMesAno } from '@/lib/mes-atual-context'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { StatusParcelamento } from '@/lib/parcelamentos-aviso'
import { criarSecaoParcelamento } from '@/lib/parcelamento-secoes-actions'
import { montarUpdateParcelamento } from '@/lib/parcelamento-tarefas'
import GerenciarSecoesModal from '@/components/fiscal/GerenciarSecoesModal'

interface SecaoParcelamento {
  id: string
  nome: string
}

const MESES_ABREV = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']
const MESES_COLS  = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const MESES_NOME  = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO']

interface Parcelamento {
  id: string
  secao: string
  empresa: string
  empresa_avulsa: boolean
  cnpj: string | null
  regime: string | null
  responsavel: string | null
  local_tipo: string | null
  status: StatusParcelamento
  setores: string[]
  tarefa: string | null
  senhas: string | null
  jan: string | null; fev: string | null; mar: string | null; abr: string | null
  mai: string | null; jun: string | null; jul: string | null; ago: string | null
  set: string | null; out: string | null; nov: string | null; dez: string | null
}

const SETORES_PARCELAMENTO: { valor: string; label: string }[] = [
  { valor: 'fiscal', label: 'Fiscal' },
  { valor: 'contabil', label: 'Contábil' },
  { valor: 'pessoal', label: 'Pessoal' },
]

const EMPTY_FORM: Omit<Parcelamento, 'id'> = {
  secao: '', empresa: '', empresa_avulsa: false, cnpj: '', regime: '', responsavel: '',
  local_tipo: '', status: 'EM ANDAMENTO', setores: [], tarefa: '', senhas: '',
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

function statusBadge(status: StatusParcelamento): { bg: string; text: string; label: string } {
  if (status === 'LIQUIDADO') return { bg: 'bg-green-500/20', text: 'text-green-300', label: 'LIQUIDADO' }
  if (status === 'CANCELADO') return { bg: 'bg-red-500/20', text: 'text-red-300', label: 'CANCELADO' }
  return { bg: 'bg-blue-500/20', text: 'text-blue-300', label: 'EM ANDAMENTO' }
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function ParcelamentosPage() {
  const [items, setItems] = useState<Parcelamento[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useFiltroPersistente('parcelamentos:busca', '')
  const [secaoFiltro, setSecaoFiltro] = useFiltroPersistente('parcelamentos:secao', 'TODOS')
  const [respFiltro, setRespFiltro] = useFiltroPersistente('parcelamentos:responsavel', 'TODOS')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<Parcelamento | null>(null)
  const [form, setForm] = useState<Omit<Parcelamento, 'id'>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userNome, setUserNome] = useState<string | null>(null)
  const [clientesCadastrados, setClientesCadastrados] = useState<{ nome: string; cnpj: string | null; responsavel: string | null }[]>([])
  const [secoes, setSecoes] = useState<SecaoParcelamento[]>([])
  const [gerenciarSecoesOpen, setGerenciarSecoesOpen] = useState(false)
  const [criandoSecao, setCriandoSecao] = useState(false)
  const [novaSecaoNome, setNovaSecaoNome] = useState('')
  const [novaSecaoErro, setNovaSecaoErro] = useState<string | null>(null)
  const [novaSecaoSalvando, setNovaSecaoSalvando] = useState(false)

  const { ano } = useMesAno()

  const sb = createClient()

  const responsaveisCadastrados = useMemo(() => Array.from(new Set(
    clientesCadastrados.map(c => c.responsavel ?? '').filter(Boolean)
  )).sort(), [clientesCadastrados])

  async function load(admin: boolean, nome: string | null) {
    setLoading(true)
    let q = sb.from('parcelamentos').select('*').order('empresa')
    if (!admin && nome) q = (q as any).ilike('responsavel', nome)
    const { data } = await q
    setItems(data ?? [])
    setLoading(false)
  }

  async function carregarSecoes(): Promise<SecaoParcelamento[]> {
    const { data } = await sb.from('parcelamento_secoes').select('id, nome').order('created_at')
    const secoesFrescas = data ?? []
    setSecoes(secoesFrescas)
    return secoesFrescas
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
    sb.from('clientes').select('nome, cnpj, clientes_fiscal!inner(responsavel)').eq('clientes_fiscal.ativo', true).order('nome').then(({ data }) => {
      setClientesCadastrados(data?.map((c: any) => ({
        nome: c.nome,
        cnpj: c.cnpj,
        responsavel: c.clientes_fiscal?.responsavel ?? null
      })) ?? [])
    })
    carregarSecoes()
  }, [])

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  function openCreate() {
    setEditItem(null)
    setForm({ ...EMPTY_FORM, secao: secoes[0]?.nome ?? '' })
    setModalOpen(true)
  }
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
      // Vinculado a cliente: meses sao somente leitura na UI (preenchidos
      // pela tarefa na ficha do cliente) — nao reenviar, senao o save do
      // admin sobrescreve com o valor capturado na abertura do modal e
      // desfaz o que a ficha gravou enquanto o modal estava aberto. Avulso:
      // nunca tem tarefa (cnpj null nunca resolve cliente_id), entao os
      // meses sao editados aqui e entram no update normalmente.
      const payload = montarUpdateParcelamento(form, editItem.empresa_avulsa)
      await sb.from('parcelamentos').update(payload).eq('id', editItem.id)
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

  function toggleSetorParcelamento(setor: string) {
    setForm(prev => ({
      ...prev,
      setores: prev.setores.includes(setor) ? prev.setores.filter(s => s !== setor) : [...prev.setores, setor],
    }))
  }

  async function handleCriarSecao() {
    const nome = novaSecaoNome.trim()
    if (!nome) return
    setNovaSecaoSalvando(true)
    setNovaSecaoErro(null)
    try {
      const { error } = await criarSecaoParcelamento(nome)
      if (error) { setNovaSecaoErro(error); return }
      await carregarSecoes()
      setF('secao', nome.toUpperCase())
      setCriandoSecao(false)
      setNovaSecaoNome('')
    } finally {
      setNovaSecaoSalvando(false)
    }
  }

  async function handleSecoesChanged() {
    const [secoesFrescas] = await Promise.all([carregarSecoes(), load(isAdmin, userNome)])
    if (modalOpen) {
      setForm(prev => {
        if (secoesFrescas.some(s => s.nome === prev.secao)) return prev
        return { ...prev, secao: secoesFrescas[0]?.nome ?? '' }
      })
    }
  }

  function fecharModal() {
    setModalOpen(false)
    setCriandoSecao(false)
    setNovaSecaoNome('')
    setNovaSecaoErro(null)
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

  const secoesMostrar = secaoFiltro === 'TODOS' ? secoes.map(s => s.nome) : [secaoFiltro]

  function imprimir() {
    const agora = new Date().toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })
    const filtroDesc = [
      secaoFiltro !== 'TODOS' ? `Seção: ${secaoFiltro}` : null,
      respFiltro  !== 'TODOS' ? `Responsável: ${respFiltro}` : null,
      search ? `Busca: "${search}"` : null,
    ].filter(Boolean).join(' · ') || 'Todos os registros'

    const secRows = (secaoFiltro === 'TODOS' ? secoes.map(s => s.nome) : [secaoFiltro]).map(secao => {
      const rows = filtered.filter(p => p.secao === secao)
      if (!rows.length) return ''
      const trs = rows.map((p, i) => `
        <tr class="${i % 2 === 0 ? 'even' : ''}">
          <td>${p.empresa}</td>
          <td>${p.cnpj ?? '—'}</td>
          <td>${p.regime ?? '—'}</td>
          <td>${p.responsavel ?? '—'}</td>
          <td>${p.local_tipo ?? '—'}</td>
          <td>${p.status}</td>
          ${MESES_COLS.map(m => {
            const v = (p as any)[m] as string | null
            return `<td class="month ${v ? 'filled' : ''}">${v ?? '—'}</td>`
          }).join('')}
        </tr>`).join('')
      return `
        <div class="section-title">${secao} <span class="count">${rows.length} parcelamento${rows.length !== 1 ? 's' : ''}</span></div>
        <table>
          <thead><tr>
            <th>Empresa</th><th>CNPJ</th><th>Regime</th><th>Responsável</th><th>Local/Tipo</th><th>Status</th>
            ${MESES_ABREV.map(m => `<th class="month">${m}</th>`).join('')}
          </tr></thead>
          <tbody>${trs}</tbody>
        </table>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8">
    <title>Parcelamentos ${ano} — Tesserato Contabilidade</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 8px; color: #111; background: white; }
      .header { background: #162444; color: white; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
      .header-left h1 { font-size: 18px; font-weight: bold; letter-spacing: -0.5px; }
      .header-left .sub { font-size: 10px; color: rgba(255,255,255,0.55); margin-top: 2px; }
      .header-right { text-align: right; font-size: 9px; color: rgba(255,255,255,0.55); line-height: 1.6; }
      .header-right strong { color: white; }
      .meta { display: flex; gap: 20px; margin-bottom: 14px; }
      .meta-item { background: #f4f6f8; border-radius: 6px; padding: 6px 12px; }
      .meta-item .label { font-size: 7px; text-transform: uppercase; letter-spacing: 0.8px; color: #888; }
      .meta-item .value { font-size: 11px; font-weight: bold; color: #111; }
      .section-title { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.8px; color: #162444; border-left: 3px solid #00CCEB; padding-left: 8px; margin: 14px 0 6px; }
      .section-title .count { font-weight: normal; color: #888; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
      th { background: #162444; color: white; padding: 4px 6px; text-align: left; font-size: 7px; text-transform: uppercase; letter-spacing: 0.5px; }
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
        <h1>Relatório de Parcelamentos — ${ano}</h1>
        <div class="sub">Tesserato Contabilidade · Setor Fiscal</div>
      </div>
      <div class="header-right">
        <div>Gerado em: <strong>${agora}</strong></div>
        <div>Filtros aplicados: <strong>${filtroDesc}</strong></div>
        <div>Total de registros: <strong>${filtered.length}</strong></div>
      </div>
    </div>
    <div class="meta">
      <div class="meta-item"><div class="label">Ano de referência</div><div class="value">${ano}</div></div>
      <div class="meta-item"><div class="label">Total de parcelamentos</div><div class="value">${filtered.length}</div></div>
      <div class="meta-item"><div class="label">Seções</div><div class="value">${(secaoFiltro === 'TODOS' ? secoes.map(s => s.nome) : [secaoFiltro]).filter(s => filtered.some(p => p.secao === s)).length}</div></div>
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
      <div className="flex items-center gap-3 px-8 py-4 bg-[var(--bg-surface-2)] border-b border-[var(--fg)]/8 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-[var(--fg)] whitespace-nowrap">Parcelamentos {ano}</h1>
        <input type="text" placeholder="Buscar empresa, CNPJ ou responsável..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/40" />
        <select value={secaoFiltro} onChange={e => setSecaoFiltro(e.target.value)}
          className="px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)]/70 text-sm focus:outline-none min-w-[180px]">
          <option value="TODOS">Todas as seções</option>
          {secoes.map(s => <option key={s.id} value={s.nome} className="bg-[var(--bg-surface)]">{s.nome}</option>)}
        </select>
        {isAdmin && (
          <select value={respFiltro} onChange={e => setRespFiltro(e.target.value)}
            className="px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)]/70 text-sm focus:outline-none min-w-[150px]">
            <option value="TODOS">Todos os responsáveis</option>
            {responsaveis.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
          </select>
        )}
        <button onClick={imprimir}
          className="px-4 py-2 rounded-xl bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 text-sm hover:bg-[var(--fg)]/12 transition-colors whitespace-nowrap">
          Relatório
        </button>
        <button onClick={openCreate}
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap">
          + Novo Parcelamento
        </button>
      </div>

      <div className="p-8 space-y-6">
        {loading && <p className="text-[var(--fg)]/30 text-sm">Carregando...</p>}

        {!loading && secoesMostrar.map(secao => {
          const rows = filtered.filter(p => p.secao === secao)
          if (rows.length === 0) return null
          return (
            <div key={secao}>
              {/* Seção header */}
              <div className="flex items-center gap-3 pl-4 border-l-4 border-[var(--accent)] mb-3">
                <div>
                  <p className="text-[var(--fg)] font-bold text-sm">{secao}</p>
                  <p className="text-[var(--fg)]/35 text-xs">{rows.length} parcelamento{rows.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Tabela */}
              <div className="rounded-xl border border-[var(--fg)]/8 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--fg)]/8 bg-[var(--fg)]/2">
                        <th className="text-left px-4 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider whitespace-nowrap">Empresa</th>
                        <th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider whitespace-nowrap">CNPJ</th>
                        <th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider">Regime</th>
                        <th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider">Responsável</th>
                        <th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider whitespace-nowrap">Local / Tipo</th>
                        <th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider whitespace-nowrap">Status</th>
                        {MESES_ABREV.map(m => (
                          <th key={m} className="text-center px-1.5 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider w-[72px]">{m}</th>
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
                              className={`border-b border-[var(--fg)]/5 cursor-pointer transition-colors ${isExp ? 'bg-[var(--fg)]/5' : 'hover:bg-[var(--fg)]/2'}`}>
                              <td className="px-4 py-3 text-[var(--fg)] font-semibold whitespace-nowrap">{item.empresa}</td>
                              <td className="px-3 py-3 text-[var(--fg)]/45 font-mono whitespace-nowrap">{item.cnpj ?? '—'}</td>
                              <td className="px-3 py-3 text-[var(--fg)]/50">{item.regime ?? '—'}</td>
                              <td className="px-3 py-3 font-semibold" style={{ color: cor }}>{item.responsavel ?? '—'}</td>
                              <td className="px-3 py-3 text-[var(--fg)]/50 max-w-[140px] truncate">{item.local_tipo ?? '—'}</td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                {(() => { const { bg, text, label } = statusBadge(item.status); return (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${bg} ${text}`}>{label}</span>
                                )})()}
                              </td>
                              {MESES_COLS.map(mes => {
                                const val = (item as any)[mes] as string | null
                                return (
                                  <td key={mes} className="px-1.5 py-2 text-center">
                                    {val ? (
                                      <span className="text-[var(--fg)]/70 text-[10px] font-mono">{val}</span>
                                    ) : (
                                      <span className="text-[var(--fg)]/15">—</span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>

                            {/* Linha expandida */}
                            {isExp && (
                              <tr key={`${item.id}-exp`} className="border-b border-[var(--fg)]/8">
                                <td colSpan={18} className="px-4 py-3 bg-[var(--bg-surface-2)]">
                                  {/* Botões + Info numa linha */}
                                  <div className="flex items-center gap-6 mb-3">
                                    <button onClick={e => { e.stopPropagation(); openEdit(item) }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[var(--fg)] text-xs font-semibold transition-colors shrink-0">
                                      ✏ Editar
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); handleDelete(item.id, item.empresa) }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 text-[var(--fg)] text-xs font-semibold transition-colors shrink-0">
                                      🗑 Excluir
                                    </button>
                                    <div className="h-4 w-px bg-[var(--fg)]/10" />
                                    {[
                                      { label: 'Empresa', val: item.empresa },
                                      { label: 'CNPJ', val: item.cnpj ?? '—' },
                                      { label: 'Regime', val: item.regime ?? '—' },
                                      { label: 'Responsável', val: item.responsavel ?? '—', cor },
                                      { label: 'Local / Tipo', val: item.local_tipo ?? '—' },
                                      { label: 'Status', val: item.status },
                                    ].map(f => (
                                      <div key={f.label} className="min-w-0">
                                        <p className="text-[var(--fg)]/30 text-[9px] uppercase tracking-wider">{f.label}</p>
                                        <p className="text-xs font-semibold truncate" style={f.cor ? { color: f.cor } : { color: 'var(--fg)' }}>{f.val}</p>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Parcelas mensais — compactas */}
                                  <p className="text-[9px] font-bold text-[var(--fg)]/25 uppercase tracking-widest mb-2">Parcelas Mensais (data de emissão/envio)</p>
                                  <div className="grid grid-cols-12 gap-1.5">
                                    {MESES_COLS.map((mes, i) => {
                                      const val = (item as any)[mes] as string | null
                                      return (
                                        <div key={mes} className={`rounded-lg border px-2 py-1.5 ${val ? 'bg-blue-500/15 border-transparent' : 'border-[var(--fg)]/8 bg-[var(--fg)]/2'}`}>
                                          <p className={`text-[9px] font-bold uppercase ${val ? 'text-blue-300' : 'text-[var(--fg)]/20'}`}>{MESES_NOME[i]}</p>
                                          <p className={`text-sm font-bold mt-0.5 ${val ? 'text-[var(--fg)]' : 'text-[var(--fg)]/15'}`}>{val ?? '—'}</p>
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
          <p className="text-center text-[var(--fg)]/20 text-sm py-16">Nenhum parcelamento encontrado.</p>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
              <h2 className="text-[var(--fg)] font-bold text-base">{editItem ? 'Editar Parcelamento' : 'Novo Parcelamento'}</h2>
              <button onClick={fecharModal} className="text-[var(--fg)]/30 hover:text-[var(--fg)] text-xl">×</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* Seção */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls + ' mb-0'}>Seção</label>
                  <button type="button" onClick={() => setGerenciarSecoesOpen(true)}
                    className="text-[10px] font-semibold text-[var(--fg)]/40 hover:text-[var(--fg)] transition-colors">
                    Gerenciar seções
                  </button>
                </div>
                <select
                  value={criandoSecao ? '__nova__' : form.secao}
                  onChange={e => {
                    if (e.target.value === '__nova__') {
                      setCriandoSecao(true)
                      setNovaSecaoNome('')
                      setNovaSecaoErro(null)
                    } else {
                      setF('secao', e.target.value)
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50">
                  {secoes.map(s => <option key={s.id} value={s.nome} className="bg-[var(--bg-surface)]">{s.nome}</option>)}
                  <option value="__nova__" className="bg-[var(--bg-surface)]">+ Criar nova seção...</option>
                </select>
                {criandoSecao && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={novaSecaoNome}
                      onChange={e => setNovaSecaoNome(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCriarSecao())}
                      placeholder="Nome da nova seção..."
                      autoFocus
                      className={inputCls + ' flex-1'}
                    />
                    <button type="button" onClick={handleCriarSecao} disabled={novaSecaoSalvando || !novaSecaoNome.trim()}
                      className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 whitespace-nowrap">
                      {novaSecaoSalvando ? 'Criando...' : 'Criar'}
                    </button>
                    <button type="button" onClick={() => { setCriandoSecao(false); setNovaSecaoNome(''); setNovaSecaoErro(null) }}
                      className="px-3 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
                      Cancelar
                    </button>
                  </div>
                )}
                {novaSecaoErro && (
                  <p className="mt-1.5 text-xs text-red-400">⚠ {novaSecaoErro}</p>
                )}
                {secoes.length === 0 && (
                  <p className="mt-1.5 text-[var(--fg)]/40 text-xs">Nenhuma seção cadastrada ainda — crie uma abaixo.</p>
                )}
              </div>

              {/* Empresa + CNPJ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={labelCls + ' mb-0'}>Empresa</label>
                    <label className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--fg)]/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.empresa_avulsa}
                        onChange={e => {
                          const avulsa = e.target.checked
                          setF('empresa_avulsa', avulsa)
                          setF('empresa', '')
                          setF('cnpj', null)
                        }}
                        className="accent-[var(--accent)]"
                      />
                      Empresa Avulsa
                    </label>
                  </div>
                  {form.empresa_avulsa ? (
                    <input
                      value={form.empresa}
                      onChange={e => setF('empresa', e.target.value)}
                      placeholder="Digite o nome da empresa..."
                      className={inputCls}
                    />
                  ) : (
                    <select
                      value={form.empresa}
                      onChange={e => {
                        const nomeSelecionado = e.target.value
                        const cliente = clientesCadastrados.find(c => c.nome === nomeSelecionado)
                        setF('empresa', nomeSelecionado)
                        setF('cnpj', cliente?.cnpj ?? null)
                      }}
                      className={inputCls + ' bg-[var(--bg-surface)]'}>
                      <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
                      {clientesCadastrados.map(c => (
                        <option key={c.nome} value={c.nome} className="bg-[var(--bg-surface)]">{c.nome}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className={labelCls}>CNPJ</label>
                  <input className={inputCls + ' font-mono'} value={form.cnpj ?? ''} onChange={e => setF('cnpj', e.target.value || null)} />
                </div>
              </div>

              {/* Regime + Responsável + Local/Tipo + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Regime</label>
                  <input className={inputCls} value={form.regime ?? ''} onChange={e => setF('regime', e.target.value || null)} />
                </div>
                <div>
                  <label className={labelCls}>Responsável</label>
                  <select
                    value={form.responsavel ?? ''}
                    onChange={e => setF('responsavel', e.target.value || null)}
                    className={inputCls + ' bg-[var(--bg-surface)]'}>
                    <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
                    {responsaveisCadastrados.map(r => (
                      <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Local / Tipo</label>
                  <input className={inputCls} value={form.local_tipo ?? ''} onChange={e => setF('local_tipo', e.target.value || null)} />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select
                    value={form.status}
                    onChange={e => setF('status', e.target.value as StatusParcelamento)}
                    className={inputCls + ' bg-[var(--bg-surface)]'}>
                    <option value="EM ANDAMENTO" className="bg-[var(--bg-surface)]">Em andamento</option>
                    <option value="LIQUIDADO" className="bg-[var(--bg-surface)]">Liquidado</option>
                    <option value="CANCELADO" className="bg-[var(--bg-surface)]">Cancelado</option>
                  </select>
                </div>
              </div>

              {/* Setores que geram tarefa automática */}
              <div>
                <label className={labelCls}>Gera tarefa automática nos setores</label>
                <div className="grid grid-cols-3 gap-2">
                  {SETORES_PARCELAMENTO.map(s => (
                    <label key={s.valor} className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10">
                      <input
                        type="checkbox"
                        checked={form.setores.includes(s.valor)}
                        onChange={() => toggleSetorParcelamento(s.valor)}
                        className="w-3.5 h-3.5 accent-[var(--accent)]"
                      />
                      <span className="text-[var(--fg)]/70 text-xs">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Tarefa */}
              <div>
                <label className={labelCls}>Tarefa</label>
                <input className={inputCls} value={form.tarefa ?? ''} onChange={e => setF('tarefa', e.target.value || null)} />
              </div>

              {/* Meses — editavel se avulso (sem tarefa que preencha), somente leitura se vinculado a cliente */}
              <div>
                <label className={labelCls}>
                  Parcelas Mensais — data de emissão/envio
                  {!form.empresa_avulsa && ' (preenchido pela tarefa na ficha do cliente)'}
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {MESES_COLS.map((mes, i) => {
                    const valor = (form as any)[mes] as string | null
                    return (
                      <div key={mes}>
                        <p className="text-[var(--fg)]/30 text-[10px] text-center mb-1">{MESES_ABREV[i]}</p>
                        {form.empresa_avulsa ? (
                          <input
                            value={valor ?? ''}
                            onChange={e => setF(mes as keyof typeof form, (e.target.value || null) as never)}
                            placeholder="dd/mm"
                            className="w-full px-2 py-2 rounded-xl border bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)] text-xs text-center focus:outline-none focus:border-[var(--accent)]/50"
                          />
                        ) : (
                          <div className={`w-full px-2 py-2 rounded-xl border text-xs text-center ${
                            valor ? 'bg-blue-500/10 border-transparent text-[var(--fg)]' : 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/20'
                          }`}>
                            {valor ?? '—'}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Senhas */}
              <div>
                <label className={labelCls}>Senhas / Obs</label>
                <textarea value={form.senhas ?? ''} onChange={e => setF('senhas', e.target.value || null)}
                  rows={3} className={inputCls + ' resize-none'} />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
              <button onClick={fecharModal}
                className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving || !form.empresa.trim() || !form.secao}
                className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {gerenciarSecoesOpen && (
        <GerenciarSecoesModal
          secoes={secoes}
          onClose={() => setGerenciarSecoesOpen(false)}
          onChanged={handleSecoesChanged}
        />
      )}
    </div>
  )
}
