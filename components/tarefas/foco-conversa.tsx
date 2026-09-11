"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRightIcon, LockIcon, SendHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContextoFoco, MensagemFoco } from "@/lib/ensaio/tarefas-foco";
import { haQuanto } from "@/lib/tarefas/resumo";
import { cn } from "@/lib/utils";

/*
 * A CONVERSA AO LADO DA TAREFA (W-T, 10/09 noite) — a metade direita do modo foco.
 *
 * Por que ela é a metade MAIOR e não uma barra lateral: o pedido do workshop é "não quero que você
 * abra múltiplas telas" (R8), e a decisão da Sara não está na tarefa — está no que o paciente
 * escreveu. A tarefa diz o que fazer; a conversa diz se ainda faz sentido. Quem fica com mais
 * pixel é quem responde a segunda pergunta.
 *
 * O desenho do fio é o MESMO de /conversas — bolha `bolha-out`/`bolha-in`, 13px de raio com o
 * canto colado, rajada agrupada, separador de dia em chip sticky. Não é economia: é para a pessoa
 * não ter de reaprender a ler o fio só porque entrou por outra porta. O que muda é o que NÃO vem
 * junto: mídia, reações, retry de envio, âncora de tarefa. Aqui é leitura das últimas trocas mais
 * uma resposta curta; o que for além disso abre a conversa inteira (o botão está no topo).
 *
 * O composer é deliberadamente pequeno: um campo, o canal de saída em texto ("Enviando por
 * Oficial"), e o mesmo interruptor de nota interna do /conversas em âmbar. Sem `/` comandos, sem
 * anexo, sem template — cada um deles é uma decisão que tira a pessoa da tarefa.
 */

const FMT_DIA = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const FMT_DIA_CURTO = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const FMT_MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function rotuloDoDia(iso: string, agoraMs: number): string {
  const d = new Date(iso);
  const dia = 86_400_000;
  const chave = (x: number) => Math.floor((x - new Date(x).getTimezoneOffset() * 60_000) / dia);
  const diff = chave(agoraMs) - chave(d.getTime());
  if (diff === 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff < 7) return FMT_DIA.format(d);
  return FMT_DIA_CURTO.format(d);
}

interface Bloco {
  dia: string;
  grupos: { de: "cliente" | "nos"; autor: string | null; itens: MensagemFoco[] }[];
}

/** mesmo agrupamento do inbox: por dia, e dentro do dia por falante em rajada de 5 min */
function emBlocos(fio: MensagemFoco[], agoraMs: number): Bloco[] {
  const blocos: Bloco[] = [];
  for (const m of fio) {
    const dia = rotuloDoDia(m.em, agoraMs);
    let bloco = blocos[blocos.length - 1];
    if (!bloco || bloco.dia !== dia) {
      bloco = { dia, grupos: [] };
      blocos.push(bloco);
    }
    const ultimo = bloco.grupos[bloco.grupos.length - 1];
    const anterior = ultimo?.itens[ultimo.itens.length - 1];
    const colado = ultimo && ultimo.de === m.de && ultimo.autor === m.autor && anterior && new Date(m.em).getTime() - new Date(anterior.em).getTime() < 5 * 60_000;
    if (colado) ultimo.itens.push(m);
    else bloco.grupos.push({ de: m.de, autor: m.autor, itens: [m] });
  }
  return blocos;
}

/**
 * O que não é texto vira PALAVRA, não etiqueta. "STICKER" em caixa alta é debris de sistema; a
 * Sara precisa saber que ali foi uma figurinha e seguir lendo. Quando não há corpo, a palavra É a
 * mensagem — e é por isso que ela vai em itálico suave, não em maiúscula tracked.
 */
const PALAVRA_TIPO: Record<string, string> = {
  audio: "áudio",
  image: "imagem",
  imagem: "imagem",
  video: "vídeo",
  sticker: "figurinha",
  document: "documento",
  documento: "documento",
  location: "localização",
  contacts: "contato",
  nota: "nota interna",
};

function palavraDoTipo(tipo: string): string {
  return PALAVRA_TIPO[tipo] ?? tipo;
}

/** o fio do foco é curto de propósito: as últimas trocas decidem; o resto está na conversa inteira */
const ULTIMAS = 14;

export interface EnvioDoFoco {
  texto: string;
  interna: boolean;
}

