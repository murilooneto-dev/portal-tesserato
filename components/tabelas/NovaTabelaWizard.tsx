'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, Plus, Upload } from 'lucide-react'
import { lerPlanilha, type PlanilhaLida } from '@/lib/tabelas/parse-planilha'
import {
  detectarTipoColuna, opcoesDosValores, TIPOS_COLUNA,
  type TipoColuna, type OpcaoColuna, type ValorCelula,
} from '@/lib/tabelas/tipos'
import { agruparValoresCliente, type ClienteMatch } from '@/lib/tabelas/cliente-match'
import { montarLinhas, LIMITE_LINHAS, MAX_COLUNAS, LIMITE_BYTES_PAYLOAD, type ColunaConfig, type SetorTabela } from '@/lib/tabelas/montar-payload'
import { criarPlanilha } from '@/lib/tabelas-actions'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Aviso } from '@/components/ui/Aviso'
import { Card } from '@/components/ui/Card'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import { cn } from '@/components/ui/cn'

interface ColunaEdit { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null; indiceOrigem: number }

const ROTULO_TIPO: Record<TipoColuna, string> = {
  texto: 'Texto', numero: 'Número', data: 'Data', opcoes: 'Lista de opções', cliente: 'Cliente',
}

const PASSOS = ['Arquivo', 'Colunas', 'Clientes'] as const

function colunasDetectadas(p: PlanilhaLida): ColunaEdit[] {
  return p.cabecalhos.map((nome, i) => {
    const det = detectarTipoColuna(p.linhas.map(l => l[i]))
    return { id: crypto.randomUUID(), nome, tipo: det.tipo, opcoes: det.opcoes ?? null, indiceOrigem: i }
  })
}

function Passos({ atual }: { atual: number }) {
  return (
    <ol aria-label="Progresso da criação" className="flex flex-wrap items-center gap-2">
      {PASSOS.map((p, i) => (
        <li key={p} aria-current={i === atual ? 'step' : undefined} className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold',
              i < atual ? 'bg-ok text-acc-ink' : i === atual ? 'bg-acc text-acc-ink' : 'border border-line text-fg-3',
            )}
          >
            {i < atual ? <Check size={13} strokeWidth={3} /> : i + 1}
          </span>
          <span className={cn('text-sm', i === atual ? 'font-semibold text-fg' : 'text-fg-3')}>{p}</span>
          {i < PASSOS.length - 1 && <span aria-hidden="true" className="h-px w-10 bg-line" />}
        </li>
      ))}
    </ol>
  )
}

