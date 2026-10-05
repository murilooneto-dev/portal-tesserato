'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Settings2, Trash2 } from 'lucide-react'
import {
  adicionarColuna, renomearColuna, moverColuna, preVisualizarExclusaoColuna, excluirColuna,
  preVisualizarTrocaTipo, trocarTipoColuna, renomearTabela, excluirTabela,
  type ValorAlterado,
} from '@/lib/tabelas-estrutura-actions'
import { TIPOS_COLUNA, opcoesDosValores, type TipoColuna, type OpcaoColuna } from '@/lib/tabelas/tipos'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'
import type { ClienteMatch } from '@/lib/tabelas/cliente-match'
import ReenviarPlanilhaWizard from './ReenviarPlanilhaWizard'
import { Drawer } from '@/components/ui/Modal'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Aviso } from '@/components/ui/Aviso'
import { cn } from '@/components/ui/cn'

const ROTULO_TIPO: Record<TipoColuna, string> = {
  texto: 'Texto', numero: 'Número', data: 'Data', opcoes: 'Lista de opções', cliente: 'Cliente',
}
const TIPOS_TROCAVEIS = TIPOS_COLUNA.filter(t => t !== 'cliente')

interface ColunaResumo { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }
interface Props {
  planilhaId: string
  nome: string
  setor: SetorTabela
  colunas: ColunaResumo[]
  temColunaChave: boolean
  clientes: ClienteMatch[]
}

