import type { LinkRapido } from '@/lib/types'

interface Props {
  links: LinkRapido[]
}

function FaviconImg({ domain, titulo }: { domain: string; titulo: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt={titulo}
      width={24}
      height={24}
      className="object-contain rounded"
    />
  )
}

function getDomain(url: string) {
  try { return new URL(url).hostname } catch { return '' }
}

export default function LinksRapidos({ links }: Props) {
  const ativos = links.filter(l => l.ativo).sort((a, b) => a.ordem - b.ordem)

  return (
    <div>
      <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest mb-4">
        Acesso Rápido
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {ativos.map(link => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/5 border border-white/8 hover:bg-white/8 hover:border-[#00B8D4]/30 transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center">
              <FaviconImg domain={getDomain(link.url)} titulo={link.titulo} />
            </div>
            <span className="text-xs text-white/60 text-center leading-tight group-hover:text-white/90 transition-colors">
              {link.titulo}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
