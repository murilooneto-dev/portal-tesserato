import type { LinkRapido } from '@/lib/types'

interface Props {
  links: LinkRapido[]
}

function getDomain(url: string) {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname } catch { return '' }
}

export default function LinksRapidos({ links }: Props) {
  const ativos = links.filter(l => l.ativo).sort((a, b) => a.ordem - b.ordem)

  return (
    <div>
      <h2 className="text-xs font-bold text-[#00B8D4] uppercase tracking-widest mb-4">
        Links Úteis
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ativos.map(link => {
          const domain = getDomain(link.url)
          return (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl bg-white/4 border border-white/8 hover:bg-white/7 hover:border-white/15 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                  alt={link.titulo}
                  width={28}
                  height={28}
                  className="object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium leading-tight truncate group-hover:text-[#00B8D4] transition-colors">
                  {link.titulo}
                </p>
                <p className="text-white/30 text-xs truncate mt-0.5">{domain}</p>
              </div>
              <svg className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )
        })}
      </div>
    </div>
  )
}
