// app/admin/configuracoes/societario/SocietarioConfigClient.tsx
'use client'

import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Caminho } from '@/components/ui/Caminho'
import { Abas } from '@/components/ui/Abas'
import ProcessosTab from './ProcessosTab'
import DocumentacoesTab from './DocumentacoesTab'
import TarefasSocietarioTab from './TarefasSocietarioTab'

export default function SocietarioConfigClient() {
  return (
    <Pagina>
      <Caminho itens={[{ rotulo: 'Configurações', href: '/admin/configuracoes' }, { rotulo: 'Societário' }]} />
      <CabecalhoPagina titulo="Configurações do Societário" subtitulo="Tipos de processo, modelos de documentação e tarefas" />
      <Abas
        rotulo="Configurações do Societário"
        abas={[
          { id: 'processos', rotulo: 'Tipos de processo', conteudo: <ProcessosTab /> },
          { id: 'documentacoes', rotulo: 'Documentações', conteudo: <DocumentacoesTab /> },
          { id: 'tarefas', rotulo: 'Tarefas', conteudo: <TarefasSocietarioTab /> },
        ]}
      />
    </Pagina>
  )
}
