"use client";

import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MarcaJarvis } from "@/components/jarvis/marca";
import type { TarefaVisao } from "@/lib/dados/tarefas-visao-calculos";
import {
  NOMES_DOS_DIAS,
  deslocarMes,
  deslocarSemana,
  gradeDaSemana,
  gradeDoMes,
  motivoDoReplanejamento,
  porDia,
  prazoNoDia,
  rotuloMes,
  rotuloSemana,
  semPrazo,
  ymdSP,
  type DiaCalendario,
} from "@/lib/tarefas/calendario";
import { ComResumoNoHover } from "./resumo-hover";
import { OverlayArrasteTarefa, useArrasteTarefas } from "./arraste-tarefas";
import { cn } from "@/lib/utils";

/*
 * O CALENDÁRIO DE TAREFAS — a visão que mostra o VAZIO (W-T v4, 11/09).
 *
 * Lista e quadro só sabem falar do que existe. O calendário é a única das três que mostra a terça
 * sem nada ao lado da quinta com nove — e é esse contraste que faz alguém replanejar ANTES de a
 * fila estourar. Por isso arrastar aqui não é enfeite: mudar o dia é o trabalho desta tela, e ela
 * escreve pelo mesmo caminho do "Adiar" da lista (`tarefa_prazo_repactuado`, com motivo, pela
 * porta — 0037 exige motivo, e o preset É o motivo).
 *
 * Decisões que valem comentário:
 *
 * · **Mês tem sempre 6 linhas.** Setembro cabe em 5, outubro em 6; alternar entre eles mudaria a
 *   altura da grade e empurraria tudo abaixo dela. Altura fixa custa uma linha quase vazia e paga
 *   com zero layout shift.
 * · **A hora sobrevive ao arraste.** Quinta 14h arrastada para sexta continua 14h. Reescrever para
 *   09:00 apagaria a hora combinada com o paciente — o calendário mudaria um dado que ninguém
 *   pediu para mudar.
 * · **Dia no passado recusa.** Soltar ontem criaria uma tarefa nascida vencida. A célula não
 *   acende e a seta do teclado não para nela.
 * · **A gaveta "Sem prazo" é fonte, não destino.** Tarefa sem prazo não tem lugar num calendário;
 *   ela fica numa faixa em cima, de onde se arrasta para um dia. Voltar para "sem prazo" exigiria
 *   um evento que não existe (apagar prazo), e inventar não é opção.
 */

type Nomes = { membros: Map<string, string>; tipos: Map<string, string> };

const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function horaCurta(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? FMT_HORA.format(new Date(ms)) : "";
}

function tom(t: TarefaVisao, hojeYmd: string): "vencida" | "hoje" | "futura" | "fechada" {
  if (t.status !== "pendente") return "fechada";
  if (t.vencida) return "vencida";
  if (t.prazo && ymdSP(new Date(t.prazo).getTime()) === hojeYmd) return "hoje";
  return "futura";
}

