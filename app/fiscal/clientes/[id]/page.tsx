import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import TarefaChecklist from '@/components/fiscal/TarefaChecklist'
import ClienteObs from '@/components/fiscal/ClienteObs'
import ClienteArquivos from '@/components/fiscal/ClienteArquivos'
import ClienteConferencia from '@/components/fiscal/ClienteConferencia'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mes?: string; ano?: string }>
}

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const TAREFAS: Record<string, string[]> = {
  normal:  ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','ENV. DAS','PIS/COFINS','ICMS/ICMS ST','IRPJ/CSLL','REINF/INSS','EFD FISCAL','EFD PIS/COFINS'],
  simples: ['ENTRADA','SAIDAS','SIGET','SPEED GOV','ISS','FECHAMENTO SIMPLES','GUIAS ENVIADAS','ICMS ST','REINF'],
  mei:     ['DAS'],
}

export default async function ClienteDetalhePage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('nome,role').eq('id', user.id).single()

  const { data: cliente } = await supabase.from('clientes').select('*').eq('id', id).single()
  if (!cliente) notFound()

  // Não-admins só podem ver seus próprios clientes
  if (profile?.role !== 'admin' && cliente.responsavel?.toLowerCase() !== profile?.nome?.toLowerCase()) notFound()

  const hojeSpTz = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [diaStr, mesStr, anoStr] = hojeSpTz.split('/')
  const mesAtual = parseInt(mesStr)
  const anoAtual = parseInt(anoStr)

  const mes = parseInt(sp.mes ?? String(mesAtual))
  const ano = parseInt(sp.ano ?? String(anoAtual))

  // Tarefas do mês selecionado
  const { data: tarefas } = await supabase
    .from('tarefas').select('*').eq('cliente_id', id).eq('mes', mes).eq('ano', ano)

  // Todas as tarefas do ano para o histórico
  const { data: tarefasAno } = await supabase
    .from('tarefas').select('mes,concluida').eq('cliente_id', id).eq('ano', ano)

  // Arquivos do cliente (inclui content_base64 para conferência)
  const { data: arquivos } = await supabase
    .from('client_files').select('id,name,size,uploaded_at,content_base64').eq('cliente_id', id).order('uploaded_at', { ascending: false })

  async function toggleTarefa(tipo: string, concluida: boolean) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('tarefas').upsert({
      cliente_id: id, usuario_id: user.id, mes, ano, tipo, concluida,
      concluida_em: concluida ? new Date().toISOString() : null,
    }, { onConflict: 'cliente_id,mes,ano,tipo' })
    revalidatePath(`/fiscal/clientes/${id}`)
  }

  // Histórico por mês
  const tiposDoCliente = (cliente.tarefas_personalizadas ?? []).length > 0
    ? (cliente.tarefas_personalizadas as string[])
    : (TAREFAS[cliente.grupo ?? 'normal'] ?? TAREFAS.normal)
  const historicoMeses = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const total = tiposDoCliente.length
    const feitas = (tarefasAno ?? []).filter(t => t.mes === m && t.concluida).length
    const pct = total > 0 ? Math.round((feitas / total) * 100) : 0
    return { m, total, feitas, pct }
  })

  // Navegação mês
  const prevMes = mes === 1 ? 12 : mes - 1
  const prevAno = mes === 1 ? ano - 1 : ano
  const nextMes = mes === 12 ? 1 : mes + 1
  const nextAno = mes === 12 ? ano + 1 : ano

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
              {/* Month nav */}
              <div className="flex items-center gap-2">
                <Link href={`/fiscal/clientes/${id}?mes=${prevMes}&ano=${prevAno}`}
                  className="text-white/40 hover:text-white px-2 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-all text-sm">←</Link>
                <span className="text-white font-medium text-sm min-w-[100px] text-center">
                  {MESES_ABREV[mes-1]} / {ano}
                </span>
                <Link href={`/fiscal/clientes/${id}?mes=${nextMes}&ano=${nextAno}`}
                  className="text-white/40 hover:text-white px-2 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-all text-sm">→</Link>
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

      <ClienteObs clienteId={id} obsInicial={cliente.obs ?? ''} />

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
              <Link
                key={m}
                href={`/fiscal/clientes/${id}?mes=${m}&ano=${ano}`}
                className={`p-3 rounded-xl border text-center transition-all ${
                  isAtual
                    ? 'bg-[#00B8D4]/15 border-[#00B8D4]/40'
                    : 'bg-white/3 border-white/8 hover:bg-white/6'
                }`}
              >
                <p className="text-xs text-white/50 mb-1">{MESES_ABREV[m-1]}</p>
                <p className={`text-lg font-bold ${pct === 100 ? 'text-[#00B8D4]' : pct > 0 ? 'text-white' : 'text-white/20'}`}>{pct}%</p>
                <p className="text-xs text-white/30">{feitas}/{total}</p>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
