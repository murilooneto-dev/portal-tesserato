'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import CamposFiscais, { type CamposFiscaisData } from '@/components/fiscal/CamposFiscais'
import SectorSection from '@/components/geral/SectorSection'
import { flattenClienteFiscal } from '@/lib/clientes-fiscal'
import { SETORES, SETOR_LABEL, type UserSetor, type TarefaVinculo } from '@/lib/types'
import { tarefaExisteNoCatalogo } from '@/lib/tarefa-tipos'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'
import { excluirClienteGeral } from '@/app/(comum)/clientes/actions'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'

interface FormData extends CamposFiscaisData {
  nome: string
  cnpj: string
  municipio: string
  uf: string
  contato_chat: string
  setores: UserSetor[]
  vinculosAtivos: string[]
}

interface Props {
  clienteId: string | null
  responsaveis: string[]
  vinculosCatalogo: TarefaVinculo[]
  catalogoFiscal: CatalogoCliente
  onClose: () => void
  readOnly?: boolean
}

const emptyForm = (): FormData => ({
  nome: '', cnpj: '', municipio: '', uf: '', contato_chat: '', setores: ['fiscal'],
  vinculosAtivos: [],
  cod: '', regime: '', atividade: [], grupo: '', responsavel: '', prioridade: 3,
  declaracao_anual: false, envia_iss: false, confere_siga: false, faz_dossie: false,
  login_iss: '', senha_iss: '', email_envio_iss: '',
  tarefas_personalizadas: [], tarefas_excluidas: [],
})

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function ClienteGeralModal({ clienteId, responsaveis, vinculosCatalogo, catalogoFiscal, onClose, readOnly = false }: Props) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = !!clienteId

  const [form, setForm] = useState<FormData>(emptyForm())
  const [novaTarefa, setNovaTarefa] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [mostrarVinculos, setMostrarVinculos] = useState(false)
  const [catalogoNomes, setCatalogoNomes] = useState<string[]>([])
  const [nomeParaCriar, setNomeParaCriar] = useState<string | null>(null)

  useEffect(() => {
    if (!clienteId) return
    // Left join (não !inner): um cliente pode não ter setor Fiscal marcado e,
    // nesse caso, legitimamente não tem linha em clientes_fiscal.
    sb.from('clientes').select('*, clientes_fiscal(*)').eq('id', clienteId).single().then(({ data: raw }) => {
      if (!raw) return
      const data = flattenClienteFiscal(raw)
      const mitParts = (data.mit ?? '').split('/')
      setForm({
        nome: data.nome ?? '',
        cnpj: data.cnpj ?? '',
        municipio: data.municipio ?? mitParts[0] ?? '',
        uf: data.uf ?? mitParts[1] ?? '',
        contato_chat: data.contato_chat ?? '',
        setores: (data.setores ?? ['fiscal']) as UserSetor[],
        vinculosAtivos: data.tarefas_vinculadas_ativas ?? [],
        cod: data.cod ?? '',
        regime: data.regime ?? '',
        atividade: data.atividade ?? [],
        grupo: data.grupo ?? '',
        responsavel: data.responsavel ?? '',
        prioridade: data.prioridade ?? 3,
        declaracao_anual: data.declaracao_anual ?? false,
        envia_iss: data.envia_iss ?? false,
        confere_siga: data.confere_siga ?? false,
        faz_dossie: data.faz_dossie ?? false,
        login_iss: data.login_iss ?? '',
        senha_iss: data.senha_iss ?? '',
        email_envio_iss: data.email_envio_iss ?? '',
        tarefas_personalizadas: data.tarefas_personalizadas ?? [],
        tarefas_excluidas: data.tarefas_excluidas ?? [],
      })
      setMostrarVinculos((data.tarefas_vinculadas_ativas ?? []).length > 0)
      setLoading(false)
    })
  }, [clienteId])

  useEffect(() => {
    sb.from('tarefa_tipos').select('nome').eq('setor', 'fiscal').then(({ data }) => {
      setCatalogoNomes((data ?? []).map(t => t.nome as string))
    })
  }, [])

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

  function toggleSetor(setor: UserSetor) {
    setForm(p => ({
      ...p,
      setores: p.setores.includes(setor) ? p.setores.filter(s => s !== setor) : [...p.setores, setor],
    }))
  }

  function addTarefa() {
    const t = novaTarefa.trim()
    if (!t) return
    if (tarefaExisteNoCatalogo(catalogoNomes, t)) {
      set('tarefas_personalizadas', [...form.tarefas_personalizadas, t])
      setNovaTarefa('')
    } else {
      setNomeParaCriar(t)
    }
  }

  function handleTipoCriado(nome: string) {
    setCatalogoNomes(prev => [...prev, nome])
    set('tarefas_personalizadas', [...form.tarefas_personalizadas, nome])
    setNovaTarefa('')
    setNomeParaCriar(null)
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    if (form.setores.length === 0) {
      setErro('Selecione ao menos um setor.')
      return
    }
    setSaving(true)
    setErro(null)

    const mit = form.municipio && form.uf
      ? `${form.municipio}/${form.uf}`
      : form.municipio || null

    // form.setores nunca chega vazio aqui (bloqueado acima). Um fallback
    // silencioso para 'fiscal' foi removido: ele reintroduzia o cliente
    // "fantasma" sempre que Fiscal era o único setor marcado (caso comum,
    // já que Fiscal é o setor padrão de clientes legados) — desmarcá-lo
    // esvaziava o array e o fallback recolocava 'fiscal' sem o usuário notar.
    const setoresEfetivos = form.setores

    const clientePayload = {
      nome:         form.nome,
      cnpj:         form.cnpj || null,
      municipio:    form.municipio || null,
      uf:           form.uf || null,
      mit,
      contato_chat: form.contato_chat || null,
      setores:      setoresEfetivos,
      tarefas_vinculadas_ativas: form.vinculosAtivos,
    }

    const fiscalPayload = {
      cod:                    form.cod || null,
      regime:                 form.regime || null,
      atividade:              form.atividade,
      grupo:                  form.grupo || null,
      responsavel:            form.responsavel || null,
      prioridade:             form.prioridade,
      declaracao_anual:       form.declaracao_anual,
      envia_iss:              form.envia_iss,
      confere_siga:           form.confere_siga,
      faz_dossie:             form.faz_dossie,
      login_iss:              form.envia_iss ? form.login_iss || null : null,
      senha_iss:              form.envia_iss ? form.senha_iss || null : null,
      email_envio_iss:        form.envia_iss ? form.email_envio_iss || null : null,
      tarefas_personalizadas: form.tarefas_personalizadas,
      tarefas_excluidas:      form.tarefas_excluidas,
    }

    if (isEdit) {
      // O bloco Fiscal é somente-leitura ao editar (edição fica exclusiva de
      // /fiscal/clientes) — não sobrescrevemos uma linha clientes_fiscal
      // já existente. Mas se o setor Fiscal acabou de ser marcado num
      // cliente que nunca teve linha em clientes_fiscal, provisionamos uma
      // com os valores atuais do form (defaults, já que o bloco nunca foi
      // editável aqui) — sem isso o cliente fica invisível em toda tela do
      // Fiscal, que só lista quem tem clientes_fiscal.
      const { error } = await sb.from('clientes').update(clientePayload).eq('id', clienteId)
      if (error) {
        setSaving(false)
        setErro(error.message)
        return
      }
      if (setoresEfetivos.includes('fiscal')) {
        const { data: existente } = await sb.from('clientes_fiscal').select('cliente_id').eq('cliente_id', clienteId).maybeSingle()
        if (!existente) {
          const { error: errFiscal } = await sb.from('clientes_fiscal').insert({ cliente_id: clienteId, ...fiscalPayload })
          if (errFiscal) {
            setSaving(false)
            setErro(errFiscal.message)
            return
          }
        }
      } else {
        // Setor Fiscal desmarcado: remove a linha em clientes_fiscal para
        // que o cliente saia de /fiscal/clientes, que usa inner join.
        const { error: errRemoveFiscal } = await sb.from('clientes_fiscal').delete().eq('cliente_id', clienteId)
        if (errRemoveFiscal) {
          setSaving(false)
          setErro(errRemoveFiscal.message)
          return
        }
      }
      // Mesmo raciocínio do bloco Fiscal acima: se o setor Contábil acabou
      // de ser marcado num cliente que nunca teve linha em clientes_contabil,
      // provisiona uma com as tarefas padrão do setor — sem isso o cliente
      // fica invisível em /contabil/clientes, que também usa inner join.
      if (setoresEfetivos.includes('contabil')) {
        const { data: existenteContabil } = await sb.from('clientes_contabil').select('cliente_id').eq('cliente_id', clienteId).maybeSingle()
        if (!existenteContabil) {
          const { data: tiposContabil } = await sb.from('tarefa_tipos').select('nome').eq('setor', 'contabil').eq('padrao', true).order('nome')
          const { error: errContabil } = await sb.from('clientes_contabil').insert({
            cliente_id: clienteId,
            tarefas_personalizadas: (tiposContabil ?? []).map(t => t.nome),
          })
          if (errContabil) {
            setSaving(false)
            setErro(errContabil.message)
            return
          }
        }
      } else {
        // Setor Contábil desmarcado: remove a linha em clientes_contabil para
        // que o cliente saia de /contabil/clientes, que usa inner join.
        const { error: errRemoveContabil } = await sb.from('clientes_contabil').delete().eq('cliente_id', clienteId)
        if (errRemoveContabil) {
          setSaving(false)
          setErro(errRemoveContabil.message)
          return
        }
      }
      // Mesmo raciocínio dos blocos Fiscal/Contábil acima: se o setor
      // Pessoal acabou de ser marcado num cliente que nunca teve linha em
      // clientes_pessoal, provisiona uma com as tarefas padrão do setor —
      // sem isso o cliente fica invisível em /pessoal/clientes, que também
      // usa inner join.
      if (setoresEfetivos.includes('pessoal')) {
        const { data: existentePessoal } = await sb.from('clientes_pessoal').select('cliente_id').eq('cliente_id', clienteId).maybeSingle()
        if (!existentePessoal) {
          const { data: tiposPessoal } = await sb.from('tarefa_tipos').select('nome').eq('setor', 'pessoal').eq('padrao', true).order('nome')
          const { error: errPessoal } = await sb.from('clientes_pessoal').insert({
            cliente_id: clienteId,
            tarefas_personalizadas: (tiposPessoal ?? []).map(t => t.nome),
          })
          if (errPessoal) {
            setSaving(false)
            setErro(errPessoal.message)
            return
          }
        }
      } else {
        // Setor Pessoal desmarcado: remove a linha em clientes_pessoal para
        // que o cliente saia de /pessoal/clientes, que usa inner join.
        const { error: errRemovePessoal } = await sb.from('clientes_pessoal').delete().eq('cliente_id', clienteId)
        if (errRemovePessoal) {
          setSaving(false)
          setErro(errRemovePessoal.message)
          return
        }
      }
      setSaving(false)
    } else {
      const { data: novoCliente, error: errCliente } = await sb.from('clientes').insert(clientePayload).select('id').single()
      if (errCliente || !novoCliente) {
        setSaving(false)
        setErro(errCliente?.message ?? 'Falha ao criar cliente')
        return
      }
      if (setoresEfetivos.includes('fiscal')) {
        const { error: errFiscal } = await sb.from('clientes_fiscal').insert({ cliente_id: novoCliente.id, ...fiscalPayload })
        if (errFiscal) {
          setSaving(false)
          setErro(errFiscal.message)
          return
        }
      }
      if (setoresEfetivos.includes('contabil')) {
        const { data: tiposContabil } = await sb.from('tarefa_tipos').select('nome').eq('setor', 'contabil').eq('padrao', true).order('nome')
        const { error: errContabil } = await sb.from('clientes_contabil').insert({
          cliente_id: novoCliente.id,
          tarefas_personalizadas: (tiposContabil ?? []).map(t => t.nome),
        })
        if (errContabil) {
          setSaving(false)
          setErro(errContabil.message)
          return
        }
      }
      if (setoresEfetivos.includes('pessoal')) {
        const { data: tiposPessoal } = await sb.from('tarefa_tipos').select('nome').eq('setor', 'pessoal').eq('padrao', true).order('nome')
        const { error: errPessoal } = await sb.from('clientes_pessoal').insert({
          cliente_id: novoCliente.id,
          tarefas_personalizadas: (tiposPessoal ?? []).map(t => t.nome),
        })
        if (errPessoal) {
          setSaving(false)
          setErro(errPessoal.message)
          return
        }
      }
      setSaving(false)
    }

    router.refresh()
    onClose()
  }

  async function handleExcluir() {
    if (!clienteId) return
    if (!confirm(`Excluir "${form.nome}" do sistema? Essa ação não pode ser desfeita e remove o cliente de todos os setores (tarefas, arquivos e parcelamentos vinculados a ele também são apagados).`)) return
    setExcluindo(true)
    setErro(null)
    const { error } = await excluirClienteGeral(clienteId)
    if (error) {
      setExcluindo(false)
      setErro(error)
      return
    }
    router.refresh()
    onClose()
  }

  const mostraFiscal = form.setores.includes('fiscal')

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">{readOnly ? 'Visualizar Cliente' : isEdit ? 'Editar Cliente' : 'Novo Cliente'}</h2>
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
              <label className={labelCls}>Setores</label>
              <div className="grid grid-cols-2 gap-2">
                {SETORES.map(setor => (
                  <label key={setor} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={form.setores.includes(setor)} onChange={() => toggleSetor(setor)}
                      className="w-3.5 h-3.5 accent-[var(--accent)]" disabled={readOnly} />
                    <span className="text-[var(--fg)]/60 text-xs">{SETOR_LABEL[setor]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-4">
              <label className="flex items-center gap-2 cursor-pointer select-none mb-1">
                <input type="checkbox" checked={mostrarVinculos}
                  onChange={e => { setMostrarVinculos(e.target.checked); if (!e.target.checked) set('vinculosAtivos', []) }}
                  className="w-3.5 h-3.5 accent-[var(--accent)]" disabled={readOnly} />
                <span className={labelCls + ' mb-0'}>Este cliente possui tarefas vinculadas entre setores?</span>
              </label>

              {mostrarVinculos && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {vinculosCatalogo
                    .filter(v => form.setores.includes(v.setor_origem) && form.setores.includes(v.setor_destino))
                    .map(v => (
                      <label key={v.id} className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={form.vinculosAtivos.includes(v.id)}
                          onChange={() => set('vinculosAtivos',
                            form.vinculosAtivos.includes(v.id)
                              ? form.vinculosAtivos.filter(id => id !== v.id)
                              : [...form.vinculosAtivos, v.id])}
                          className="w-3.5 h-3.5 accent-[var(--accent)]" disabled={readOnly} />
                        <span className="text-[var(--fg)]/70 text-xs">
                          {v.tipo_origem} ({SETOR_LABEL[v.setor_origem]}) → {v.tipo_destino} ({SETOR_LABEL[v.setor_destino]})
                        </span>
                      </label>
                    ))}
                  {vinculosCatalogo.filter(v => form.setores.includes(v.setor_origem) && form.setores.includes(v.setor_destino)).length === 0 && (
                    <p className="text-[var(--fg)]/30 text-xs">Nenhum vínculo do catálogo se aplica aos setores marcados acima.</p>
                  )}
                </div>
              )}
            </div>

            {mostraFiscal && isEdit && (
              <SectorSection title="Dados do Fiscal" note="Somente leitura — edite em Fiscal → Clientes" defaultOpen={false}>
                <CamposFiscais
                  form={form}
                  set={set as <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void}
                  responsaveis={responsaveis}
                  catalogo={catalogoFiscal}
                  isEdit={isEdit}
                  readOnly={true}
                  novaTarefa={novaTarefa}
                  setNovaTarefa={setNovaTarefa}
                  addTarefa={addTarefa}
                />
              </SectorSection>
            )}

            {mostraFiscal && !isEdit && (
              <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/3 p-4 space-y-5">
                <p className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest">Dados do Fiscal</p>
                <CamposFiscais
                  form={form}
                  set={set as <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void}
                  responsaveis={responsaveis}
                  catalogo={catalogoFiscal}
                  isEdit={isEdit}
                  readOnly={readOnly}
                  novaTarefa={novaTarefa}
                  setNovaTarefa={setNovaTarefa}
                  addTarefa={addTarefa}
                />
              </div>
            )}

          </>)}
        </div>

        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          {!readOnly && isEdit ? (
            <button onClick={handleExcluir} disabled={excluindo}
              className="px-4 py-2.5 rounded-xl text-red-400/70 hover:text-red-400 text-sm transition-colors disabled:opacity-50">
              {excluindo ? 'Excluindo...' : 'Excluir cliente'}
            </button>
          ) : <span />}

          <div className="flex gap-3">
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
              <button onClick={handleSave} disabled={saving || !form.nome.trim() || form.setores.length === 0}
                className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar cliente'}
              </button>
            </>)}
          </div>
        </div>
      </div>
    </div>
    {nomeParaCriar && (
      <NovoTipoTarefaModal
        nome={nomeParaCriar}
        setor="fiscal"
        onCancel={() => setNomeParaCriar(null)}
        onCriado={handleTipoCriado}
      />
    )}
    </>
  )
}
