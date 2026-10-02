// components/tabelas/BarraConsulta.tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Search, SlidersHorizontal } from 'lucide-react'
import { Button, buttonClassName } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input, Select } from '@/components/ui/Input'
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

  const TIPO_ROTULO: Record<TipoColuna, string> = {
    texto: 'Texto', numero: 'Número', data: 'Data', opcoes: 'Lista', cliente: 'Cliente',
  }
  const rotulo = (c: ColunaFiltro) => (
    <span className="mb-1.5 flex items-center justify-between gap-2 text-[13px] font-medium text-fg-2">
      <span className="min-w-0 truncate" title={c.nome}>{c.nome}</span>
      <span className="flex-none text-xs font-normal text-fg-3">{TIPO_ROTULO[c.tipo]}</span>
    </span>
  )
  const painelId = 'painel-filtros-tabela'

  return (
    <form onSubmit={aplicar} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[14rem] flex-1">
          <Input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar em todas as colunas…"
            aria-label="Buscar em todas as colunas" maxLength={200} iconeEsquerda={<Search size={16} />} />
        </div>
        <Button type="submit" variante="primario">Buscar</Button>
        <Button aria-expanded={aberto} aria-controls={painelId} icone={<SlidersHorizontal size={16} aria-hidden="true" />}
          onClick={() => setAberto(a => !a)}>
          Filtros
          {ativos > 0 && <Badge tom="acc" className="ml-0.5">{ativos}</Badge>}
        </Button>
        <a href={exportarHref} className={buttonClassName({ variante: 'secundario', tamanho: 'm' })}>
          <Download size={16} aria-hidden="true" />Exportar Excel
        </a>
      </div>

      {aberto && (
        <div id={painelId} className="rounded-xl border border-line-soft bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-fg">Filtros por coluna</h2>
            <span className="text-[13px] text-fg-3">{ativos === 0 ? 'Nenhum filtro ativo' : `${ativos} ${ativos === 1 ? 'filtro ativo' : 'filtros ativos'}`}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {colunas.map(c => (
              <div key={c.id} className="min-w-0">
                {rotulo(c)}
                {(c.tipo === 'texto' || c.tipo === 'cliente') && (
                  <Input placeholder="contém…" value={campos[c.id]?.v ?? ''}
                    onChange={e => definir(c.id, 'v', e.target.value)} aria-label={`Filtrar ${c.nome}`} />
                )}
                {c.tipo === 'opcoes' && (
                  <Select value={campos[c.id]?.v ?? ''}
                    onChange={e => definir(c.id, 'v', e.target.value)} aria-label={`Filtrar ${c.nome}`}>
                    <option value="">Todas</option>
                    {(c.opcoes ?? []).map(o => <option key={o.valor} value={o.valor}>{o.valor}</option>)}
                  </Select>
                )}
                {c.tipo === 'numero' && (
                  <div className="flex gap-2">
                    <Input placeholder="mín." inputMode="decimal" value={campos[c.id]?.min ?? ''}
                      onChange={e => definir(c.id, 'min', e.target.value)} aria-label={`${c.nome} mínimo`} />
                    <Input placeholder="máx." inputMode="decimal" value={campos[c.id]?.max ?? ''}
                      onChange={e => definir(c.id, 'max', e.target.value)} aria-label={`${c.nome} máximo`} />
                  </div>
                )}
                {c.tipo === 'data' && (
                  <div className="flex gap-2">
                    <Input type="date" value={campos[c.id]?.de ?? ''}
                      onChange={e => definir(c.id, 'de', e.target.value)} aria-label={`${c.nome} a partir de`} />
                    <Input type="date" value={campos[c.id]?.ate ?? ''}
                      onChange={e => definir(c.id, 'ate', e.target.value)} aria-label={`${c.nome} até`} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="submit" variante="primario">Aplicar filtros</Button>
            <Button onClick={limpar}>Limpar</Button>
          </div>
        </div>
      )}
    </form>
  )
}
