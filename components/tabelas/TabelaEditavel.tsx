// components/tabelas/TabelaEditavel.tsx
'use client'

import { useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
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
}

type Estado = { estado: 'salvando' } | { estado: 'erro'; msg: string }

const campoCls = 'w-full min-w-[8rem] px-2 py-1.5 rounded-lg bg-[var(--fg)]/5 border text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50'

// O que aparece dentro do campo de edição (não o texto formatado da leitura).
function textoDeEdicao(tipo: TipoColuna, valor: ValorCelula): string {
  if (valor === null) return ''
  if (tipo === 'numero' && typeof valor === 'number') return String(valor).replace('.', ',')
  return String(valor)
}

export default function TabelaEditavel({ planilhaId, colunas, linhas, clientes, podeEditar }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  // Valores já salvos com sucesso nesta sessão, por cima do que veio do servidor.
  const [salvos, setSalvos] = useState<Record<string, ValorCelula>>({})
  const [vinculos, setVinculos] = useState<Record<string, string | null>>({})
  const [estados, setEstados] = useState<Record<string, Estado>>({})
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

  async function salvarCelula(l: LinhaGrade, c: ColunaGrade, entrada: string) {
    const k = chave(l.id, c.id)
    setEstados(e => ({ ...e, [k]: { estado: 'salvando' } }))
    try {
      const r = await editarCelula({ linhaId: l.id, colunaId: c.id, valor: entrada })
      if (r.error) { setEstados(e => ({ ...e, [k]: { estado: 'erro', msg: r.error as string } })); return }
      setSalvos(s => ({ ...s, [k]: r.valor ?? null }))
      limparEstado(k)
    } catch {
      setEstados(e => ({ ...e, [k]: { estado: 'erro', msg: 'Falha de conexão ao salvar.' } }))
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
      router.push(`${pathname}?pagina=999999`)
    } catch {
      setErroGeral('Falha de conexão ao adicionar a linha.')
    } finally {
      setOcupado(false)
    }
  }

  async function aoRemover(l: LinhaGrade) {
    if (!confirm('Remover esta linha? Essa ação não pode ser desfeita.')) return
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
          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30">sem cliente</span>
        )}
      </>
    )
  }

  function celulaEditavel(l: LinhaGrade, c: ColunaGrade) {
    const k = chave(l.id, c.id)
    const est = estados[k]
    const valor = valorAtual(l, c)
    const bordaCls = est?.estado === 'erro' ? 'border-red-500/60' : 'border-[var(--fg)]/10'
    const desabilitado = est?.estado === 'salvando'

    let campo: ReactNode
    if (c.tipo === 'opcoes') {
      campo = (
        <select className={`${campoCls} ${bordaCls}`} disabled={desabilitado} value={valor === null ? '' : String(valor)}
          onChange={e => salvarCelula(l, c, e.target.value)}>
          <option value="">—</option>
          {(c.opcoes ?? []).map(o => <option key={o.valor} value={o.valor}>{o.valor}</option>)}
        </select>
      )
    } else if (c.tipo === 'cliente') {
      campo = (
        <select className={`${campoCls} ${bordaCls}`} disabled={desabilitado} value={clienteAtual(l) ?? ''}
          onChange={e => salvarCliente(l, c, e.target.value)}>
          <option value="">Sem cliente{valor !== null ? ` (${String(valor)})` : ''}</option>
          {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
        </select>
      )
    } else {
      const inicial = textoDeEdicao(c.tipo, valor)
      campo = (
        <input
          // O key força o campo a voltar ao valor salvo quando o servidor recusa a edição.
          key={`${k}:${inicial}:${est?.estado ?? ''}`}
          type={c.tipo === 'data' ? 'date' : 'text'}
          inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
          className={`${campoCls} ${bordaCls}`}
          disabled={desabilitado}
          defaultValue={c.tipo === 'data' && typeof valor === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(valor) ? '' : inicial}
          onBlur={e => { if (e.target.value.trim() !== inicial) salvarCelula(l, c, e.target.value) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
      )
    }

    return (
      <div>
        {campo}
        {est?.estado === 'salvando' && <span className="text-[10px] text-[var(--fg)]/40">salvando…</span>}
        {est?.estado === 'erro' && <span className="block text-[10px] text-red-400 mt-0.5 max-w-[16rem] whitespace-normal">{est.msg}</span>}
      </div>
    )
  }

  return (
    <div>
      {podeEditar && (
        <div className="flex items-center gap-3 mb-3">
          <button onClick={aoAdicionar} disabled={ocupado}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50">
            Adicionar linha
          </button>
          {erroGeral && <span className="text-xs text-red-400">{erroGeral}</span>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--fg)]/12">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--fg)]/12">
              {colunas.map(c => (
                <th key={c.id} className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                  {c.nome}
                </th>
              ))}
              {podeEditar && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.id} className="border-b border-[var(--fg)]/8 align-top">
                {colunas.map(c => (
                  <td key={c.id} className={`px-4 py-2.5 text-sm text-[var(--fg)] ${podeEditar ? '' : 'whitespace-nowrap'}`}>
                    {podeEditar ? celulaEditavel(l, c) : celulaSomenteLeitura(l, c)}
                  </td>
                ))}
                {podeEditar && (
                  <td className="px-2 py-2.5">
                    <button onClick={() => aoRemover(l)} disabled={ocupado} title="Remover linha"
                      className="text-red-400/60 hover:text-red-400 text-lg leading-none px-1 disabled:opacity-40">×</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {linhas.length === 0 && <p className="text-center text-[var(--fg)]/30 py-12 text-sm">Nenhuma linha.</p>}
      </div>
    </div>
  )
}
