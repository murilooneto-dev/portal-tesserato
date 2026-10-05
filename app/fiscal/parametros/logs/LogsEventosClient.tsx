'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { History, Printer } from 'lucide-react'
import {
  Abas, Avatar, Badge, Button, CabecalhoPagina, Caminho, Card, EmptyState, Field, Input, Pagina, Select, Tabela, Td, Th,
  type BadgeTom,
} from '@/components/ui'
import { descreverEventoTarefas, type DetalhesTarefas } from '@/lib/logs-tarefas'

const TIPO_EVENTO_LABEL: Record<string, string> = {
  criacao: 'Criação',
  edicao: 'Edição de dados',
  exclusao: 'Exclusão',
  desabilitacao: 'Desabilitação',
  reabilitacao: 'Reabilitação',
  troca_responsavel: 'Troca de responsável',
  tarefas: 'Tarefas',
}

const TIPO_EVENTO_TOM: Record<string, BadgeTom> = {
  criacao: 'ok',
  edicao: 'info',
  exclusao: 'dng',
  desabilitacao: 'warn',
  reabilitacao: 'ok',
  troca_responsavel: 'warn',
  tarefas: 'neu',
}

const SETOR_LABEL: Record<string, string> = {
  fiscal: 'Fiscal',
  contabil: 'Contábil',
  pessoal: 'Pessoal',
  societario: 'Societário',
  financeiro: 'Financeiro',
  configuracoes: 'Configurações',
  geral: 'Geral',
}

// Tipos de item que aparecem em detalhes.entidade nos eventos de criação/
// exclusão — os mesmos rótulos gravados pelas triggers da migration 058
// (mais 'Usuário', gravado pela criação/exclusão de usuário em Parâmetros).
const ITENS = [
  'Anexo do evento', 'Arquivo do cliente', 'Anexo do procedimento', 'Nota', 'Parcelamento',
  'Seção de parcelamento', 'Evento do calendário', 'Evento', 'Tipo de tarefa', 'Vínculo de tarefa',
  'Vínculo entre setores', 'Processo', 'Procedimento', 'Tabela', 'Modelo de documentação',
  'Atividade', 'Regime', 'Movimento financeiro', 'Tipo financeiro', 'Centro de custo',
  'Link rápido', 'Compromisso na agenda', 'Usuário',
].sort((a, b) => a.localeCompare(b, 'pt-BR'))

interface EventoLog {
  id: string
  created_at: string
  usuario_id: string | null
  usuario_nome: string | null
  setor: string | null
  cliente_nome: string | null
  tipo_evento: string
  detalhes: { campos?: string[]; responsavel_antigo?: string | null; responsavel_novo?: string | null; entidade?: string; descricao?: string } & Partial<DetalhesTarefas> | null
}

interface TaskLog {
  id: string
  created_at: string
  usuario_id: string | null
  usuario_nome: string | null
  cliente_nome: string | null
  tarefa: string | null
  competencia: string | null
  valor_antigo: string | null
  valor_novo: string | null
  motivo: string | null
}

interface Cliente {
  id: string
  nome: string
}

interface Filtros {
  tipo: string
  setor: string
  clienteId: string
  item: string
  de: string
  ate: string
}

type AbaLogs = 'eventos' | 'tarefas'

interface Props {
  logs: EventoLog[]
  taskLogs: TaskLog[]
  clientes: Cliente[]
  filtros: Filtros
  // Cor de cada usuário (profiles.id -> profiles.cor), para a bolinha da coluna Usuário.
  cores: Record<string, string>
  abaInicial: AbaLogs
}

const ROTA = '/fiscal/parametros/logs'

