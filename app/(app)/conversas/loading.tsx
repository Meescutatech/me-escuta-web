/*
 * Loading / skeleton do /conversas (mesmo padrão do funil/loading.tsx): a navegação responde
 * na hora com a estrutura de 3 painéis do inbox enquanto o servidor busca conversas/mensagens.
 */
export default function CarregandoConversas() {
  return (
    <div className="flex h-screen bg-board">
      <aside className="flex w-[272px] shrink-0 flex-col border-r border-linha bg-branco">
        <div className="px-4 pb-2.5 pt-3.5">
          <h1 className="mb-2.5 text-[15px] font-[650] leading-none text-tinta">Conversas</h1>
          <div className="h-8 animate-pulse rounded-lg border border-linha bg-board" />
        </div>
        <div className="flex flex-col gap-px px-2 pt-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg px-2.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 shrink-0 rounded-full bg-hover" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 rounded bg-hover" />
                  <div className="h-2.5 w-4/5 rounded bg-hover" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-linha bg-branco px-5 py-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-hover" />
          <div className="space-y-1.5">
            <div className="h-3 w-36 animate-pulse rounded bg-hover" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-hover" />
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-hidden px-6 py-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 ? "justify-end" : ""}`}>
              <div
                className="h-12 animate-pulse rounded-2xl bg-hover"
                style={{ width: `${38 + ((i * 13) % 22)}%` }}
              />
            </div>
          ))}
        </div>
      </main>
      <aside className="hidden w-[300px] shrink-0 border-l border-linha bg-branco px-4 py-4 xl:block">
        <div className="space-y-3">
          <div className="h-4 w-1/2 animate-pulse rounded bg-hover" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-hover" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-hover" />
          <div className="mt-6 h-4 w-1/3 animate-pulse rounded bg-hover" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-hover" />
        </div>
      </aside>
    </div>
  );
}
