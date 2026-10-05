'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarMovimento, atualizarMovimento, listarFinanceiroTiposAtivos, listarFinanceiroCentrosCustoAtivos,
  criarFinanceiroTipo, criarFinanceiroCentroCusto,
} from '@/lib/financeiro-actions'
import { normalizarNome } from '@/lib/config-entidades'
import type { FinanceiroNatureza, FinanceiroTipo, FinanceiroCentroCusto } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Aviso } from '@/components/ui/Aviso'
import { Field } from '@/components/ui/Field'
import { Input, Textarea } from '@/components/ui/Input'
import SeletorComBusca from './SeletorComBusca'

export interface MovimentoParaEditar {
  id: string
  tipoId: string
  tipoNome: string
  centroCustoId: string | null
  centroCustoNome: string | null
  valor: number
  data: string
  observacao: string | null
}

interface Props {
  natureza: FinanceiroNatureza
  onClose: () => void
  movimento?: MovimentoParaEditar
}

// Link "Novo tipo" / "Novo centro" à direita do rótulo (m-16). Fica fora do
// <label> do Field para o clique não cair no campo.
function LinkDoRotulo({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-0 top-0 rounded text-[13px] font-semibold leading-[19px] text-acc-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
    >
      {children}
    </button>
  )
}

export default function NovoMovimentoModal({ natureza, onClose, movimento }: Props) {
  const router = useRouter()
  const [tipos, setTipos] = useState<FinanceiroTipo[]>([])
  const [centrosCusto, setCentrosCusto] = useState<FinanceiroCentroCusto[]>([])
  const [carregando, setCarregando] = useState(true)

  const [tipoId, setTipoId] = useState(movimento?.tipoId ?? '')
  const [valor, setValor] = useState(movimento ? String(movimento.valor) : '')
  const [data, setData] = useState(movimento?.data ?? '')
  const [centroCustoId, setCentroCustoId] = useState(movimento?.centroCustoId ?? '')
  const [observacao, setObservacao] = useState(movimento?.observacao ?? '')

  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  const [criandoTipo, setCriandoTipo] = useState(false)
  const [novoTipoNome, setNovoTipoNome] = useState('')
  const [salvandoTipo, setSalvandoTipo] = useState(false)
  const [erroTipo, setErroTipo] = useState<string | null>(null)

  const [criandoCentro, setCriandoCentro] = useState(false)
  const [novoCentroNome, setNovoCentroNome] = useState('')
  const [salvandoCentro, setSalvandoCentro] = useState(false)
  const [erroCentro, setErroCentro] = useState<string | null>(null)

  const recarregarTipos = useCallback(async () => {
    const resultado = await listarFinanceiroTiposAtivos(natureza)
    let lista = resultado.data
    // Editando um lançamento cujo tipo foi desativado depois de criado: o
    // seletor precisa continuar mostrando o nome atual mesmo fora da lista
    // de ativos, senão o campo aparece vazio ao abrir pra editar.
    if (movimento && !lista.some(t => t.id === movimento.tipoId)) {
      lista = [...lista, { id: movimento.tipoId, natureza, nome: movimento.tipoNome, ativo: false }]
    }
    setTipos(lista)
    return lista
  }, [natureza, movimento])

  const recarregarCentros = useCallback(async () => {
    const resultado = await listarFinanceiroCentrosCustoAtivos(natureza)
    let lista = resultado.data
    if (movimento?.centroCustoId && !lista.some(c => c.id === movimento.centroCustoId)) {
      lista = [...lista, { id: movimento.centroCustoId, nome: movimento.centroCustoNome ?? '', ativo: false, natureza }]
    }
    setCentrosCusto(lista)
    return lista
  }, [natureza, movimento])

  useEffect(() => {
    (async () => {
      await Promise.all([recarregarTipos(), recarregarCentros()])
      setCarregando(false)
    })()
  }, [recarregarTipos, recarregarCentros])

  async function handleCriarTipo() {
    if (!novoTipoNome.trim()) return
    setSalvandoTipo(true)
    setErroTipo(null)
    const { error } = await criarFinanceiroTipo(natureza, novoTipoNome)
    if (error) {
      setErroTipo(error)
      setSalvandoTipo(false)
      return
    }
    const nomeCriado = novoTipoNome.trim()
    const atualizados = await recarregarTipos()
    const criado = atualizados.find(t => normalizarNome(t.nome) === normalizarNome(nomeCriado))
    if (criado) setTipoId(criado.id)
    setNovoTipoNome('')
    setCriandoTipo(false)
    setSalvandoTipo(false)
  }

  async function handleCriarCentro() {
    if (!novoCentroNome.trim()) return
    setSalvandoCentro(true)
    setErroCentro(null)
    const { error } = await criarFinanceiroCentroCusto(natureza, novoCentroNome)
    if (error) {
      setErroCentro(error)
      setSalvandoCentro(false)
      return
    }
    const nomeCriado = novoCentroNome.trim()
    const atualizados = await recarregarCentros()
    const criado = atualizados.find(c => normalizarNome(c.nome) === normalizarNome(nomeCriado))
    if (criado) setCentroCustoId(criado.id)
    setNovoCentroNome('')
    setCriandoCentro(false)
    setSalvandoCentro(false)
  }

  // Remonta os seletores ao limpar: texto digitado sem escolher opção não fica para trás.
  const [rodada, setRodada] = useState(0)

  function limparParaProximo() {
    setRodada(r => r + 1)
    setTipoId('')
    setValor('')
    setCentroCustoId('')
    setObservacao('')
  }

  async function handleSave() {
    const valorNumerico = Number(valor.replace(',', '.'))
    if (!tipoId) { setErro('Selecione o tipo.'); return }
    if (!data) { setErro('Selecione a data.'); return }
    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) { setErro('Informe um valor válido.'); return }

    setSaving(true)
    setErro(null)
    setSucesso(false)

    const resultado = movimento
      ? await atualizarMovimento({
          id: movimento.id,
          natureza,
          tipoId,
          centroCustoId: centroCustoId || null,
          valor: valorNumerico,
          data,
          observacao: observacao.trim() || null,
        })
      : await criarMovimento({
          natureza,
          tipoId,
          centroCustoId: centroCustoId || null,
          valor: valorNumerico,
          data,
          observacao: observacao.trim() || null,
        })

    if ('error' in resultado && resultado.error) {
      setSaving(false)
      setErro(resultado.error)
      return
    }

    setSaving(false)
    router.refresh()

    if (movimento) {
      // Editando um lançamento existente: salvar e fechar, sem fluxo de
      // "próximo" (não faz sentido continuar editando o mesmo registro).
      onClose()
      return
    }

    // Criando: a janela fica aberta pra lançar o próximo em sequência, só
    // limpa os campos (mantém a data — normalmente vários lançamentos do
    // mesmo dia). Fechar ou o X do canto encerram.
    limparParaProximo()
    setSucesso(true)
  }

  const titulo = movimento
    ? (natureza === 'entrada' ? 'Editar recebimento' : 'Editar pagamento')
    : (natureza === 'entrada' ? 'Novo recebimento' : 'Novo pagamento')

  const podeSalvar = !saving && !!tipoId && !!data && !!valor

  const rodape = movimento ? (
    <>
      <div className="flex-1" />
      <Button variante="fantasma" onClick={onClose} disabled={saving}>Cancelar</Button>
      <Button variante="primario" onClick={handleSave} disabled={!podeSalvar} carregando={saving}>
        {saving ? 'Salvando…' : 'Salvar'}
      </Button>
    </>
  ) : (
    <>
      <Button variante="fantasma" onClick={() => { limparParaProximo(); setErro(null); setSucesso(false) }} disabled={saving}>Limpar</Button>
      <div className="flex-1" />
      <Button variante="fantasma" onClick={onClose} disabled={saving}>Fechar</Button>
      <Button variante="primario" onClick={handleSave} disabled={!podeSalvar} carregando={saving}>
        {saving ? 'Salvando…' : 'Salvar e lançar outro'}
      </Button>
    </>
  )

  return (
    <Modal
      aberto
      onFechar={onClose}
      titulo={titulo}
      subtitulo="Financeiro"
      largura="p"
      fecharAoClicarFora={false}
      bloqueado={saving}
      rodape={rodape}
    >
      {sucesso && !erro && (
        <Aviso tom="ok">
          <b>Lançamento salvo.</b> Os campos foram limpos para o próximo; a data foi mantida.
        </Aviso>
      )}

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field rotulo="Data" obrigatorio>
          {c => <Input id={c.id} type="date" value={data} onChange={e => setData(e.target.value)} />}
        </Field>
        <Field rotulo="Valor" obrigatorio>
          {c => (
            <Input
              id={c.id}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="R$ 0,00"
              className="tabular-nums"
            />
          )}
        </Field>
      </div>

      <div className="relative">
        <Field
          rotulo="Tipo"
          obrigatorio
          erro={erroTipo}
          ajuda={!criandoTipo && !carregando && tipos.length === 0 ? 'Nenhum tipo cadastrado ainda.' : undefined}
        >
          {c => criandoTipo ? (
            <div className="flex gap-2">
              <Input
                id={c.id}
                aria-describedby={c.describedBy}
                invalido={c.invalido}
                value={novoTipoNome}
                onChange={e => setNovoTipoNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCriarTipo() }}
                placeholder="Nome do novo tipo"
                autoFocus
              />
              <Button onClick={handleCriarTipo} disabled={!novoTipoNome.trim()} carregando={salvandoTipo} className="flex-none">
                Criar
              </Button>
            </div>
          ) : (
            <SeletorComBusca
              key={`tipo-${rodada}`}
              id={c.id}
              describedBy={c.describedBy}
              invalido={c.invalido}
              value={tipoId}
              onChange={setTipoId}
              opcoes={tipos}
              placeholder="Buscar ou escolher"
              disabled={carregando}
            />
          )}
        </Field>
        <LinkDoRotulo onClick={() => { setCriandoTipo(v => !v); setErroTipo(null) }}>
          {criandoTipo ? 'Cancelar' : 'Novo tipo'}
        </LinkDoRotulo>
      </div>

      <div className="relative">
        <Field rotulo="Centro de custo" erro={erroCentro}>
          {c => criandoCentro ? (
            <div className="flex gap-2">
              <Input
                id={c.id}
                aria-describedby={c.describedBy}
                invalido={c.invalido}
                value={novoCentroNome}
                onChange={e => setNovoCentroNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCriarCentro() }}
                placeholder="Nome do novo centro de custo"
                autoFocus
              />
              <Button onClick={handleCriarCentro} disabled={!novoCentroNome.trim()} carregando={salvandoCentro} className="flex-none">
                Criar
              </Button>
            </div>
          ) : (
            <SeletorComBusca
              key={`centro-${rodada}`}
              id={c.id}
              describedBy={c.describedBy}
              invalido={c.invalido}
              value={centroCustoId}
              onChange={setCentroCustoId}
              opcoes={centrosCusto}
              placeholder="Nenhum"
              disabled={carregando}
              iconeBusca={false}
            />
          )}
        </Field>
        <LinkDoRotulo onClick={() => { setCriandoCentro(v => !v); setErroCentro(null) }}>
          {criandoCentro ? 'Cancelar' : 'Novo centro'}
        </LinkDoRotulo>
      </div>

      <Field rotulo="Observação">
        {c => (
          <Textarea id={c.id} rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional" className="min-h-[56px]" />
        )}
      </Field>

      {erro && <Aviso tom="dng">{erro}</Aviso>}
    </Modal>
  )
}
