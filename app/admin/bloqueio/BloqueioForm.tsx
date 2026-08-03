'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminLogin, adminLogout, trocarSenhaInicial } from './actions'

type View = 'login' | 'trocar_senha'

interface Props {
  initialView: View
  next: string
}

const inputCls = "w-full bg-[var(--fg)]/5 border border-[var(--fg)]/10 rounded-xl px-4 py-3 text-[var(--fg)] placeholder-[var(--fg)]/20 focus:outline-none focus:border-[var(--accent)] transition-colors text-sm"

function OlhoIcon({ aberto }: { aberto: boolean }) {
  return aberto ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

export default function BloqueioForm({ initialView, next }: Props) {
  const router = useRouter()
  // A troca entre login/trocar-senha acontece via navegação de servidor
  // (o proxy.ts redireciona com `etapa=trocar-senha` quando necessário),
  // não por estado client-side — por isso não há um setter aqui.
  const view: View = initialView

  // Login
  const [username, setUsername] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  // Troca de senha (primeiro acesso)
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false)
  const [erroTroca, setErroTroca] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)

    const result = await adminLogin(username, senha)

    if (result.error) {
      setErro(result.error)
      setSenha('')
      setCarregando(false)
      return
    }

    router.push(next)
    router.refresh()
  }

  async function handleTrocarSenha(e: React.FormEvent) {
    e.preventDefault()
    setErroTroca(null)
    setSalvando(true)

    const result = await trocarSenhaInicial(novaSenha, confirmarSenha)

    if (result.error) {
      setErroTroca(result.error)
      setSalvando(false)
      return
    }

    router.push(next)
    router.refresh()
  }

  async function handleSair() {
    await adminLogout()
  }

  /* ---- Sub-estado: definir nova senha (primeiro acesso) ---- */
  if (view === 'trocar_senha') {
    return (
      <form onSubmit={handleTrocarSenha} className="flex flex-col gap-4">
        <div>
          <p className="text-[var(--fg)] font-semibold text-sm mb-1">Defina sua nova senha</p>
          <p className="text-[var(--fg)]/40 text-xs">Este é o seu primeiro acesso à área ADMIN. Defina uma nova senha para continuar.</p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="nova-senha" className="text-sm text-[var(--fg)]/60">Nova senha</label>
          <div className="relative">
            <input
              id="nova-senha"
              type={mostrarNovaSenha ? 'text' : 'password'}
              value={novaSenha}
              onChange={e => setNovaSenha(e.target.value)}
              required
              autoFocus
              placeholder="••••••••"
              className={`${inputCls} pr-11`}
            />
            <button
              type="button"
              onClick={() => setMostrarNovaSenha(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fg)]/30 hover:text-[var(--fg)]/70 transition-colors p-1"
              aria-label={mostrarNovaSenha ? 'Ocultar senha' : 'Mostrar senha'}
            >
              <OlhoIcon aberto={!mostrarNovaSenha} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirmar-senha" className="text-sm text-[var(--fg)]/60">Confirmar nova senha</label>
          <input
            id="confirmar-senha"
            type={mostrarNovaSenha ? 'text' : 'password'}
            value={confirmarSenha}
            onChange={e => setConfirmarSenha(e.target.value)}
            required
            placeholder="••••••••"
            className={inputCls}
          />
        </div>

        {erroTroca && <p role="alert" className="text-red-400 text-sm text-center">{erroTroca}</p>}

        <button
          type="submit"
          disabled={salvando}
          className="mt-1 py-3 rounded-xl bg-[var(--accent)] text-[var(--fg)] font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {salvando ? 'Salvando...' : 'Definir senha e continuar'}
        </button>

        <button type="button" onClick={handleSair}
          className="text-[var(--fg)]/40 text-sm hover:text-[var(--fg)]/70 transition-colors text-center">
          Sair da área ADMIN
        </button>
      </form>
    )
  }

  /* ---- Sub-estado: login ---- */
  return (
    <form onSubmit={handleLogin} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-sm text-[var(--fg)]/60">Usuário</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
          autoFocus
          placeholder="Usuário"
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="senha-admin" className="text-sm text-[var(--fg)]/60">Senha</label>
        <div className="relative">
          <input
            id="senha-admin"
            type={mostrarSenha ? 'text' : 'password'}
            value={senha}
            onChange={e => setSenha(e.target.value)}
            required
            placeholder="••••••••"
            className={`${inputCls} pr-11`}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fg)]/30 hover:text-[var(--fg)]/70 transition-colors p-1"
            aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
          >
            <OlhoIcon aberto={!mostrarSenha} />
          </button>
        </div>
      </div>

      {erro && <p role="alert" className="text-red-400 text-sm text-center">{erro}</p>}

      <button
        type="submit"
        disabled={carregando}
        className="mt-1 py-3 rounded-xl bg-[var(--accent)] text-[var(--fg)] font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {carregando ? 'Entrando...' : 'Entrar na área ADMIN'}
      </button>
    </form>
  )
}
