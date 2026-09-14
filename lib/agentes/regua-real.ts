/**
 * A RÉGUA DE AUTONOMIA COM O DADO DO BANCO — parte PURA (sem I/O, provável com `node --test`).
 *
 * 14/09/2026. Até aqui a régua da tela real mostrava as CAPACIDADES DA FIXTURE
 * (`lib/ensaio/fixtures/agentes.ts`): para o Jarvis, `criar_tarefa · priorizar · atribuir ·
 * arquivar_lead`. Medido em produção no mesmo dia, o catálogo vigente
 * (`core.v_config_vigente` nome `capacidade_agente`) tem 15 chaves e **três dessas quatro não
 * estão nele**. Enquanto a régua era leitura isso era só enfeite errado; no minuto em que ela
 * grava, vira clique que a porta recusa com "capacidade não existe no catálogo vigente".
 *
 * Então as linhas passam a sair do BANCO, e de duas fontes que precisam casar:
 *
 *   · `core.agente.autonomia_jsonb`  → QUAIS capacidades este agente tem, e em que nível.
 *     Só as chaves presentes. Ausência não é `proibido`: para o runtime
 *     (`src/clara/autonomia.ts`, `nivelDe`) chave ausente vale `propor`, que é um terceiro
 *     estado. Inventar uma linha "desligado" para ela seria afirmar algo que o banco não diz.
 *   · `core.v_config_vigente` → o catálogo (rótulo, descrição, ordem, ativo) e os TETOS
 *     (`flag.teto_autonomia`), que decidem se a linha tem interruptor.
 *
 * O TETO é o que separa "dá para ligar" de "não dá": `core.teto_capacidade` devolve `propor`
 * quando não há linha de teto — fail-closed —, e `api.registrar_evento` recusa `auto` para
 * qualquer capacidade cujo teto não seja `auto`. A leitura aqui espelha essa regra, para a tela
 * não oferecer o botão que o banco vai recusar.
 */

import type { LinhaAutonomia, TetoAutonomia } from "@/components/jarvis/regua-autonomia";

export interface CapacidadeCatalogo {
  chave: string;
  rotulo: string;
  descricao: string;
  ordem: number;
  ativo: boolean;
}

export interface TetoCatalogo {
  chave: string;
  teto_nivel: string;
  fundamento: string;
}

export interface CatalogoAutonomia {
  capacidades: CapacidadeCatalogo[];
  tetos: TetoCatalogo[];
  /** `false` quando a leitura do catálogo falhou — e aí TUDO fica em leitura (fail-closed). */
  lido: boolean;
}

export const CATALOGO_INDISPONIVEL: CatalogoAutonomia = { capacidades: [], tetos: [], lido: false };

const NIVEIS = ["auto", "propor", "proibido"] as const;

export const FUNDAMENTO_SEM_CATALOGO =
  "Não deu para ler o catálogo de capacidades agora, então nada aqui aceita mudança: a porta " +
  "recusa capacidade fora do catálogo vigente, e oferecer o clique seria prometer uma recusa.";

export const FUNDAMENTO_FORA_DO_CATALOGO =
  "Esta chave está gravada no agente mas NÃO está no catálogo vigente (ou está inativa). A porta " +
  "recusa alterá-la — o projetor só faz merge e não sabe apagar chave, então ela fica visível e " +
  "inerte até uma migration tirá-la. É o caso de `enviar_mensagem` na Clara.";

export const FUNDAMENTO_TETO_AUSENTE =
  "Sem linha de teto declarada, `core.teto_capacidade` devolve `propor` — fail-closed. Não dá " +
  "para pôr em automático por esta tela enquanto o teto não for declarado.";

/** O nível cru do jsonb, normalizado. Fora do vocabulário vale `propor`, como o runtime faz. */
export function nivelDoJsonb(bruto: unknown): LinhaAutonomia["nivel"] {
  if (typeof bruto !== "string") return "propor";
  const v = bruto.trim().toLowerCase();
  return (NIVEIS as readonly string[]).includes(v) ? (v as LinhaAutonomia["nivel"]) : "propor";
}

/**
 * O teto da capacidade, no MESMO fail-closed de `core.teto_capacidade`: sem linha, `propor`.
 *
 * ⚠️ `teto_nivel` pode valer `proibido` no catálogo (o CHECK do banco aceita os três). Para esta
 * tela só importa a pergunta binária "cabe `auto`?", então qualquer coisa diferente de `auto`
 * vira `propor` — que é o valor que a régua usa para dizer "sem interruptor".
 */
export function tetoDa(chave: string, tetos: TetoCatalogo[]): TetoAutonomia {
  const t = tetos.find((x) => x.chave === chave);
  return t?.teto_nivel === "auto" ? "auto" : "propor";
}

export function fundamentoDe(chave: string, tetos: TetoCatalogo[]): string {
  const t = tetos.find((x) => x.chave === chave);
  return t?.fundamento?.trim() ? t.fundamento.trim() : FUNDAMENTO_TETO_AUSENTE;
}

