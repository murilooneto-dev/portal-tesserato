'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/lib/types'
import { salvarComunicado, atualizarPerfil, criarUsuario, salvarConfiguracoes } from './actions'

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
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const ABAS = [
  'Intranet', 'Dashboard', 'Clientes', 'Calendários',
  'Conferência', 'Relatórios', 'Histórico', 'Empresas', 'Parcelamentos',
]

const inputCls = "w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/8 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00B8D4]/50 transition-colors"
const labelCls = "block text-xs font-bold text-[#00B8D4] uppercase tracking-widest mb-1.5"

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!on)}
        className={`relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-[#00B8D4]' : 'bg-white/10'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
      {label && <span className="text-xs text-white/50">{label}</span>}
    </label>
  )
}

export default function ParametrosClient({ profiles, dashboardAnnouncement, taskLogs, deletionLogs, emailSettings = {} }: Props) {
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
  const [criandoUser, setCriandoUser] = useState(false)
  const [novoUserErr, setNovoUserErr] = useState('')
  const [novoUserOk, setNovoUserOk] = useState(false)

  // Logs modais
  const [logModal, setLogModal] = useState<'tarefas' | 'exclusoes' | null>(null)

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
      router.refresh()
      setTimeout(() => setNovoUserOk(false), 3000)
    }
  }

  function toggleAba(aba: string) {
    setNovoAbas(prev => prev.includes(aba) ? prev.filter(a => a !== aba) : [...prev, aba])
  }

  const sectionHeader = (title: string) => (
    <p className="text-xs font-bold text-[#00B8D4] uppercase tracking-widest mb-4">{title}</p>
  )

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Parâmetros</h1>
          <p className="text-white/40 mt-1 text-sm">Configurações do portal — administradores estão para a equipe</p>
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
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
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
              className="px-4 py-2 rounded-xl bg-[#00B8D4] text-white text-sm font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50"
            >
              {savingAnn ? 'Salvando...' : 'Salvar comunicado'}
            </button>
            {annSaved && <span className="text-green-400 text-sm">Salvo!</span>}
          </div>
        </div>

        {/* Rotinas de E-mail */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
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
              className="w-4 h-4 accent-[#00B8D4]" />
            <label htmlFor="usarSenhaApp" className="text-white/50 text-xs">Usar Senha de App (recomendado para contas com 2FA)</label>
          </div>

          {/* Rotinas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[
              { label: 'Rotina 1', ativo: rotina1Ativo, setAtivo: setRotina1Ativo, dia: rotina1Dia, setDia: setRotina1Dia, hora: rotina1Hora, setHora: setRotina1Hora },
              { label: 'Rotina 2', ativo: rotina2Ativo, setAtivo: setRotina2Ativo, dia: rotina2Dia, setDia: setRotina2Dia, hora: rotina2Hora, setHora: setRotina2Hora },
            ].map(r => (
              <div key={r.label} className="bg-white/3 border border-white/8 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white text-sm font-semibold">{r.label}</span>
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
          <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">Rotinas Log</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {logSlots.map((slot, i) => (
              <div key={i} className="bg-white/3 border border-white/8 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-xs font-semibold">ENVIO {i + 1}</span>
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
              className="px-4 py-2 rounded-xl bg-[#00B8D4] text-white text-sm font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50">
              {savingEmail ? 'Salvando...' : 'Salvar configuração'}
            </button>
            <button className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 transition-colors">
              Enviar relatórios agora (teste)
            </button>
            <button className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 transition-colors">
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
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
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
                    className="w-full px-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/8 text-white text-sm focus:outline-none focus:border-[#00B8D4]/50 transition-colors">
                    <option value="operador">Operador</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Cor de identificação</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={novoCor} onChange={e => setNovoCor(e.target.value)}
                      className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0" />
                    <span className="text-white/40 text-sm font-mono">{novoCor}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className={labelCls}>Acesso às Abas</label>
                <div className="grid grid-cols-3 gap-2">
                  {ABAS.map(aba => (
                    <label key={aba} className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={novoAbas.includes(aba)} onChange={() => toggleAba(aba)}
                        className="w-3.5 h-3.5 accent-[#00B8D4]" />
                      <span className="text-white/60 text-xs">{aba}</span>
                    </label>
                  ))}
                </div>
              </div>

              {novoUserErr && <p className="text-red-400 text-sm">{novoUserErr}</p>}
              {novoUserOk && <p className="text-green-400 text-sm">Usuário criado com sucesso!</p>}

              <button onClick={handleCriarUsuario} disabled={criandoUser}
                className="w-full py-2.5 rounded-xl bg-[#00B8D4] text-white text-sm font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50">
                {criandoUser ? 'Criando...' : 'Criar usuário'}
              </button>
              <p className="text-white/20 text-xs text-center">Usuários criados aqui têm acesso apenas ao setor fiscal.</p>
            </div>
          </div>

          {/* Usuários cadastrados */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
            {sectionHeader('Usuários Cadastrados')}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {profiles.length === 0 && (
                <p className="text-white/20 text-sm text-center py-8">Nenhum usuário encontrado.</p>
              )}
              {profiles.map(p => {
                const isEditing = editingProfile === p.id
                const edits = profileEdits[p.id] ?? {}
                return (
                  <div key={p.id} className="p-4 rounded-xl bg-white/3 border border-white/6">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                            style={{ backgroundColor: edits.cor ?? p.cor }}>
                            {(edits.nome ?? p.nome).charAt(0).toUpperCase()}
                          </div>
                          <input
                            value={edits.nome ?? p.nome}
                            onChange={e => setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], nome: e.target.value } }))}
                            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <select
                            value={edits.role ?? p.role}
                            onChange={e => setProfileEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], role: e.target.value as Profile['role'] } }))}
                            className="flex-1 px-3 py-2 rounded-lg bg-[#0d1117] border border-white/10 text-white text-sm focus:outline-none"
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
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveProfile(p.id)} disabled={savingProfile === p.id}
                            className="flex-1 py-1.5 rounded-lg bg-[#00B8D4] text-white text-xs font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50">
                            {savingProfile === p.id ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button onClick={() => { setEditingProfile(null); setProfileEdits(prev => { const n = { ...prev }; delete n[p.id]; return n }) }}
                            className="flex-1 py-1.5 rounded-lg bg-white/5 text-white/50 text-xs hover:bg-white/10 transition-colors">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                          style={{ backgroundColor: p.cor }}>
                          {p.nome.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm truncate">{p.nome}</p>
                          <p className="text-white/35 text-xs mt-0.5">{p.setor ?? 'fiscal'} · {p.role}</p>
                        </div>
                        <button onClick={() => setEditingProfile(p.id)}
                          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-white/50 hover:text-white hover:bg-white/10 text-xs transition-colors">
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
      </div>

      {/* Log modal */}
      {logModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
              <h2 className="text-white font-semibold">
                {logModal === 'tarefas' ? `Log de Tarefas (últimos ${taskLogs.length})` : `Log de Exclusões (últimos ${deletionLogs.length})`}
              </h2>
              <button onClick={() => setLogModal(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors flex items-center justify-center text-sm">
                ✕
              </button>
            </div>
            <div className="overflow-auto p-6">
              {logModal === 'tarefas' ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/8">
                      {['Data/Hora','Usuário','Cliente','Tarefa','Comp.','Antes','Depois','Motivo'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-white/40 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {taskLogs.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-6 text-center text-white/20">Nenhum registro</td></tr>
                    )}
                    {taskLogs.map(log => (
                      <tr key={log.id} className="border-b border-white/5 hover:bg-white/2">
                        <td className="px-3 py-2 text-white/50 whitespace-nowrap">{formatDate(log.created_at)}</td>
                        <td className="px-3 py-2 text-white/70">{log.usuario ?? '—'}</td>
                        <td className="px-3 py-2 text-white/70">{log.cliente ?? '—'}</td>
                        <td className="px-3 py-2 text-white/70">{log.tarefa ?? '—'}</td>
                        <td className="px-3 py-2 text-white/70">{log.comp ?? '—'}</td>
                        <td className="px-3 py-2 text-white/50">{log.antes ?? '—'}</td>
                        <td className="px-3 py-2 text-white/50">{log.depois ?? '—'}</td>
                        <td className="px-3 py-2 text-white/50">{log.motivo ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/8">
                      {['Data/Hora','Usuário','Tipo','Nome','Detalhes'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-white/40 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deletionLogs.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-white/20">Nenhum registro</td></tr>
                    )}
                    {deletionLogs.map(log => (
                      <tr key={log.id} className="border-b border-white/5 hover:bg-white/2">
                        <td className="px-3 py-2 text-white/50 whitespace-nowrap">{formatDate(log.created_at)}</td>
                        <td className="px-3 py-2 text-white/70">{log.usuario ?? '—'}</td>
                        <td className="px-3 py-2 text-white/70">{log.tipo ?? '—'}</td>
                        <td className="px-3 py-2 text-white/70">{log.nome ?? '—'}</td>
                        <td className="px-3 py-2 text-white/50">{log.detalhes ?? '—'}</td>
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
