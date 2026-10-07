'use client'

import { useState } from 'react'
import { criarContaAPagar } from '@/lib/financeiro-actions'
import { normalizarMes, previaNovaConta, textoPreviaFormaPagamento, type ResultadoFormaPagamento } from '@/lib/financeiro-movimentos'
import { getMesAnoRealAgora } from '@/lib/mes-atual'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Aviso } from '@/components/ui/Aviso'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Segmentado, type OpcaoSegmentada } from '@/components/ui/Segmentado'

type Forma = 'recorrente' | 'prazo'

interface Props {
  onClose: () => void
  /** Chamado depois de criar, com o que o banco gerou. */
  onCriada: (nome: string, resultado: ResultadoFormaPagamento) => void
}

const OPCOES: OpcaoSegmentada<Forma>[] = [
  { valor: 'recorrente', rotulo: 'Recorrente' },
  { valor: 'prazo', rotulo: 'Prazo determinado' },
]

const EXPLICACAO: Record<Forma, string> = {
  recorrente: 'Cria uma conta por mês, até dezembro, e renova todo ano.',
  prazo: 'Cria uma conta por mês, pela quantidade de meses informada.',
}

// Nova conta a pagar: cadastra o Tipo de Saída e a forma de pagamento dele de
// uma vez só. Depois de criada, valor, dia e prazo mudam em Configurações >
// Financeiro > Tipos de saída.
export default function NovaContaModal({ onClose, onCriada }: Props) {
  // Mês de hoje no fuso de São Paulo, fixado ao abrir a janela.
  const [hoje] = useState(() => getMesAnoRealAgora())
  const mesAtual = `${hoje.ano}-${String(hoje.mes).padStart(2, '0')}`

  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [forma, setForma] = useState<Forma>('recorrente')
  const [dia, setDia] = useState('')
  const [mesInicio, setMesInicio] = useState(mesAtual)
  const [qtdMeses, setQtdMeses] = useState('')

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const valorNumerico = Number(valor.replace(',', '.'))
  const diaNumero = Number(dia)
  const qtdNumero = Number(qtdMeses)
  const mesNormalizado = normalizarMes(mesInicio)

  // Mesmas regras do banco; ele continua sendo quem decide.
  function validar(): string | null {
    if (!nome.trim()) return 'Informe o nome da conta.'
    if (!valor || !Number.isFinite(valorNumerico) || valorNumerico <= 0) return 'Informe um valor maior que zero.'
    if (!Number.isInteger(diaNumero) || diaNumero < 1 || diaNumero > 31) return 'O dia do vencimento deve ficar entre 1 e 31.'
    if (!mesNormalizado) return 'Escolha o mês de início no formato MM/AAAA.'
    if (mesNormalizado < mesAtual) return 'O mês de início não pode ser anterior ao mês atual.'
    if (forma === 'prazo' && (!Number.isInteger(qtdNumero) || qtdNumero < 1 || qtdNumero > 120)) {
      return 'A quantidade de meses deve ficar entre 1 e 120.'
    }
    return null
  }

  // Com tudo preenchido, a janela já diz o que vai ser criado.
  const previa = validar() === null && mesNormalizado
    ? previaNovaConta(forma, mesNormalizado, forma === 'prazo' ? qtdNumero : null, hoje)
    : null

  async function salvar() {
    const invalido = validar()
    if (invalido || !mesNormalizado) { setErro(invalido); return }
    setSalvando(true)
    setErro(null)
    const { data, error } = await criarContaAPagar({
      nome,
      forma,
      valor: valorNumerico,
      dia: diaNumero,
      mesInicio: `${mesNormalizado}-01`,
      qtdMeses: forma === 'prazo' ? qtdNumero : null,
    })
    setSalvando(false)
    if (error || !data) { setErro(error ?? 'Não foi possível criar a conta.'); return }
    onCriada(nome.trim(), data)
  }

  function mudar<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setErro(null) }
  }

  return (
    <Modal
      aberto
      onFechar={onClose}
      titulo="Nova conta"
      subtitulo="Financeiro"
      largura="p"
      fecharAoClicarFora={false}
      bloqueado={salvando}
      rodape={
        <>
          <div className="flex-1" />
          <Button variante="fantasma" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button variante="primario" onClick={salvar} carregando={salvando}>
            {salvando ? 'Criando…' : 'Criar conta'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field rotulo="Nome da conta" obrigatorio className="sm:col-span-2" ajuda="Vira um Tipo de Saída com esse nome.">
          {c => (
            <Input
              id={c.id}
              aria-describedby={c.describedBy}
              value={nome}
              onChange={e => mudar(setNome)(e.target.value)}
              placeholder="Ex.: Aluguel"
              disabled={salvando}
              autoFocus
            />
          )}
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
              onChange={e => mudar(setValor)(e.target.value)}
              placeholder="R$ 0,00"
              disabled={salvando}
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
              onChange={e => mudar(setDia)(e.target.value)}
              disabled={salvando}
              className="tabular-nums"
            />
          )}
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <Segmentado rotulo="Forma de pagamento" opcoes={OPCOES} valor={forma} onMudar={mudar(setForma)} disabled={salvando} />
        <p className="text-[13px] text-fg-3">{EXPLICACAO[forma]}</p>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field rotulo="Mês de início" obrigatorio ajuda="mês e ano (MM/AAAA)">
          {c => (
            <Input
              id={c.id}
              aria-describedby={c.describedBy}
              type="month"
              min={mesAtual}
              value={mesInicio}
              onChange={e => mudar(setMesInicio)(e.target.value)}
              disabled={salvando}
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
                onChange={e => mudar(setQtdMeses)(e.target.value)}
                disabled={salvando}
                className="tabular-nums"
              />
            )}
          </Field>
        )}
      </div>

      {previa && !erro && (
        <div role="status">
          <Aviso tom="info">{textoPreviaFormaPagamento(previa, valorNumerico, diaNumero)}</Aviso>
        </div>
      )}

      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
    </Modal>
  )
}