export function CalendarioTarefas({
  tarefas,
  agora,
  replanejar,
  aoAbrir,
  aoMudar,
}: {
  /** já filtradas pela barra */
  tarefas: TarefaVisao[];
  agora: number;
  /** escreve o novo prazo (mesmo caminho do Adiar da lista) */
  replanejar: (t: TarefaVisao, prazoIso: string, motivo: string) => Promise<{ ok: boolean; motivo?: string }>;
  /** clique numa tarefa — a conversa do lead, como na lista */
  aoAbrir: (t: TarefaVisao) => void;
  aoMudar: () => void;
}) {
  const hojeYmd = ymdSP(agora);
  const [modo, setModo] = useState<"semana" | "mes">("mes");
  const [ancora, setAncora] = useState<string>(hojeYmd);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarTudo, setMostrarTudo] = useState<string | null>(null);

  const dias = useMemo(() => (modo === "mes" ? gradeDoMes(ancora, agora) : gradeDaSemana(ancora, agora)), [modo, ancora, agora]);
  const mapa = useMemo(() => porDia(tarefas), [tarefas]);
  const soltas = useMemo(() => semPrazo(tarefas), [tarefas]);
  const porId = useMemo(() => new Map(tarefas.map((t) => [t.id, t])), [tarefas]);

  const chavesDestino = useMemo(() => dias.map((d) => d.ymd), [dias]);

  const arr = useArrasteTarefas({
    destinos: chavesDestino,
    rotuloItem: (id) => porId.get(id)?.titulo ?? "Tarefa",
    rotuloDestino: (ymd) => `dia ${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`,
    podeSoltar: (_id, ymd) => ymd >= hojeYmd,
    onSoltar: (id, _origem, ymd) => {
      const t = porId.get(id);
      if (!t) return;
      setErro(null);
      void (async () => {
        const r = await replanejar(t, prazoNoDia(ymd, t.prazo), motivoDoReplanejamento(ymd));
        if (!r.ok) setErro(`${t.titulo}: ${r.motivo ?? "a porta recusou o novo prazo"}`);
        else aoMudar();
      })();
    },
  });

  const emArraste = arr.arraste ? porId.get(arr.arraste.id) ?? null : null;
  const limite = modo === "mes" ? 3 : 12;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
      {/* ── cabeçalho do calendário ── */}
      <div className="flex flex-wrap items-center gap-2 pb-2.5">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={modo === "mes" ? "Mês anterior" : "Semana anterior"}
            onClick={() => setAncora((a) => (modo === "mes" ? deslocarMes(a, -1) : deslocarSemana(a, -1)))}
            className="text-mute hover:text-tinta"
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={modo === "mes" ? "Próximo mês" : "Próxima semana"}
            onClick={() => setAncora((a) => (modo === "mes" ? deslocarMes(a, 1) : deslocarSemana(a, 1)))}
            className="text-mute hover:text-tinta"
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
        <h2 className="text-[15px] font-semibold text-tinta">{modo === "mes" ? rotuloMes(ancora) : rotuloSemana(dias)}</h2>
        {ancora !== hojeYmd && (
          <Button variant="ghost" size="xs" onClick={() => setAncora(hojeYmd)} className="text-suave hover:text-tinta">
            Hoje
          </Button>
        )}
        <span className="ml-auto text-[12px] text-mute">arraste uma tarefa para outro dia</span>
        <ToggleGroup
          value={[modo]}
          onValueChange={(v) => {
            const e = (v as string[])[0];
            if (e === "semana" || e === "mes") setModo(e);
          }}
          variant="outline"
          size="sm"
          aria-label="Semana ou mês"
        >
          <ToggleGroupItem value="semana" className="px-2.5 text-[13px]">
            Semana
          </ToggleGroupItem>
          <ToggleGroupItem value="mes" className="px-2.5 text-[13px]">
            Mês
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {erro && (
        <p role="alert" className="pb-2 text-[12.5px] font-medium text-vermelho">
          Não moveu — {erro}
        </p>
      )}

      {/* ── a gaveta do sem prazo — fonte de arraste, nunca destino ── */}
      {soltas.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-linha bg-branco px-3 py-2">
          <span className="mr-1 text-[12px] font-medium text-suave">
            Sem prazo <span className="font-mono text-mute">{soltas.length}</span>
          </span>
          {soltas.slice(0, 8).map((t) => (
            <Chip key={t.id} t={t} hojeYmd={hojeYmd} props={arr.propsItem(t.id, "sem_prazo")} aoAbrir={aoAbrir} arrastando={arr.arraste?.id === t.id} solta />
          ))}
          {soltas.length > 8 && <span className="text-[12px] text-mute">+{soltas.length - 8}</span>}
        </div>
      )}

      {/* ── a grade ── */}
      <div ref={arr.raizRef} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-linha bg-branco">
        <div className="grid shrink-0 grid-cols-7 border-b border-linha">
          {NOMES_DOS_DIAS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-mute">
              {d}
            </div>
          ))}
        </div>
        <div className={cn("grid min-h-0 flex-1 grid-cols-7 overflow-y-auto", modo === "mes" ? "grid-rows-6" : "grid-rows-1")}>
          {dias.map((d) => {
            const lista = mapa.get(d.ymd) ?? [];
            const aceso = arr.destino === d.ymd && arr.arraste != null;
            const recusa = aceso && d.ymd < hojeYmd;
            const tudo = mostrarTudo === d.ymd;
            const vistas = tudo ? lista : lista.slice(0, limite);
            return (
              <div
                key={d.ymd}
                data-destino={d.ymd}
                className={cn(
                  "flex min-h-[92px] min-w-0 flex-col gap-px border-b border-r border-[#F1F0EC] px-1.5 pb-1.5 pt-1 last:border-r-0 [&:nth-child(7n)]:border-r-0",
                  d.fimDeSemana && "bg-[#FBFAF7]",
                  !d.doMes && modo === "mes" && "opacity-55",
                  aceso && !recusa && "bg-bolha-out/60 outline-dashed outline-1 -outline-offset-1 outline-laranja",
                  recusa && "bg-vermelho/5",
                )}
              >
                <div className="flex items-baseline gap-1.5 pb-0.5">
                  <span
                    className={cn(
                      "grid size-[19px] shrink-0 place-items-center rounded-full text-[11.5px] font-medium tabular-nums",
                      d.hoje ? "bg-primary text-branco" : d.passado ? "text-mute" : "text-suave",
                    )}
                  >
                    {d.dia}
                  </span>
                  {lista.length > 0 && (
                    <span className="font-mono text-[10.5px] tabular-nums text-mute">
                      {lista.length}
                      {lista.some((t) => t.vencida) && <span className="text-vermelho"> !</span>}
                    </span>
                  )}
                </div>
                {vistas.map((t) => (
                  <Chip key={t.id} t={t} hojeYmd={hojeYmd} props={arr.propsItem(t.id, d.ymd)} aoAbrir={aoAbrir} arrastando={arr.arraste?.id === t.id} />
                ))}
                {lista.length > vistas.length && (
                  <button
                    type="button"
                    onClick={() => setMostrarTudo(d.ymd)}
                    className="mt-px w-fit rounded px-1 text-left text-[11.5px] text-mute hover:text-tinta"
                  >
                    +{lista.length - vistas.length} mais
                  </button>
                )}
                {tudo && lista.length > limite && (
                  <button type="button" onClick={() => setMostrarTudo(null)} className="mt-px w-fit rounded px-1 text-left text-[11.5px] text-mute hover:text-tinta">
                    recolher
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* o card no ar + o que o leitor de tela ouve */}
      {arr.arraste && emArraste && !arr.arraste.porTeclado && (
        <OverlayArrasteTarefa x={arr.x} y={arr.y} largura={arr.arraste.largura}>
          <div className="rounded-md border border-linha-forte bg-branco px-1.5 py-1 text-[12px] font-medium text-tinta shadow-sm">
            {emArraste.titulo}
          </div>
        </OverlayArrasteTarefa>
      )}
      <p aria-live="polite" className="sr-only">
        {arr.anuncio}
      </p>
    </div>
  );
}

function Chip({
  t,
  hojeYmd,
  props,
  aoAbrir,
  arrastando,
  solta = false,
}: {
  t: TarefaVisao;
  hojeYmd: string;
  props: Record<string, unknown>;
  aoAbrir: (t: TarefaVisao) => void;
  arrastando: boolean;
  solta?: boolean;
}) {
  const cor = tom(t, hojeYmd);
  return (
    <ComResumoNoHover t={t} className="block min-w-0">
      <div
        {...props}
        role="button"
        onClick={() => aoAbrir(t)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            aoAbrir(t);
          }
          (props.onKeyDown as ((e: React.KeyboardEvent) => void) | undefined)?.(e);
        }}
        title={`${t.titulo}${t.lead_nome ? ` · ${t.lead_nome}` : ""}`}
        className={cn(
          "flex min-w-0 cursor-grab items-center gap-1 rounded px-1 py-[3px] text-left text-[12px] leading-tight outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing",
          solta && "border border-linha bg-branco",
          arrastando && "opacity-35",
        )}
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            cor === "vencida" ? "bg-vermelho" : cor === "hoje" ? "bg-primary" : cor === "fechada" ? "bg-mute/50" : "bg-linha-forte",
          )}
          aria-hidden
        />
        {t.origem === "jarvis_conversa" && <MarcaJarvis tamanho={16} className="-mx-0.5 shrink-0 scale-75 text-mute" rotulo="Criada pelo Jarvis" />}
        {!solta && t.prazo && <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-mute">{horaCurta(t.prazo)}</span>}
        <span className={cn("min-w-0 flex-1 truncate", cor === "fechada" ? "text-mute line-through decoration-mute/60" : "text-tinta")}>{t.titulo}</span>
      </div>
    </ComResumoNoHover>
  );
}
