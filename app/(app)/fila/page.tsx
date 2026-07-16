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
    <section className="mx-auto max-w-4xl space-y-4 px-6 py-6">
      <div>
        <h1 className="font-serif text-xl font-semibold text-navy">Fila de sugestões pendentes</h1>
        <p className="text-sm text-suave">
          Propostas dos agentes aguardando validação. Aprovar/rejeitar chama{" "}
          <code className="rounded bg-creme px-1.5 py-0.5 font-mono text-xs">api.validar_sugestao</code>{" "}
          (RPC-porta).
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="text-sm text-vermelho">Falha ao ler a fila: {error.message}</CardContent>
        </Card>
      ) : sugestoes.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-suave">Nenhuma sugestão pendente.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {sugestoes.map((s) => (
            <li key={s.id}>
              <Card>
                <CardContent className="space-y-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tom="laranja">{s.agente}</Badge>
                    <span className="text-sm font-semibold text-navy">{s.tipo}</span>
                    <time className="ml-auto text-xs text-mute">
                      {new Date(s.criado_em).toLocaleString("pt-BR")}
                    </time>
                  </div>
                  <p className="text-sm text-texto">{corpoProposto(s.payload_proposto)}</p>
                  <div className="flex gap-2">
                    <form action={validarSugestao}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="decisao" value="aprovada" />
                      <Button type="submit">Aprovar</Button>
                    </form>
                    <form action={validarSugestao}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="decisao" value="rejeitada" />
                      <Button type="submit" variante="outline">
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
