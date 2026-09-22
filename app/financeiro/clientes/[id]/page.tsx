import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ClienteCard from '@/components/financeiro/ClienteCardFinanceiro'
import { getMesAno } from '@/lib/mes-atual-server'
import {
  listarTarefasFinanceiroDoCliente,
  toggleTarefaFinanceiro,
  atualizarEtapaFinanceiro,
  salvarRespostaTextoFinanceiro,
} from '../tarefas-actions'
import TarefasFinanceiroChecklist from '@/components/financeiro/TarefasFinanceiroChecklist'
import { tipoVisivelParaUsuario } from '@/lib/tarefa-tipo-visibilidade'
import type { TarefaEtapa } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default async function ClienteFinanceiroDetalhePage({ params }: Props) {
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

  const { mes, ano } = await getMesAno()
  const { data: tarefasFinanceiroTodas } = await listarTarefasFinanceiroDoCliente(id, mes, ano)
  // Uma tarefa com responsável exclusivo some da ficha (não só desabilitada)
  // pra quem não é o dono nem admin — mesmo comportamento do Fiscal.
  const tarefasFinanceiro = user
    ? tarefasFinanceiroTodas.filter(t => tipoVisivelParaUsuario(t.responsavelId, user.id, profile?.role))
    : []

  const tarefaIds = tarefasFinanceiro.filter(t => t.tarefa).map(t => t.tarefa!.id)
  const { data: etapasCatalogo } = tarefaIds.length > 0
    ? await supabase.from('tarefa_etapas').select('*').in('tarefa_id', tarefaIds)
    : { data: [] as TarefaEtapa[] }

  async function onToggle(tipo: string, concluida: boolean, data?: string) {
    'use server'
    return await toggleTarefaFinanceiro(id, tipo, mes, ano, concluida, data)
  }

  async function onAtualizarEtapa(tipo: string, etapaNome: string, concluida: boolean, data?: string) {
    'use server'
    return await atualizarEtapaFinanceiro(id, mes, ano, tipo, etapaNome, concluida, data)
  }

  async function onSalvarTexto(tipo: string, texto: string) {
    'use server'
    return await salvarRespostaTextoFinanceiro(id, tipo, mes, ano, texto)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start gap-4">
        <Link href="/financeiro/clientes" className="mt-1 text-[var(--fg)]/30 hover:text-[var(--fg)]/70 transition-colors text-lg">←</Link>
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
        <TarefasFinanceiroChecklist
          tarefas={tarefasFinanceiro}
          etapas={(etapasCatalogo ?? []) as TarefaEtapa[]}
          podeEditar={true}
          onToggle={onToggle}
          onAtualizarEtapa={onAtualizarEtapa}
          onSalvarTexto={onSalvarTexto}
        />
      </div>

    </div>
  )
}
