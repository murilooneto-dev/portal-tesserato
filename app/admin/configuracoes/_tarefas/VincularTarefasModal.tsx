'use client'

import { useEffect, useState } from 'react'
import { History, ListChecks, Search } from 'lucide-react'
import type { UserSetor } from '@/lib/types'
import {
  listarTarefaTiposDoSetor,
  listarTarefaTipoIdsVinculados,
  listarVinculosAtividadeComRegime,
  definirVinculoAtividadeRegime,
  alternarVinculo,
  type TipoEntidadeVinculo,
  type TarefaTipoResumo,
} from '@/lib/tarefa-tipo-vinculos-actions'
import { listarEntidades, type EntidadeConfig } from '@/lib/config-entidades-actions'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Checkbox } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { EmptyState } from '@/components/ui/EmptyState'
import { EsqueletoLinhas } from '@/components/ui/Esqueleto'
import { cn } from '@/components/ui/cn'

interface Props {
  entidadeTipo: TipoEntidadeVinculo
  entidadeId: string
  entidadeNome: string
  setor: UserSetor
  onClose: () => void
}

const CAIXA = 'max-h-[46vh] overflow-y-auto rounded-[10px] border border-line-soft'
const LINHA = 'flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5'

function NomeTarefa({ tarefa }: { tarefa: TarefaTipoResumo }) {
  return <span className={cn('text-sm', tarefa.ativo ? 'text-fg' : 'text-fg-3 line-through')}>{tarefa.nome}</span>
}

