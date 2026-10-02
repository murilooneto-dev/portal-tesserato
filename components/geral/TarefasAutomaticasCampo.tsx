'use client'

import { useEffect, useMemo, useState } from 'react'
import { Undo2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { buscarMapaVinculosSetor, tarefasAutomaticasVisiveis, type MapaVinculosSetor } from '@/lib/tarefas-esperadas'
import type { UserSetor } from '@/lib/types'

interface Props {
  setor: UserSetor
  regime: string | null
  atividade: string[]
  personalizadas: string[]
  excluidas: string[]
  onChangeExcluidas: (v: string[]) => void
  readOnly?: boolean
}

const mapaVazio: MapaVinculosSetor = { porRegime: {}, porAtividade: {} }

export default function TarefasAutomaticasCampo({
  setor,
  regime,
  atividade,
  personalizadas,
  excluidas,
  onChangeExcluidas,
  readOnly = false,
}: Props) {
  const [mapaVinculos, setMapaVinculos] = useState<MapaVinculosSetor>(mapaVazio)

  useEffect(() => {
    const sb = createClient()
    buscarMapaVinculosSetor(sb, setor).then(setMapaVinculos)
  }, [setor])

  const automaticasAtivas = useMemo(
    () => tarefasAutomaticasVisiveis({ regime, atividade, tarefas_personalizadas: personalizadas, tarefas_excluidas: excluidas }, mapaVinculos),
    [regime, atividade, personalizadas, excluidas, mapaVinculos],
  )

  function excluir(nome: string) {
    onChangeExcluidas([...excluidas, nome])
  }

  function restaurar(nome: string) {
    onChangeExcluidas(excluidas.filter(e => e !== nome))
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div>
        <span className="mb-2 block text-[13px] font-medium text-fg-2">
          Automáticas, pelo vínculo de regime e atividade ({automaticasAtivas.length})
        </span>
        <div className="flex min-h-[34px] flex-wrap gap-2">
          {automaticasAtivas.length === 0 && (
            <p className="text-xs text-fg-3">Nenhuma tarefa automática para este cliente.</p>
          )}
          {automaticasAtivas.map(t => (
            <span key={t} title="Vem do vínculo de regime/atividade"
              className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-line px-3 text-[13px] text-fg-2">
              {t}
              {!readOnly && (
                <button type="button" onClick={() => excluir(t)}
                  aria-label={`Excluir ${t} só para este cliente`}
                  title="Excluir só para este cliente"
                  className="-mr-1.5 inline-grid h-6 w-6 place-items-center rounded-full text-fg-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {excluidas.length > 0 && (
        <div>
          <span className="mb-2 block text-[13px] font-medium text-fg-2">
            Excluídas para este cliente ({excluidas.length})
          </span>
          <div className="flex min-h-[34px] flex-wrap gap-2">
            {excluidas.map(t => (
              <span key={t}
                className="inline-flex min-h-[30px] items-center gap-2 rounded-full border border-dashed border-line px-3 text-[13px] text-fg-3">
                <span className="line-through">{t}</span>
                {!readOnly && (
                  <button type="button" onClick={() => restaurar(t)}
                    aria-label={`Restaurar ${t}`}
                    title="Restaurar para este cliente"
                    className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-semibold text-acc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                    <Undo2 size={13} aria-hidden="true" />Restaurar
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
