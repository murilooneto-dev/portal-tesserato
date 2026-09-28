'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { lerPlanilha, type PlanilhaLida } from '@/lib/tabelas/parse-planilha'
import { detectarTipoColuna, type TipoColuna, type OpcaoColuna, type ValorCelula } from '@/lib/tabelas/tipos'
import { agruparValoresCliente, type ClienteMatch } from '@/lib/tabelas/cliente-match'
import { casarColunas } from '@/lib/tabelas/reenvio'
import { adicionarColuna } from '@/lib/tabelas-estrutura-actions'
import { preVisualizarReenvio, aplicarReenvio, type PreviaReenvio } from '@/lib/tabelas-reenvio-actions'
import { LIMITE_BYTES_PAYLOAD, type SetorTabela } from '@/lib/tabelas/montar-payload'

interface ColunaTabela { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }
interface Props {
  planilhaId: string
  setor: SetorTabela
  colunas: ColunaTabela[]
  temColunaChave: boolean
  clientes: ClienteMatch[]
}

const inputCls = 'px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50'
const btnCls = 'px-3 py-1.5 rounded-lg border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-xs'

export default function ReenviarPlanilhaWizard({ planilhaId, setor, colunas, temColunaChave, clientes }: Props) {
  void setor // reservado para uso futuro; o setor da tabela é sempre revalidado no servidor
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [planilha, setPlanilha] = useState<PlanilhaLida | null>(null)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [colunasNovasMarcadas, setColunasNovasMarcadas] = useState<Set<string>>(new Set())
  const [escolhasCliente, setEscolhasCliente] = useState<Record<string, string | null>>({})
  const [previa, setPrevia] = useState<PreviaReenvio | null>(null)
  const [resolucoes, setResolucoes] = useState<Record<string, 'sistema' | 'planilha'>>({})
  const [processando, setProcessando] = useState(false)

  const casamento = useMemo(() => {
    if (!planilha) return null
    return casarColunas(planilha.cabecalhos, colunas)
  }, [planilha, colunas])

  const colCliente = colunas.find(c => c.tipo === 'cliente') ?? null
  const indiceColCliente = casamento?.casadas.find(c => c.id === colCliente?.id)?.indiceOrigem ?? null

  const grupos = useMemo(() => {
    if (!planilha || indiceColCliente === null) return []
    return agruparValoresCliente(planilha.linhas.map(l => l[indiceColCliente]), clientes)
  }, [planilha, indiceColCliente, clientes])

  function clienteDoValor(valor: string): string | null {
    if (valor in escolhasCliente) return escolhasCliente[valor]
    return grupos.find(g => g.valor === valor)?.match.clienteId ?? null
  }

  async function aoEscolherArquivo(f: File | undefined) {
    if (!f) return
    try {
      const buf = await f.arrayBuffer()
      const p = lerPlanilha(buf)
      if (p.linhas.length === 0) throw new Error('Não há linhas de dados abaixo do cabeçalho.')
      setPlanilha(p)
      setColunasNovasMarcadas(new Set())
      setEscolhasCliente({})
      setPrevia(null)
      setResolucoes({})
      setErroLeitura(null)
      setErro(null)
    } catch (e) {
      setPlanilha(null)
      setErroLeitura(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.')
    }
  }

  function montarClientePorLinha(): (string | null)[] {
    if (!planilha || indiceColCliente === null) return planilha ? planilha.linhas.map(() => null) : []
    return planilha.linhas.map(l => {
      const v = l[indiceColCliente]
      return v === null ? null : clienteDoValor(String(v).trim())
    })
  }

  async function calcularPrevia() {
    if (!planilha || !casamento) return
    setErro(null)
    setProcessando(true)
    try {
      // Cria as colunas marcadas ANTES de calcular a prévia: depois de
      // criadas, casarColunas vai casá-las normalmente na próxima chamada
      // (feita pela Server Action, que relê as colunas do banco).
      for (const nome of colunasNovasMarcadas) {
        const naoReconhecida = casamento.naoReconhecidas.find(n => n.nome === nome)
        if (!naoReconhecida) continue
        const valores = planilha.linhas.map(l => l[naoReconhecida.indiceOrigem])
        const det = detectarTipoColuna(valores)
        const opcoes = det.tipo === 'opcoes' ? det.opcoes ?? null : null
        const { error } = await adicionarColuna({ planilhaId, nome, tipo: det.tipo, opcoes })
        if (error) { setErro(`Não foi possível criar a coluna "${nome}": ${error}`); return }
      }

      const entrada = {
        planilhaId,
        cabecalhos: planilha.cabecalhos,
        linhas: planilha.linhas as ValorCelula[][],
        clientePorLinha: montarClientePorLinha(),
      }
      const tamanho = JSON.stringify(entrada).length
      if (tamanho > LIMITE_BYTES_PAYLOAD) {
        const mb = (tamanho / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
        setErro(`O arquivo é grande demais para reenviar de uma vez (~${mb} MB).`)
        return
      }
      try {
        const { error, previa: p } = await preVisualizarReenvio(entrada)
        if (error || !p) { setErro(error ?? 'Não foi possível calcular a prévia.'); return }
        setPrevia(p)
        setResolucoes({})
      } catch {
        setErro('Não foi possível calcular a prévia.')
      }
    } finally {
      setProcessando(false)
    }
  }

  function aplicarResolucaoATodas(valor: 'sistema' | 'planilha') {
    if (!previa) return
    const novo: Record<string, 'sistema' | 'planilha'> = {}
    for (const c of previa.comConflito) novo[c.linhaId] = valor
    setResolucoes(novo)
  }

  async function confirmar() {
    if (!planilha) return
    setErro(null)
    setProcessando(true)
    try {
      const entrada = {
        planilhaId,
        cabecalhos: planilha.cabecalhos,
        linhas: planilha.linhas as ValorCelula[][],
        clientePorLinha: montarClientePorLinha(),
      }
      const tamanho = JSON.stringify(entrada).length
      if (tamanho > LIMITE_BYTES_PAYLOAD) {
        const mb = (tamanho / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
        setErro(`O arquivo é grande demais para reenviar de uma vez (~${mb} MB).`)
        return
      }
      try {
        const { error } = await aplicarReenvio(entrada, resolucoes)
        if (error) { setErro(error); return }
        fechar()
        router.refresh()
      } catch {
        setErro('Não foi possível aplicar o reenvio.')
      }
    } finally {
      setProcessando(false)
    }
  }

  function fechar() {
    setAberto(false)
    setPlanilha(null)
    setErroLeitura(null)
    setErro(null)
    setPrevia(null)
    setResolucoes({})
  }

  if (!aberto) {
    return (
      <button onClick={() => temColunaChave && setAberto(true)} disabled={!temColunaChave}
        className={`${btnCls} disabled:opacity-40 disabled:cursor-not-allowed`}
        title={temColunaChave ? undefined : 'Esta tabela não tem uma coluna-chave definida. Defina uma coluna-chave na criação para poder reenviar.'}>
        Atualizar com planilha
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && !processando && fechar()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Atualizar com planilha</h2>
          <button onClick={fechar} disabled={processando} className="text-[var(--fg)]/30 hover:text-[var(--fg)] text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">Arquivo (.xlsx ou .csv)</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => aoEscolherArquivo(e.target.files?.[0])} className="text-sm text-[var(--fg)]/70" />
          </div>

          {erroLeitura && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">⚠ {erroLeitura}</div>}
          {erro && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">⚠ {erro}</div>}

          {planilha && casamento && !previa && (<>
            <p className="text-xs text-[var(--fg)]/50">{planilha.linhas.length.toLocaleString('pt-BR')} linhas · {casamento.casadas.length} coluna(s) reconhecida(s).</p>

            {casamento.naoReconhecidas.length > 0 && (
              <div className="rounded-xl border border-[var(--fg)]/12 p-4 space-y-2">
                <p className="text-xs font-bold text-[var(--fg)]/40 uppercase tracking-widest">Colunas não reconhecidas</p>
                {casamento.naoReconhecidas.map(n => (
                  <label key={n.nome} className="flex items-center gap-2 text-sm text-[var(--fg)]">
                    <input type="checkbox" checked={colunasNovasMarcadas.has(n.nome)}
                      onChange={e => setColunasNovasMarcadas(s => {
                        const novo = new Set(s)
                        if (e.target.checked) novo.add(n.nome); else novo.delete(n.nome)
                        return novo
                      })} className="accent-[var(--accent)]" />
                    {n.nome} <span className="text-[var(--fg)]/40 text-xs">— criar como coluna nova</span>
                  </label>
                ))}
              </div>
            )}

            {colCliente && indiceColCliente !== null && (
              <div>
                <p className="text-sm font-semibold text-[var(--fg)] mb-1">Clientes da coluna &quot;{colCliente.nome}&quot;</p>
                <div className="rounded-xl border border-[var(--fg)]/12 divide-y divide-[var(--fg)]/8 max-h-56 overflow-y-auto">
                  {grupos.filter(g => g.match.status !== 'exato').map(g => (
                    <div key={g.valor} className="flex flex-wrap items-center gap-3 px-4 py-2">
                      <span className="flex-1 min-w-[10rem] text-sm text-[var(--fg)]">{g.valor}</span>
                      <select className={`${inputCls} max-w-xs`} value={clienteDoValor(g.valor) ?? ''}
                        onChange={e => setEscolhasCliente(es => ({ ...es, [g.valor]: e.target.value || null }))}>
                        <option value="">Sem cliente</option>
                        {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
                      </select>
                    </div>
                  ))}
                  {grupos.every(g => g.match.status === 'exato') && (
                    <p className="px-4 py-3 text-sm text-emerald-400">Todos os valores casaram com um cliente cadastrado.</p>
                  )}
                </div>
              </div>
            )}

            <button onClick={calcularPrevia} disabled={processando}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {processando ? 'Calculando…' : 'Calcular prévia'}
            </button>
          </>)}

          {previa && (<>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-emerald-400 font-bold">{previa.novas}</p>
                <p className="text-[var(--fg)]/60 text-xs">linha(s) nova(s)</p>
              </div>
              <div className="rounded-xl border border-[var(--fg)]/12 p-3">
                <p className="text-[var(--fg)] font-bold">{previa.semConflito}</p>
                <p className="text-[var(--fg)]/60 text-xs">célula(s) preenchidas sem conflito</p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-amber-400 font-bold">{previa.comConflito.length}</p>
                <p className="text-[var(--fg)]/60 text-xs">linha(s) com conflito</p>
              </div>
              <div className="rounded-xl border border-[var(--fg)]/12 p-3">
                <p className="text-[var(--fg)] font-bold">{previa.ausentes}</p>
                <p className="text-[var(--fg)]/60 text-xs">linha(s) ausente(s) no arquivo</p>
              </div>
            </div>

            {previa.naoConvertidas > 0 && (
              <p className="text-xs text-amber-400">{previa.naoConvertidas} valor(es) não puderam ser convertidos para o tipo da coluna e serão mantidos como texto.</p>
            )}

            {previa.semChave > 0 && (
              <p className="text-xs text-amber-400">{previa.semChave} linha(s) sem valor na coluna-chave foram ignoradas.</p>
            )}

            {previa.comConflito.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[var(--fg)]/40 uppercase tracking-widest">Linhas em conflito</p>
                  <div className="flex gap-2">
                    <button className={btnCls} onClick={() => aplicarResolucaoATodas('sistema')}>Manter sistema (todas)</button>
                    <button className={btnCls} onClick={() => aplicarResolucaoATodas('planilha')}>Usar planilha (todas)</button>
                  </div>
                </div>
                <div className="divide-y divide-[var(--fg)]/8 max-h-64 overflow-y-auto">
                  {previa.comConflito.map(c => (
                    <div key={c.linhaId} className="py-2 space-y-1">
                      <p className="text-xs font-semibold text-[var(--fg)]/70">Linha: {c.chave}</p>
                      {c.celulas.map((cel, i) => (
                        <p key={i} className="text-xs text-[var(--fg)]/70">
                          {cel.colunaNome}: {cel.de === null ? '(vazio)' : String(cel.de)} → {cel.para === null ? '(vazio)' : String(cel.para)}
                        </p>
                      ))}
                      <div className="flex gap-3 text-xs">
                        <label className="flex items-center gap-1">
                          <input type="radio" name={`res-${c.linhaId}`} checked={(resolucoes[c.linhaId] ?? 'sistema') === 'sistema'}
                            onChange={() => setResolucoes(r => ({ ...r, [c.linhaId]: 'sistema' }))} className="accent-[var(--accent)]" />
                          Manter sistema
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="radio" name={`res-${c.linhaId}`} checked={resolucoes[c.linhaId] === 'planilha'}
                            onChange={() => setResolucoes(r => ({ ...r, [c.linhaId]: 'planilha' }))} className="accent-[var(--accent)]" />
                          Usar planilha
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={confirmar} disabled={processando}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {processando ? 'Aplicando…' : 'Aplicar reenvio'}
            </button>
          </>)}
        </div>
      </div>
    </div>
  )
}
