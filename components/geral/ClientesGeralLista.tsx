'use client'

import { useState, useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Plus, Printer, Search, Users } from 'lucide-react'
import { SETOR_LABEL, type Cliente, type TarefaVinculo } from '@/lib/types'
import ClienteGeralModal from './ClienteGeralModal'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import { empresaDesabilitada, empresaTemSetorDesabilitavel } from '@/lib/cliente-ativo'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Chip } from '@/components/ui/Chip'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import {
  SETORES_DE_CLIENTE, TODOS, filtrarClientesGeral, proximaOrdenacao, ariaSort, setoresDoCliente,
  type Ordenacao, type CampoOrdem,
} from '@/lib/clientes-geral'

type ClienteComDadosFiscais = Cliente & {
  clientes_fiscal: { regime: string | null; atividade: string[]; ativo: boolean } | null
  clientes_contabil: { ativo: boolean } | null
  clientes_pessoal: { ativo: boolean } | null
}

interface Props {
  clientes: ClienteComDadosFiscais[]
  isAdmin: boolean
  podeCriar: boolean
  podeDesabilitar: boolean
  responsaveis: string[]
  vinculosCatalogo: TarefaVinculo[]
  catalogoFiscal: CatalogoCliente
}

export default function ClientesGeralLista({ clientes, isAdmin, podeCriar, podeDesabilitar, responsaveis, vinculosCatalogo, catalogoFiscal }: Props) {
  const [busca, setBusca] = useState('')
  const [modalNovoOpen, setModalNovoOpen] = useState(false)
  const [clienteAbertoId, setClienteAbertoId] = useState<string | null>(null)
  const clienteAberto = clientes.find(c => c.id === clienteAbertoId)
  const [filtroRegime, setFiltroRegime] = useFiltroPersistente('clientesGeral:regime', TODOS)
  const [filtroSetor, setFiltroSetor] = useFiltroPersistente('clientesGeral:setor', TODOS)
  const [filtroAtividade, setFiltroAtividade] = useFiltroPersistente<string[]>('clientesGeral:atividade', [])
  const [ordenacao, setOrdenacao] = useState<Ordenacao>(null)

  function toggleAtividade(nome: string) {
    setFiltroAtividade(
      filtroAtividade.includes(nome) ? filtroAtividade.filter(a => a !== nome) : [...filtroAtividade, nome]
    )
  }

  const filtrados = useMemo(
    () => filtrarClientesGeral(clientes, { busca, regime: filtroRegime, setor: filtroSetor, atividades: filtroAtividade }, ordenacao),
    [clientes, busca, filtroRegime, filtroSetor, filtroAtividade, ordenacao],
  )

  const total = clientes.length
  const subtitulo = filtrados.length === total
    ? `${total} ${total === 1 ? 'cliente' : 'clientes'} · todos os setores`
    : `${filtrados.length} de ${total} clientes · todos os setores`

  const thOrdenavel = (campo: CampoOrdem, rotulo: string, largura?: number) => (
    <Th largura={largura} aria-sort={ariaSort(ordenacao, campo)}>
      <button
        type="button"
        onClick={() => setOrdenacao(o => proximaOrdenacao(o, campo))}
        className="inline-flex items-center gap-1.5 rounded uppercase hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        {rotulo}
        {ordenacao?.campo !== campo
          ? <ArrowUpDown size={14} aria-hidden="true" />
          : ordenacao.direcao === 'asc'
            ? <ArrowUp size={14} aria-hidden="true" className="text-acc-text" />
            : <ArrowDown size={14} aria-hidden="true" className="text-acc-text" />}
      </button>
    </Th>
  )

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Cadastro de clientes"
        subtitulo={subtitulo}
        acoes={
          <>
            <Button icone={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>Imprimir</Button>
            {podeCriar && <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => setModalNovoOpen(true)}>Novo cliente</Button>}
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field rotulo="Buscar" className="w-full sm:w-[300px]">
          {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Nome ou CNPJ" value={busca} onChange={e => setBusca(e.target.value)} />}
        </Field>
        <Field rotulo="Regime" className="w-full sm:w-[190px]">
          {c => (
            <Select id={c.id} value={filtroRegime} onChange={e => setFiltroRegime(e.target.value)}>
              <option value={TODOS}>Todos</option>
              {catalogoFiscal.regimes.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          )}
        </Field>
        <Field rotulo="Setor" className="w-full sm:w-[170px]">
          {c => (
            <Select id={c.id} value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}>
              <option value={TODOS}>Todos</option>
              {SETORES_DE_CLIENTE.map(s => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
            </Select>
          )}
        </Field>
        {catalogoFiscal.atividades.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id="rotulo-filtro-atividade" className="text-[13px] font-medium text-fg-2">Atividade</span>
            <div role="group" aria-labelledby="rotulo-filtro-atividade" className="flex flex-wrap gap-2">
              {catalogoFiscal.atividades.map(nome => (
                <Chip key={nome} ativo={filtroAtividade.includes(nome)} onClick={() => toggleAtividade(nome)}>{nome}</Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      <Card semPadding className="overflow-hidden">
        {filtrados.length === 0 ? (
          <EmptyState icone={<Users size={24} />} titulo="Nenhum cliente encontrado" descricao="Mude a busca ou os filtros." />
        ) : (
          <div className="overflow-x-auto">
            <Tabela className="min-w-[760px]">
              <thead>
                <tr>
                  {thOrdenavel('nome', 'Razão social')}
                  {thOrdenavel('regime', 'Regime', 170)}
                  <Th largura={150}>Atividade</Th>
                  <Th>Setores</Th>
                  <Th largura={160} className="hidden print:table-cell">Município</Th>
                  <Th largura={56} className="print:hidden"><span className="sr-only">Ações</span></Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => {
                  const desabilitado = empresaDesabilitada([c.clientes_fiscal, c.clientes_contabil, c.clientes_pessoal])
                  const regime = c.clientes_fiscal?.regime
                  const atividades = c.clientes_fiscal?.atividade ?? []
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                      <Td>
                        <button type="button" onClick={() => setClienteAbertoId(c.id)} className="block w-full min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <NomeCliente nome={c.nome} cnpj={c.cnpj} depoisDoNome={desabilitado ? <Badge tom="warn">Desabilitado</Badge> : undefined} />
                        </button>
                      </Td>
                      <Td>
                        {regime
                          ? <Badge tom="acc" className="max-w-full overflow-hidden"><span className="truncate" title={regime}>{regime.split('/')[0].trim()}</span></Badge>
                          : <span className="text-fg-3">—</span>}
                      </Td>
                      <Td className="text-fg-2">{atividades.length > 0 ? atividades.join(', ') : <span className="text-fg-3">—</span>}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {setoresDoCliente(c.setores).map(s => <Badge key={s}>{SETOR_LABEL[s]}</Badge>)}
                        </div>
                      </Td>
                      <Td className="hidden text-fg-2 print:table-cell">{[c.municipio, c.uf].filter(Boolean).join('/') || '—'}</Td>
                      <Td alinhar="dir" className="print:hidden">
                        <IconButton
                          rotulo={`${isAdmin ? 'Editar' : 'Ver'} ${c.nome}`}
                          icone={isAdmin ? <Pencil size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                          onClick={() => setClienteAbertoId(c.id)}
                        />
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>

      {modalNovoOpen && (
        <ClienteGeralModal
          clienteId={null}
          responsaveis={responsaveis}
          vinculosCatalogo={vinculosCatalogo}
          catalogoFiscal={catalogoFiscal}
          onClose={() => setModalNovoOpen(false)}
        />
      )}

      {clienteAbertoId && (
        <ClienteGeralModal
          clienteId={clienteAbertoId}
          responsaveis={responsaveis}
          vinculosCatalogo={vinculosCatalogo}
          catalogoFiscal={catalogoFiscal}
          readOnly={!isAdmin}
          podeDesabilitar={podeDesabilitar}
          desabilitada={empresaDesabilitada([clienteAberto?.clientes_fiscal, clienteAberto?.clientes_contabil, clienteAberto?.clientes_pessoal])}
          temSetorDesabilitavel={empresaTemSetorDesabilitavel([clienteAberto?.clientes_fiscal, clienteAberto?.clientes_contabil, clienteAberto?.clientes_pessoal])}
          onClose={() => setClienteAbertoId(null)}
        />
      )}
    </Pagina>
  )
}
