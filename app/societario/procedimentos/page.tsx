'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'

type StatusProcedimento = 'ABERTO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO'

interface ProcessoTipo {
  id: string
  nome: string
  etapas: string[] | null
}

interface DocumentacaoModelo {
  id: string
  nome: string
}

interface Procedimento {
  id: string
  processo_tipo_id: string
  empresa: string
  status: StatusProcedimento
  campos: Record<string, string>
  documentacao_modelo_id: string | null
  responsavel: string | null
  processo_tipos: { nome: string } | null
  documentacao_modelos: { nome: string } | null
}

const STATUS_OPCOES: { valor: StatusProcedimento; label: string }[] = [
  { valor: 'ABERTO', label: 'Aberto' },
  { valor: 'EM_ANDAMENTO', label: 'Em Andamento' },
  { valor: 'CONCLUIDO', label: 'Concluído' },
  { valor: 'CANCELADO', label: 'Cancelado' },
]

function statusBadge(status: StatusProcedimento): { bg: string; text: string; label: string } {
  if (status === 'CONCLUIDO') return { bg: 'bg-green-500/20', text: 'text-green-300', label: 'CONCLUÍDO' }
  if (status === 'CANCELADO') return { bg: 'bg-red-500/20', text: 'text-red-300', label: 'CANCELADO' }
  if (status === 'EM_ANDAMENTO') return { bg: 'bg-yellow-500/20', text: 'text-yellow-300', label: 'EM ANDAMENTO' }
  return { bg: 'bg-blue-500/20', text: 'text-blue-300', label: 'ABERTO' }
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

interface FormState {
  processo_tipo_id: string
  empresa: string
  responsavel: string
  status: StatusProcedimento
  campos: Record<string, string>
  preencherDocumento: boolean
  documentacao_modelo_id: string
}

const EMPTY_FORM: FormState = {
  processo_tipo_id: '',
  empresa: '',
  responsavel: '',
  status: 'ABERTO',
  campos: {},
  preencherDocumento: false,
  documentacao_modelo_id: '',
}

export default function ProcedimentosSocietarioPage() {
  const [items, setItems] = useState<Procedimento[]>([])
  const [tipos, setTipos] = useState<ProcessoTipo[]>([])
  const [modelos, setModelos] = useState<DocumentacaoModelo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useFiltroPersistente('procedimentos:busca', '')
  const [statusFiltro, setStatusFiltro] = useFiltroPersistente<'TODOS' | StatusProcedimento>('procedimentos:status', 'TODOS')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<Procedimento | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const sb = createClient()

  async function load() {
    setLoading(true)
    const { data } = await sb
      .from('procedimentos_societario')
      .select('*, processo_tipos(nome), documentacao_modelos(nome)')
      .order('created_at', { ascending: false })
    setItems((data ?? []) as unknown as Procedimento[])
    setLoading(false)
  }

  async function loadCatalogos() {
    const [{ data: tiposData }, { data: modelosData }] = await Promise.all([
      sb.from('processo_tipos').select('id, nome, etapas').order('nome'),
      sb.from('documentacao_modelos').select('id, nome').order('nome'),
    ])
    setTipos(tiposData ?? [])
    setModelos(modelosData ?? [])
  }

  useEffect(() => {
    load()
    loadCatalogos()
  }, [])

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id))
  }

  function openCreate() {
    setEditItem(null)
    setErro(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(item: Procedimento) {
    setEditItem(item)
    setErro(null)
    setForm({
      processo_tipo_id: item.processo_tipo_id,
      empresa: item.empresa,
      responsavel: item.responsavel ?? '',
      status: item.status,
      campos: { ...item.campos },
      preencherDocumento: !!item.documentacao_modelo_id,
      documentacao_modelo_id: item.documentacao_modelo_id ?? '',
    })
    setModalOpen(true)
  }

  function fecharModal() {
    setModalOpen(false)
    setErro(null)
  }

  async function handleDelete(id: string, empresa: string) {
    if (!confirm(`Excluir o procedimento de "${empresa}"?`)) return
    await sb.from('procedimentos_societario').delete().eq('id', id)
    setItems(prev => prev.filter(p => p.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  function selecionarTipo(tipoId: string) {
    const tipo = tipos.find(t => t.id === tipoId)
    const campos: Record<string, string> = {}
    for (const etapa of tipo?.etapas ?? []) {
      campos[etapa] = form.campos[etapa] ?? ''
    }
    setForm(prev => ({ ...prev, processo_tipo_id: tipoId, campos }))
  }

  function setCampo(etapa: string, valor: string) {
    setForm(prev => ({ ...prev, campos: { ...prev.campos, [etapa]: valor } }))
  }

  async function handleSave() {
    if (!form.processo_tipo_id || !form.empresa.trim()) return
    setSaving(true)
    setErro(null)

    const payload = {
      processo_tipo_id: form.processo_tipo_id,
      empresa: form.empresa.trim(),
      responsavel: form.responsavel.trim() || null,
      status: form.status,
      campos: form.campos,
      documentacao_modelo_id: form.preencherDocumento ? (form.documentacao_modelo_id || null) : null,
      updated_at: new Date().toISOString(),
    }

    const { error } = editItem
      ? await sb.from('procedimentos_societario').update(payload).eq('id', editItem.id)
      : await sb.from('procedimentos_societario').insert(payload)

    setSaving(false)
    if (error) { setErro(error.message); return }

    await load()
    setModalOpen(false)
  }

  async function handleGerar() {
    if (!form.documentacao_modelo_id) return
    setGerando(true)
    setErro(null)
    try {
      const tipo = tipos.find(t => t.id === form.processo_tipo_id)
      const modelo = modelos.find(m => m.id === form.documentacao_modelo_id)
      const res = await fetch('/api/societario/gerar-documento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modeloNome: modelo?.nome ?? 'Documento',
          empresa: form.empresa.trim(),
          processoNome: tipo?.nome ?? '',
          responsavel: form.responsavel.trim() || null,
          campos: Object.entries(form.campos).map(([etapa, valor]) => ({ etapa, valor })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErro(body.error ?? 'Falha ao gerar o documento.')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${modelo?.nome ?? 'documento'}-${form.empresa}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGerando(false)
    }
  }

  const tipoSelecionado = tipos.find(t => t.id === form.processo_tipo_id)

  const filtered = items.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !search || p.empresa.toLowerCase().includes(q)
    const matchStatus = statusFiltro === 'TODOS' || p.status === statusFiltro
    return matchSearch && matchStatus
  })

  return (
    <div className="min-h-screen">
      <div className="flex items-center gap-3 px-8 py-4 bg-[var(--bg-surface-2)] border-b border-[var(--fg)]/8 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-[var(--fg)] whitespace-nowrap">Procedimentos</h1>
        <input type="text" placeholder="Buscar empresa..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/40" />
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as 'TODOS' | StatusProcedimento)}
          className="px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)]/70 text-sm focus:outline-none min-w-[180px]">
          <option value="TODOS">Todos os status</option>
          {STATUS_OPCOES.map(s => <option key={s.valor} value={s.valor} className="bg-[var(--bg-surface)]">{s.label}</option>)}
        </select>
        <button onClick={openCreate}
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap">
          + Novo
        </button>
      </div>

      <div className="p-8">
        {loading && <p className="text-[var(--fg)]/30 text-sm">Carregando...</p>}

        {!loading && filtered.length > 0 && (
          <div className="rounded-xl border border-[var(--fg)]/8 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--fg)]/8 bg-[var(--fg)]/2">
                    <th className="text-left px-4 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider">Empresa</th>
                    <th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider">Tipo de Processo</th>
                    <th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider">Responsável</th>
                    <th className="text-left px-3 py-3 text-[var(--fg)]/40 font-semibold uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const isExp = expandedId === item.id
                    const { bg, text, label } = statusBadge(item.status)
                    return (
                      <React.Fragment key={item.id}>
                        <tr
                          onClick={() => toggleExpand(item.id)}
                          className={`border-b border-[var(--fg)]/5 cursor-pointer transition-colors ${isExp ? 'bg-[var(--fg)]/5' : 'hover:bg-[var(--fg)]/2'}`}>
                          <td className="px-4 py-3 text-[var(--fg)] font-semibold whitespace-nowrap">{item.empresa}</td>
                          <td className="px-3 py-3 text-[var(--fg)]/60">{item.processo_tipos?.nome ?? '—'}</td>
                          <td className="px-3 py-3 text-[var(--fg)]/50">{item.responsavel ?? '—'}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${bg} ${text}`}>{label}</span>
                          </td>
                        </tr>
                        {isExp && (
                          <tr key={`${item.id}-exp`} className="border-b border-[var(--fg)]/8">
                            <td colSpan={4} className="px-4 py-3 bg-[var(--bg-surface-2)]">
                              <div className="flex items-center gap-3 mb-3">
                                <button onClick={e => { e.stopPropagation(); openEdit(item) }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[var(--fg)] text-xs font-semibold transition-colors">
                                  ✏ Editar
                                </button>
                                <button onClick={e => { e.stopPropagation(); handleDelete(item.id, item.empresa) }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 text-[var(--fg)] text-xs font-semibold transition-colors">
                                  🗑 Excluir
                                </button>
                              </div>
                              {item.documentacao_modelos?.nome && (
                                <p className="text-xs text-[var(--fg)]/50 mb-2">Documento vinculado: <span className="text-[var(--fg)]">{item.documentacao_modelos.nome}</span></p>
                              )}
                              {Object.keys(item.campos ?? {}).length > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                  {Object.entries(item.campos).map(([etapa, valor]) => (
                                    <div key={etapa} className="rounded-lg border border-[var(--fg)]/8 bg-[var(--fg)]/2 px-3 py-2">
                                      <p className="text-[9px] font-bold uppercase text-[var(--fg)]/30">{etapa}</p>
                                      <p className="text-sm text-[var(--fg)]">{valor || '—'}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
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
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-center text-[var(--fg)]/20 text-sm py-16">Nenhum procedimento encontrado.</p>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={e => e.target === e.currentTarget && fecharModal()}>
          <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
              <h2 className="text-[var(--fg)] font-bold text-base">{editItem ? 'Editar Procedimento' : 'Novo Procedimento'}</h2>
              <button onClick={fecharModal} className="text-[var(--fg)]/30 hover:text-[var(--fg)] text-xl">×</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div>
                <label className={labelCls}>Tipo de Processo</label>
                <select
                  value={form.processo_tipo_id}
                  onChange={e => selecionarTipo(e.target.value)}
                  className={inputCls + ' bg-[var(--bg-surface)]'}>
                  <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
                  {tipos.map(t => <option key={t.id} value={t.id} className="bg-[var(--bg-surface)]">{t.nome}</option>)}
                </select>
                {tipos.length === 0 && (
                  <p className="mt-1.5 text-[var(--fg)]/40 text-xs">Nenhum tipo de processo cadastrado — cadastre em Configurações → Societário.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Empresa</label>
                  <input className={inputCls} value={form.empresa} onChange={e => setForm(p => ({ ...p, empresa: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Responsável</label>
                  <input className={inputCls} value={form.responsavel} onChange={e => setForm(p => ({ ...p, responsavel: e.target.value }))} />
                </div>
              </div>

              {editItem && (
                <div>
                  <label className={labelCls}>Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(p => ({ ...p, status: e.target.value as StatusProcedimento }))}
                    className={inputCls + ' bg-[var(--bg-surface)]'}>
                    {STATUS_OPCOES.map(s => <option key={s.valor} value={s.valor} className="bg-[var(--bg-surface)]">{s.label}</option>)}
                  </select>
                </div>
              )}

              {tipoSelecionado && (tipoSelecionado.etapas ?? []).length > 0 && (
                <div>
                  <label className={labelCls}>Campos do processo</label>
                  <div className="space-y-3">
                    {(tipoSelecionado.etapas ?? []).map(etapa => (
                      <div key={etapa}>
                        <p className="text-[var(--fg)]/50 text-xs mb-1">{etapa}</p>
                        <input
                          className={inputCls}
                          value={form.campos[etapa] ?? ''}
                          onChange={e => setCampo(etapa, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className={labelCls}>Preencher documento?</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-sm text-[var(--fg)]/70 cursor-pointer">
                    <input
                      type="radio"
                      checked={form.preencherDocumento}
                      onChange={() => setForm(p => ({ ...p, preencherDocumento: true }))}
                      className="accent-[var(--accent)]"
                    />
                    Sim
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-[var(--fg)]/70 cursor-pointer">
                    <input
                      type="radio"
                      checked={!form.preencherDocumento}
                      onChange={() => setForm(p => ({ ...p, preencherDocumento: false, documentacao_modelo_id: '' }))}
                      className="accent-[var(--accent)]"
                    />
                    Não
                  </label>
                </div>
                {form.preencherDocumento && (
                  <select
                    value={form.documentacao_modelo_id}
                    onChange={e => setForm(p => ({ ...p, documentacao_modelo_id: e.target.value }))}
                    className={inputCls + ' bg-[var(--bg-surface)] mt-2'}>
                    <option value="" className="bg-[var(--bg-surface)]">Selecionar modelo...</option>
                    {modelos.map(m => <option key={m.id} value={m.id} className="bg-[var(--bg-surface)]">{m.nome}</option>)}
                  </select>
                )}
              </div>

              {erro && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  ⚠ {erro}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
              <button onClick={fecharModal}
                className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
                Cancelar
              </button>
              {form.preencherDocumento && form.documentacao_modelo_id && (
                <button onClick={handleGerar} disabled={gerando}
                  className="px-5 py-2.5 rounded-xl border border-[var(--accent)]/40 text-[var(--accent)] text-sm font-semibold hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50">
                  {gerando ? 'Gerando...' : 'Gerar'}
                </button>
              )}
              <button onClick={handleSave} disabled={saving || !form.processo_tipo_id || !form.empresa.trim()}
                className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
