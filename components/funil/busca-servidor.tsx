"use client";

import { useEffect, useRef, useState } from "react";
import { buscarLeadsAcao } from "@/app/(app)/funil/actions";
import { MINIMO_BUSCA } from "@/lib/dados/funil-calculos";
import type { CardLead, EtapaFunil, ResultadoBusca } from "@/lib/dados/funil";
import { cn } from "@/lib/utils";

/**
 * R23 · Trilha E — A BUSCA QUE ACHA O QUE NÃO ESTÁ NA TELA.
 *
 * O filtro do cliente (`filtrarCards`) continua fazendo o que sempre fez e continua certo: recortar
 * o board. Este componente responde a outra pergunta — "existe em algum lugar?" — e por isso vai ao
 * servidor, que enxerga `core.v_lead_card` inteira: todas as etapas (inclusive as `no_board`, onde
 * moram 582 dos 679 leads) e sem o teto do board.
 *
 * Mostra SÓ o que o board não tem. Repetir na faixa um card que já está numa coluna faria o
 * operador conferir duas vezes a mesma coisa; o valor está exatamente no complemento.
 */

/** Espera antes de ir ao banco. Curto o bastante para parecer instantâneo, longo o bastante para
 *  não disparar uma consulta por tecla — a diferença entre 1 ida e 12 ao digitar "Adelia". */
const ESPERA_MS = 260;

export interface EstadoBusca {
  /** Resultados que NÃO estão no board carregado — o que o filtro do cliente jamais acharia. */
  foraDoBoard: CardLead[];
  carregando: boolean;
  /** Havia mais que o teto: a UI pede para refinar, em vez de deixar parecer que mostrou tudo. */
  truncado: boolean;
  erro: boolean;
  /** O termo a que os resultados correspondem (pode estar atrás do que está sendo digitado). */
  termo: string;
}

const PARADO: EstadoBusca = { foraDoBoard: [], carregando: false, truncado: false, erro: false, termo: "" };

/**
 * Busca no servidor com debounce, descartando resposta fora de ordem.
 *
 * O `sequencia` não é cerimônia: consultas de rede voltam fora de ordem, e sem ele a resposta de
 * "Ade" chegando depois da de "Adelia" repintaria a lista com o resultado errado — o bug que faz o
 * operador jurar que a busca "às vezes mostra outra pessoa".
 */
export function useBuscaServidor(termo: string, idsNoBoard: Set<string>): EstadoBusca {
  const [estado, setEstado] = useState<EstadoBusca>(PARADO);
  const sequencia = useRef(0);

  useEffect(() => {
    const limpo = termo.trim();
    if (limpo.length < MINIMO_BUSCA) {
      sequencia.current += 1; // invalida qualquer resposta em voo
      setEstado(PARADO);
      return;
    }
    const meu = ++sequencia.current;
    setEstado((e) => ({ ...e, carregando: true }));
    const t = setTimeout(async () => {
      let r: ResultadoBusca;
      try {
        r = await buscarLeadsAcao(limpo);
      } catch {
        // A action falhou (rede/servidor). "Erro" e "achou zero" não podem virar a mesma tela.
        r = { termo: limpo, cards: [], truncado: false, erro: true };
      }
      if (meu !== sequencia.current) return; // chegou tarde: outra busca já mandou
      setEstado({
        foraDoBoard: r.cards.filter((c) => !idsNoBoard.has(c.lead_id)),
        carregando: false,
        truncado: r.truncado,
        erro: r.erro,
        termo: r.termo,
      });
    }, ESPERA_MS);
    return () => clearTimeout(t);
    // `idsNoBoard` muda de identidade a cada render do board; depender do seu CONTEÚDO (via
    // tamanho) evita refazer a consulta de rede à toa sem congelar o recorte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, idsNoBoard.size]);

  return estado;
}

function telefoneLegivel(tel: string | null): string | null {
  if (!tel) return null;
  const d = tel.replace(/[^0-9]/g, "");
  // guardado só em dígitos com DDI ("5527998316220"); devolve no formato que a operação lê
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : tel;
}

/**
 * A faixa de achados fora do board. Só aparece quando há algo a dizer — e quando aparece, diz
 * de onde o lead veio (a etapa), porque "achei, mas não te digo onde" obriga o operador a caçar.
 */
export function FaixaBuscaServidor({
  estado,
  todasEtapas,
  onAbrir,
}: {
  estado: EstadoBusca;
  todasEtapas: EtapaFunil[];
  onAbrir: (leadId: string) => void;
}) {
  const { foraDoBoard, carregando, truncado, erro, termo } = estado;
  if (termo === "" && !carregando) return null;
  if (!erro && !carregando && foraDoBoard.length === 0) return null;

  const nomeEtapa = (chave: string) => todasEtapas.find((e) => e.chave === chave)?.nome ?? chave;

  return (
    <div className="mx-5 mb-2 rounded-[8px] border border-linha bg-branco px-4 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[12.5px] font-semibold text-tinta">
          {erro
            ? "A busca no banco falhou"
            : carregando
              ? "Procurando no banco…"
              : `${foraDoBoard.length} fora do board`}
        </span>
        {!erro && !carregando && (
          <span className="text-[12px] text-suave">
            {foraDoBoard.length === 1 ? "este lead existe" : "estes leads existem"}, mas não está
            {foraDoBoard.length === 1 ? "" : "ão"} em nenhuma coluna — arquivado ou fora do recorte
            carregado.
          </span>
        )}
        {erro && (
          <span className="text-[12px] text-suave">
            Não dá para dizer se existe — a consulta não voltou. Isso é diferente de não existir.
          </span>
        )}
        {truncado && (
          <span className="rounded-full bg-laranja-cl px-2.5 py-0.5 text-[11.5px] font-medium text-laranja-esc">
            há mais — refine a busca
          </span>
        )}
      </div>

      {foraDoBoard.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {foraDoBoard.map((c) => (
            <li key={c.lead_id}>
              <button
                type="button"
                onClick={() => onAbrir(c.lead_id)}
                className={cn(
                  "flex items-baseline gap-2 rounded-[6px] border border-linha bg-board/60 px-2.5 py-1.5",
                  "text-left transition-colors hover:border-linha-forte hover:bg-board",
                )}
              >
                <span className="max-w-[190px] truncate text-[13px] text-tinta">
                  {c.nome ?? <span className="text-mute">sem nome</span>}
                </span>
                {telefoneLegivel(c.telefone) && (
                  <span className="font-mono text-[11px] tabular-nums text-suave">
                    {telefoneLegivel(c.telefone)}
                  </span>
                )}
                <span className="rounded-full bg-branco px-2 py-px text-[11px] text-mute">
                  {nomeEtapa(c.etapa)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
