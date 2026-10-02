'use client'

import { useSyncExternalStore } from 'react'
import { Landmark } from 'lucide-react'
import { Drawer } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import type { GrupoSecao, Parcelamento } from '@/lib/parcelamentos-tela'
import ParcelamentosLista from './ParcelamentosLista'
import ParcelamentoDetalhe from './ParcelamentoDetalhe'

const CONSULTA_DESKTOP = '(min-width: 1024px)'
function assinarDesktop(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_DESKTOP)
  mq.addEventListener('change', aviso)
  return () => mq.removeEventListener('change', aviso)
}
const ehDesktop = () => window.matchMedia(CONSULTA_DESKTOP).matches

interface Props {
  grupos: GrupoSecao[]
  selecionadoId: string | null
  mesAtual: number | null
  onSelecionar: (id: string | null) => void
  onEditar: (p: Parcelamento) => void
  onExcluir: (p: Parcelamento) => void
}

// Desktop: lista à esquerda e detalhe à direita (o primeiro item já vem
// aberto). Celular: só a lista; tocar abre o detalhe em tela cheia com voltar.
export default function ParcelamentosConteudo({ grupos, selecionadoId, mesAtual, onSelecionar, onEditar, onExcluir }: Props) {
  const desktop = useSyncExternalStore(assinarDesktop, ehDesktop, () => false)
  const visiveis = grupos.flatMap(g => g.itens)
  const escolhido = visiveis.find(p => p.id === selecionadoId) ?? null
  const aberto = escolhido ?? (desktop ? visiveis[0] ?? null : null)

  if (grupos.length === 0) {
    return (
      <div className="rounded-xl border border-line-soft bg-surface">
        <EmptyState icone={<Landmark size={24} />} titulo="Nenhum parcelamento encontrado" descricao="Mude a busca ou os filtros." />
      </div>
    )
  }

  const detalhe = aberto && (
    <ParcelamentoDetalhe
      key={aberto.id}
      item={aberto}
      mesAtual={mesAtual}
      onEditar={() => onEditar(aberto)}
      onExcluir={() => onExcluir(aberto)}
      onVoltar={desktop ? undefined : () => onSelecionar(null)}
    />
  )

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[440px_minmax(0,1fr)]">
      <ParcelamentosLista grupos={grupos} selecionadoId={aberto?.id ?? null} mesAtual={mesAtual} onSelecionar={onSelecionar} />
      {desktop && detalhe}
      {!desktop && (
        <Drawer aberto={Boolean(aberto)} onFechar={() => onSelecionar(null)} titulo={aberto?.empresa ?? ''} larguraPx={9999}>
          {detalhe}
        </Drawer>
      )}
    </div>
  )
}
