// app/admin/configuracoes/_tarefas/SetorConfigClient.tsx
'use client'

import type { UserSetor } from '@/lib/types'
import { SETOR_LABEL } from '@/lib/types'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Caminho } from '@/components/ui/Caminho'
import { Abas } from '@/components/ui/Abas'
import EntidadeListaTab from './EntidadeListaTab'
import TarefasTab from './TarefasTab'

interface Props {
  setor: UserSetor
}

export default function SetorConfigClient({ setor }: Props) {
  const nomeSetor = SETOR_LABEL[setor]

  return (
    <Pagina>
      <Caminho itens={[{ rotulo: 'Configurações', href: '/admin/configuracoes' }, { rotulo: nomeSetor }]} />
      <CabecalhoPagina
        titulo={`Configurações do ${nomeSetor}`}
        subtitulo={`Regimes, atividades e tarefas usados nos clientes do ${nomeSetor}`}
      />
      <Abas
        rotulo={`Configurações do ${nomeSetor}`}
        abas={[
          { id: 'regimes', rotulo: 'Regimes', conteudo: <EntidadeListaTab tabela="regimes" entidadeTipoVinculo="regime" setor={setor} label="Regime" /> },
          { id: 'atividades', rotulo: 'Atividades', conteudo: <EntidadeListaTab tabela="atividades" entidadeTipoVinculo="atividade" setor={setor} label="Atividade" /> },
          { id: 'tarefas', rotulo: 'Tarefas', conteudo: <TarefasTab setor={setor} /> },
        ]}
      />
    </Pagina>
  )
}
