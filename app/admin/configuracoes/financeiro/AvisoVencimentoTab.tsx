// app/admin/configuracoes/financeiro/AvisoVencimentoTab.tsx
'use client'

import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { lerEmailAvisoVencimento, salvarEmailAvisoVencimento, enviarTesteAvisoVencimento } from '@/lib/financeiro-actions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { EsqueletoLinhas } from '@/components/ui/Esqueleto'
import { useToast } from '@/components/ui/Toast'

export default function AvisoVencimentoTab() {
  const avisar = useToast()
  const [email, setEmail] = useState('')
  const [salvo, setSalvo] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [erroCampo, setErroCampo] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)

  useEffect(() => {
    let ativo = true
    lerEmailAvisoVencimento().then(({ email: atual, error }) => {
      if (!ativo) return
      if (error) setErroCarga(error)
      else { setEmail(atual); setSalvo(atual) }
      setCarregando(false)
    })
    return () => { ativo = false }
  }, [])

  const alterado = email.trim() !== salvo

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { email: gravado, error } = await salvarEmailAvisoVencimento(email)
    setSalvando(false)
    if (error) { setErroCampo(error); return }
    setErroCampo(null)
    setEmail(gravado)
    setSalvo(gravado)
    avisar(gravado ? 'Salvo' : 'Aviso desligado.', 'ok')
  }

  async function testar() {
    setTestando(true)
    const { mensagem, error } = await enviarTesteAvisoVencimento()
    setTestando(false)
    if (error) avisar(error, 'dng')
    else if (mensagem) avisar(mensagem, 'ok')
  }

  if (carregando) return <EsqueletoLinhas />
  if (erroCarga) return <Aviso tom="dng">{erroCarga}</Aviso>

  return (
    <Card titulo="Aviso de vencimento">
      <form onSubmit={salvar} className="flex max-w-xl flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-fg-2">
          Todo dia de manhã o sistema envia um e-mail com os pagamentos recorrentes que vencem no dia seguinte
          e ainda não foram confirmados como pagos. Se não houver nenhum, nada é enviado.
        </p>
        <Field
          rotulo="E-mail que recebe o aviso"
          ajuda="Para mais de um, separe com vírgula. Deixe em branco para desligar o aviso."
          erro={erroCampo}
        >
          {c => (
            <Input
              id={c.id}
              aria-describedby={c.describedBy}
              invalido={c.invalido}
              type="text"
              inputMode="email"
              autoComplete="off"
              placeholder="financeiro@empresa.com.br"
              value={email}
              onChange={e => { setEmail(e.target.value); setErroCampo(null) }}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variante="primario" carregando={salvando} disabled={!alterado}>Salvar</Button>
          <Button
            type="button"
            onClick={testar}
            carregando={testando}
            disabled={!salvo || alterado}
            title={alterado ? 'Salve o e-mail antes de enviar o teste' : undefined}
          >
            <Send size={16} aria-hidden="true" /> Enviar teste agora
          </Button>
        </div>
      </form>
    </Card>
  )
}
