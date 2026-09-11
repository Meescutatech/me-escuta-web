import { cn } from "@/lib/utils";
import type { AgenteEnsaio } from "@/lib/ensaio/fixtures/agentes";

/**
 * FLUXOGRAMA DO AGENTE — SVG estático, leve, sem lib (pedido do Diogo 10/09: "só para impressionar",
 * referência da IDEIA em LiderHub `.agent/Decisions/0047-flow-builder-xyflow-flow-json.md`).
 *
 * É o mesmo desenho para todo agente, porque é a mesma casca (Constituição §1.2): um GATILHO
 * acorda o agente → ele LÊ o contexto → DECIDE com o prompt → e aqui o caminho bifurca por
 * capacidade: o que está em `auto` AGE e vira evento direto; o que está em `propor` cria uma
 * SUGESTÃO que espera VALIDAÇÃO humana antes de virar evento. O que muda por agente são os textos
 * dos nós e QUAIS capacidades passam por cada ramo — e é isso que o desenho mostra.
 *
 * Coordenadas fixas num viewBox 920×300; `width: 100%` faz o resto. Sem foreignObject: texto em
 * `<text>` com no máximo 2 linhas curtas por nó. Cores: nós em `card` com hairline; o ramo
 * humano usa o navy; o ramo automático, o verde do preset; o evento, a tinta.
 */

interface No {
  x: number;
  y: number;
  w: number;
  h: number;
  titulo: string;
  linhas: string[];
  tom?: "neutro" | "humano" | "auto" | "evento";
}

const TEXTOS: Record<AgenteEnsaio["chave"], { gatilho: string[]; contexto: string[]; decide: string[]; evento: string[] }> = {
  clara: {
    gatilho: ["mensagem recebida", "no número CLARA"],
    contexto: ["fio da conversa, etapa,", "ficha e horário"],
    decide: ["prompt v7 · Claude", "uma pergunta por vez"],
    evento: ["mensagem_enviada", "etapa_alterada · transbordo"],
  },
  jarvis: {
    gatilho: ["mensagem sem resposta,", "lead parado, prazo perto"],
    contexto: ["funil inteiro, tarefas", "abertas, quem é o dono"],
    decide: ["prompt v3 · regras", "de prioridade"],
    evento: ["tarefa_criada", "tarefa_repactuada"],
  },
  levindo: {
    gatilho: ["lead chega à", "proposta"],
    contexto: ["bureau, histórico,", "clínico, estrutura"],
    decide: ["Política Comercial v3", "score 0–100 · faixa A–E"],
    evento: ["analise_credito_registrada", "(após decisão humana)"],
  },
  priscila: {
    gatilho: ["parcela a vencer", "ou em atraso (Asaas)"],
    contexto: ["cliente, parcelas,", "contatos anteriores"],
    decide: ["régua 3 · 0 · 5 · 15 · 30", "tom: cliente, não devedor"],
    evento: ["cobranca_enviada", "regua_pausada"],
  },
};

