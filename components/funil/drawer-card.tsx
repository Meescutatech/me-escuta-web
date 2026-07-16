"use client";

import type { CardLead } from "@/lib/dados/funil";

/**
 * Drawer do card (Bloco 2: esqueleto com dados do lead). Bloco 3 enriquece com
 * tarefas / anotações / anexos / histórico do ledger + Levindo acionável.
 */
export function DrawerCard({
  lead,
  fonte,
  onFechar,
}: {
  lead: CardLead | null;
  fonte: "real" | "mock";
  onFechar: () => void;
}) {
  const aberto = !!lead;
  return (
    <>
      {/* backdrop */}
      <div
        onClick={onFechar}
        className={`fixed inset-0 z-40 bg-navy/20 transition-opacity ${
          aberto ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* painel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-[92vw] flex-col border-l border-borda bg-branco shadow-forte transition-transform ${
          aberto ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {lead && (
          <>
            <header className="flex items-start justify-between gap-3 border-b border-borda p-5">
              <div>
                <h2 className="font-serif text-lg font-semibold text-navy">{lead.nome}</h2>
                {lead.telefone && <p className="font-mono text-xs text-mute">{lead.telefone}</p>}
              </div>
              <button
                onClick={onFechar}
                className="grid h-8 w-8 place-items-center rounded-md text-suave hover:bg-creme hover:text-navy"
                aria-label="Fechar"
              >
                ✕
              </button>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-mute">Etapa</dt>
                  <dd className="font-medium text-navy">{lead.etapa}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mute">Origem</dt>
                  <dd className="font-medium text-navy">{lead.origem ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mute">Valor estimado</dt>
                  <dd className="font-medium text-navy">
                    {lead.valor != null
                      ? lead.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : "—"}
                  </dd>
                </div>
              </dl>
              <p className="rounded-md bg-creme p-3 text-xs text-suave">
                Tarefas, anotações, anexos, histórico do ledger e Levindo entram aqui (Bloco 3).
                {fonte === "mock" && " Este é um card de exemplo."}
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
