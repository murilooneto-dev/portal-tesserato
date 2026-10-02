'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import {
  type CampoFiltro,
  type ClienteFiltro,
  valoresDistintos,
  clientesPorValor,
  tarefasAplicaveisCliente,
  tarefasDisponiveisParaClientes,
  linhasVisiveis as calcularLinhasVisiveis,
} from '@/lib/preenchimento-rapido'
import type { MapaVinculosSetor } from '@/lib/tarefas-esperadas'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Checkbox, Select, Switch } from '@/components/ui/Input'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Tabela, Th, Td } from '@/components/ui/Tabela'

const LABEL_CAMPO: Record<CampoFiltro, string> = {
  regime: 'Regime',
  atividade: 'Atividade',
}

interface Props {
  camposDisponiveis: CampoFiltro[]
  clientes: ClienteFiltro[]
  mapaVinculos: MapaVinculosSetor
  tiposData: string[]
  tiposNaoData?: string[]
  filtroPendentes?: boolean
  estadoInicial: Record<string, Record<string, boolean>>
  onToggle: (clienteId: string, tipo: string, concluida: boolean) => Promise<void>
}

export default function PreenchimentoRapido({
  camposDisponiveis,
  clientes,
  mapaVinculos,
  tiposData,
  tiposNaoData,
  filtroPendentes = false,
  estadoInicial,
  onToggle,
}: Props) {
  const [campo, setCampo] = useState<CampoFiltro | null>(null)
  const [valor, setValor] = useState<string | null>(null)
  const [tarefasSelecionadas, setTarefasSelecionadas] = useState<Set<string>>(new Set())
  const [overlay, setOverlay] = useState<Record<string, Record<string, boolean>>>({})
  const [apenasPendentes, setApenasPendentes] = useState(false)
  const [, startTransition] = useTransition()

  function getConcluida(clienteId: string, tipo: string): boolean {
    return overlay[clienteId]?.[tipo] ?? estadoInicial[clienteId]?.[tipo] ?? false
  }

  const modoDireto = camposDisponiveis.length === 0

  const tiposDataSet = useMemo(() => new Set(tiposData), [tiposData])
  const tiposNaoDataSet = useMemo(() => new Set(tiposNaoData ?? []), [tiposNaoData])

  const valores = useMemo(
    () => (campo ? valoresDistintos(clientes, campo) : []),
    [clientes, campo],
  )

  const clientesFiltrados = useMemo(() => {
    if (modoDireto) return clientes
    return campo && valor ? clientesPorValor(clientes, campo, valor) : []
  }, [modoDireto, clientes, campo, valor])

  // Por cliente, o conjunto real de tarefas tipo DATA que se aplicam a ele
  // (vínculo automático atividade+regime menos exclusões, mais
  // personalizadas) — fonte de verdade tanto pros botões de tarefa quanto
  // pra decidir quais linhas/células aparecem na grade.
  const tarefasAplicaveisPorCliente = useMemo(() => {
    const porCliente: Record<string, Set<string>> = {}
    for (const c of clientesFiltrados) {
      porCliente[c.id] = tarefasAplicaveisCliente(c, mapaVinculos, tiposDataSet, tiposNaoDataSet)
    }
    return porCliente
  }, [clientesFiltrados, mapaVinculos, tiposDataSet, tiposNaoDataSet])

  const tarefasDisponiveis = useMemo(
    () => tarefasDisponiveisParaClientes(clientesFiltrados, mapaVinculos, tiposDataSet, tiposNaoDataSet),
    [clientesFiltrados, mapaVinculos, tiposDataSet, tiposNaoDataSet],
  )

  function handleCampoChange(novoCampo: CampoFiltro) {
    setCampo(novoCampo)
    setValor(null)
    setTarefasSelecionadas(new Set())
  }

  function handleValorChange(novoValor: string) {
    setValor(novoValor)
    setTarefasSelecionadas(new Set())
  }

  function toggleTarefaSelecionada(tipo: string) {
    setTarefasSelecionadas(prev => {
      const next = new Set(prev)
      if (next.has(tipo)) next.delete(tipo)
      else next.add(tipo)
      return next
    })
  }

  function handleCheckbox(clienteId: string, tipo: string) {
    const concluidaAtual = getConcluida(clienteId, tipo)
    const novaConcluida = !concluidaAtual
    setOverlay(prev => ({
      ...prev,
      [clienteId]: { ...prev[clienteId], [tipo]: novaConcluida },
    }))
    startTransition(() => {
      onToggle(clienteId, tipo, novaConcluida)
    })
  }

  const colunas = Array.from(tarefasSelecionadas).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  // Só entra na grade quem tem pelo menos uma das tarefas marcadas
  // realmente aplicável — cliente sem nenhuma delas não aparece nem como
  // linha vazia (ex: AB Preço Único não deve aparecer pra "Distribuição
  // de Lucros" se essa tarefa não é dela). Com o filtro "Só pendentes"
  // ativo, quem já tem todas as colunas selecionadas concluídas também some.
  const linhas = calcularLinhasVisiveis(
    clientesFiltrados,
    colunas,
    tarefasAplicaveisPorCliente,
    getConcluida,
    filtroPendentes && apenasPendentes,
  )

  const passoPronto = modoDireto || Boolean(campo && valor)

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-col gap-5">
          <Passo numero={1} titulo="Quais clientes?">
            {modoDireto ? (
              <p className="text-sm text-fg-3">Todos os clientes do setor.</p>
            ) : (
              <div className="flex flex-wrap gap-3.5">
                <Field rotulo="Filtrar por" className="w-full sm:w-[180px]">
                  {({ id }) => (
                    <Select id={id} value={campo ?? ''} onChange={e => handleCampoChange(e.target.value as CampoFiltro)}>
                      <option value="" disabled>Selecione...</option>
                      {camposDisponiveis.map(c => (
                        <option key={c} value={c}>{LABEL_CAMPO[c]}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                {campo && (
                  <Field rotulo={LABEL_CAMPO[campo]} className="w-full sm:w-[240px]">
                    {({ id }) => (
                      <Select id={id} value={valor ?? ''} onChange={e => handleValorChange(e.target.value)}>
                        <option value="" disabled>Selecione...</option>
                        {valores.map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </Select>
                    )}
                  </Field>
                )}
              </div>
            )}
            {!modoDireto && campo && valores.length === 0 && (
              <p className="mt-3 text-sm text-fg-3">
                Nenhum cliente tem {LABEL_CAMPO[campo].toLowerCase()} cadastrado.
              </p>
            )}
          </Passo>

          <Passo numero={2} titulo="Quais tarefas?" dica="Cada uma vira uma coluna.">
            {!passoPronto ? (
              <p className="text-sm text-fg-3">Escolha primeiro os clientes no passo 1.</p>
            ) : tarefasDisponiveis.length === 0 ? (
              <p className="text-sm text-fg-3">
                {modoDireto || !campo
                  ? 'Nenhuma tarefa tipo data cadastrada nesse setor.'
                  : `Nenhuma tarefa do tipo data vinculada a ${LABEL_CAMPO[campo].toLowerCase()} "${valor}".`}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tarefasDisponiveis.map(tipo => (
                  <Chip key={tipo} ativo={tarefasSelecionadas.has(tipo)} onClick={() => toggleTarefaSelecionada(tipo)}>
                    {tipo}
                  </Chip>
                ))}
              </div>
            )}
          </Passo>
        </div>
      </Card>

      <Card
        titulo={<><span className="mr-2.5 inline-grid h-7 w-7 place-items-center rounded-full bg-acc align-middle text-sm font-semibold text-acc-ink"><span aria-hidden="true">3</span></span><span className="sr-only">Passo 3: </span>Marque o que já foi feito</>}
        meta={colunas.length > 0 && linhas.length > 0 ? <Badge tom="neu">{linhas.length} {linhas.length === 1 ? 'cliente' : 'clientes'}</Badge> : undefined}
        acoes={filtroPendentes && colunas.length > 0 ? (
          <Switch ligado={apenasPendentes} onMudar={setApenasPendentes} rotulo="Só pendentes" />
        ) : undefined}
        semPadding
      >
        {colunas.length === 0 ? (
          <p className="px-[18px] py-6 text-sm text-fg-3">
            {passoPronto
              ? 'Escolha ao menos uma tarefa no passo 2 para ver a grade.'
              : 'Escolha os clientes e as tarefas nos passos acima para ver a grade.'}
          </p>
        ) : linhas.length === 0 ? (
          <EmptyState
            icone={<Check size={22} aria-hidden="true" />}
            titulo={apenasPendentes
              ? 'Nenhum cliente com essa(s) tarefa(s) pendente(s).'
              : 'Nenhum cliente tem essa(s) tarefa(s) aplicável(is).'}
          />
        ) : (
          <div className="relative overflow-x-auto">
            <Tabela className="min-w-max">
              <thead>
                <tr>
                  <Th className="sticky left-0 z-[1] min-w-[240px] bg-surface">Empresa</Th>
                  {colunas.map(tipo => (
                    <Th key={tipo} alinhar="centro" largura={140}>{tipo}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map(cliente => (
                  <tr key={cliente.id}>
                    <Td className="sticky left-0 z-[1] min-w-[240px] bg-surface">
                      <NomeCliente nome={cliente.nome} />
                    </Td>
                    {colunas.map(tipo => (
                      <Td key={tipo} alinhar="centro">
                        {tarefasAplicaveisPorCliente[cliente.id]?.has(tipo) ? (
                          <Checkbox
                            rotulo={<span className="sr-only">{tipo} — {cliente.nome}</span>}
                            checked={getConcluida(cliente.id, tipo)}
                            onChange={() => handleCheckbox(cliente.id, tipo)}
                            className="min-h-[44px] min-w-[44px] justify-center"
                          />
                        ) : (
                          <span className="text-fg-3" title="Não se aplica a este cliente">—</span>
                        )}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>
      <p className="text-[13px] text-fg-3">&quot;—&quot; indica que a tarefa não se aplica ao cliente. Cada marcação é salva na hora.</p>
    </div>
  )
}

function Passo({ numero, titulo, dica, children }: { numero: number; titulo: string; dica?: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-acc text-sm font-semibold text-acc-ink"><span aria-hidden="true">{numero}</span></span>
      <div className="min-w-0 flex-1">
        <p className="mb-2.5 text-sm font-semibold text-fg">
          <span className="sr-only">{`Passo ${numero}: `}</span>{titulo}
          {dica && <span className="ml-2 font-normal text-fg-3">{dica}</span>}
        </p>
        {children}
      </div>
    </div>
  )
}
