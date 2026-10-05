'use client'

import Link from 'next/link'
import { History } from 'lucide-react'
import type { Profile } from '@/lib/types'
import { Abas, CabecalhoPagina, Pagina } from '@/components/ui'
import { buttonClassName } from '@/components/ui/Button'
import AbaComunicadoEmails from './AbaComunicadoEmails'
import AbaUsuarios from './AbaUsuarios'

interface Props {
  profiles: Profile[]
  currentUserId: string
  dashboardAnnouncement: string
  emailSettings?: Record<string, string>
}

export default function ParametrosClient({ profiles, currentUserId, dashboardAnnouncement, emailSettings = {} }: Props) {
  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Parâmetros"
        subtitulo="Configurações gerais do portal, só para administradores"
        acoes={
          <Link href="/fiscal/parametros/logs" className={buttonClassName({ variante: 'secundario' })}>
            <History size={16} aria-hidden="true" />
            Logs do sistema
          </Link>
        }
      />
      <Abas
        rotulo="Seções de Parâmetros"
        abas={[
          {
            id: 'comunicado',
            rotulo: 'Comunicado e e-mails',
            conteudo: <AbaComunicadoEmails dashboardAnnouncement={dashboardAnnouncement} emailSettings={emailSettings} />,
          },
          { id: 'usuarios', rotulo: 'Usuários', conteudo: <AbaUsuarios profiles={profiles} currentUserId={currentUserId} /> },
        ]}
      />
    </Pagina>
  )
}
