'use client'

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Building2, Check, ChevronDown, ChevronUp, Filter, Paperclip, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import { formatarDdMm } from '@/lib/formatar-data'
import {
  STATUS_PROCEDIMENTO_OPCOES as STATUS_OPCOES,
  tomStatusProcedimento,
  rotuloStatusProcedimento,
  type StatusProcedimento,
} from '@/lib/status-procedimento'
import { montarProcessoTipos, type ProcessoSubetapaRow, type ProcessoTipoResumo, type SubetapaTipoResposta } from '@/lib/processo-tipos'
import ProcedimentoModal, {
  CHIP_ANEXO,
  formatBytes,
  type ClienteResumo,
  type DocumentacaoModelo,
  type Procedimento,
  type ProcessoTipo,
  type SubetapaValor,
} from '@/components/societario/ProcedimentoModal'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

type SupabaseBrowser = ReturnType<typeof createClient>

async function buscarProcedimentos(sb: SupabaseBrowser): Promise<Procedimento[]> {
  const { data } = await sb
    .from('procedimentos_societario')
    .select('*, processo_tipos(nome), documentacao_modelos(nome), procedimento_arquivos(id, name, size)')
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as Procedimento[]
}

interface Catalogos {
  tipos: ProcessoTipo[]
  modelos: DocumentacaoModelo[]
  clientes: ClienteResumo[]
  subetapas: ProcessoSubetapaRow[]
  perfis: { nome: string | null; cor: string | null }[]
}

async function buscarCatalogos(sb: SupabaseBrowser): Promise<Catalogos> {
  const [{ data: tiposData }, { data: modelosData }, { data: clientesData }, { data: subetapasData }, { data: perfisData }] = await Promise.all([
    sb.from('processo_tipos').select('id, nome, etapas').order('nome'),
    sb.from('documentacao_modelos').select('id, nome').order('nome'),
    sb.from('clientes').select('id, nome').order('nome'),
    // Query direta (RLS: leitura livre pra autenticado), não passa pela
    // server action listarProcessoTipos (essa é admin-only e quebraria
    // esta tela pra operadores comuns).
    sb.from('processo_subetapas').select('id, processo_tipo_id, etapa_nome, nome, tipo_resposta, ordem'),
    // Só leitura: nomes para o campo Responsável e cor do avatar.
    sb.from('profiles').select('nome, cor').order('nome'),
  ])
  return {
    tipos: tiposData ?? [],
    modelos: modelosData ?? [],
    clientes: clientesData ?? [],
    subetapas: (subetapasData ?? []) as ProcessoSubetapaRow[],
    perfis: perfisData ?? [],
  }
}

const CATALOGOS_VAZIOS: Catalogos = { tipos: [], modelos: [], clientes: [], subetapas: [], perfis: [] }

function Responsavel({ nome, cores }: { nome: string | null; cores: Record<string, string> }) {
  if (!nome) return <span className="text-fg-3">—</span>
  const cor = cores[nome.toUpperCase()] || 'var(--acc)'
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <span aria-hidden="true" className="grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-bold text-acc-ink" style={{ backgroundColor: cor }}>
        {nome.charAt(0).toUpperCase()}
      </span>
      <span className="truncate text-fg-2" title={nome}>{nome}</span>
    </span>
  )
}

function SelostatusProcedimento({ status }: { status: StatusProcedimento }) {
  return <Badge tom={tomStatusProcedimento(status)}>{rotuloStatusProcedimento(status)}</Badge>
}

function ValorSubetapa({ valor, tipo }: { valor: SubetapaValor | undefined; tipo: SubetapaTipoResposta }) {
  if (tipo === 'checklist') {
    if (valor === true) return <Badge tom="ok" icone={<Check size={13} strokeWidth={2.2} aria-hidden="true" />}>Sim</Badge>
    if (valor === false) return <Badge tom="dng" icone={<X size={13} strokeWidth={2.2} aria-hidden="true" />}>Não</Badge>
    return <span className="text-fg-3">—</span>
  }
  if (tipo === 'data') {
    const data = formatarDdMm(valor as string | null | undefined)
    return data ? <span className="font-mono text-fg">{data}</span> : <span className="text-fg-3">—</span>
  }
  const texto = (valor as string | null | undefined)?.trim()
  return texto ? <span className="min-w-0 break-words text-right text-fg">{texto}</span> : <span className="text-fg-3">—</span>
}

