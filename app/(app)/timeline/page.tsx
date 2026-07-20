import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EventoLedger } from "@/lib/tipos";

// Refetch simples a cada visita (realtime é S3). Sem cache — sempre lê o ledger atual.
export const dynamic = "force-dynamic";

function resumoPayload(payload: Record<string, unknown>): string {
  const p = payload as Record<string, any>;
  if (typeof p.corpo === "string") return p.corpo;
  if (p.conversa?.telefone) return `conversa ${p.conversa.telefone}`;
  return JSON.stringify(payload).slice(0, 140);
}

export default async function TimelinePage() {
  const supabase = criarClienteServidor();
  // Leitura via RLS, direto no schema core. Ordem = posicao_global desc (ordem total do ledger).
  const { data, error } = await supabase
    .schema("core")
    .from("evento")
    .select("id,posicao_global,lead_id,tipo,ator,origem,criado_em,payload")
    .order("posicao_global", { ascending: false })
    .limit(50);

  const eventos = (data ?? []) as EventoLedger[];

  return (
    <section className="mx-auto max-w-4xl space-y-4 px-6 py-6">
      <div>
        <h1 className="font-serif text-xl font-semibold text-navy">Timeline do ledger</h1>
        <p className="text-sm text-suave">
          Últimos eventos por{" "}
          <code className="rounded bg-creme px-1.5 py-0.5 font-mono text-xs">posicao_global</code> (desc).
          Leitura via RLS, direto no{" "}
          <code className="rounded bg-creme px-1.5 py-0.5 font-mono text-xs">core.evento</code>.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="text-sm text-vermelho">
            Falha ao ler o ledger: {error.message}
          </CardContent>
        </Card>
      ) : eventos.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-suave">Nenhum evento ainda.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {eventos.map((ev) => (
            <li key={ev.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tom="navy" className="font-mono">
                        #{ev.posicao_global}
                      </Badge>
                      <span className="text-sm font-semibold text-navy">{ev.tipo}</span>
                      <span className="text-xs text-mute">
                        origem={ev.origem} · ator={ev.ator}
                      </span>
                    </div>
                    <p className="truncate text-sm text-suave">{resumoPayload(ev.payload)}</p>
                  </div>
                  <time className="shrink-0 text-xs text-mute">
                    {new Date(ev.criado_em).toLocaleString("pt-BR")}
                  </time>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
