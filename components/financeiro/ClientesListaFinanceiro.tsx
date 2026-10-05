'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, Clock, Search, SlidersHorizontal, Users, X } from 'lucide-react'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { PendenciaVinculo } from '@/lib/vinculos'
import { formatarBadgeVinculo } from '@/lib/vinculos'
import { MESES } from '@/lib/mes-navegacao'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { BarraProgresso } from '@/components/ui/BarraProgresso'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Select, Switch } from '@/components/ui/Input'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Tabela, Th, Td } from '@/components/ui/Tabela'

interface ClienteResumo {
  id: string
  nome: string
  cnpj: string | null
  municipio: string | null
  uf: string | null
}

interface Props {
  clientes: ClienteResumo[]
  tiposPorCliente: Record<string, string[]>
  concluidasPorCliente: Record<string, string[]>
  tarefasDisponiveis: string[]
  mes: number
  ano: number
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}

const TODAS_TAREFAS = 'TODAS'

export default function ClientesListaFinanceiro({ clientes, tiposPorCliente, concluidasPorCliente, tarefasDisponiveis, mes, ano, pendenciasVinculo }: Props) {
  const [busca, setBusca] = useFiltroPersistente('clientes-financeiro:busca', '')
  const [filtroTarefa, setFiltroTarefa] = useFiltroPersistente('clientes-financeiro:tarefa', TODAS_TAREFAS)
  const [apenasPendentes, setApenasPendentes] = useFiltroPersistente('clientes-financeiro:apenasPendentes', false)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  const filtrados = useMemo(() => clientes.filter(c => {
    if (busca) {
      const q = busca.toLowerCase()
      // Só compara dígitos do CNPJ quando a busca é só número/pontuação;
      // senão "Posto 2" listaria todo CNPJ que tem "2".
      const digitos = /^[\d.\/\-\s]+$/.test(busca) ? busca.replace(/\D/g, '') : ''
      const cnpj = c.cnpj ?? ''
      const bateCnpj = cnpj.includes(q) || (digitos.length > 0 && cnpj.replace(/\D/g, '').includes(digitos))
      if (!c.nome.toLowerCase().includes(q) && !bateCnpj) return false
    }
    if (filtroTarefa !== TODAS_TAREFAS && !tiposPorCliente[c.id]?.includes(filtroTarefa)) return false
    if (apenasPendentes) {
      if (filtroTarefa !== TODAS_TAREFAS) {
        if (concluidasPorCliente[c.id]?.includes(filtroTarefa)) return false
      } else {
        const total = tiposPorCliente[c.id]?.length ?? 0
        const concluidas = concluidasPorCliente[c.id]?.length ?? 0
        if (total === 0 || concluidas >= total) return false
      }
    }
    return true
  }), [clientes, busca, filtroTarefa, apenasPendentes, tiposPorCliente, concluidasPorCliente])

  // No celular os filtros ficam recolhidos atrás do botão "Filtros", que fica
  // destacado quando algum deles está em uso.
  const filtrosAtivos = [filtroTarefa !== TODAS_TAREFAS, apenasPendentes].filter(Boolean).length

  function limparFiltros() {
    setBusca('')
    setFiltroTarefa(TODAS_TAREFAS)
    setApenasPendentes(false)
  }

  const vazio = clientes.length === 0 ? (
    <EmptyState icone={<Users size={24} />} titulo="Nenhum cliente cadastrado" descricao="Os clientes do Financeiro aparecem aqui assim que forem cadastrados." />
  ) : (
    <EmptyState
      icone={<Users size={24} />}
      titulo="Nenhum cliente com esses filtros"
      descricao={`Há ${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'} no Financeiro, mas nenhum com a busca e os filtros escolhidos.`}
      acao={<Button icone={<X size={16} aria-hidden="true" />} onClick={limparFiltros}>Limpar filtros</Button>}
    />
  )

  const subtitulo = `${filtrados.length} ${filtrados.length === 1 ? 'cliente' : 'clientes'} · ${MESES[mes - 1]} ${ano}`

  return (
    <Pagina>
      <CabecalhoPagina titulo="Clientes" subtitulo={subtitulo} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full min-w-0 items-end gap-2 sm:w-[300px]">
          <Field rotulo="Buscar" className="min-w-0 flex-1">
            {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Nome ou CNPJ" value={busca} onChange={e => setBusca(e.target.value)} />}
          </Field>
          <IconButton
            borda
            rotulo={filtrosAbertos ? 'Esconder filtros' : 'Mostrar filtros'}
            aria-expanded={filtrosAbertos}
            aria-controls="filtros-clientes-financeiro"
            icone={<SlidersHorizontal size={18} aria-hidden="true" />}
            onClick={() => setFiltrosAbertos(a => !a)}
            className={cn('h-11 w-11 sm:hidden', filtrosAtivos > 0 && 'border-acc text-acc-text')}
          />
        </div>
        <div id="filtros-clientes-financeiro" className={cn('w-full flex-col gap-3 sm:contents', filtrosAbertos ? 'flex' : 'hidden')}>
        <Field rotulo="Tarefa" className="w-full sm:w-[220px]">
          {c => (
            <Select id={c.id} value={filtroTarefa} onChange={e => setFiltroTarefa(e.target.value)}>
              <option value={TODAS_TAREFAS}>Todas as tarefas</option>
              {tarefasDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          )}
        </Field>
        <div className="flex min-h-11 items-center sm:h-9 sm:min-h-0">
          <Switch ligado={apenasPendentes} onMudar={setApenasPendentes} rotulo="Só pendentes" />
        </div>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <Card>{vazio}</Card>
      ) : (
        <>
          {/* Celular (nav-03): um cartão por cliente; o toque leva à ficha. */}
          <ul className="flex flex-col gap-2.5 sm:hidden">
            {filtrados.map(cliente => {
              const vinculos = pendenciasVinculo[cliente.id] ?? []
              const local = cliente.municipio ? `${cliente.municipio}${cliente.uf ? `/${cliente.uf}` : ''}` : null
              return (
                <li key={cliente.id}>
                  <Link
                    href={`/financeiro/clientes/${cliente.id}`}
                    className="flex flex-col gap-2.5 rounded-xl border border-line-soft bg-surface px-4 py-3.5 transition-colors active:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="min-w-0 flex-1"><NomeCliente nome={cliente.nome} cnpj={cliente.cnpj} /></div>
                      <ChevronRight size={18} aria-hidden="true" className="mt-0.5 flex-none text-fg-3" />
                    </div>
                    {vinculos.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {vinculos.map((p, i) => (
                          <Badge
                            key={i}
                            tom={p.liberada ? 'ok' : 'warn'}
                            icone={p.liberada ? <Check size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
                          >
                            {formatarBadgeVinculo(p).texto}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <span className={cn('min-w-0 max-w-[50%] truncate text-[13px]', local ? 'text-fg-2' : 'text-fg-3')}>{local ?? 'Sem município'}</span>
                      <div className="flex min-w-0 flex-1 justify-end">
                        <BarraProgresso feitas={concluidasPorCliente[cliente.id]?.length ?? 0} total={tiposPorCliente[cliente.id]?.length ?? 0} className="w-full" />
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>

          <Card semPadding className="hidden overflow-hidden sm:block">
          <div className="relative overflow-x-auto xl:overflow-visible">
            <Tabela className="min-w-[640px]">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th largura={220}>Município / UF</Th>
                  <Th largura={300}>Progresso do mês</Th>
                  <Th largura={56}><span className="sr-only">Abrir</span></Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(cliente => {
                  const total = tiposPorCliente[cliente.id]?.length ?? 0
                  const concluidas = concluidasPorCliente[cliente.id]?.length ?? 0
                  const vinculos = pendenciasVinculo[cliente.id] ?? []
                  const href = `/financeiro/clientes/${cliente.id}`
                  const local = cliente.municipio ? `${cliente.municipio}${cliente.uf ? `/${cliente.uf}` : ''}` : null
                  return (
                    <tr key={cliente.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                      <Td>
                        <Link href={href} className="block w-full min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <NomeCliente
                            nome={cliente.nome}
                            cnpj={cliente.cnpj}
                            abaixo={vinculos.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {vinculos.map((p, i) => (
                                  <Badge
                                    key={i}
                                    tom={p.liberada ? 'ok' : 'warn'}
                                    icone={p.liberada ? <Check size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
                                  >
                                    {formatarBadgeVinculo(p).texto}
                                  </Badge>
                                ))}
                              </div>
                            ) : undefined}
                          />
                        </Link>
                      </Td>
                      <Td className="text-fg-2">
                        {local ? <span className="block truncate" title={local}>{local}</span> : <span className="text-fg-3">—</span>}
                      </Td>
                      <Td>
                        <BarraProgresso feitas={concluidas} total={total} className="w-[260px] max-w-full" />
                      </Td>
                      <Td alinhar="dir">
                        <Link href={href} aria-label={`Abrir ${cliente.nome}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-fg-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <ChevronRight size={18} aria-hidden="true" />
                        </Link>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Tabela>
          </div>
          </Card>
        </>
      )}
    </Pagina>
  )
}
