'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMesAno } from '@/lib/mes-atual-context'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { StatusParcelamento } from '@/lib/parcelamentos-aviso'
import { criarSecaoParcelamento } from '@/lib/parcelamento-secoes-actions'
import { montarUpdateParcelamento } from '@/lib/parcelamento-campos'
import {
  MESES_ABREV, MESES_COLS, SETORES_PARCELAMENTO, TODOS,
  agruparPorSecao, filtrarParcelamentos, secoesParaMostrar, subtituloContagem,
  type Parcelamento, type SecaoParcelamento,
} from '@/lib/parcelamentos-tela'
import { montarRelatorioHtml } from '@/lib/parcelamentos-relatorio'
import GerenciarSecoesModal from '@/components/fiscal/GerenciarSecoesModal'
import { Pagina } from '@/components/ui/Pagina'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import ParcelamentosCabecalho from '@/components/fiscal/parcelamentos/ParcelamentosCabecalho'
import ParcelamentosConteudo from '@/components/fiscal/parcelamentos/ParcelamentosConteudo'

const EMPTY_FORM: Omit<Parcelamento, 'id'> = {
  secao: '', empresa: '', empresa_avulsa: false, cnpj: '', regime: '', responsavel: '',
  local_tipo: '', status: 'EM ANDAMENTO', setores: [], tarefa: '', senhas: '',
  jan: null, fev: null, mar: null, abr: null, mai: null, jun: null,
  jul: null, ago: null, set: null, out: null, nov: null, dez: null,
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function ParcelamentosPage() {
  const [items, setItems] = useState<Parcelamento[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useFiltroPersistente('parcelamentos:busca', '')
  const [secaoFiltro, setSecaoFiltro] = useFiltroPersistente('parcelamentos:secao', TODOS)
  const [respFiltro, setRespFiltro] = useFiltroPersistente('parcelamentos:responsavel', TODOS)
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
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

  const { ano, mes } = useMesAno()
  const confirmar = useConfirmar()

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
    const ok = await confirmar({
      titulo: 'Excluir parcelamento?',
      descricao: `Excluir parcelamento de "${nome}"?`,
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    await sb.from('parcelamentos').delete().eq('id', id)
    setItems(prev => prev.filter(p => p.id !== id))
    if (selecionadoId === id) setSelecionadoId(null)
  }

  async function handleSave() {
    setSaving(true)
    if (editItem) {
      // Vinculado a cliente: meses sao somente leitura na UI (preenchidos
      // pela tarefa na ficha do cliente) — nao reenviar, senao o save do
      // admin sobrescreve com o valor capturado na abertura do modal e
      // desfaz o que a ficha gravou enquanto o modal estava aberto. Avulso:
      // nunca tem tarefa (cnpj null nunca resolve cliente_id), entao os
      // meses sao editados aqui e entram no update normalmente. Usa
      // form.empresa_avulsa (valor ao vivo, editavel no modal) e nao
      // editItem.empresa_avulsa (valor obsoleto capturado na abertura do
      // modal) — senao alternar o checkbox durante a edicao de um vinculado
      // e digitar meses faz o save descartar esses meses silenciosamente.
      const payload = montarUpdateParcelamento(form, form.empresa_avulsa)
      await sb.from('parcelamentos').update(payload).eq('id', editItem.id)
    } else {
      // Mesmo filtro do update (ver comentario acima): sem isso, marcar
      // "Empresa Avulsa", digitar meses e desmarcar antes de salvar criaria
      // um parcelamento vinculado ja com meses preenchidos, que
      // sincronizarTarefasParcelamento tentaria depois sobrescrever. No caso
      // comum (avulso permanece marcado) e um no-op, ja que
      // montarUpdateParcelamento retorna o form inalterado quando
      // empresaAvulsa e true.
      await sb.from('parcelamentos').insert(montarUpdateParcelamento(form, form.empresa_avulsa))
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

  const filtered = filtrarParcelamentos(items, { busca: search, secao: secaoFiltro, responsavel: respFiltro })
  const grupos = agruparPorSecao(filtered, secoesParaMostrar(secoes, secaoFiltro))

  function imprimir() {
    const agora = new Date().toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })
    const html = montarRelatorioHtml({ filtered, secoes, secaoFiltro, respFiltro, search, ano, agora })
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  return (
    <Pagina>
      <ParcelamentosCabecalho
        ano={ano}
        subtitulo={loading ? 'Carregando...' : subtituloContagem(grupos.reduce((n, g) => n + g.itens.length, 0), grupos.length)}
        busca={search}
        onBusca={setSearch}
        secaoFiltro={secaoFiltro}
        onSecao={setSecaoFiltro}
        respFiltro={respFiltro}
        onResp={setRespFiltro}
        secoes={secoes}
        responsaveis={responsaveis}
        mostrarResponsavel={isAdmin}
        onImprimir={imprimir}
        onNovo={openCreate}
      />

      {!loading && (
        <ParcelamentosConteudo
          grupos={grupos}
          selecionadoId={selecionadoId}
          mesAtual={mes}
          onSelecionar={setSelecionadoId}
          onEditar={openEdit}
          onExcluir={p => handleDelete(p.id, p.empresa)}
        />
      )}

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
                      className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 whitespace-nowrap">
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
                        setF('responsavel', cliente?.responsavel ?? null)
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
                    disabled={!form.empresa_avulsa && clientesCadastrados.some(c => c.nome === form.empresa)}
                    title="Segue o responsável do cliente"
                    className={inputCls + ' bg-[var(--bg-surface)] disabled:opacity-60'}>
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
                    // Editando (avulso): mostra o que foi digitado (form).
                    // Somente leitura (nao avulso): mostra o valor persistido
                    // (editItem), nao o digitado — se o usuario marcou "Empresa
                    // Avulsa", digitou meses e desmarcou de novo antes de
                    // salvar, o save (montarUpdateParcelamento) descarta esses
                    // meses, entao a tela nao deve sugerir que eles foram
                    // salvos. form[mes] continua intacto (nao e limpo aqui),
                    // entao remarcar a caixa traz o digitado de volta.
                    const valor = form.empresa_avulsa ? form[mes] : (editItem?.[mes] ?? null)
                    return (
                      <div key={mes}>
                        <p className="text-[var(--fg)]/30 text-[10px] text-center mb-1">{MESES_ABREV[i]}</p>
                        {form.empresa_avulsa ? (
                          <input
                            value={valor ?? ''}
                            onChange={e => setF(mes, e.target.value || null)}
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
                className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
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
    </Pagina>
  )
}
