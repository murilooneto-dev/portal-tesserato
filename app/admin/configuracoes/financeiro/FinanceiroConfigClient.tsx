'use client'

import { useState } from 'react'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Caminho } from '@/components/ui/Caminho'
import { Abas } from '@/components/ui/Abas'
import FinanceiroCatalogoTab from './FinanceiroCatalogoTab'
import TarefasFinanceiroTab from './TarefasFinanceiroTab'
import GruposTarefasFinanceiroTab from './GruposTarefasFinanceiroTab'
import AvisoVencimentoTab from './AvisoVencimentoTab'

export default function FinanceiroConfigClient() {
  const [trocas, setTrocas] = useState(0)
  return (
    <Pagina>
      <Caminho itens={[{ rotulo: 'Configurações', href: '/admin/configuracoes' }, { rotulo: 'Financeiro' }]} />
      <CabecalhoPagina titulo="Configurações do Financeiro" subtitulo="Tipos, centros de custo e tarefas do Financeiro" />
      <Abas
        rotulo="Configurações do Financeiro"
        onTrocar={() => setTrocas(n => n + 1)}
        abas={[
          { id: 'entrada', rotulo: 'Tipos de entrada', conteudo: <FinanceiroCatalogoTab tipo="tipos" natureza="entrada" label="tipo de entrada" /> },
          { id: 'centro_custo_recebimento', rotulo: 'Centros de custo · recebimento', conteudo: <FinanceiroCatalogoTab tipo="centro_custo" natureza="entrada" label="centro de custo de recebimento" mostrada={trocas} /> },
          { id: 'centro_custo_pagamento', rotulo: 'Centros de custo · pagamento', conteudo: <FinanceiroCatalogoTab tipo="centro_custo" natureza="saida" label="centro de custo de pagamento" mostrada={trocas} /> },
          { id: 'tarefas', rotulo: 'Tarefas', conteudo: <TarefasFinanceiroTab /> },
          { id: 'grupos_tarefas', rotulo: 'Grupos de tarefas', conteudo: <GruposTarefasFinanceiroTab mostrada={trocas} /> },
          { id: 'aviso_vencimento', rotulo: 'Aviso de vencimento', conteudo: <AvisoVencimentoTab /> },
        ]}
      />
    </Pagina>
  )
}
