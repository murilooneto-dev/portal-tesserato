interface Props {
  nome: string
  cnpj: string | null
  municipio: string | null
  uf: string | null
  contatoChat: string | null
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--fg)]/30 mb-1">{label}</p>
      <p className="text-sm text-[var(--fg)]">{valor}</p>
    </div>
  )
}

export default function ClienteCard({ nome, cnpj, municipio, uf, contatoChat }: Props) {
  return (
    <div className="rounded-2xl border border-[var(--fg)]/10 bg-[var(--fg)]/2 p-6">
      <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--fg)]/30 mb-1">Razão Social</p>
      <h1 className="text-xl font-bold text-[var(--fg)] mb-4">{nome}</h1>
      <div className="grid grid-cols-3 gap-4">
        <Campo label="CNPJ" valor={cnpj ?? '—'} />
        <Campo label="Município / UF" valor={municipio ? `${municipio}${uf ? `/${uf}` : ''}` : '—'} />
        <Campo label="Contato" valor={contatoChat ?? '—'} />
      </div>
    </div>
  )
}
