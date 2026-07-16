// Edge Function: jarvis-avaliar
// O MOTOR do agente Jarvis no MVP (decisão do Orquestrador 16/07, opção 2): recebe um feedback
// em linguagem natural sobre a Clara, chama a Anthropic (com a persona do agente jarvis de
// core.agente como system) e propõe uma edição cirúrgica no prompt da Clara via
// api.propor_atualizacao_prompt (que grava agente='jarvis', tipo='atualizar_prompt', pendente).
// O HITL fica intacto: quem aprova é a UI (/jarvis mostra o diff → api.validar_sugestao).
//
// TODO(spec): pós-MVP o Jarvis migra pro worker/Mastra (opção 3, o caminho propose-only puro);
// esta function é só o motor dele por ora.
//
// Guardas do porta.validar_sugestao que respeitamos ao propor:
//  - versao_base = versão vigente do alvo (optimistic lock);
//  - prompt_novo = prompt COMPLETO (aplicamos a edição sobre o vigente; nada de patch/placeholder,
//    e nunca < 50% do tamanho vigente).

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODELO = "claude-haiku-4-5-20251001"; // barato/rápido (D10) — reescrever prompt não exige opus

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Extrai o primeiro objeto JSON de um texto (o modelo às vezes embrulha em prosa/```). */
function extrairJson(txt: string): any {
  const limpo = txt.replace(/```json\s*|\s*```/g, "");
  const i = limpo.indexOf("{");
  const j = limpo.lastIndexOf("}");
  if (i < 0 || j < 0) throw new Error("resposta do modelo sem JSON");
  return JSON.parse(limpo.slice(i, j + 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "não autenticado" }, 401);

  let pedido = "";
  let agenteAlvo = "clara";
  try {
    const body = await req.json();
    pedido = String(body.pedido ?? "").trim();
    agenteAlvo = String(body.agente_alvo ?? "clara");
  } catch {
    return json({ error: "body inválido" }, 400);
  }
  if (!pedido) return json({ error: "pedido vazio" }, 400);

  // Cliente com o JWT do usuário (attribution = e-mail dele; RLS lê core.agente).
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: agentes, error: errAg } = await supabase
    .schema("core")
    .from("agente")
    .select("id,prompt_sistema,prompt_versao")
    .in("id", [agenteAlvo, "jarvis"]);
  if (errAg) return json({ error: `leitura de agente: ${errAg.message}` }, 400);

  const alvo = agentes?.find((a) => a.id === agenteAlvo);
  const jarvis = agentes?.find((a) => a.id === "jarvis");
  if (!alvo?.prompt_sistema) return json({ error: `agente '${agenteAlvo}' sem prompt` }, 400);

  const systemJarvis =
    (jarvis?.prompt_sistema ?? "Você é o Jarvis, avaliador de prompts.") +
    `\n\n## Formato de saída (OBRIGATÓRIO)\n` +
    `Responda APENAS com um objeto JSON, sem prosa, no formato:\n` +
    `{"diagnostico": "...", "trecho_antigo": "...", "trecho_novo": "...", "justificativa": "..."}\n` +
    `Regras:\n` +
    `- trecho_antigo DEVE ser copiado LITERALMENTE (verbatim, caractere por caractere) do prompt atual do agente — um trecho curto (1 a 4 frases) que você quer mudar.\n` +
    `- trecho_novo é a substituição melhorada desse trecho.\n` +
    `- NÃO reescreva o prompt inteiro; faça UMA edição cirúrgica coerente com o feedback.\n` +
    `- Não use marcadores tipo "[IDÊNTICO...]"; escreva texto real.`;

  const userMsg =
    `PROMPT ATUAL DO AGENTE ${agenteAlvo.toUpperCase()} (v${alvo.prompt_versao}):\n"""\n${alvo.prompt_sistema}\n"""\n\n` +
    `FEEDBACK DO HUMANO SOBRE ESSE AGENTE:\n${pedido}\n\n` +
    `Produza a edição cirúrgica no formato JSON especificado.`;

  let editText = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 2000,
        system: systemJarvis,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!r.ok) return json({ error: `anthropic ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502);
    const data = await r.json();
    editText = data?.content?.[0]?.text ?? "";
  } catch (e) {
    return json({ error: `falha ao chamar o modelo: ${String(e)}` }, 502);
  }

  let edit: any;
  try {
    edit = extrairJson(editText);
  } catch {
    return json({ error: "não consegui interpretar a proposta do Jarvis; tente reformular." }, 422);
  }

  const trechoAntigo = String(edit.trecho_antigo ?? "");
  const trechoNovo = String(edit.trecho_novo ?? "");
  if (!trechoAntigo || !trechoNovo) return json({ error: "proposta incompleta do Jarvis." }, 422);

  // Localiza o trecho no prompt vigente. Match exato primeiro; se falhar (o modelo costuma
  // normalizar espaços/quebras), tenta um match TOLERANTE A ESPAÇOS (runs de whitespace = \s+)
  // e substitui o span REAL encontrado — assim o prompt_novo é o vigente com a edição aplicada.
  const vigente: string = alvo.prompt_sistema;
  let trechoReal = "";
  if (vigente.includes(trechoAntigo)) {
    trechoReal = trechoAntigo;
  } else {
    const padrao = trechoAntigo
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // escapa regex
      .replace(/\s+/g, "\\s+"); // qualquer whitespace
    const m = new RegExp(padrao).exec(vigente);
    if (m) trechoReal = m[0];
  }
  if (!trechoReal) {
    return json(
      { error: "o Jarvis não localizou o trecho no prompt — reformule o pedido." },
      422,
    );
  }

  // prompt COMPLETO = vigente com a edição aplicada (respeita as guardas do validar_sugestao).
  const promptNovo = vigente.replace(trechoReal, trechoNovo);

  const { data: prop, error: errProp } = await supabase
    .schema("api")
    .rpc("propor_atualizacao_prompt", {
      p_agente_alvo: agenteAlvo,
      p_prompt_novo: promptNovo,
      p_justificativa: String(edit.justificativa ?? ""),
      p_versao_base: alvo.prompt_versao,
    });
  if (errProp) return json({ error: `propor: ${errProp.message}` }, 400);

  return json({
    sugestao_id: (prop as any)?.sugestao_id ?? null,
    agente_alvo: agenteAlvo,
    versao_base: alvo.prompt_versao,
    diagnostico: String(edit.diagnostico ?? ""),
    trecho_antigo: trechoReal,
    trecho_novo: trechoNovo,
    justificativa: String(edit.justificativa ?? ""),
  });
});
