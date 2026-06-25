'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const GRUPOS = [
  { value: 'normal',  label: 'Regime Normal' },
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'mei',     label: 'MEI' },
]

const ATIVIDADES = [
  'Serviço',
  'Comércio',
  'Indústria',
  'Serviço e Comércio',
  'Serviço e Indústria',
  'Comércio e Indústria',
  'Serviço, Comércio e Indústria',
]

const TAREFAS_PADRAO: Record<string, string[]> = {
  normal:  ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS'],
  simples: ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF'],
  mei:     ['DAS'],
}

interface FormData {
  cod: string
  cnpj: string
  nome: string
  regime: string
  atividade: string
  grupo: string
  municipio: string
  uf: string
  responsavel: string
  prioridade: number
  declaracao_anual: boolean
  envia_iss: boolean
  confere_siga: boolean
  login_iss: string
  senha_iss: string
  email_envio_iss: string
  tarefas_personalizadas: string[]
}

interface Props {
  clienteId: string | null  // null = novo
  responsaveis: string[]
  onClose: () => void
}

const emptyForm = (): FormData => ({
  cod: '', cnpj: '', nome: '', regime: '', atividade: '', grupo: '',
  municipio: '', uf: '', responsavel: '', prioridade: 3,
  declaracao_anual: false, envia_iss: false, confere_siga: false,
  login_iss: '', senha_iss: '', email_envio_iss: '',
  tarefas_personalizadas: [],
})

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50 transition-colors"
const selectCls = "w-full px-3 py-2.5 rounded-xl bg-[#0d1320] border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50 transition-colors"
const labelCls = "block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5"

