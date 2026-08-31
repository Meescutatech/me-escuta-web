import { fraseNotificacao, nomeDoAtor, type Notificacao } from "../../lib/notificacoes.ts";

/**
 * Regras do sino que a F8 acrescentou (0306/0307), PURAS — o item e o sino só formatam.
 *
 * ENCOLHEU em 31/08, como este comentário previa. Ele dizia: "o tipo `especie` de
 * `lib/notificacoes.ts` é uma união fechada de três valores; este arquivo lê o quarto SEM alargar
 * o tipo alheio; quando a união for alargada lá, isto encolhe." A união foi alargada (`Especie`,
 * com `tarefa_vencendo` e `cobertura_atribuicao_degradada`), então o tipo local `EspecieF8` e o
 * atalho `especieDe(n)` — que só existiam para reler `n.especie as string` — saíram. Lê-se
 * `n.especie` direto, e agora o compilador cobra cada espécie nova em vez de deixá-la virar
 * `string`.
 */

/**
 * ⚠️ PROTEÇÃO ACIDENTAL, e ela é a mesma em três lugares: aqui, em `chaveLeitura` abaixo e em
 * `app/(app)/notificacoes/actions.ts:79-80` (`marcarTodasLidas`). O alarme só fica de fora da
 * leitura de tarefa porque hoje ele chega com `tarefa_id` nulo — nenhum dos três testa a ESPÉCIE.
 * No dia em que uma espécie sem semântica de tarefa trouxer `tarefa_id`, as três caem juntas: o
 * alarme ganharia botão Concluir e chave `tarefa:<id>:<especie>`. O conserto é trocar o teste por
 * `ehEspecieDeTarefa(n.especie)` nos três; fica registrado, não feito agora — mexer no caminho de
 * leitura sem um caso real é reescrever o que não está quebrado.
 */
export function ehTarefa(n: Notificacao): boolean {
  return n.tarefa_id != null && n.especie !== "mencao";
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
  const esp = n.especie;
  if (esp === "tarefa_vencendo") {
    return { forte: "Tarefa vence em breve", resto: n.titulo ? ` — ${n.titulo}` : "" };
  }
  if (esp === "tarefa_atribuida" && criadaPorAgente(n)) {
    return { forte: nomeDoAgente(n), resto: " criou uma tarefa para você" };
  }
  if (esp === "tarefa_vencida" || esp === "tarefa_atribuida" || esp === "mencao") return fraseNotificacao(n);
  // Alarme e qualquer espécie que a view venha a devolver antes deste cliente saber dela: mostra o
  // título, nunca esconde. Continua valendo com a união alargada — o servidor pode ir na frente do
  // cliente em produção, então isto NÃO é código morto por o tipo agora ser fechado.
  return { forte: n.titulo ?? nomeDoAtor(n), resto: "" };
}

/** A chave que o evento `notificacao_lida` grava — tem a ESPÉCIE, para "vencendo" não herdar leitura. */
export function chaveLeitura(n: Notificacao): string | null {
  if (!ehTarefa(n)) return null;
  return `tarefa:${n.tarefa_id}:${n.especie}`;
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
