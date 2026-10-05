'use client'

// Provisório: bloco antigo de usuários movido como estava; a tabela com
// gaveta entra no commit seguinte.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/lib/types'
import { SETORES, SETOR_LABEL, type UserSetor } from '@/lib/types'
import { PAGINAS_POR_SETOR } from '@/lib/paginas-setor'
import { atualizarPerfil, criarUsuario, deletarUsuario } from './actions'

const inputCls = "w-full px-4 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/8 text-[var(--fg)] text-sm placeholder-[var(--fg)]/20 focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const labelCls = "block text-xs font-bold text-[var(--accent)] uppercase tracking-widest mb-1.5"


export default function AbaUsuarios({ profiles, currentUserId }: { profiles: Profile[]; currentUserId: string }) {
  const router = useRouter()

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

  const sectionHeader = (title: string) => (
    <p className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest mb-4">{title}</p>
  )

  return (
    <>
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
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
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
                            className="flex-1 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
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
    </>
  )
}
