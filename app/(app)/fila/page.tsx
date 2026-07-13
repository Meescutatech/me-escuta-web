import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SugestaoPendente } from "@/lib/tipos";
import { validarSugestao } from "./actions";

export const dynamic = "force-dynamic";

function corpoProposto(payload: Record<string, unknown>): string {
  const p = payload as Record<string, any>;
  return typeof p.corpo === "string" ? p.corpo : JSON.stringify(payload).slice(0, 200);
}

export default async function FilaPage() {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase
    .schema("core")
    .from("sugestao_ia")
    .select("id,agente,tipo,conversa_id,payload_proposto,status,criado_em")
    .eq("status", "pendente")
    .order("criado_em", { ascending: false })
    .limit(50);

  const sugestoes = (data ?? []) as SugestaoPendente[];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Fila de sugestões pendentes</h1>
        <p className="text-sm text-muted-foreground">
          Propostas dos agentes aguardando validação. Aprovar/rejeitar chama{" "}
          <code>api.validar_sugestao</code> (RPC-porta).
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="text-sm text-destructive">
            Falha ao ler a fila: {error.message}
            <p className="mt-1 text-muted-foreground">
              (Local no Apple Silicon: o PostgREST pode estar fora — ver README/limitação Rosetta.)
            </p>
          </CardContent>
        </Card>
      ) : sugestoes.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Nenhuma sugestão pendente.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {sugestoes.map((s) => (
            <li key={s.id}>
              <Card>
                <CardContent className="space-y-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{s.agente}</Badge>
                    <span className="text-sm font-medium">{s.tipo}</span>
                    <time className="ml-auto text-xs text-muted-foreground">
                      {new Date(s.criado_em).toLocaleString("pt-BR")}
                    </time>
                  </div>
                  <p className="text-sm">{corpoProposto(s.payload_proposto)}</p>
                  <div className="flex gap-2">
                    <form action={validarSugestao}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="decisao" value="aprovada" />
                      <Button type="submit">Aprovar</Button>
                    </form>
                    <form action={validarSugestao}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="decisao" value="rejeitada" />
                      <Button type="submit" variante="destructive">
                        Rejeitar
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
