import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createClient, getAuthenticatedAdmin } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { getMesAnoRealAgora } from '@/lib/mes-atual'
import TarefaChecklist from '@/components/fiscal/TarefaChecklist'
import ClienteObs from '@/components/fiscal/ClienteObs'
import ClienteArquivos from '@/components/fiscal/ClienteArquivos'
import ClienteConferencia from '@/components/fiscal/ClienteConferencia'
import ClienteAcoes from '@/components/fiscal/ClienteAcoes'

interface Props {
  params: Promise<{ id: string }>
}

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']


export default async function ClienteDetalhePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('nome,role').eq('id', user.id).single()

  const { data: cliente } = await supabase.from('clientes').select('*').eq('id', id).single()
  if (!cliente) notFound()

  // Não-admins só podem ver seus próprios clientes
  if (profile?.role !== 'admin' && cliente.responsavel?.toLowerCase() !== profile?.nome?.toLowerCase()) notFound()

  const { mes, ano } = await getMesAno()
  const anoAtual = getMesAnoRealAgora().ano

  // Tarefas do mês selecionado
  const { data: tarefas } = await supabase
    .from('tarefas').select('*').eq('cliente_id', id).eq('mes', mes).eq('ano', ano)

  // Todas as tarefas do ano para o histórico
  const { data: tarefasAno } = await supabase
    .from('tarefas').select('mes,concluida').eq('cliente_id', id).eq('ano', ano)

  // Arquivos do cliente (inclui content_base64 para conferência)
  const { data: arquivos } = await supabase
    .from('client_files').select('id,name,size,uploaded_at,content_base64').eq('cliente_id', id).order('uploaded_at', { ascending: false })

  // Observação do mês selecionado
  const { data: observacao } = await supabase
    .from('observacoes_clientes')
    .select('texto')
    .eq('cliente_id', id)
    .eq('mes', mes)
    .eq('ano', ano)
    .maybeSingle()

  // Dados pro EmpresaModal (editar cliente)
  const [{ data: todosClientes }, { data: atividadeTemplates }] = await Promise.all([
    supabase.from('clientes').select('responsavel'),
    supabase.from('atividade_templates').select('atividade,tarefas'),
  ])
  const responsaveis = Array.from(new Set(
    (todosClientes ?? []).map(c => c.responsavel ?? '').filter(Boolean)
  )).sort()
  const templatesMap: Record<string, string[]> = {}
  for (const row of atividadeTemplates ?? []) {
    templatesMap[row.atividade] = row.tarefas ?? []
  }

  async function toggleTarefa(tipo: string, concluida: boolean, data?: string) {
    'use server'
    const { user, supabase } = await getAuthenticatedAdmin()
    if (!supabase) return
    const concluida_em = concluida
      ? (data ? new Date(data + 'T12:00:00').toISOString() : new Date().toISOString())
      : null
    const { data: existing } = await supabase
      .from('tarefas').select('id')
      .eq('cliente_id', id).eq('mes', mes).eq('ano', ano).eq('tipo', tipo)
      .maybeSingle()
    if (existing?.id) {
      await supabase.from('tarefas')
        .update({ concluida, concluida_em })
        .eq('id', existing.id)
    } else {
      await supabase.from('tarefas')
        .insert({ cliente_id: id, usuario_id: user!.id, mes, ano, tipo, concluida, concluida_em })
    }
    revalidatePath(`/fiscal/clientes/${id}`)
    revalidatePath('/fiscal/clientes')
    revalidatePath('/fiscal/dashboard')
    revalidatePath('/fiscal/historico')
    revalidatePath('/fiscal/relatorios')
    revalidatePath('/fiscal/tarefas')
  }

  // Histórico por mês
  const tiposDoCliente = cliente.tarefas_personalizadas ?? []
  const historicoMeses = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const total = tiposDoCliente.length
    const feitas = (tarefasAno ?? []).filter(t => t.mes === m && t.concluida).length
    const pct = total > 0 ? Math.round((feitas / total) * 100) : 0
    return { m, total, feitas, pct }
  })

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-white/8">
        <div className="flex items-start gap-4">
          <Link href="/fiscal/clientes" className="mt-1 text-white/30 hover:text-white/70 transition-colors text-lg">←</Link>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-white">{cliente.nome}</h1>
                <p className="text-white/40 text-sm mt-0.5">{cliente.cnpj ?? '—'}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {cliente.regime && <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded-full">{cliente.regime}</span>}
                  {cliente.atividade && <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded-full">{cliente.atividade}</span>}
                  {cliente.responsavel && <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded-full">{cliente.responsavel}</span>}
                  {cliente.municipio && <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded-full">{cliente.municipio}{cliente.uf ? `/${cliente.uf}` : ''}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white font-medium text-sm">
                  {MESES_ABREV[mes-1]} / {ano}
                </span>
                <ClienteAcoes cliente={cliente} responsaveis={responsaveis} templates={templatesMap} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <TarefaChecklist
        clienteId={id}
        clienteNome={cliente.nome}
        grupo={cliente.grupo ?? 'normal'}
        tarefasPersonalizadas={cliente.tarefas_personalizadas ?? []}
        tarefas={tarefas ?? []}
        mes={mes}
        ano={ano}
        usuarioId={user.id}
        usuarioNome={profile?.nome ?? user.email ?? ''}
        mitInicial={cliente.mit ?? ''}
        onToggle={toggleTarefa}
      />

      <ClienteObs clienteId={id} obsInicial={observacao?.texto ?? ''} mes={mes} ano={ano} />

      <ClienteArquivos clienteId={id} arquivosIniciais={arquivos ?? []} />

      <ClienteConferencia
        clienteNome={cliente.nome}
        arquivosDTE={(arquivos ?? []).filter(a => /\.xlsx?$/i.test(a.name)).map(a => ({ id: a.id, name: a.name, content_base64: a.content_base64 ?? '' }))}
      />

      {/* Histórico anual */}
      <div className="mt-10 pt-6 border-t border-white/8">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
          Histórico {ano}
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {historicoMeses.map(({ m, total, feitas, pct }) => {
            const isAtual = m === mes && ano === anoAtual
            return (
              <div
                key={m}
                className={`p-3 rounded-xl border text-center ${
                  isAtual
                    ? 'bg-[#00CCEB]/15 border-[#00CCEB]/40'
                    : 'bg-white/3 border-white/8'
                }`}
              >
                <p className="text-xs text-white/50 mb-1">{MESES_ABREV[m-1]}</p>
                <p className={`text-lg font-bold ${pct === 100 ? 'text-[#00CCEB]' : pct > 0 ? 'text-white' : 'text-white/20'}`}>{pct}%</p>
                <p className="text-xs text-white/30">{feitas}/{total}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
