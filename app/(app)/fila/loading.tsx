/* Esqueleto do /fila enquanto a fila carrega — mesma anatomia do cartão real (cabeçalho,
   paciente, texto proposto, ações), para a tela não pular de forma quando o dado chega. */
export default function CarregandoFila() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-7">
      <div className="mb-5 animate-pulse space-y-2">
        <div className="h-9 w-40 rounded bg-hover" />
        <div className="h-3.5 w-[46ch] max-w-full rounded bg-hover" />
      </div>
      <div className="flex gap-1.5 border-b border-linha pb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-hover" />
        ))}
      </div>
      <ul className="mt-5 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i}>
            <div className="animate-pulse rounded-[10px] border border-linha bg-branco px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-16 rounded bg-hover" />
                <div className="h-3.5 w-40 rounded bg-hover" />
                <div className="ml-auto h-3 w-20 rounded bg-hover" />
              </div>
              <div className="mt-2 h-3 w-44 rounded bg-hover" />
              <div className="mt-3 space-y-2 border-l-[3px] border-linha pl-3.5">
                <div className="h-3.5 w-full rounded bg-hover" />
                <div className="h-3.5 w-4/5 rounded bg-hover" />
              </div>
              <div className="mt-4 flex gap-2">
                <div className="h-9 w-36 rounded-md bg-hover" />
                <div className="h-9 w-24 rounded-md bg-hover" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
