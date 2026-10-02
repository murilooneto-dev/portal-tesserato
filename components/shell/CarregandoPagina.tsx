// Para usar dentro de páginas com <Suspense> nas próximas fases. Não há loading.tsx por área:
// ele ligaria o prefetch do layout (getPortalContext) em todo link visível.
// Esqueleto com o formato de uma tela (título, filtros, lista) enquanto ela carrega.
export default function CarregandoPagina() {
  return (
    <div role="status" className="flex flex-col gap-5 px-4 py-7 sm:px-8">
      <span className="sr-only">Carregando</span>
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-5">
        <div className="h-7 w-56 rounded-lg bg-raised" />
        <div className="h-4 w-80 max-w-full rounded bg-raised" />
        <div className="flex gap-3">
          <div className="h-9 w-64 max-w-full rounded-lg bg-raised" />
          <div className="hidden h-9 w-40 rounded-lg bg-raised sm:block" />
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-line-soft bg-surface p-4">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-10 rounded-lg bg-raised" />)}
        </div>
      </div>
    </div>
  )
}
