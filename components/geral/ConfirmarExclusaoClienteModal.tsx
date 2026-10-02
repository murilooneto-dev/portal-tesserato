'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { confirmacaoExclusaoValida, AVISO_RESTAURACAO, type ImpactoExclusao } from '@/lib/exclusao-cliente'

interface Props {
  nomeCliente: string
  impacto: ImpactoExclusao
  // Executa a exclusão. Erro esperado volta em `error`; sucesso é `error: null`
  // (quem chama navega/fecha depois, então o modal não se fecha sozinho).
  onConfirmar: () => Promise<{ error: string | null }>
  onCancelar: () => void
}

// Modal único de confirmação de exclusão de cliente (Fiscal, Contábil,
// Pessoal e tela Geral). As regras (o que exigir, o que avisar) vêm de
// lib/exclusao-cliente.ts; aqui só há interface.
export default function ConfirmarExclusaoClienteModal({ nomeCliente, impacto, onConfirmar, onCancelar }: Props) {
  const [nomeDigitado, setNomeDigitado] = useState('')
  const [palavraDigitada, setPalavraDigitada] = useState('')
  const [executando, setExecutando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const valido = confirmacaoExclusaoValida(impacto.nivel, nomeCliente, nomeDigitado, palavraDigitada)

  async function confirmar() {
    if (!valido || executando) return
    setExecutando(true)
    setErro(null)
    try {
      const { error } = await onConfirmar()
      if (error) { setErro(error); setExecutando(false) }
    } catch {
      setErro('Não foi possível concluir a exclusão. Tente novamente.')
      setExecutando(false)
    }
  }

  return (
    <Modal
      aberto
      onFechar={onCancelar}
      bloqueado={executando}
      titulo={impacto.titulo}
      subtitulo={nomeCliente}
      largura="p"
      icone={<span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-danger-soft text-danger"><Trash2 size={20} /></span>}
      rodape={
        <>
          <Button variante="fantasma" onClick={onCancelar} disabled={executando} className="ml-auto">Cancelar</Button>
          <Button variante="perigo-solido" onClick={confirmar} disabled={!valido} carregando={executando}>
            {executando ? 'Excluindo…' : impacto.rotuloBotao}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-sm text-fg-2">
        <p>{impacto.descricao}</p>
        <ul className="list-disc space-y-1 pl-5">{impacto.detalhes.map(d => <li key={d}>{d}</li>)}</ul>
      </div>
      <Aviso tom="info">{AVISO_RESTAURACAO}</Aviso>
      <Field rotulo={<>Digite o nome do cliente: <b className="font-semibold text-fg">{nomeCliente}</b></>}>
        {c => <Input id={c.id} data-autofocus autoComplete="off" value={nomeDigitado} onChange={e => setNomeDigitado(e.target.value)} />}
      </Field>
      {impacto.exigeDeletar && (
        <Field rotulo="Digite DELETAR para confirmar">
          {c => <Input id={c.id} autoComplete="off" placeholder="DELETAR" value={palavraDigitada} onChange={e => setPalavraDigitada(e.target.value)} />}
        </Field>
      )}
      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
    </Modal>
  )
}
