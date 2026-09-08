import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ClienteCard from '@/components/societario/ClienteCard'
import { statusProcedimentoBadge, type StatusProcedimento } from '@/lib/status-procedimento'
import { getMesAno } from '@/lib/mes-atual-server'
import {
  listarTarefasSocietarioDoCliente,
  toggleTarefaSocietario,
  atualizarEtapaSocietario,
  salvarRespostaTextoSocietario,
} from '../tarefas-actions'
import TarefasSocietarioChecklist from '@/components/societario/TarefasSocietarioChecklist'
import { tipoVisivelParaUsuario } from '@/lib/tarefa-tipo-visibilidade'
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

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default async function ClienteSocietarioDetalhePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single()
    : { data: null }

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nome, cnpj, municipio, uf, contato_chat')
    .eq('id', id)
    .single()
  if (!cliente) notFound()

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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start gap-4">
        <Link href="/societario/clientes" className="mt-1 text-[var(--fg)]/30 hover:text-[var(--fg)]/70 transition-colors text-lg">←</Link>
        <div className="flex-1">
          <ClienteCard
            nome={cliente.nome}
            cnpj={cliente.cnpj}
            municipio={cliente.municipio}
            uf={cliente.uf}
            contatoChat={cliente.contato_chat}
          />
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--fg)]/40 uppercase tracking-widest">Tarefas</h2>
          <span className="text-[var(--fg)]/40 text-xs font-medium">{MESES_ABREV[mes - 1]} / {ano}</span>
        </div>
        <TarefasSocietarioChecklist
          tarefas={tarefasSocietario}
          etapas={(etapasCatalogo ?? []) as TarefaEtapa[]}
          podeEditar={true}
          onToggle={onToggle}
          onAtualizarEtapa={onAtualizarEtapa}
          onSalvarTexto={onSalvarTexto}
        />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-[var(--fg)]/40 uppercase tracking-widest mb-4">Histórico de Procedimentos</h2>

        {procedimentos.length === 0 ? (
          <p className="text-[var(--fg)]/25 text-sm py-4">Nenhum procedimento registrado para este cliente.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {procedimentos.map(p => {
              const { bg, text, label } = statusProcedimentoBadge(p.status)
              return (
                <div key={p.id} className="px-4 py-3 rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--fg)]">{p.processo_tipos?.nome ?? '—'}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${bg} ${text}`}>{label}</span>
                  </div>
                  <p className="text-[10px] text-[var(--fg)]/30 mt-1">{formatarData(p.created_at)}</p>
                  {p.procedimento_arquivos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.procedimento_arquivos.map(arq => (
                        <a key={arq.id} href={`/api/arquivos/procedimento/${arq.id}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[10px] bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 hover:underline px-2 py-1 rounded-lg">
                          📎 {arq.name} · {formatBytes(arq.size)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
