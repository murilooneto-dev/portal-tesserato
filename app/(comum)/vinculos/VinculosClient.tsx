'use client'

import { useId, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Link2, Plus, Trash2 } from 'lucide-react'
import { criarVinculos, excluirVinculo } from './actions'
import { calcularNovosPares, resumoNovosVinculos } from '@/lib/vinculos'
import { SETOR_LABEL, type UserSetor, type TarefaVinculo } from '@/lib/types'
import { SETORES_DE_CLIENTE } from '@/lib/clientes-geral'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Select, Checkbox } from '@/components/ui/Input'
import { Button, IconButton } from '@/components/ui/Button'
import { Aviso } from '@/components/ui/Aviso'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'

interface Props {
  vinculosIniciais: TarefaVinculo[]
  tiposPorSetor: Record<string, string[]>
}

export default function VinculosClient({ vinculosIniciais, tiposPorSetor }: Props) {
  const router = useRouter()
  const confirmar = useConfirmar()
  const avisar = useToast()

  const [setorOrigem, setSetorOrigem] = useState<UserSetor>('fiscal')
  const [tiposOrigem, setTiposOrigem] = useState<string[]>([])
  const [setorDestino, setSetorDestino] = useState<UserSetor>('contabil')
  const [tiposDestino, setTiposDestino] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function toggleTipo(lista: string[], setLista: (v: string[]) => void, tipo: string) {
    setLista(lista.includes(tipo) ? lista.filter(t => t !== tipo) : [...lista, tipo])
  }

  const pares = useMemo(
    () => calcularNovosPares(setorOrigem, tiposOrigem, setorDestino, tiposDestino, vinculosIniciais),
    [setorOrigem, tiposOrigem, setorDestino, tiposDestino, vinculosIniciais],
  )

  async function handleCriar() {
    if (tiposOrigem.length === 0 || tiposDestino.length === 0) return
    if (pares.length === 0) return
    setSaving(true)
    setErro(null)
    const { error } = await criarVinculos({ setorOrigem, setorDestino, pares })
    setSaving(false)
    if (error) { setErro(error); return }
    avisar(pares.length === 1 ? 'Vínculo criado.' : `${pares.length} vínculos criados.`, 'ok')
    setTiposOrigem([])
    setTiposDestino([])
    router.refresh()
  }

  async function handleExcluir(v: TarefaVinculo) {
    const ok = await confirmar({
      titulo: 'Excluir vínculo?',
      descricao: `${v.tipo_origem} (${SETOR_LABEL[v.setor_origem]}) deixa de liberar ${v.tipo_destino} (${SETOR_LABEL[v.setor_destino]}).`,
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    setExcluindoId(v.id)
    const { error } = await excluirVinculo(v.id)
    setExcluindoId(null)
    if (error) { setErro(error); return }
    setErro(null)
    avisar('Vínculo excluído.', 'ok')
    router.refresh()
  }

  const tiposOrigemDisponiveis = tiposPorSetor[setorOrigem] ?? []
  const tiposDestinoDisponiveis = tiposPorSetor[setorDestino] ?? []
  const resumo = resumoNovosVinculos(setorOrigem, tiposOrigem, setorDestino, tiposDestino, pares)

  return (
    <Pagina>
      <CabecalhoPagina titulo="Vínculos de tarefas" subtitulo='Quando a tarefa de origem é concluída, a tarefa de destino do mesmo cliente mostra o selo "Liberada".' />

      <Card titulo="Vínculos ativos" meta={<Badge>{vinculosIniciais.length}</Badge>} semPadding>
        {vinculosIniciais.length === 0 ? (
          <EmptyState icone={<Link2 size={24} />} titulo="Nenhum vínculo cadastrado" descricao="Crie o primeiro no quadro abaixo." />
        ) : (
          <div className="overflow-x-auto">
            <Tabela className="min-w-[640px]">
              <thead>
                <tr>
                  <Th>Quando concluir…</Th>
                  <Th largura={48}><span className="sr-only">libera</span></Th>
                  <Th>…libera</Th>
                  <Th largura={56}><span className="sr-only">Ações</span></Th>
                </tr>
              </thead>
              <tbody>
                {vinculosIniciais.map(v => (
                  <tr key={v.id}>
                    <Td><span className="font-semibold text-fg">{v.tipo_origem}</span> <Badge>{SETOR_LABEL[v.setor_origem]}</Badge></Td>
                    <Td alinhar="centro"><ChevronRight size={18} aria-hidden="true" className="inline text-fg-3" /></Td>
                    <Td><span className="font-semibold text-fg">{v.tipo_destino}</span> <Badge>{SETOR_LABEL[v.setor_destino]}</Badge></Td>
                    <Td alinhar="dir">
                      <IconButton rotulo={`Excluir vínculo ${v.tipo_origem} → ${v.tipo_destino}`} icone={<Trash2 size={16} aria-hidden="true" />}
                        onClick={() => handleExcluir(v)} disabled={excluindoId === v.id} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>

      <Card titulo="Novo vínculo">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_48px_1fr] md:items-start">
          <LadoVinculo titulo="origem" setor={setorOrigem} onSetor={s => { setSetorOrigem(s); setTiposOrigem([]); setErro(null) }}
            tipos={tiposOrigemDisponiveis} marcados={tiposOrigem} onMarcar={t => { toggleTipo(tiposOrigem, setTiposOrigem, t); setErro(null) }} />
          <div aria-hidden="true" className="grid place-items-center text-acc-text md:self-center">
            <ChevronDown size={28} className="md:hidden" />
            <ChevronRight size={28} className="hidden md:block" />
          </div>
          <LadoVinculo titulo="destino" setor={setorDestino} onSetor={s => { setSetorDestino(s); setTiposDestino([]); setErro(null) }}
            tipos={tiposDestinoDisponiveis} marcados={tiposDestino} onMarcar={t => { toggleTipo(tiposDestino, setTiposDestino, t); setErro(null) }} />
        </div>
        {erro && <div role="alert" className="mt-4"><Aviso tom="dng">{erro}</Aviso></div>}
        <div className="mt-[18px] flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
          <p aria-live="polite" className="text-[13px] text-fg-2">{resumo}</p>
          <Button variante="primario" className="ml-auto" icone={<Plus size={16} aria-hidden="true" />} onClick={handleCriar} carregando={saving} disabled={pares.length === 0}>
            {pares.length > 1 ? `Criar ${pares.length} vínculos` : 'Criar vínculo'}
          </Button>
        </div>
      </Card>
    </Pagina>
  )
}

function LadoVinculo({ titulo, setor, onSetor, tipos, marcados, onMarcar }: {
  titulo: 'origem' | 'destino'
  setor: UserSetor
  onSetor: (s: UserSetor) => void
  tipos: string[]
  marcados: string[]
  onMarcar: (tipo: string) => void
}) {
  const idRotulo = useId()
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Field rotulo={`Setor de ${titulo}`}>
        {c => (
          <Select id={c.id} value={setor} onChange={e => onSetor(e.target.value as UserSetor)}>
            {SETORES_DE_CLIENTE.map(s => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
          </Select>
        )}
      </Field>
      <span id={idRotulo} className="text-[13px] font-medium text-fg-2">Tarefas de {titulo}</span>
      {tipos.length === 0 ? (
        <p className="text-[13px] text-fg-3">Nenhuma tarefa nesse setor.</p>
      ) : (
        <ul role="group" aria-labelledby={idRotulo} className="max-h-72 overflow-y-auto rounded-[10px] border border-line-soft bg-page">
          {tipos.map((t, i) => {
            const on = marcados.includes(t)
            return (
              <li key={t} className={cn('flex min-h-10 items-center px-3.5', i > 0 && 'border-t border-line-soft', on && 'bg-acc-soft')}>
                <Checkbox rotulo={<span className="text-sm text-fg">{t}</span>} checked={on} onChange={() => onMarcar(t)} className="w-full py-2" />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
