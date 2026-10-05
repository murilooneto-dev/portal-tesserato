'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { cn } from '@/components/ui/cn'
import { atualizarFormatoTarefaTipo } from '@/lib/tarefa-tipo-vinculos-actions'
import { mesesVisiveisDaPeriodicidade, periodicidadeDosMesesVisiveis, type Periodicidade } from '@/lib/tarefas-societario-periodicidade'
import type { TipoResposta, UserSetor } from '@/lib/types'

type Formato = 'data' | 'texto' | 'opcoes' | 'checklist'

interface Props {
  id: string
  nome: string
  setor: UserSetor
  tipoResposta: TipoResposta
  etapas: string[] | null
  mesesVisiveis: number[] | null
  onCancel: () => void
  onSalvo: () => void
}

const FORMATOS_BASE: { value: Formato; label: string; desc: string }[] = [
  { value: 'data', label: 'Data', desc: 'Marca como feita com a data de conclusão' },
  { value: 'texto', label: 'Texto e anexo', desc: 'Campo de texto livre e envio de arquivos' },
  { value: 'opcoes', label: 'Opções', desc: 'Lista de etapas com nome, cada uma com sua data' },
]

const FORMATO_CHECKLIST: { value: Formato; label: string; desc: string } =
  { value: 'checklist', label: 'Checkbox com opções', desc: 'Marcando todas as opções, a tarefa é concluída sozinha (só no Contábil)' }

const PERIODICIDADES: { value: Periodicidade; label: string }[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'bimestral', label: 'Bimestral (Jan/Mar/Mai/Jul/Set/Nov)' },
  { value: 'trimestral', label: 'Trimestral (Jan/Abr/Jul/Out)' },
  { value: 'semestral', label: 'Semestral (Jan/Jul)' },
  { value: 'anual', label: 'Anual (Jan)' },
]

function formatoInicial(tipoResposta: TipoResposta, etapas: string[] | null): Formato {
  if (tipoResposta === 'checklist') return 'checklist'
  if (etapas && etapas.length > 0) return 'opcoes'
  return tipoResposta === 'texto' ? 'texto' : 'data'
}

export default function EditarTipoTarefaModal({ id, nome, setor, tipoResposta, etapas, mesesVisiveis, onCancel, onSalvo }: Props) {
  const FORMATOS = setor === 'contabil' ? [...FORMATOS_BASE, FORMATO_CHECKLIST] : FORMATOS_BASE
  const [formato, setFormato] = useState<Formato>(formatoInicial(tipoResposta, etapas))
  const [etapasForm, setEtapasForm] = useState<string[]>(etapas ?? [])
  const [novaEtapa, setNovaEtapa] = useState('')
  // Só o Societário e o Financeiro expõem periodicidade na UI — pros demais
  // setores o valor atual de meses_visiveis é preservado sem alteração ao
  // salvar (ex.: 13º Salário do Pessoal continua com [11,12] mesmo editando
  // o formato aqui).
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>(periodicidadeDosMesesVisiveis(mesesVisiveis))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const temEtapas = formato === 'opcoes' || formato === 'checklist'

  function addEtapa() {
    const e = novaEtapa.trim()
    if (!e) return
    setEtapasForm(prev => [...prev, e])
    setNovaEtapa('')
  }

  async function handleSalvar() {
    if (temEtapas && etapasForm.length === 0) return
    setSalvando(true)
    setErro(null)
    const tipoRespostaFinal: TipoResposta = formato === 'checklist' ? 'checklist' : formato === 'texto' ? 'texto' : 'data'
    const etapasFinal = temEtapas ? etapasForm : null
    const mesesVisiveisFinal = (setor === 'societario' || setor === 'financeiro') ? mesesVisiveisDaPeriodicidade(periodicidade) : mesesVisiveis
    try {
      const { error } = await atualizarFormatoTarefaTipo(id, tipoRespostaFinal, etapasFinal, mesesVisiveisFinal)
      if (error) { setErro(error); return }
      onSalvo()
    } catch {
      setErro('Não foi possível salvar. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      onFechar={onCancel}
      bloqueado={salvando}
      titulo="Editar tipo de tarefa"
      subtitulo={nome}
      largura="p"
      rodape={
        <>
          <Button variante="fantasma" onClick={onCancel} disabled={salvando} className="ml-auto">Cancelar</Button>
          <Button variante="primario" onClick={handleSalvar} disabled={temEtapas && etapasForm.length === 0} carregando={salvando}>
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </>
      }
    >
      <Field rotulo="Nome" ajuda="O nome não pode ser alterado — ele é usado como referência em tarefas já lançadas.">
        {c => <Input id={c.id} aria-describedby={c.describedBy} value={nome} disabled readOnly />}
      </Field>
      {(setor === 'societario' || setor === 'financeiro') && (
        <Field rotulo="Periodicidade">
          {c => (
            <Select id={c.id} value={periodicidade} onChange={e => setPeriodicidade(e.target.value as Periodicidade)}>
              {PERIODICIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          )}
        </Field>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13px] font-medium text-fg-2">Formato da resposta</legend>
        {FORMATOS.map(f => {
          const ativo = formato === f.value
          return (
            <label key={f.value} className={cn('flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3', ativo ? 'border-acc bg-acc-soft' : 'border-line-soft')}>
              <input type="radio" name="formato" checked={ativo} onChange={() => setFormato(f.value)} className="mt-0.5 h-[18px] w-[18px] accent-[var(--acc)]" />
              <span>
                <span className="block text-sm font-semibold text-fg">{f.label}</span>
                <span className="block text-[13px] text-fg-3">{f.desc}</span>
              </span>
            </label>
          )
        })}
      </fieldset>
      {temEtapas && (
        <div className="flex flex-col gap-2.5 rounded-[10px] border border-line-soft p-3.5">
          <span className="text-[13px] font-medium text-fg-2">Opções ({etapasForm.length})</span>
          {etapasForm.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {etapasForm.map((e, i) => (
                <li key={i} className="inline-flex h-[30px] items-center gap-1 rounded-full border border-line bg-acc-soft pl-3 pr-1 text-[13px] text-fg">
                  {e}
                  <IconButton rotulo={`Remover ${e}`} icone={<X size={14} aria-hidden="true" />} onClick={() => setEtapasForm(prev => prev.filter((_, idx) => idx !== i))} className="h-8 w-8" />
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input aria-label="Nova opção" value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEtapa() } }} placeholder="Nome da opção (Enter para adicionar)" />
            <Button icone={<Plus size={16} aria-hidden="true" />} onClick={addEtapa}>Adicionar</Button>
          </div>
          {etapasForm.length === 0 && <p className="text-xs text-fg-3">Adicione pelo menos uma opção para salvar.</p>}
        </div>
      )}
      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
    </Modal>
  )
}
