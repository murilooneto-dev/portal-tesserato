// components/tabelas/TabelaEditavel.tsx
'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Plus, Table2, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { editarCelula, definirClienteDaLinha, adicionarLinha, removerLinha } from '@/lib/tabelas-edicao-actions'
import { formatarValor } from '@/lib/tabelas/formatar'
import type { ClienteMatch } from '@/lib/tabelas/cliente-match'
import type { OpcaoColuna, TipoColuna, ValorCelula } from '@/lib/tabelas/tipos'

export interface ColunaGrade { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }
export interface LinhaGrade { id: string; dados: Record<string, ValorCelula>; cliente_id: string | null }

interface Props {
  planilhaId: string
  colunas: ColunaGrade[]
  linhas: LinhaGrade[]
  clientes: ClienteMatch[]
  podeEditar: boolean
  ordenacao: { coluna: string | null; desc: boolean; hrefs: Record<string, string> }
  consultaAtiva: boolean
  hrefNovaLinha: string
  rodape?: ReactNode
}

type Estado = { estado: 'salvando' } | { estado: 'erro'; msg: string }

const campoCls = 'w-full min-w-[8rem] rounded-lg border bg-inset px-2 py-1.5 text-sm text-fg focus:border-acc focus:outline-none focus:ring-[3px] focus:ring-acc-soft disabled:opacity-60'

// O que aparece dentro do campo de edição (não o texto formatado da leitura).
function textoDeEdicao(tipo: TipoColuna, valor: ValorCelula): string {
  if (valor === null) return ''
  if (tipo === 'numero' && typeof valor === 'number') return String(valor).replace('.', ',')
  return String(valor)
}

