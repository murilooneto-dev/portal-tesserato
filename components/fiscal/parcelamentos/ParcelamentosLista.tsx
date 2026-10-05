'use client'

import { cn } from '@/components/ui/cn'
import { reguaDeMeses, textoEmitidas, type GrupoSecao } from '@/lib/parcelamentos-tela'

interface Props {
  grupos: GrupoSecao[]
  selecionadoId: string | null
  mesAtual: number | null
  onSelecionar: (id: string) => void
}

// Lista por seção. No desktop é uma lista única com o item escolhido
// destacado; no celular cada parcelamento vira um cartão com a régua dos 12
// meses. Nome e CNPJ aparecem inteiros (sem reticências).
export default function ParcelamentosLista({ grupos, selecionadoId, mesAtual, onSelecionar }: Props) {
  return (
    <section aria-label="Parcelamentos por seção" className="flex min-w-0 flex-col gap-4 lg:gap-0 lg:overflow-hidden lg:rounded-xl lg:border lg:border-line-soft lg:bg-surface">
      {grupos.map(g => (
        <div key={g.secao} className="flex flex-col gap-2 lg:gap-0">
          <h2 className="px-1 text-xs font-semibold tracking-[.05em] text-fg-3 lg:border-b lg:border-line-soft lg:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)] lg:px-[18px] lg:py-[9px]">
            {g.secao} <span className="font-medium tracking-normal">· {g.itens.length}</span>
          </h2>
          {g.itens.map(p => {
            const ativo = p.id === selecionadoId
            return (
              <button
                key={p.id}
                type="button"
                aria-current={ativo || undefined}
                onClick={() => onSelecionar(p.id)}
                className={cn(
                  'flex w-full min-w-0 flex-col gap-2 rounded-xl border border-line-soft bg-surface px-4 py-3.5 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc',
                  'lg:flex-row lg:items-center lg:gap-3 lg:rounded-none lg:border-0 lg:border-b lg:px-[18px] lg:py-3',
                  ativo ? 'lg:bg-acc-soft lg:shadow-[inset_3px_0_0_var(--acc)]' : 'hover:bg-raised',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-semibold leading-tight text-fg">{p.empresa}</span>
                  <span className="mt-0.5 block break-all font-mono text-[13px] text-fg-3">{p.cnpj?.trim() || 'CNPJ não informado'}</span>
                </span>
                <span className="flex gap-1 lg:hidden" aria-hidden="true">
                  {reguaDeMeses(p, mesAtual).map(m => (
                    <span
                      key={m.coluna}
                      title={m.nome}
                      className={cn('h-2 flex-1 rounded-[3px]', m.emitida ? 'bg-ok' : m.atual ? 'bg-fg-3' : 'bg-raised')}
                    />
                  ))}
                </span>
                <span className="flex flex-col text-[13px] text-fg-3 lg:items-end lg:gap-1">
                  {p.responsavel && <span className="text-fg-2">{p.responsavel}</span>}
                  <span className="tabular-nums">{textoEmitidas(p)}</span>
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </section>
  )
}