// Detalhe aberto de um procedimento (o mesmo na tabela e no cartão do celular).
function DetalheProcedimento({ item, tipoResumo, onEditar, onExcluir }: {
  item: Procedimento
  tipoResumo: ProcessoTipoResumo | undefined
  onEditar: () => void
  onExcluir: () => void
}) {
  const arquivos = item.procedimento_arquivos ?? []
  const etapas = Object.entries(item.campos ?? {})
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Button tamanho="p" icone={<Pencil size={15} aria-hidden="true" />} onClick={e => { e.stopPropagation(); onEditar() }}>Editar</Button>
        <Button tamanho="p" variante="perigo" icone={<Trash2 size={15} aria-hidden="true" />} onClick={e => { e.stopPropagation(); onExcluir() }}>Excluir</Button>
        {item.documentacao_modelos?.nome && (
          <span className="ml-0 min-w-0 text-[13px] sm:ml-2.5">
            <span className="text-fg-3">Documento vinculado:</span>{' '}
            <span className="font-semibold text-fg">{item.documentacao_modelos.nome}</span>
          </span>
        )}
        {arquivos.length > 0 && (
          <div className="flex min-w-0 flex-wrap gap-2 lg:ml-auto">
            {arquivos.map(arq => (
              <a
                key={arq.id}
                href={`/api/arquivos/procedimento/${arq.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className={`${CHIP_ANEXO} hover:border-line hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc`}
                title={arq.name}
              >
                <Paperclip size={14} aria-hidden="true" className="flex-none" />
                <span className="truncate">{arq.name}</span>
                <span className="flex-none whitespace-nowrap text-fg-3">{formatBytes(arq.size)}</span>
              </a>
            ))}
          </div>
        )}
      </div>
      {etapas.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {etapas.map(([etapa, valor]) => {
            const subetapasDaEtapa = tipoResumo?.etapas.find(e => e.nome === etapa)?.subetapas ?? []
            return (
              <div key={etapa} className="min-w-0 rounded-xl border border-line-soft bg-surface px-4 py-3.5">
                <p className="text-xs font-semibold uppercase tracking-[.05em] text-fg-3">{etapa}</p>
                <p className={`mt-1 break-words ${valor ? 'text-fg' : 'text-fg-3'}`}>{valor || 'Sem resposta'}</p>
                {subetapasDaEtapa.length > 0 && (
                  <div className="mt-2.5 flex flex-col gap-2 border-l-2 border-line pl-3">
                    {subetapasDaEtapa.map(sub => (
                      <div key={sub.id} className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="min-w-0 text-fg-2">{sub.nome}</span>
                        <ValorSubetapa valor={item.subetapas?.[sub.id]} tipo={sub.tipoResposta} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ProcedimentosSocietarioPage() {
  const [sb] = useState(createClient)
  const confirmar = useConfirmar()
  const toast = useToast()
  const [items, setItems] = useState<Procedimento[]>([])
  const [catalogos, setCatalogos] = useState<Catalogos>(CATALOGOS_VAZIOS)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useFiltroPersistente('procedimentos:busca', '')
  const [statusFiltro, setStatusFiltro] = useFiltroPersistente<'TODOS' | StatusProcedimento>('procedimentos:status', 'TODOS')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<Procedimento | null>(null)
  const [filtrosCelular, setFiltrosCelular] = useState(true)

  useEffect(() => {
    let vivo = true
    buscarProcedimentos(sb).then(lista => {
      if (!vivo) return
      setItems(lista)
      setLoading(false)
    })
    buscarCatalogos(sb).then(c => { if (vivo) setCatalogos(c) })
    return () => { vivo = false }
  }, [sb])

  async function recarregar() {
    setItems(await buscarProcedimentos(sb))
  }

  const tiposResumoPorId = new Map(montarProcessoTipos(catalogos.tipos, catalogos.subetapas).map(t => [t.id, t]))

  // Cor do perfil de cada responsável, para a bolinha com a inicial.
  const coresResponsavel: Record<string, string> = {}
  for (const p of catalogos.perfis) {
    if (p.nome && p.cor) coresResponsavel[p.nome.toUpperCase()] = p.cor
  }
  // Nomes para o campo Responsável: os perfis visíveis e, como o RLS só deixa
  // o não-admin ler o próprio perfil, também os responsáveis já usados aqui.
  const responsaveis = Array.from(new Set([
    ...catalogos.perfis.map(p => p.nome?.trim() ?? ''),
    ...items.map(p => p.responsavel?.trim() ?? ''),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id))
  }

  function openCreate() {
    setEditItem(null)
    setModalOpen(true)
  }

  function openEdit(item: Procedimento) {
    setEditItem(item)
    setModalOpen(true)
  }

  async function handleDelete(id: string, empresa: string) {
    const ok = await confirmar({
      titulo: 'Excluir procedimento',
      descricao: `Excluir o procedimento de "${empresa}"?`,
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    const { error } = await sb.from('procedimentos_societario').delete().eq('id', id)
    if (error) {
      toast(`Não foi possível excluir o procedimento: ${error.message}`, 'dng')
      return
    }
    setItems(prev => prev.filter(p => p.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const filtered = items.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !search || p.empresa.toLowerCase().includes(q)
    const matchStatus = statusFiltro === 'TODOS' || p.status === statusFiltro
    return matchSearch && matchStatus
  })

  const subtitulo = `${filtered.length} ${filtered.length === 1 ? 'procedimento' : 'procedimentos'} · clique na linha para ver as etapas`

  function detalhe(item: Procedimento): ReactNode {
    return (
      <DetalheProcedimento
        item={item}
        tipoResumo={tiposResumoPorId.get(item.processo_tipo_id)}
        onEditar={() => openEdit(item)}
        onExcluir={() => handleDelete(item.id, item.empresa)}
      />
    )
  }

  const vazio = items.length === 0
    ? <EmptyState icone={<Building2 size={24} />} titulo="Nenhum procedimento ainda" descricao="Clique em Novo procedimento para abrir o primeiro." />
    : <EmptyState icone={<Building2 size={24} />} titulo="Nenhum procedimento encontrado" descricao="Mude a busca ou a situação." />

  return (
    <Pagina className="pb-[150px] sm:pb-[150px] lg:pb-7">
      <CabecalhoPagina
        titulo="Procedimentos"
        subtitulo={subtitulo}
        acoes={
          <Button variante="primario" className="hidden lg:inline-flex" icone={<Plus size={16} aria-hidden="true" />} onClick={openCreate}>
            Novo procedimento
          </Button>
        }
      />

      {/* Filtros na tela larga */}
      <div className="hidden flex-wrap items-end gap-3 lg:flex">
        <Field rotulo="Buscar" className="w-[300px]">
          {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Nome da empresa" value={search} onChange={e => setSearch(e.target.value)} />}
        </Field>
        <Field rotulo="Situação" className="w-[200px]">
          {c => (
            <Select id={c.id} value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as 'TODOS' | StatusProcedimento)}>
              <option value="TODOS">Todas</option>
              {STATUS_OPCOES.map(s => <option key={s.valor} value={s.valor}>{s.label}</option>)}
            </Select>
          )}
        </Field>
      </div>

      {/* Filtros no celular */}
      <div className="flex flex-col gap-3.5 lg:hidden">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Input type="search" aria-label="Buscar" className="h-11" iconeEsquerda={<Search size={18} />} placeholder="Nome da empresa" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button
            className="h-11 w-11 flex-none px-0"
            aria-label="Filtros"
            title="Filtros"
            aria-expanded={filtrosCelular}
            onClick={() => setFiltrosCelular(v => !v)}
            icone={<Filter size={18} aria-hidden="true" />}
          />
        </div>
        {filtrosCelular && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Situação">
            <Chip ativo={statusFiltro === 'TODOS'} onClick={() => setStatusFiltro('TODOS')}>Todas</Chip>
            {STATUS_OPCOES.map(s => (
              <Chip key={s.valor} ativo={statusFiltro === s.valor} onClick={() => setStatusFiltro(s.valor)}>{s.label}</Chip>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-fg-3">Carregando…</p>
      ) : (
        <>
          {/* Tabela na tela larga */}
          <Card semPadding className="hidden overflow-hidden lg:block">
            {filtered.length === 0 ? vazio : (
              <div className="relative overflow-x-auto xl:overflow-visible">
                <Tabela className="min-w-[860px]">
                  <thead>
                    <tr>
                      <Th className="w-[280px] min-[1400px]:w-[340px]">Empresa</Th>
                      <Th className="w-[220px] min-[1400px]:w-[280px]">Tipo de processo</Th>
                      <Th className="w-[200px] min-[1400px]:w-[220px]">Responsável</Th>
                      <Th>Situação</Th>
                      <Th largura={56}><span className="sr-only">Abrir</span></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(item => {
                      const isExp = expandedId === item.id
                      return (
                        <Fragment key={item.id}>
                          <tr
                            onClick={() => toggleExpand(item.id)}
                            className={`cursor-pointer transition-colors ${isExp ? 'bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]' : 'hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]'}`}
                          >
                            <Td>
                              <span className="block truncate font-semibold text-fg" title={item.empresa}>{item.empresa}</span>
                            </Td>
                            <Td className="text-fg-2">
                              <span className="block truncate" title={item.processo_tipos?.nome ?? undefined}>{item.processo_tipos?.nome ?? '—'}</span>
                            </Td>
                            <Td><Responsavel nome={item.responsavel} cores={coresResponsavel} /></Td>
                            <Td><SelostatusProcedimento status={item.status} /></Td>
                            <Td alinhar="dir">
                              <button
                                type="button"
                                aria-expanded={isExp}
                                aria-label={`${isExp ? 'Fechar' : 'Ver'} etapas de ${item.empresa}`}
                                onClick={e => { e.stopPropagation(); toggleExpand(item.id) }}
                                className="inline-grid h-8 w-8 place-items-center rounded-lg text-fg-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                              >
                                {isExp ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                              </button>
                            </Td>
                          </tr>
                          {isExp && (
                            <tr>
                              <td colSpan={5} className="border-b border-line-soft bg-[color-mix(in_srgb,var(--page)_55%,transparent)] px-[22px] py-[18px]">
                                {detalhe(item)}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </Tabela>
              </div>
            )}
          </Card>

          {/* Cartões no celular */}
          <div className="flex flex-col gap-3.5 lg:hidden">
            {filtered.length === 0 ? <Card semPadding>{vazio}</Card> : filtered.map(item => {
              const isExp = expandedId === item.id
              return (
                <Card key={item.id} semPadding className="overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={isExp}
                    onClick={() => toggleExpand(item.id)}
                    className="flex w-full min-w-0 flex-col gap-2 px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc"
                  >
                    <span className="flex w-full min-w-0 items-start gap-2.5">
                      <b className="min-w-0 flex-1 truncate font-semibold text-fg" title={item.empresa}>{item.empresa}</b>
                      <SelostatusProcedimento status={item.status} />
                    </span>
                    <span className="truncate text-[13px] text-fg-2">{item.processo_tipos?.nome ?? '—'}</span>
                    <Responsavel nome={item.responsavel} cores={coresResponsavel} />
                  </button>
                  {isExp && (
                    <div className="border-t border-line-soft bg-[color-mix(in_srgb,var(--page)_55%,transparent)] px-4 py-4">
                      {detalhe(item)}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}

      <Button
        variante="primario"
        className="fixed bottom-[84px] right-4 z-30 h-[52px] rounded-[26px] px-5 text-[15px] shadow-lg lg:hidden"
        icone={<Plus size={20} aria-hidden="true" />}
        onClick={openCreate}
      >
        Novo procedimento
      </Button>

      {modalOpen && (
        <ProcedimentoModal
          editItem={editItem}
          tipos={catalogos.tipos}
          tiposResumoPorId={tiposResumoPorId}
          modelos={catalogos.modelos}
          clientes={catalogos.clientes}
          responsaveis={responsaveis}
          onFechar={() => setModalOpen(false)}
          onSalvo={recarregar}
        />
      )}
    </Pagina>
  )
}
