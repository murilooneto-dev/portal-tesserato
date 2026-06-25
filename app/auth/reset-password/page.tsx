'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pronto, setPronto] = useState(false)

  // Supabase redireciona com tokens na URL — aguarda a sessão ser estabelecida
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPronto(true)
    })
    // Tenta pegar sessão atual caso já tenha sido processada
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPronto(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (novaSenha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
    if (novaSenha !== confirmar) { setErro('As senhas não coincidem.'); return }

    setSalvando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setSalvando(false)

    if (error) { setErro(error.message); return }

    setOk(true)
    setTimeout(() => router.push('/login'), 2500)
  }

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#00B8D4] transition-colors text-sm"

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <svg width="56" height="56" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00c2e0"/>
                <stop offset="100%" stopColor="#0077b6"/>
              </linearGradient>
              <linearGradient id="lg2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1a3a8f"/>
                <stop offset="100%" stopColor="#0d2260"/>
              </linearGradient>
            </defs>
            <rect x="14" y="14" width="92" height="92" rx="16" fill="url(#lg1)" transform="rotate(45 60 60)"/>
            <rect x="24" y="24" width="72" height="72" rx="11" fill="url(#lg2)" transform="rotate(45 60 60)"/>
            <text x="60" y="57" textAnchor="middle" fill="#ffffff" fontSize="13.5" fontWeight="bold" fontFamily="Arial,sans-serif" letterSpacing="0.5">TESSERATO</text>
            <text x="60" y="70" textAnchor="middle" fill="#7dd8f0" fontSize="7.2" fontFamily="Arial,sans-serif" letterSpacing="1.5">CONTABILIDADE</text>
          </svg>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-8">
          {ok ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-400 text-xl">✓</div>
              <p className="text-white font-semibold">Senha redefinida com sucesso!</p>
              <p className="text-white/40 text-sm">Redirecionando para o login...</p>
            </div>
          ) : !pronto ? (
            <div className="text-center">
              <p className="text-white/40 text-sm">Verificando link...</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white mb-1">Nova senha</h1>
              <p className="text-white/40 text-sm mb-6">Escolha uma nova senha para sua conta.</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-white/60">Nova senha</label>
                  <div className="relative">
                    <input
                      type={mostrar ? 'text' : 'password'}
                      value={novaSenha}
                      onChange={e => setNovaSenha(e.target.value)}
                      required
                      placeholder="••••••••"
                      className={`${inputCls} pr-11`}
                    />
                    <button type="button" onClick={() => setMostrar(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors p-1">
                      {mostrar ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm text-white/60">Confirmar senha</label>
                  <input
                    type={mostrar ? 'text' : 'password'}
                    value={confirmar}
                    onChange={e => setConfirmar(e.target.value)}
                    required
                    placeholder="••••••••"
                    className={inputCls}
                  />
                </div>

                {erro && <p className="text-red-400 text-sm">{erro}</p>}

                <button type="submit" disabled={salvando}
                  className="mt-1 py-3 rounded-xl bg-[#00B8D4] text-white font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50">
                  {salvando ? 'Salvando...' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
