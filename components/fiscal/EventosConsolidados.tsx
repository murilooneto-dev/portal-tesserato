'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, Plus, Search, X } from 'lucide-react'
import { MESES } from '@/lib/mes-navegacao'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { TarefaAvulsaComCriador } from '@/lib/tarefas-avulsas'
import EventosAvulsosSecao from '@/components/geral/EventosAvulsosSecao'
import EventoAvulsoModal from '@/components/geral/EventoAvulsoModal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface GrupoCliente {
  clienteId: string
  clienteNome: string
  eventos: TarefaAvulsaComCriador[]
}

interface Props {
  clientes: { id: string; nome: string }[]
  eventos: TarefaAvulsaComCriador[]
  podeEditar: boolean
  /** Mês de trabalho (1–12), só para o texto da lista vazia. */
  mes?: number
}

export default function EventosConsolidados({ clientes, eventos, podeEditar, mes }: Props) {
  const [busca, setBusca] = useFiltroPersistente('eventos-consolidados:busca', '')
  const [seletorAberto, setSeletorAberto] = useState(false)
  const [buscaSeletor, setBuscaSeletor] = useState('')
  const [clienteNovoEvento, setClienteNovoEvento] = useState<string | null>(null)

  const nomePorCliente = useMemo(() => new Map(clientes.map(c => [c.id, c.nome])), [clientes])

  // Só entram na lista clientes com pelo menos um evento no mês — sem isso
  // teríamos uma seção vazia por cliente do setor inteiro.
  const grupos = useMemo<GrupoCliente[]>(() => {
    const porCliente = new Map<string, TarefaAvulsaComCriador[]>()
    for (const ev of eventos) {
      const lista = porCliente.get(ev.cliente_id) ?? []
      lista.push(ev)
      porCliente.set(ev.cliente_id, lista)
    }
    return Array.from(porCliente.entries())
      .map(([clienteId, evs]) => ({ clienteId, clienteNome: nomePorCliente.get(clienteId) ?? 'Cliente', eventos: evs }))
      .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, 'pt-BR'))
  }, [eventos, nomePorCliente])

  const gruposFiltrados = busca
    ? grupos.filter(g => g.clienteNome.toLowerCase().includes(busca.toLowerCase()))
    : grupos

  const clientesOrdenados = useMemo(
    () => [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [clientes],
  )

  const clientesSeletorFiltrados = buscaSeletor
    ? clientesOrdenados.filter(c => c.nome.toLowerCase().includes(buscaSeletor.toLowerCase()))
    : clientesOrdenados

  function fecharSeletor() {
    setSeletorAberto(false)
    setBuscaSeletor('')
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field rotulo="Buscar" className="w-full sm:w-[300px]">
          {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Nome do cliente" value={busca} onChange={e => setBusca(e.target.value)} />}
        </Field>
        {podeEditar && (
          <Button
            variante="primario"
            icone={<Plus size={16} aria-hidden="true" />}
            onClick={() => setSeletorAberto(true)}
            className="max-sm:h-11 max-sm:w-full sm:ml-auto"
          >
            Novo evento
          </Button>
        )}
      </div>

      {gruposFiltrados.length === 0 ? (
        <Card semPadding>
          {busca && grupos.length > 0 ? (
            <EmptyState
              icone={<Search size={24} />}
              titulo="Nenhum evento com essa busca"
              descricao="Nenhum cliente com eventos no mês tem esse nome."
              acao={<Button icone={<X size={16} aria-hidden="true" />} onClick={() => setBusca('')}>Limpar busca</Button>}
            />
          ) : (
            <EmptyState
              icone={<CalendarDays size={24} />}
              titulo={mes ? `Nenhum evento em ${MESES[mes - 1].toLowerCase()}` : 'Nenhum evento neste mês'}
              descricao="Os eventos avulsos criados nas fichas dos clientes aparecem aqui, agrupados por cliente."
              acao={podeEditar ? <Button icone={<Plus size={16} aria-hidden="true" />} onClick={() => setSeletorAberto(true)}>Novo evento</Button> : undefined}
            />
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {gruposFiltrados.map(grupo => (
            <Card key={grupo.clienteId} titulo={grupo.clienteNome} meta={<Badge tom="neu">{grupo.eventos.length}</Badge>}>
              <EventosAvulsosSecao
                clienteId={grupo.clienteId}
                setor="fiscal"
                eventos={grupo.eventos}
                podeEditar={podeEditar}
                compacto
              />
            </Card>
          ))}
        </div>
      )}

      <Modal
        aberto={seletorAberto}
        onFechar={fecharSeletor}
        titulo="Escolha o cliente"
        subtitulo="O evento será criado na ficha do cliente escolhido."
        largura="p"
      >
        <Field rotulo="Buscar cliente">
          {c => (
            <Input
              id={c.id}
              type="search"
              data-autofocus=""
              iconeEsquerda={<Search size={16} />}
              placeholder="Nome do cliente"
              value={buscaSeletor}
              onChange={e => setBuscaSeletor(e.target.value)}
            />
          )}
        </Field>
        <div className="-mx-2 flex max-h-[50vh] flex-col overflow-y-auto">
          {clientesSeletorFiltrados.length === 0 ? (
            <EmptyState compacto icone={<Search size={20} />} titulo="Nenhum cliente encontrado" descricao="Mude a busca para ver outros clientes." />
          ) : (
            clientesSeletorFiltrados.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setClienteNovoEvento(c.id); fecharSeletor() }}
                className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                {c.nome}
              </button>
            ))
          )}
        </div>
      </Modal>

      {clienteNovoEvento && (
        <EventoAvulsoModal
          clienteId={clienteNovoEvento}
          setor="fiscal"
          onClose={() => setClienteNovoEvento(null)}
        />
      )}
    </div>
  )
}
