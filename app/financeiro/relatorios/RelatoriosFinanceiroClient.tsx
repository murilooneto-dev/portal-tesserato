'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownLeft, ArrowUpRight, ClipboardList, Filter, Printer } from 'lucide-react'
import { formatarDdMm } from '@/lib/formatar-data'
import { formatarValor, formatarValorComSinal } from '@/lib/financeiro-movimentos'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Tabela, Th, Td } from '@/components/ui/Tabela'

export interface MovimentoRelatorio {
  id: string
  natureza: 'entrada' | 'saida'
  valor: number
  data: string
  observacao: string | null
  tipo_nome: string
  centro_custo_nome: string | null
}

interface OpcaoTipo { id: string; nome: string }

interface Filtros {
  natureza: string
  tipoId: string
  centroCustoId: string
  de: string
  ate: string
}

interface Props {
  movimentos: MovimentoRelatorio[]
  tiposEntrada: OpcaoTipo[]
  tiposSaida: OpcaoTipo[]
  centrosCusto: OpcaoTipo[]
  filtros: Filtros
}

const NATUREZA_LABEL: Record<string, string> = { entrada: 'Entrada', saida: 'Saída' }

// Verde para o que entra, vermelho para o que sai; no papel a cor continua.
const COR_ENTRADA = 'text-ok'
const COR_SAIDA = 'text-danger'

function SeloNatureza({ natureza }: { natureza: 'entrada' | 'saida' }) {
  return natureza === 'entrada'
    ? <Badge tom="ok" icone={<ArrowDownLeft size={14} aria-hidden="true" />}>Entrada</Badge>
    : <Badge tom="dng" icone={<ArrowUpRight size={14} aria-hidden="true" />}>Saída</Badge>
}

// Saída sai com o sinal na frente: "- R$ 1.750,00".
function valorDoMovimento(m: MovimentoRelatorio): string {
  return m.natureza === 'entrada' ? formatarValor(m.valor) : formatarValorComSinal(-m.valor)
}

