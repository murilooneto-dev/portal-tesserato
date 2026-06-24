'use client'

import { useState } from 'react'
import type { BotConfig, BotTipo } from '@/lib/types'

const BOT_LABELS: Record<BotTipo, string> = {
  iss:  'Bot ISS',
  siga: 'Bot SIGA',
  mei:  'Bot MEI',
}

interface Props {
  configs: BotConfig[]
  onSave: (bot: BotTipo, dados: Partial<BotConfig>) => Promise<void>
}

export default function BotsConfigForm({ configs, onSave }: Props) {
  const bots: BotTipo[] = ['iss', 'siga', 'mei']
  return (
    <div className="flex flex-col gap-6">
      {bots.map(bot => (
        <BotCard key={bot} bot={bot} config={configs.find(c => c.bot === bot)} onSave={onSave} />
      ))}
    </div>
  )
}

function BotCard({ bot, config, onSave }: {
  bot: BotTipo
  config?: BotConfig
  onSave: (bot: BotTipo, dados: Partial<BotConfig>) => Promise<void>
}) {
  const [pasta, setPasta]       = useState(config?.pasta_downloads ?? '')
  const [emailRem, setEmailRem] = useState(config?.email_remetente ?? '')
  const [emailDest, setEmailDest] = useState(config?.email_destinatario ?? '')
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso]   = useState(false)

  async function handleSave() {
    setSalvando(true)
    await onSave(bot, { pasta_downloads: pasta, email_remetente: emailRem, email_destinatario: emailDest })
    setSalvando(false)
    setSucesso(true)
    setTimeout(() => setSucesso(false), 2000)
  }

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <h3 className="text-white font-semibold mb-4">{BOT_LABELS[bot]}</h3>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-white/40 mb-1 block">Pasta de downloads</label>
          <input value={pasta} onChange={e => setPasta(e.target.value)}
            placeholder="C:\Users\...\Downloads"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00B8D4] transition-colors" />
        </div>
        <div>
          <label className="text-xs text-white/40 mb-1 block">Email remetente</label>
          <input type="email" value={emailRem} onChange={e => setEmailRem(e.target.value)}
            placeholder="remetente@email.com"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00B8D4] transition-colors" />
        </div>
        <div>
          <label className="text-xs text-white/40 mb-1 block">Email destinatário</label>
          <input type="email" value={emailDest} onChange={e => setEmailDest(e.target.value)}
            placeholder="destinatario@email.com"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00B8D4] transition-colors" />
        </div>
        <button onClick={handleSave} disabled={salvando}
          className="self-end mt-1 px-5 py-2 rounded-xl bg-[#00B8D4] text-white text-sm font-semibold hover:bg-[#00a3bc] transition-colors disabled:opacity-50">
          {sucesso ? '✓ Salvo' : salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
