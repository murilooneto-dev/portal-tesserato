'use client'

import { useMemo, useState, useTransition } from 'react'
import { FolderOpen, Lock, Search } from 'lucide-react'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import { STATUS_DOSSIE_OPCOES, type StatusDossie } from '@/lib/status-dossie'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Checkbox, Input, Select } from '@/components/ui/Input'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Tabela, Th, Td } from '@/components/ui/Tabela'

interface ClienteDossie {
  id: string
  nome: string
  cnpj: string | null
  dossieStatus: StatusDossie
  dossieFinalizado: boolean
}

interface Props {
  clientes: ClienteDossie[]
  onAtualizarStatus: (clienteId: string, status: StatusDossie) => Promise<{ error: string | null }>
  onAtualizarFinalizado: (clienteId: string, finalizado: boolean) => Promise<{ error: string | null }>
}

export default function DossieSecao({ clientes, onAtualizarStatus, onAtualizarFinalizado }: Props) {
  const [busca, setBusca] = useFiltroPersistente('dossie:busca', '')
  const [statusFiltro, setStatusFiltro] = useFiltroPersistente<'TODOS' | StatusDossie>('dossie:status', 'TODOS')
  const [, startTransition] = useTransition()
  const [overlay, setOverlay] = useState<Record<string, { status?: StatusDossie; finalizado?: boolean }>>({})

  function getStatus(cliente: ClienteDossie): StatusDossie {
    return overlay[cliente.id]?.status ?? cliente.dossieStatus
  }

  function getFinalizado(cliente: ClienteDossie): boolean {
    return overlay[cliente.id]?.finalizado ?? cliente.dossieFinalizado
  }

  function handleStatusChange(clienteId: string, status: StatusDossie) {
    setOverlay(prev => ({ ...prev, [clienteId]: { ...prev[clienteId], status } }))
    startTransition(() => { onAtualizarStatus(clienteId, status) })
  }

  function handleFinalizadoChange(clienteId: string, finalizado: boolean) {
    setOverlay(prev => ({ ...prev, [clienteId]: { ...prev[clienteId], finalizado } }))
    startTransition(() => { onAtualizarFinalizado(clienteId, finalizado) })
  }

  const filtrados = useMemo(() => clientes.filter(c => {
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false
    if (statusFiltro !== 'TODOS' && getStatus(c) !== statusFiltro) return false
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [clientes, busca, statusFiltro, overlay])

  const seletorStatus = (cliente: ClienteDossie, finalizado: boolean, classe?: string) => (
    <Select
      value={getStatus(cliente)}
      onChange={e => handleStatusChange(cliente.id, e.target.value as StatusDossie)}
      disabled={finalizado}
      aria-label={`Situação do dossiê de ${cliente.nome}`}
      className={classe}
    >
      {STATUS_DOSSIE_OPCOES.map(s => <option key={s.valor} value={s.valor}>{s.label}</option>)}
    </Select>
  )

  const checkFinalizado = (cliente: ClienteDossie, finalizado: boolean) => (
    <Checkbox
      rotulo="Finalizado"
      checked={finalizado}
      onChange={e => handleFinalizadoChange(cliente.id, e.target.checked)}
      aria-label={`Finalizado: ${cliente.nome}`}
      className="min-h-11 sm:min-h-0"
    />
  )

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field rotulo="Buscar" className="w-full sm:w-[300px]">
          {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Nome do cliente" value={busca} onChange={e => setBusca(e.target.value)} />}
        </Field>
        <Field rotulo="Situação" className="w-full sm:w-[220px]">
          {c => (
            <Select id={c.id} value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as 'TODOS' | StatusDossie)}>
              <option value="TODOS">Todos os status</option>
              {STATUS_DOSSIE_OPCOES.map(s => <option key={s.valor} value={s.valor}>{s.label}</option>)}
            </Select>
          )}
        </Field>
      </div>

      <Card semPadding className="overflow-hidden">
        {filtrados.length === 0 ? (
          <EmptyState icone={<FolderOpen size={24} />} titulo="Nenhum cliente encontrado" descricao="Mude a busca ou o filtro de situação." />
        ) : (
          <>
            <div className="hidden sm:block"><div className="relative overflow-x-auto overflow-y-hidden">
              <Tabela className="min-w-[680px]">
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th largura={240}>Situação</Th>
                    <Th alinhar="centro" largura={150}>Finalizado</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(cliente => {
                    const finalizado = getFinalizado(cliente)
                    return (
                      <tr key={cliente.id}>
                        <Td>
                          <NomeCliente
                            nome={cliente.nome}
                            cnpj={cliente.cnpj}
                            depoisDoNome={finalizado ? <Badge tom="ok" icone={<Lock size={14} aria-hidden="true" />}>Finalizado</Badge> : undefined}
                          />
                        </Td>
                        <Td>{seletorStatus(cliente, finalizado)}</Td>
                        <Td alinhar="centro">{checkFinalizado(cliente, finalizado)}</Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Tabela>
            </div></div>

            <ul className="flex flex-col sm:hidden">
              {filtrados.map(cliente => {
                const finalizado = getFinalizado(cliente)
                return (
                  <li key={cliente.id} className="flex flex-col gap-2 border-b border-line-soft px-4 py-3 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <NomeCliente nome={cliente.nome} cnpj={cliente.cnpj} />
                      {finalizado && <Badge tom="ok" icone={<Lock size={14} aria-hidden="true" />}>Finalizado</Badge>}
                    </div>
                    {seletorStatus(cliente, finalizado, 'h-11')}
                    {checkFinalizado(cliente, finalizado)}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
