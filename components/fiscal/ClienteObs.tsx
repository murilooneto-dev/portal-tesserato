'use client'

import { useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { salvarObs } from '@/app/fiscal/clientes/actions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'

interface Props {
  clienteId: string
  obsInicial: string
  mes: number
  ano: number
  podeEditar: boolean
}

export default function ClienteObs({ clienteId, obsInicial, mes, ano, podeEditar }: Props) {
  const [obs, setObs] = useState(obsInicial)
  const [editando, setEditando] = useState(false)
  const [isPending, startTransition] = useTransition()

  function salvar() {
    startTransition(async () => {
      await salvarObs(clienteId, mes, ano, obs)
      setEditando(false)
    })
  }

  return (
    <Card
      titulo="Observação do mês"
      acoes={!editando && podeEditar ? (
        <Button variante="fantasma" tamanho="p" icone={<Pencil size={14} aria-hidden="true" />} onClick={() => setEditando(true)}>
          {obs ? 'Editar' : 'Escrever'}
        </Button>
      ) : undefined}
    >
      {editando ? (
        <div className="flex flex-col gap-3">
          <Textarea
            aria-label="Observação do mês"
            value={obs}
            onChange={e => setObs(e.target.value)}
            rows={3}
            placeholder="Observações sobre este cliente..."
          />
          <div className="flex justify-end gap-2">
            <Button variante="fantasma" onClick={() => { setObs(obsInicial); setEditando(false) }}>
              Cancelar
            </Button>
            <Button variante="primario" onClick={salvar} carregando={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      ) : (
        <p className={obs ? 'whitespace-pre-wrap text-sm text-warn' : 'text-sm text-fg-3'}>
          {obs || 'Nenhuma observação neste mês.'}
        </p>
      )}
    </Card>
  )
}
