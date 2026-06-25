'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type View = 'login' | 'forgot' | 'forgot_sent'

export default function LoginForm() {
  const router = useRouter()
  const [view, setView] = useState<View>('login')

  // Login
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [lembrar, setLembrar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  // Esqueci a senha
  const [emailReset, setEmailReset] = useState('')
  const [erroReset, setErroReset] = useState<string | null>(null)
  const [enviandoReset, setEnviandoReset] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      setErro('E-mail ou senha incorretos.')
      setCarregando(false)
      return
    }

    // Se não quiser permanecer conectado, limpa a sessão ao fechar o navegador
    if (!lembrar) {
      window.addEventListener('beforeunload', () => {
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith('sb-') && k.includes('-auth-token')) localStorage.removeItem(k)
        })
      })
    }

    router.push('/')
    router.refresh()
  }

  async function handleEsqueciSenha(e: React.FormEvent) {
    e.preventDefault()
    setErroReset(null)
    setEnviandoReset(true)

    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(emailReset.trim(), { redirectTo })

    setEnviandoReset(false)
    if (error) {
      setErroReset('Não foi possível enviar o e-mail. Verifique o endereço.')
    } else {
      setView('forgot_sent')
    }
  }

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#00B8D4] transition-colors text-sm"

  /* ---- Tela de redefinição enviada ---- */
  if (view === 'forgot_sent') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-400 text-xl">✓</div>
        <div>
          <p className="text-white font-semibold">E-mail enviado!</p>
          <p className="text-white/40 text-sm mt-1">Verifique sua caixa de entrada em <span className="text-white/70">{emailReset}</span> e siga as instruções para redefinir sua senha.</p>
        </div>
        <button onClick={() => { setView('login'); setEmailReset('') }}
          className="text-[#00B8D4] text-sm hover:underline mt-2">
          Voltar ao login
        </button>
      </div>
    )
  }

  /* ---- Tela de esqueci a senha ---- */
  if (view === 'forgot') {
    return (
      <form onSubmit={handleEsqueciSenha} className="flex flex-col gap-4">
        <div>
          <p className="text-white font-semibold text-sm mb-1">Redefinir senha</p>
          <p className="text-white/40 text-xs">Digite seu e-mail e enviaremos um link para criar uma nova senha.</p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-white/60">E-mail</label>
          <input
            type="email"
            value={emailReset}
            onChange={e => setEmailReset(e.target.value)}
            required
            autoFocus
            placeholder="seu@email.com"
            className={inputCls}
          />
        </div>

        {erroReset && <p className="text-red-400 text-sm">{erroReset}</p>}

        <button type="submit" disabled={enviandoReset}
          className="py-3 rounded-xl bg-[#00B8D4] text-white font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50">
          {enviandoReset ? 'Enviando...' : 'Enviar link de redefinição'}
        </button>

        <button type="button" onClick={() => setView('login')}
          className="text-white/40 text-sm hover:text-white/70 transition-colors">
          ← Voltar ao login
        </button>
      </form>
    )
  }

  /* ---- Tela de login ---- */
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm text-white/60">E-mail</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="seu@email.com"
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="senha" className="text-sm text-white/60">Senha</label>
        <div className="relative">
          <input
            id="senha"
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors p-1"
            aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {mostrarSenha ? (
              /* olho fechado */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              /* olho aberto */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Permanecer conectado + Esqueci a senha */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer select-none group">
          <div
            onClick={() => setLembrar(v => !v)}
            className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${lembrar ? 'bg-[#00B8D4] border-[#00B8D4]' : 'border-white/20 bg-transparent'}`}
          >
            {lembrar && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <span className="text-white/50 text-xs group-hover:text-white/70 transition-colors">Permanecer conectado</span>
        </label>

        <button type="button" onClick={() => { setView('forgot'); setEmailReset(email) }}
          className="text-xs text-white/40 hover:text-[#00B8D4] transition-colors">
          Esqueci minha senha
        </button>
      </div>

      {erro && <p className="text-red-400 text-sm text-center">{erro}</p>}

      <button
        type="submit"
        disabled={carregando}
        className="mt-1 py-3 rounded-xl bg-[#00B8D4] text-white font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {carregando ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
