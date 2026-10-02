import Agenda from '@/components/geral/agenda/Agenda'
import { Pagina } from '@/components/ui/Pagina'

export const metadata = { title: 'Agenda — Tesserato Fiscal' }

export default function AgendaPage() {
  return (
    <Pagina>
      <Agenda titulo="Agenda" subtitulo="Sua agenda pessoal" />
    </Pagina>
  )
}
