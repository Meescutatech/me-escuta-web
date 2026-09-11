import { criarClienteServidor } from "@/lib/supabase/server";
import { lerCanais } from "@/components/configuracoes/dados/canais";
import type { CanalEscolhivel } from "@/components/clara/canais-da-clara";
import { PainelClara, type VersaoPrompt, type LeadDemo } from "@/components/clara/painel-clara";
import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";

export const dynamic = "force-dynamic";

/**
 * Configurações > Clara (SPEC-CLARA-REPLICA-DEMO §2-bis): a sala de controle do agente.
 * Leitura direto das projeções/config via RLS; escrita SÓ por evento (actions.ts).
 * Papel de gestão vem do banco (api.papel_atual) — sem ele, a página degrada pra leitura.
 */
export default async function ClaraPage() {
  // W-D2 (2ª passada): em ensaio a Clara mora na sheet de Agentes — uma fonte só (prompt v7 da
  // fixture, sem o conflito com o "v1" de produção). Fora do ensaio, a tela antiga continua.
  if (lerSessaoEnsaio()) redirect("/configuracoes/agentes?agente=clara");

  const supabase = criarClienteServidor();

  // S12 · os canais entram no MESMO paralelo das outras leituras — a tela precisa deles para
  // responder "em qual numero ela responde", e `lerCanais` ja traz o degrade honesto (sem a view,
  // `indisponivel: true`, e a tela DIZ isso em vez de mostrar lista vazia).
  const [{ data: papel }, { data: agente }, { data: versoes }, { data: demoCfg }, lidosCanais] =
    await Promise.all([
      supabase.schema("api").rpc("papel_atual"),
      supabase
        .schema("core")
        .from("agente")
        .select("id, nome, ativo, prompt_sistema, prompt_versao, config_jsonb, escopo_leitura")
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
      lerCanais(),
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

  // S12 · so canal ATIVO entra na escolha: marcar um canal desligado seria escolher um numero
  // por onde nada chega, e a tela nao deve oferecer uma escolha que nao produz efeito.
  const canaisEscolhiveis: CanalEscolhivel[] = lidosCanais.canais
    .filter((c) => c.ativo)
    .map((c) => ({
      canal_id: c.canal_id,
      nome: c.nome,
      numero: c.numero,
      area_efetiva: c.area_efetiva,
      provedor: c.provedor,
    }));

  // `escopo_leitura.canais` como esta no banco. Ausente / nao-array = vazio = TODOS os numeros —
  // a mesma regra que o runtime aplica em `src/clara/canal.ts`, e ela tem de ser a mesma nos dois
  // lados: a tela que mostra uma regra e o worker que aplica outra e pior que nao ter tela.
  const escopo = (agente?.escopo_leitura ?? {}) as Record<string, unknown>;
  const canaisEscolhidos: string[] = Array.isArray(escopo["canais"])
    ? (escopo["canais"] as unknown[]).map(String).filter((c) => c.trim() !== "")
    : [];

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
      canais={canaisEscolhiveis}
      canaisEscolhidos={canaisEscolhidos}
      canaisLegiveis={!lidosCanais.indisponivel}
      historico={historico}
      telefonesDemo={telefonesDemo}
      leadsDemo={leadsDemo}
    />
  );
}
