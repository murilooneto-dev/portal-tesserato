'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/lib/types'
import { SETORES, SETOR_LABEL } from '@/lib/types'
import { salvarComunicado, atualizarPerfil, criarUsuario, salvarConfiguracoes } from './actions'
import { salvarTemplate, aplicarTemplateAClientes, salvarTemplateGrupo, aplicarTemplateGrupoAClientes, analisarTarefasDuplicadas, limparTarefasDuplicadas, buscarDadosParaAlteracao, renomearTarefaEmClientes, excluirTarefaDeClientes, preencherDataEmClientes, buscarConclusoesTarefa, buscarTarefasSemData, excluirRegistrosDeTarefas, analisarParcelamentosDuplicados, limparParcelamentosDuplicados } from './actions'
import type { GrupoDuplicata, RegistroSemData, GrupoParcelamentoDuplicado } from './actions'
import { resolverTemplate } from '@/lib/atividade-templates'
import DevLock from '@/components/fiscal/DevLock'

interface TaskLog {
  id: string
  created_at: string
  usuario: string | null
  cliente: string | null
  tarefa: string | null
  comp: string | null
  antes: string | null
  depois: string | null
  motivo: string | null
}

interface DeletionLog {
  id: string
  created_at: string
  usuario: string | null
  tipo: string | null
  nome: string | null
  detalhes: string | null
}