export default function EmpresaModal({ clienteId, responsaveis, onClose }: Props) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = !!clienteId

  const [form, setForm] = useState<FormData>(emptyForm())
  const [novaTarefa, setNovaTarefa] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!clienteId) return
    Promise.all([
      sb.from('clientes').select('*').eq('id', clienteId).single(),
      sb.from('tarefas').select('tipo').eq('cliente_id', clienteId),
    ]).then(([{ data }, { data: tarefasDB }]) => {
      if (!data) return
      const mitParts = (data.mit ?? '').split('/')
      // Tipos únicos já existentes no banco para esse cliente (da tabela tarefas)
      const tiposExistentes = Array.from(new Set(
        (tarefasDB ?? []).map((t: { tipo: string }) => t.tipo).filter(Boolean)
      )).sort() as string[]
      // Se já tem tarefas_personalizadas salvas usa elas, senão usa os tipos do banco
      const personalizadas: string[] =
        (data.tarefas_personalizadas && data.tarefas_personalizadas.length > 0)
          ? data.tarefas_personalizadas
          : tiposExistentes
      setForm({
        cod: data.cod ?? '',
        cnpj: data.cnpj ?? '',
        nome: data.nome ?? '',
        regime: data.regime ?? '',
        atividade: data.atividade ?? '',
        grupo: data.grupo ?? '',
        municipio: mitParts[0] ?? '',
        uf: mitParts[1] ?? '',
        responsavel: data.responsavel ?? '',
        prioridade: data.prioridade ?? 3,
        declaracao_anual: data.declaracao_anual ?? false,
        envia_iss: data.envia_iss ?? false,
        confere_siga: data.confere_siga ?? false,
        login_iss: data.login_iss ?? '',
        senha_iss: data.senha_iss ?? '',
        email_envio_iss: data.email_envio_iss ?? '',
        tarefas_personalizadas: personalizadas,
      })
      setLoading(false)
    })
  }, [clienteId])

  async function fetchCnpj(raw: string) {
    const digits = raw.replace(/\D/g, '')
    if (digits.length !== 14) return
    setLoadingCnpj(true)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
      if (!res.ok) return
      const data = await res.json()
      setForm(p => ({
        ...p,
        nome: data.razao_social || p.nome,
        municipio: data.municipio || p.municipio,
        uf: data.uf || p.uf,
      }))
    } catch { /* silent */ } finally { setLoadingCnpj(false) }
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
    const mit = form.municipio && form.uf
      ? `${form.municipio}/${form.uf}`
      : form.municipio || null

    const payload = {
      cod:                    form.cod || null,
      nome:                   form.nome,
      cnpj:                   form.cnpj || null,
      regime:                 form.regime || null,
      atividade:              form.atividade || null,
      grupo:                  form.grupo || null,
      mit,
      responsavel:            form.responsavel || null,
      prioridade:             form.prioridade,
      declaracao_anual:       form.declaracao_anual,
      envia_iss:              form.envia_iss,
      confere_siga:           form.confere_siga,
      login_iss:              form.envia_iss ? form.login_iss || null : null,
      senha_iss:              form.envia_iss ? form.senha_iss || null : null,
      email_envio_iss:        form.envia_iss ? form.email_envio_iss || null : null,
      tarefas_personalizadas: form.tarefas_personalizadas,
    }

    const { error } = isEdit
      ? await sb.from('clientes').update(payload).eq('id', clienteId)
      : await sb.from('clientes').insert(payload)

    setSaving(false)
    if (error) {
      setErro(error.message)
      return
    }
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#0d1320] border border-white/12 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
          <h2 className="text-white font-bold text-base">{isEdit ? 'Editar Empresa' : 'Nova Empresa'}</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors text-xl px-1">×</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-white/30 text-sm text-center py-8">Carregando...</p>
          ) : (<>

            {/* Código + CNPJ */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Código</label>
                <input className={inputCls} value={form.cod} onChange={e => set('cod', e.target.value)} placeholder="00000" />
              </div>
              <div>
                <label className={labelCls}>CNPJ {loadingCnpj && <span className="text-[#00B8D4] normal-case tracking-normal">Buscando...</span>}</label>
                <input className={inputCls + ' font-mono'} value={form.cnpj}
                  onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }}
                  placeholder="00.000.000/0000-00" />
              </div>
            </div>

            {/* Razão Social */}
            <div>
              <label className={labelCls}>Razão Social *</label>
              <input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} required />
            </div>

            {/* Regime + Atividade */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Regime</label>
                <input className={inputCls} value={form.regime} onChange={e => set('regime', e.target.value)} placeholder="Ex: Isenta" />
              </div>
              <div>
                <label className={labelCls}>Atividade</label>
                <select className={selectCls} value={form.atividade} onChange={e => set('atividade', e.target.value)}>
                  <option value="">Selecionar...</option>
                  {ATIVIDADES.map(a => <option key={a} value={a} className="bg-[#0d1320]">{a}</option>)}
                </select>
              </div>
            </div>

            {/* Checkbox Envia ISS */}
            <div>
              <label className={`flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl border transition-all ${
                form.envia_iss ? 'border-amber-500/50 bg-amber-500/8' : 'border-white/8 bg-white/2'
              }`}>
                <input type="checkbox" checked={form.envia_iss} onChange={e => set('envia_iss', e.target.checked)} className="w-4 h-4 accent-amber-400" />
                <span className={`text-xs font-bold uppercase tracking-widest ${form.envia_iss ? 'text-amber-400' : 'text-white/40'}`}>
                  Envia ISS?
                </span>
                {form.envia_iss && <span className="text-amber-400/70 text-xs">✓ SIM — preencha as credenciais abaixo</span>}
              </label>
            </div>

            {/* Credenciais ISS */}
            {form.envia_iss && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
                <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-widest">🔒 Credenciais ISS</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Login ISS</label>
                    <input className={inputCls} value={form.login_iss} onChange={e => set('login_iss', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Senha ISS</label>
                    <input className={inputCls} value={form.senha_iss} onChange={e => set('senha_iss', e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Email Envio</label>
                  <input className={inputCls} type="email" value={form.email_envio_iss} onChange={e => set('email_envio_iss', e.target.value)} />
                </div>
              </div>
            )}

            {/* Checkbox Confere SIGA */}
            <div>
              <label className={`flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl border border-white/8 bg-white/2 transition-all`}>
                <input type="checkbox" checked={form.confere_siga} onChange={e => set('confere_siga', e.target.checked)} className="w-4 h-4 accent-[#00B8D4]" />
                <span className="text-xs font-bold uppercase tracking-widest text-white/40">Confere SIGA?</span>
              </label>
            </div>

            {/* Grupo + Município */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Grupo</label>
                <select className={selectCls} value={form.grupo} onChange={e => {
                  const novoGrupo = e.target.value
                  set('grupo', novoGrupo)
                  // Em nova empresa: preenche tarefas com o padrão do grupo selecionado
                  if (!isEdit && novoGrupo && TAREFAS_PADRAO[novoGrupo]) {
                    set('tarefas_personalizadas', [...TAREFAS_PADRAO[novoGrupo]])
                  }
                }}>
                  <option value="" className="bg-[#0d1320]">Selecionar...</option>
                  {GRUPOS.map(g => <option key={g.value} value={g.value} className="bg-[#0d1320]">{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Município</label>
                <input className={inputCls} value={form.municipio} onChange={e => set('municipio', e.target.value)} />
              </div>
            </div>

            {/* UF + Responsável */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>UF</label>
                <input className={inputCls + ' uppercase'} value={form.uf}
                  onChange={e => set('uf', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
              </div>
              <div>
                <label className={labelCls}>Responsável</label>
                <select className={selectCls} value={form.responsavel} onChange={e => set('responsavel', e.target.value)}>
                  <option value="" className="bg-[#0d1320]">Selecionar...</option>
                  {responsaveis.map(r => <option key={r} value={r} className="bg-[#0d1320]">{r}</option>)}
                </select>
              </div>
            </div>

            {/* Prioridade */}
            <div className="w-1/2 pr-2">
              <label className={labelCls}>Prioridade (0–5)</label>
              <input className={inputCls} type="number" min={0} max={5} value={form.prioridade}
                onChange={e => set('prioridade', Number(e.target.value))} />
            </div>

            {/* Declaração Anual */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl border border-white/8 bg-white/2">
                <input type="checkbox" checked={form.declaracao_anual} onChange={e => set('declaracao_anual', e.target.checked)} className="w-4 h-4 accent-[#00B8D4]" />
                <span className="text-xs font-bold uppercase tracking-widest text-white/40">Declaração Anual</span>
              </label>
            </div>

            {/* Tarefas */}
            <div className="rounded-xl border border-white/8 bg-white/2 p-4">
              <div className="flex items-center justify-between mb-3">
                <label className={labelCls + ' mb-0'}>
                  Tarefas ({form.tarefas_personalizadas.length})
                </label>
                {!isEdit && form.grupo && (
                  <button type="button"
                    onClick={() => set('tarefas_personalizadas', [...(TAREFAS_PADRAO[form.grupo] ?? [])])}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors border border-white/10 px-2 py-1 rounded-lg">
                    Restaurar padrão do grupo
                  </button>
                )}
              </div>

              {/* Tags das tarefas existentes */}
              <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
                {form.tarefas_personalizadas.length === 0 && (
                  <p className="text-white/20 text-xs">
                    {form.grupo ? 'Selecione o grupo acima para pré-preencher as tarefas padrão.' : 'Nenhuma tarefa adicionada.'}
                  </p>
                )}
                {form.tarefas_personalizadas.map((t, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-xs bg-[#00B8D4]/10 border border-[#00B8D4]/30 text-white px-2.5 py-1 rounded-lg">
                    {t}
                    <button type="button"
                      onClick={() => set('tarefas_personalizadas', form.tarefas_personalizadas.filter((_, idx) => idx !== i))}
                      className="text-white/40 hover:text-red-400 transition-colors font-bold">×</button>
                  </span>
                ))}
              </div>

              {/* Input nova tarefa */}
              <div className="flex gap-2">
                <input value={novaTarefa} onChange={e => setNovaTarefa(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefa())}
                  placeholder="Digitar nome da tarefa e pressionar Enter..."
                  className={inputCls + ' flex-1 text-xs'} />
                <button type="button" onClick={addTarefa}
                  className="px-4 py-2 rounded-xl bg-[#00B8D4]/20 border border-[#00B8D4]/40 text-[#00B8D4] hover:bg-[#00B8D4]/30 text-xs font-semibold transition-colors whitespace-nowrap">
                  + Adicionar
                </button>
              </div>
            </div>

          </>)}
        </div>

        {/* Erro */}
        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/8 shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-white/12 text-white/50 hover:text-white text-sm transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !form.nome.trim()}
            className="px-6 py-2.5 rounded-xl bg-[#00B8D4] text-white text-sm font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar empresa'}
          </button>
        </div>
      </div>
    </div>
  )
}
