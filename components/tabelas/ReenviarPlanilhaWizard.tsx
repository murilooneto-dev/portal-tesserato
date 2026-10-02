'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Upload } from 'lucide-react'
import { lerPlanilha, type PlanilhaLida } from '@/lib/tabelas/parse-planilha'
import { detectarTipoColuna, type TipoColuna, type OpcaoColuna, type ValorCelula } from '@/lib/tabelas/tipos'
import { agruparValoresCliente, type ClienteMatch } from '@/lib/tabelas/cliente-match'
import { casarColunas } from '@/lib/tabelas/reenvio'
import { adicionarColuna } from '@/lib/tabelas-estrutura-actions'
import { preVisualizarReenvio, aplicarReenvio, type PreviaReenvio } from '@/lib/tabelas-reenvio-actions'
import { LIMITE_BYTES_PAYLOAD, type SetorTabela } from '@/lib/tabelas/montar-payload'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select, Checkbox } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { Segmentado } from '@/components/ui/Segmentado'
import { cn } from '@/components/ui/cn'

interface ColunaTabela { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }
interface Props {
  planilhaId: string
  setor: SetorTabela
  colunas: ColunaTabela[]
  temColunaChave: boolean
  clientes: ClienteMatch[]
}

type ResolucaoConflito = 'sistema' | 'planilha'

