/* Loading / skeleton do /fila: cards de sugestão pendente enquanto a fila carrega. */
export default function CarregandoFila() {
  return (
    <section className="mx-auto max-w-4xl space-y-4 px-6 py-6">
      <div>
        <p className="text-sm text-suave">carregando…</p>
      </div>
      <ul className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i}>
            <div className="animate-pulse rounded-[10px] border border-linha bg-branco px-5 py-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-14 rounded-full bg-hover" />
                  <div className="h-3 w-28 rounded bg-hover" />
                  <div className="ml-auto h-3 w-24 rounded bg-hover" />
                </div>
                <div className="h-3 w-5/6 rounded bg-hover" />
                <div className="flex gap-2">
                  <div className="h-8 w-20 rounded-md bg-hover" />
                  <div className="h-8 w-20 rounded-md bg-hover" />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
