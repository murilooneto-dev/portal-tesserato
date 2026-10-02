'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMesAno } from '@/lib/mes-atual-context'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import {
  TODOS,
  agruparPorSecao, filtrarParcelamentos, secoesParaMostrar, subtituloContagem,
  type Parcelamento, type SecaoParcelamento,
} from '@/lib/parcelamentos-tela'
import { montarRelatorioHtml } from '@/lib/parcelamentos-relatorio'
import GerenciarSecoesModal from '@/components/fiscal/GerenciarSecoesModal'
import { Pagina } from '@/components/ui/Pagina'
import { useToast } from '@/components/ui/Toast'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import ParcelamentoModal, { type ClienteCadastrado } from '@/components/fiscal/parcelamentos/ParcelamentoModal'
import ParcelamentosCabecalho from '@/components/fiscal/parcelamentos/ParcelamentosCabecalho'
import ParcelamentosConteudo from '@/components/fiscal/parcelamentos/ParcelamentosConteudo'

interface LinhaClienteFiscal {
  nome: string
  cnpj: string | null
  clientes_fiscal: { responsavel: string | null } | { responsavel: string | null }[] | null
}

export default function ParcelamentosPage() {
  const [items, setItems] = useState<Parcelamento[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useFiltroPersistente('parcelamentos:busca', '')
  const [secaoFiltro, setSecaoFiltro] = useFiltroPersistente('parcelamentos:secao', TODOS)
  const [respFiltro, setRespFiltro] = useFiltroPersistente('parcelamentos:responsavel', TODOS)
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<Parcelamento | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userNome, setUserNome] = useState<string | null>(null)
  const [clientesCadastrados, setClientesCadastrados] = useState<ClienteCadastrado[]>([])
  const [regimes, setRegimes] = useState<string[]>([])
  const [secoes, setSecoes] = useState<SecaoParcelamento[]>([])
  const [gerenciarSecoesOpen, setGerenciarSecoesOpen] = useState(false)

  const { ano, mes } = useMesAno()
  const confirmar = useConfirmar()
  const avisar = useToast()
  const [aoCriarSecao, setAoCriarSecao] = useState<((nome: string) => void) | null>(null)

  const sb = createClient()

  const responsaveisCadastrados = useMemo(() => Array.from(new Set(
    clientesCadastrados.map(c => c.responsavel ?? '').filter(Boolean)
  )).sort(), [clientesCadastrados])

  async function load(admin: boolean, nome: string | null) {
    setLoading(true)
    let q = sb.from('parcelamentos').select('*').order('empresa')
    if (!admin && nome) q = q.ilike('responsavel', nome)
    const { data } = await q
    setItems((data ?? []) as Parcelamento[])
    setLoading(false)
  }

  function carregarSecoes(): PromiseLike<SecaoParcelamento[]> {
    return sb.from('parcelamento_secoes').select('id, nome').order('created_at').then(({ data }) => {
      const secoesFrescas = data ?? []
      setSecoes(secoesFrescas)
      return secoesFrescas
    })
  }

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) return
      sb.from('profiles').select('nome,role').eq('id', data.user.id).single().then(({ data: p }) => {
        const admin = p?.role === 'admin'
        const nome = p?.nome ?? null
        setIsAdmin(admin)
        setUserNome(nome)
        load(admin, nome)
      })
    })
    sb.from('clientes').select('nome, cnpj, clientes_fiscal!inner(responsavel)').eq('clientes_fiscal.ativo', true).order('nome').then(({ data }) => {
      setClientesCadastrados(((data ?? []) as unknown as LinhaClienteFiscal[]).map(c => {
        const fiscal = Array.isArray(c.clientes_fiscal) ? c.clientes_fiscal[0] : c.clientes_fiscal
        return { nome: c.nome, cnpj: c.cnpj, responsavel: fiscal?.responsavel ?? null }
      }))
    })
    // Mesmo catálogo de regimes do Fiscal que o Editar empresa usa (buscarCatalogoCliente).
    sb.from('regimes').select('nome').eq('setor', 'fiscal').eq('ativo', true).order('nome').then(({ data }) => {
      setRegimes((data ?? []).map(r => r.nome as string))
    })
    carregarSecoes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setEditItem(null)
    setModalOpen(true)
  }
  function openEdit(item: Parcelamento) {
    setEditItem(item)
    setModalOpen(true)
  }

  async function handleDelete(id: string, nome: string) {
    const ok = await confirmar({
      titulo: 'Excluir parcelamento?',
      descricao: `Excluir parcelamento de "${nome}"?`,
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    const { error } = await sb.from('parcelamentos').delete().eq('id', id)
    if (error) { avisar('Não foi possível excluir o parcelamento. Tente de novo.', 'dng'); return }
    setItems(prev => prev.filter(p => p.id !== id))
    if (selecionadoId === id) setSelecionadoId(null)
  }

  async function handleSecoesChanged() {
    await Promise.all([carregarSecoes(), load(isAdmin, userNome)])
  }

  const responsaveis = Array.from(new Set(items.map(p => p.responsavel).filter(Boolean) as string[])).sort()

  const filtered = filtrarParcelamentos(items, { busca: search, secao: secaoFiltro, responsavel: respFiltro })
  const grupos = agruparPorSecao(filtered, secoesParaMostrar(secoes, secaoFiltro))

  function imprimir() {
    const agora = new Date().toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })
    const html = montarRelatorioHtml({ filtered, secoes, secaoFiltro, respFiltro, search, ano, agora })
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  return (
    <Pagina>
      <ParcelamentosCabecalho
        ano={ano}
        subtitulo={loading ? 'Carregando...' : subtituloContagem(grupos.reduce((n, g) => n + g.itens.length, 0), grupos.length)}
        busca={search}
        onBusca={setSearch}
        secaoFiltro={secaoFiltro}
        onSecao={setSecaoFiltro}
        respFiltro={respFiltro}
        onResp={setRespFiltro}
        secoes={secoes}
        responsaveis={responsaveis}
        mostrarResponsavel={isAdmin}
        onImprimir={imprimir}
        onNovo={openCreate}
      />

      {!loading && (
        <ParcelamentosConteudo
          grupos={grupos}
          selecionadoId={selecionadoId}
          mesAtual={mes}
          onSelecionar={setSelecionadoId}
          onEditar={openEdit}
          onExcluir={p => handleDelete(p.id, p.empresa)}
        />
      )}

      {/* As janelas vêm depois do painel de detalhe (Drawer no celular), no DOM,
          para empilhar por cima dele; o painel fica aberto por baixo e a
          seleção continua quando a janela fecha. */}
      {modalOpen && (
        <ParcelamentoModal
          item={editItem}
          secoes={secoes}
          clientes={clientesCadastrados}
          responsaveis={responsaveisCadastrados}
          regimes={regimes}
          onClose={() => setModalOpen(false)}
          onSalvo={() => load(isAdmin, userNome)}
          onGerenciarSecoes={aoCriar => { setAoCriarSecao(() => aoCriar); setGerenciarSecoesOpen(true) }}
        />
      )}

      {gerenciarSecoesOpen && (
        <GerenciarSecoesModal
          secoes={secoes}
          onClose={() => setGerenciarSecoesOpen(false)}
          onChanged={handleSecoesChanged}
          onCriada={aoCriarSecao ?? undefined}
        />
      )}
    </Pagina>
  )
}
