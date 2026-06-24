'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      setErro('Email ou senha incorretos.')
      setCarregando(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm text-white/60">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#00B8D4] transition-colors"
          placeholder="seu@email.com"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="senha" className="text-sm text-white/60">Senha</label>
        <input
          id="senha"
          type="password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          required
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#00B8D4] transition-colors"
          placeholder="••••••••"
        />
      </div>

      {erro && (
        <p className="text-red-400 text-sm text-center">{erro}</p>
      )}

      <button
        type="submit"
        disabled={carregando}
        className="mt-2 py-3 rounded-xl bg-[#00B8D4] text-white font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {carregando ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
