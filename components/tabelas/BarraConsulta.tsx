// components/tabelas/BarraConsulta.tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { parseConsulta, serializeConsulta, type Consulta } from '@/lib/tabelas/consulta'
import type { OpcaoColuna, TipoColuna } from '@/lib/tabelas/tipos'

export interface ColunaFiltro { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }

interface Props {
  base: string
  consulta: Consulta
  colunas: ColunaFiltro[]
  exportarHref: string
}

type Campos = { v?: string; min?: string; max?: string; de?: string; ate?: string }

const inputCls = 'px-2 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50'

function camposIniciais(consulta: Consulta): Record<string, Campos> {
  const r: Record<string, Campos> = {}
  for (const [id, f] of Object.entries(consulta.filtros)) {
    r[id] = {
      v: f.v,
      min: f.min === undefined ? undefined : String(f.min).replace('.', ','),
      max: f.max === undefined ? undefined : String(f.max).replace('.', ','),
      de: f.de,
      ate: f.ate,
    }
  }
  return r
}

export default function BarraConsulta({ base, consulta, colunas, exportarHref }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(consulta.q)
  const [campos, setCampos] = useState<Record<string, Campos>>(() => camposIniciais(consulta))
  const ativos = Object.keys(consulta.filtros).length
  const [aberto, setAberto] = useState(ativos > 0)

  function definir(id: string, campo: keyof Campos, valor: string) {
    setCampos(c => ({ ...c, [id]: { ...c[id], [campo]: valor } }))
  }

  function ir(nova: Consulta) {
    const qs = serializeConsulta(nova, 1)
    router.push(qs ? `${base}?${qs}` : base)
  }

  function aplicar(e?: FormEvent) {
    e?.preventDefault()
    // Reaproveita a mesma validação da URL (formato brasileiro, datas reais...).
    ir(parseConsulta({
      q,
      filtros: JSON.stringify(campos),
      ordem: consulta.ordem ?? undefined,
      dir: consulta.desc ? 'desc' : 'asc',
      semCliente: consulta.semCliente ? '1' : undefined,
    }, colunas))
  }

  function limpar() {
    setQ('')
    setCampos({})
    ir({ q: '', filtros: {}, ordem: consulta.ordem, desc: consulta.desc, semCliente: consulta.semCliente })
  }

  const rotulo = (c: ColunaFiltro) => (
    <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">{c.nome}</label>
  )

  return (
    <form onSubmit={aplicar} className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar em todas as colunas…"
          aria-label="Buscar em todas as colunas" maxLength={200} className={`${inputCls} flex-1 min-w-[14rem]`} />
        <button type="submit"
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] text-sm font-semibold hover:bg-[var(--accent-hover)]">
          Buscar
        </button>
        <button type="button" onClick={() => setAberto(a => !a)}
          className="px-3 py-2 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-sm">
          Filtros{ativos > 0 ? ` (${ativos})` : ''}
        </button>
        <a href={exportarHref}
          className="px-3 py-2 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-sm">
          Exportar Excel
        </a>
      </div>

      {aberto && (
        <div className="rounded-xl border border-[var(--fg)]/12 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {colunas.map(c => (
              <div key={c.id}>
                {rotulo(c)}
                {(c.tipo === 'texto' || c.tipo === 'cliente') && (
                  <input className={`${inputCls} w-full`} placeholder="contém…" value={campos[c.id]?.v ?? ''}
                    onChange={e => definir(c.id, 'v', e.target.value)} aria-label={`Filtrar ${c.nome}`} />
                )}
                {c.tipo === 'opcoes' && (
                  <select className={`${inputCls} w-full`} value={campos[c.id]?.v ?? ''}
                    onChange={e => definir(c.id, 'v', e.target.value)} aria-label={`Filtrar ${c.nome}`}>
                    <option value="">Todas</option>
                    {(c.opcoes ?? []).map(o => <option key={o.valor} value={o.valor}>{o.valor}</option>)}
                  </select>
                )}
                {c.tipo === 'numero' && (
                  <div className="flex gap-2">
                    <input className={`${inputCls} w-full`} placeholder="mín." inputMode="decimal" value={campos[c.id]?.min ?? ''}
                      onChange={e => definir(c.id, 'min', e.target.value)} aria-label={`${c.nome} mínimo`} />
                    <input className={`${inputCls} w-full`} placeholder="máx." inputMode="decimal" value={campos[c.id]?.max ?? ''}
                      onChange={e => definir(c.id, 'max', e.target.value)} aria-label={`${c.nome} máximo`} />
                  </div>
                )}
                {c.tipo === 'data' && (
                  <div className="flex gap-2">
                    <input type="date" className={`${inputCls} w-full`} value={campos[c.id]?.de ?? ''}
                      onChange={e => definir(c.id, 'de', e.target.value)} aria-label={`${c.nome} a partir de`} />
                    <input type="date" className={`${inputCls} w-full`} value={campos[c.id]?.ate ?? ''}
                      onChange={e => definir(c.id, 'ate', e.target.value)} aria-label={`${c.nome} até`} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit"
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] text-sm font-semibold hover:bg-[var(--accent-hover)]">
              Aplicar filtros
            </button>
            <button type="button" onClick={limpar}
              className="px-4 py-2 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/60 hover:text-[var(--fg)] text-sm">
              Limpar
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
