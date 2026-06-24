import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import BotsConfigForm from '@/components/fiscal/BotsConfigForm'
import type { BotTipo, BotConfig } from '@/lib/types'

export const metadata = { title: 'Bots — Tesserato Fiscal' }

export default async function BotsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: configs } = await supabase
    .from('bots_config')
    .select('*')
    .eq('usuario_id', user.id)

  async function salvarConfig(bot: BotTipo, dados: Partial<BotConfig>) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('bots_config').upsert({
      usuario_id: user.id,
      bot,
      ...dados,
    }, { onConflict: 'usuario_id,bot' })

    revalidatePath('/fiscal/bots')
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Configuração dos Bots</h1>
        <p className="text-white/40 mt-1 text-sm">Configure as pastas e emails para cada bot</p>
      </div>
      <BotsConfigForm configs={configs ?? []} onSave={salvarConfig} />
    </div>
  )
}
