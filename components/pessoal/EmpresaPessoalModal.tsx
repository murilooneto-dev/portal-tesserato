'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'

interface FormData {
  cnpj: string
  nome: string
  atividade: string
  municipio: string
  uf: string
  responsavel: string
  contato_chat: string
  prioridade: number
  obs: string
  tarefas_personalizadas: string[]
}

interface Props {
  clienteId: string | null
  responsaveis: string[]
  tarefasPadrao: string[]
  onClose: () => void
  readOnly?: boolean
}

const emptyForm = (tarefasPadrao: string[]): FormData => ({
  cnpj: '', nome: '', atividade: '', municipio: '', uf: '', responsavel: '', contato_chat: '',
  prioridade: 3, obs: '', tarefas_personalizadas: tarefasPadrao,
})

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const selectCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function EmpresaPessoalModal({ clienteId, responsaveis, tarefasPadrao, onClose, readOnly = false }: Props) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = !!clienteId

  const [form, setForm] = useState<FormData>(emptyForm(tarefasPadrao))
  const [novaTarefa, setNovaTarefa] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!clienteId) return
    sb.from('clientes').select(SELECT_CLIENTE_PESSOAL).eq('id', clienteId).single().then(({ data: raw }) => {
      if (!raw) return
      const data = flattenClientePessoal(raw)
      setForm({
        cnpj: data.cnpj ?? '',
        nome: data.nome ?? '',
        atividade: data.atividade ?? '',
        municipio: data.municipio ?? '',
        uf: data.uf ?? '',
        responsavel: data.responsavel ?? '',
        contato_chat: data.contato_chat ?? '',
        prioridade: data.prioridade ?? 3,
        obs: data.obs ?? '',
        tarefas_personalizadas: data.tarefas_personalizadas ?? [],
      })
      setLoading(false)
    })
  }, [clienteId])

  async function fetchCnpj(raw: string) {
    setLoadingCnpj(true)
    const resultado = await buscarCnpj(raw)
    if (resultado) {
      setForm(p => ({
        ...p,
        nome: resultado.nome || p.nome,
        municipio: resultado.municipio || p.municipio,
        uf: resultado.uf || p.uf,
      }))
    }
    setLoadingCnpj(false)
  }

  function set<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function addTarefa() {
    const t = novaTarefa.trim()
    if (!t) return
    set('tarefas_personalizadas', [...form.tarefas_personalizadas, t])
    setNovaTarefa('')
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    setErro(null)

    const clientePayload = {
      nome: form.nome,
      cnpj: form.cnpj || null,
      municipio: form.municipio || null,
      uf: form.uf || null,
      contato_chat: form.contato_chat || null,
    }
    const pessoalPayload = {
      atividade: form.atividade || null,
      responsavel: form.responsavel || null,
      prioridade: form.prioridade,
      obs: form.obs || null,
      tarefas_personalizadas: form.tarefas_personalizadas,
    }

    if (isEdit) {
      const { error: errCliente } = await sb.from('clientes').update(clientePayload).eq('id', clienteId)
      if (errCliente) { setSaving(false); setErro(errCliente.message); return }
      const { error: errPessoal } = await sb.from('clientes_pessoal').update(pessoalPayload).eq('cliente_id', clienteId)
      if (errPessoal) { setSaving(false); setErro(errPessoal.message); return }
    } else {
      // setores explícito: 'pessoal', não o default '{fiscal}' da coluna —
      // esse cliente está sendo criado a partir da tela do Pessoal.
      const { data: novoCliente, error: errCliente } = await sb.from('clientes')
        .insert({ ...clientePayload, setores: ['pessoal'] })
        .select('id').single()
      if (errCliente || !novoCliente) { setSaving(false); setErro(errCliente?.message ?? 'Falha ao criar cliente'); return }
      const { error: errPessoal } = await sb.from('clientes_pessoal').insert({ cliente_id: novoCliente.id, ...pessoalPayload })
      if (errPessoal) { setSaving(false); setErro(errPessoal.message); return }
    }

    setSaving(false)
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">{readOnly ? 'Visualizar Empresa' : isEdit ? 'Editar Empresa' : 'Nova Empresa'}</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-[var(--fg)]/30 text-sm text-center py-8">Carregando...</p>
          ) : (<>

            <div>
              <label className={labelCls}>CNPJ {loadingCnpj && <span className="text-[var(--accent)] normal-case tracking-normal">Buscando...</span>}</label>
              <input className={inputCls + ' font-mono'} value={form.cnpj}
                onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }}
                placeholder="00.000.000/0000-00" disabled={readOnly} />
            </div>

            <div>
              <label className={labelCls}>Razão Social *</label>
              <input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} required disabled={readOnly} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Município</label>
                <input className={inputCls} value={form.municipio} onChange={e => set('municipio', e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <label className={labelCls}>UF</label>
                <input className={inputCls + ' uppercase'} value={form.uf}
                  onChange={e => set('uf', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} disabled={readOnly} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Contato</label>
              <input className={inputCls} value={form.contato_chat} onChange={e => set('contato_chat', e.target.value)} disabled={readOnly} />
            </div>

            <div>
              <label className={labelCls}>Atividade</label>
              <input className={inputCls} value={form.atividade} onChange={e => set('atividade', e.target.value)} disabled={readOnly} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Responsável</label>
                <select className={selectCls} value={form.responsavel} onChange={e => set('responsavel', e.target.value)} disabled={readOnly}>
                  <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
                  {responsaveis.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Prioridade (0–5)</label>
                <input className={inputCls} type="number" min={0} max={5} value={form.prioridade}
                  onChange={e => set('prioridade', Number(e.target.value))} disabled={readOnly} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Observação</label>
              <textarea className={inputCls} rows={3} value={form.obs} onChange={e => set('obs', e.target.value)} disabled={readOnly} />
            </div>

            <div className="rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-4">
              <label className={labelCls}>Tarefas ({form.tarefas_personalizadas.length})</label>
              <div className="flex flex-wrap gap-1.5 mb-3 mt-2 min-h-[32px]">
                {form.tarefas_personalizadas.map((t, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-xs bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--fg)] px-2.5 py-1 rounded-lg">
                    {t}
                    {!readOnly && (
                      <button type="button"
                        onClick={() => set('tarefas_personalizadas', form.tarefas_personalizadas.filter((_, idx) => idx !== i))}
                        className="text-[var(--fg)]/40 hover:text-red-400 transition-colors font-bold">×</button>
                    )}
                  </span>
                ))}
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  <input value={novaTarefa} onChange={e => setNovaTarefa(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefa())}
                    placeholder="Digitar nome da tarefa e pressionar Enter..."
                    className={inputCls + ' flex-1 text-xs'} />
                  <button type="button" onClick={addTarefa}
                    className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 text-xs font-semibold transition-colors whitespace-nowrap">
                    + Adicionar
                  </button>
                </div>
              )}
            </div>

          </>)}
        </div>

        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          {readOnly ? (
            <button onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-sm transition-colors">
              Fechar
            </button>
          ) : (<>
            <button onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !form.nome.trim()}
              className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar empresa'}
            </button>
          </>)}
        </div>
      </div>
    </div>
  )
}