function StatCard({ valor, rotulo, tom }: { valor: number; rotulo: string; tom: 'ok' | 'info' | 'warn' | 'neu' }) {
  const COR: Record<typeof tom, string> = { ok: 'text-ok', info: 'text-info', warn: 'text-warn', neu: 'text-fg-2' }
  return (
    <div className="rounded-[10px] border border-line-soft bg-surface p-3">
      <p className={cn('text-xl font-semibold', COR[tom])}>{valor.toLocaleString('pt-BR')}</p>
      <p className="text-xs text-fg-3">{rotulo}</p>
    </div>
  )
}

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
  const [resolucoes, setResolucoes] = useState<Record<string, ResolucaoConflito>>({})
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

  function aplicarResolucaoATodas(valor: ResolucaoConflito) {
    if (!previa) return
    const novo: Record<string, ResolucaoConflito> = {}
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
      <Button icone={<Upload size={16} aria-hidden="true" />} disabled={!temColunaChave} onClick={() => setAberto(true)}
        title={temColunaChave ? undefined : 'Esta tabela não tem uma coluna-chave definida. Defina uma coluna-chave na criação para poder reenviar.'}>
        Atualizar com planilha
      </Button>
    )
  }

  return (
    <Modal
      aberto
      onFechar={fechar}
      bloqueado={processando}
      largura="g"
      titulo="Atualizar com planilha"
      subtitulo={previa ? 'Prévia do que vai mudar' : planilha ? `${planilha.linhas.length.toLocaleString('pt-BR')} linhas · ${casamento?.casadas.length ?? 0} coluna(s) reconhecida(s)` : undefined}
      rodape={
        <div className="flex w-full items-center gap-2.5">
          {previa && (
            <Button variante="fantasma" icone={<ChevronLeft size={16} aria-hidden="true" />} disabled={processando} onClick={() => setPrevia(null)}>
              Voltar
            </Button>
          )}
          <div className="ml-auto flex gap-2.5">
            <Button variante="fantasma" onClick={fechar} disabled={processando}>Cancelar</Button>
            {!previa ? (
              <Button variante="primario" disabled={!planilha || !casamento || processando} carregando={processando} onClick={calcularPrevia}>
                {processando ? 'Calculando…' : 'Calcular prévia'}
              </Button>
            ) : (
              <Button variante="primario" disabled={processando} carregando={processando} onClick={confirmar}>
                {processando ? 'Aplicando…' : 'Aplicar atualização'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {!previa && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">Arquivo (.xlsx ou .csv)</span>
          <div>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-raised px-3.5 text-sm font-medium text-fg transition-colors hover:border-fg-3 focus-within:outline-none focus-within:ring-2 focus-within:ring-acc">
              <Upload size={15} aria-hidden="true" />
              Escolher arquivo
              <input type="file" accept=".xlsx,.xls,.csv" className="sr-only"
                onChange={e => { aoEscolherArquivo(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          </div>
        </div>
      )}

      {erroLeitura && <Aviso tom="dng">{erroLeitura}</Aviso>}
      {erro && <Aviso tom="dng">{erro}</Aviso>}

      {planilha && casamento && !previa && (
        <div className="flex flex-col gap-4">
          {casamento.naoReconhecidas.length > 0 && (
            <div className="flex flex-col gap-2 rounded-[10px] border border-line-soft p-3.5">
              <span className="text-xs font-semibold uppercase tracking-[.04em] text-fg-3">Colunas não reconhecidas</span>
              {casamento.naoReconhecidas.map(n => (
                <Checkbox key={n.nome} checked={colunasNovasMarcadas.has(n.nome)}
                  onChange={e => setColunasNovasMarcadas(s => {
                    const novo = new Set(s)
                    if (e.target.checked) novo.add(n.nome); else novo.delete(n.nome)
                    return novo
                  })}
                  rotulo={<>{n.nome} <span className="text-xs text-fg-3">— criar como coluna nova</span></>}
                />
              ))}
            </div>
          )}

          {colCliente && indiceColCliente !== null && (
            <div>
              <p className="mb-1.5 text-sm font-semibold text-fg">Clientes da coluna &quot;{colCliente.nome}&quot;</p>
              {grupos.every(g => g.match.status === 'exato') ? (
                <Aviso tom="ok">Todos os valores casaram com um cliente cadastrado.</Aviso>
              ) : (
                <ul className="max-h-56 overflow-y-auto rounded-[10px] border border-line-soft">
                  {grupos.filter(g => g.match.status !== 'exato').map((g, i) => (
                    <li key={g.valor} className={cn('flex flex-wrap items-center gap-3 px-3.5 py-2', i > 0 && 'border-t border-line-soft')}>
                      <span className="min-w-[10rem] flex-1 text-sm text-fg">{g.valor}</span>
                      <Select className="max-w-xs" value={clienteDoValor(g.valor) ?? ''} aria-label={`Cliente para "${g.valor}"`}
                        onChange={e => setEscolhasCliente(es => ({ ...es, [g.valor]: e.target.value || null }))}>
                        <option value="">Sem cliente</option>
                        {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
                      </Select>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {previa && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard valor={previa.novas} rotulo="linha(s) nova(s)" tom="ok" />
            <StatCard valor={previa.semConflito} rotulo="célula(s) preenchidas sem conflito" tom="info" />
            <StatCard valor={previa.comConflito.length} rotulo="linha(s) com conflito" tom="warn" />
            <StatCard valor={previa.ausentes} rotulo="linha(s) fora do arquivo" tom="neu" />
          </div>

          {previa.naoConvertidas > 0 && (
            <Aviso tom="warn">{previa.naoConvertidas} valor(es) não puderam ser convertidos para o tipo da coluna e serão mantidos como texto.</Aviso>
          )}
          {previa.semChave > 0 && (
            <Aviso tom="warn">{previa.semChave} linha(s) sem valor na coluna-chave foram ignoradas.</Aviso>
          )}

          {previa.comConflito.length > 0 && (
            <div className="flex flex-col gap-3 rounded-[10px] border border-warn/30 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-[.04em] text-fg-3">Linhas em conflito</span>
                <div className="flex flex-wrap gap-2">
                  <Button tamanho="p" variante="fantasma" onClick={() => aplicarResolucaoATodas('sistema')}>Manter sistema (todas)</Button>
                  <Button tamanho="p" variante="fantasma" onClick={() => aplicarResolucaoATodas('planilha')}>Usar planilha (todas)</Button>
                </div>
              </div>
              <ul className="flex max-h-64 flex-col divide-y divide-line-soft overflow-y-auto">
                {previa.comConflito.map(c => (
                  <li key={c.linhaId} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-[13px] font-semibold text-fg-2">Linha: {c.chave}</p>
                      {c.celulas.map((cel, i) => (
                        <p key={i} className="text-xs text-fg-3">
                          {cel.colunaNome}: {cel.de === null ? '(vazio)' : String(cel.de)} → {cel.para === null ? '(vazio)' : String(cel.para)}
                        </p>
                      ))}
                    </div>
                    <Segmentado<ResolucaoConflito>
                      rotulo={`Resolução para a linha ${c.chave}`}
                      opcoes={[{ valor: 'sistema', rotulo: 'Manter sistema' }, { valor: 'planilha', rotulo: 'Usar planilha' }]}
                      valor={resolucoes[c.linhaId] ?? 'sistema'}
                      onMudar={v => setResolucoes(r => ({ ...r, [c.linhaId]: v }))}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
