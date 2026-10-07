'use client'

import { useState } from 'react'
import { definirFormaPagamentoTipo, previaFormaPagamentoTipo } from '@/lib/financeiro-actions'
import { textoPreviaFormaPagamento, type ResultadoFormaPagamento } from '@/lib/financeiro-movimentos'
import { getMesAnoRealAgora } from '@/lib/mes-atual'
import type { FinanceiroFormaPagamento, FinanceiroTipo } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Aviso } from '@/components/ui/Aviso'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Segmentado, type OpcaoSegmentada } from '@/components/ui/Segmentado'

interface Props {
  tipo: FinanceiroTipo
  onClose: () => void
  onSalvo: () => void
}

const OPCOES: OpcaoSegmentada<FinanceiroFormaPagamento>[] = [
  { valor: 'avulso', rotulo: 'Avulso' },
  { valor: 'recorrente', rotulo: 'Recorrente' },
  { valor: 'prazo', rotulo: 'Prazo determinado' },
]

const EXPLICACAO: Record<FinanceiroFormaPagamento, string> = {
  avulso: 'Não cria contas.',
  recorrente: 'Cria uma conta por mês, até dezembro, e renova todo ano.',
  prazo: 'Cria uma conta por mês, pela quantidade de meses informada.',
}

function mesComoTexto(mes: number, ano: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`
}

export default function FormaPagamentoModal({ tipo, onClose, onSalvo }: Props) {
  // Mês de hoje no fuso de São Paulo, fixado ao abrir a janela.
  const [mesAtual] = useState(() => {
    const { mes, ano } = getMesAnoRealAgora()
    return mesComoTexto(mes, ano)
  })
  const formaInicial: FinanceiroFormaPagamento = tipo.forma_pagamento ?? 'avulso'
  const mesInicialDoTipo = tipo.mes_inicio ? tipo.mes_inicio.slice(0, 7) : null

  const [forma, setForma] = useState<FinanceiroFormaPagamento>(formaInicial)
  const [valor, setValor] = useState(tipo.valor_padrao != null ? String(tipo.valor_padrao) : '')
  const [dia, setDia] = useState(tipo.dia_vencimento != null ? String(tipo.dia_vencimento) : '')
  const [mesInicio, setMesInicio] = useState(mesInicialDoTipo ?? mesAtual)
  const [qtdMeses, setQtdMeses] = useState(tipo.qtd_meses != null ? String(tipo.qtd_meses) : '')

  const [previa, setPrevia] = useState<ResultadoFormaPagamento | null>(null)
  const [trabalhando, setTrabalhando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const usaSerie = forma !== 'avulso'
  const diaNumero = Number(dia)

  // Mexer em qualquer campo descarta a prévia e volta ao primeiro passo.
  function alterar<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPrevia(null); setErro(null) }
  }

  // Mesmas regras do banco; ele continua sendo quem decide.
  function validar(): string | null {
    if (!usaSerie) return null
    const valorNumerico = Number(valor.replace(',', '.'))
    if (!valor || !Number.isFinite(valorNumerico) || valorNumerico <= 0) return 'Informe um valor maior que zero.'
    if (!Number.isInteger(diaNumero) || diaNumero < 1 || diaNumero > 31) return 'O dia do vencimento deve ficar entre 1 e 31.'
    if (!/^\d{4}-\d{2}$/.test(mesInicio)) return 'Escolha o mês de início.'
    // Um tipo que já começou num mês passado pode manter esse mês.
    if (mesInicio < mesAtual && mesInicio !== mesInicialDoTipo) return 'O mês de início não pode ser anterior ao mês atual.'
    if (forma === 'prazo') {
      const q = Number(qtdMeses)
      if (!Number.isInteger(q) || q < 1 || q > 120) return 'A quantidade de meses deve ficar entre 1 e 120.'
    }
    return null
  }

  function montarInput() {
    return {
      tipoId: tipo.id,
      forma,
      valor: usaSerie ? Number(valor.replace(',', '.')) : null,
      dia: usaSerie ? diaNumero : null,
      mesInicio: usaSerie ? `${mesInicio}-01` : null,
      qtdMeses: forma === 'prazo' ? Number(qtdMeses) : null,
    }
  }

  async function salvar() {
    const invalido = validar()
    if (invalido) { setErro(invalido); return }
    setTrabalhando(true)
    setErro(null)
    const input = montarInput()
    const { data, error } = await previaFormaPagamentoTipo(input)
    if (error || !data) {
      setErro(error ?? 'Não foi possível calcular o resultado.')
      setTrabalhando(false)
      return
    }
    const nadaMuda = data.criadas === 0 && data.alteradas === 0 && data.apagadas === 0
    if (nadaMuda && forma === formaInicial) {
      await confirmar()
      return
    }
    setPrevia(data)
    setTrabalhando(false)
  }

  async function confirmar() {
    setTrabalhando(true)
    setErro(null)
    const { error } = await definirFormaPagamentoTipo(montarInput())
    if (error) {
      setErro(error)
      setTrabalhando(false)
      return
    }
    setTrabalhando(false)
    onSalvo()
  }

  const rodape = previa ? (
    <>
      <div className="flex-1" />
      <Button variante="fantasma" onClick={() => { setPrevia(null); setErro(null) }} disabled={trabalhando}>Voltar</Button>
      <Button variante="primario" onClick={confirmar} carregando={trabalhando}>
        {trabalhando ? 'Salvando…' : 'Confirmar'}
      </Button>
    </>
  ) : (
    <>
      <div className="flex-1" />
      <Button variante="fantasma" onClick={onClose} disabled={trabalhando}>Cancelar</Button>
      <Button variante="primario" onClick={salvar} carregando={trabalhando}>
        {trabalhando ? 'Verificando…' : 'Salvar'}
      </Button>
    </>
  )

  return (
    <Modal
      aberto
      onFechar={onClose}
      titulo={`Forma de pagamento · ${tipo.nome}`}
      subtitulo="Financeiro"
      largura="p"
      fecharAoClicarFora={false}
      bloqueado={trabalhando}
      rodape={rodape}
    >
      <div className="flex flex-col gap-1.5">
        <Segmentado rotulo="Forma de pagamento" opcoes={OPCOES} valor={forma} onMudar={alterar(setForma)} disabled={trabalhando} />
        <p className="text-[13px] text-fg-3">{EXPLICACAO[forma]}</p>
      </div>

      {usaSerie && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field rotulo="Valor" obrigatorio>
            {c => (
              <Input
                id={c.id}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={valor}
                onChange={e => alterar(setValor)(e.target.value)}
                placeholder="R$ 0,00"
                className="tabular-nums"
              />
            )}
          </Field>
          <Field
            rotulo="Dia do vencimento"
            obrigatorio
            ajuda={diaNumero >= 29 && diaNumero <= 31 ? 'Nos meses mais curtos, vence no último dia.' : undefined}
          >
            {c => (
              <Input
                id={c.id}
                aria-describedby={c.describedBy}
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                max="31"
                value={dia}
                onChange={e => alterar(setDia)(e.target.value)}
                className="tabular-nums"
              />
            )}
          </Field>
          <Field rotulo="Mês de início" obrigatorio>
            {c => (
              <Input
                id={c.id}
                type="month"
                min={mesInicialDoTipo ? undefined : mesAtual}
                value={mesInicio}
                onChange={e => alterar(setMesInicio)(e.target.value)}
              />
            )}
          </Field>
          {forma === 'prazo' && (
            <Field rotulo="Quantidade de meses" obrigatorio>
              {c => (
                <Input
                  id={c.id}
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="1"
                  max="120"
                  value={qtdMeses}
                  onChange={e => alterar(setQtdMeses)(e.target.value)}
                  className="tabular-nums"
                />
              )}
            </Field>
          )}
        </div>
      )}

      {previa && (
        <Aviso tom={previa.apagadas > 0 ? 'dng' : 'info'}>
          {textoPreviaFormaPagamento(previa, forma, usaSerie ? Number(valor.replace(',', '.')) : null, usaSerie ? diaNumero : null)}
        </Aviso>
      )}

      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
    </Modal>
  )
}
