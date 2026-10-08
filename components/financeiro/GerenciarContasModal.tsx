'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, CircleSlash, Pencil } from 'lucide-react'
import { definirFormaPagamentoTipo, listarContasRecorrentes, previaFormaPagamentoTipo, renomearContaAPagar } from '@/lib/financeiro-actions'
import { textoFormaConta } from '@/lib/financeiro-movimentos'
import type { FinanceiroTipo } from '@/lib/types'
import MenuMaisAcoes from '@/components/geral/MenuMaisAcoes'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Aviso } from '@/components/ui/Aviso'
import { Input } from '@/components/ui/Input'
import { EsqueletoLinhas } from '@/components/ui/Esqueleto'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import FormaPagamentoModal from './FormaPagamentoModal'

interface Props {
  onClose: () => void
  /** Chamado depois de editar, renomear ou encerrar: a tela de fora recarrega as contas. */
  onMudou: () => void
}

// Gerenciar contas: as contas que se repetem (Recorrente e Prazo determinado).
// Aqui se muda valor, dia e prazo, se renomeia e se encerra. Conta Única não
// aparece: ela se edita direto na lista de Contas a Pagar.
export default function GerenciarContasModal({ onClose, onMudou }: Props) {
  const confirmar = useConfirmar()
  const avisar = useToast()
  const [contas, setContas] = useState<FinanceiroTipo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<FinanceiroTipo | null>(null)
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState('')
  const [trabalhando, setTrabalhando] = useState(false)

  const recarregar = useCallback(async () => {
    const { data, error } = await listarContasRecorrentes()
    if (error) setErro(error)
    else { setContas(data); setErro(null) }
    setCarregando(false)
  }, [])

  useEffect(() => {
    async function iniciar() { await recarregar() }
    iniciar()
  }, [recarregar])

  async function handleRenomear(conta: FinanceiroTipo) {
    if (!nomeEditado.trim() || trabalhando) return
    setTrabalhando(true)
    const { error } = await renomearContaAPagar(conta.id, nomeEditado)
    setTrabalhando(false)
    if (error) { setErro(error); return }
    setRenomeandoId(null)
    avisar('Salvo', 'ok')
    await recarregar()
    onMudou()
  }

  async function handleEncerrar(conta: FinanceiroTipo) {
    setErro(null)
    // Encerrar é a forma "avulso" da função do banco: apaga as contas não pagas e mantém as pagas.
    const input = { tipoId: conta.id, forma: 'avulso' as const, valor: null, dia: null, mesInicio: null, qtdMeses: null }
    setTrabalhando(true)
    const { data: previa, error: erroPrevia } = await previaFormaPagamentoTipo(input)
    setTrabalhando(false)
    if (erroPrevia || !previa) { setErro(erroPrevia ?? 'Não foi possível calcular o resultado.'); return }

    const apagadas = previa.apagadas
    const ok = await confirmar({
      titulo: `Encerrar "${conta.nome}"?`,
      descricao: `${apagadas === 0
        ? 'Nenhuma conta não paga será apagada.'
        : apagadas === 1 ? '1 conta não paga será apagada.' : `${apagadas} contas não pagas serão apagadas.`
      } As contas já pagas continuam no histórico de Pagamentos.`,
      textoConfirmar: 'Encerrar',
      perigo: true,
    })
    if (!ok) return

    setTrabalhando(true)
    const { error } = await definirFormaPagamentoTipo(input)
    setTrabalhando(false)
    if (error) { setErro(error); return }
    avisar('Conta encerrada.', 'ok')
    await recarregar()
    onMudou()
  }

  return (
    <>
      <Modal
        aberto
        onFechar={onClose}
        titulo="Gerenciar contas"
        subtitulo="Financeiro"
        largura="m"
        bloqueado={trabalhando}
        rodape={
          <>
            <div className="flex-1" />
            <Button variante="fantasma" onClick={onClose}>Fechar</Button>
          </>
        }
      >
        {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

        {carregando ? (
          <EsqueletoLinhas linhas={3} />
        ) : contas.length === 0 ? (
          <p className="text-sm text-fg-3">Nenhuma conta recorrente ou com prazo. Crie uma em Nova conta.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line-soft">
            {contas.map(conta => (
              <li key={conta.id} className="flex min-w-0 items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  {renomeandoId === conta.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        aria-label={`Novo nome de ${conta.nome}`}
                        value={nomeEditado}
                        onChange={e => setNomeEditado(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenomear(conta)
                          if (e.key === 'Escape') setRenomeandoId(null)
                        }}
                        className="min-w-[10rem] flex-1"
                        autoFocus
                      />
                      <Button tamanho="p" onClick={() => handleRenomear(conta)} disabled={!nomeEditado.trim()} carregando={trabalhando}>Salvar</Button>
                      <Button tamanho="p" variante="fantasma" onClick={() => setRenomeandoId(null)} disabled={trabalhando}>Cancelar</Button>
                    </div>
                  ) : (
                    <>
                      <p className="truncate font-semibold text-fg" title={conta.nome}>{conta.nome}</p>
                      <p className="text-[13px] text-fg-3">{textoFormaConta(conta)}</p>
                    </>
                  )}
                </div>
                {renomeandoId !== conta.id && (
                  <MenuMaisAcoes
                    rotulo={`Editar, renomear ou encerrar ${conta.nome}`}
                    itens={[
                      { rotulo: 'Editar', icone: <CalendarClock size={16} aria-hidden="true" />, onSelecionar: () => setEditando(conta) },
                      { rotulo: 'Renomear', icone: <Pencil size={16} aria-hidden="true" />, onSelecionar: () => { setRenomeandoId(conta.id); setNomeEditado(conta.nome) } },
                      { rotulo: 'Encerrar', icone: <CircleSlash size={16} aria-hidden="true" />, perigo: true, onSelecionar: () => handleEncerrar(conta) },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {editando && (
        <FormaPagamentoModal
          tipo={editando}
          onClose={() => setEditando(null)}
          onSalvo={async () => { setEditando(null); avisar('Conta salva.', 'ok'); await recarregar(); onMudou() }}
        />
      )}
    </>
  )
}
