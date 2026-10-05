// Barra fina de progresso com "feitas/total" ao lado (listas e relatórios).
export function BarraProgresso({ feitas, total, className }: { feitas: number; total: number; className?: string }) {
  if (total <= 0) return <span className="text-[13px] text-fg-3">—</span>
  const pct = Math.round((feitas / total) * 100)
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ''}`} role="progressbar" aria-label={`${feitas} de ${total} tarefas concluídas`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded bg-raised">
        <div className={`h-full rounded ${pct === 100 ? 'bg-ok' : 'bg-acc'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="min-w-[34px] text-right text-[13px] tabular-nums text-fg-2">{feitas}/{total}</span>
    </div>
  )
}
