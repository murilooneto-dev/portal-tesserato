'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'

interface Props {
  clienteNome: string
  onClose: () => void
  onConfirm: (senha: string) => Promise<{ error?: string }>
  onConfirmado: () => void
}

export default function DesabilitarClienteModal({ clienteNome, onClose, onConfirm, onConfirmado }: Props) {
  const [nomeDigitado, setNomeDigitado] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const confirmacaoValida = nomeDigitado.trim() === clienteNome && senha.length > 0

  async function handleConfirmar() {
    if (!confirmacaoValida) return
    setEnviando(true)
    setErro(null)
    try {
      const resultado = await onConfirm(senha)
      if (resultado.error) {
        setErro(resultado.error)
        return
      }
      onConfirmado()
      onClose()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      aberto
      onFechar={onClose}
      bloqueado={enviando}
      titulo="Desabilitar cliente"
      subtitulo={clienteNome}
      largura="p"
      icone={<span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-warn-soft text-warn"><Lock size={20} /></span>}
      rodape={
        <>
          <Button variante="fantasma" onClick={onClose} disabled={enviando} className="ml-auto">Cancelar</Button>
          <Button variante="primario" onClick={handleConfirmar} disabled={!confirmacaoValida} carregando={enviando}>
            {enviando ? 'Desabilitando…' : 'Desabilitar cliente'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-2">O cliente sai das listas e das contagens do mês. O histórico continua intacto e você pode reabilitar quando quiser.</p>
      <Field rotulo={<>Digite o nome do cliente: <b className="font-semibold text-fg">{clienteNome}</b></>}>
        {c => <Input id={c.id} data-autofocus autoComplete="off" value={nomeDigitado} onChange={e => setNomeDigitado(e.target.value)} />}
      </Field>
      <Field rotulo="Sua senha de login">
        {c => <Input id={c.id} type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} />}
      </Field>
      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
    </Modal>
  )
}