export default function VincularTarefasModal({ entidadeTipo, entidadeId, entidadeNome, setor, onClose }: Props) {
  const [tarefas, setTarefas] = useState<TarefaTipoResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  // grupo (vínculo normal) e regime (visão legada, só remoção)
  const [vinculadas, setVinculadas] = useState<Set<string>>(new Set())

  // atividade: tarefaTipoId -> regimeId vinculado (null = todos os regimes)
  const [vinculosAtividade, setVinculosAtividade] = useState<Map<string, string | null>>(new Map())
  const [regimes, setRegimes] = useState<EntidadeConfig[]>([])

  useEffect(() => {
    async function carregar() {
      setCarregando(true)

      if (entidadeTipo === 'atividade') {
        const [tarefasRes, vinculosRes, regimesRes] = await Promise.all([
          listarTarefaTiposDoSetor(setor),
          listarVinculosAtividadeComRegime(entidadeId),
          listarEntidades('regimes', setor),
        ])
        if (tarefasRes.error) setErro(tarefasRes.error)
        else if (vinculosRes.error) setErro(vinculosRes.error)
        else if (regimesRes.error) setErro(regimesRes.error)
        else {
          setTarefas(tarefasRes.data)
          setVinculosAtividade(new Map(vinculosRes.data.map(v => [v.tarefaTipoId, v.regimeId])))
          setRegimes(regimesRes.data)
          setErro(null)
        }
      } else {
        const [tarefasRes, vinculosRes] = await Promise.all([
          listarTarefaTiposDoSetor(setor),
          listarTarefaTipoIdsVinculados(entidadeTipo, entidadeId),
        ])
        if (tarefasRes.error) setErro(tarefasRes.error)
        else if (vinculosRes.error) setErro(vinculosRes.error)
        else {
          setTarefas(tarefasRes.data)
          setVinculadas(new Set(vinculosRes.data))
          setErro(null)
        }
      }

      setCarregando(false)
    }
    carregar()
  }, [setor, entidadeTipo, entidadeId])

  async function toggleGrupo(tarefaTipoId: string) {
    const jaVinculada = vinculadas.has(tarefaTipoId)
    setVinculadas(prev => {
      const novo = new Set(prev)
      if (jaVinculada) novo.delete(tarefaTipoId)
      else novo.add(tarefaTipoId)
      return novo
    })

    const { error } = await alternarVinculo(tarefaTipoId, entidadeTipo, entidadeId, !jaVinculada)
    if (error) {
      setErro(error)
      setVinculadas(prev => {
        const novo = new Set(prev)
        if (jaVinculada) novo.add(tarefaTipoId)
        else novo.delete(tarefaTipoId)
        return novo
      })
    }
  }

  async function handleRemoverLegado(tarefaTipoId: string) {
    const anterior = new Set(vinculadas)
    setVinculadas(prev => { const novo = new Set(prev); novo.delete(tarefaTipoId); return novo })

    const { error } = await alternarVinculo(tarefaTipoId, 'regime', entidadeId, false)
    if (error) { setErro(error); setVinculadas(anterior) }
  }

  async function handleToggleAtividade(tarefaTipoId: string) {
    const jaVinculada = vinculosAtividade.has(tarefaTipoId)
    const anterior = new Map(vinculosAtividade)
    setVinculosAtividade(prev => {
      const novo = new Map(prev)
      if (jaVinculada) novo.delete(tarefaTipoId)
      else novo.set(tarefaTipoId, null)
      return novo
    })

    const { error } = await definirVinculoAtividadeRegime(tarefaTipoId, entidadeId, null, !jaVinculada)
    if (error) { setErro(error); setVinculosAtividade(anterior) }
  }

  async function handleRegimeChange(tarefaTipoId: string, regimeId: string) {
    const valor = regimeId === '' ? null : regimeId
    const anterior = new Map(vinculosAtividade)
    setVinculosAtividade(prev => new Map(prev).set(tarefaTipoId, valor))

    const { error } = await definirVinculoAtividadeRegime(tarefaTipoId, entidadeId, valor, true)
    if (error) { setErro(error); setVinculosAtividade(anterior) }
  }

  const termo = busca.trim().toLowerCase()
  const casaComBusca = (t: TarefaTipoResumo) => termo === '' || t.nome.toLowerCase().includes(termo)
  const tarefasFiltradas = tarefas.filter(casaComBusca)
  const tarefasLegadoRegime = tarefas.filter(t => vinculadas.has(t.id))
  const legadoFiltrado = tarefasLegadoRegime.filter(casaComBusca)

  const campoBusca = (
    <Input
      type="search"
      aria-label="Buscar tarefa"
      placeholder="Buscar tarefa"
      value={busca}
      onChange={e => setBusca(e.target.value)}
      iconeEsquerda={<Search size={16} />}
    />
  )
  const semResultado = <EmptyState compacto icone={<Search size={20} />} titulo="Nenhuma tarefa encontrada com essa busca" />

  return (
    <Modal
      aberto
      onFechar={onClose}
      titulo={`Tarefas de "${entidadeNome}"`}
      subtitulo={entidadeTipo === 'atividade' ? 'Marque as tarefas que todo cliente desta atividade recebe' : undefined}
      largura="p"
      rodape={<Button variante="fantasma" onClick={onClose} className="ml-auto">Fechar</Button>}
    >
      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

      {carregando ? (
        <EsqueletoLinhas linhas={5} />

      ) : entidadeTipo === 'regime' ? (
        <>
          <Aviso tom="info">
            Vínculo direto por regime foi descontinuado — essas tarefas ainda usam o mecanismo antigo.
            Recrie pela aba Atividades escolhendo a atividade certa e este regime, depois remova daqui.
          </Aviso>
          {tarefasLegadoRegime.length === 0 ? (
            <EmptyState compacto icone={<History size={20} />} titulo="Nenhum vínculo antigo restante" />
          ) : (
            <>
              {campoBusca}
              {legadoFiltrado.length === 0 ? semResultado : (
                <ul className={CAIXA}>
                  {legadoFiltrado.map((t, i) => (
                    <li key={t.id} className={cn(LINHA, i > 0 && 'border-t border-line-soft')}>
                      <span className="min-w-0 flex-1"><NomeTarefa tarefa={t} /></span>
                      <Button tamanho="p" variante="perigo" onClick={() => handleRemoverLegado(t.id)} aria-label={`Remover ${t.nome}`}>Remover</Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>

      ) : tarefas.length === 0 ? (
        <EmptyState compacto icone={<ListChecks size={20} />} titulo="Nenhuma tarefa cadastrada no catálogo desse setor ainda" />

      ) : entidadeTipo === 'atividade' ? (
        <>
          {campoBusca}
          {tarefasFiltradas.length === 0 ? semResultado : (
            <ul className={CAIXA}>
              {tarefasFiltradas.map((t, i) => {
                const regimeId = vinculosAtividade.get(t.id)
                const vinculada = vinculosAtividade.has(t.id)
                return (
                  <li key={t.id} className={cn(LINHA, i > 0 && 'border-t border-line-soft')}>
                    <Checkbox
                      rotulo={<NomeTarefa tarefa={t} />}
                      checked={vinculada}
                      onChange={() => handleToggleAtividade(t.id)}
                      className="min-w-0 flex-1 max-sm:basis-full"
                    />
                    {vinculada && (
                      // No celular o regime desce para a linha de baixo e não espreme o nome.
                      <div className="w-[200px] flex-none max-sm:w-full max-sm:pl-7">
                        <Select
                          aria-label={`Regime de ${t.nome}`}
                          value={regimeId ?? ''}
                          onChange={e => handleRegimeChange(t.id, e.target.value)}
                          className="h-8"
                        >
                          <option value="">Todos os regimes</option>
                          {regimes.map(r => (
                            <option key={r.id} value={r.id}>{r.nome}</option>
                          ))}
                        </Select>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-[13px] text-fg-3">Cada marcação salva na hora. Vincular não cria pendências de meses passados.</p>
        </>

      ) : (
        <>
          {campoBusca}
          {tarefasFiltradas.length === 0 ? semResultado : (
            <ul className={CAIXA}>
              {tarefasFiltradas.map((t, i) => (
                <li key={t.id} className={cn(LINHA, i > 0 && 'border-t border-line-soft')}>
                  <Checkbox
                    rotulo={<NomeTarefa tarefa={t} />}
                    checked={vinculadas.has(t.id)}
                    onChange={() => toggleGrupo(t.id)}
                    className="min-w-0 flex-1"
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="text-[13px] text-fg-3">Cada marcação salva na hora. Vincular não cria pendências de meses passados.</p>
        </>
      )}
    </Modal>
  )
}