interface Props {
  profiles: Profile[]
  dashboardAnnouncement: string
  taskLogs: TaskLog[]
  deletionLogs: DeletionLog[]
  emailSettings?: Record<string, string>
  atividadeTemplates: Record<string, string[]>
  grupoTemplates: Record<string, string[]>
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const ABAS = [
  'Intranet', 'Dashboard', 'Clientes', 'Calendários',
  'Conferência', 'Relatórios', 'Histórico', 'Empresas', 'Parcelamentos',
]

const inputCls = "w-full px-4 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/8 text-[var(--fg)] text-sm placeholder-[var(--fg)]/20 focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const labelCls = "block text-xs font-bold text-[var(--accent)] uppercase tracking-widest mb-1.5"

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!on)}
        className={`relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-[var(--accent)]' : 'bg-[var(--fg)]/10'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--fg)] shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
      {label && <span className="text-xs text-[var(--fg)]/50">{label}</span>}
    </label>
  )
}

export default function ParametrosClient({ profiles, dashboardAnnouncement, taskLogs, deletionLogs, emailSettings = {}, atividadeTemplates, grupoTemplates }: Props) {
  const router = useRouter()

  // Comunicado
  const [announcement, setAnnouncement] = useState(dashboardAnnouncement)
  const [savingAnn, setSavingAnn] = useState(false)
  const [annSaved, setAnnSaved] = useState(false)

  // E-mail rotinas
  const [emailAtivo, setEmailAtivo] = useState(emailSettings.email_ativo === 'true')
  const [gmailRemetente, setGmailRemetente] = useState(emailSettings.gmail_remetente ?? '')
  const [gmailSenha, setGmailSenha] = useState(emailSettings.gmail_senha ?? '')
  const [emailDest, setEmailDest] = useState(emailSettings.email_destinatario ?? '')
  const [usarSenhaApp, setUsarSenhaApp] = useState(emailSettings.usar_senha_app === 'true')
  const [rotina1Ativo, setRotina1Ativo] = useState(emailSettings.rotina1_ativo === 'true')
  const [rotina1Dia, setRotina1Dia] = useState(emailSettings.rotina1_dia ?? '')
  const [rotina1Hora, setRotina1Hora] = useState(emailSettings.rotina1_hora ?? '')
  const [rotina2Ativo, setRotina2Ativo] = useState(emailSettings.rotina2_ativo === 'true')
  const [rotina2Dia, setRotina2Dia] = useState(emailSettings.rotina2_dia ?? '')
  const [rotina2Hora, setRotina2Hora] = useState(emailSettings.rotina2_hora ?? '')
  const [logSlots, setLogSlots] = useState<{ ativo: boolean; dia: string; hora: string }[]>([
    { ativo: emailSettings.log1_ativo === 'true', dia: emailSettings.log1_dia ?? '', hora: emailSettings.log1_hora ?? '' },
    { ativo: emailSettings.log2_ativo === 'true', dia: emailSettings.log2_dia ?? '', hora: emailSettings.log2_hora ?? '' },
    { ativo: emailSettings.log3_ativo === 'true', dia: emailSettings.log3_dia ?? '', hora: emailSettings.log3_hora ?? '' },
    { ativo: emailSettings.log4_ativo === 'true', dia: emailSettings.log4_dia ?? '', hora: emailSettings.log4_hora ?? '' },
  ])
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')

  // Usuários
  const [editingProfile, setEditingProfile] = useState<string | null>(null)
  const [profileEdits, setProfileEdits] = useState<Record<string, Partial<Profile>>>({})
  const [savingProfile, setSavingProfile] = useState<string | null>(null)

  // Novo usuário
  const [novoNome, setNovoNome] = useState('')
  const [novoLogin, setNovoLogin] = useState('')
  const [novoSenha, setNovoSenha] = useState('')
  const [novoPerfil, setNovoPerfil] = useState('operador')
  const [novoCor, setNovoCor] = useState('#6366f1')
  const [novoAbas, setNovoAbas] = useState<string[]>([...ABAS])
  const [novoSetores, setNovoSetores] = useState<string[]>(['fiscal'])
  const [criandoUser, setCriandoUser] = useState(false)
  const [novoUserErr, setNovoUserErr] = useState('')
  const [novoUserOk, setNovoUserOk] = useState(false)

  // Logs modais
  const [logModal, setLogModal] = useState<'tarefas' | 'exclusoes' | null>(null)

  // Templates de atividade
  const BASES = ['Serviço', 'Comércio', 'Indústria'] as const
  const ATIVIDADES_COMBINADAS = [
    'Serviço e Comércio',
    'Serviço e Indústria',
    'Comércio e Indústria',
    'Serviço, Comércio e Indústria',
  ]
  const [templates, setTemplates] = useState<Record<string, string[]>>({
    Serviço:   atividadeTemplates['Serviço']   ?? [],
    Comércio:  atividadeTemplates['Comércio']  ?? [],
    Indústria: atividadeTemplates['Indústria'] ?? [],
  })
  const [novasTarefas, setNovasTarefas] = useState<Record<string, string>>({
    Serviço: '', Comércio: '', Indústria: '',
  })
  const [salvandoTemplate, setSalvandoTemplate] = useState<string | null>(null)
  const [aplicandoTemplate, setAplicandoTemplate] = useState<string | null>(null)
  const [templateMsg, setTemplateMsg] = useState<Record<string, string>>({})

  // Templates de grupo
  const GRUPOS_TEMPLATE = [
    { value: 'normal',  label: 'Regime Normal' },
    { value: 'simples', label: 'Simples Nacional' },
    { value: 'mei',     label: 'MEI' },
  ]
  const [templatesGrupo, setTemplatesGrupo] = useState<Record<string, string[]>>({
    normal:  grupoTemplates['normal']  ?? [],
    simples: grupoTemplates['simples'] ?? [],
    mei:     grupoTemplates['mei']     ?? [],
  })
  const [novasTarefasGrupo, setNovasTarefasGrupo] = useState<Record<string, string>>({
    normal: '', simples: '', mei: '',
  })
  const [salvandoTemplateGrupo, setSalvandoTemplateGrupo] = useState<string | null>(null)
  const [aplicandoTemplateGrupo, setAplicandoTemplateGrupo] = useState<string | null>(null)
  const [templateGrupoMsg, setTemplateGrupoMsg] = useState<Record<string, string>>({})
  const [analisando, setAnalisando] = useState(false)
  const [analise, setAnalise] = useState<{ grupos: GrupoDuplicata[]; todasTarefas: string[] } | null>(null)
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({})
  const [aplicando, setAplicando] = useState(false)
  const [duplicatasMsg, setDuplicatasMsg] = useState('')

  // Parcelamentos duplicados
  const [analisandoParcelamentos, setAnalisandoParcelamentos] = useState(false)
  const [analiseParcelamentos, setAnaliseParcelamentos] = useState<{ grupos: GrupoParcelamentoDuplicado[] } | null>(null)
  const [aplicandoParcelamentos, setAplicandoParcelamentos] = useState(false)
  const [parcelamentosMsg, setParcelamentosMsg] = useState('')

  // Alteração em massa
  const [carregandoDados, setCarregandoDados] = useState(false)
  const [dadosAlteracao, setDadosAlteracao] = useState<{
    todasTarefas: string[]
    clientes: { id: string; nome: string; tarefas: string[] }[]
  } | null>(null)
  const [modoAlteracao, setModoAlteracao] = useState<'renomear' | 'excluir' | 'data'>('renomear')
  const [tarefaOrigem, setTarefaOrigem] = useState('')
  const [tarefaDestino, setTarefaDestino] = useState('')
  const [dataPreenchimento, setDataPreenchimento] = useState('')
  const [mesPreenchimento, setMesPreenchimento] = useState(new Date().getMonth() + 1)
  const [anoPreenchimento, setAnoPreenchimento] = useState(new Date().getFullYear())
  const [clientesSelecionados, setClientesSelecionados] = useState<Set<string>>(new Set())
  const [aplicandoAlteracao, setAplicandoAlteracao] = useState(false)
  const [alteracaoMsg, setAlteracaoMsg] = useState('')
  const [concluidosData, setConcluidosData] = useState<Set<string> | null>(null)
  const [carregandoConcluidos, setCarregandoConcluidos] = useState(false)

  useEffect(() => {
    if (modoAlteracao !== 'data' || !tarefaOrigem) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com o servidor (busca de conclusoes) ao trocar de tarefa/modo
      setConcluidosData(null)
      return
    }
    let cancelado = false
    setCarregandoConcluidos(true)
    buscarConclusoesTarefa(tarefaOrigem, mesPreenchimento, anoPreenchimento).then(result => {
      if (cancelado) return
      setCarregandoConcluidos(false)
      const concluidos = new Set(result.clienteIdsConcluidos)
      setConcluidosData(concluidos)
      setClientesSelecionados(prev => new Set(Array.from(prev).filter(id => !concluidos.has(id))))
    })
    return () => { cancelado = true }
  }, [modoAlteracao, tarefaOrigem, mesPreenchimento, anoPreenchimento])

  // Tarefas sem data
  const [analisandoSemData, setAnalisandoSemData] = useState(false)
  const [mesFiltroSemData, setMesFiltroSemData] = useState(6)
  const [anoFiltroSemData, setAnoFiltroSemData] = useState(new Date().getFullYear())
  const [dadosSemData, setDadosSemData] = useState<{ registros: RegistroSemData[]; totalRegistros: number } | null>(null)
  const [selecionadosSemData, setSelecionadosSemData] = useState<Set<string>>(new Set())  // chaves "tipo||mes||ano"
  const [excluindoSemData, setExcluindoSemData] = useState(false)
  const [semDataMsg, setSemDataMsg] = useState('')

  async function handleAnalisarDuplicatas() {
    setAnalisando(true)
    setDuplicatasMsg('')
    setAnalise(null)
    const result = await analisarTarefasDuplicadas()
    setAnalisando(false)
    if (result.error) { setDuplicatasMsg(`Erro: ${result.error}`); return }
    if (result.grupos.length === 0) { setDuplicatasMsg('Nenhuma duplicata encontrada.'); return }
    // Pré-preenche mapeamento com sugestões automáticas
    const map: Record<string, string> = {}
    for (const g of result.grupos) map[g.normalizado] = g.sugerido ?? g.versoes[0]
    setMapeamento(map)
    setAnalise(result)
  }

  async function handleAplicarLimpeza() {
    setAplicando(true)
    const result = await limparTarefasDuplicadas(mapeamento)
    setAplicando(false)
    setAnalise(null)
    if (result.error) {
      setDuplicatasMsg(`Erro: ${result.error}`)
    } else {
      setDuplicatasMsg(`Concluído — ${result.clientesAtualizados} cliente(s) corrigidos, ${result.tarefasCorrigidas} registro(s) de tarefa atualizados`)
    }
  }

  async function handleAnalisarParcelamentosDuplicados() {
    setAnalisandoParcelamentos(true)
    setParcelamentosMsg('')
    setAnaliseParcelamentos(null)
    const result = await analisarParcelamentosDuplicados()
    setAnalisandoParcelamentos(false)
    if (result.error) { setParcelamentosMsg(`Erro: ${result.error}`); return }
    if (result.grupos.length === 0) { setParcelamentosMsg('Nenhuma duplicata encontrada.'); return }
    setAnaliseParcelamentos(result)
  }

  async function handleAplicarLimpezaParcelamentos() {
    setAplicandoParcelamentos(true)
    const result = await limparParcelamentosDuplicados()
    setAplicandoParcelamentos(false)
    setAnaliseParcelamentos(null)
    if (result.error) {
      setParcelamentosMsg(`Erro: ${result.error}`)
    } else {
      setParcelamentosMsg(`Concluído — ${result.gruposMesclados} grupo(s) mesclados, ${result.linhasRemovidas} linha(s) removida(s)`)
    }
  }

  async function handleCarregarDados() {
    setCarregandoDados(true)
    setAlteracaoMsg('')
    const result = await buscarDadosParaAlteracao()
    setCarregandoDados(false)
    if (result.error) { setAlteracaoMsg(`Erro: ${result.error}`); return }
    setDadosAlteracao(result)
    setTarefaOrigem('')
    setTarefaDestino('')
    setClientesSelecionados(new Set())
  }

  function handleSelecionarTarefaOrigem(tarefa: string) {
    setTarefaOrigem(tarefa)
    setTarefaDestino(tarefa)
    if (!dadosAlteracao) return
    const ids = dadosAlteracao.clientes
      .filter(c => c.tarefas.includes(tarefa))
      .map(c => c.id)
    setClientesSelecionados(new Set(ids))
  }

  async function handleAplicarAlteracao() {
    if (!tarefaOrigem) { setAlteracaoMsg('Selecione uma tarefa.'); return }
    if (clientesSelecionados.size === 0) { setAlteracaoMsg('Selecione ao menos um cliente.'); return }
    const ids = Array.from(clientesSelecionados)

    setAplicandoAlteracao(true)
    let msg = ''

    if (modoAlteracao === 'renomear') {
      if (!tarefaDestino) { setAlteracaoMsg('Selecione o novo nome.'); setAplicandoAlteracao(false); return }
      const r = await renomearTarefaEmClientes(tarefaOrigem, tarefaDestino, ids)
      msg = r.error ? `Erro: ${r.error}` : `Concluído — ${r.clientesAtualizados} cliente(s) renomeados, ${r.tarefasCorrigidas} registro(s) corrigidos`
    } else if (modoAlteracao === 'excluir') {
      const r = await excluirTarefaDeClientes(tarefaOrigem, ids)
      msg = r.error ? `Erro: ${r.error}` : `Concluído — tarefa removida de ${r.clientesAtualizados} cliente(s), ${r.registrosExcluidos} registro(s) excluídos`
    } else {
      if (!dataPreenchimento) { setAlteracaoMsg('Selecione a data.'); setAplicandoAlteracao(false); return }
      const r = await preencherDataEmClientes(tarefaOrigem, mesPreenchimento, anoPreenchimento, dataPreenchimento, ids)
      msg = r.error ? `Erro: ${r.error}` : `Concluído — ${r.registrosAtualizados} registro(s) marcados como concluídos`
    }

    setAplicandoAlteracao(false)
    setAlteracaoMsg(msg)
    if (!msg.startsWith('Erro')) {
      setDadosAlteracao(null)
      setTarefaOrigem('')
      setTarefaDestino('')
      setClientesSelecionados(new Set())
    }
  }

  async function handleAnalisarSemData() {
    setAnalisandoSemData(true)
    setSemDataMsg('')
    setDadosSemData(null)
    setSelecionadosSemData(new Set())
    const result = await buscarTarefasSemData(mesFiltroSemData, anoFiltroSemData)
    setAnalisandoSemData(false)
    if (result.error) { setSemDataMsg(`Erro: ${result.error}`); return }
    if (result.totalRegistros === 0) { setSemDataMsg('Nenhum registro sem data encontrado.'); return }
    setDadosSemData(result)
    // Pré-seleciona todos
    setSelecionadosSemData(new Set(result.registros.map(r => `${r.tipo}||${r.mes}||${r.ano}`)))
  }

  async function handleExcluirSemData() {
    if (!dadosSemData || selecionadosSemData.size === 0) return
    const ids = dadosSemData.registros
      .filter(r => selecionadosSemData.has(`${r.tipo}||${r.mes}||${r.ano}`))
      .flatMap(r => r.ids)
    setExcluindoSemData(true)
    const result = await excluirRegistrosDeTarefas(ids)
    setExcluindoSemData(false)
    if (result.error) {
      setSemDataMsg(`Erro: ${result.error}`)
    } else {
      setSemDataMsg(`Concluído — ${result.excluidos} registro(s) excluídos`)
      setDadosSemData(null)
      setSelecionadosSemData(new Set())
    }
  }

  async function handleSaveComunicado() {
    setSavingAnn(true)
    const fd = new FormData()
    fd.set('dashboard_announcement', announcement)
    await salvarComunicado(fd)
    setSavingAnn(false)
    setAnnSaved(true)
    setTimeout(() => setAnnSaved(false), 2500)
  }

  async function handleSaveProfile(id: string) {
    const edits = profileEdits[id]
    if (!edits) return
    const profile = profiles.find(p => p.id === id)!
    setSavingProfile(id)
    const fd = new FormData()
    fd.set('nome', edits.nome ?? profile.nome)
    fd.set('role', edits.role ?? profile.role)
    fd.set('cor',  edits.cor  ?? profile.cor)
    const setores = edits.setores ?? profile.setores
    for (const s of setores) fd.append('setores', s)
    await atualizarPerfil(id, fd)
    setSavingProfile(null)
    setEditingProfile(null)
    router.refresh()
  }

  async function handleSaveEmail() {
    setSavingEmail(true)
    const result = await salvarConfiguracoes({
      email_ativo: String(emailAtivo),
      gmail_remetente: gmailRemetente,
      gmail_senha: gmailSenha,
      email_destinatario: emailDest,
      usar_senha_app: String(usarSenhaApp),
      rotina1_ativo: String(rotina1Ativo),
      rotina1_dia: rotina1Dia,
      rotina1_hora: rotina1Hora,
      rotina2_ativo: String(rotina2Ativo),
      rotina2_dia: rotina2Dia,
      rotina2_hora: rotina2Hora,
      log1_ativo: String(logSlots[0].ativo), log1_dia: logSlots[0].dia, log1_hora: logSlots[0].hora,
      log2_ativo: String(logSlots[1].ativo), log2_dia: logSlots[1].dia, log2_hora: logSlots[1].hora,
      log3_ativo: String(logSlots[2].ativo), log3_dia: logSlots[2].dia, log3_hora: logSlots[2].hora,
      log4_ativo: String(logSlots[3].ativo), log4_dia: logSlots[3].dia, log4_hora: logSlots[3].hora,
    })
    setSavingEmail(false)
    setEmailMsg(result.error ? `Erro: ${result.error}` : 'Configuração salva!')
    setTimeout(() => setEmailMsg(''), 3000)
  }

  async function handleCriarUsuario() {
    if (!novoNome.trim() || !novoLogin.trim() || !novoSenha.trim()) {
      setNovoUserErr('Preencha nome, login e senha.')
      return
    }
    setCriandoUser(true)
    setNovoUserErr('')
    const result = await criarUsuario({
      nome: novoNome.trim(),
      login: novoLogin.trim(),
      senha: novoSenha,
      role: novoPerfil,
      cor: novoCor,
      abas: novoAbas,
      setores: novoSetores,
    })
    setCriandoUser(false)
    if (result.error) {
      setNovoUserErr(result.error)
    } else {
      setNovoUserOk(true)
      setNovoNome('')
      setNovoLogin('')
      setNovoSenha('')
      setNovoPerfil('operador')
      setNovoCor('#6366f1')
      setNovoAbas([...ABAS])
      setNovoSetores(['fiscal'])
      router.refresh()
      setTimeout(() => setNovoUserOk(false), 3000)
    }
  }

  function toggleAba(aba: string) {
    setNovoAbas(prev => prev.includes(aba) ? prev.filter(a => a !== aba) : [...prev, aba])
  }

  function toggleSetor(setor: string) {
    setNovoSetores(prev => prev.includes(setor) ? prev.filter(s => s !== setor) : [...prev, setor])
  }

  async function handleSalvarTemplate(base: string) {
    setSalvandoTemplate(base)
    const result = await salvarTemplate(base, templates[base])
    setSalvandoTemplate(null)
    setTemplateMsg(prev => ({ ...prev, [base]: result.error ? `Erro: ${result.error}` : 'Salvo!' }))
    setTimeout(() => setTemplateMsg(prev => ({ ...prev, [base]: '' })), 3000)
  }

  async function handleAplicarTemplate(base: string) {
    setAplicandoTemplate(base)
    const result = await aplicarTemplateAClientes(base)
    setAplicandoTemplate(null)
    const msg = result.error
      ? `Erro: ${result.error}`
      : `${result.atualizados} cliente(s) atualizados`
    setTemplateMsg(prev => ({ ...prev, [base + '_aplicar']: msg }))
    setTimeout(() => setTemplateMsg(prev => ({ ...prev, [base + '_aplicar']: '' })), 4000)
  }

  function addTarefaTemplate(base: string) {
    const t = (novasTarefas[base] ?? '').trim().toUpperCase()
    if (!t || templates[base].includes(t)) return
    setTemplates(prev => ({ ...prev, [base]: [...prev[base], t] }))
    setNovasTarefas(prev => ({ ...prev, [base]: '' }))
  }

  function removeTarefaTemplate(base: string, idx: number) {
    setTemplates(prev => ({
      ...prev,
      [base]: prev[base].filter((_, i) => i !== idx),
    }))
  }

  async function handleSalvarTemplateGrupo(grupo: string) {
    setSalvandoTemplateGrupo(grupo)
    const result = await salvarTemplateGrupo(grupo, templatesGrupo[grupo])
    setSalvandoTemplateGrupo(null)
    setTemplateGrupoMsg(prev => ({ ...prev, [grupo]: result.error ? `Erro: ${result.error}` : 'Salvo!' }))
    setTimeout(() => setTemplateGrupoMsg(prev => ({ ...prev, [grupo]: '' })), 3000)
  }

  async function handleAplicarTemplateGrupo(grupo: string) {
    setAplicandoTemplateGrupo(grupo)
    const result = await aplicarTemplateGrupoAClientes(grupo)
    setAplicandoTemplateGrupo(null)
    const msg = result.error
      ? `Erro: ${result.error}`
      : `${result.atualizados} cliente(s) atualizados`
    setTemplateGrupoMsg(prev => ({ ...prev, [grupo + '_aplicar']: msg }))
    setTimeout(() => setTemplateGrupoMsg(prev => ({ ...prev, [grupo + '_aplicar']: '' })), 4000)
  }

  function addTarefaTemplateGrupo(grupo: string) {
    const t = (novasTarefasGrupo[grupo] ?? '').trim().toUpperCase()
    if (!t || templatesGrupo[grupo].includes(t)) return
    setTemplatesGrupo(prev => ({ ...prev, [grupo]: [...prev[grupo], t] }))
    setNovasTarefasGrupo(prev => ({ ...prev, [grupo]: '' }))
  }

  function removeTarefaTemplateGrupo(grupo: string, idx: number) {
    setTemplatesGrupo(prev => ({
      ...prev,
      [grupo]: prev[grupo].filter((_, i) => i !== idx),
    }))
  }

  const sectionHeader = (title: string) => (
    <p className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest mb-4">{title}</p>
  )

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--fg)]">Parâmetros</h1>
          <p className="text-[var(--fg)]/40 mt-1 text-sm">Configurações do portal — administradores estão para a equipe</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setLogModal('exclusoes')}
            className="px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-sm font-semibold hover:bg-violet-500/25 transition-colors"
          >
            Log de Exclusões
          </button>
          <button
            onClick={() => setLogModal('tarefas')}
            className="px-4 py-2 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 text-sm font-semibold hover:bg-orange-500/25 transition-colors"
          >
            Log de Tarefas
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Comunicado */}
        <div className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-6">
          {sectionHeader('Comunicado do Dashboard')}
          <textarea
            value={announcement}
            onChange={e => setAnnouncement(e.target.value)}
            rows={3}
            placeholder="Mensagem que aparece no dashboard para todos os usuários..."
            className={`${inputCls} resize-none`}
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleSaveComunicado}
              disabled={savingAnn}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              {savingAnn ? 'Salvando...' : 'Salvar comunicado'}
            </button>
            {annSaved && <span className="text-green-400 text-sm">Salvo!</span>}
          </div>
        </div>

        {/* Rotinas de E-mail */}
        <div className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            {sectionHeader('Rotinas de E-mail — Relatórios Automáticos')}
            <Toggle on={emailAtivo} onChange={setEmailAtivo} label={emailAtivo ? 'Ativo' : 'Inativo'} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className={labelCls}>Gmail remetente</label>
              <input value={gmailRemetente} onChange={e => setGmailRemetente(e.target.value)} placeholder="email@gmail.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Senha de App Gmail</label>
              <input type="password" value={gmailSenha} onChange={e => setGmailSenha(e.target.value)} placeholder="••••••••" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>E-mail destinatário</label>
              <input value={emailDest} onChange={e => setEmailDest(e.target.value)} placeholder="destino@email.com" className={inputCls} />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <input type="checkbox" id="usarSenhaApp" checked={usarSenhaApp} onChange={e => setUsarSenhaApp(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]" />
            <label htmlFor="usarSenhaApp" className="text-[var(--fg)]/50 text-xs">Usar Senha de App (recomendado para contas com 2FA)</label>
          </div>

          {/* Rotinas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[
              { label: 'Rotina 1', ativo: rotina1Ativo, setAtivo: setRotina1Ativo, dia: rotina1Dia, setDia: setRotina1Dia, hora: rotina1Hora, setHora: setRotina1Hora },
              { label: 'Rotina 2', ativo: rotina2Ativo, setAtivo: setRotina2Ativo, dia: rotina2Dia, setDia: setRotina2Dia, hora: rotina2Hora, setHora: setRotina2Hora },
            ].map(r => (
              <div key={r.label} className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[var(--fg)] text-sm font-semibold">{r.label}</span>
                  <Toggle on={r.ativo} onChange={r.setAtivo} label={r.ativo ? 'Ativo' : 'Inativo'} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Dia do mês</label>
                    <input type="number" min="1" max="31" value={r.dia} onChange={e => r.setDia(e.target.value)}
                      placeholder="Ex: 5" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Horário</label>
                    <input type="time" value={r.hora} onChange={e => r.setHora(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Rotinas Log */}
          <p className="text-xs font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-3">Rotinas Log</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {logSlots.map((slot, i) => (
              <div key={i} className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[var(--fg)] text-xs font-semibold">ENVIO {i + 1}</span>
                  <Toggle on={slot.ativo} onChange={v => setLogSlots(prev => prev.map((s, j) => j === i ? { ...s, ativo: v } : s))} />
                </div>
                <input type="number" min="1" max="31" value={slot.dia}
                  onChange={e => setLogSlots(prev => prev.map((s, j) => j === i ? { ...s, dia: e.target.value } : s))}
                  placeholder="Dia" className={`${inputCls} mb-2`} />
                <input type="time" value={slot.hora}
                  onChange={e => setLogSlots(prev => prev.map((s, j) => j === i ? { ...s, hora: e.target.value } : s))}
                  className={inputCls} />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleSaveEmail} disabled={savingEmail}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
              {savingEmail ? 'Salvando...' : 'Salvar configuração'}
            </button>
            <button className="px-4 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 text-sm hover:bg-[var(--fg)]/10 transition-colors">
              Enviar relatórios agora (teste)
            </button>
            <button className="px-4 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 text-sm hover:bg-[var(--fg)]/10 transition-colors">
              Enviar log agora (teste)
            </button>
            {emailMsg && (
              <span className={emailMsg.startsWith('Erro') ? 'text-red-400 text-sm' : 'text-green-400 text-sm'}>{emailMsg}</span>
            )}
          </div>
        </div>

        {/* Dois painéis: Novo usuário + Usuários cadastrados */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Novo usuário */}
          <div className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-6">
            {sectionHeader('Novo Usuário')}
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Nome</label>
                <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome completo" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Login (e-mail)</label>
                <input type="email" value={novoLogin} onChange={e => setNovoLogin(e.target.value)} placeholder="usuario@email.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Senha</label>
                <input type="password" value={novoSenha} onChange={e => setNovoSenha(e.target.value)} placeholder="••••••••" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Perfil</label>
                  <select value={novoPerfil} onChange={e => setNovoPerfil(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-page)] border border-[var(--fg)]/8 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors">
                    <option value="operador">Operador</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Cor de identificação</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={novoCor} onChange={e => setNovoCor(e.target.value)}
                      className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0" />
                    <span className="text-[var(--fg)]/40 text-sm font-mono">{novoCor}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className={labelCls}>Acesso às Abas</label>
                <div className="grid grid-cols-3 gap-2">
                  {ABAS.map(aba => (
                    <label key={aba} className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={novoAbas.includes(aba)} onChange={() => toggleAba(aba)}
                        className="w-3.5 h-3.5 accent-[var(--accent)]" />
                      <span className="text-[var(--fg)]/60 text-xs">{aba}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Setores</label>
                <div className="grid grid-cols-2 gap-2">
                  {SETORES.map(setor => (
                    <label key={setor} className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={novoSetores.includes(setor)} onChange={() => toggleSetor(setor)}
                        className="w-3.5 h-3.5 accent-[var(--accent)]" />
                      <span className="text-[var(--fg)]/60 text-xs">{SETOR_LABEL[setor]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {novoUserErr && <p className="text-red-400 text-sm">{novoUserErr}</p>}
              {novoUserOk && <p className="text-green-400 text-sm">Usuário criado com sucesso!</p>}

              <button onClick={handleCriarUsuario} disabled={criandoUser}
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                {criandoUser ? 'Criando...' : 'Criar usuário'}
              </button>
            </div>
          </div>

          {/* Usuários cadastrados */}
          <div className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-6">
            {sectionHeader('Usuários Cadastrados')}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {profiles.length === 0 && (
                <p className="text-[var(--fg)]/20 text-sm text-center py-8">Nenhum usuário encontrado.</p>
              )}
              {profiles.map(p => {
                const isEditing = editingProfile === p.id
                const edits = profileEdits[p.id] ?? {}
                return (
                  <div key={p.id} className="p-4 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/6">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[var(--fg)] font-bold text-sm"
                            style={{ backgroundColor: edits.cor ?? p.cor }}>
                            {(edits.nome ?? p.nome).charAt(0).toUpperCase()}
                          </div>
                          <input
                            value={edits.nome ?? p.nome}
                            onChange={e => setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], nome: e.target.value } }))}
                            className="flex-1 px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <select
                            value={edits.role ?? p.role}
                            onChange={e => setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], role: e.target.value as Profile['role'] } }))}
                            className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-page)] border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none"
                          >
                            <option value="admin">Admin</option>
                            <option value="operador">Operador</option>
                          </select>
                          <input
                            type="color"
                            value={edits.cor ?? p.cor}
                            onChange={e => setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], cor: e.target.value } }))}
                            className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border-0"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {SETORES.map(setor => (
                            <label key={setor} className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={(edits.setores ?? p.setores).includes(setor)}
                                onChange={() => {
                                  const atual = edits.setores ?? p.setores
                                  const novo = atual.includes(setor) ? atual.filter(s => s !== setor) : [...atual, setor]
                                  setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], setores: novo } }))
                                }}
                                className="w-3.5 h-3.5 accent-[var(--accent)]"
                              />
                              <span className="text-[var(--fg)]/60 text-xs">{SETOR_LABEL[setor]}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveProfile(p.id)} disabled={savingProfile === p.id}
                            className="flex-1 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--fg)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                            {savingProfile === p.id ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button onClick={() => { setEditingProfile(null); setProfileEdits(prev => { const n = { ...prev }; delete n[p.id]; return n }) }}
                            className="flex-1 py-1.5 rounded-lg bg-[var(--fg)]/5 text-[var(--fg)]/50 text-xs hover:bg-[var(--fg)]/10 transition-colors">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[var(--fg)] font-bold text-sm"
                          style={{ backgroundColor: p.cor }}>
                          {p.nome.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[var(--fg)] font-semibold text-sm truncate">{p.nome}</p>
                          <p className="text-[var(--fg)]/35 text-xs mt-0.5">{p.setores.map(s => SETOR_LABEL[s]).join(', ')} · {p.role}</p>
                        </div>
                        <button onClick={() => setEditingProfile(p.id)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/8 text-[var(--fg)]/50 hover:text-[var(--fg)] hover:bg-[var(--fg)]/10 text-xs transition-colors">
                          Editar
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <DevLock>
        {/* Templates de Tarefas por Atividade */}
        <div className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-6">
          {sectionHeader('Templates de Tarefas por Atividade')}
          <p className="text-[var(--fg)]/30 text-xs mb-5">
            Configure as tarefas padrão para cada atividade base. Atividades combinadas são geradas automaticamente pela união das bases.
          </p>

          {/* 3 cards editáveis */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {BASES.map(base => (
              <div key={base} className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-[var(--fg)] font-semibold text-sm">{base}</p>

                {/* Lista de tarefas */}
                <div className="flex flex-wrap gap-1.5 min-h-[40px]">
                  {templates[base].length === 0 && (
                    <p className="text-[var(--fg)]/20 text-xs">Nenhuma tarefa</p>
                  )}
                  {templates[base].map((t, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--fg)] px-2 py-0.5 rounded-md">
                      {t}
                      <button
                        onClick={() => removeTarefaTemplate(base, i)}
                        className="text-[var(--fg)]/30 hover:text-red-400 transition-colors font-bold ml-0.5">×</button>
                    </span>
                  ))}
                </div>

                {/* Input nova tarefa */}
                <div className="flex gap-1.5">
                  <input
                    value={novasTarefas[base] ?? ''}
                    onChange={e => setNovasTarefas(prev => ({ ...prev, [base]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefaTemplate(base))}
                    placeholder="Nova tarefa..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50"
                  />
                  <button
                    onClick={() => addTarefaTemplate(base)}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] text-xs font-bold hover:bg-[var(--accent)]/30 transition-colors">
                    +
                  </button>
                </div>

                {/* Botões */}
                <div className="flex flex-col gap-1.5 mt-auto pt-1">
                  <button
                    onClick={() => handleSalvarTemplate(base)}
                    disabled={salvandoTemplate === base}
                    className="w-full py-1.5 rounded-lg bg-[var(--accent)] text-[var(--fg)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                    {salvandoTemplate === base ? 'Salvando...' : 'Salvar template'}
                  </button>
                  <button
                    onClick={() => handleAplicarTemplate(base)}
                    disabled={aplicandoTemplate === base}
                    className="w-full py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/60 text-xs hover:bg-[var(--fg)]/10 transition-colors disabled:opacity-50">
                    {aplicandoTemplate === base ? 'Aplicando...' : 'Aplicar a clientes existentes'}
                  </button>
                  {templateMsg[base] && (
                    <p className={`text-xs text-center ${templateMsg[base].startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                      {templateMsg[base]}
                    </p>
                  )}
                  {templateMsg[base + '_aplicar'] && (
                    <p className="text-xs text-center text-blue-400">{templateMsg[base + '_aplicar']}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Preview atividades combinadas */}
          <div>
            <p className="text-[10px] font-bold text-[var(--fg)]/30 uppercase tracking-widest mb-3">Preview — Atividades Combinadas (somente leitura)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ATIVIDADES_COMBINADAS.map(ativ => {
                const tarefas = resolverTemplate(ativ, templates)
                return (
                  <div key={ativ} className="rounded-xl border border-[var(--fg)]/6 bg-[var(--fg)]/2 px-4 py-3">
                    <p className="text-[var(--fg)]/50 text-xs font-semibold mb-2">{ativ}</p>
                    <p className="text-[var(--fg)]/30 text-xs">
                      {tarefas.length === 0
                        ? 'Nenhuma tarefa'
                        : tarefas.join(' · ')}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Templates de Tarefas por Grupo */}
        <div className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-6">
          {sectionHeader('Templates de Tarefas por Grupo')}
          <p className="text-[var(--fg)]/30 text-xs mb-5">
            Configure as tarefas padrão para cada grupo (Regime Normal, Simples Nacional, MEI).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {GRUPOS_TEMPLATE.map(({ value: grupo, label }) => (
              <div key={grupo} className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-[var(--fg)] font-semibold text-sm">{label}</p>

                {/* Lista de tarefas */}
                <div className="flex flex-wrap gap-1.5 min-h-[40px]">
                  {templatesGrupo[grupo].length === 0 && (
                    <p className="text-[var(--fg)]/20 text-xs">Nenhuma tarefa</p>
                  )}
                  {templatesGrupo[grupo].map((t, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--fg)] px-2 py-0.5 rounded-md">
                      {t}
                      <button
                        onClick={() => removeTarefaTemplateGrupo(grupo, i)}
                        className="text-[var(--fg)]/30 hover:text-red-400 transition-colors font-bold ml-0.5">×</button>
                    </span>
                  ))}
                </div>

                {/* Input nova tarefa */}
                <div className="flex gap-1.5">
                  <input
                    value={novasTarefasGrupo[grupo] ?? ''}
                    onChange={e => setNovasTarefasGrupo(prev => ({ ...prev, [grupo]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefaTemplateGrupo(grupo))}
                    placeholder="Nova tarefa..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50"
                  />
                  <button
                    onClick={() => addTarefaTemplateGrupo(grupo)}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] text-xs font-bold hover:bg-[var(--accent)]/30 transition-colors">
                    +
                  </button>
                </div>

                {/* Botões */}
                <div className="flex flex-col gap-1.5 mt-auto pt-1">
                  <button
                    onClick={() => handleSalvarTemplateGrupo(grupo)}
                    disabled={salvandoTemplateGrupo === grupo}
                    className="w-full py-1.5 rounded-lg bg-[var(--accent)] text-[var(--fg)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                    {salvandoTemplateGrupo === grupo ? 'Salvando...' : 'Salvar template'}
                  </button>
                  <button
                    onClick={() => handleAplicarTemplateGrupo(grupo)}
                    disabled={aplicandoTemplateGrupo === grupo}
                    className="w-full py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/60 text-xs hover:bg-[var(--fg)]/10 transition-colors disabled:opacity-50">
                    {aplicandoTemplateGrupo === grupo ? 'Aplicando...' : 'Aplicar a clientes existentes'}
                  </button>
                  {templateGrupoMsg[grupo] && (
                    <p className={`text-xs text-center ${templateGrupoMsg[grupo].startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                      {templateGrupoMsg[grupo]}
                    </p>
                  )}
                  {templateGrupoMsg[grupo + '_aplicar'] && (
                    <p className="text-xs text-center text-blue-400">{templateGrupoMsg[grupo + '_aplicar']}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Manutenção de Dados */}
        <div className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-6">
          {sectionHeader('Manutenção de Dados')}
          <p className="text-[var(--fg)]/30 text-xs mb-5">
            Ferramentas administrativas para corrigir inconsistências nos dados dos clientes.
          </p>

          <p className="text-[var(--fg)]/60 text-sm font-medium mb-1">Remover tarefas duplicadas</p>
          <p className="text-[var(--fg)]/30 text-xs mb-4">
            Analisa todos os clientes e identifica tarefas repetidas com grafias diferentes (ex: "SAIDAS" e "SAÍDAS"). Você confirma qual versão manter antes de aplicar.
          </p>

          {/* Etapa 1: botão Analisar */}
          {!analise && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleAnalisarDuplicatas}
                disabled={analisando}
                className="px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-semibold hover:bg-orange-500/30 transition-colors disabled:opacity-50">
                {analisando ? 'Analisando...' : 'Analisar duplicatas'}
              </button>
              {duplicatasMsg && (
                <p className={`text-xs ${duplicatasMsg.startsWith('Erro') ? 'text-red-400' : duplicatasMsg.startsWith('Nenhuma') ? 'text-[var(--fg)]/40' : 'text-green-400'}`}>
                  {duplicatasMsg}
                </p>
              )}
            </div>
          )}

          {/* Etapa 2: preview + confirmação */}
          {analise && (
            <div className="flex flex-col gap-4">
              <p className="text-[var(--fg)]/50 text-xs">
                {analise.grupos.length} grupo(s) de duplicata encontrado(s). Confirme qual versão manter para cada um:
              </p>

              <div className="rounded-xl border border-[var(--fg)]/8 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--fg)]/8 bg-[var(--fg)]/3">
                      <th className="text-left px-4 py-2.5 text-[var(--fg)]/40 font-semibold">Versões encontradas</th>
                      <th className="text-left px-4 py-2.5 text-[var(--fg)]/40 font-semibold">Manter como</th>
                      <th className="text-right px-4 py-2.5 text-[var(--fg)]/40 font-semibold">Clientes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analise.grupos.map(g => (
                      <tr key={g.normalizado} className="border-b border-[var(--fg)]/5 last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {g.versoes.map(v => (
                              <span key={v} className={`px-2 py-0.5 rounded text-[11px] border ${mapeamento[g.normalizado] === v ? 'bg-[var(--fg)]/5 border-[var(--fg)]/10 text-[var(--fg)]/60' : 'bg-red-500/10 border-red-500/20 text-red-300 line-through'}`}>
                                {v}
                              </span>
                            ))}
                          </div>
                          {!g.sugerido && (
                            <p className="text-yellow-400/70 text-[10px] mt-1">⚠ Sem versão com acento detectada — selecione manualmente</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={mapeamento[g.normalizado] ?? ''}
                            onChange={e => setMapeamento(prev => ({ ...prev, [g.normalizado]: e.target.value }))}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50 w-full max-w-[220px] bg-[var(--bg-surface)]">
                            <optgroup label="Versões encontradas">
                              {g.versoes.map(v => <option key={v} value={v}>{v}</option>)}
                            </optgroup>
                            <optgroup label="Outras tarefas cadastradas">
                              {analise.todasTarefas.filter(t => !g.versoes.includes(t)).map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </optgroup>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--fg)]/40">
                          {g.clientesAfetados}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleAplicarLimpeza}
                  disabled={aplicando}
                  className="px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-semibold hover:bg-orange-500/30 transition-colors disabled:opacity-50">
                  {aplicando ? 'Aplicando...' : 'Confirmar e aplicar'}
                </button>
                <button
                  onClick={() => { setAnalise(null); setDuplicatasMsg('') }}
                  className="px-4 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/40 text-xs hover:bg-[var(--fg)]/10 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Divisor */}
          <div className="border-t border-[var(--fg)]/8 my-6" />

          {/* Remover parcelamentos duplicados */}
          <p className="text-[var(--fg)]/60 text-sm font-medium mb-1">Remover parcelamentos duplicados</p>
          <p className="text-[var(--fg)]/30 text-xs mb-4">
            Analisa a tabela de Parcelamentos e identifica linhas repetidas (mesma empresa, CNPJ e seção). Mescla os campos preenchidos de cada duplicata numa única linha e remove as sobras.
          </p>

          {!analiseParcelamentos ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleAnalisarParcelamentosDuplicados}
                disabled={analisandoParcelamentos}
                className="px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-semibold hover:bg-orange-500/30 transition-colors disabled:opacity-50">
                {analisandoParcelamentos ? 'Analisando...' : 'Analisar duplicatas'}
              </button>
              {parcelamentosMsg && (
                <p className={`text-xs ${parcelamentosMsg.startsWith('Erro') ? 'text-red-400' : parcelamentosMsg.startsWith('Nenhuma') ? 'text-[var(--fg)]/40' : 'text-green-400'}`}>
                  {parcelamentosMsg}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-[var(--fg)]/50 text-xs">
                {analiseParcelamentos.grupos.length} grupo(s) de duplicata encontrado(s) — {analiseParcelamentos.grupos.reduce((s, g) => s + g.quantidade, 0)} linhas ao todo, viram {analiseParcelamentos.grupos.length} após mesclar.
              </p>

              <div className="rounded-xl border border-[var(--fg)]/8 overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--fg)]/8 bg-[var(--fg)]/3">
                      <th className="text-left px-4 py-2.5 text-[var(--fg)]/40 font-semibold">Empresa</th>
                      <th className="text-left px-4 py-2.5 text-[var(--fg)]/40 font-semibold">CNPJ</th>
                      <th className="text-left px-4 py-2.5 text-[var(--fg)]/40 font-semibold">Seção</th>
                      <th className="text-right px-4 py-2.5 text-[var(--fg)]/40 font-semibold">Cópias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analiseParcelamentos.grupos.map(g => (
                      <tr key={g.chave} className="border-b border-[var(--fg)]/5 last:border-0">
                        <td className="px-4 py-3 text-[var(--fg)]/70">{g.empresa}</td>
                        <td className="px-4 py-3 text-[var(--fg)]/40">{g.cnpj ?? '—'}</td>
                        <td className="px-4 py-3 text-[var(--fg)]/40">{g.secao}</td>
                        <td className="px-4 py-3 text-right text-orange-300 font-semibold">{g.quantidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleAplicarLimpezaParcelamentos}
                  disabled={aplicandoParcelamentos}
                  className="px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-semibold hover:bg-orange-500/30 transition-colors disabled:opacity-50">
                  {aplicandoParcelamentos ? 'Aplicando...' : 'Mesclar e remover duplicatas'}
                </button>
                <button
                  onClick={() => { setAnaliseParcelamentos(null); setParcelamentosMsg('') }}
                  className="px-4 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/40 text-xs hover:bg-[var(--fg)]/10 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Divisor */}
          <div className="border-t border-[var(--fg)]/8 my-6" />

          {/* Alteração em massa */}
          <p className="text-[var(--fg)]/60 text-sm font-medium mb-1">Alteração em massa de tarefa</p>
          <p className="text-[var(--fg)]/30 text-xs mb-4">
            Selecione uma tarefa, escolha os clientes e informe o novo nome. Aplica em todos os selecionados de uma vez.
          </p>

          {!dadosAlteracao ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleCarregarDados}
                disabled={carregandoDados}
                className="px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-300 text-xs font-semibold hover:bg-violet-500/30 transition-colors disabled:opacity-50">
                {carregandoDados ? 'Carregando...' : 'Carregar tarefas'}
              </button>
              {alteracaoMsg && (
                <p className={`text-xs ${alteracaoMsg.startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                  {alteracaoMsg}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Seletor de modo */}
              <div className="flex gap-1.5">
                {([['renomear', 'Renomear'], ['excluir', 'Excluir'], ['data', 'Preencher data']] as const).map(([modo, label]) => (
                  <button
                    key={modo}
                    onClick={() => { setModoAlteracao(modo); setAlteracaoMsg('') }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${modoAlteracao === modo ? 'bg-violet-500/30 border border-violet-500/50 text-violet-200' : 'bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/40 hover:text-[var(--fg)]/70 hover:bg-[var(--fg)]/10'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Tarefa de origem (comum a todos os modos) */}
              <div>
                <label className={labelCls}>Tarefa</label>
                <select
                  value={tarefaOrigem}
                  onChange={e => handleSelecionarTarefaOrigem(e.target.value)}
                  className="w-full max-w-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50">
                  <option value="">— selecione —</option>
                  {dadosAlteracao.todasTarefas.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Campo específico por modo */}
              {modoAlteracao === 'renomear' && (
                <div>
                  <label className={labelCls}>Renomear para</label>
                  <select
                    value={tarefaDestino}
                    onChange={e => setTarefaDestino(e.target.value)}
                    className="w-full max-w-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50">
                    <option value="">— selecione o novo nome —</option>
                    {dadosAlteracao.todasTarefas.filter(t => t !== tarefaOrigem).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}

              {modoAlteracao === 'excluir' && tarefaOrigem && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                  <p className="text-red-300 text-xs">A tarefa <span className="font-semibold">'{tarefaOrigem}'</span> será removida da lista de cada cliente selecionado e todos os seus registros históricos serão excluídos.</p>
                </div>
              )}

              {modoAlteracao === 'data' && (
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className={labelCls}>Mês</label>
                    <select
                      value={mesPreenchimento}
                      onChange={e => setMesPreenchimento(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50">
                      {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => (
                        <option key={i} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Ano</label>
                    <input
                      type="number"
                      value={anoPreenchimento}
                      onChange={e => setAnoPreenchimento(Number(e.target.value))}
                      min={2020} max={2099}
                      className="w-24 px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Data de conclusão</label>
                    <input
                      type="date"
                      value={dataPreenchimento}
                      onChange={e => setDataPreenchimento(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50"
                    />
                  </div>
                </div>
              )}

              {/* Lista de clientes */}
              {tarefaOrigem && modoAlteracao === 'data' && carregandoConcluidos && (
                <p className="text-[var(--fg)]/30 text-xs py-2">Verificando quem já tem essa data preenchida...</p>
              )}
              {tarefaOrigem && !(modoAlteracao === 'data' && carregandoConcluidos) && (() => {
                let filtrados = dadosAlteracao.clientes.filter(c => c.tarefas.includes(tarefaOrigem))
                if (modoAlteracao === 'data' && concluidosData) {
                  filtrados = filtrados.filter(c => !concluidosData.has(c.id))
                }
                const todosSelected = filtrados.length > 0 && filtrados.every(c => clientesSelecionados.has(c.id))
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[var(--fg)]/40 text-xs">
                        {filtrados.length} cliente(s) {modoAlteracao === 'data' ? 'sem essa data preenchida' : 'com essa tarefa'}
                      </p>
                      {filtrados.length > 0 && (
                        <button
                          onClick={() => setClientesSelecionados(
                            todosSelected ? new Set() : new Set(filtrados.map(c => c.id))
                          )}
                          className="text-[var(--accent)] text-xs hover:underline">
                          {todosSelected ? 'Limpar seleção' : 'Selecionar todos'}
                        </button>
                      )}
                    </div>
                    {filtrados.length === 0 ? (
                      <p className="text-[var(--fg)]/20 text-xs py-2">
                        {modoAlteracao === 'data' ? 'Todos os clientes com essa tarefa já têm essa data preenchida.' : 'Nenhum cliente possui essa tarefa.'}
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                        {filtrados.map(c => (
                          <label key={c.id} className="flex items-center gap-2 cursor-pointer select-none px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/3 border border-[var(--fg)]/6 hover:bg-[var(--fg)]/6 transition-colors">
                            <input
                              type="checkbox"
                              checked={clientesSelecionados.has(c.id)}
                              onChange={e => {
                                const next = new Set(clientesSelecionados)
                                if (e.target.checked) next.add(c.id); else next.delete(c.id)
                                setClientesSelecionados(next)
                              }}
                              className="w-3.5 h-3.5 accent-[var(--accent)] shrink-0"
                            />
                            <span className="text-[var(--fg)]/70 text-xs truncate">{c.nome}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Preview */}
              {tarefaOrigem && clientesSelecionados.size > 0 && (
                <div className="rounded-lg bg-[var(--fg)]/3 border border-[var(--fg)]/8 px-4 py-3 text-xs text-[var(--fg)]/60">
                  {modoAlteracao === 'renomear' && tarefaDestino && tarefaDestino !== tarefaOrigem && (
                    <>Renomear <span className="text-[var(--fg)] font-semibold">'{tarefaOrigem}'</span> → <span className="text-[var(--accent)] font-semibold">'{tarefaDestino}'</span> em <span className="text-[var(--fg)] font-semibold">{clientesSelecionados.size}</span> cliente(s)</>
                  )}
                  {modoAlteracao === 'excluir' && (
                    <>Excluir <span className="text-[var(--fg)] font-semibold">'{tarefaOrigem}'</span> de <span className="text-[var(--fg)] font-semibold">{clientesSelecionados.size}</span> cliente(s)</>
                  )}
                  {modoAlteracao === 'data' && dataPreenchimento && (
                    <>Marcar <span className="text-[var(--fg)] font-semibold">'{tarefaOrigem}'</span> como concluída em <span className="text-[var(--accent)] font-semibold">{new Date(dataPreenchimento + 'T12:00:00').toLocaleDateString('pt-BR')}</span> para <span className="text-[var(--fg)] font-semibold">{clientesSelecionados.size}</span> cliente(s) — {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][mesPreenchimento - 1]}/{anoPreenchimento}</>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleAplicarAlteracao}
                  disabled={aplicandoAlteracao || !tarefaOrigem || clientesSelecionados.size === 0}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${modoAlteracao === 'excluir' ? 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30' : 'bg-violet-500/20 border border-violet-500/40 text-violet-300 hover:bg-violet-500/30'}`}>
                  {aplicandoAlteracao ? 'Aplicando...' : 'Confirmar e aplicar'}
                </button>
                <button
                  onClick={() => { setDadosAlteracao(null); setAlteracaoMsg('') }}
                  className="px-4 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/40 text-xs hover:bg-[var(--fg)]/10 transition-colors">
                  Cancelar
                </button>
                {alteracaoMsg && (
                  <p className={`text-xs ${alteracaoMsg.startsWith('Erro') || alteracaoMsg.startsWith('Selecione') ? 'text-red-400' : 'text-green-400'}`}>
                    {alteracaoMsg}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Divisor */}
          <div className="border-t border-[var(--fg)]/8 my-6" />

          {/* Tarefas sem data */}
          <p className="text-[var(--fg)]/60 text-sm font-medium mb-1">Registros sem data de conclusão</p>
          <p className="text-[var(--fg)]/30 text-xs mb-4">
            Cruza todos os clientes com suas tarefas personalizadas e lista as que não têm data de conclusão no mês/ano selecionado.
          </p>

          {!dadosSemData ? (
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={mesFiltroSemData}
                onChange={e => { setMesFiltroSemData(Number(e.target.value)); setDadosSemData(null); setSemDataMsg('') }}
                className="px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/80 text-xs">
                {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((nome, i) => (
                  <option key={i+1} value={i+1}>{nome}</option>
                ))}
              </select>
              <select
                value={anoFiltroSemData}
                onChange={e => { setAnoFiltroSemData(Number(e.target.value)); setDadosSemData(null); setSemDataMsg('') }}
                className="px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/80 text-xs">
                {[2024, 2025, 2026, 2027].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <button
                onClick={handleAnalisarSemData}
                disabled={analisandoSemData}
                className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold hover:bg-rose-500/30 transition-colors disabled:opacity-50">
                {analisandoSemData ? 'Analisando...' : 'Analisar registros sem data'}
              </button>
              {semDataMsg && (
                <p className={`text-xs ${semDataMsg.startsWith('Erro') ? 'text-red-400' : semDataMsg.startsWith('Nenhum') ? 'text-[var(--fg)]/40' : 'text-green-400'}`}>
                  {semDataMsg}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-[var(--fg)]/40 text-xs">{dadosSemData.totalRegistros} tarefa(s) sem conclusão em {dadosSemData.registros.length} tipo(s) — {dadosSemData.registros.reduce((s, r) => s + r.ids.length, 0)} com registro excluível</p>
                <button
                  onClick={() => setSelecionadosSemData(
                    selecionadosSemData.size === dadosSemData.registros.length
                      ? new Set()
                      : new Set(dadosSemData.registros.map(r => `${r.tipo}||${r.mes}||${r.ano}`))
                  )}
                  className="text-[var(--accent)] text-xs hover:underline">
                  {selecionadosSemData.size === dadosSemData.registros.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>

              <div className="rounded-xl border border-[var(--fg)]/8 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--fg)]/8 bg-[var(--fg)]/3">
                      <th className="w-8 px-3 py-2.5"></th>
                      <th className="text-left px-3 py-2.5 text-[var(--fg)]/40 font-semibold">Tarefa</th>
                      <th className="text-left px-3 py-2.5 text-[var(--fg)]/40 font-semibold">Mês/Ano</th>
                      <th className="text-right px-3 py-2.5 text-[var(--fg)]/40 font-semibold">Registros</th>
                      <th className="text-left px-3 py-2.5 text-[var(--fg)]/40 font-semibold">Clientes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosSemData.registros.map(r => {
                      const key = `${r.tipo}||${r.mes}||${r.ano}`
                      const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
                      return (
                        <tr key={key} className="border-b border-[var(--fg)]/5 last:border-0 hover:bg-[var(--fg)]/2">
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={selecionadosSemData.has(key)}
                              onChange={e => {
                                const next = new Set(selecionadosSemData)
                                if (e.target.checked) next.add(key); else next.delete(key)
                                setSelecionadosSemData(next)
                              }}
                              className="w-3.5 h-3.5 accent-rose-400"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-[var(--fg)] font-medium">{r.tipo}</td>
                          <td className="px-3 py-2.5 text-[var(--fg)]/60">{meses[r.mes - 1]}/{r.ano}</td>
                          <td className="px-3 py-2.5 text-right text-[var(--fg)]/50">
                            {r.total}
                            {r.semRegistro > 0 && <span className="ml-1 text-[var(--fg)]/25 text-[10px]">({r.semRegistro} s/reg)</span>}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--fg)]/40 truncate max-w-[260px]">{r.clientes.join(', ')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleExcluirSemData}
                  disabled={excluindoSemData || selecionadosSemData.size === 0}
                  className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50">
                  {excluindoSemData ? 'Excluindo...' : `Excluir selecionados (${[...selecionadosSemData].reduce((acc, key) => acc + (dadosSemData.registros.find(r => `${r.tipo}||${r.mes}||${r.ano}` === key)?.ids.length ?? 0), 0)} registros)`}
                </button>
                <button
                  onClick={() => { setDadosSemData(null); setSemDataMsg('') }}
                  className="px-4 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/40 text-xs hover:bg-[var(--fg)]/10 transition-colors">
                  Cancelar
                </button>
                {semDataMsg && (
                  <p className={`text-xs ${semDataMsg.startsWith('Erro') ? 'text-red-400' : 'text-green-400'}`}>
                    {semDataMsg}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        </DevLock>
      </div>

      {/* Log modal */}
      {logModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-page)] border border-[var(--fg)]/10 rounded-2xl w-full max-w-5xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8">
              <h2 className="text-[var(--fg)] font-semibold">
                {logModal === 'tarefas' ? `Log de Tarefas (últimos ${taskLogs.length})` : `Log de Exclusões (últimos ${deletionLogs.length})`}
              </h2>
              <button onClick={() => setLogModal(null)}
                className="w-8 h-8 rounded-lg bg-[var(--fg)]/5 hover:bg-[var(--fg)]/10 text-[var(--fg)]/50 hover:text-[var(--fg)] transition-colors flex items-center justify-center text-sm">
                ✕
              </button>
            </div>
            <div className="overflow-auto p-6">
              {logModal === 'tarefas' ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--fg)]/8">
                      {['Data/Hora','Usuário','Cliente','Tarefa','Comp.','Antes','Depois','Motivo'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-[var(--fg)]/40 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {taskLogs.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-6 text-center text-[var(--fg)]/20">Nenhum registro</td></tr>
                    )}
                    {taskLogs.map(log => (
                      <tr key={log.id} className="border-b border-[var(--fg)]/5 hover:bg-[var(--fg)]/2">
                        <td className="px-3 py-2 text-[var(--fg)]/50 whitespace-nowrap">{formatDate(log.created_at)}</td>
                        <td className="px-3 py-2 text-[var(--fg)]/70">{log.usuario ?? '—'}</td>
                        <td className="px-3 py-2 text-[var(--fg)]/70">{log.cliente ?? '—'}</td>
                        <td className="px-3 py-2 text-[var(--fg)]/70">{log.tarefa ?? '—'}</td>
                        <td className="px-3 py-2 text-[var(--fg)]/70">{log.comp ?? '—'}</td>
                        <td className="px-3 py-2 text-[var(--fg)]/50">{log.antes ?? '—'}</td>
                        <td className="px-3 py-2 text-[var(--fg)]/50">{log.depois ?? '—'}</td>
                        <td className="px-3 py-2 text-[var(--fg)]/50">{log.motivo ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--fg)]/8">
                      {['Data/Hora','Usuário','Tipo','Nome','Detalhes'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-[var(--fg)]/40 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deletionLogs.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--fg)]/20">Nenhum registro</td></tr>
                    )}
                    {deletionLogs.map(log => (
                      <tr key={log.id} className="border-b border-[var(--fg)]/5 hover:bg-[var(--fg)]/2">
                        <td className="px-3 py-2 text-[var(--fg)]/50 whitespace-nowrap">{formatDate(log.created_at)}</td>
                        <td className="px-3 py-2 text-[var(--fg)]/70">{log.usuario ?? '—'}</td>
                        <td className="px-3 py-2 text-[var(--fg)]/70">{log.tipo ?? '—'}</td>
                        <td className="px-3 py-2 text-[var(--fg)]/70">{log.nome ?? '—'}</td>
                        <td className="px-3 py-2 text-[var(--fg)]/50">{log.detalhes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
