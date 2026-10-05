import Agenda from '@/components/geral/agenda/Agenda'
import { chaveHojeNoBrasil } from '@/lib/agenda'
import { Pagina } from '@/components/ui/Pagina'

export const metadata = { title: 'Agenda — Tesserato Fiscal' }

export default function AgendaPage() {
  return (
    <Pagina>
      <Agenda hojeInicial={chaveHojeNoBrasil()} titulo="Agenda" subtitulo="Seus compromissos pessoais" />
    </Pagina>
  )
}
