'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { cn } from '@/components/ui/cn'
import { criarTipoTarefa } from '@/lib/tarefa-tipos-actions'
import { mesesVisiveisDaPeriodicidade, type Periodicidade } from '@/lib/tarefas-societario-periodicidade'
import type { UserSetor, TipoResposta } from '@/lib/types'

type Formato = 'data' | 'texto' | 'opcoes' | 'checklist'

interface Props {
  nome: string
  setor: UserSetor
  // Só true quando chamado a partir do catálogo global de admin
  // (app/admin/configuracoes/TarefasTab.tsx), onde um tipo criado deve
  // virar padrão (ClienteGeralModal.tsx filtra .eq('padrao', true) ao
  // provisionar cliente novo). Nos demais call sites (criação ad-hoc a
  // partir do cadastro de um cliente específico) permanece false.
  padrao?: boolean
  onCancel: () => void
  onCriado: (nome: string) => void
}

const FORMATOS_BASE: { value: Formato; label: string; desc: string }[] = [
  { value: 'data', label: 'Data', desc: 'Checkbox simples com data de conclusão' },
  { value: 'texto', label: 'Texto + anexo', desc: 'Campo de texto livre e/ou upload de arquivos' },
  { value: 'opcoes', label: 'Opções', desc: 'Lista de etapas nomeadas, cada uma com seu checkbox' },
]

const FORMATO_CHECKLIST: { value: Formato; label: string; desc: string } =
  { value: 'checklist', label: 'Checkbox com Opções', desc: 'Lista de opções; marcando todas, conclui a tarefa automaticamente' }

const PERIODICIDADES: { value: Periodicidade; label: string }[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'bimestral', label: 'Bimestral (Jan/Mar/Mai/Jul/Set/Nov)' },
  { value: 'trimestral', label: 'Trimestral (Jan/Abr/Jul/Out)' },
  { value: 'semestral', label: 'Semestral (Jan/Jul)' },
  { value: 'anual', label: 'Anual (Jan)' },
]

export default function NovoTipoTarefaModal({ nome, setor, padrao = false, onCancel, onCriado }: Props) {
  const FORMATOS = setor === 'contabil' ? [...FORMATOS_BASE, FORMATO_CHECKLIST] : FORMATOS_BASE
  const [formato, setFormato] = useState<Formato>('data')
  const [etapas, setEtapas] = useState<string[]>([])
  const [novaEtapa, setNovaEtapa] = useState('')
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const temEtapas = formato === 'opcoes' || formato === 'checklist'

  function addEtapa() {
    const e = novaEtapa.trim()
    if (!e) return
    setEtapas(prev => [...prev, e])
    setNovaEtapa('')
  }

  async function handleCriar() {
    if (temEtapas && etapas.length === 0) return
    setSalvando(true)
    setErro(null)
    const tipoResposta: TipoResposta = formato === 'checklist' ? 'checklist' : formato === 'texto' ? 'texto' : 'data'
    const etapasFinal = temEtapas ? etapas : null
    const mesesVisiveis = (setor === 'societario' || setor === 'financeiro') ? mesesVisiveisDaPeriodicidade(periodicidade) : null
    try {
      const { error } = await criarTipoTarefa(setor, nome, tipoResposta, etapasFinal, padrao, mesesVisiveis)
      if (error) { setErro(error); return }
      onCriado(nome)
    } catch {
      setErro('Não foi possível criar o tipo. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      onFechar={onCancel}
      bloqueado={salvando}
      titulo="Novo tipo de tarefa"
      subtitulo={`"${nome}" ainda não existe no catálogo`}
      largura="p"
      rodape={
        <>
          <Button variante="fantasma" onClick={onCancel} disabled={salvando} className="ml-auto">Cancelar</Button>
          <Button variante="primario" onClick={handleCriar} disabled={temEtapas && etapas.length === 0} carregando={salvando}>
            {salvando ? 'Criando…' : 'Criar tipo'}
          </Button>
        </>
      }
    >
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
        <legend className="mb-1.5 text-[13px] font-medium text-fg-2">Formato de resposta</legend>
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
          <span className="text-[13px] font-medium text-fg-2">{formato === 'checklist' ? 'Opções' : 'Etapas'} ({etapas.length})</span>
          {etapas.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {etapas.map((e, i) => (
                <li key={i} className="inline-flex h-[30px] items-center gap-1 rounded-full border border-line bg-acc-soft pl-3 pr-1 text-[13px] text-fg">
                  {e}
                  <IconButton rotulo={`Remover ${e}`} icone={<X size={14} aria-hidden="true" />} onClick={() => setEtapas(prev => prev.filter((_, idx) => idx !== i))} className="h-8 w-8" />
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input aria-label={formato === 'checklist' ? 'Nova opção' : 'Nova etapa'} value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEtapa() } }} placeholder="Digite e tecle Enter" />
            <Button icone={<Plus size={16} aria-hidden="true" />} onClick={addEtapa}>Adicionar</Button>
          </div>
        </div>
      )}
      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
    </Modal>
  )
}