function formatDate(s: string) {
  return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function detalheTexto(log: EventoLog) {
  if (log.tipo_evento === 'troca_responsavel' && log.detalhes) {
    return `de ${log.detalhes.responsavel_antigo ?? '—'} para ${log.detalhes.responsavel_novo ?? '—'}`
  }
  if (log.tipo_evento === 'tarefas') {
    return descreverEventoTarefas(log.detalhes as DetalhesTarefas | null)
  }
  if (log.tipo_evento === 'edicao' && log.detalhes?.campos) {
    return log.detalhes.campos.join(', ')
  }
  return '—'
}

// Coluna "Item": o que foi criado/excluído (só eventos com entidade —
// os de cliente não têm, o cliente já aparece na coluna Cliente).
function itemTexto(log: EventoLog) {
  if (!log.detalhes?.entidade) return '—'
  return log.detalhes.descricao ? `${log.detalhes.entidade}: ${log.detalhes.descricao}` : log.detalhes.entidade
}

function Usuario({ id, nome, cores }: { id: string | null; nome: string | null; cores: Record<string, string> }) {
  if (!nome) return <span className="text-fg-3">—</span>
  const cor = id ? cores[id] : undefined
  return (
    <span className="flex min-w-0 items-center gap-2">
      {/* Sem perfil correspondente (usuário apagado): bolinha neutra. */}
      <Avatar nome={nome} cor={cor || 'var(--neutral-soft)'} className={cor ? undefined : 'text-fg-2'} />
      <span className="truncate text-fg-2" title={nome}>{nome}</span>
    </span>
  )
}

export default function LogsEventosClient({ logs, taskLogs, clientes, filtros, cores, abaInicial }: Props) {
  const router = useRouter()
  const [form, setForm] = useState(filtros)
  const [aba, setAba] = useState<AbaLogs>(abaInicial)

  // A aba fica na URL (?aba=tarefas) sem recarregar a página: "Aplicar" e
  // "Limpar" montam o endereço a partir dela, então não trocam de aba.
  function trocarAba(nova: AbaLogs) {
    setAba(nova)
    const params = new URLSearchParams(window.location.search)
    if (nova === 'tarefas') params.set('aba', 'tarefas')
    else params.delete('aba')
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `${ROTA}?${qs}` : ROTA)
  }

  function aplicar() {
    const params = new URLSearchParams()
    if (form.tipo) params.set('tipo', form.tipo)
    if (form.setor) params.set('setor', form.setor)
    if (form.clienteId) params.set('clienteId', form.clienteId)
    if (form.item) params.set('item', form.item)
    if (form.de) params.set('de', form.de)
    if (form.ate) params.set('ate', form.ate)
    if (aba === 'tarefas') params.set('aba', 'tarefas')
    router.push(`${ROTA}?${params.toString()}`)
  }

  function limpar() {
    setForm({ tipo: '', setor: '', clienteId: '', item: '', de: '', ate: '' })
    router.push(aba === 'tarefas' ? `${ROTA}?aba=tarefas` : ROTA)
  }

  const filtrosAplicados = [
    form.tipo && `Evento: ${TIPO_EVENTO_LABEL[form.tipo] ?? form.tipo}`,
    form.setor && `Setor: ${SETOR_LABEL[form.setor] ?? form.setor}`,
    form.clienteId && `Cliente: ${clientes.find(c => c.id === form.clienteId)?.nome ?? form.clienteId}`,
    form.item && `Item: ${form.item}`,
    form.de && `De: ${form.de}`,
    form.ate && `Até: ${form.ate}`,
  ].filter(Boolean).join(' — ')

  const eventos = (
    <div className="flex min-w-0 flex-col gap-5">
      <form
        className="flex flex-wrap items-end gap-3 print:hidden"
        onSubmit={e => { e.preventDefault(); aplicar() }}
      >
        <Field rotulo="Tipo de evento" className="w-full sm:w-[190px]">
          {c => (
            <Select id={c.id} value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
              <option value="">Todos</option>
              {Object.entries(TIPO_EVENTO_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </Select>
          )}
        </Field>
        <Field rotulo="Setor" className="w-full sm:w-[140px]">
          {c => (
            <Select id={c.id} value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value }))}>
              <option value="">Todos</option>
              {Object.entries(SETOR_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </Select>
          )}
        </Field>
        <Field rotulo="Cliente" className="w-full sm:w-[220px]">
          {c => (
            <Select id={c.id} value={form.clienteId} onChange={e => setForm(p => ({ ...p, clienteId: e.target.value }))}>
              <option value="">Todos</option>
              {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
            </Select>
          )}
        </Field>
        <Field rotulo="Item" className="w-full sm:w-[200px]">
          {c => (
            <Select id={c.id} value={form.item} onChange={e => setForm(p => ({ ...p, item: e.target.value }))}>
              <option value="">Todos</option>
              {ITENS.map(i => <option key={i} value={i}>{i}</option>)}
            </Select>
          )}
        </Field>
        <Field rotulo="De" className="w-full sm:w-[150px]">
          {c => <Input id={c.id} type="date" value={form.de} onChange={e => setForm(p => ({ ...p, de: e.target.value }))} />}
        </Field>
        <Field rotulo="Até" className="w-full sm:w-[150px]">
          {c => <Input id={c.id} type="date" value={form.ate} onChange={e => setForm(p => ({ ...p, ate: e.target.value }))} />}
        </Field>
        <div className="flex gap-2.5">
          <Button type="submit" variante="primario">Aplicar</Button>
          <Button variante="fantasma" onClick={limpar}>Limpar</Button>
        </div>
      </form>

      <div className="hidden print:block">
        <h1 className="text-lg font-bold text-fg">Relatório de Log de Eventos</h1>
        {filtrosAplicados && <p className="mt-1 text-xs text-fg-3">Filtros: {filtrosAplicados}</p>}
        <p className="mt-1 text-xs text-ph">Gerado em {new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </div>

      <Card semPadding className="overflow-hidden print:overflow-visible print:border-0">
        {logs.length === 0 ? (
          <EmptyState icone={<History size={24} />} titulo="Nenhum registro" />
        ) : (
          <div className="relative overflow-x-auto print:overflow-visible">
            <Tabela className="min-w-[1240px] print:min-w-0 print:table-auto print:text-xs">
              <thead>
                <tr>
                  <Th largura={170}>Data e hora</Th>
                  <Th largura={160}>Usuário</Th>
                  <Th largura={110}>Setor</Th>
                  <Th>Cliente</Th>
                  <Th largura={200}>Item</Th>
                  <Th largura={200}>Evento</Th>
                  <Th largura={220}>Detalhes</Th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <Td className="whitespace-nowrap tabular-nums text-fg-2">{formatDate(log.created_at)}</Td>
                    <Td><Usuario id={log.usuario_id} nome={log.usuario_nome} cores={cores} /></Td>
                    <Td className="text-fg-2">{log.setor ? (SETOR_LABEL[log.setor] ?? log.setor) : 'Geral'}</Td>
                    <Td className="break-words font-semibold text-fg">{log.cliente_nome ?? '—'}</Td>
                    <Td className="break-words text-fg-2">{itemTexto(log)}</Td>
                    <Td>
                      <Badge tom={TIPO_EVENTO_TOM[log.tipo_evento] ?? 'neu'}>{TIPO_EVENTO_LABEL[log.tipo_evento] ?? log.tipo_evento}</Badge>
                    </Td>
                    <Td className="break-words text-fg-2">{detalheTexto(log)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>
    </div>
  )

  const tarefas = (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="hidden print:block">
        <h1 className="text-lg font-bold text-fg">Relatório de alterações de tarefas</h1>
        <p className="mt-1 text-xs text-ph">Gerado em {new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </div>

      <Card semPadding className="overflow-hidden print:overflow-visible print:border-0">
        {taskLogs.length === 0 ? (
          <EmptyState icone={<History size={24} />} titulo="Nenhum registro" />
        ) : (
          <div className="relative overflow-x-auto print:overflow-visible">
            <Tabela className="min-w-[1240px] print:min-w-0 print:table-auto print:text-xs">
              <thead>
                <tr>
                  <Th largura={170}>Data e hora</Th>
                  <Th largura={160}>Usuário</Th>
                  <Th>Cliente</Th>
                  <Th largura={180}>Tarefa</Th>
                  <Th largura={130}>Competência</Th>
                  <Th largura={120}>Antes</Th>
                  <Th largura={120}>Depois</Th>
                  <Th largura={220}>Motivo</Th>
                </tr>
              </thead>
              <tbody>
                {taskLogs.map(log => (
                  <tr key={log.id}>
                    <Td className="whitespace-nowrap tabular-nums text-fg-2">{formatDate(log.created_at)}</Td>
                    <Td><Usuario id={log.usuario_id} nome={log.usuario_nome} cores={cores} /></Td>
                    <Td className="break-words font-semibold text-fg">{log.cliente_nome ?? '—'}</Td>
                    <Td className="break-words text-fg-2">{log.tarefa ?? '—'}</Td>
                    <Td className="tabular-nums text-fg-2">{log.competencia ?? '—'}</Td>
                    <Td className="break-words text-fg-2">{log.valor_antigo ?? '—'}</Td>
                    <Td className="break-words text-fg-2">{log.valor_novo ?? '—'}</Td>
                    <Td className="break-words text-fg-2">{log.motivo ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>
      <p className="text-[13px] text-fg-3 print:hidden">Mostra as últimas 50 alterações.</p>
    </div>
  )

  return (
    <Pagina className="print:p-0">
      <Caminho itens={[{ rotulo: 'Parâmetros', href: '/fiscal/parametros' }, { rotulo: 'Logs do sistema' }]} />
      <CabecalhoPagina
        className="print:hidden"
        titulo="Logs do sistema"
        subtitulo="Histórico de alterações feitas por todos os usuários"
        acoes={
          <Button icone={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>Gerar relatório</Button>
        }
      />
      <Abas<AbaLogs>
        rotulo="Tipo de log"
        ativa={aba}
        onTrocar={trocarAba}
        abas={[
          { id: 'eventos', rotulo: 'Eventos de clientes', conteudo: eventos },
          { id: 'tarefas', rotulo: 'Alterações de tarefas', conteudo: tarefas },
        ]}
      />
    </Pagina>
  )
}
