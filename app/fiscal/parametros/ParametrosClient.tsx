'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/lib/types'
import { SETORES, SETOR_LABEL, type UserSetor } from '@/lib/types'
import { PAGINAS_POR_SETOR } from '@/lib/paginas-setor'
import { salvarComunicado, atualizarPerfil, criarUsuario, deletarUsuario, salvarConfiguracoes } from './actions'
import { salvarTemplate, aplicarTemplateAClientes, salvarTemplateGrupo, aplicarTemplateGrupoAClientes, analisarParcelamentosDuplicados, limparParcelamentosDuplicados } from './actions'
import type { GrupoParcelamentoDuplicado } from './actions'
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
  currentUserId: string
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

export default function ParametrosClient({ profiles, currentUserId, dashboardAnnouncement, taskLogs, deletionLogs, emailSettings = {}, atividadeTemplates, grupoTemplates }: Props) {
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
  const [enviandoRelatorio, setEnviandoRelatorio] = useState(false)
  const [enviandoLogTeste, setEnviandoLogTeste] = useState(false)

  // Usuários
  const [editingProfile, setEditingProfile] = useState<string | null>(null)
  const [profileEdits, setProfileEdits] = useState<Record<string, Partial<Profile>>>({})
  const [savingProfile, setSavingProfile] = useState<string | null>(null)
  const [deletingProfile, setDeletingProfile] = useState<string | null>(null)

  // Novo usuário
  const [novoNome, setNovoNome] = useState('')
  const [novoLogin, setNovoLogin] = useState('')
  const [novoSenha, setNovoSenha] = useState('')
  const [novoPerfil, setNovoPerfil] = useState('operador')
  const [novoCor, setNovoCor] = useState('#6366f1')
  const [novoPaginas, setNovoPaginas] = useState<string[]>(
    PAGINAS_POR_SETOR.fiscal.filter(p => p.slug !== 'dashboard').map(p => `fiscal:${p.slug}`)
  )
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
  const [templateAviso, setTemplateAviso] = useState<Record<string, string[]>>({})

  // Templates de grupo
  const GRUPOS_TEMPLATE = [
    { value: 'normal',  label: 'Regime Normal' },
    { value: 'simples', label: 'Simples Nacional' },
    { value: 'mei',     label: 'MEI' },
    { value: 'isento',  label: 'Isento' },
  ]
  const [templatesGrupo, setTemplatesGrupo] = useState<Record<string, string[]>>({
    normal:  grupoTemplates['normal']  ?? [],
    simples: grupoTemplates['simples'] ?? [],
    mei:     grupoTemplates['mei']     ?? [],
    isento:  grupoTemplates['isento']  ?? [],
  })
  const [novasTarefasGrupo, setNovasTarefasGrupo] = useState<Record<string, string>>({
    normal: '', simples: '', mei: '', isento: '',
  })
  const [salvandoTemplateGrupo, setSalvandoTemplateGrupo] = useState<string | null>(null)
  const [aplicandoTemplateGrupo, setAplicandoTemplateGrupo] = useState<string | null>(null)
  const [templateGrupoMsg, setTemplateGrupoMsg] = useState<Record<string, string>>({})
  const [templateGrupoAviso, setTemplateGrupoAviso] = useState<Record<string, string[]>>({})
  // Parcelamentos duplicados
  const [analisandoParcelamentos, setAnalisandoParcelamentos] = useState(false)
  const [analiseParcelamentos, setAnaliseParcelamentos] = useState<{ grupos: GrupoParcelamentoDuplicado[] } | null>(null)
  const [aplicandoParcelamentos, setAplicandoParcelamentos] = useState(false)
  const [parcelamentosMsg, setParcelamentosMsg] = useState('')

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
    const paginasAcesso = edits.paginas_acesso ?? profile.paginas_acesso ?? []
    for (const c of paginasAcesso) fd.append('paginas_acesso', c)
    await atualizarPerfil(id, fd)
    setSavingProfile(null)
    setEditingProfile(null)
    router.refresh()
  }

  async function handleDeletarUsuario(id: string, nome: string) {
    if (!confirm(`Excluir o usuário "${nome}"? Essa ação não pode ser desfeita.`)) return
    setDeletingProfile(id)
    const result = await deletarUsuario(id)
    setDeletingProfile(null)
    if (result.error) {
      alert(result.error)
      return
    }
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

  async function handleEnviarRelatorios() {
    setEnviandoRelatorio(true)
    const res = await fetch('/api/relatorios/fiscal', { method: 'POST' })
    const data = await res.json()
    setEnviandoRelatorio(false)
    setEmailMsg(res.ok
      ? `${data.enviados} relatório(s) enviado(s): ${data.responsaveis.join(', ')}`
      : `Erro: ${data.error ?? 'falha ao enviar'}`)
    setTimeout(() => setEmailMsg(''), 5000)
  }

  async function handleTestarLog() {
    if (!emailDest.trim()) {
      setEmailMsg('Erro: preencha o e-mail destinatário antes de testar.')
      setTimeout(() => setEmailMsg(''), 3000)
      return
    }
    setEnviandoLogTeste(true)
    const res = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        para: emailDest,
        assunto: 'Teste — Log de Rotinas (Tesserato Fiscal)',
        corpo: 'Este é um e-mail de teste da rotina de envio de log do Portal Tesserato.',
      }),
    })
    const data = await res.json()
    setEnviandoLogTeste(false)
    setEmailMsg(res.ok ? 'Log de teste enviado!' : `Erro: ${data.error ?? 'falha ao enviar'}`)
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
      paginasAcesso: novoPaginas,
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
      setNovoPaginas(PAGINAS_POR_SETOR.fiscal.filter(p => p.slug !== 'dashboard').map(p => `fiscal:${p.slug}`))
      setNovoSetores(['fiscal'])
      router.refresh()
      setTimeout(() => setNovoUserOk(false), 3000)
    }
  }

  function togglePagina(chave: string) {
    setNovoPaginas(prev => prev.includes(chave) ? prev.filter(c => c !== chave) : [...prev, chave])
  }

  function toggleSetor(setor: string) {
    setNovoSetores(prev => {
      const removendo = prev.includes(setor)
      if (removendo) {
        setNovoPaginas(p => p.filter(chave => !chave.startsWith(`${setor}:`)))
      }
      return removendo ? prev.filter(s => s !== setor) : [...prev, setor]
    })
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
    setTemplateAviso(prev => ({ ...prev, [base]: result.avisoForaCatalogo ?? [] }))
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
    setTemplateGrupoAviso(prev => ({ ...prev, [grupo]: result.avisoForaCatalogo ?? [] }))
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
            <button onClick={handleEnviarRelatorios} disabled={enviandoRelatorio}
              className="px-4 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 text-sm hover:bg-[var(--fg)]/10 transition-colors disabled:opacity-50">
              {enviandoRelatorio ? 'Enviando...' : 'Enviar relatórios agora'}
            </button>
            <button onClick={handleTestarLog} disabled={enviandoLogTeste}
              className="px-4 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/70 text-sm hover:bg-[var(--fg)]/10 transition-colors disabled:opacity-50">
              {enviandoLogTeste ? 'Enviando...' : 'Enviar log agora (teste)'}
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

              {novoSetores.filter(s => PAGINAS_POR_SETOR[s as UserSetor].length > 0).map(setor => (
                <div key={setor}>
                  <label className={labelCls}>Páginas — {SETOR_LABEL[setor as UserSetor]}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAGINAS_POR_SETOR[setor as UserSetor].filter(p => p.slug !== 'dashboard').map(p => {
                      const chave = `${setor}:${p.slug}`
                      return (
                        <label key={chave} className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={novoPaginas.includes(chave)} onChange={() => togglePagina(chave)}
                            className="w-3.5 h-3.5 accent-[var(--accent)]" />
                          <span className="text-[var(--fg)]/60 text-xs">{p.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}

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
                                  const removendo = atual.includes(setor)
                                  const novo = removendo ? atual.filter(s => s !== setor) : [...atual, setor]
                                  const paginasAtual = edits.paginas_acesso ?? p.paginas_acesso ?? []
                                  const paginasNovo = removendo
                                    ? paginasAtual.filter(c => !c.startsWith(`${setor}:`))
                                    : paginasAtual
                                  setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], setores: novo, paginas_acesso: paginasNovo } }))
                                }}
                                className="w-3.5 h-3.5 accent-[var(--accent)]"
                              />
                              <span className="text-[var(--fg)]/60 text-xs">{SETOR_LABEL[setor]}</span>
                            </label>
                          ))}
                        </div>
                        {(edits.setores ?? p.setores).filter(s => PAGINAS_POR_SETOR[s].length > 0).map(setor => (
                          <div key={setor}>
                            <p className="text-[var(--fg)]/40 text-[10px] uppercase tracking-widest mb-1">Páginas — {SETOR_LABEL[setor]}</p>
                            <div className="grid grid-cols-2 gap-2">
                              {PAGINAS_POR_SETOR[setor].filter(pg => pg.slug !== 'dashboard').map(pg => {
                                const chave = `${setor}:${pg.slug}`
                                const atual = edits.paginas_acesso ?? p.paginas_acesso ?? []
                                return (
                                  <label key={chave} className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={atual.includes(chave)}
                                      onChange={() => {
                                        const novo = atual.includes(chave) ? atual.filter(c => c !== chave) : [...atual, chave]
                                        setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], paginas_acesso: novo } }))
                                      }}
                                      className="w-3.5 h-3.5 accent-[var(--accent)]"
                                    />
                                    <span className="text-[var(--fg)]/60 text-xs">{pg.label}</span>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        ))}
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
                        {p.id !== currentUserId && (
                          <button onClick={() => handleDeletarUsuario(p.id, p.nome)} disabled={deletingProfile === p.id}
                            className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400/70 hover:text-red-400 hover:bg-red-500/15 text-xs transition-colors disabled:opacity-50">
                            {deletingProfile === p.id ? 'Excluindo...' : 'Excluir'}
                          </button>
                        )}
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
                  {(templateAviso[base]?.length ?? 0) > 0 && (
                    <p className="text-xs text-center text-amber-400">
                      Fora do catálogo: {templateAviso[base].join(', ')}
                    </p>
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
            Configure as tarefas padrão para cada grupo (Regime Normal, Simples Nacional, MEI, Isento).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  {(templateGrupoAviso[grupo]?.length ?? 0) > 0 && (
                    <p className="text-xs text-center text-amber-400">
                      Fora do catálogo: {templateGrupoAviso[grupo].join(', ')}
                    </p>
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
