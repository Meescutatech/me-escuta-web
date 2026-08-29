import { fraseNotificacao, nomeDoAtor, type Notificacao } from "../../lib/notificacoes.ts";

/**
 * Regras do sino que a F8 acrescentou (0306/0307), PURAS — o item e o sino só formatam.
 *
 * Por que aqui e não em `lib/notificacoes.ts`: aquele módulo é de outra dona e o tipo `especie`
 * dele é uma união fechada de três valores. A view passou a devolver um quarto
 * (`tarefa_vencendo`) e um `origem_tipo` para tarefa (`jarvis_conversa`, 0298). Este arquivo
 * lê os dois SEM alargar o tipo alheio; quando a união for alargada lá, isto encolhe.
 */

/** A espécie como o banco manda — inclui o que a união antiga não conhece. */
export type EspecieF8 = "mencao" | "tarefa_atribuida" | "tarefa_vencendo" | "tarefa_vencida" | string;

export function especieDe(n: Notificacao): EspecieF8 {
  return n.especie as string;
}

export function ehTarefa(n: Notificacao): boolean {
  return n.tarefa_id != null && especieDe(n) !== "mencao";
}

/** A tarefa nasceu do Jarvis (payload `origem: jarvis_conversa`, D62) ou de qualquer agente. */
export function criadaPorAgente(n: Notificacao): boolean {
  return (n.origem_tipo ?? "").startsWith("jarvis") || (n.ator ?? "").startsWith("agente:");
}

function nomeDoAgente(n: Notificacao): string {
  if ((n.origem_tipo ?? "").startsWith("jarvis")) return "Jarvis";
  const a = (n.ator ?? "").replace(/^agente:/, "");
  return a ? a.charAt(0).toUpperCase() + a.slice(1) : "Um agente";
}

/**
 * A frase da linha 1 — o tipo vem ESCRITO, nunca por ícone (gramática do mockup v3).
 *   Jarvis criou uma tarefa para você
 *   Tarefa vence em breve — <título>
 * O resto delega para a frase que já existia.
 */
export function fraseF8(n: Notificacao): { forte: string; resto: string } {
  const esp = especieDe(n);
  if (esp === "tarefa_vencendo") {
    return { forte: "Tarefa vence em breve", resto: n.titulo ? ` — ${n.titulo}` : "" };
  }
  if (esp === "tarefa_atribuida" && criadaPorAgente(n)) {
    return { forte: nomeDoAgente(n), resto: " criou uma tarefa para você" };
  }
  if (esp === "tarefa_vencida" || esp === "tarefa_atribuida" || esp === "mencao") return fraseNotificacao(n);
  // espécie que este cliente ainda não conhece (ex.: alarme): mostra o título, nunca esconde
  return { forte: n.titulo ?? nomeDoAtor(n), resto: "" };
}

/** A chave que o evento `notificacao_lida` grava — tem a ESPÉCIE, para "vencendo" não herdar leitura. */
export function chaveLeitura(n: Notificacao): string | null {
  if (!ehTarefa(n)) return null;
  return `tarefa:${n.tarefa_id}:${especieDe(n)}`;
}

/** "vence em 40 min" / "vence em 1 h" — a linha 2 do aviso de prazo próximo. Vazio fora da janela. */
export function textoVenceEm(prazoIso: string | null, agoraMs: number): string {
  if (!prazoIso) return "";
  const ms = new Date(prazoIso).getTime() - agoraMs;
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `vence em ${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `vence em ${h} h` : `vence em ${h} h ${resto} min`;
}