export default function TabelaEditavel({ planilhaId, colunas, linhas, clientes, podeEditar, ordenacao, consultaAtiva, hrefNovaLinha, rodape }: Props) {
  const router = useRouter()
  const confirmar = useConfirmar()
  // Valores já salvos com sucesso nesta sessão, por cima do que veio do servidor.
  const [salvos, setSalvos] = useState<Record<string, ValorCelula>>({})
  const [vinculos, setVinculos] = useState<Record<string, string | null>>({})
  const [estados, setEstados] = useState<Record<string, Estado>>({})
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({})
  const [editandoCliente, setEditandoCliente] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const chave = (linhaId: string, colunaId: string) => `${linhaId}:${colunaId}`
  const valorAtual = (l: LinhaGrade, c: ColunaGrade): ValorCelula => {
    const k = chave(l.id, c.id)
    return k in salvos ? salvos[k] : (l.dados[c.id] ?? null)
  }
  const clienteAtual = (l: LinhaGrade): string | null => (l.id in vinculos ? vinculos[l.id] : l.cliente_id)

  function limparEstado(k: string) {
    setEstados(e => { const n = { ...e }; delete n[k]; return n })
  }

  function limparRascunho(k: string) {
    setRascunhos(r => { const n = { ...r }; delete n[k]; return n })
  }

  async function salvarCelula(l: LinhaGrade, c: ColunaGrade, entrada: string) {
    const k = chave(l.id, c.id)
    setEstados(e => ({ ...e, [k]: { estado: 'salvando' } }))
    try {
      const r = await editarCelula({ linhaId: l.id, colunaId: c.id, valor: entrada })
      if (r.error) {
        // Recusa do servidor: o campo volta ao valor anterior e a mensagem explica o motivo.
        limparRascunho(k)
        setEstados(e => ({ ...e, [k]: { estado: 'erro', msg: r.error as string } }))
        return
      }
      setSalvos(s => ({ ...s, [k]: r.valor ?? null }))
      limparRascunho(k)
      limparEstado(k)
    } catch {
      // Falha de rede: o rascunho fica no campo para não perder o que foi digitado.
      setEstados(e => ({ ...e, [k]: { estado: 'erro', msg: 'Falha de conexão ao salvar. O texto digitado foi mantido; tente sair do campo de novo.' } }))
    }
  }

  async function salvarCliente(l: LinhaGrade, c: ColunaGrade, clienteId: string) {
    const k = chave(l.id, c.id)
    setEstados(e => ({ ...e, [k]: { estado: 'salvando' } }))
    try {
      const r = await definirClienteDaLinha({ linhaId: l.id, colunaId: c.id, clienteId: clienteId || null })
      if (r.error) { setEstados(e => ({ ...e, [k]: { estado: 'erro', msg: r.error as string } })); return }
      setVinculos(v => ({ ...v, [l.id]: clienteId || null }))
      if (r.nome) setSalvos(s => ({ ...s, [k]: r.nome as string }))
      limparEstado(k)
    } catch {
      setEstados(e => ({ ...e, [k]: { estado: 'erro', msg: 'Falha de conexão ao salvar.' } }))
    }
  }

  async function aoAdicionar() {
    setOcupado(true); setErroGeral(null)
    try {
      const r = await adicionarLinha(planilhaId)
      if (r.error) { setErroGeral(r.error); return }
      // A paginação limita 999999 à última página, onde a linha nova aparece.
      router.push(hrefNovaLinha)
    } catch {
      setErroGeral('Falha de conexão ao adicionar a linha.')
    } finally {
      setOcupado(false)
    }
  }

  async function aoRemover(l: LinhaGrade) {
    if (!await confirmar({ titulo: 'Remover esta linha?', descricao: 'Essa ação não pode ser desfeita.', textoConfirmar: 'Remover', perigo: true })) return
    setOcupado(true); setErroGeral(null)
    try {
      const r = await removerLinha(l.id)
      if (r.error) setErroGeral(r.error)
      router.refresh()
    } catch {
      setErroGeral('Falha de conexão ao remover a linha.')
    } finally {
      setOcupado(false)
    }
  }

  function celulaSomenteLeitura(l: LinhaGrade, c: ColunaGrade) {
    const valor = valorAtual(l, c)
    const texto = formatarValor(c.tipo, valor)
    const cor = c.tipo === 'opcoes' ? c.opcoes?.find(o => o.valor === valor)?.cor : undefined
    return (
      <>
        {cor ? (
          <span className="text-xs font-bold px-2 py-0.5 rounded-md"
            style={{ backgroundColor: cor + '25', color: cor, border: `1px solid ${cor}50` }}>{texto}</span>
        ) : texto}
        {c.tipo === 'cliente' && !clienteAtual(l) && valor !== null && (
          <Badge tom="warn" className="ml-2">sem cliente</Badge>
        )}
      </>
    )
  }

  function celulaEditavel(l: LinhaGrade, c: ColunaGrade) {
    const k = chave(l.id, c.id)
    const est = estados[k]
    const valor = valorAtual(l, c)
    const bordaCls = est?.estado === 'erro' ? 'border-danger' : 'border-line'
    const desabilitado = est?.estado === 'salvando'

    let campo: ReactNode
    if (c.tipo === 'opcoes') {
      const atual = valor === null ? '' : String(valor)
      const foraDaLista = atual !== '' && !(c.opcoes ?? []).some(o => o.valor === atual)
      campo = (
        <select aria-label={c.nome} className={`${campoCls} ${bordaCls}`} disabled={desabilitado} value={atual}
          onChange={e => salvarCelula(l, c, e.target.value)}>
          <option value="">—</option>
          {foraDaLista && <option value={atual}>{`${atual} (fora da lista)`}</option>}
          {(c.opcoes ?? []).map(o => <option key={o.valor} value={o.valor}>{o.valor}</option>)}
        </select>
      )
    } else if (c.tipo === 'cliente') {
      const cid = clienteAtual(l)
      if (editandoCliente !== k) {
        // A lista completa de clientes só existe na célula em edição (evita ~100k <option> por página).
        campo = (
          <button type="button" aria-label={c.nome} disabled={desabilitado} onClick={() => setEditandoCliente(k)}
            className={`${campoCls} ${bordaCls} text-left cursor-pointer disabled:opacity-60`}>
            {valor !== null ? formatarValor(c.tipo, valor) : 'Sem cliente'}
            {!cid && valor !== null && (
              <Badge tom="warn" className="ml-2">sem cliente</Badge>
            )}
          </button>
        )
      } else {
        const foraDaLista = cid !== null && !clientes.some(cl => cl.id === cid)
        campo = (
          <select aria-label={c.nome} autoFocus className={`${campoCls} ${bordaCls}`} disabled={desabilitado} value={cid ?? ''}
            onBlur={() => setEditandoCliente(null)}
            onChange={e => { setEditandoCliente(null); salvarCliente(l, c, e.target.value) }}>
            <option value="">Sem cliente{valor !== null ? ` (${String(valor)})` : ''}</option>
            {foraDaLista && <option value={cid as string}>{`${valor !== null ? String(valor) : cid} (fora da lista)`}</option>}
            {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
          </select>
        )
      }
    } else {
      const inicial = textoDeEdicao(c.tipo, valor)
      const exibido = rascunhos[k] ?? inicial
      const aoMudar = (v: string) => {
        setRascunhos(r => ({ ...r, [k]: v }))
        if (est?.estado === 'erro') limparEstado(k)
      }
      const aoSair = (el: HTMLInputElement | HTMLTextAreaElement) => {
        const rascunho = rascunhos[k]
        // Sem rascunho = a pessoa nunca digitou nesta célula: apenas focar/sair não salva.
        if (rascunho === undefined) return
        if (el.validity.badInput) {
          // Data pela metade: o navegador entrega value '' mas o campo está preenchido pela metade.
          limparRascunho(k)
          setEstados(e => ({ ...e, [k]: { estado: 'erro', msg: 'Data incompleta.' } }))
          return
        }
        if (rascunho.trim() !== inicial.trim()) salvarCelula(l, c, rascunho)
        else limparRascunho(k)
      }
      if (c.tipo === 'texto') {
        campo = (
          <textarea aria-label={c.nome} rows={1} className={`${campoCls} ${bordaCls} resize-none`} disabled={desabilitado}
            value={exibido}
            onChange={e => aoMudar(e.target.value)}
            onBlur={e => aoSair(e.currentTarget)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() } }}
          />
        )
      } else {
        campo = (
          <input
            aria-label={c.nome}
            // Data legada não convertida (ex.: 'ontem') não cabe em <input type="date">, que a mostraria vazia
            // e faria o blur apagar o valor. Nesse caso vira texto, com o original visível e editável.
            type={c.tipo === 'data' && (valor === null || (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor))) ? 'date' : 'text'}
            inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
            className={`${campoCls} ${bordaCls}`}
            disabled={desabilitado}
            value={exibido}
            onChange={e => aoMudar(e.target.value)}
            onBlur={e => aoSair(e.currentTarget)}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
        )
      }
    }

    return (
      <div>
        {campo}
        {est?.estado === 'salvando' && <span className="text-xs text-fg-3">salvando…</span>}
        {est?.estado === 'erro' && <span role="alert" className="mt-0.5 block max-w-[16rem] whitespace-normal text-xs text-danger">{est.msg}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={aoAdicionar} disabled={ocupado}>
            Adicionar linha
          </Button>
          {erroGeral && <span role="alert" className="text-[13px] text-danger">{erroGeral}</span>}
        </div>
      )}

      <div className="min-w-0 overflow-hidden rounded-xl border border-line-soft bg-surface">
        {linhas.length === 0 ? (
          <EmptyState icone={<Table2 size={24} />} titulo={consultaAtiva ? 'Nenhuma linha encontrada com esses filtros' : 'Nenhuma linha'} />
        ) : (
          <div className="relative max-h-[75vh] overflow-x-auto overflow-y-auto">
            <Tabela className="w-max min-w-full table-auto">
              <thead>
                <tr>
                  {colunas.map((c, i) => {
                    const ativa = ordenacao.coluna === c.id
                    return (
                      <Th key={c.id} aria-sort={ativa ? (ordenacao.desc ? 'descending' : 'ascending') : 'none'}
                        className={`sticky top-0 bg-surface ${i === 0 ? 'left-0 z-30 border-r border-line-soft' : 'z-20'}`}>
                        <Link href={ordenacao.hrefs[c.id] ?? '#'} className="inline-flex items-center gap-1 rounded hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          {c.nome}
                          {ativa && (ordenacao.desc
                            ? <ArrowDown size={14} aria-hidden="true" className="text-acc-text" />
                            : <ArrowUp size={14} aria-hidden="true" className="text-acc-text" />)}
                        </Link>
                      </Th>
                    )
                  })}
                  {podeEditar && <Th className="sticky top-0 z-20 bg-surface" largura={48}><span className="sr-only">Ações</span></Th>}
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id} className="align-top">
                    {colunas.map((c, i) => (
                      <Td key={c.id}
                        className={`${podeEditar ? '' : 'whitespace-nowrap'} ${i === 0 ? 'sticky left-0 z-10 border-r border-line-soft bg-surface' : ''}`}>
                        {podeEditar ? celulaEditavel(l, c) : celulaSomenteLeitura(l, c)}
                      </Td>
                    ))}
                    {podeEditar && (
                      <Td className="px-2">
                        <IconButton rotulo="Remover linha" icone={<X size={16} aria-hidden="true" />} onClick={() => aoRemover(l)} disabled={ocupado}
                          className="text-danger hover:text-danger" />
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
        {rodape}
      </div>
    </div>
  )
}
