'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarMapaVinculosSetor, tarefasAutomaticasVisiveis, type MapaVinculosSetor } from '@/lib/tarefas-esperadas'
import type { UserSetor } from '@/lib/types'

interface Props {
  setor: UserSetor
  grupo?: string | null
  regime: string | null
  atividade: string[]
  personalizadas: string[]
  excluidas: string[]
  onChangeExcluidas: (v: string[]) => void
  readOnly?: boolean
}

const mapaVazio: MapaVinculosSetor = { porGrupo: {}, porRegime: {}, porAtividade: {} }

export default function TarefasAutomaticasCampo({
  setor,
  grupo,
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
    () => tarefasAutomaticasVisiveis({ grupo, regime, atividade, tarefas_personalizadas: personalizadas, tarefas_excluidas: excluidas }, mapaVinculos),
    [grupo, regime, atividade, personalizadas, excluidas, mapaVinculos],
  )

  function excluir(nome: string) {
    onChangeExcluidas([...excluidas, nome])
  }

  function restaurar(nome: string) {
    onChangeExcluidas(excluidas.filter(e => e !== nome))
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">
          Automáticas (vínculo de grupo/atividade) ({automaticasAtivas.length})
        </label>
        <div className="flex flex-wrap gap-1.5 min-h-[32px]">
          {automaticasAtivas.length === 0 && (
            <p className="text-[var(--fg)]/20 text-xs">Nenhuma tarefa automática pra esse cliente.</p>
          )}
          {automaticasAtivas.map(t => (
            <span key={t} className="flex items-center gap-1.5 text-xs bg-[var(--fg)]/5 border border-[var(--fg)]/15 text-[var(--fg)] px-2.5 py-1 rounded-lg">
              {t}
              {!readOnly && (
                <button type="button" onClick={() => excluir(t)}
                  title="Excluir essa tarefa automática só pra esse cliente"
                  className="text-[var(--fg)]/40 hover:text-red-400 transition-colors font-bold">×</button>
              )}
            </span>
          ))}
        </div>
      </div>

      {excluidas.length > 0 && (
        <div>
          <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">
            Excluídas pra esse cliente ({excluidas.length})
          </label>
          <div className="flex flex-wrap gap-1.5 min-h-[32px]">
            {excluidas.map(t => (
              <span key={t} className="flex items-center gap-1.5 text-xs bg-[var(--fg)]/2 border border-[var(--fg)]/8 text-[var(--fg)]/30 line-through px-2.5 py-1 rounded-lg">
                {t}
                {!readOnly && (
                  <button type="button" onClick={() => restaurar(t)}
                    title="Restaurar essa tarefa pra esse cliente"
                    className="text-[var(--fg)]/40 hover:text-[var(--accent)] transition-colors font-bold no-underline">↺</button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