export function ConversaDoFoco({
  contexto,
  agoraMs,
  onAbrirConversa,
  onEnviar,
  composerRef,
  className,
}: {
  contexto: ContextoFoco | null;
  agoraMs: number;
  onAbrirConversa: (() => void) | null;
  /** `null` = responder daqui ainda não está ligado neste ambiente (o composer diz isso) */
  onEnviar: ((envio: EnvioDoFoco) => Promise<void>) | null;
  composerRef?: React.RefObject<HTMLTextAreaElement>;
  className?: string;
}) {
  const fimRef = useRef<HTMLDivElement>(null);
  const fio = contexto?.fio ?? [];
  const cortadas = Math.max(0, fio.length - ULTIMAS);
  const blocos = useMemo(() => emBlocos(fio.slice(-ULTIMAS), agoraMs), [fio, agoraMs]);

  // o fio abre no fim (a última mensagem é a que decide), sem animar: rolagem animada em troca de
  // tarefa é um deslize de tela inteira a cada ⏎.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [contexto?.lead_id, contexto?.fio.length]);

  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border border-linha bg-branco", className)} aria-label="Conversa do lead">
      {contexto ? (
        <>
          <FaixaFicha contexto={contexto} agoraMs={agoraMs} onAbrirConversa={onAbrirConversa} />
          <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
            {blocos.length === 0 && (
              <p className="m-auto max-w-[34ch] text-center text-[13px] text-mute">
                Sem mensagem registrada com {primeiro(contexto.lead_nome)}. A tarefa nasceu de uma varredura, não de uma conversa.
              </p>
            )}
            {cortadas > 0 && (
              <p className="self-center text-[11.5px] text-mute">
                {cortadas === 1 ? "1 mensagem anterior" : `${cortadas} mensagens anteriores`} — na{" "}
                {onAbrirConversa ? (
                  <button type="button" onClick={onAbrirConversa} className="underline-offset-[3px] hover:text-tinta hover:underline">
                    conversa inteira
                  </button>
                ) : (
                  "conversa inteira"
                )}
              </p>
            )}
            {blocos.map((b, bi) => (
              <div key={bi} className="flex flex-col gap-3.5">
                <span className="my-0.5 self-center rounded-full border border-linha bg-branco px-3 py-0.5 text-[11px] text-mute">{b.dia}</span>
                {b.grupos.map((g, gi) => {
                  const saida = g.de === "nos";
                  return (
                    <div key={gi} className={cn("flex max-w-[66%] flex-col gap-[3px]", saida ? "items-end self-end" : "items-start self-start")}>
                      {g.itens.map((m, mi) => (
                        <div
                          key={m.id}
                          className={cn(
                            "whitespace-pre-wrap break-words px-3.5 py-2.5 text-[13.5px] leading-relaxed text-tinta",
                            saida ? "rounded-[13px] rounded-br-[5px] bg-bolha-out" : "rounded-[13px] rounded-bl-[5px] border border-linha bg-bolha-in",
                            saida && mi > 0 && "rounded-tr-[5px]",
                            !saida && mi > 0 && "rounded-tl-[5px]",
                          )}
                        >
                          {m.tipo !== "texto" && (
                            <span className={cn("italic text-mute", m.corpo && "mr-1")}>{palavraDoTipo(m.tipo)}{m.corpo ? ":" : ""}</span>
                          )}
                          {m.corpo}
                        </div>
                      ))}
                      <span className="px-1 text-[11px] text-mute">
                        {g.autor ? `${g.autor} · ` : ""}
                        {FMT_HORA.format(new Date(g.itens[g.itens.length - 1].em))}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={fimRef} />
          </div>
          <Composer canal={contexto.canal} onEnviar={onEnviar} composerRef={composerRef} onAbrirConversa={onAbrirConversa} />
        </>
      ) : (
        <div className="m-auto max-w-[36ch] px-6 text-center text-[13px] text-mute">
          Esta tarefa não está ancorada em conversa nenhuma — não há fio para abrir ao lado.
        </div>
      )}
    </section>
  );
}

function primeiro(nome: string): string {
  return nome.split(/\s+/)[0];
}

/** a ficha essencial: uma linha, só o que decide a conversa. O resto é a ficha completa do lead. */
function FaixaFicha({ contexto, agoraMs, onAbrirConversa }: { contexto: ContextoFoco; agoraMs: number; onAbrirConversa: (() => void) | null }) {
  const f = contexto.ficha;
  const itens: { rotulo: string; valor: string }[] = [];
  if (f.cidade) itens.push({ rotulo: "cidade", valor: f.cidade });
  if (f.etapa_nome) itens.push({ rotulo: "etapa", valor: f.na_etapa_desde ? `${f.etapa_nome} ${haQuanto(f.na_etapa_desde, agoraMs)}` : f.etapa_nome });
  if (f.aparelho) itens.push({ rotulo: "aparelho", valor: f.aparelho });
  if (f.proxima_consulta) itens.push({ rotulo: "próxima consulta", valor: `${rotuloDoDia(f.proxima_consulta.em, agoraMs)} ${FMT_HORA.format(new Date(f.proxima_consulta.em))} · ${f.proxima_consulta.onde}` });
  if (f.valor) itens.push({ rotulo: "valor", valor: FMT_MOEDA.format(f.valor) });

  return (
    <header className="flex flex-shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-linha px-5 py-2.5">
      <h2 className="text-[14px] font-medium text-tinta">
        {contexto.lead_nome}
        {f.idade ? <span className="ml-1.5 text-[12.5px] font-normal text-mute">{f.idade} anos</span> : null}
      </h2>
      <dl className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
        {itens.map((i) => (
          <div key={i.rotulo} className="flex items-baseline gap-1">
            <dt className="text-mute">{i.rotulo}</dt>
            <dd className="text-suave">{i.valor}</dd>
          </div>
        ))}
      </dl>
      {onAbrirConversa && (
        <button
          type="button"
          onClick={onAbrirConversa}
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] text-mute underline-offset-[3px] hover:text-tinta hover:underline"
        >
          Conversa inteira
          <ArrowUpRightIcon className="size-3" aria-hidden />
        </button>
      )}
    </header>
  );
}

function Composer({
  canal,
  onEnviar,
  composerRef,
  onAbrirConversa,
}: {
  canal: ContextoFoco["canal"];
  onEnviar: ((envio: EnvioDoFoco) => Promise<void>) | null;
  composerRef?: React.RefObject<HTMLTextAreaElement>;
  onAbrirConversa: (() => void) | null;
}) {
  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const proprio = useRef<HTMLTextAreaElement>(null);
  const campo = composerRef ?? proprio;

  async function enviar() {
    const t = texto.trim();
    if (!t || !onEnviar || ocupado) return;
    setOcupado(true);
    await onEnviar({ texto: t, interna });
    setOcupado(false);
    setTexto("");
  }

  if (!onEnviar) {
    return (
      <div className="flex flex-shrink-0 items-center gap-2 border-t border-linha px-5 py-3 text-[12.5px] text-mute">
        <LockIcon className="size-3.5 shrink-0" aria-hidden />
        <span>Responder daqui ainda não está ligado — o envio sai pela conversa.</span>
        {onAbrirConversa && (
          <button type="button" onClick={onAbrirConversa} className="ml-auto shrink-0 font-medium text-tinta underline-offset-[3px] hover:underline">
            Abrir conversa
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex-shrink-0 border-t px-5 py-3 transition-colors", interna ? "border-nota-linha bg-nota-fundo" : "border-linha bg-branco")}>
      <textarea
        ref={campo}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          // ⏎ envia, ⇧⏎ quebra linha — e o Esc devolve o teclado à fila (sem sair do modo foco)
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void enviar();
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            campo.current?.blur();
          }
        }}
        rows={2}
        placeholder={interna ? "Nota interna — só o time vê" : "Responder…"}
        aria-label={interna ? "Nota interna" : "Resposta ao lead"}
        className={cn(
          "w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-tinta outline-none placeholder:text-mute",
          interna && "text-tarefa-tinta",
        )}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" className="inline-flex items-center gap-1 text-[12px] text-mute hover:text-tinta" />}
            disabled={interna}
          >
            <span className={cn("size-1.5 rounded-full", canal.tipo === "oficial" ? "bg-navy" : "bg-laranja")} aria-hidden />
            {interna ? "Nota interna — não sai" : `Enviando por ${canal.rotulo}`}
            <span aria-hidden className="text-[9px]">▾</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled>{canal.rotulo} — o canal da conversa</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => setInterna((v) => !v)}
          aria-pressed={interna}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-[12px] transition-colors",
            interna ? "border-nota-linha bg-nota-faixa font-medium text-tarefa-tinta" : "border-linha bg-branco text-mute hover:text-tinta",
          )}
        >
          Nota interna
        </button>
        <Button size="sm" onClick={() => void enviar()} disabled={!texto.trim() || ocupado} className="ml-auto">
          <SendHorizontalIcon aria-hidden />
          {ocupado ? "Enviando…" : interna ? "Salvar nota" : "Enviar"}
        </Button>
      </div>
    </div>
  );
}
