"use client";

import { useState } from "react";
import { PencilLineIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataHoraCurta } from "@/lib/dados/tarefa-calculos";
import { AssinaturaJarvis } from "./marca";
import { RAIL, Rotulo, SeloEstado, Trecho, fraseDoEstado, prazoUrgente, textoDoOriginal, textoPrazo } from "./partes";
import {
  ROTULO_MOTIVO,
  ROTULO_PRAZO,
  ehPrazoCurto,
  type AjusteProposta,
  type MotivoDescarte,
  type Pessoa,
  type PrazoCurto,
  type PropostaJarvis,
} from "./tipos";

/**
 * A NOTA INTERNA DO JARVIS DENTRO DO FIO (W-J, 10/09/2026).
 *
 * Não é bolha e não é mensagem ao paciente: ocupa a largura toda, na superfície âmbar tostado da
 * família "isto fica entre nós" (`tarefa.*`, a mesma da nota humana e do "Jarvis criou tarefa" de
 * registro-interno.tsx), com um rail esquerdo cuja cor É o estado — navy esperando decisão, verde
 * decidida/feita, cinza descartada. Quem varre o fio lê o estado sem ler o texto.
 *
 * O card carrega o que o worker exige para propor (contrato.ts do runtime): POR QUE AGORA, FAZER e
 * o TRECHO literal do paciente — sem trecho não há proposta, e a tela não inventa um. "Ver no fio"
 * rola até a mensagem citada (`onIrAoTrecho`/`hrefTrecho`) — a evidência é clicável.
 *
 * Ações (só em `proposta`): Aceitar · Ajustar · Descartar.
 *   Aceitar diz o que vai acontecer ("vira tarefa para Sara, hoje") antes do clique.
 *   Ajustar edita FAZER / prazo / responsável no lugar e o botão vira "Aceitar com ajustes" — o
 *   `AjusteProposta` sai no callback e o payload ganha `ajustada_de` (lib/tarefas/propostas.ts).
 *   Descartar pede o motivo em três chips (é o feedback que vira dataset; LiderHub gravava
 *   sent_as_is/sent_edited/discarded e nós gravamos o mesmo em `sugestao_rejeitada`).
 *
 * Depois da decisão, o card FICA no fio, com o nome de quem decidiu e quando — e quando a tarefa
 * é concluída, o mesmo card mostra "feita por Sara". O ciclo abre e fecha na mesma superfície.
 * Quem decide é sempre pessoa; o Jarvis nunca é sujeito da frase de estado.
 */

export interface PropostaInlineProps {
  proposta: PropostaJarvis;
  /** pessoas que podem ser responsável (para o Ajustar) */
  responsaveis?: Pessoa[];
  /** rola até a mensagem citada — o card vira o ponteiro para a evidência */
  onIrAoTrecho?: (mensagemId: string | null) => void;
  hrefTrecho?: string | null;
  /** link para a tarefa criada (estados aceita/ajustada/feita) */
  hrefTarefa?: string | null;
  onAceitar?: (proposta: PropostaJarvis, ajuste: AjusteProposta | null) => void;
  onDescartar?: (proposta: PropostaJarvis, motivo: MotivoDescarte, observacao: string | null) => void;
  /** sem botões, mesmo em `proposta` (ex.: papel `marketing`, ou histórico) */
  somenteLeitura?: boolean;
  /** abre já em edição/descartar — o card compacto de /tarefas expande para cá */
  modoInicial?: "ver" | "ajustar" | "descartar";
  /** o card de /tarefas passa isto para voltar ao compacto */
  onVoltar?: () => void;
  agoraMs?: number;
  className?: string;
}

