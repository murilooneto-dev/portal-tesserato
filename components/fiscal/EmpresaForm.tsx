'use client'

import { useState, useRef } from 'react'
import type { Cliente } from '@/lib/types'

interface Props {
  defaultValues?: Partial<Cliente> & {
    municipio?: string
    uf?: string
    declaracao_anual?: boolean
    envia_iss?: boolean
    login_iss?: string | null
    senha_iss?: string | null
    email_envio_iss?: string | null
    tarefas_personalizadas?: string[]
  }
  action: (formData: FormData) => Promise<void>
  submitLabel: string
}

const GRUPOS = [
  { value: 'normal',   label: 'Regime Normal' },
  { value: 'simples',  label: 'Simples Nacional' },
  { value: 'mei',      label: 'MEI' },
]

const ATIVIDADES = [
  'Servico',
  'Comercio',
  'Industria',
  'Servico-Comercio',
  'Industria-Comercio',
  'Servico-Industria',
  'Servico-Industria-Comercio',
]

export default function EmpresaForm({ defaultValues = {}, action, submitLabel }: Props) {
  const [cnpj, setCnpj] = useState(defaultValues.cnpj ?? '')
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [nome, setNome] = useState(defaultValues.nome ?? '')
  const [municipio, setMunicipio] = useState(defaultValues.mit?.split('/')[0] ?? defaultValues.municipio ?? '')
  const [uf, setUf] = useState(defaultValues.mit?.split('/')[1] ?? defaultValues.uf ?? '')
  const [enviaSS, setEnviaSS] = useState(defaultValues.envia_iss ?? false)
  const [tarefas, setTarefas] = useState<string[]>(defaultValues.tarefas_personalizadas ?? [])
  const [novaTarefa, setNovaTarefa] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  async function fetchCnpj(raw: string) {
    const digits = raw.replace(/\D/g, '')
    if (digits.length !== 14) return
    setLoadingCnpj(true)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.razao_social) setNome(data.razao_social)
      if (data.municipio)    setMunicipio(data.municipio)
      if (data.uf)           setUf(data.uf)
    } catch {
      // silent fail
    } finally {
      setLoadingCnpj(false)
    }
  }

  function addTarefa() {
    const t = novaTarefa.trim()
    if (!t) return
    setTarefas(prev => [...prev, t])
    setNovaTarefa('')
  }

  function removeTarefa(i: number) {
    setTarefas(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    const fd = new FormData(e.currentTarget)
    fd.set('tarefas_personalizadas', JSON.stringify(tarefas))
    try {
      await action(fd)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Row: Código + CNPJ */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-white/60 text-xs mb-1.5">Código</label>
          <input
            name="cod"
            defaultValue={defaultValues.cod ?? ''}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
            placeholder="Opcional"
          />
        </div>
        <div>
          <label className="block text-white/60 text-xs mb-1.5">
            CNPJ {loadingCnpj && <span className="text-[#00B8D4] ml-1">Buscando...</span>}
          </label>
          <input
            name="cnpj"
            value={cnpj}
            onChange={e => {
              setCnpj(e.target.value)
              fetchCnpj(e.target.value)
            }}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50 font-mono"
            placeholder="00.000.000/0000-00"
          />
        </div>
      </div>

      {/* Nome / Razão Social */}
      <div>
        <label className="block text-white/60 text-xs mb-1.5">Nome / Razão Social *</label>
        <input
          name="nome"
          required
          value={nome}
          onChange={e => setNome(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
          placeholder="Razão Social"
        />
      </div>

      {/* Regime + Grupo */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-white/60 text-xs mb-1.5">Regime</label>
          <input
            name="regime"
            defaultValue={defaultValues.regime ?? ''}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
            placeholder="Ex: Simples Nacional"
          />
        </div>
        <div>
          <label className="block text-white/60 text-xs mb-1.5">Grupo</label>
          <select
            name="grupo"
            defaultValue={defaultValues.grupo ?? ''}
            className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
          >
            <option value="">Selecionar...</option>
            {GRUPOS.map(g => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Atividade */}
      <div>
        <label className="block text-white/60 text-xs mb-1.5">Atividade</label>
        <select
          name="atividade"
          defaultValue={defaultValues.atividade ?? ''}
          className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
        >
          <option value="">Selecionar...</option>
          {ATIVIDADES.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Município + UF */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="block text-white/60 text-xs mb-1.5">Município</label>
          <input
            name="municipio"
            value={municipio}
            onChange={e => setMunicipio(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
          />
        </div>
        <div>
          <label className="block text-white/60 text-xs mb-1.5">UF</label>
          <input
            name="uf"
            value={uf}
            onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50 uppercase"
            maxLength={2}
          />
        </div>
      </div>

      {/* Responsável + Prioridade */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-white/60 text-xs mb-1.5">Responsável</label>
          <input
            name="responsavel"
            defaultValue={defaultValues.responsavel ?? ''}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
          />
        </div>
        <div>
          <label className="block text-white/60 text-xs mb-1.5">Prioridade (1–5)</label>
          <input
            name="prioridade"
            type="number"
            min={1}
            max={5}
            defaultValue={defaultValues.prioridade ?? 3}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
          />
        </div>
      </div>

      {/* Checkboxes */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            name="declaracao_anual"
            type="checkbox"
            defaultChecked={defaultValues.declaracao_anual ?? false}
            className="w-4 h-4 rounded accent-[#00B8D4]"
          />
          <span className="text-white/70 text-sm">Declaração Anual</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            name="envia_iss"
            type="checkbox"
            checked={enviaSS}
            onChange={e => setEnviaSS(e.target.checked)}
            className="w-4 h-4 rounded accent-[#00B8D4]"
          />
          <span className="text-white/70 text-sm">Envia ISS</span>
        </label>
      </div>

      {/* ISS fields — only shown when enviaSS */}
      {enviaSS && (
        <div className="pl-4 border-l-2 border-[#00B8D4]/30 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/60 text-xs mb-1.5">Login ISS</label>
              <input
                name="login_iss"
                defaultValue={defaultValues.login_iss ?? ''}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
              />
            </div>
            <div>
              <label className="block text-white/60 text-xs mb-1.5">Senha ISS</label>
              <input
                name="senha_iss"
                defaultValue={defaultValues.senha_iss ?? ''}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
              />
            </div>
          </div>
          <div>
            <label className="block text-white/60 text-xs mb-1.5">Email Envio ISS</label>
            <input
              name="email_envio_iss"
              type="email"
              defaultValue={defaultValues.email_envio_iss ?? ''}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
            />
          </div>
        </div>
      )}

      {/* Tarefas personalizadas */}
      <div>
        <label className="block text-white/60 text-xs mb-2">Tarefas Personalizadas</label>
        <div className="space-y-1.5 mb-2">
          {tarefas.map((t, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/8">
              <span className="flex-1 text-white text-sm">{t}</span>
              <button
                type="button"
                onClick={() => removeTarefa(i)}
                className="text-white/30 hover:text-red-400 transition-colors text-xs"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={novaTarefa}
            onChange={e => setNovaTarefa(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefa())}
            placeholder="Nova tarefa..."
            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50"
          />
          <button
            type="button"
            onClick={addTarefa}
            className="px-3 py-2 rounded-xl bg-white/5 text-white/60 hover:bg-white/10 text-sm transition-colors"
          >
            + Adicionar
          </button>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 rounded-xl bg-[#00B8D4] text-white text-sm font-medium hover:bg-[#00B8D4]/90 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
