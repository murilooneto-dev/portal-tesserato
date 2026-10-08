'use client'

import { useState } from 'react'
import { Check, Send } from 'lucide-react'
import { Button, Card, Field, Input, Switch, Textarea, useToast } from '@/components/ui'
import { formatarChaveEnvio } from '@/lib/relatorio-fiscal-agenda'
import { salvarComunicado, salvarConfiguracoes } from './actions'

interface Props {
  dashboardAnnouncement: string
  emailSettings: Record<string, string>
}

export default function AbaComunicadoEmails({ dashboardAnnouncement, emailSettings }: Props) {
  const toast = useToast()

  // Comunicado
  const [announcement, setAnnouncement] = useState(dashboardAnnouncement)
  const [savingAnn, setSavingAnn] = useState(false)

  // Relatórios por e-mail
  const [emailAtivo, setEmailAtivo] = useState(emailSettings.email_ativo === 'true')
  const [emailDest, setEmailDest] = useState(emailSettings.email_destinatario ?? '')
  const [rotina1Ativo, setRotina1Ativo] = useState(emailSettings.rotina1_ativo === 'true')
  const [rotina1Dia, setRotina1Dia] = useState(emailSettings.rotina1_dia ?? '')
  const [rotina1Hora, setRotina1Hora] = useState(emailSettings.rotina1_hora ?? '')
  const [rotina2Ativo, setRotina2Ativo] = useState(emailSettings.rotina2_ativo === 'true')
  const [rotina2Dia, setRotina2Dia] = useState(emailSettings.rotina2_dia ?? '')
  const [rotina2Hora, setRotina2Hora] = useState(emailSettings.rotina2_hora ?? '')
  const [savingEmail, setSavingEmail] = useState(false)
  const [enviandoRelatorio, setEnviandoRelatorio] = useState(false)

  async function handleSaveComunicado() {
    setSavingAnn(true)
    const fd = new FormData()
    fd.set('dashboard_announcement', announcement)
    try {
      await salvarComunicado(fd)
      toast('Salvo')
    } catch {
      toast('Não foi possível salvar o comunicado.', 'dng')
    }
    setSavingAnn(false)
  }

  async function handleSaveEmail() {
    setSavingEmail(true)
    const result = await salvarConfiguracoes({
      email_ativo: String(emailAtivo),
      email_destinatario: emailDest,
      rotina1_ativo: String(rotina1Ativo),
      rotina1_dia: rotina1Dia,
      rotina1_hora: rotina1Hora,
      rotina2_ativo: String(rotina2Ativo),
      rotina2_dia: rotina2Dia,
      rotina2_hora: rotina2Hora,
    })
    setSavingEmail(false)
    if (result.error) toast(`Erro: ${result.error}`, 'dng')
    else toast('Configuração salva')
  }

  async function handleEnviarRelatorios() {
    setEnviandoRelatorio(true)
    try {
      const res = await fetch('/api/relatorios/fiscal', { method: 'POST' })
      const data = await res.json()
      if (res.ok) toast(`${data.enviados} relatório(s) enviado(s): ${data.responsaveis.join(', ')}`)
      else toast(`Erro: ${data.error ?? 'falha ao enviar'}`, 'dng')
    } catch {
      toast('Erro: falha ao enviar', 'dng')
    }
    setEnviandoRelatorio(false)
  }

  const rotinas = [
    { label: 'Rotina 1', ativo: rotina1Ativo, setAtivo: setRotina1Ativo, dia: rotina1Dia, setDia: setRotina1Dia, hora: rotina1Hora, setHora: setRotina1Hora, ultimoEnvio: formatarChaveEnvio(emailSettings.rotina1_ultimo_envio) },
    { label: 'Rotina 2', ativo: rotina2Ativo, setAtivo: setRotina2Ativo, dia: rotina2Dia, setDia: setRotina2Dia, hora: rotina2Hora, setHora: setRotina2Hora, ultimoEnvio: formatarChaveEnvio(emailSettings.rotina2_ultimo_envio) },
  ]

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card titulo="Comunicado no Início">
        <div className="flex flex-col gap-3.5">
          <Field rotulo="Mensagem para todos os usuários" ajuda="Aparece no topo da página Início. Deixe em branco para esconder.">
            {c => (
              <Textarea
                id={c.id}
                aria-describedby={c.describedBy}
                value={announcement}
                onChange={e => setAnnouncement(e.target.value)}
                className="min-h-[140px]"
              />
            )}
          </Field>
          <div className="flex justify-end">
            <Button icone={<Check size={16} aria-hidden="true" />} onClick={handleSaveComunicado} carregando={savingAnn}>
              Salvar comunicado
            </Button>
          </div>
        </div>
      </Card>

      <Card
        titulo="Relatórios automáticos por e-mail"
        acoes={<Switch ligado={emailAtivo} onMudar={setEmailAtivo} rotulo="Envio ligado" />}
      >
        <div className="flex flex-col gap-[18px]">
          <Field
            rotulo="E-mail destinatário"
            ajuda="Recebe um PDF por responsável, com as tarefas do mês. O envio sai no dia e no horário de cada rotina ativa, com até uns 15 minutos de atraso."
          >
            {c => <Input id={c.id} aria-describedby={c.describedBy} type="email" autoComplete="off" value={emailDest} onChange={e => setEmailDest(e.target.value)} placeholder="destino@email.com" className="md:max-w-[360px]" />}
          </Field>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {rotinas.map(r => (
              <div key={r.label} className="flex flex-col gap-3 rounded-[10px] border border-line-soft bg-page px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <b className="text-sm font-semibold text-fg">{r.label}</b>
                  <span className="ml-auto"><Switch ligado={r.ativo} onMudar={r.setAtivo} rotulo="Ativa" /></span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field rotulo="Dia do mês">
                    {c => <Input id={c.id} type="number" min={1} max={31} value={r.dia} onChange={e => r.setDia(e.target.value)} placeholder="Ex.: 5" />}
                  </Field>
                  <Field rotulo="Horário">
                    {c => <Input id={c.id} type="time" value={r.hora} onChange={e => r.setHora(e.target.value)} />}
                  </Field>
                </div>
                {r.ultimoEnvio && <p className="text-xs text-fg-3">Último envio automático: {r.ultimoEnvio}</p>}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2.5 border-t border-line-soft pt-3.5">
            <Button icone={<Send size={16} aria-hidden="true" />} onClick={handleEnviarRelatorios} carregando={enviandoRelatorio}>
              Enviar relatórios agora
            </Button>
            <Button variante="primario" onClick={handleSaveEmail} carregando={savingEmail}>Salvar configuração</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