export default function NovaTabelaWizard({ setor, clientes }: { setor: SetorTabela; clientes: ClienteMatch[] }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [passo, setPasso] = useState(0)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [planilha, setPlanilha] = useState<PlanilhaLida | null>(null)
  const [nome, setNome] = useState('')
  const [colunas, setColunas] = useState<ColunaEdit[]>([])
  const [colunaChaveId, setColunaChaveId] = useState<string | null>(null)
  // valor da coluna Cliente -> cliente escolhido (null = "sem cliente")
  const [escolhas, setEscolhas] = useState<Record<string, string | null>>({})
  const [erro, setErro] = useState<string | null>(null)
  // falha ao LER/re-ler a planilha; separado do erro de criação e bloqueia o botão
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [linhaCabecalhoInput, setLinhaCabecalhoInput] = useState('1')

  function carregar(buf: ArrayBuffer, opts?: { aba?: string; linhaCabecalho?: number }) {
    try {
      const p = lerPlanilha(buf, opts)
      if (p.linhas.length === 0) throw new Error('Não há linhas de dados abaixo do cabeçalho.')
      if (p.linhas.length > LIMITE_LINHAS) {
        throw new Error(`A planilha tem ${p.linhas.length.toLocaleString('pt-BR')} linhas; o limite é ${LIMITE_LINHAS.toLocaleString('pt-BR')}.`)
      }
      if (p.cabecalhos.length > MAX_COLUNAS) {
        throw new Error(`A planilha tem ${p.cabecalhos.length.toLocaleString('pt-BR')} colunas; o limite é ${MAX_COLUNAS}.`)
      }
      setPlanilha(p)
      setLinhaCabecalhoInput(String(p.linhaCabecalho))
      setColunas(colunasDetectadas(p))
      setColunaChaveId(null)
      setEscolhas({})
      setErro(null)
      setErroLeitura(null)
    } catch (e) {
      // re-leitura falha: mantém a planilha anterior para os controles continuarem visíveis
      if (!(opts && planilha)) setPlanilha(null)
      setErroLeitura(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.')
    }
  }

  async function aoEscolherArquivo(f: File | undefined) {
    if (!f) return
    const buf = await f.arrayBuffer()
    setBuffer(buf)
    setNome(f.name.replace(/\.[^.]+$/, ''))
    carregar(buf)
  }

  const colCliente = colunas.find(c => c.tipo === 'cliente') ?? null

  const grupos = useMemo(() => {
    if (!planilha || !colCliente) return []
    return agruparValoresCliente(planilha.linhas.map(l => l[colCliente.indiceOrigem]), clientes)
  }, [planilha, colCliente, clientes])

  // Resolução final por valor: escolha do usuário; senão exato/sugerido.
  function clienteDoValor(valor: string): string | null {
    if (valor in escolhas) return escolhas[valor]
    return grupos.find(g => g.valor === valor)?.match.clienteId ?? null
  }

  function mudarTipo(id: string, tipo: TipoColuna) {
    const anterior = colunas.find(c => c.id === id)?.tipo
    setColunas(cs => cs.map(c => {
      if (c.id === id) {
        const valores = planilha ? planilha.linhas.map(l => l[c.indiceOrigem]) : []
        const opcoes = tipo === 'opcoes' ? opcoesDosValores(valores.filter((v): v is string | number => v !== null).map(String)) : null
        return { ...c, tipo, opcoes }
      }
      // só uma coluna Cliente: a anterior volta a texto
      return tipo === 'cliente' && c.tipo === 'cliente' ? { ...c, tipo: 'texto' as const } : c
    }))
    if (tipo === 'cliente' || anterior === 'cliente') setEscolhas({})
  }

  const naoConvertidas = useMemo(() => {
    if (!planilha) return 0
    return montarLinhas(planilha.linhas as ValorCelula[][], colunas.map(c => ({ ...c })), planilha.linhas.map(() => null)).naoConvertidas
  }, [planilha, colunas])

  const nomeDuplicado = (() => {
    const vistos = new Set<string>()
    for (const c of colunas) {
      const k = c.nome.trim().toLowerCase()
      if (vistos.has(k)) return c.nome.trim()
      vistos.add(k)
    }
    return null
  })()

  const semMatch = grupos.filter(g => clienteDoValor(g.valor) === null)

  async function criar() {
    if (!planilha) return
    if (nomeDuplicado !== null) {
      setErro(`Há duas colunas chamadas “${nomeDuplicado}” (o nome não diferencia maiúsculas de minúsculas). Renomeie uma delas.`)
      return
    }
    setErro(null)
    const config: ColunaConfig[] = colunas.map(c => ({ ...c }))
    const clientePorLinha = planilha.linhas.map(l => {
      if (!colCliente) return null
      const v = l[colCliente.indiceOrigem]
      return v === null ? null : clienteDoValor(String(v).trim())
    })
    const { linhas } = montarLinhas(planilha.linhas as ValorCelula[][], config, clientePorLinha)
    const entrada = {
      setor,
      nome,
      colunaChaveId,
      colunas: colunas.map((c, i) => ({ id: c.id, nome: c.nome, tipo: c.tipo, ordem: i, opcoes: c.opcoes })),
      linhas,
    }
    const tamanho = JSON.stringify(entrada).length
    if (tamanho > LIMITE_BYTES_PAYLOAD) {
      const mb = (tamanho / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
      setErro(`A planilha é grande demais para criar de uma vez (~${mb} MB). Remova colunas ou linhas e tente de novo.`)
      return
    }
    setCriando(true)
    let resposta: Awaited<ReturnType<typeof criarPlanilha>>
    try {
      resposta = await criarPlanilha(entrada)
    } catch {
      setErro('Não foi possível criar a tabela. Se a planilha for muito grande, tente com menos linhas ou colunas.')
      return
    } finally {
      setCriando(false)
    }
    if (resposta.error || !resposta.id) { setErro(resposta.error ?? 'Não foi possível criar a tabela.'); return }
    router.push(`/${setor}/tabelas/${resposta.id}`)
  }

  function fechar() {
    setAberto(false); setPasso(0); setBuffer(null); setPlanilha(null); setErro(null); setErroLeitura(null)
  }

  const podeContinuarDoArquivo = planilha !== null && nome.trim() !== '' && erroLeitura === null
  const podeContinuarDasColunas = nomeDuplicado === null
  const colunaSemNome = colunas.some(c => c.nome.trim() === '')
  const podeCriar = planilha !== null && nome.trim() !== '' && !criando && erroLeitura === null && nomeDuplicado === null && !colunaSemNome

  if (!aberto) {
    return (
      <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => setAberto(true)}>
        Nova tabela
      </Button>
    )
  }

  return (
    <Modal
      aberto
      onFechar={fechar}
      bloqueado={criando}
      largura="g"
      titulo="Nova tabela a partir de planilha"
      subtitulo={planilha ? `${nome || planilha.aba} · ${planilha.linhas.length.toLocaleString('pt-BR')} linhas` : undefined}
      rodape={
        <div className="flex w-full items-center gap-2.5">
          {passo > 0 && (
            <Button variante="fantasma" icone={<ChevronLeft size={16} aria-hidden="true" />} disabled={criando}
              onClick={() => setPasso(p => p - 1)}>
              Voltar
            </Button>
          )}
          <div className="ml-auto flex gap-2.5">
            <Button variante="fantasma" onClick={fechar} disabled={criando}>Cancelar</Button>
            {passo < 2 ? (
              <Button variante="primario" icone={<ChevronRight size={16} aria-hidden="true" />}
                disabled={passo === 0 ? !podeContinuarDoArquivo : !podeContinuarDasColunas}
                onClick={() => setPasso(p => p + 1)}>
                Continuar
              </Button>
            ) : (
              <Button variante="primario" onClick={criar} carregando={criando} disabled={!podeCriar}>
                {criando ? 'Criando…' : 'Criar tabela'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <Passos atual={passo} />

      {erroLeitura && <Aviso tom="dng">{erroLeitura}</Aviso>}
      {erro && <Aviso tom="dng">{erro}</Aviso>}

      {passo === 0 && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg-2">Arquivo (.xlsx ou .csv)</span>
            <div>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-raised px-3.5 text-sm font-medium text-fg transition-colors hover:border-fg-3 focus-within:outline-none focus-within:ring-2 focus-within:ring-acc">
                <Upload size={15} aria-hidden="true" />
                Escolher arquivo
                <input type="file" accept=".xlsx,.xls,.csv" className="sr-only"
                  onChange={e => { aoEscolherArquivo(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              {buffer && !erroLeitura && (
                <span className="ml-2.5 text-sm text-fg-2">{nome || 'arquivo selecionado'}</span>
              )}
            </div>
          </div>

          {planilha && buffer && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field rotulo="Nome da tabela" obrigatorio className="sm:col-span-2">
                {c => <Input id={c.id} aria-describedby={c.describedBy} value={nome} onChange={e => setNome(e.target.value)} maxLength={120} />}
              </Field>
              <Field rotulo="Linha do cabeçalho" ajuda="Contando só linhas com dados">
                {c => (
                  <Input id={c.id} aria-describedby={c.describedBy} type="number" min={1} value={linhaCabecalhoInput}
                    onChange={e => {
                      const txt = e.target.value
                      setLinhaCabecalhoInput(txt)
                      const n = Number(txt)
                      if (Number.isInteger(n) && n >= 1) carregar(buffer, { aba: planilha.aba, linhaCabecalho: n })
                    }} />
                )}
              </Field>
              {planilha.abas.length > 1 && (
                <Field rotulo="Aba da planilha" className="sm:col-span-3">
                  {c => (
                    <Select id={c.id} aria-describedby={c.describedBy} value={planilha.aba} onChange={e => carregar(buffer, { aba: e.target.value })}>
                      {planilha.abas.map(a => <option key={a} value={a}>{a}</option>)}
                    </Select>
                  )}
                </Field>
              )}
            </div>
          )}
        </div>
      )}

      {passo === 1 && planilha && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-fg-3">
            {planilha.linhas.length.toLocaleString('pt-BR')} linhas · confira o nome e o tipo de cada coluna. A coluna-chave será usada depois para atualizar a tabela com uma nova planilha (opcional).
          </p>

          <Card semPadding className="overflow-hidden">
            <div className="relative overflow-x-auto">
              <Tabela className="min-w-[560px]">
                <thead>
                  <tr>
                    <Th>Nome da coluna</Th>
                    <Th largura={200}>Tipo</Th>
                    <Th largura={120} alinhar="centro">Coluna-chave</Th>
                  </tr>
                </thead>
                <tbody>
                  {colunas.map(c => (
                    <tr key={c.id}>
                      <Td>
                        <Input value={c.nome} maxLength={120} aria-label={`Nome da coluna ${c.nome}`}
                          onChange={e => setColunas(cs => cs.map(x => x.id === c.id ? { ...x, nome: e.target.value } : x))} />
                        {c.tipo === 'opcoes' && c.opcoes && c.opcoes.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {c.opcoes.map(o => (
                              <span key={o.valor} className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md px-2 text-xs font-semibold"
                                style={{ backgroundColor: o.cor + '25', color: o.cor, border: `1px solid ${o.cor}50` }}>
                                {o.valor}
                              </span>
                            ))}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <Select value={c.tipo} aria-label={`Tipo da coluna ${c.nome}`} onChange={e => mudarTipo(c.id, e.target.value as TipoColuna)}>
                          {TIPOS_COLUNA.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                        </Select>
                      </Td>
                      <Td alinhar="centro">
                        <input type="radio" name="colunaChave" checked={colunaChaveId === c.id} onChange={() => setColunaChaveId(c.id)}
                          aria-label={`"${c.nome}" é a coluna-chave`} className="h-4 w-4 accent-[var(--acc)]" />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </div>
          </Card>
          {colunaChaveId && (
            <Button variante="fantasma" tamanho="p" className="self-start" onClick={() => setColunaChaveId(null)}>Limpar coluna-chave</Button>
          )}

          {nomeDuplicado !== null && (
            <Aviso tom="warn">
              Há duas colunas chamadas “{nomeDuplicado}” (maiúsculas e minúsculas contam como iguais). Renomeie uma delas para continuar.
            </Aviso>
          )}
          {naoConvertidas > 0 && (
            <Aviso tom="warn">
              {naoConvertidas.toLocaleString('pt-BR')} {naoConvertidas === 1 ? 'valor não pôde' : 'valores não puderam'} ser {naoConvertidas === 1 ? 'convertido' : 'convertidos'} para o tipo da coluna e {naoConvertidas === 1 ? 'será mantido' : 'serão mantidos'} como texto.
            </Aviso>
          )}
        </div>
      )}

      {passo === 2 && planilha && (
        <div className="flex flex-col gap-3">
          {!colCliente ? (
            <p className="text-sm text-fg-3">Esta planilha não tem uma coluna do tipo Cliente. Pode criar a tabela direto.</p>
          ) : (
            <>
              <div>
                <p className="text-sm font-semibold text-fg">Clientes da coluna “{colCliente.nome}”</p>
                <p className="mt-0.5 text-[13px] text-fg-3">
                  {grupos.length - semMatch.length} de {grupos.length} valores ligados a um cliente.
                  {semMatch.length > 0 && ` ${semMatch.length} sem cliente — escolha abaixo ou deixe assim (poderão ser ligados depois).`}
                </p>
              </div>
              {grupos.every(g => g.match.status === 'exato') ? (
                <Aviso tom="ok">Todos os valores casaram com um cliente cadastrado.</Aviso>
              ) : (
                <ul className="max-h-72 overflow-y-auto overflow-x-hidden rounded-[10px] border border-line-soft">
                  {grupos.filter(g => g.match.status !== 'exato').map((g, i) => (
                    <li key={g.valor} className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-line-soft')}>
                      <span className="min-w-[10rem] flex-1 text-sm text-fg">
                        {g.valor} <span className="text-xs text-fg-3">({g.linhas} {g.linhas === 1 ? 'linha' : 'linhas'})</span>
                      </span>
                      <Badge tom={g.match.status === 'sugerido' ? 'warn' : 'dng'}>
                        {g.match.status === 'sugerido' ? 'confirmar' : 'sem match'}
                      </Badge>
                      <Select className="max-w-xs" value={clienteDoValor(g.valor) ?? ''} aria-label={`Cliente para "${g.valor}"`}
                        onChange={e => setEscolhas(es => ({ ...es, [g.valor]: e.target.value || null }))}>
                        <option value="">Sem cliente</option>
                        {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
                      </Select>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
