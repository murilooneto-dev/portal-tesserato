import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { getMesAno } from '@/lib/mes-atual-server'
import {
  listarTarefasFinanceiroDoCliente,
  toggleTarefaFinanceiro,
  atualizarEtapaFinanceiro,
  salvarRespostaTextoFinanceiro,
} from '../tarefas-actions'
import TarefasSetorChecklist from '@/components/geral/TarefasSetorChecklist'
import { tipoVisivelParaUsuario } from '@/lib/tarefa-tipo-visibilidade'
import ClienteSetorSimplesAcoes from '@/components/geral/ClienteSetorSimplesAcoes'
import type { TarefaEtapa } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClienteFinanceiroDetalhePage({ params }: Props) {
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
  const podeEditarCliente = profile?.role === 'admin' || (profile?.setores ?? []).includes('financeiro')
  const [{ data: catalogoRaw }, { data: vinculadasRaw }] = podeEditarCliente
    ? await Promise.all([
      supabase.from('tarefa_tipos').select('nome').eq('setor', 'financeiro').eq('ativo', true).order('nome'),
      supabase.from('tarefa_tipo_vinculos')
        .select('tarefa_tipos!inner(nome, ativo, setor)')
        .eq('entidade_tipo', 'cliente').eq('entidade_id', id)
        .eq('tarefa_tipos.setor', 'financeiro').eq('tarefa_tipos.ativo', true),
    ])
    : [{ data: [] }, { data: [] }]
  const catalogoTarefas = (catalogoRaw ?? []).map(t => t.nome as string)
  const tarefasDoCliente = (vinculadasRaw ?? []).map(v => (v.tarefa_tipos as unknown as { nome: string }).nome)

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

  const local = cliente.municipio ? `${cliente.municipio}${cliente.uf ? `/${cliente.uf}` : ''}` : null

  return (
    <Pagina>
      <nav aria-label="Caminho" className="-mb-2 flex min-w-0 items-center gap-1.5 text-[13px] text-fg-3">
        <Link href="/financeiro/clientes" className="flex-none transition-colors hover:text-fg">Clientes</Link>
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
            ? <ClienteSetorSimplesAcoes setor="financeiro" cliente={cliente} catalogoTarefas={catalogoTarefas} tarefasDoCliente={tarefasDoCliente} />
            : undefined
        }
      />

      <TarefasSetorChecklist
        tarefas={tarefasFinanceiro}
        etapas={(etapasCatalogo ?? []) as TarefaEtapa[]}
        podeEditar={true}
        mes={mes}
        className="w-full max-w-[820px]"
        onToggle={onToggle}
        onAtualizarEtapa={onAtualizarEtapa}
        onSalvarTexto={onSalvarTexto}
      />
    </Pagina>
  )
}
