import Link from 'next/link'
import { SearchX, Users } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagina } from '@/components/ui/Pagina'
import { Card } from '@/components/ui/Card'
import { buttonClassName } from '@/components/ui/Button'

// Ficha de um cliente que não existe (ou foi excluído), dentro da casca do setor (e-04).
export default function ClienteNaoEncontrado() {
  return (
    <Pagina>
      <Card semPadding className="mt-10">
        <EmptyState
          icone={<SearchX size={24} />}
          titulo={<span role="heading" aria-level={1}>Cliente não encontrado</span>}
          descricao="O endereço pode ter mudado ou o cliente foi excluído. Se ele foi excluído há menos de 60 dias, um administrador pode restaurá-lo na Lixeira."
          acao={
            <Link href="/pessoal/clientes" className={buttonClassName({ variante: 'primario' })}>
              <Users size={16} aria-hidden="true" />
              Ir para Clientes
            </Link>
          }
        />
      </Card>
    </Pagina>
  )
}