export default function RelatoriosFinanceiroClient({ movimentos, tiposEntrada, tiposSaida, centrosCusto, filtros }: Props) {
  const router = useRouter()
  const [form, setForm] = useState(filtros)
  const [geradoEm] = useState(() => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))

  const opcoesTipo = form.natureza === 'saida' ? tiposSaida : form.natureza === 'entrada' ? tiposEntrada : [...tiposEntrada, ...tiposSaida]

  // Em saída o cadastro é a conta; em entrada é o tipo.
  const rotuloTipo = form.natureza === 'saida' ? 'Conta' : form.natureza === 'entrada' ? 'Tipo' : 'Tipo ou conta'

  const filtrosAplicados = [
    form.natureza && `Natureza: ${NATUREZA_LABEL[form.natureza] ?? form.natureza}`,
    form.tipoId && `${rotuloTipo}: ${opcoesTipo.find(t => t.id === form.tipoId)?.nome ?? form.tipoId}`,
    form.centroCustoId && `Centro de custo: ${centrosCusto.find(c => c.id === form.centroCustoId)?.nome ?? form.centroCustoId}`,
    form.de && `De: ${formatarDdMm(form.de)}`,
    form.ate && `Até: ${formatarDdMm(form.ate)}`,
  ].filter(Boolean).join(' — ')

  function aplicar() {
    const params = new URLSearchParams()
    if (form.natureza) params.set('natureza', form.natureza)
    if (form.tipoId) params.set('tipoId', form.tipoId)
    if (form.centroCustoId) params.set('centroCustoId', form.centroCustoId)
    if (form.de) params.set('de', form.de)
    if (form.ate) params.set('ate', form.ate)
    router.push(`/financeiro/relatorios?${params.toString()}`)
  }

  function limpar() {
    setForm({ natureza: '', tipoId: '', centroCustoId: '', de: '', ate: '' })
    router.push('/financeiro/relatorios')
  }

  const totalEntradas = movimentos.filter(m => m.natureza === 'entrada').reduce((acc, m) => acc + m.valor, 0)
  const totalSaidas = movimentos.filter(m => m.natureza === 'saida').reduce((acc, m) => acc + m.valor, 0)
  const saldo = totalEntradas - totalSaidas

  const kpis = [
    { label: 'Entradas', val: formatarValor(totalEntradas), cor: COR_ENTRADA },
    { label: 'Saídas', val: formatarValor(totalSaidas), cor: COR_SAIDA },
    { label: 'Saldo', val: formatarValorComSinal(saldo), cor: saldo < 0 ? COR_SAIDA : COR_ENTRADA },
  ]

  return (
    <Pagina className="print:p-0">
      <CabecalhoPagina
        className="print:hidden"
        titulo="Relatórios"
        subtitulo="Entradas e saídas no período escolhido"
        acoes={
          <Button variante="primario" icone={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>
            Imprimir ou salvar PDF
          </Button>
        }
      />

      <Card className="print:hidden">
        <form
          className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap"
          onSubmit={e => { e.preventDefault(); aplicar() }}
        >
          <Field rotulo="Natureza" className="col-span-2 sm:w-[130px]">
            {c => (
              <Select id={c.id} value={form.natureza} onChange={e => setForm(p => ({ ...p, natureza: e.target.value, tipoId: '' }))}>
                <option value="">Todas</option>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </Select>
            )}
          </Field>
          <Field rotulo={rotuloTipo} className="col-span-2 sm:w-[160px]">
            {c => (
              <Select id={c.id} value={form.tipoId} onChange={e => setForm(p => ({ ...p, tipoId: e.target.value }))}>
                <option value="">Todos</option>
                {opcoesTipo.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </Select>
            )}
          </Field>
          <Field rotulo="Centro de custo" className="col-span-2 sm:w-[160px]">
            {c => (
              <Select id={c.id} value={form.centroCustoId} onChange={e => setForm(p => ({ ...p, centroCustoId: e.target.value }))}>
                <option value="">Todos</option>
                {centrosCusto.map(cc => <option key={cc.id} value={cc.id}>{cc.nome}</option>)}
              </Select>
            )}
          </Field>
          <Field rotulo="De" className="sm:w-[150px]">
            {c => <Input id={c.id} type="date" value={form.de} onChange={e => setForm(p => ({ ...p, de: e.target.value }))} />}
          </Field>
          <Field rotulo="Até" className="sm:w-[150px]">
            {c => <Input id={c.id} type="date" value={form.ate} onChange={e => setForm(p => ({ ...p, ate: e.target.value }))} />}
          </Field>
          <div className="col-span-2 flex items-center gap-2.5">
            <Button type="submit" variante="secundario" icone={<Filter size={16} aria-hidden="true" />}>Aplicar filtros</Button>
            <Button variante="fantasma" onClick={limpar}>Limpar</Button>
          </div>
        </form>
      </Card>

      <div className="hidden print:block">
        <h1 className="text-lg font-bold text-fg">Relatório Financeiro</h1>
        {filtrosAplicados && <p className="mt-1 text-xs text-fg-3">Filtros: {filtrosAplicados}</p>}
        <p className="mt-1 text-xs text-ph" suppressHydrationWarning>Gerado em {geradoEm}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 print:grid-cols-3">
        {kpis.map(k => (
          <div key={k.label} className="min-w-0 rounded-xl border border-line-soft bg-surface px-5 py-[18px] print:border-line print:px-3 print:py-2">
            <p className="text-[13px] font-medium text-fg-3 print:text-ph">{k.label}</p>
            <p className={`mt-1.5 truncate text-2xl font-semibold leading-tight tabular-nums xl:text-[30px] print:text-base ${k.cor}`} title={k.val}>{k.val}</p>
          </div>
        ))}
      </div>

      {movimentos.length === 0 ? (
        <Card><EmptyState icone={<ClipboardList size={24} />} titulo="Nenhum registro" descricao="Mude os filtros." /></Card>
      ) : (
        <>
          {/* Celular: um cartão por lançamento */}
          <div className="flex flex-col gap-3 sm:hidden print:hidden">
            {movimentos.map(m => (
              <div key={m.id} className="flex min-w-0 flex-col gap-2 rounded-xl border border-line-soft bg-surface p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <p className="min-w-0 flex-1 truncate font-semibold text-fg" title={m.tipo_nome}>{m.tipo_nome}</p>
                  <b className={`flex-none font-mono text-sm font-semibold tabular-nums ${m.natureza === 'entrada' ? COR_ENTRADA : COR_SAIDA}`}>{valorDoMovimento(m)}</b>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
                  <SeloNatureza natureza={m.natureza} />
                  <span className="font-mono tabular-nums text-fg-2">{formatarDdMm(m.data)}</span>
                  {m.centro_custo_nome && <span className="min-w-0 truncate text-fg-3" title={m.centro_custo_nome}>{m.centro_custo_nome}</span>}
                </div>
                {m.observacao && <p className="break-words text-[13px] text-fg-2">{m.observacao}</p>}
              </div>
            ))}
          </div>

          {/* Tela larga e impressão: tabela */}
          <Card semPadding className="hidden overflow-hidden sm:block print:block print:overflow-visible print:rounded-none print:border-line">
            <div className="relative overflow-x-auto xl:overflow-visible print:overflow-visible">
              <Tabela className="min-w-[980px] print:min-w-0 print:text-xs">
                <thead>
                  <tr>
                    <Th className="w-[130px] print:w-[11%]">Data</Th>
                    <Th className="w-[130px] print:w-[11%]">Natureza</Th>
                    <Th className="w-[200px] print:w-[18%]">{rotuloTipo}</Th>
                    <Th className="w-[180px] print:w-[16%]">Centro de custo</Th>
                    <Th>Observação</Th>
                    <Th alinhar="dir" className="w-[190px] print:w-[18%]">Valor</Th>
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0 print:[&_td]:px-1.5 print:[&_td]:py-1">
                  {movimentos.map(m => (
                    <tr key={m.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                      <Td className="whitespace-nowrap font-mono text-[13px] tabular-nums text-fg-2 print:text-xs">{formatarDdMm(m.data)}</Td>
                      <Td><SeloNatureza natureza={m.natureza} /></Td>
                      <Td>
                        <span className="block truncate font-semibold text-fg print:whitespace-normal print:break-words" title={m.tipo_nome}>{m.tipo_nome}</span>
                      </Td>
                      <Td>
                        {m.centro_custo_nome
                          ? <span className="block truncate text-fg-2 print:whitespace-normal print:break-words" title={m.centro_custo_nome}>{m.centro_custo_nome}</span>
                          : <span className="text-fg-3">—</span>}
                      </Td>
                      <Td>
                        {m.observacao
                          ? <span className="block truncate text-fg-2 print:whitespace-normal print:break-words" title={m.observacao}>{m.observacao}</span>
                          : <span className="text-fg-2">—</span>}
                      </Td>
                      <Td alinhar="dir" className={`whitespace-nowrap font-mono font-semibold tabular-nums ${m.natureza === 'entrada' ? COR_ENTRADA : COR_SAIDA}`}>
                        {valorDoMovimento(m)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </div>
          </Card>
        </>
      )}
    </Pagina>
  )
}
