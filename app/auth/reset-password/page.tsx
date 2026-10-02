'use client'

import { useState, useEffect, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TelaAcesso } from '@/components/auth/TelaAcesso'
import { CampoSenha } from '@/components/auth/CampoSenha'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Aviso } from '@/components/ui/Aviso'
import { validarNovaSenha, SENHA_MINIMA, type ErroSenha } from '@/lib/senha'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroCampo, setErroCampo] = useState<ErroSenha | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pronto, setPronto] = useState(false)

  // O Supabase volta do e-mail com tokens na URL — aguarda a sessão de recuperação.
  useEffect(() => {
    const supabase = createClient()
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setPronto(true)
    })
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setPronto(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const invalido = validarNovaSenha(novaSenha, confirmar)
    setErroCampo(invalido)
    if (invalido) return
    setSalvando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setOk(true)
    setTimeout(() => router.push('/login'), 2500)
  }

  return (
    <TelaAcesso rodape={<Link href="/login" className="text-center text-[13px] text-fg-2 hover:text-fg">Voltar ao login</Link>}>
      {ok ? (
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="grid h-[52px] w-[52px] place-items-center rounded-full bg-ok-soft text-ok"><CheckCircle2 size={24} /></span>
          <h1 className="text-lg font-semibold text-fg">Senha redefinida</h1>
          <p className="text-[13px] text-fg-2">Abrindo o login…</p>
        </div>
      ) : !pronto ? (
        <p role="status" className="py-4 text-center text-sm text-fg-3">Verificando o link…</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div>
            <h1 className="text-lg font-semibold text-fg">Nova senha</h1>
            <p className="mt-1 text-[13px] text-fg-2">Escolha uma nova senha para sua conta.</p>
          </div>
          <Field rotulo="Nova senha" ajuda={`Mínimo de ${SENHA_MINIMA} caracteres`} erro={erroCampo?.campo === 'nova' ? erroCampo.mensagem : null}>
            {c => (
              <CampoSenha id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} autoComplete="new-password" autoFocus
                value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
            )}
          </Field>
          <Field rotulo="Confirmar senha" erro={erroCampo?.campo === 'confirmar' ? erroCampo.mensagem : null}>
            {c => (
              <CampoSenha id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} autoComplete="new-password"
                value={confirmar} onChange={e => setConfirmar(e.target.value)} />
            )}
          </Field>
          {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
          <Button type="submit" variante="primario" tamanho="g" carregando={salvando} className="w-full">
            {salvando ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
        </form>
      )}
    </TelaAcesso>
  )
}
