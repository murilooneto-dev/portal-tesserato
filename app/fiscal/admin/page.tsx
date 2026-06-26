import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminUsuarios from '@/components/fiscal/AdminUsuarios'
import CorrigirAtividadesClient from '@/components/fiscal/CorrigirAtividadesClient'
import CorrigirTarefasClient from '@/components/fiscal/CorrigirTarefasClient'

export const metadata = { title: 'Admin — Tesserato Fiscal' }

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/fiscal/intranet')

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('nome')

  return (
    <div className="p-8 max-w-4xl space-y-10">
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Administração</h1>
          <p className="text-white/40 mt-1 text-sm">Usuários cadastrados no portal</p>
        </div>
        <AdminUsuarios profiles={profiles ?? []} />
      </div>

      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white">Corrigir Encoding de Atividades</h2>
          <p className="text-white/40 mt-1 text-sm">Detecta e corrige valores de atividade com caracteres quebrados (ç, ã, é, etc.) no cadastro de empresas.</p>
        </div>
        <CorrigirAtividadesClient />
      </div>

      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white">Corrigir Encoding de Tarefas</h2>
          <p className="text-white/40 mt-1 text-sm">Detecta e corrige tipos de tarefa quebrados nos templates de clientes e nos registros de tarefas. Valores sem sugestão automática podem ser corrigidos manualmente.</p>
        </div>
        <CorrigirTarefasClient />
      </div>
    </div>
  )
}