export function PropostaJarvisInline({
  proposta,
  responsaveis = [],
  onIrAoTrecho,
  hrefTrecho,
  hrefTarefa,
  onAceitar,
  onDescartar,
  somenteLeitura = false,
  modoInicial = "ver",
  onVoltar,
  agoraMs,
  className,
}: PropostaInlineProps) {
  const [modo, setModo] = useState<"ver" | "ajustar" | "descartar">(modoInicial);
  const [ajuste, setAjuste] = useState<AjusteProposta>({});
  const [motivo, setMotivo] = useState<MotivoDescarte | null>(null);
  const [observacao, setObservacao] = useState("");

  const p = proposta;
  const aberta = p.estado === "proposta" && !somenteLeitura;
  const decidida = p.estado !== "proposta";
  const descartada = p.estado === "descartada";

  const fazer = ajuste.fazer ?? p.fazer;
  const prazo = ajuste.prazo === undefined ? p.prazo : ajuste.prazo;
  const responsavelId = ajuste.responsavel_id === undefined ? p.responsavel_id : ajuste.responsavel_id;
  const responsavelNome =
    ajuste.responsavel_nome === undefined ? p.responsavel_nome : ajuste.responsavel_nome;

  const houveAjuste =
    fazer.trim() !== p.fazer.trim() || (prazo ?? null) !== (p.prazo ?? null) || (responsavelId ?? null) !== (p.responsavel_id ?? null);

  const frase = fraseDoEstado(p);
  const original = textoDoOriginal(p);

  function aceitar() {
    onAceitar?.(p, houveAjuste ? { fazer, prazo, responsavel_id: responsavelId, responsavel_nome: responsavelNome } : null);
    setModo("ver");
  }

  return (
    <article
      className={cn(
        "self-stretch rounded-lg border border-l-[3px] border-tarefa-linha bg-tarefa-fundo px-3.5 py-3 transition-opacity",
        RAIL[p.estado],
        descartada && "opacity-70",
        className,
      )}
      aria-label={aberta ? "Proposta do Jarvis esperando decisão" : `Proposta do Jarvis — ${p.estado}`}
    >
      <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <AssinaturaJarvis tamanho={16} sufixo={decidida ? "propôs" : "propõe"} />
        {frase ? (
          <span className="min-w-0 truncate text-[11.5px] text-suave">· {frase}</span>
        ) : (
          <span className="text-[11.5px] text-suave">· nada foi criado ainda</span>
        )}
        <SeloEstado estado={p.estado} className="ml-auto" />
        <time dateTime={p.criado_em} className={cn("shrink-0 font-mono text-[10.5px] tabular-nums text-suave", !decidida && "ml-auto")}>
          {dataHoraCurta(p.criado_em)}
        </time>
      </header>

      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
        <Rotulo>Por que agora</Rotulo>
        <dd className={cn("leading-normal text-tinta", descartada && "line-through decoration-linha-forte")}>{p.por_que}</dd>

        <Rotulo>Fazer</Rotulo>
        <dd className="leading-normal text-tinta">
          {modo === "ajustar" ? (
            <input
              autoFocus
              value={fazer}
              onChange={(e) => setAjuste((a) => ({ ...a, fazer: e.target.value }))}
              aria-label="Ajustar o que fazer"
              maxLength={160}
              className="w-full rounded-md border border-tarefa-linha bg-branco px-2.5 py-1.5 text-[13.5px] text-tinta outline-none focus:border-laranja"
            />
          ) : (
            <span className={cn("font-semibold", descartada && "line-through decoration-linha-forte")}>{fazer}</span>
          )}
          {original && <span className="mt-0.5 block text-[12px] text-suave">{original}</span>}
        </dd>

        {p.trecho && (
          <>
            <Rotulo>Trecho</Rotulo>
            <dd>
              <Trecho
                texto={p.trecho}
                href={hrefTrecho ?? undefined}
                onIr={onIrAoTrecho ? () => onIrAoTrecho(p.trecho_mensagem_id ?? null) : undefined}
              />
            </dd>
          </>
        )}

        <Rotulo>Prazo</Rotulo>
        <dd>
          {modo === "ajustar" ? (
            <div className="inline-flex rounded-md border border-tarefa-linha bg-branco p-0.5 text-[12px]" role="radiogroup" aria-label="Prazo">
              {(Object.keys(ROTULO_PRAZO) as PrazoCurto[]).map((k) => {
                const ativo = prazo === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => setAjuste((a) => ({ ...a, prazo: k }))}
                    className={cn("rounded-[5px] px-2 py-0.5 font-medium", ativo ? "bg-navy text-branco" : "text-suave hover:text-tinta")}
                  >
                    {ROTULO_PRAZO[k]}
                  </button>
                );
              })}
              {!ehPrazoCurto(prazo) && prazo && <span className="px-2 py-0.5 text-suave">{textoPrazo(prazo)}</span>}
            </div>
          ) : (
            <span className={cn(prazoUrgente(prazo, agoraMs) && !decidida ? "font-semibold text-vermelho" : "text-tinta")}>{textoPrazo(prazo)}</span>
          )}
        </dd>

        <Rotulo>Responsável</Rotulo>
        <dd>
          {modo === "ajustar" && responsaveis.length > 0 ? (
            <select
              value={responsavelId ?? ""}
              onChange={(e) => {
                const r = responsaveis.find((x) => x.id === e.target.value);
                setAjuste((a) => ({ ...a, responsavel_id: e.target.value || null, responsavel_nome: r?.nome ?? null }));
              }}
              aria-label="Responsável pela tarefa"
              className="rounded-md border border-tarefa-linha bg-branco px-2 py-1 text-[12.5px] text-tinta outline-none"
            >
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-tinta">{responsavelNome ?? "sem responsável"}</span>
          )}
        </dd>
      </dl>

      {decidida && hrefTarefa && !descartada && (
        <p className="mt-2 text-[12px]">
          <a href={hrefTarefa} className="font-medium text-navy underline-offset-2 hover:underline">
            abrir a tarefa
          </a>
        </p>
      )}

      {aberta && modo !== "descartar" && (
        <footer className="mt-3 border-t border-tarefa-linha/70 pt-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={aceitar}
              className="rounded-md bg-laranja px-3.5 py-1.5 text-[13px] font-semibold text-branco transition-colors hover:bg-laranja-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
            >
              {modo === "ajustar" && houveAjuste ? "Aceitar com ajustes" : "Aceitar"}
            </button>
            <button
              type="button"
              onClick={() => (modo === "ajustar" && onVoltar ? onVoltar() : setModo(modo === "ajustar" ? "ver" : "ajustar"))}
              aria-pressed={modo === "ajustar"}
              className="inline-flex items-center gap-1.5 rounded-md border border-tarefa-linha bg-branco px-3 py-1.5 text-[13px] font-medium text-navy transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
            >
              <PencilLineIcon className="size-3.5" />
              {modo === "ajustar" ? "Pronto" : "Ajustar"}
            </button>
            <button
              type="button"
              onClick={() => setModo("descartar")}
              className="ml-auto rounded-md px-3 py-1.5 text-[13px] text-suave transition-colors hover:bg-hover hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
            >
              Descartar
            </button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-suave">
            ao aceitar: vira tarefa para <b className="font-semibold text-tinta">{responsavelNome ?? "quem você escolher"}</b>, prazo{" "}
            <b className="font-semibold text-tinta">{textoPrazo(prazo).toLowerCase()}</b>
            {houveAjuste && " · o ajuste fica registrado"}
          </p>
        </footer>
      )}

      {aberta && modo === "descartar" && (
        <footer className="mt-3 border-t border-tarefa-linha/70 pt-2.5">
          <p className="mb-1.5 text-[12px] text-tinta">Por que descartar? O Jarvis aprende com o motivo e não repete por 7 dias.</p>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Motivo do descarte">
            {(Object.keys(ROTULO_MOTIVO) as MotivoDescarte[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={motivo === m}
                onClick={() => setMotivo(m)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                  motivo === m ? "border-navy bg-navy text-branco" : "border-tarefa-linha bg-branco text-suave hover:text-tinta",
                )}
              >
                {ROTULO_MOTIVO[m]}
              </button>
            ))}
          </div>
          {motivo === "outro" && (
            <input
              autoFocus
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Em uma frase"
              aria-label="Motivo em uma frase"
              className="mt-2 w-full rounded-md border border-tarefa-linha bg-branco px-2.5 py-1.5 text-[13px] text-tinta outline-none placeholder:text-mute focus:border-laranja"
            />
          )}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              disabled={!motivo}
              onClick={() => {
                if (!motivo) return;
                onDescartar?.(p, motivo, observacao.trim() || null);
                setModo("ver");
              }}
              className="rounded-md border border-linha-forte bg-branco px-3 py-1.5 text-[13px] font-medium text-tinta transition-colors enabled:hover:bg-hover disabled:opacity-50"
            >
              Confirmar descarte
            </button>
            <button type="button" onClick={() => (onVoltar ? onVoltar() : setModo("ver"))} className="rounded-md px-3 py-1.5 text-[13px] text-suave hover:bg-hover hover:text-tinta">
              Voltar
            </button>
          </div>
        </footer>
      )}
    </article>
  );
}
