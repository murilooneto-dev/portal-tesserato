'use client'

import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Caminho } from '@/components/ui/Caminho'
import { Abas } from '@/components/ui/Abas'
import FinanceiroCatalogoTab from './FinanceiroCatalogoTab'
import TarefasFinanceiroTab from './TarefasFinanceiroTab'

export default function FinanceiroConfigClient() {
  return (
    <Pagina>
      <Caminho itens={[{ rotulo: 'Configurações', href: '/admin/configuracoes' }, { rotulo: 'Financeiro' }]} />
      <CabecalhoPagina titulo="Configurações do Financeiro" subtitulo="Tipos, centros de custo e tarefas do Financeiro" />
      <Abas
        rotulo="Configurações do Financeiro"
        abas={[
          { id: 'entrada', rotulo: 'Tipos de entrada', conteudo: <FinanceiroCatalogoTab tipo="tipos" natureza="entrada" label="tipo de entrada" /> },
          { id: 'saida', rotulo: 'Tipos de saída', conteudo: <FinanceiroCatalogoTab tipo="tipos" natureza="saida" label="tipo de saída" /> },
          { id: 'centro_custo_recebimento', rotulo: 'Centros de custo · recebimento', conteudo: <FinanceiroCatalogoTab tipo="centro_custo" natureza="entrada" label="centro de custo de recebimento" /> },
          { id: 'centro_custo_pagamento', rotulo: 'Centros de custo · pagamento', conteudo: <FinanceiroCatalogoTab tipo="centro_custo" natureza="saida" label="centro de custo de pagamento" /> },
          { id: 'tarefas', rotulo: 'Tarefas', conteudo: <TarefasFinanceiroTab /> },
        ]}
      />
    </Pagina>
  )
}
