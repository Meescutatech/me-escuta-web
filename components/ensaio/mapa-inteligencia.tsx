"use client";

import { useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { AgenteEnsaio, Autonomia } from "@/lib/ensaio/fixtures/agentes";
import type { CanalEnsaio } from "@/lib/ensaio/fixtures/canais";
import { formatarE164 } from "@/lib/ensaio/fixtures/canais";
import { CascaConfig } from "./casca-config";
import { SheetAgente } from "./agentes";

/**
 * O MAPA DA INTELIGÊNCIA (Diogo, 22:00): "um fluxo visual que conecta tudo — números, agentes,
 * quem valida e o que sai". Canvas tipo n8n/Make, mas Notion-minimalista: quatro colunas, nós
 * como cartões, arestas em bezier com rótulo curto. Estático em SVG, sem lib. Nós de agente
 * abrem a mesma sheet dos cards.
 *
 * O que o desenho AFIRMA (e é o mapa de validadores do PRD, não invenção):
 *  · o dado entra pelos NÚMEROS: o Kommo · Oficial (WABA, produção) alimenta a Clara; os Lites são
 *    estritos — a fono e a Sara atendem direto, sem agente na frente;
 *  · a Clara age sozinha na resposta (verde) e PROPÕE agendamento/transbordo para a Sara (navy);
 *  · o Jarvis lê TODA conversa e cria tarefa direto (D62) para o dono do lead ou a gestora;
 *  · Levindo e Priscila só propõem — quem valida é o COO (crédito e cobrança nunca sozinhos);
 *  · as SAÍDAS são eventos do ledger: mensagem, tarefa, proposta de crédito, cobrança.
 *
 * Cores = as três da casa: verde (age sozinho), navy (propõe → validação humana), cinza (dado
 * entrando). Agente desligado aparece apagado, com as arestas tracejadas — o mapa diz a verdade
 * do estado, não o desenho ideal.
 */

type Coluna = "canal" | "agente" | "pessoa" | "saida";

interface NoMapa {
  id: string;
  coluna: Coluna;
  titulo: string;
  sub: string;
  y: number;
  agente?: AgenteEnsaio["chave"];
  apagado?: boolean;
}

interface Aresta {
  de: string;
  para: string;
  tipo: "dado" | "auto" | "propor";
  rotulo?: string;
  apagada?: boolean;
}

const X: Record<Coluna, number> = { canal: 20, agente: 330, pessoa: 640, saida: 950 };
const W = 210;
const H = 62;

export function MapaInteligencia({
  agentes: iniciais,
  canais,
  gestao,
  agoraIso,
}: {
  agentes: AgenteEnsaio[];
  canais: CanalEnsaio[];
  gestao: boolean;
  agoraIso: string;
}) {
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [agentes, setAgentes] = useState(iniciais);
  const [abertoChave, setAbertoChave] = useState<AgenteEnsaio["chave"] | null>(null);
  const aberto = agentes.find((a) => a.chave === abertoChave) ?? null;
  const ag = (c: AgenteEnsaio["chave"]) => agentes.find((a) => a.chave === c)!;

  const ligar = (chave: AgenteEnsaio["chave"], ativo: boolean) => {
    const a = ag(chave);
    if (ativo && a.pendencias.length > 0) {
      toast.error(`${a.nome} ainda não pode ser ligado.`, { description: a.pendencias[0] });
      return;
    }
    setAgentes((xs) => xs.map((x) => (x.chave === chave ? { ...x, ativo } : x)));
    toast(ativo ? `${a.nome} ligado.` : `${a.nome} desligado.`);
  };
  const mudarAutonomia = (chave: AgenteEnsaio["chave"], cap: string, autonomia: Autonomia) => {
    setAgentes((xs) =>
      xs.map((x) => (x.chave === chave ? { ...x, capacidades: x.capacidades.map((c) => (c.chave === cap ? { ...c, autonomia } : c)) } : x)),
    );
    toast.success("Autonomia publicada.");
  };

  const oficial = canais.find((c) => c.provedor === "waba");
  const liteSara = canais.find((c) => c.canal_id === "lite:sara");
  const liteFono = canais.find((c) => c.canal_id === "lite:ana-paula");

  const nos: NoMapa[] = [
    { id: "c_oficial", coluna: "canal", titulo: oficial?.apelido ?? "Kommo · Oficial", sub: `${oficial ? formatarE164(oficial.numero_e164) : ""} · oficial · produção`, y: 40 },
    { id: "c_sara", coluna: "canal", titulo: liteSara?.apelido ?? "lite:sara", sub: `${liteSara ? formatarE164(liteSara.numero_e164) : ""} · Lite · estrito`, y: 250 },
    { id: "c_fono", coluna: "canal", titulo: liteFono?.apelido ?? "lite:ana-paula", sub: `${liteFono ? formatarE164(liteFono.numero_e164) : ""} · Lite · estrito`, y: 350 },
    { id: "c_asaas", coluna: "canal", titulo: "Asaas", sub: "parcelas a vencer e em atraso", y: 480, apagado: !ag("priscila").ativo },
    { id: "a_clara", coluna: "agente", titulo: "Clara", sub: "primeira resposta · qualifica", y: 40, agente: "clara", apagado: !ag("clara").ativo },
    { id: "a_jarvis", coluna: "agente", titulo: "Jarvis", sub: "lê toda conversa · prioriza", y: 160, agente: "jarvis", apagado: !ag("jarvis").ativo },
    { id: "a_levindo", coluna: "agente", titulo: "Levindo", sub: "crédito · só propõe", y: 380, agente: "levindo", apagado: !ag("levindo").ativo },
    { id: "a_priscila", coluna: "agente", titulo: "Priscila", sub: "cobrança · só propõe", y: 480, agente: "priscila", apagado: !ag("priscila").ativo },
    { id: "p_sara", coluna: "pessoa", titulo: "Sara", sub: "gestora de Pré-venda · valida a Clara", y: 130 },
    { id: "p_fono", coluna: "pessoa", titulo: "Ana Paula", sub: "fonoaudióloga · Clínico", y: 300 },
    { id: "p_coo", coluna: "pessoa", titulo: "COO", sub: "Diogo Vidigal · valida crédito e cobrança", y: 430 },
    { id: "s_msg", coluna: "saida", titulo: "Mensagem ao cliente", sub: "mensagem_enviada", y: 40 },
    { id: "s_tarefa", coluna: "saida", titulo: "Tarefa", sub: "tarefa_criada · POR QUE + FAZER", y: 160 },
    { id: "s_agenda", coluna: "saida", titulo: "Audiometria marcada", sub: "etapa_alterada", y: 280 },
    { id: "s_credito", coluna: "saida", titulo: "Proposta de crédito", sub: "analise_credito_registrada", y: 400 },
    { id: "s_cobranca", coluna: "saida", titulo: "Cobrança", sub: "cobranca_enviada", y: 500 },
  ];

  const brutas: Aresta[] = [
    { de: "c_oficial", para: "a_clara", tipo: "dado", rotulo: "mensagem recebida" },
    { de: "c_oficial", para: "a_jarvis", tipo: "dado" },
    { de: "c_sara", para: "p_sara", tipo: "dado", rotulo: "direto, sem agente" },
    { de: "c_sara", para: "a_jarvis", tipo: "dado" },
    { de: "c_fono", para: "p_fono", tipo: "dado", rotulo: "direto, sem agente" },
    { de: "c_asaas", para: "a_priscila", tipo: "dado", rotulo: "atraso" },
    { de: "a_clara", para: "s_msg", tipo: "auto", rotulo: "responde sozinha" },
    { de: "a_clara", para: "p_sara", tipo: "propor", rotulo: "propõe agendar · transborda" },
    { de: "a_jarvis", para: "s_tarefa", tipo: "auto", rotulo: "cria direto para o dono ou a gestora" },
    { de: "p_sara", para: "s_agenda", tipo: "propor", rotulo: "aceita ou ajusta" },
    { de: "p_sara", para: "s_msg", tipo: "propor" },
    { de: "p_fono", para: "s_msg", tipo: "propor" },
    { de: "a_levindo", para: "p_coo", tipo: "propor", rotulo: "score + faixa" },
    { de: "p_coo", para: "s_credito", tipo: "propor", rotulo: "decide" },
    { de: "a_priscila", para: "p_coo", tipo: "propor", rotulo: "régua" },
    { de: "p_coo", para: "s_cobranca", tipo: "propor" },
  ];
  const arestas: Aresta[] = brutas.map((a) => ({
    ...a,
    apagada: nos.find((n) => n.id === a.de)?.apagado || nos.find((n) => n.id === a.para)?.apagado,
  }));

  const porId = new Map(nos.map((n) => [n.id, n]));
  const ligados = agentes.filter((a) => a.ativo).length;

  return (
    <CascaConfig
      largo
      titulo="Mapa"
      descricao="Por onde o dado entra, qual agente lê, quem valida e o que sai — o desenho inteiro da operação com IA. Clique num agente para ver o fluxo dele, a autonomia e o prompt."
    >
      <div className="flex items-center gap-4 text-ui-12 text-muted-foreground">
        <Legenda cor="bg-muted-foreground" texto="dado entrando" />
        <Legenda cor="bg-success-ink" texto="age sozinho" />
        <Legenda cor="bg-navy" texto="propõe → validação humana" />
        <span className="ml-auto tabular-nums">
          {canais.filter((c) => c.ativo).length} números · {ligados} de {agentes.length} agentes ligados
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-[radial-gradient(circle,_var(--border)_1px,_transparent_1px)] bg-card [background-size:18px_18px] p-4">
        <svg viewBox="0 0 1180 580" className="mx-auto block h-auto w-full min-w-[900px]" role="img" aria-label="Mapa: números, agentes, validadoras e saídas">
          <defs>
            <marker id="m-dado" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" className="fill-muted-foreground" />
            </marker>
            <marker id="m-auto" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" className="fill-success-ink" />
            </marker>
            <marker id="m-propor" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" className="fill-navy" />
            </marker>
          </defs>

          {/* cabeçalhos de coluna */}
          {(
            [
              ["canal", "Por onde entra"],
              ["agente", "Quem lê e decide"],
              ["pessoa", "Quem valida"],
              ["saida", "O que sai (evento)"],
            ] as Array<[Coluna, string]>
          ).map(([c, r]) => (
            <text key={c} x={X[c] + W / 2} y={18} textAnchor="middle" className="fill-muted-foreground text-[11px] font-semibold uppercase tracking-[0.08em]">
              {r}
            </text>
          ))}

          {/* arestas primeiro, para ficarem atrás dos nós */}
          {arestas.map((a, i) => {
            const de = porId.get(a.de)!;
            const para = porId.get(a.para)!;
            const x1 = X[de.coluna] + W;
            const y1 = de.y + H / 2;
            const x2 = X[para.coluna];
            const y2 = para.y + H / 2;
            const dx = Math.max(60, (x2 - x1) / 2);
            const d = `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
            const classe = a.tipo === "auto" ? "stroke-success-ink" : a.tipo === "propor" ? "stroke-navy" : "stroke-muted-foreground/70";
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            return (
              <g key={i} className={cn(a.apagada && "opacity-30")}>
                <path d={d} className={cn("fill-none", classe)} strokeWidth={a.tipo === "dado" ? 1.4 : 1.8} strokeDasharray={a.apagada ? "4 4" : undefined} markerEnd={`url(#m-${a.tipo})`} />
                {a.rotulo && (
                  <g>
                    <rect x={mx - a.rotulo.length * 3.1 - 5} y={my - 9} width={a.rotulo.length * 6.2 + 10} height={17} rx={8} className="fill-card" />
                    <text x={mx} y={my + 3.5} textAnchor="middle" className={cn("text-[10px]", a.tipo === "auto" ? "fill-success-ink" : a.tipo === "propor" ? "fill-navy" : "fill-muted-foreground")}>
                      {a.rotulo}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {nos.map((n) => {
            const x = X[n.coluna];
            const clicavel = !!n.agente;
            const borda =
              n.coluna === "agente" ? "stroke-navy" : n.coluna === "pessoa" ? "stroke-navy/60" : n.coluna === "saida" ? "stroke-foreground/70" : "stroke-input";
            return (
              <g
                key={n.id}
                transform={`translate(${x}, ${n.y})`}
                className={cn(n.apagado && "opacity-45", clicavel && "cursor-pointer")}
                onClick={() => n.agente && setAbertoChave(n.agente)}
                role={clicavel ? "button" : undefined}
                tabIndex={clicavel ? 0 : undefined}
                onKeyDown={(e) => clicavel && (e.key === "Enter" || e.key === " ") && setAbertoChave(n.agente!)}
                aria-label={clicavel ? `Abrir ${n.titulo}` : undefined}
              >
                <rect width={W} height={H} rx={12} className={cn("fill-card", borda)} strokeWidth={n.coluna === "agente" ? 1.6 : 1} />
                {n.coluna === "agente" && (
                  <circle cx={22} cy={H / 2} r={9} className={cn(n.apagado ? "fill-muted" : "fill-success-tint")} />
                )}
                {n.coluna === "agente" && (
                  <circle cx={22} cy={H / 2} r={3} className={cn(n.apagado ? "fill-muted-foreground" : "fill-success-ink")} />
                )}
                <text x={n.coluna === "agente" ? 40 : 14} y={26} className="fill-foreground text-[13px] font-semibold">
                  {n.titulo}
                </text>
                <text x={n.coluna === "agente" ? 40 : 14} y={44} className="fill-muted-foreground text-[10.5px]">
                  {n.sub.length > 36 ? n.sub.slice(0, 35) + "…" : n.sub}
                </text>
                {clicavel && (
                  <text x={W - 12} y={26} textAnchor="end" className="fill-muted-foreground text-[10px]">
                    abrir ›
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-ui-12 leading-relaxed text-muted-foreground">
        Agente apagado está desligado — as arestas dele ficam tracejadas. Crédito e cobrança nunca chegam à saída sem passar pelo COO; é a Constituição, não uma escolha de tela.
      </p>

      <SheetAgente agente={aberto} gestao={gestao} agora={agora} onFechar={() => setAbertoChave(null)} onLigar={ligar} onMudarAutonomia={mudarAutonomia} />
    </CascaConfig>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-0.5 w-5 rounded-full", cor)} aria-hidden />
      {texto}
    </span>
  );
}
