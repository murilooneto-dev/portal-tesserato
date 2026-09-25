'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { lerPlanilha, type PlanilhaLida } from '@/lib/tabelas/parse-planilha'
import {
  detectarTipoColuna, opcoesDosValores, TIPOS_COLUNA,
  type TipoColuna, type OpcaoColuna, type ValorCelula,
} from '@/lib/tabelas/tipos'
import { agruparValoresCliente, type ClienteMatch } from '@/lib/tabelas/cliente-match'
import { montarLinhas, LIMITE_LINHAS, type ColunaConfig, type SetorTabela } from '@/lib/tabelas/montar-payload'
import { criarPlanilha } from '@/lib/tabelas-actions'

interface ColunaEdit { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null; indiceOrigem: number }

const ROTULO_TIPO: Record<TipoColuna, string> = {
  texto: 'Texto', numero: 'Número', data: 'Data', opcoes: 'Lista de opções', cliente: 'Cliente',
}

const inputCls = 'px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50'

function colunasDetectadas(p: PlanilhaLida): ColunaEdit[] {
  return p.cabecalhos.map((nome, i) => {
    const det = detectarTipoColuna(p.linhas.map(l => l[i]))
    return { id: crypto.randomUUID(), nome, tipo: det.tipo, opcoes: det.opcoes ?? null, indiceOrigem: i }
  })
}

