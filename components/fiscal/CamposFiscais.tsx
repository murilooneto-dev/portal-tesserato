'use client'

import { resolverTemplate } from '@/lib/atividade-templates'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'

export interface CamposFiscaisData {
  cod: string
  regime: string
  atividade: string
  grupo: string
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

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const selectCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

interface Props {
  form: CamposFiscaisData
  set: <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void
  responsaveis: string[]
  templates: Record<string, string[]>
  catalogo: CatalogoCliente
  isEdit: boolean
  readOnly: boolean
  novaTarefa: string
  setNovaTarefa: (v: string) => void
  addTarefa: () => void
}

export default function CamposFiscais({ form, set, responsaveis, templates, catalogo, isEdit, readOnly, novaTarefa, setNovaTarefa, addTarefa }: Props) {
  return (
    <>
      {/* Código + Regime */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Código</label>
          <input className={inputCls} value={form.cod} onChange={e => set('cod', e.target.value)} placeholder="00000" disabled={readOnly} />
        </div>
        <div>
          <label className={labelCls}>Regime</label>
          <select className={selectCls} value={form.regime} onChange={e => set('regime', e.target.value)} disabled={readOnly}>
            <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
            {form.regime && !catalogo.regimes.includes(form.regime) && (
              <option value={form.regime} className="bg-[var(--bg-surface)]">{form.regime} (atual)</option>
            )}
            {catalogo.regimes.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
          </select>
        </div>
      </div>

      {/* Atividade */}
      <div>
        <label className={labelCls}>Atividade</label>
        <select className={selectCls} value={form.atividade} onChange={e => {
          const novaAtividade = e.target.value
          set('atividade', novaAtividade)
          if (!isEdit && novaAtividade) {
            const tarefasTemplate = resolverTemplate(novaAtividade, templates)
            if (tarefasTemplate.length > 0) {
              set('tarefas_personalizadas', tarefasTemplate)
            }
          }
        }} disabled={readOnly}>
          <option value="">Selecionar...</option>
          {form.atividade && !catalogo.atividades.includes(form.atividade) && (
            <option value={form.atividade} className="bg-[var(--bg-surface)]">{form.atividade} (atual)</option>
          )}
          {catalogo.atividades.map(a => <option key={a} value={a} className="bg-[var(--bg-surface)]">{a}</option>)}
        </select>
      </div>

      {/* Checkbox Envia ISS */}
      <div>
        <label className={`flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl border transition-all ${
          form.envia_iss ? 'border-amber-500/50 bg-amber-500/8' : 'border-[var(--fg)]/8 bg-[var(--fg)]/2'
        }`}>
          <input type="checkbox" checked={form.envia_iss} onChange={e => set('envia_iss', e.target.checked)} className="w-4 h-4 accent-amber-400" disabled={readOnly} />
          <span className={`text-xs font-bold uppercase tracking-widest ${form.envia_iss ? 'text-amber-400' : 'text-[var(--fg)]/40'}`}>
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
              <input className={inputCls} value={form.login_iss} onChange={e => set('login_iss', e.target.value)} disabled={readOnly} />
            </div>
            <div>
              <label className={labelCls}>Senha ISS</label>
              <input className={inputCls} value={form.senha_iss} onChange={e => set('senha_iss', e.target.value)} disabled={readOnly} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Email Envio</label>
            <input className={inputCls} type="email" value={form.email_envio_iss} onChange={e => set('email_envio_iss', e.target.value)} disabled={readOnly} />
          </div>
        </div>
      )}

      {/* Checkbox Confere SIGA */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 transition-all">
          <input type="checkbox" checked={form.confere_siga} onChange={e => set('confere_siga', e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" disabled={readOnly} />
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--fg)]/40">Confere SIGA?</span>
        </label>
      </div>

      {/* Grupo + Responsável */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Grupo</label>
          <select className={selectCls} value={form.grupo} onChange={e => set('grupo', e.target.value)} disabled={readOnly}>
            <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
            {form.grupo && !catalogo.grupos.includes(form.grupo) && (
              <option value={form.grupo} className="bg-[var(--bg-surface)]">{form.grupo} (atual)</option>
            )}
            {catalogo.grupos.map(g => <option key={g} value={g} className="bg-[var(--bg-surface)]">{g}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Responsável</label>
          <select className={selectCls} value={form.responsavel} onChange={e => set('responsavel', e.target.value)} disabled={readOnly}>
            <option value="" className="bg-[var(--bg-surface)]">Selecionar...</option>
            {responsaveis.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
          </select>
        </div>
      </div>

      {/* Prioridade */}
      <div>
        <label className={labelCls}>Prioridade (0–5)</label>
        <input className={inputCls} type="number" min={0} max={5} value={form.prioridade}
          onChange={e => set('prioridade', Number(e.target.value))} disabled={readOnly} />
      </div>

      {/* Declaração Anual */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2">
          <input type="checkbox" checked={form.declaracao_anual} onChange={e => set('declaracao_anual', e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" disabled={readOnly} />
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--fg)]/40">Declaração Anual</span>
        </label>
      </div>

      {/* Tarefas */}
      <div className="rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-4">
        <div className="flex items-center justify-between mb-3">
          <label className={labelCls + ' mb-0'}>
            Tarefas ({form.tarefas_personalizadas.length})
          </label>
          {!readOnly && !isEdit && form.atividade && (
            <button type="button"
              onClick={() => set('tarefas_personalizadas', resolverTemplate(form.atividade, templates))}
              className="text-xs text-[var(--fg)]/30 hover:text-[var(--fg)]/60 transition-colors border border-[var(--fg)]/10 px-2 py-1 rounded-lg">
              Restaurar padrão da atividade
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
          {form.tarefas_personalizadas.length === 0 && (
            <p className="text-[var(--fg)]/20 text-xs">
              {form.atividade ? 'Selecione a atividade acima para pré-preencher as tarefas padrão.' : 'Nenhuma tarefa adicionada.'}
            </p>
          )}
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
    </>
  )
}
