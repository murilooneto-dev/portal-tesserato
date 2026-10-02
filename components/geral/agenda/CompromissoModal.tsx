'use client'

import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Textarea, Switch } from '@/components/ui/Input'
import { Segmentado } from '@/components/ui/Segmentado'
import { STATUS_ROTULO, validarCompromisso, type FormCompromisso, type StatusCompromisso } from '@/lib/agenda'

const SITUACOES = (['pendente', 'concluido', 'cancelado'] as StatusCompromisso[]).map(v => ({ valor: v, rotulo: STATUS_ROTULO[v] }))

export function CompromissoModal({ aberto, inicial, editando, salvando, onSalvar, onFechar }: {
  aberto: boolean
  inicial: FormCompromisso
  editando: boolean
  salvando: boolean
  onSalvar: (f: FormCompromisso) => void
  onFechar: () => void
}) {
  const [f, setF] = useState<FormCompromisso>(inicial)
  const [tentou, setTentou] = useState(false)
  const erros = validarCompromisso(f)
  const set = <K extends keyof FormCompromisso>(k: K, v: FormCompromisso[K]) => setF(p => ({ ...p, [k]: v }))

  function enviar(e: FormEvent) {
    e.preventDefault()
    setTentou(true)
    if (Object.keys(erros).length > 0) return
    onSalvar(f)
  }

  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={salvando}
      titulo={editando ? 'Editar compromisso' : 'Novo compromisso'}
      subtitulo="Aparece só na sua agenda"
      largura="p"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar} disabled={salvando} className="ml-auto">Cancelar</Button>
          <Button variante="primario" type="submit" form="form-compromisso" carregando={salvando}>{salvando ? 'Salvando…' : 'Salvar compromisso'}</Button>
        </>
      }
    >
      <form id="form-compromisso" onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <Field rotulo="Título" obrigatorio erro={tentou ? erros.titulo : null}>
          {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} data-autofocus value={f.titulo} onChange={e => set('titulo', e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field rotulo="Data" obrigatorio erro={tentou ? erros.data_compromisso : null}>
            {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} type="date" value={f.data_compromisso} onChange={e => set('data_compromisso', e.target.value)} />}
          </Field>
          <Field rotulo="Horário">
            {c => <Input id={c.id} type="time" value={f.hora_compromisso ?? ''} onChange={e => set('hora_compromisso', e.target.value)} />}
          </Field>
        </div>
        <Field rotulo="Descrição">
          {c => <Textarea id={c.id} rows={5} value={f.descricao ?? ''} onChange={e => set('descricao', e.target.value)} />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">Situação</span>
          <Segmentado rotulo="Situação" opcoes={SITUACOES} valor={f.status} onMudar={v => set('status', v)} />
        </div>
        <Switch ligado={f.lembrete_3_dias} onMudar={v => set('lembrete_3_dias', v)} rotulo="Avisar 3 dias antes" />
      </form>
    </Modal>
  )
}
