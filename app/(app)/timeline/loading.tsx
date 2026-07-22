/* Loading / skeleton do /timeline: lista de cards de evento enquanto o ledger carrega. */
export default function CarregandoTimeline() {
  return (
    <section className="mx-auto max-w-4xl space-y-4 px-6 py-6">
      <div>
        <h1 className="font-serif text-xl font-semibold text-navy">Timeline do ledger</h1>
        <p className="text-sm text-suave">carregando…</p>
      </div>
      <ul className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i}>
            <div className="animate-pulse rounded-[10px] border border-linha bg-branco px-5 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-14 rounded-full bg-hover" />
                    <div className="h-3 w-32 rounded bg-hover" />
                  </div>
                  <div className="h-3 w-3/4 rounded bg-hover" />
                </div>
                <div className="h-3 w-24 shrink-0 rounded bg-hover" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
