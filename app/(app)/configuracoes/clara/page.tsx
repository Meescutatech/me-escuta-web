import { criarClienteServidor } from "@/lib/supabase/server";
import { PainelClara, type VersaoPrompt, type LeadDemo } from "@/components/clara/painel-clara";

export const dynamic = "force-dynamic";

/**
 * Configurações > Clara (SPEC-CLARA-REPLICA-DEMO §2-bis): a sala de controle do agente.
 * Leitura direto das projeções/config via RLS; escrita SÓ por evento (actions.ts).
 * Papel de gestão vem do banco (api.papel_atual) — sem ele, a página degrada pra leitura.
 */
export default async function ClaraPage() {
  const supabase = criarClienteServidor();

  const [{ data: papel }, { data: agente }, { data: versoes }, { data: demoCfg }] =
    await Promise.all([
      supabase.schema("api").rpc("papel_atual"),
      supabase
        .schema("core")
        .from("agente")
        .select("id, nome, ativo, prompt_sistema, prompt_versao, config_jsonb")
        .eq("id", "clara")
        .maybeSingle(),
      supabase
        .schema("core")
        .from("evento")
        .select("payload, ator, criado_em")
        .eq("tipo", "prompt_atualizado")
        .eq("payload->>agente_alvo", "clara")
        .order("posicao_global", { ascending: false })
        .limit(8),
      supabase
        .schema("core")
        .from("v_config_vigente")
        .select("payload")
        .eq("nome", "demo_clara")
        .maybeSingle(),
    ]);

  const telefonesDemo: string[] = Array.isArray((demoCfg?.payload as { telefones?: unknown })?.telefones)
    ? ((demoCfg!.payload as { telefones: unknown[] }).telefones.map(String))
    : [];

  let leadsDemo: LeadDemo[] = [];
  if (telefonesDemo.length > 0) {
    const { data } = await supabase
      .schema("core")
      .from("lead")
      .select("lead_id, nome, telefone")
      .in("telefone", telefonesDemo);
    leadsDemo = (data ?? []) as LeadDemo[];
  }

  const historico: VersaoPrompt[] = (versoes ?? []).map((v) => {
    const p = (v.payload ?? {}) as Record<string, unknown>;
    return {
      versao: Number(p["versao_nova"] ?? 0),
      justificativa: typeof p["justificativa"] === "string" ? p["justificativa"] : null,
      prompt: typeof p["prompt_novo"] === "string" ? (p["prompt_novo"] as string) : "",
      ator: String(v.ator ?? ""),
      em: String(v.criado_em ?? ""),
    };
  });

  const cfg = (agente?.config_jsonb ?? {}) as Record<string, unknown>;
  const followup = (cfg["followup"] ?? {}) as Record<string, unknown>;
  const horario = (followup["horario_comercial"] ?? {}) as Record<string, unknown>;

  return (
    <PainelClara
      gestor={papel === "admin" || papel === "owner"}
      ativa={agente?.ativo === true}
      prompt={agente?.prompt_sistema ?? ""}
      promptVersao={Number(agente?.prompt_versao ?? 1)}
      followup={{
        ativo: followup["ativo"] !== false,
        janelasMin: Array.isArray(followup["janelas_min"])
          ? (followup["janelas_min"] as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)
          : [120, 240, 480, 960],
        inicio: Number.isFinite(Number(horario["inicio"])) ? Number(horario["inicio"]) : 8,
        fim: Number.isFinite(Number(horario["fim"])) ? Number(horario["fim"]) : 20,
        // modo demo SÓ com a marca explícita na config (mesma régua do parseConfigFollowup do
        // runtime) — o painel usa isso pra mostrar quando o salvo diverge do que roda.
        modo: followup["modo"] === "demo" ? "demo" : "producao",
      }}
      historico={historico}
      telefonesDemo={telefonesDemo}
      leadsDemo={leadsDemo}
    />
  );
}
