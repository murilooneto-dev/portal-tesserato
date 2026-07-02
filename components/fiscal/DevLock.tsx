'use client'

import { useState } from 'react'
import { verificarSenhaDev } from '@/app/fiscal/parametros/actions'

export default function DevLock({ children }: { children: React.ReactNode }) {
  const [destravado, setDestravado] = useState(false)
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleDesbloquear() {
    setVerificando(true)
    setErro('')
    const result = await verificarSenhaDev(login, senha)
    setVerificando(false)
    if (!result.ok) {
      setErro(result.error ?? 'Credenciais inválidas.')
      return
    }
    setDestravado(true)
  }

  if (destravado) return <>{children}</>

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-6 flex flex-col items-center text-center gap-3">
      <p className="text-white/60 text-sm font-semibold">🔒 Área restrita</p>
      <p className="text-white/30 text-xs max-w-sm">
        Essas ferramentas alteram dados em massa. Digite as credenciais do usuário Dev para desbloquear.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
        <input
          type="email"
          placeholder="Login"
          value={login}
          onChange={e => setLogin(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00CCEB]/50"
        />
        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleDesbloquear()}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00CCEB]/50"
        />
        <button
          onClick={handleDesbloquear}
          disabled={verificando || !login || !senha}
          className="px-4 py-2 rounded-lg bg-[#00CCEB] text-white text-xs font-semibold hover:bg-[#00b3d4] transition-colors disabled:opacity-50">
          {verificando ? 'Verificando...' : 'Desbloquear'}
        </button>
        {erro && <p className="text-red-400 text-xs">{erro}</p>}
      </div>
    </div>
  )
}
