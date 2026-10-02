'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Checkbox } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { CampoSenha } from './CampoSenha'

type View = 'login' | 'forgot' | 'forgot_sent'

export default function LoginForm() {
  const router = useRouter()
  const [view, setView] = useState<View>('login')

  // Login
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
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

  if (view === 'forgot_sent') {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden="true" className="grid h-[52px] w-[52px] place-items-center rounded-full bg-ok-soft text-ok"><Mail size={24} /></span>
        <h2 className="text-lg font-semibold text-fg">E-mail enviado</h2>
        <p className="text-[13px] text-fg-2">
          Abra a caixa de entrada de <b className="font-semibold text-fg">{emailReset}</b> e siga o link para criar a nova senha.
        </p>
        <button type="button" onClick={() => { setView('login'); setEmailReset('') }} className="mt-1 inline-flex min-h-11 items-center text-[13px] font-semibold text-acc-text hover:underline">
          Voltar ao login
        </button>
      </div>
    )
  }

  if (view === 'forgot') {
    return (
      <form onSubmit={handleEsqueciSenha} aria-label="Redefinir senha" className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-fg">Redefinir senha</h2>
          <p className="mt-1 text-[13px] text-fg-2">Digite seu e-mail e enviaremos um link para criar uma nova senha.</p>
        </div>
        <Field rotulo="E-mail" erro={erroReset}>
          {c => (
            <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} type="email" autoComplete="email" required autoFocus
              value={emailReset} onChange={e => setEmailReset(e.target.value)} placeholder="seu@email.com" className="h-11" />
          )}
        </Field>
        <Button type="submit" variante="primario" tamanho="g" carregando={enviandoReset} className="w-full">
          {enviandoReset ? 'Enviando…' : 'Enviar link'}
        </Button>
        <button type="button" onClick={() => setView('login')} className="min-h-11 text-center text-[13px] text-fg-2 hover:text-fg">Voltar ao login</button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Entrar" className="flex flex-col gap-4">
      <Field rotulo="E-mail">
        {c => (
          <Input id={c.id} aria-describedby={erro ? 'login-erro' : c.describedBy} type="email" autoComplete="email" required invalido={Boolean(erro)}
            value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="h-11" />
        )}
      </Field>
      <Field rotulo="Senha">
        {c => (
          <CampoSenha id={c.id} aria-describedby={erro ? 'login-erro' : c.describedBy} autoComplete="current-password" required invalido={Boolean(erro)}
            value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" />
        )}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Checkbox rotulo="Permanecer conectado" className="min-h-11" checked={lembrar} onChange={e => setLembrar(e.target.checked)} />
        <button type="button" onClick={() => { setView('forgot'); setEmailReset(email) }} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-acc-text hover:underline">
          Esqueci minha senha
        </button>
      </div>
      {erro && (
        <div id="login-erro" role="alert">
          <Aviso tom="dng"><b>{erro}</b> Confira e tente de novo.</Aviso>
        </div>
      )}
      <Button type="submit" variante="primario" tamanho="g" carregando={carregando} className="w-full">
        {carregando ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}
