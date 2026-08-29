import { criarClienteServidor } from "@/lib/supabase/server";
import { lerPapelAtual } from "@/components/configuracoes/dados/porta";
import type { PedidoJarvis } from "@/lib/jarvis/contrato";

/**
 * Proxy SSE do Jarvis (F9). O navegador chama AQUI; só o servidor conhece JARVIS_URL + JARVIS_TOKEN.
 *
 * Por que Route Handler e não Server Action: no Next 14 uma action devolve valor serializável, não
 * um stream — o `repassa o stream para o cliente` do contrato só é possível por aqui. A action
 * `app/(app)/jarvis/actions.ts` segue existindo para o fluxo de melhoria de prompt.
 *
 * Identidade NUNCA vem do corpo: `usuario_id` e `papel` são lidos da sessão do Supabase no
 * servidor e sobrescrevem o que o cliente mandar.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JARVIS_URL = (process.env.JARVIS_URL ?? "").replace(/\/+$/, "");
const JARVIS_TOKEN = process.env.JARVIS_TOKEN ?? "";

function sseErro(motivo: string, status = 200): Response {
  const corpo = `data: ${JSON.stringify({ tipo: "erro", motivo })}\n\ndata: ${JSON.stringify({
    tipo: "fim",
    sessao_id: "",
    tokens: { entrada: 0, saida: 0 },
    duracao_ms: 0,
    modelo: "-",
  })}\n\n`;
  return new Response(corpo, { status, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  const supabase = criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ erro: "sem sessão" }), { status: 401 });

  const papel = await lerPapelAtual();
  if (!papel) return sseErro("Sua conta não tem papel ativo no workspace — peça a um admin.");

  if (!JARVIS_URL || !JARVIS_TOKEN) {
    return sseErro("O Jarvis não está configurado neste ambiente (JARVIS_URL/JARVIS_TOKEN).");
  }

  let corpo: Partial<PedidoJarvis>;
  try {
    corpo = (await req.json()) as Partial<PedidoJarvis>;
  } catch {
    return new Response(JSON.stringify({ erro: "corpo inválido" }), { status: 400 });
  }

  const pedido: PedidoJarvis = {
    usuario_id: user.id,
    papel,
    contexto: {
      rota: String(corpo.contexto?.rota ?? "/"),
      busca: corpo.contexto?.busca ?? null,
      lead_id: corpo.contexto?.lead_id ?? null,
      conversa_id: corpo.contexto?.conversa_id ?? null,
    },
    mensagens: Array.isArray(corpo.mensagens) ? corpo.mensagens.slice(-40) : [],
    ...(corpo.sessao_id ? { sessao_id: corpo.sessao_id } : {}),
  };

  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());

  let upstream: Response;
  try {
    upstream = await fetch(`${JARVIS_URL}/jarvis/perguntar`, {
      method: "POST",
      headers: { authorization: `Bearer ${JARVIS_TOKEN}`, "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(pedido),
      cache: "no-store",
      signal: ac.signal,
    });
  } catch (err) {
    return sseErro(`Não consegui falar com o Jarvis (${err instanceof Error ? err.message : "rede"}).`);
  }
  if (!upstream.ok || !upstream.body) {
    const txt = await upstream.text().catch(() => "");
    let motivo = `Jarvis respondeu ${upstream.status}`;
    try {
      const j = JSON.parse(txt) as { erro?: string; detalhes?: string[] };
      if (j.erro) motivo = j.detalhes?.length ? `${j.erro}: ${j.detalhes.join("; ")}` : j.erro;
    } catch {
      /* corpo não-JSON */
    }
    return sseErro(motivo);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