export function FluxoAgente({ agente, className }: { agente: AgenteEnsaio; className?: string }) {
  const t = TEXTOS[agente.chave];
  const auto = agente.capacidades.filter((c) => c.autonomia === "auto").map((c) => c.rotulo);
  const propor = agente.capacidades.filter((c) => c.autonomia === "propor").map((c) => c.rotulo);
  const desligadas = agente.capacidades.filter((c) => c.autonomia === "desligado").map((c) => c.rotulo);

  const nos: Record<string, No> = {
    gatilho: { x: 10, y: 110, w: 150, h: 78, titulo: "Gatilho", linhas: t.gatilho },
    contexto: { x: 200, y: 110, w: 150, h: 78, titulo: "Lê o contexto", linhas: t.contexto },
    decide: { x: 390, y: 110, w: 150, h: 78, titulo: "Decide", linhas: t.decide },
    age: { x: 590, y: 30, w: 160, h: 78, titulo: "Age sozinho", linhas: recortar(auto, 2), tom: "auto" },
    propoe: { x: 590, y: 190, w: 160, h: 78, titulo: "Propõe", linhas: recortar(propor, 2), tom: "humano" },
    valida: { x: 590, y: 110, w: 160, h: 0, titulo: "", linhas: [] },
    evento: { x: 790, y: 110, w: 120, h: 78, titulo: "Evento", linhas: t.evento, tom: "evento" },
  };

  return (
    <figure className={cn("w-full", className)}>
      <svg viewBox="0 0 920 300" className="block h-auto w-full" role="img" aria-label={`Fluxo do agente ${agente.nome}`}>
        <defs>
          <marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="fill-muted-foreground" />
          </marker>
          <marker id="seta-auto" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="fill-success-ink" />
          </marker>
          <marker id="seta-humano" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="fill-navy" />
          </marker>
        </defs>

        {/* trilho principal */}
        <Seta de={nos.gatilho} para={nos.contexto} />
        <Seta de={nos.contexto} para={nos.decide} />
        {/* bifurcação: decide → age (auto) e decide → propõe (humano) */}
        <path d={`M540 149 C565 149 565 69 590 69`} className="fill-none stroke-success-ink" strokeWidth={1.6} markerEnd="url(#seta-auto)" />
        <path d={`M540 149 C565 149 565 229 590 229`} className="fill-none stroke-navy" strokeWidth={1.6} markerEnd="url(#seta-humano)" />
        {/* age → evento (direto) */}
        <path d={`M750 69 C770 69 770 149 790 149`} className="fill-none stroke-success-ink" strokeWidth={1.6} markerEnd="url(#seta-auto)" />
        {/* propõe → validação humana → evento */}
        <path d={`M750 229 C770 229 770 149 790 149`} className="fill-none stroke-navy" strokeWidth={1.6} markerEnd="url(#seta-humano)" />

        <Caixa no={nos.gatilho} />
        <Caixa no={nos.contexto} />
        <Caixa no={nos.decide} />
        <Caixa no={nos.age} />
        <Caixa no={nos.propoe} />
        <Caixa no={nos.evento} />

        {/* rótulos dos ramos */}
        <text x={565} y={98} textAnchor="middle" className="fill-success-ink text-[10px] font-semibold">auto</text>
        <text x={565} y={212} textAnchor="middle" className="fill-navy text-[10px] font-semibold">propor</text>
        {/* a validação humana mora NO ramo, não é um nó: é a pessoa aceitando ou ajustando a sugestão */}
        <g transform="translate(770, 262)">
          <rect x={-88} y={-11} width={176} height={22} rx={11} className="fill-card stroke-navy" strokeWidth={1.2} />
          <text x={0} y={4} textAnchor="middle" className="fill-navy text-[10.5px] font-semibold">validação humana antes do evento</text>
        </g>
        {desligadas.length > 0 && (
          <text x={670} y={292} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            nunca sozinho: {desligadas.join(" · ")}
          </text>
        )}
      </svg>
    </figure>
  );
}

function recortar(itens: string[], max: number): string[] {
  if (itens.length === 0) return ["—"];
  if (itens.length <= max) return itens;
  return [...itens.slice(0, max - 1), `+${itens.length - (max - 1)} outras`];
}

function Seta({ de, para }: { de: No; para: No }) {
  const y = de.y + de.h / 2;
  return <path d={`M${de.x + de.w} ${y} L${para.x} ${y}`} className="fill-none stroke-muted-foreground" strokeWidth={1.6} markerEnd="url(#seta)" />;
}

function Caixa({ no }: { no: No }) {
  const tom = no.tom ?? "neutro";
  const cx = no.x + no.w / 2;
  return (
    <g>
      <rect
        x={no.x}
        y={no.y}
        width={no.w}
        height={no.h}
        rx={10}
        className={cn(
          "fill-card",
          tom === "auto" && "stroke-success-ink",
          tom === "humano" && "stroke-navy",
          tom === "evento" && "stroke-foreground",
          tom === "neutro" && "stroke-input",
        )}
        strokeWidth={tom === "neutro" ? 1 : 1.5}
      />
      <text x={cx} y={no.y + 22} textAnchor="middle" className={cn("text-[12px] font-semibold", tom === "auto" ? "fill-success-ink" : tom === "humano" ? "fill-navy" : "fill-foreground")}>
        {no.titulo}
      </text>
      {no.linhas.map((l, i) => (
        <text key={i} x={cx} y={no.y + 42 + i * 15} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">
          {l.length > 30 ? l.slice(0, 29) + "…" : l}
        </text>
      ))}
    </g>
  );
}
