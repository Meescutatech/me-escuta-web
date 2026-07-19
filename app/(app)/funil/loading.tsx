/*
 * Loading / skeleton do /funil (spec A6 do kanban-v2): 3–4 cards skeleton por coluna (blocos
 * --hover com shimmer), contagem da coluna vira "··". Mostrado enquanto a projeção do ledger carrega.
 */
const COLUNAS = ["Incoming leads", "LEAD", "Interessado", "QUALIFICADO", "AUDIOMETRIA AGENDADA"];

export default function CarregandoFunil() {
  return (
    <div className="flex h-[calc(100vh-58px)] flex-col bg-board">
      <div className="flex flex-shrink-0 items-baseline gap-x-5 border-b border-linha bg-branco px-6 pb-3 pt-4">
        <h1 className="font-serif text-2xl font-semibold leading-none text-navy">Funil</h1>
        <span className="text-[0.78rem] text-mute">carregando…</span>
      </div>
      <div className="flex flex-1 gap-3 overflow-hidden px-6 pb-5 pt-2">
        {COLUNAS.map((nome) => (
          <div key={nome} className="flex h-full w-coluna shrink-0 flex-col">
            <div className="flex items-center gap-2 px-1.5 pb-2.5">
              <span className="text-[0.82rem] font-semibold tracking-[0.01em] text-tinta">{nome}</span>
              <span className="font-serif text-[0.86rem] font-medium text-mute">··</span>
            </div>
            <div className="flex flex-col gap-[7px] pr-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-[9px] border border-linha bg-branco px-[11px] pb-[9px] pt-[10px]">
                  <div className="h-3 w-3/4 rounded bg-hover" />
                  <div className="mt-2 h-2.5 w-2/5 rounded bg-hover" />
                  <div className="mt-3 h-2 w-1/2 rounded bg-hover" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
