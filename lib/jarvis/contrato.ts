/**
 * CONTRATO do Jarvis conversacional (F9) — cópia deliberada de `src/jarvis/conversa/tipos.ts` do
 * runtime (os repos não compartilham pacote; contrato duplicado com teste dos dois lados é mais
 * honesto do que um import que só um lado enxerga).
 *
 * E o CONTRATO COM A F4 do `?contexto=`: o header manda `encodeURIComponent(pathname + search)`;
 * aqui isso vira `{rota, busca, lead_id, conversa_id}` e uma frase para a pessoa ler.
 */

export type PapelUsuario = "owner" | "admin" | "membro" | "marketing";

export interface ContextoTela {
  rota: string;
  busca: string | null;
  lead_id: string | null;
  conversa_id: string | null;
}

export interface MensagemJarvis {
  papel: "usuario" | "jarvis";
  texto: string;
}

export interface FerramentaUsada {
  nome: string;
  resumo: string;
}

export type EventoJarvis =
  | { tipo: "texto"; delta: string }
  | { tipo: "ferramenta"; nome: string; resumo: string }
  | { tipo: "fim"; sessao_id: string; tokens: { entrada: number; saida: number }; duracao_ms: number; modelo: string }
  | { tipo: "erro"; motivo: string };

export interface PedidoJarvis {
  usuario_id: string;
  papel: PapelUsuario;
  contexto: ContextoTela;
  mensagens: MensagemJarvis[];
  sessao_id?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?contexto=` → ContextoTela. Entrada suja (não-string, não-URL) vira contexto vazio, nunca erro. */
export function interpretarContexto(bruto: string | null | undefined): ContextoTela {
  const vazio: ContextoTela = { rota: "/", busca: null, lead_id: null, conversa_id: null };
  if (!bruto || typeof bruto !== "string") return vazio;
  let decodificado = bruto;
  try {
    decodificado = decodeURIComponent(bruto);
  } catch {
    /* já vinha decodificado */
  }
  if (!decodificado.startsWith("/")) return vazio;
  const idx = decodificado.indexOf("?");
  const rota = (idx >= 0 ? decodificado.slice(0, idx) : decodificado).replace(/\/+$/, "") || "/";
  const busca = idx >= 0 ? decodificado.slice(idx) : null;
  const params = new URLSearchParams(busca ?? "");

  let lead_id: string | null = null;
  let conversa_id: string | null = null;
  const m = rota.match(/^\/lead\/([0-9a-f-]{36})$/i);
  if (m && UUID.test(m[1])) lead_id = m[1].toLowerCase();
  const l = params.get("lead");
  if (l && UUID.test(l)) lead_id = l.toLowerCase();
  const c = params.get("c") ?? params.get("conversa");
  if (c && UUID.test(c)) conversa_id = c.toLowerCase();

  return { rota, busca: busca && busca.length > 1 ? busca : null, lead_id, conversa_id };
}

/** Frase curta que a tela mostra: "Você está no funil filtrado por etapa=qualificado". */
export function fraseDoContexto(c: ContextoTela): string | null {
  const filtros = c.busca
    ? Array.from(new URLSearchParams(c.busca).entries())
        .filter(([k]) => !["lead", "c", "conversa"].includes(k))
        .map(([k, v]) => `${k}=${v}`)
    : [];
  const filtro = filtros.length ? ` filtrado por ${filtros.join(", ")}` : "";
  if (c.rota.startsWith("/lead/") || (c.rota.startsWith("/funil") && c.lead_id)) return "Você está na ficha de um lead";
  if (c.rota.startsWith("/funil")) return `Você está no funil${filtro}`;
  if (c.rota.startsWith("/conversas")) return c.conversa_id ? "Você está numa conversa" : `Você está nas conversas${filtro}`;
  if (c.rota.startsWith("/tarefas")) return `Você está nas tarefas${filtro}`;
  if (c.rota.startsWith("/marketing")) return "Você está em marketing";
  if (c.rota === "/") return "Você está no dashboard";
  return null;
}

/** Sugestões de pergunta por tela — 3, curtas, todas respondíveis pelas ferramentas de leitura. */
export function sugestoesPorContexto(c: ContextoTela, papel: PapelUsuario): string[] {
  const marketing = ["Quantos leads chegaram nos últimos 7 dias, por origem?", "Qual campanha teve o menor CPL em 30 dias?", "Quantos leads captados no mês?"];
  if (papel === "marketing") return marketing;
  if (c.lead_id) return ["Resuma este lead", "Por que este card está nessa faixa?", "Qual foi a última mensagem dele?"];
  if (c.conversa_id) return ["Resuma esta conversa", "O que ficou pendente com esse paciente?", "Há tarefa aberta para esse lead?"];
  if (c.rota.startsWith("/funil")) return ["Quantos leads estão em AGORA?", "Quem está parado há mais tempo em Qualificado?", "Quantos leads por etapa?"];
  if (c.rota.startsWith("/conversas")) return ["Quais conversas estão sem resposta nossa?", "Quantas mensagens chegaram hoje?", "Quem assumiu mais conversas na semana?"];
  if (c.rota.startsWith("/tarefas")) return ["Quantas tarefas vencidas temos?", "Quais tarefas vencem hoje?", "Quem tem mais tarefas abertas?"];
  if (c.rota.startsWith("/marketing")) return marketing;
  return ["Como está o funil hoje?", "Quantas mensagens recebemos nos últimos 7 dias?", "Quantas tarefas estão vencidas?"];
}

/** Rótulo humano do chip de ferramenta. */
export function rotuloFerramenta(nome: string): string {
  const mapa: Record<string, string> = {
    consultar_funil: "consultou o funil",
    consultar_conversa: "leu a conversa",
    consultar_tarefas: "consultou as tarefas",
    consultar_dashboard: "consultou os indicadores",
    consultar_marketing: "consultou marketing",
  };
  return mapa[nome] ?? nome.replace(/_/g, " ");
}

/** Decodifica um pedaço de SSE (pode chegar meio evento): devolve eventos completos + resto. */
export function lerEventosSse(buffer: string): { eventos: EventoJarvis[]; resto: string } {
  const partes = buffer.split("\n\n");
  const resto = partes.pop() ?? "";
  const eventos: EventoJarvis[] = [];
  for (const p of partes) {
    for (const linha of p.split("\n")) {
      if (!linha.startsWith("data: ")) continue;
      try {
        eventos.push(JSON.parse(linha.slice(6)) as EventoJarvis);
      } catch {
        /* linha corrompida: ignora, não derruba o chat */
      }
    }
  }
  return { eventos, resto };
}
