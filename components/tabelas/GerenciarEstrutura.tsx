'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  adicionarColuna, renomearColuna, moverColuna, preVisualizarExclusaoColuna, excluirColuna,
  preVisualizarTrocaTipo, trocarTipoColuna, renomearTabela, excluirTabela,
} from '@/lib/tabelas-estrutura-actions'
import { TIPOS_COLUNA, opcoesDosValores, type TipoColuna, type OpcaoColuna } from '@/lib/tabelas/tipos'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'
import type { ValorConvertido } from '@/lib/tabelas/trocar-tipo'

const ROTULO_TIPO: Record<TipoColuna, string> = {
  texto: 'Texto', numero: 'Número', data: 'Data', opcoes: 'Lista de opções', cliente: 'Cliente',
}
const TIPOS_TROCAVEIS = TIPOS_COLUNA.filter(t => t !== 'cliente')

interface ColunaResumo { id: string; nome: string; tipo: TipoColuna }
interface Props { planilhaId: string; nome: string; setor: SetorTabela; colunas: ColunaResumo[] }

const inputCls = 'px-2 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50'
const btnCls = 'px-3 py-1.5 rounded-lg border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-xs'

export default function GerenciarEstrutura({ planilhaId, nome, setor, colunas }: Props) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [nomeTabela, setNomeTabela] = useState(nome)
  const [novoNome, setNovoNome] = useState('')
  const [novoTipo, setNovoTipo] = useState<TipoColuna>('texto')
  const [novasOpcoesTexto, setNovasOpcoesTexto] = useState('')

  const [colunaExcluindo, setColunaExcluindo] = useState<ColunaResumo | null>(null)
  const [previaExclusao, setPreviaExclusao] = useState<{ total: number; preenchidas: number } | null>(null)

  const [colunaTrocando, setColunaTrocando] = useState<ColunaResumo | null>(null)
  const [tipoAlvo, setTipoAlvo] = useState<TipoColuna>('texto')
  const [opcoesAlvoTexto, setOpcoesAlvoTexto] = useState('')
  const [previaTroca, setPreviaTroca] = useState<{ convertidas: number; naoConvertidas: number; valores: ValorConvertido[] } | null>(null)

  const [confirmandoExclusaoTabela, setConfirmandoExclusaoTabela] = useState(false)
  const [nomeDigitado, setNomeDigitado] = useState('')

  function fechar() {
    setAberto(false)
    setErro(null)
    setColunaExcluindo(null)
    setPreviaExclusao(null)
    setColunaTrocando(null)
    setPreviaTroca(null)
    setConfirmandoExclusaoTabela(false)
    setNomeDigitado('')
  }

  function parseOpcoes(texto: string): OpcaoColuna[] {
    const valores = texto.split('\n').map(v => v.trim()).filter(v => v !== '')
    return opcoesDosValores(valores)
  }

  async function salvarNomeTabela() {
    if (nomeTabela.trim() === nome || nomeTabela.trim() === '') { setNomeTabela(nome); return }
    setErro(null)
    setOcupado(true)
    try {
      const { error } = await renomearTabela({ planilhaId, nome: nomeTabela })
      if (error) { setErro(error); setNomeTabela(nome); return }
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function salvarNomeColuna(coluna: ColunaResumo, nomeNovo: string) {
    if (nomeNovo.trim() === coluna.nome || nomeNovo.trim() === '') return
    setErro(null)
    setOcupado(true)
    try {
      const { error } = await renomearColuna({ colunaId: coluna.id, nome: nomeNovo })
      if (error) { setErro(error); return }
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function mover(coluna: ColunaResumo, direcao: 'cima' | 'baixo') {
    setErro(null)
    setOcupado(true)
    try {
      const { error } = await moverColuna({ colunaId: coluna.id, direcao })
      if (error) { setErro(error); return }
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function adicionar() {
    const nomeValido = novoNome.trim()
    if (nomeValido === '') { setErro('Digite um nome pra coluna nova.'); return }
    setErro(null)
    setOcupado(true)
    try {
      const opcoes = novoTipo === 'opcoes' ? parseOpcoes(novasOpcoesTexto) : null
      const { error } = await adicionarColuna({ planilhaId, nome: nomeValido, tipo: novoTipo, opcoes })
      if (error) { setErro(error); return }
      setNovoNome(''); setNovoTipo('texto'); setNovasOpcoesTexto('')
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function abrirExclusaoColuna(coluna: ColunaResumo) {
    setErro(null)
    setColunaExcluindo(coluna)
    setPreviaExclusao(null)
    const { error, total, preenchidas } = await preVisualizarExclusaoColuna(coluna.id)
    if (error) { setErro(error); setColunaExcluindo(null); return }
    setPreviaExclusao({ total: total ?? 0, preenchidas: preenchidas ?? 0 })
  }

  async function confirmarExclusaoColuna() {
    if (!colunaExcluindo) return
    setOcupado(true)
    try {
      const { error } = await excluirColuna(colunaExcluindo.id)
      if (error) { setErro(error); return }
      setColunaExcluindo(null)
      setPreviaExclusao(null)
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function abrirTrocaTipo(coluna: ColunaResumo) {
    setErro(null)
    setColunaTrocando(coluna)
    setTipoAlvo(coluna.tipo === 'cliente' ? 'texto' : coluna.tipo)
    setOpcoesAlvoTexto('')
    setPreviaTroca(null)
  }

  async function calcularPreviaTroca() {
    if (!colunaTrocando) return
    setErro(null)
    setOcupado(true)
    try {
      const opcoesNovas = tipoAlvo === 'opcoes' ? parseOpcoes(opcoesAlvoTexto) : null
      const { error, convertidas, naoConvertidas, valores } = await preVisualizarTrocaTipo({
        colunaId: colunaTrocando.id, tipoNovo: tipoAlvo, opcoesNovas,
      })
      if (error) { setErro(error); return }
      setPreviaTroca({ convertidas: convertidas ?? 0, naoConvertidas: naoConvertidas ?? 0, valores: valores ?? [] })
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarTrocaTipo() {
    if (!colunaTrocando || !previaTroca) return
    setOcupado(true)
    try {
      const opcoesNovas = tipoAlvo === 'opcoes' ? parseOpcoes(opcoesAlvoTexto) : null
      const { error } = await trocarTipoColuna({
        colunaId: colunaTrocando.id, tipoNovo: tipoAlvo, opcoesNovas, valores: previaTroca.valores,
      })
      if (error) { setErro(error); return }
      setColunaTrocando(null)
      setPreviaTroca(null)
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarExclusaoTabela() {
    setOcupado(true)
    try {
      const { error } = await excluirTabela({ planilhaId, nomeConfirmacao: nomeDigitado })
      if (error) { setErro(error); return }
      router.push(`/${setor}/tabelas`)
    } finally {
      setOcupado(false)
    }
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className={btnCls}>Gerenciar colunas</button>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && fechar()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Gerenciar colunas</h2>
          <button onClick={fechar} className="text-[var(--fg)]/30 hover:text-[var(--fg)] text-xl px-1">×</button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {erro && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{erro}</div>}

          <div>
            <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">Nome da tabela</label>
            <input className={`${inputCls} w-full`} value={nomeTabela} maxLength={120}
              onChange={e => setNomeTabela(e.target.value)} onBlur={salvarNomeTabela} disabled={ocupado} />
          </div>

          <div className="rounded-xl border border-[var(--fg)]/12 divide-y divide-[var(--fg)]/8">
            {colunas.map((c, i) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <input className={`${inputCls} flex-1 min-w-[8rem]`} defaultValue={c.nome} maxLength={120}
                  onBlur={e => salvarNomeColuna(c, e.target.value)} disabled={ocupado} />
                <span className="text-xs text-[var(--fg)]/50 min-w-[5rem]">{ROTULO_TIPO[c.tipo]}</span>
                <button className={btnCls} disabled={ocupado || i === 0} onClick={() => mover(c, 'cima')}>↑</button>
                <button className={btnCls} disabled={ocupado || i === colunas.length - 1} onClick={() => mover(c, 'baixo')}>↓</button>
                {c.tipo !== 'cliente' && (
                  <button className={btnCls} disabled={ocupado} onClick={() => abrirTrocaTipo(c)}>Trocar tipo</button>
                )}
                <button className={`${btnCls} text-red-400 border-red-500/20 hover:text-red-300`} disabled={ocupado}
                  onClick={() => abrirExclusaoColuna(c)}>Excluir</button>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[var(--fg)]/12 p-4 space-y-2">
            <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest">Adicionar coluna</label>
            <div className="flex flex-wrap gap-2">
              <input className={`${inputCls} flex-1 min-w-[10rem]`} placeholder="Nome da coluna" value={novoNome}
                maxLength={120} onChange={e => setNovoNome(e.target.value)} />
              <select className={inputCls} value={novoTipo} onChange={e => setNovoTipo(e.target.value as TipoColuna)}>
                {TIPOS_COLUNA.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
              </select>
              <button className={btnCls} disabled={ocupado} onClick={adicionar}>Adicionar</button>
            </div>
            {novoTipo === 'opcoes' && (
              <textarea className={`${inputCls} w-full`} rows={3} placeholder="Uma opção por linha"
                value={novasOpcoesTexto} onChange={e => setNovasOpcoesTexto(e.target.value)} />
            )}
          </div>

          {colunaExcluindo && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-2">
              <p className="text-sm text-[var(--fg)]">Excluir a coluna &quot;{colunaExcluindo.nome}&quot;?</p>
              {previaExclusao
                ? <p className="text-xs text-[var(--fg)]/60">{previaExclusao.preenchidas} de {previaExclusao.total} linhas têm valor nessa coluna. Isso não pode ser desfeito.</p>
                : <p className="text-xs text-[var(--fg)]/40">Calculando impacto…</p>}
              <div className="flex gap-2">
                <button className={`${btnCls} text-red-400 border-red-500/30`} disabled={ocupado || !previaExclusao}
                  onClick={confirmarExclusaoColuna}>Confirmar exclusão</button>
                <button className={btnCls} disabled={ocupado} onClick={() => { setColunaExcluindo(null); setPreviaExclusao(null) }}>Cancelar</button>
              </div>
            </div>
          )}

          {colunaTrocando && (
            <div className="rounded-xl border border-[var(--fg)]/12 p-4 space-y-2">
              <p className="text-sm text-[var(--fg)]">Trocar o tipo de &quot;{colunaTrocando.nome}&quot;</p>
              <div className="flex flex-wrap gap-2 items-center">
                <select className={inputCls} value={tipoAlvo}
                  onChange={e => { setTipoAlvo(e.target.value as TipoColuna); setPreviaTroca(null) }}>
                  {TIPOS_TROCAVEIS.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                </select>
                <button className={btnCls} disabled={ocupado} onClick={calcularPreviaTroca}>Calcular</button>
              </div>
              {tipoAlvo === 'opcoes' && (
                <textarea className={`${inputCls} w-full`} rows={3} placeholder="Uma opção por linha"
                  value={opcoesAlvoTexto} onChange={e => { setOpcoesAlvoTexto(e.target.value); setPreviaTroca(null) }} />
              )}
              {previaTroca && (
                <p className="text-xs text-[var(--fg)]/60">
                  {previaTroca.convertidas} célula(s) convertem. {previaTroca.naoConvertidas > 0
                    ? `${previaTroca.naoConvertidas} não convertem e ficam como estão (o valor original não é apagado).`
                    : ''}
                </p>
              )}
              <div className="flex gap-2">
                <button className={btnCls} disabled={ocupado || !previaTroca} onClick={confirmarTrocaTipo}>Confirmar troca</button>
                <button className={btnCls} disabled={ocupado} onClick={() => { setColunaTrocando(null); setPreviaTroca(null) }}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-red-500/30 p-4">
            {!confirmandoExclusaoTabela ? (
              <button className={`${btnCls} text-red-400 border-red-500/30`} onClick={() => setConfirmandoExclusaoTabela(true)}>
                Excluir tabela
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-[var(--fg)]">Isso apaga a tabela &quot;{nome}&quot; e todas as linhas dela, sem volta. Digite o nome exato pra confirmar:</p>
                <input className={`${inputCls} w-full`} value={nomeDigitado} onChange={e => setNomeDigitado(e.target.value)} />
                <div className="flex gap-2">
                  <button className={`${btnCls} text-red-400 border-red-500/30`}
                    disabled={ocupado || nomeDigitado.trim() !== nome} onClick={confirmarExclusaoTabela}>
                    Excluir definitivamente
                  </button>
                  <button className={btnCls} disabled={ocupado} onClick={() => { setConfirmandoExclusaoTabela(false); setNomeDigitado('') }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