export default function GerenciarEstrutura({ planilhaId, nome, setor, colunas, temColunaChave, clientes }: Props) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [nomeTabela, setNomeTabela] = useState(nome)
  const [novoNome, setNovoNome] = useState('')
  const [novoTipo, setNovoTipo] = useState<TipoColuna>('texto')
  const [novasOpcoesTexto, setNovasOpcoesTexto] = useState('')

  const [colunaExcluindo, setColunaExcluindo] = useState<ColunaResumo | null>(null)
  const [previaExclusao, setPreviaExclusao] = useState<{ total: number; preenchidas: number } | null>(null)

  const [colunaTrocando, setColunaTrocando] = useState<ColunaResumo | null>(null)
  const [tipoAlvo, setTipoAlvo] = useState<TipoColuna>('texto')
  const [opcoesAlvoTexto, setOpcoesAlvoTexto] = useState('')
  const [previaTroca, setPreviaTroca] = useState<{ convertidas: number; naoConvertidas: number; valores: ValorAlterado[] } | null>(null)

  const [confirmandoExclusaoTabela, setConfirmandoExclusaoTabela] = useState(false)
  const [nomeDigitado, setNomeDigitado] = useState('')

  function fechar() {
    setAberto(false)
    setErro(null)
    setColunaExcluindo(null)
    setPreviaExclusao(null)
    setColunaTrocando(null)
    setPreviaTroca(null)
    setConfirmandoExclusaoTabela(false)
    setNomeDigitado('')
  }

  function parseOpcoes(texto: string): OpcaoColuna[] {
    const valores = texto.split('\n').map(v => v.trim()).filter(v => v !== '')
    return opcoesDosValores(valores)
  }

  async function salvarNomeTabela() {
    if (nomeTabela.trim() === nome || nomeTabela.trim() === '') { setNomeTabela(nome); return }
    setErro(null)
    setOcupado(true)
    try {
      const { error } = await renomearTabela({ planilhaId, nome: nomeTabela })
      if (error) { setErro(error); setNomeTabela(nome); return }
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function salvarNomeColuna(coluna: ColunaResumo, campo: HTMLInputElement) {
    const nomeNovo = campo.value
    if (nomeNovo.trim() === coluna.nome) return
    if (nomeNovo.trim() === '') { campo.value = coluna.nome; return }
    setErro(null)
    setOcupado(true)
    try {
      const { error } = await renomearColuna({ colunaId: coluna.id, nome: nomeNovo })
      if (error) { campo.value = coluna.nome; setErro(error); return }
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function mover(coluna: ColunaResumo, direcao: 'cima' | 'baixo') {
    setErro(null)
    setOcupado(true)
    try {
      const { error } = await moverColuna({ colunaId: coluna.id, direcao })
      if (error) { setErro(error); return }
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function adicionar() {
    const nomeValido = novoNome.trim()
    if (nomeValido === '') { setErro('Digite um nome pra coluna nova.'); return }
    setErro(null)
    setOcupado(true)
    try {
      const opcoes = novoTipo === 'opcoes' ? parseOpcoes(novasOpcoesTexto) : null
      const { error } = await adicionarColuna({ planilhaId, nome: nomeValido, tipo: novoTipo, opcoes })
      if (error) { setErro(error); return }
      setNovoNome(''); setNovoTipo('texto'); setNovasOpcoesTexto('')
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function abrirExclusaoColuna(coluna: ColunaResumo) {
    setErro(null)
    setColunaTrocando(null)
    setPreviaTroca(null)
    setColunaExcluindo(coluna)
    setPreviaExclusao(null)
    const { error, total, preenchidas } = await preVisualizarExclusaoColuna(coluna.id)
    if (error) { setErro(error); setColunaExcluindo(null); return }
    setPreviaExclusao({ total: total ?? 0, preenchidas: preenchidas ?? 0 })
  }

  async function confirmarExclusaoColuna() {
    if (!colunaExcluindo) return
    setOcupado(true)
    try {
      const { error } = await excluirColuna(colunaExcluindo.id)
      if (error) { setErro(error); return }
      setColunaExcluindo(null)
      setPreviaExclusao(null)
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function abrirTrocaTipo(coluna: ColunaResumo) {
    setErro(null)
    setColunaExcluindo(null)
    setPreviaExclusao(null)
    setColunaTrocando(coluna)
    setTipoAlvo(coluna.tipo === 'cliente' ? 'texto' : coluna.tipo)
    setOpcoesAlvoTexto('')
    setPreviaTroca(null)
  }

  async function calcularPreviaTroca() {
    if (!colunaTrocando) return
    setErro(null)
    setOcupado(true)
    try {
      const opcoesNovas = tipoAlvo === 'opcoes' ? parseOpcoes(opcoesAlvoTexto) : null
      const { error, convertidas, naoConvertidas, valores } = await preVisualizarTrocaTipo({
        colunaId: colunaTrocando.id, tipoNovo: tipoAlvo, opcoesNovas,
      })
      if (error) { setErro(error); return }
      setPreviaTroca({ convertidas: convertidas ?? 0, naoConvertidas: naoConvertidas ?? 0, valores: valores ?? [] })
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarTrocaTipo() {
    if (!colunaTrocando || !previaTroca) return
    setOcupado(true)
    try {
      const opcoesNovas = tipoAlvo === 'opcoes' ? parseOpcoes(opcoesAlvoTexto) : null
      const { error } = await trocarTipoColuna({
        colunaId: colunaTrocando.id, tipoNovo: tipoAlvo, opcoesNovas, valores: previaTroca.valores,
      })
      if (error) { setErro(error); return }
      setColunaTrocando(null)
      setPreviaTroca(null)
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarExclusaoTabela() {
    setOcupado(true)
    try {
      const { error } = await excluirTabela({ planilhaId, nomeConfirmacao: nomeDigitado })
      if (error) { setErro(error); return }
      router.push(`/${setor}/tabelas`)
    } finally {
      setOcupado(false)
    }
  }

  if (!aberto) {
    return (
      <Button icone={<Settings2 size={16} aria-hidden="true" />} onClick={() => setAberto(true)}>
        Gerenciar colunas
      </Button>
    )
  }

  return (
    <Drawer
      aberto
      onFechar={fechar}
      bloqueado={ocupado}
      larguraPx={560}
      titulo="Gerenciar colunas"
      subtitulo={nome}
      rodape={
        <div className="flex w-full items-center gap-2.5">
          <span className="text-[13px] text-fg-3">Alterações salvas na hora</span>
          <div className="ml-auto">
            <Button variante="fantasma" disabled={ocupado} onClick={fechar}>Fechar</Button>
          </div>
        </div>
      }
    >
      {erro && <Aviso tom="dng">{erro}</Aviso>}

      <Field rotulo="Nome da tabela">
        {c => (
          <Input id={c.id} value={nomeTabela} maxLength={120} disabled={ocupado}
            onChange={e => setNomeTabela(e.target.value)} onBlur={salvarNomeTabela} />
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-fg-2">Colunas</span>
        <div className="overflow-hidden rounded-[10px] border border-line-soft">
          {colunas.map((c, i) => (
            <div key={c.id} className={cn(i > 0 && 'border-t border-line-soft')}>
              <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-2.5">
                <Input defaultValue={c.nome} maxLength={120} disabled={ocupado} className="h-8 min-w-[8rem] flex-1"
                  aria-label={`Nome da coluna ${c.nome}`} onBlur={e => salvarNomeColuna(c, e.target)} />
                <Badge tom="neu">{ROTULO_TIPO[c.tipo]}</Badge>
                <IconButton rotulo="Mover para cima" icone={<ArrowUp size={16} aria-hidden="true" />} disabled={ocupado || i === 0} onClick={() => mover(c, 'cima')} />
                <IconButton rotulo="Mover para baixo" icone={<ArrowDown size={16} aria-hidden="true" />} disabled={ocupado || i === colunas.length - 1} onClick={() => mover(c, 'baixo')} />
                {c.tipo !== 'cliente' && (
                  <Button tamanho="p" disabled={ocupado} onClick={() => abrirTrocaTipo(c)}>Trocar tipo</Button>
                )}
                <Button tamanho="p" variante="perigo" disabled={ocupado} onClick={() => abrirExclusaoColuna(c)}>Excluir</Button>
              </div>

              {colunaExcluindo?.id === c.id && (
                <div className="flex flex-col gap-2 border-t border-danger/30 bg-danger-soft px-3.5 py-3">
                  <p className="text-sm text-fg">Excluir a coluna &quot;{c.nome}&quot;?</p>
                  {previaExclusao
                    ? <p className="text-xs text-fg-2">{previaExclusao.preenchidas} de {previaExclusao.total} linhas têm valor nessa coluna. Isso não pode ser desfeito.</p>
                    : <p className="text-xs text-fg-3">Calculando impacto…</p>}
                  <div className="flex gap-2">
                    <Button tamanho="p" variante="perigo-solido" disabled={ocupado || !previaExclusao} onClick={confirmarExclusaoColuna}>
                      Excluir coluna
                    </Button>
                    <Button tamanho="p" variante="fantasma" disabled={ocupado} onClick={() => { setColunaExcluindo(null); setPreviaExclusao(null) }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {colunaTrocando?.id === c.id && (
                <div className="flex flex-col gap-2 border-t border-line-soft bg-raised px-3.5 py-3">
                  <p className="text-sm text-fg">Trocar o tipo de &quot;{c.nome}&quot;</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={tipoAlvo} aria-label="Novo tipo da coluna"
                      onChange={e => { setTipoAlvo(e.target.value as TipoColuna); setPreviaTroca(null) }}>
                      {TIPOS_TROCAVEIS.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                    </Select>
                    <Button tamanho="p" disabled={ocupado} onClick={calcularPreviaTroca}>Calcular</Button>
                  </div>
                  {tipoAlvo === 'opcoes' && (
                    <Textarea rows={3} placeholder="Uma opção por linha" value={opcoesAlvoTexto}
                      onChange={e => { setOpcoesAlvoTexto(e.target.value); setPreviaTroca(null) }} />
                  )}
                  {previaTroca && (
                    <p className="text-xs text-fg-2">
                      {previaTroca.convertidas} célula(s) convertem. {previaTroca.naoConvertidas > 0
                        ? `${previaTroca.naoConvertidas} não convertem e ficam como estão (o valor original não é apagado).`
                        : ''}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button tamanho="p" variante="primario" disabled={ocupado || !previaTroca} onClick={confirmarTrocaTipo}>Confirmar troca</Button>
                    <Button tamanho="p" variante="fantasma" disabled={ocupado} onClick={() => { setColunaTrocando(null); setPreviaTroca(null) }}>Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-[10px] border border-line-soft p-3.5">
        <span className="text-[13px] font-medium text-fg-2">Adicionar coluna</span>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Nome da coluna" value={novoNome} maxLength={120} className="min-w-[10rem] flex-1"
            aria-label="Nome da nova coluna" onChange={e => setNovoNome(e.target.value)} />
          <Select value={novoTipo} aria-label="Tipo da nova coluna" onChange={e => setNovoTipo(e.target.value as TipoColuna)}>
            {TIPOS_COLUNA.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
          </Select>
          <Button tamanho="p" disabled={ocupado} onClick={adicionar}>Adicionar</Button>
        </div>
        {novoTipo === 'opcoes' && (
          <Textarea rows={3} placeholder="Uma opção por linha" value={novasOpcoesTexto} onChange={e => setNovasOpcoesTexto(e.target.value)} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2.5">
          <ReenviarPlanilhaWizard planilhaId={planilhaId} setor={setor} colunas={colunas} temColunaChave={temColunaChave} clientes={clientes} />
          {!confirmandoExclusaoTabela && (
            <Button variante="perigo" icone={<Trash2 size={16} aria-hidden="true" />} onClick={() => setConfirmandoExclusaoTabela(true)}>
              Excluir tabela
            </Button>
          )}
        </div>
        {confirmandoExclusaoTabela && (
          <div className="flex flex-col gap-2 rounded-[10px] border border-danger/30 bg-danger-soft p-3.5">
            <p className="text-sm text-fg">Isso apaga a tabela &quot;{nome}&quot; e todas as linhas dela, sem volta. Digite o nome exato pra confirmar:</p>
            <Input value={nomeDigitado} onChange={e => setNomeDigitado(e.target.value)} aria-label="Digite o nome da tabela para confirmar" />
            <div className="flex gap-2">
              <Button variante="perigo-solido" tamanho="p" disabled={ocupado || nomeDigitado.trim() !== nome} onClick={confirmarExclusaoTabela}>
                Excluir definitivamente
              </Button>
              <Button variante="fantasma" tamanho="p" disabled={ocupado} onClick={() => { setConfirmandoExclusaoTabela(false); setNomeDigitado('') }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}
