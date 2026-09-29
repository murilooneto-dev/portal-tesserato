'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { restaurarExclusao } from '@/lib/lixeira-actions'
import type { ExclusaoAgrupada } from '@/lib/lixeira'

interface Props {
  exclusoesIniciais: ExclusaoAgrupada[]
  erroInicial: string | null
}

const ORIGEM_TEXTO: Record<ExclusaoAgrupada['origemAutor'], string> = {
  sessao: 'pela sessão do usuário',
  servico: 'pelo sistema',
  desconhecido: 'autor desconhecido',
}

// Fuso fixo para servidor e navegador renderizarem igual (evita erro de hidratação).
function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

export default function LixeiraClient({ exclusoesIniciais, erroInicial }: Props) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState<number | null>(null)
  const [restaurando, setRestaurando] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(erroInicial)
  const [aviso, setAviso] = useState<string | null>(null)

  async function restaurar(grupo: number) {
    setRestaurando(grupo)
    setErro(null)
    setAviso(null)
    let r: Awaited<ReturnType<typeof restaurarExclusao>>
    try {
      r = await restaurarExclusao(grupo)
    } catch {
      setRestaurando(null)
      setErro('Não foi possível restaurar. Tente novamente.')
      return
    }
    setRestaurando(null)
    if (r.error) { setErro(r.error); return }
    setConfirmando(null)
    setAviso('Exclusão restaurada.')
    router.refresh()
  }

  return (
    <div>
      <h1 className="text-[var(--fg)] font-bold text-xl mb-1">Lixeira</h1>
      <p className="text-[var(--fg)]/50 text-sm mb-6">
        Tudo o que é apagado do sistema fica aqui por 60 dias. Restaurar devolve a exclusão inteira
        (por exemplo, um cliente com as tarefas e anexos que foram junto).
      </p>
      <p className="text-[var(--fg)]/40 text-xs mb-6 -mt-4">
        Remover um cliente de um setor gera duas entradas (as tarefas do setor e a ficha do setor). Restaure as tarefas antes da ficha.
      </p>

      {erro && <p className="mb-4 text-red-400 text-sm">{erro}</p>}
      {aviso && <p className="mb-4 text-emerald-400 text-sm">{aviso}</p>}

      {exclusoesIniciais.length === 0 && !erro && (
        <p className="text-[var(--fg)]/40 text-sm">Nenhuma exclusão guardada.</p>
      )}

      <ul className="space-y-3">
        {exclusoesIniciais.map(e => (
          <li key={e.grupo} className="rounded-xl border border-[var(--fg)]/10 bg-[var(--fg)]/[0.03] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[var(--fg)] font-semibold text-sm truncate">{e.titulo}</p>
                <p className="text-[var(--fg)]/60 text-xs mt-0.5">{e.resumo}</p>
                <p className="text-[var(--fg)]/40 text-xs mt-1">
                  Apagado em <span suppressHydrationWarning>{formatarData(e.excluidoEm)}</span>
                  {' · '}
                  {e.excluidoPorNome ? `por ${e.excluidoPorNome}` : ORIGEM_TEXTO[e.origemAutor]}
                  {' · '}
                  {e.restaurada ? 'já restaurada' : `expira em ${e.diasRestantes} dia${e.diasRestantes === 1 ? '' : 's'}`}
                </p>
              </div>

              {!e.restaurada && (
                confirmando === e.grupo ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => restaurar(e.grupo)}
                      disabled={restaurando === e.grupo}
                      className="text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/30 transition-all disabled:opacity-40">
                      {restaurando === e.grupo ? 'Restaurando...' : 'Confirmar'}
                    </button>
                    <button
                      onClick={() => setConfirmando(null)}
                      disabled={restaurando === e.grupo}
                      className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)] px-2 py-1.5 disabled:opacity-40">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setErro(null); setAviso(null); setConfirmando(e.grupo) }}
                    className="shrink-0 text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] px-3 py-1.5 rounded-lg transition-all">
                    Restaurar
                  </button>
                )
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
