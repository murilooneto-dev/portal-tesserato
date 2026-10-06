import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Building2, ChevronRight, Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { tomStatusProcedimento, rotuloStatusProcedimento, type StatusProcedimento } from '@/lib/status-procedimento'
import { getMesAno } from '@/lib/mes-atual-server'
import {
  listarTarefasSocietarioDoCliente,
  toggleTarefaSocietario,
  atualizarEtapaSocietario,
  salvarRespostaTextoSocietario,
} from '../tarefas-actions'
import TarefasSetorChecklist from '@/components/geral/TarefasSetorChecklist'
import { tipoVisivelParaUsuario } from '@/lib/tarefa-tipo-visibilidade'
import ClienteSetorSimplesAcoes from '@/components/geral/ClienteSetorSimplesAcoes'
import type { TarefaEtapa } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

interface ProcedimentoHistorico {
  id: string
  status: StatusProcedimento
  created_at: string
  processo_tipos: { nome: string } | null
  procedimento_arquivos: { id: string; name: string; size: number }[]
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// created_at é timestamptz: formata no fuso de Brasília (o servidor roda em UTC).
function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export default async function ClienteSocietarioDetalhePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('role, setores').eq('id', user.id).single()
    : { data: null }

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nome, cnpj, municipio, uf, contato_chat')
    .eq('id', id)
    .single()
  if (!cliente) notFound()

  // Editar dados e tarefas do cliente: admin ou membro do setor (mesma regra da action).
  const podeEditarCliente = profile?.role === 'admin' || (profile?.setores ?? []).includes('societario')
  const [{ data: catalogoRaw }, { data: vinculadasRaw }] = podeEditarCliente
    ? await Promise.all([
      supabase.from('tarefa_tipos').select('nome').eq('setor', 'societario').eq('ativo', true).order('nome'),
      supabase.from('tarefa_tipo_vinculos')
        .select('tarefa_tipos!inner(nome, ativo, setor)')
        .eq('entidade_tipo', 'cliente').eq('entidade_id', id)
        .eq('tarefa_tipos.setor', 'societario').eq('tarefa_tipos.ativo', true),
    ])
    : [{ data: [] }, { data: [] }]
  const catalogoTarefas = (catalogoRaw ?? []).map(t => t.nome as string)
  const tarefasDoCliente = (vinculadasRaw ?? []).map(v => (v.tarefa_tipos as unknown as { nome: string }).nome)

  const { data: procedimentosRaw } = await supabase
    .from('procedimentos_societario')
    .select('id, status, created_at, processo_tipos(nome), procedimento_arquivos(id, name, size)')
    .eq('cliente_id', id)
    .order('created_at', { ascending: false })

  const procedimentos = (procedimentosRaw ?? []) as unknown as ProcedimentoHistorico[]

  const { mes, ano } = await getMesAno()
  const { data: tarefasSocietarioTodas } = await listarTarefasSocietarioDoCliente(id, mes, ano)
  // Uma tarefa com responsável exclusivo some da ficha (não só desabilitada)
  // pra quem não é o dono nem admin — mesmo comportamento do Fiscal.
  const tarefasSocietario = user
    ? tarefasSocietarioTodas.filter(t => tipoVisivelParaUsuario(t.responsavelId, user.id, profile?.role))
    : []

  const tarefaIds = tarefasSocietario.filter(t => t.tarefa).map(t => t.tarefa!.id)
  const { data: etapasCatalogo } = tarefaIds.length > 0
    ? await supabase.from('tarefa_etapas').select('*').in('tarefa_id', tarefaIds)
    : { data: [] as TarefaEtapa[] }

  async function onToggle(tipo: string, concluida: boolean, data?: string) {
    'use server'
    return await toggleTarefaSocietario(id, tipo, mes, ano, concluida, data)
  }

  async function onAtualizarEtapa(tipo: string, etapaNome: string, concluida: boolean, data?: string) {
    'use server'
    return await atualizarEtapaSocietario(id, mes, ano, tipo, etapaNome, concluida, data)
  }

  async function onSalvarTexto(tipo: string, texto: string) {
    'use server'
    return await salvarRespostaTextoSocietario(id, tipo, mes, ano, texto)
  }

  const local = cliente.municipio ? `${cliente.municipio}${cliente.uf ? `/${cliente.uf}` : ''}` : null

  return (
    <Pagina>
      <nav aria-label="Caminho" className="-mb-2 flex min-w-0 items-center gap-1.5 text-[13px] text-fg-3">
        <Link href="/societario/clientes" className="flex-none transition-colors hover:text-fg">Clientes</Link>
        <ChevronRight size={14} aria-hidden="true" className="flex-none" />
        <b className="min-w-0 truncate font-medium text-fg-2" aria-current="page">{cliente.nome}</b>
      </nav>

      <CabecalhoPagina
        titulo={<span className="block min-w-[15ch] truncate" title={cliente.nome}>{cliente.nome}</span>}
        subtitulo={
          <span className="mt-1.5 flex flex-wrap gap-x-[18px] gap-y-1 text-[13px] text-fg-2">
            <span><span className="text-fg-3">CNPJ</span> {cliente.cnpj?.trim() ? <span className="font-mono">{cliente.cnpj}</span> : '—'}</span>
            <span><span className="text-fg-3">Município / UF</span> {local ?? '—'}</span>
            <span className="min-w-0 break-words"><span className="text-fg-3">Contato</span> {cliente.contato_chat?.trim() || '—'}</span>
          </span>
        }
        acoes={
          podeEditarCliente
            ? <ClienteSetorSimplesAcoes setor="societario" cliente={cliente} catalogoTarefas={catalogoTarefas} tarefasDoCliente={tarefasDoCliente} />
            : undefined
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <TarefasSetorChecklist
          tarefas={tarefasSocietario}
          etapas={(etapasCatalogo ?? []) as TarefaEtapa[]}
          podeEditar={true}
          mes={mes}
          avisoSalvoAutomatico
          onToggle={onToggle}
          onAtualizarEtapa={onAtualizarEtapa}
          onSalvarTexto={onSalvarTexto}
        />

        <Card titulo="Histórico de procedimentos" semPadding>
          {procedimentos.length === 0 ? (
            <EmptyState
              icone={<Building2 size={24} />}
              titulo="Nenhum procedimento para este cliente"
              descricao="Os procedimentos abertos em Procedimentos aparecem aqui com a situação e os anexos."
            />
          ) : (
            <ul className="flex flex-col">
              {procedimentos.map(p => (
                <li key={p.id} className="border-b border-line-soft px-[18px] py-3.5 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-semibold text-fg">{p.processo_tipos?.nome ?? '—'}</p>
                    <Badge tom={tomStatusProcedimento(p.status)}>{rotuloStatusProcedimento(p.status)}</Badge>
                  </div>
                  <p className="mt-0.5 text-[13px] text-fg-3">Aberto em {formatarData(p.created_at)}</p>
                  {p.procedimento_arquivos.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {p.procedimento_arquivos.map(arq => (
                        <a
                          key={arq.id}
                          href={`/api/arquivos/procedimento/${arq.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={arq.name}
                          className="inline-flex h-[30px] max-w-[260px] items-center gap-2 rounded-[7px] border border-line-soft bg-raised px-2.5 text-[13px] text-fg-2 transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                        >
                          <Paperclip size={14} aria-hidden="true" className="flex-none" />
                          <span className="min-w-0 truncate">{arq.name}</span>
                          <span className="flex-none text-fg-3">{formatBytes(arq.size)}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Pagina>
  )
}
