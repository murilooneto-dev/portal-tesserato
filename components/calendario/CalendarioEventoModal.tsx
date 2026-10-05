// components/calendario/CalendarioEventoModal.tsx
'use client'

import { useId, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Textarea } from '@/components/ui/Input'
import { Segmentado } from '@/components/ui/Segmentado'
import type { CalendarioEvento, TipoDataEvento, UserSetor } from '@/lib/types'

interface Props {
  setor: UserSetor
  evento: CalendarioEvento | null
  onClose: () => void
}

const REPETICAO: { valor: TipoDataEvento; rotulo: string }[] = [
  { valor: 'recorrente', rotulo: 'Todo mês' },
  { valor: 'unica', rotulo: 'Uma data só' },
]

export default function CalendarioEventoModal({ setor, evento, onClose }: Props) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = !!evento

  const [titulo, setTitulo] = useState(evento?.titulo ?? '')
  const [descricao, setDescricao] = useState(evento?.descricao ?? '')
  const [tipoData, setTipoData] = useState<TipoDataEvento>(evento?.tipo_data ?? 'recorrente')
  const [internaDiaMes, setInternaDiaMes] = useState<number | ''>(evento?.interna_dia_mes ?? '')
  const [internaData, setInternaData] = useState(evento?.interna_data ?? '')
  const [oficialDiaMes, setOficialDiaMes] = useState<number | ''>(evento?.oficial_dia_mes ?? '')
  const [oficialData, setOficialData] = useState(evento?.oficial_data ?? '')
  const [saving, setSaving] = useState(false)
  const [tentou, setTentou] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const temInterna = tipoData === 'recorrente' ? internaDiaMes !== '' : !!internaData
  const temOficial = tipoData === 'recorrente' ? oficialDiaMes !== '' : !!oficialData
  const erroTitulo = tentou && !titulo.trim() ? 'Informe o título.' : null
  const erroDatas = tentou && !temInterna && !temOficial ? 'Preencha ao menos uma das duas datas.' : null
  const idErroDatas = useId()
  const descDatas = (d?: string) => [erroDatas ? idErroDatas : undefined, d].filter(Boolean).join(' ') || undefined

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setTentou(true)
    if (!titulo.trim()) return
    if (!temInterna && !temOficial) return

    setSaving(true)
    setErro(null)

    const payload = {
      setor,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      tipo_data: tipoData,
      interna_dia_mes: tipoData === 'recorrente' && internaDiaMes !== '' ? internaDiaMes : null,
      interna_data: tipoData === 'unica' && internaData ? internaData : null,
      oficial_dia_mes: tipoData === 'recorrente' && oficialDiaMes !== '' ? oficialDiaMes : null,
      oficial_data: tipoData === 'unica' && oficialData ? oficialData : null,
    }

    const { error } = isEdit
      ? await sb.from('calendario_eventos').update(payload).eq('id', evento!.id)
      : await sb.from('calendario_eventos').insert(payload)

    if (error) { setSaving(false); setErro(error.message); return }

    setSaving(false)
    router.refresh()
    onClose()
  }

  const recorrente = tipoData === 'recorrente'
  const unidade = recorrente ? '(dia do mês)' : '(data)'

  return (
    <Modal
      aberto
      onFechar={onClose}
      bloqueado={saving}
      titulo={isEdit ? 'Editar evento do calendário' : 'Novo evento do calendário'}
      subtitulo="Prazo interno ou vencimento oficial"
      largura="p"
      rodape={
        <>
          <Button variante="fantasma" onClick={onClose} disabled={saving} className="ml-auto">Cancelar</Button>
          <Button variante="primario" type="submit" form="form-evento-calendario" carregando={saving}>{saving ? 'Salvando…' : 'Salvar evento'}</Button>
        </>
      }
    >
      <form id="form-evento-calendario" onSubmit={handleSave} noValidate className="flex flex-col gap-4">
        <Field rotulo="Título" obrigatorio erro={erroTitulo}>
          {c => <Input id={c.id} aria-describedby={c.describedBy} invalido={c.invalido} data-autofocus value={titulo} onChange={e => setTitulo(e.target.value)} />}
        </Field>
        <Field rotulo="Descrição">
          {c => <Textarea id={c.id} rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg-2">Repetição</span>
          <Segmentado rotulo="Repetição" opcoes={REPETICAO} valor={tipoData} onMudar={setTipoData} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field rotulo={`Prazo interno ${unidade}`} ajuda="Prazo do escritório">
            {c => recorrente ? (
              <Input id={c.id} aria-describedby={descDatas(c.describedBy)} invalido={Boolean(erroDatas)} type="number" min={1} max={31} placeholder="1 a 31"
                value={internaDiaMes} onChange={e => setInternaDiaMes(e.target.value === '' ? '' : Number(e.target.value))} />
            ) : (
              <Input id={c.id} aria-describedby={descDatas(c.describedBy)} invalido={Boolean(erroDatas)} type="date" value={internaData} onChange={e => setInternaData(e.target.value)} />
            )}
          </Field>
          <Field rotulo={`Vencimento oficial ${unidade}`} ajuda="Prazo do órgão">
            {c => recorrente ? (
              <Input id={c.id} aria-describedby={descDatas(c.describedBy)} invalido={Boolean(erroDatas)} type="number" min={1} max={31} placeholder="1 a 31"
                value={oficialDiaMes} onChange={e => setOficialDiaMes(e.target.value === '' ? '' : Number(e.target.value))} />
            ) : (
              <Input id={c.id} aria-describedby={descDatas(c.describedBy)} invalido={Boolean(erroDatas)} type="date" value={oficialData} onChange={e => setOficialData(e.target.value)} />
            )}
          </Field>
        </div>
        {erroDatas && <p id={idErroDatas} role="alert" className="text-xs text-danger">{erroDatas}</p>}
        <p className="text-[13px] text-fg-3">Preencha pelo menos uma das duas datas. Deixe a outra em branco se não se aplicar.</p>
        {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      </form>
    </Modal>
  )
}
