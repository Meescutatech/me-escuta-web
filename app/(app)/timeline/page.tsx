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
    <section className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Timeline do ledger</h1>
        <p className="text-sm text-muted-foreground">
          Últimos eventos por <code>posicao_global</code> (desc). Leitura via RLS, direto no{" "}
          <code>core.evento</code>.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="text-sm text-destructive">
            Falha ao ler o ledger: {error.message}
            <p className="mt-1 text-muted-foreground">
              (Local no Apple Silicon: o PostgREST pode estar fora — ver README/limitação Rosetta.)
            </p>
          </CardContent>
        </Card>
      ) : eventos.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">Nenhum evento ainda.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {eventos.map((ev) => (
            <li key={ev.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>#{ev.posicao_global}</Badge>
                      <span className="text-sm font-medium">{ev.tipo}</span>
                      <span className="text-xs text-muted-foreground">
                        origem={ev.origem} · ator={ev.ator}
                      </span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{resumoPayload(ev.payload)}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
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
