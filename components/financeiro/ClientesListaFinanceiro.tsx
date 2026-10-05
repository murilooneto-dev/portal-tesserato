'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, Clock, Search, Users } from 'lucide-react'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { PendenciaVinculo } from '@/lib/vinculos'
import { formatarBadgeVinculo } from '@/lib/vinculos'
import { MESES } from '@/lib/mes-navegacao'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Badge } from '@/components/ui/Badge'
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

  const subtitulo = `${filtrados.length} ${filtrados.length === 1 ? 'cliente' : 'clientes'} · ${MESES[mes - 1]} ${ano}`

  return (
    <Pagina>
      <CabecalhoPagina titulo="Clientes" subtitulo={subtitulo} />

      <div className="flex flex-wrap items-end gap-3">
        <Field rotulo="Buscar" className="w-full sm:w-[300px]">
          {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Nome ou CNPJ" value={busca} onChange={e => setBusca(e.target.value)} />}
        </Field>
        <Field rotulo="Tarefa" className="w-full sm:w-[220px]">
          {c => (
            <Select id={c.id} value={filtroTarefa} onChange={e => setFiltroTarefa(e.target.value)}>
              <option value={TODAS_TAREFAS}>Todas as tarefas</option>
              {tarefasDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          )}
        </Field>
        <div className="flex h-9 items-center">
          <Switch ligado={apenasPendentes} onMudar={setApenasPendentes} rotulo="Só pendentes" />
        </div>
      </div>

      <Card semPadding className="overflow-hidden">
        {filtrados.length === 0 ? (
          <EmptyState icone={<Users size={24} />} titulo="Nenhum cliente encontrado" descricao="Mude a busca ou os filtros." />
        ) : (
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
                                    {formatarBadgeVinculo(p).texto.replace(/^(✓|⏳)\s*/, '')}
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
        )}
      </Card>
    </Pagina>
  )
}
