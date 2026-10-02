'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, Check, Clock, Plus, Search, StickyNote, Users } from 'lucide-react'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComFiscal } from '@/lib/clientes-fiscal'
import type { PendenciaVinculo } from '@/lib/vinculos'
import { formatarBadgeVinculo } from '@/lib/vinculos'
import EmpresaModal from './EmpresaModal'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import { bucketDoRegime, type GrupoBucket } from '@/lib/regime-bucket'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Select, Switch } from '@/components/ui/Input'
import { MonthPill } from '@/components/ui/MonthPill'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Tabela, Th, Td } from '@/components/ui/Tabela'

const LABEL_BUCKET: Record<GrupoBucket, string> = {
  normal: 'Regime Normal',
  simples: 'Simples Nacional',
  mei: 'MEI',
  isento: 'Isento',
}

interface Props {
  clientes: ClienteComFiscal[]
  comPendencia: Set<string>
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  catalogo: CatalogoCliente
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function ClientesLista({ clientes, comPendencia, progressoMap, mes, ano, catalogo, pendenciasVinculo }: Props) {
  const [busca, setBusca] = useFiltroPersistente('clientes:busca', '')
  const [filtroResponsavel, setFiltroResponsavel] = useFiltroPersistente('clientes:responsavel', 'TODOS')
  const [filtroGrupo, setFiltroGrupo] = useFiltroPersistente('clientes:grupo', 'TODOS')
  const [filtroAtividade, setFiltroAtividade] = useFiltroPersistente<string[]>('clientes:atividade', [])
  const [filtroPendencia, setFiltroPendencia] = useFiltroPersistente('clientes:pendencia', false)
  const [mostrarDesabilitados, setMostrarDesabilitados] = useFiltroPersistente('clientes:mostrarDesabilitados', false)
  const [modalNovoOpen, setModalNovoOpen] = useState(false)

  const responsaveis = useMemo(() => ['TODOS', ...Array.from(new Set(
    clientes.map(c => c.responsavel ?? '').filter(Boolean)
  )).sort()], [clientes])

  const atividades = catalogo.atividades

  function toggleAtividade(nome: string) {
    setFiltroAtividade(
      filtroAtividade.includes(nome) ? filtroAtividade.filter(a => a !== nome) : [...filtroAtividade, nome]
    )
  }

  const filtrados = useMemo(() => clientes.filter(c => {
    if (busca) {
      const q = busca.toLowerCase()
      if (
        !c.nome.toLowerCase().includes(q) &&
        !(c.cnpj ?? '').includes(q) &&
        !(c.cod ?? '').includes(q)
      ) return false
    }
    if (filtroResponsavel !== 'TODOS' && c.responsavel !== filtroResponsavel) return false
    if (filtroGrupo !== 'TODOS' && bucketDoRegime(c.regime) !== filtroGrupo) return false
    if (filtroAtividade.length > 0 && !((c.atividade ?? []).length === filtroAtividade.length && filtroAtividade.every(a => (c.atividade ?? []).includes(a)))) return false
    if (filtroPendencia && !comPendencia.has(c.id)) return false
    if (!mostrarDesabilitados && c.ativo === false) return false
    return true
  }), [clientes, busca, filtroResponsavel, filtroGrupo, filtroAtividade, filtroPendencia, mostrarDesabilitados, comPendencia])

  const subtitulo = `${filtrados.length} ${filtrados.length === 1 ? 'cliente' : 'clientes'} · ${MESES[mes - 1]}/${ano}`

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Clientes"
        subtitulo={subtitulo}
        acoes={<Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => setModalNovoOpen(true)}>Novo cliente</Button>}
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field rotulo="Buscar" className="w-full sm:w-[300px]">
          {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Cliente, CNPJ ou código" value={busca} onChange={e => setBusca(e.target.value)} />}
        </Field>
        <Field rotulo="Regime" className="w-full sm:w-[190px]">
          {c => (
            <Select id={c.id} value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}>
              <option value="TODOS">Todos</option>
              {(Object.keys(LABEL_BUCKET) as GrupoBucket[]).map(b => (
                <option key={b} value={b}>{LABEL_BUCKET[b]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field rotulo="Responsável" className="w-full sm:w-[190px]">
          {c => (
            <Select id={c.id} value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value)}>
              {responsaveis.map(r => <option key={r} value={r}>{r === 'TODOS' ? 'Todos' : r}</option>)}
            </Select>
          )}
        </Field>
        {atividades.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id="rotulo-filtro-atividade" className="text-[13px] font-medium text-fg-2">Atividade</span>
            <div role="group" aria-labelledby="rotulo-filtro-atividade" className="flex flex-wrap gap-2">
              {atividades.map(nome => (
                <Chip key={nome} ativo={filtroAtividade.includes(nome)} onClick={() => toggleAtividade(nome)}>{nome}</Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Switch ligado={filtroPendencia} onMudar={setFiltroPendencia} rotulo="Apenas pendentes" />
        <Switch ligado={mostrarDesabilitados} onMudar={setMostrarDesabilitados} rotulo="Mostrar desabilitados" />
      </div>

      {modalNovoOpen && (
        <EmpresaModal
          clienteId={null}
          responsaveis={responsaveis.slice(1)}
          catalogo={catalogo}
          onClose={() => setModalNovoOpen(false)}
        />
      )}

      <Card semPadding className="overflow-hidden">
        {filtrados.length === 0 ? (
          <EmptyState icone={<Users size={24} />} titulo="Nenhum cliente encontrado" descricao="Mude a busca ou os filtros." />
        ) : (
          <div className="overflow-x-auto">
            <Tabela className="min-w-[940px]">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th largura={170}>Regime</Th>
                  <Th largura={150}>Atividade</Th>
                  <Th largura={150}>Responsável</Th>
                  <Th largura={150}>Progresso do mês</Th>
                  <Th largura={56}><span className="sr-only">Abrir</span></Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(cliente => {
                  const prog = progressoMap[cliente.id]
                  const total = prog?.total ?? 0
                  const concluidas = prog?.concluidas ?? 0
                  const pct = total > 0 ? Math.round((concluidas / total) * 100) : null
                  const temObs = !!(cliente.obs?.trim())
                  const vinculos = pendenciasVinculo[cliente.id] ?? []
                  const atividadesCliente = cliente.atividade ?? []
                  const href = `/fiscal/clientes/${cliente.id}`
                  return (
                    <tr key={cliente.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                      <Td>
                        <Link href={href} className="block w-full min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <NomeCliente
                            nome={cliente.nome}
                            cnpj={cliente.cnpj}
                            depoisDoNome={
                              <>
                                {temObs && <Badge tom="warn" icone={<StickyNote size={14} aria-hidden="true" />}>Observação</Badge>}
                                {cliente.ativo === false && <Badge>Desabilitado</Badge>}
                              </>
                            }
                            abaixo={vinculos.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {vinculos.map((p, i) => (
                                  <Badge
                                    key={i}
                                    tom={p.liberada ? 'ok' : 'warn'}
                                    icone={p.liberada ? <Check size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
                                  >
                                    {formatarBadgeVinculo(p).texto.replace(/^(✓|⏳)\s*/, '')}
                                  </Badge>
                                ))}
                              </div>
                            ) : undefined}
                          />
                        </Link>
                      </Td>
                      <Td>
                        {cliente.regime
                          ? <Badge tom="acc" className="max-w-full overflow-hidden"><span className="truncate" title={cliente.regime}>{cliente.regime.split('/')[0].trim()}</span></Badge>
                          : <span className="text-fg-3">—</span>}
                      </Td>
                      <Td className="text-fg-2">{atividadesCliente.length > 0 ? atividadesCliente.join(', ') : <span className="text-fg-3">—</span>}</Td>
                      <Td className="text-fg-2">{cliente.responsavel ? <span className="block truncate" title={cliente.responsavel}>{cliente.responsavel}</span> : <span className="text-fg-3">—</span>}</Td>
                      <Td>
                        {total > 0 ? (
                          <div className="flex items-center gap-2">
                            <MonthPill percentual={pct} />
                            <span className="text-[13px] text-fg-3">{concluidas}/{total}</span>
                          </div>
                        ) : <span className="text-fg-3">—</span>}
                      </Td>
                      <Td alinhar="dir">
                        <Link href={href} aria-label={`Abrir ${cliente.nome}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-fg-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <ChevronRight size={18} aria-hidden="true" />
                        </Link>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>
    </Pagina>
  )
}
