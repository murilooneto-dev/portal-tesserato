'use client'

import { useEffect, useState, useCallback } from 'react'
import { List, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import type { FinanceiroNatureza } from '@/lib/types'
import {
  listarFinanceiroTipos, criarFinanceiroTipo, renomearFinanceiroTipo, alternarAtivoFinanceiroTipo, excluirFinanceiroTipo,
  listarFinanceiroCentrosCusto, criarFinanceiroCentroCusto, renomearFinanceiroCentroCusto, alternarAtivoFinanceiroCentroCusto, excluirFinanceiroCentroCusto,
} from '@/lib/financeiro-actions'
import { ordenarPorNome } from '@/lib/config-entidades'
import MenuMaisAcoes from '@/components/geral/MenuMaisAcoes'
import { Card } from '@/components/ui/Card'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'

interface Item { id: string; nome: string; ativo: boolean; natureza?: FinanceiroNatureza | null }

interface Props {
  tipo: 'tipos' | 'centro_custo'
  natureza: FinanceiroNatureza
  // Em minúsculas: "tipo de entrada", "centro de custo de pagamento"…
  label: string
  /** Conta quantas vezes a aba foi aberta: ao mudar, a lista é relida. */
  mostrada?: number
}

export default function FinanceiroCatalogoTab({ tipo, natureza, label, mostrada = 0 }: Props) {
  const confirmar = useConfirmar()
  const avisar = useToast()
  const [itens, setItens] = useState<Item[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState('')

  const ehCentro = tipo === 'centro_custo'
  const tituloColuna = ehCentro ? 'Centro de custo' : label.charAt(0).toUpperCase() + label.slice(1)

  // O estado já começa em "carregando": só grava estado depois que a consulta
  // volta (a tabela fica na tela enquanto atualiza).
  const recarregar = useCallback(async () => {
    const { data, error } = tipo === 'tipos'
      ? await listarFinanceiroTipos(natureza)
      : await listarFinanceiroCentrosCusto(natureza)
    if (error) setErro(error)
    else { setItens(ordenarPorNome(data)); setErro(null) }
    setCarregando(false)
  }, [tipo, natureza])

  // Relê também quando a aba volta a ser mostrada: um centro de custo antigo
  // "sem categoria" aparece nas duas abas de centro e pode ter mudado na outra.
  useEffect(() => {
    async function iniciar() { await recarregar() }
    iniciar()
  }, [recarregar, mostrada])

  async function handleCriar() {
    if (!novoNome.trim() || salvandoNovo) return
    setSalvandoNovo(true)
    const { error } = tipo === 'tipos'
      ? await criarFinanceiroTipo(natureza, novoNome)
      : await criarFinanceiroCentroCusto(natureza, novoNome)
    if (error) setErro(error)
    else { setNovoNome(''); setErro(null); avisar(ehCentro ? 'Centro de custo criado.' : 'Tipo criado.', 'ok'); await recarregar() }
    setSalvandoNovo(false)
  }

  async function handleRenomear(id: string) {
    if (!nomeEditado.trim()) return
    const { error } = tipo === 'tipos'
      ? await renomearFinanceiroTipo(id, nomeEditado)
      : await renomearFinanceiroCentroCusto(id, nomeEditado)
    if (error) { setErro(error); return }
    setEditandoId(null)
    setErro(null)
    avisar('Salvo', 'ok')
    await recarregar()
  }

  async function handleAlternarAtivo(item: Item) {
    const { error } = tipo === 'tipos'
      ? await alternarAtivoFinanceiroTipo(item.id, !item.ativo)
      : await alternarAtivoFinanceiroCentroCusto(item.id, !item.ativo)
    if (error) { setErro(error); return }
    setErro(null)
    await recarregar()
  }

  async function handleExcluir(item: Item) {
    const ok = await confirmar({
      titulo: `Excluir "${item.nome}"?`,
      descricao: 'Essa ação não pode ser desfeita.',
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    const { error } = tipo === 'tipos'
      ? await excluirFinanceiroTipo(item.id)
      : await excluirFinanceiroCentroCusto(item.id)
    if (error) { setErro(error); return }
    setErro(null)
    avisar(ehCentro ? 'Centro de custo excluído.' : 'Tipo excluído.', 'ok')
    await recarregar()
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field rotulo="Nome" className="min-w-[14rem] flex-1">
          {c => (
            <Input
              id={c.id}
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCriar() }}
              placeholder={`Nome do novo ${label}`}
            />
          )}
        </Field>
        <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={handleCriar} disabled={!novoNome.trim()} carregando={salvandoNovo}>
          {ehCentro ? 'Criar centro de custo' : 'Criar tipo'}
        </Button>
      </div>

      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

      <Card semPadding className="overflow-hidden">
        {carregando && itens.length === 0 ? (
          <p className="px-[18px] py-6 text-sm text-fg-3">Carregando…</p>
        ) : itens.length === 0 ? (
          <EmptyState icone={<List size={24} />} titulo={`Nenhum ${label} cadastrado ainda`} descricao="Crie pelo campo acima." />
        ) : (
          <div className="relative overflow-x-auto xl:overflow-visible">
            <Tabela className="min-w-[480px]">
              <thead>
                <tr>
                  <Th>{tituloColuna}</Th>
                  <Th largura={160}>Situação</Th>
                  <Th largura={56}><span className="sr-only">Mais ações</span></Th>
                </tr>
              </thead>
              <tbody>
                {itens.map(item => (
                  <tr key={item.id}>
                    <Td>
                      {editandoId === item.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`Novo nome de ${item.nome}`}
                            value={nomeEditado}
                            onChange={e => setNomeEditado(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenomear(item.id)
                              if (e.key === 'Escape') setEditandoId(null)
                            }}
                            autoFocus
                          />
                          <Button tamanho="p" onClick={() => handleRenomear(item.id)} disabled={!nomeEditado.trim()}>Salvar</Button>
                          <Button tamanho="p" variante="fantasma" onClick={() => setEditandoId(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                          <span className={cn('min-w-0 truncate font-semibold', item.ativo ? 'text-fg' : 'text-fg-3 line-through')} title={item.nome}>
                            {item.nome}
                          </span>
                          {ehCentro && !item.natureza && (
                            <span className="text-xs text-fg-3">(sem categoria — item antigo)</span>
                          )}
                        </span>
                      )}
                    </Td>
                    <Td>{item.ativo ? <Badge tom="ok">Ativo</Badge> : <Badge tom="neu">Desativado</Badge>}</Td>
                    <Td alinhar="dir" className="px-2">
                      <div className="flex justify-end">
                        <MenuMaisAcoes
                          rotulo={`Renomear, desativar ou excluir ${item.nome}`}
                          itens={[
                            { rotulo: 'Renomear', icone: <Pencil size={16} aria-hidden="true" />, onSelecionar: () => { setEditandoId(item.id); setNomeEditado(item.nome) } },
                            { rotulo: item.ativo ? 'Desativar' : 'Ativar', icone: <Power size={16} aria-hidden="true" />, onSelecionar: () => handleAlternarAtivo(item) },
                            { rotulo: 'Excluir', icone: <Trash2 size={16} aria-hidden="true" />, perigo: true, onSelecionar: () => handleExcluir(item) },
                          ]}
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>
    </div>
  )
}
