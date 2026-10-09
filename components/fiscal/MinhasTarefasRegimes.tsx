'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Chip } from '@/components/ui/Chip'
import { Aviso } from '@/components/ui/Aviso'
import { opcoesDeRegime } from '@/lib/minhas-tarefas-regimes'
import { salvarRegimesMinhasTarefas } from '@/lib/minhas-tarefas-regimes-actions'

interface Props {
  userId: string
  catalogo: string[]
  marcados: string[]
}

// Regimes que o dono dos tipos atende. Nada marcado = todos. Fora dos
// marcados, a tarefa volta para o responsável de cada empresa.
export default function MinhasTarefasRegimes({ userId, catalogo, marcados }: Props) {
  const router = useRouter()
  const [selecionados, setSelecionados] = useState(marcados)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  const opcoes = opcoesDeRegime(catalogo, selecionados)

  function alternar(nome: string, marcado: boolean) {
    const anterior = selecionados
    const proximo = marcado
      ? selecionados.filter(r => r.trim().toLowerCase() !== nome.trim().toLowerCase())
      : [...selecionados, nome]
    setSelecionados(proximo)
    setErro(null)
    iniciar(async () => {
      const { error } = await salvarRegimesMinhasTarefas(userId, proximo)
      if (error) {
        setSelecionados(anterior)
        setErro(error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section aria-label="Regimes que atendo" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-medium text-fg">Regimes que atendo</h2>
        <p className="text-[13px] text-fg-2">
          {selecionados.length === 0
            ? 'Todos os regimes. Marque para ver só as empresas desses regimes.'
            : 'Nas empresas dos outros regimes a tarefa fica com o responsável da empresa.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {opcoes.map(o => (
          <Chip key={o.nome} ativo={o.marcado} disabled={salvando} onClick={() => alternar(o.nome, o.marcado)}>
            {o.nome}{o.foraDoCatalogo ? ' (fora do catálogo)' : ''}
          </Chip>
        ))}
      </div>
      {erro && <Aviso tom="dng">Não foi possível salvar: {erro}</Aviso>}
    </section>
  )
}