/**
 * As linhas da régua de UM agente.
 *
 * Ordem: a do catálogo (`ordem`), e o que não está no catálogo vai para o fim — é justamente o
 * que ninguém pode mexer, então não disputa o topo da lista.
 *
 * `travada` aqui quer dizer "sem interruptor", e cobre três motivos diferentes, cada um com o
 * seu fundamento escrito: teto constitucional, chave fora do catálogo, catálogo ilegível.
 */
export function linhasDaReguaReal(
  autonomiaJsonb: Record<string, unknown> | null | undefined,
  catalogo: CatalogoAutonomia,
): LinhaAutonomia[] {
  const mapa = autonomiaJsonb && typeof autonomiaJsonb === "object" ? autonomiaJsonb : {};
  const noCatalogo = new Map(catalogo.capacidades.filter((c) => c.ativo).map((c) => [c.chave, c]));

  const linhas: LinhaAutonomia[] = Object.keys(mapa).map((chave) => {
    const cap = noCatalogo.get(chave);
    const nivel = nivelDoJsonb(mapa[chave]);

    if (!catalogo.lido) {
      return {
        chave,
        rotulo: cap?.rotulo ?? chave,
        descricao: cap?.descricao ?? "",
        nivel,
        teto: "propor",
        fundamento: FUNDAMENTO_SEM_CATALOGO,
        travada: true,
        alteradaPor: null,
      };
    }
    if (!cap) {
      return {
        chave,
        rotulo: chave,
        descricao: "Chave gravada no agente, fora do catálogo vigente.",
        nivel,
        teto: "propor",
        fundamento: FUNDAMENTO_FORA_DO_CATALOGO,
        travada: true,
        alteradaPor: null,
      };
    }
    const teto = tetoDa(chave, catalogo.tetos);
    return {
      chave,
      rotulo: cap.rotulo,
      descricao: cap.descricao,
      nivel,
      teto,
      fundamento: fundamentoDe(chave, catalogo.tetos),
      travada: teto !== "auto",
      alteradaPor: null,
    };
  });

  const ordemDe = (chave: string) => noCatalogo.get(chave)?.ordem ?? Number.MAX_SAFE_INTEGER;
  return linhas.sort((a, b) => ordemDe(a.chave) - ordemDe(b.chave) || a.chave.localeCompare(b.chave));
}

/** O payload de `core.v_config_vigente` → catálogo, tolerante ao que vier torto. */
export function lerCatalogo(
  payloadCapacidades: unknown,
  payloadTetos: unknown,
): CatalogoAutonomia {
  const capacidades: CapacidadeCatalogo[] = [];
  const bruto = (payloadCapacidades as { capacidades?: unknown } | null)?.capacidades;
  if (Array.isArray(bruto)) {
    for (const c of bruto) {
      if (!c || typeof c !== "object") continue;
      const o = c as Record<string, unknown>;
      const chave = typeof o.chave === "string" ? o.chave : "";
      if (!chave) continue;
      capacidades.push({
        chave,
        rotulo: typeof o.rotulo === "string" && o.rotulo ? o.rotulo : chave,
        descricao: typeof o.descricao === "string" ? o.descricao : "",
        ordem: Number.isFinite(Number(o.ordem)) ? Number(o.ordem) : Number.MAX_SAFE_INTEGER,
        ativo: o.ativo !== false,
      });
    }
  }

  const tetos: TetoCatalogo[] = [];
  const brutoTetos = (payloadTetos as { tetos?: unknown } | null)?.tetos;
  if (Array.isArray(brutoTetos)) {
    for (const t of brutoTetos) {
      if (!t || typeof t !== "object") continue;
      const o = t as Record<string, unknown>;
      const chave = typeof o.chave === "string" ? o.chave : "";
      if (!chave) continue;
      tetos.push({
        chave,
        teto_nivel: typeof o.teto_nivel === "string" ? o.teto_nivel : "",
        fundamento: typeof o.fundamento === "string" ? o.fundamento : "",
      });
    }
  }

  // catálogo vazio NÃO é catálogo lido: sem capacidade nenhuma, toda linha do agente cairia em
  // "fora do catálogo" e a tela acusaria dívida que não existe. Fail-closed com o motivo certo.
  if (capacidades.length === 0) return CATALOGO_INDISPONIVEL;
  return { capacidades, tetos, lido: true };
}

/**
 * Uma pessoa que pode receber a tarefa quando não há dono claro — `core.v_membro` ativos, no
 * formato mínimo da tela.
 *
 * Mora AQUI, e não no componente, por causa da direção do import: `lib/dados/agentes.ts` precisa
 * do tipo, e um módulo de dados (servidor) puxando tipo de um componente `use client` inverte a
 * seta que o portão `cliente` da Web-B guarda. `import type` é apagado na compilação e não
 * quebraria nada hoje — mas a seta certa é a que sobrevive ao dia em que alguém tirar o `type`.
 */
export interface MembroEscolhivel {
  id: string;
  nome: string;
  papel: string;
}

/** O uuid do responsável padrão gravado em `config_jsonb`, ou `null`. */
export function responsavelPadraoDe(configJsonb: unknown): string | null {
  if (!configJsonb || typeof configJsonb !== "object") return null;
  const v = (configJsonb as Record<string, unknown>).responsavel_padrao;
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
