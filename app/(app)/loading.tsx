/*
 * Loading GENÉRICO do shell (app): fallback para rotas sem loading.tsx próprio
 * (/, /configuracoes, /jarvis). Rotas com skeleton fiel (funil, conversas, timeline,
 * fila) usam o delas — este só garante que NENHUMA navegação fique sem resposta visual.
 */
export default function CarregandoApp() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-6">
      <div className="h-6 w-44 animate-pulse rounded bg-hover" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-[10px] border border-linha bg-branco px-5 py-[18px]">
            <div className="h-3 w-2/3 rounded bg-hover" />
            <div className="mt-3 h-8 w-1/2 rounded bg-hover" />
          </div>
        ))}
      </div>
      <div className="animate-pulse rounded-[10px] border border-linha bg-branco p-5">
        <div className="h-3 w-40 rounded bg-hover" />
        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 rounded bg-hover" style={{ width: `${88 - i * 9}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
