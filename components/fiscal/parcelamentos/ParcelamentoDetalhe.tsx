'use client'

import { useState, type ReactNode } from 'react'
import { ArrowLeft, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { reguaDeMeses, rotuloDoSetor, statusVisual, type Parcelamento } from '@/lib/parcelamentos-tela'

interface Props {
  item: Parcelamento
  mesAtual: number | null
  onEditar: () => void
  onExcluir: () => void
  // Só no celular: volta à lista.
  onVoltar?: () => void
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[13px] text-fg-3">{rotulo}</div>
      <div className="break-words text-sm text-fg">{children}</div>
    </div>
  )
}

const VAZIO = <span className="text-fg-3">—</span>

// Detalhe de um parcelamento: todos os campos, senhas ocultas por padrão e as
// 12 parcelas com a data de emissão. Use `key={item.id}` para a senha voltar a
// ficar oculta ao trocar de item.
export default function ParcelamentoDetalhe({ item, mesAtual, onEditar, onExcluir, onVoltar }: Props) {
  const [verSenhas, setVerSenhas] = useState(false)
  const status = statusVisual(item.status)
  const temSenhas = Boolean(item.senhas?.trim())
  return (
    <section aria-label={`Detalhe de ${item.empresa}`} className="min-w-0 rounded-xl border border-line-soft bg-surface">
      {onVoltar && (
        <div className="border-b border-line-soft px-[22px] py-2.5">
          <Button variante="fantasma" tamanho="p" icone={<ArrowLeft size={16} aria-hidden="true" />} onClick={onVoltar}>Voltar à lista</Button>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-4 border-b border-line-soft px-[22px] pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-xl font-semibold text-fg">{item.empresa}</h2>
          <p className="mt-1 text-sm text-fg-3">
            <span className="break-all font-mono">{item.cnpj?.trim() || 'CNPJ não informado'}</span> · {item.secao}
            {item.empresa_avulsa && <> · <Badge>Empresa avulsa</Badge></>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button icone={<Pencil size={16} aria-hidden="true" />} onClick={onEditar}>Editar</Button>
          <Button variante="perigo" icone={<Trash2 size={16} aria-hidden="true" />} onClick={onExcluir}>Excluir</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-line-soft px-[22px] py-4 sm:grid-cols-4">
        <Campo rotulo="Responsável">{item.responsavel || VAZIO}</Campo>
        <Campo rotulo="Regime">{item.regime || VAZIO}</Campo>
        <Campo rotulo="Local / tipo">{item.local_tipo || VAZIO}</Campo>
        <Campo rotulo="Status"><Badge tom={status.tom}>{status.rotulo}</Badge></Campo>
      </div>

      <div className="grid gap-4 border-b border-line-soft px-[22px] py-4 sm:grid-cols-2">
        <Campo rotulo="Gera tarefa automática em">
          {item.setores.length > 0
            ? <span className="flex flex-wrap gap-1.5">{item.setores.map(s => <Badge key={s}>{rotuloDoSetor(s)}</Badge>)}</span>
            : VAZIO}
          {item.tarefa?.trim() && <span className="mt-1.5 block text-fg-2">Tarefa: {item.tarefa}</span>}
        </Campo>
        <Campo rotulo="Senhas e observações">
          {temSenhas ? (
            <span className="flex flex-wrap items-start gap-2">
              {verSenhas
                ? <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{item.senhas}</span>
                : <span aria-label="Senhas ocultas" className="tracking-widest">••••••••</span>}
              <Button
                variante="fantasma"
                tamanho="p"
                aria-pressed={verSenhas}
                icone={verSenhas ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                onClick={() => setVerSenhas(v => !v)}
              >
                {verSenhas ? 'Ocultar' : 'Mostrar'}
              </Button>
            </span>
          ) : VAZIO}
        </Campo>
      </div>

      <div className="px-[22px] pb-5 pt-4">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h3 className="text-xs font-semibold uppercase tracking-[.06em] text-fg-3">Parcelas mensais · data de emissão ou envio</h3>
          {!item.empresa_avulsa && <span className="text-xs text-fg-3 sm:ml-auto">preenchidas pela tarefa na ficha do cliente</span>}
        </div>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {reguaDeMeses(item, mesAtual).map(m => (
            <li
              key={m.coluna}
              className={cn(
                'rounded-[10px] border px-3 py-2.5',
                m.atual ? 'border-acc' : m.emitida ? 'border-[color-mix(in_srgb,var(--ok)_45%,transparent)]' : 'border-line-soft',
                m.emitida && 'bg-ok-soft',
              )}
            >
              <div className={cn('text-xs font-semibold', m.atual ? 'text-acc-text' : 'text-fg-3')}>{m.nome}{m.atual ? ' · atual' : ''}</div>
              <div className={cn('mt-0.5 text-[17px] tabular-nums', m.emitida ? 'font-semibold text-fg' : 'text-fg-3')}>{m.data ?? '—'}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