export default function NovaTabelaWizard({ setor, clientes }: { setor: SetorTabela; clientes: ClienteMatch[] }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [planilha, setPlanilha] = useState<PlanilhaLida | null>(null)
  const [nome, setNome] = useState('')
  const [colunas, setColunas] = useState<ColunaEdit[]>([])
  const [colunaChaveId, setColunaChaveId] = useState<string | null>(null)
  // valor da coluna Cliente -> cliente escolhido (null = "sem cliente")
  const [escolhas, setEscolhas] = useState<Record<string, string | null>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  function carregar(buf: ArrayBuffer, opts?: { aba?: string; linhaCabecalho?: number }) {
    try {
      const p = lerPlanilha(buf, opts)
      if (p.linhas.length === 0) throw new Error('Não há linhas de dados abaixo do cabeçalho.')
      if (p.linhas.length > LIMITE_LINHAS) {
        throw new Error(`A planilha tem ${p.linhas.length.toLocaleString('pt-BR')} linhas; o limite é ${LIMITE_LINHAS.toLocaleString('pt-BR')}.`)
      }
      setPlanilha(p)
      setColunas(colunasDetectadas(p))
      setColunaChaveId(null)
      setEscolhas({})
      setErro(null)
    } catch (e) {
      setPlanilha(null)
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.')
    }
  }

  async function aoEscolherArquivo(f: File | undefined) {
    if (!f) return
    const buf = await f.arrayBuffer()
    setBuffer(buf)
    setNome(f.name.replace(/\.[^.]+$/, ''))
    carregar(buf)
  }

  const colCliente = colunas.find(c => c.tipo === 'cliente') ?? null

  const grupos = useMemo(() => {
    if (!planilha || !colCliente) return []
    return agruparValoresCliente(planilha.linhas.map(l => l[colCliente.indiceOrigem]), clientes)
  }, [planilha, colCliente, clientes])

  // Resolução final por valor: escolha do usuário; senão exato/sugerido.
  function clienteDoValor(valor: string): string | null {
    if (valor in escolhas) return escolhas[valor]
    return grupos.find(g => g.valor === valor)?.match.clienteId ?? null
  }

  function mudarTipo(id: string, tipo: TipoColuna) {
    setColunas(cs => cs.map(c => {
      if (c.id === id) {
        const valores = planilha ? planilha.linhas.map(l => l[c.indiceOrigem]) : []
        const opcoes = tipo === 'opcoes' ? opcoesDosValores(valores.filter((v): v is string | number => v !== null).map(String)) : null
        return { ...c, tipo, opcoes }
      }
      // só uma coluna Cliente: a anterior volta a texto
      return tipo === 'cliente' && c.tipo === 'cliente' ? { ...c, tipo: 'texto' as const } : c
    }))
    setEscolhas({})
  }

  const semMatch = grupos.filter(g => clienteDoValor(g.valor) === null)

  async function criar() {
    if (!planilha) return
    setCriando(true)
    setErro(null)
    const config: ColunaConfig[] = colunas.map(c => ({ ...c }))
    const clientePorLinha = planilha.linhas.map(l => {
      if (!colCliente) return null
      const v = l[colCliente.indiceOrigem]
      return v === null ? null : clienteDoValor(String(v).trim())
    })
    const { linhas } = montarLinhas(planilha.linhas as ValorCelula[][], config, clientePorLinha)
    const resposta = await criarPlanilha({
      setor,
      nome,
      colunaChaveId,
      colunas: colunas.map((c, i) => ({ id: c.id, nome: c.nome, tipo: c.tipo, ordem: i, opcoes: c.opcoes })),
      linhas,
    })
    setCriando(false)
    if (resposta.error || !resposta.id) { setErro(resposta.error ?? 'Não foi possível criar a tabela.'); return }
    router.push(`/${setor}/tabelas/${resposta.id}`)
  }

  function fechar() {
    setAberto(false); setBuffer(null); setPlanilha(null); setErro(null)
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)}
        className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
        Nova tabela
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && !criando && fechar()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Nova tabela a partir de planilha</h2>
          <button onClick={fechar} disabled={criando} className="text-[var(--fg)]/30 hover:text-[var(--fg)] text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">Arquivo (.xlsx ou .csv)</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => aoEscolherArquivo(e.target.files?.[0])}
              className="text-sm text-[var(--fg)]/70" />
          </div>

          {erro && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">⚠ {erro}</div>}

          {planilha && buffer && (<>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">Nome da tabela</label>
                <input className={`${inputCls} w-full`} value={nome} onChange={e => setNome(e.target.value)} maxLength={120} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">Linha do cabeçalho</label>
                <input type="number" min={1} className={`${inputCls} w-full`} value={planilha.linhaCabecalho}
                  onChange={e => carregar(buffer, { aba: planilha.aba, linhaCabecalho: Number(e.target.value) || 1 })} />
              </div>
              {planilha.abas.length > 1 && (
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">Aba</label>
                  <select className={`${inputCls} w-full`} value={planilha.aba}
                    onChange={e => carregar(buffer, { aba: e.target.value })}>
                    {planilha.abas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-[var(--fg)]/50 mb-2">
                {planilha.linhas.length.toLocaleString('pt-BR')} linhas · confira o nome e o tipo de cada coluna. A coluna-chave será usada depois para atualizar a tabela com uma nova planilha (opcional).
              </p>
              <div className="rounded-xl border border-[var(--fg)]/12 divide-y divide-[var(--fg)]/8">
                {colunas.map(c => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <input className={`${inputCls} flex-1 min-w-[10rem]`} value={c.nome} maxLength={120}
                      onChange={e => setColunas(cs => cs.map(x => x.id === c.id ? { ...x, nome: e.target.value } : x))} />
                    <select className={inputCls} value={c.tipo} onChange={e => mudarTipo(c.id, e.target.value as TipoColuna)}>
                      {TIPOS_COLUNA.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-[var(--fg)]/60">
                      <input type="radio" name="chave" checked={colunaChaveId === c.id}
                        onChange={() => setColunaChaveId(c.id)} className="accent-[var(--accent)]" />
                      chave
                    </label>
                    {c.tipo === 'opcoes' && c.opcoes && (
                      <div className="w-full flex flex-wrap gap-1">
                        {c.opcoes.map(o => (
                          <span key={o.valor} className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: o.cor + '25', color: o.cor, border: `1px solid ${o.cor}50` }}>{o.valor}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {colunaChaveId && (
                <button onClick={() => setColunaChaveId(null)} className="mt-2 text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">Limpar coluna-chave</button>
              )}
            </div>

            {colCliente && (
              <div>
                <p className="text-sm font-semibold text-[var(--fg)] mb-1">Clientes da coluna “{colCliente.nome}”</p>
                <p className="text-xs text-[var(--fg)]/50 mb-2">
                  {grupos.length - semMatch.length} de {grupos.length} valores ligados a um cliente.
                  {semMatch.length > 0 && ` ${semMatch.length} sem cliente — escolha abaixo ou deixe assim (poderão ser ligados depois).`}
                </p>
                <div className="rounded-xl border border-[var(--fg)]/12 divide-y divide-[var(--fg)]/8 max-h-72 overflow-y-auto">
                  {grupos.filter(g => g.match.status !== 'exato').map(g => (
                    <div key={g.valor} className="flex flex-wrap items-center gap-3 px-4 py-2">
                      <span className="flex-1 min-w-[10rem] text-sm text-[var(--fg)]">
                        {g.valor} <span className="text-[var(--fg)]/30 text-xs">({g.linhas} {g.linhas === 1 ? 'linha' : 'linhas'})</span>
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${g.match.status === 'sugerido' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                        {g.match.status === 'sugerido' ? 'confirmar' : 'sem match'}
                      </span>
                      <select className={`${inputCls} max-w-xs`} value={clienteDoValor(g.valor) ?? ''}
                        onChange={e => setEscolhas(es => ({ ...es, [g.valor]: e.target.value || null }))}>
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
          </>)}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={fechar} disabled={criando}
            className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm">Cancelar</button>
          <button onClick={criar} disabled={!planilha || !nome.trim() || criando}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50">
            {criando ? 'Criando...' : 'Criar tabela'}
          </button>
        </div>
      </div>
    </div>
  )
}
