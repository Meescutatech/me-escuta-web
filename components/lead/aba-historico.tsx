"use client";

import { useMemo } from "react";
import {
  colapsarDuplicatas,
  houveCorte,
  lerResponsavel,
  resolverAtor,
  traduzirEtapa,
  type EventoHistorico,
  type LinhaHistorico,
} from "./regras/historico.ts";

/**
 * M4 · a aba "Histórico" — status e responsável do lead, lidos do LEDGER.
 *
 * UM componente, usado nos DOIS lugares (o painel do inbox e o drawer do funil). As anatomias das
 * duas telas são diferentes — o inbox passa `abasExtras` para a `FichaKommo`, o drawer tem barra de
 * abas própria —, e é justamente por isso que a aba em si tem de ser a mesma peça: entregar só um
 * dos dois deixa o histórico existindo em metade do produto, e é o tipo de meia-entrega que passa
 * em revisão porque quem revisa abre um dos dois.
 *
 * A aba NÃO tem contador na régua: o número seria 1, 2 ou 3 em 100% dos leads (medido: 73 leads com
 * 1 linha, 588 com 2, 19 com 3), e um badge de "2" não informa nada.
 *
 * LEITURA PURA. Sem botão, sem edição; clicar num item não faz nada. O M4 não acrescenta caminho
 * de escrita nenhum.
 */
export function AbaHistorico({
  historico,
  donoLegado,
  pessoas,
  agentes,
  etapas,
}: {
  /** `null` = a leitura FALHOU. `[]` = este lead não tem eventos. São coisas diferentes. */
  historico: EventoHistorico[] | null;
  /** `core.lead.dono` — o valor do sistema antigo. Origem histórica, não identidade. */
  donoLegado: string | null;
  pessoas: ReadonlyMap<string, string>;
  agentes?: ReadonlyMap<string, string>;
  etapas: ReadonlyMap<string, string>;
}) {
  const linhas = useMemo<LinhaHistorico[]>(
    () => colapsarDuplicatas(historico ?? []),
    [historico],
  );

  const responsavel = useMemo(() => {
    const qtd = (historico ?? []).filter((e) => e.tipo === "dono_atribuido").length;
    const legado = (donoLegado ?? "").trim() || null;
    // o de-para se aplica na LEITURA, por sinônimo — o M4 nunca pede reescrita de evento.
    const nome = legado ? (pessoas.get(legado) ?? null) : null;
    return lerResponsavel(qtd, legado, nome);
  }, [historico, donoLegado, pessoas]);

  // ERRO DE LEITURA ≠ VAZIO. Esta é a distinção que decide se a pessoa continua procurando.
  if (historico === null) {
    return (
      <p className="px-1 py-3 text-[12.5px] leading-relaxed text-suave">
        Não foi possível ler o histórico deste lead agora. O resto da ficha continua valendo — isto
        não quer dizer que o lead não tenha histórico.
      </p>
    );
  }

  return (
    <div className="px-1 py-1">
      {responsavel.frase ? (
        <p className="mb-2.5 border-b border-linha pb-2.5 text-[12.5px] leading-relaxed text-suave">
          {responsavel.frase}
        </p>
      ) : null}

      {linhas.length === 0 ? (
        <p className="py-2 text-[12.5px] leading-relaxed text-suave">
          Nenhum evento de status ou responsável registrado para este lead.
        </p>
      ) : (
        <ol>
          {linhas.map((l) => (
            <ItemEvento
              key={l.evento.id}
              linha={l}
              pessoas={pessoas}
              agentes={agentes ?? new Map()}
              etapas={etapas}
            />
          ))}
        </ol>
      )}

      {houveCorte(historico.length) ? (
        <p className="mt-2 border-t border-linha pt-2 text-[11.5px] text-suave">
          Mostrando os {historico.length} eventos mais recentes — este lead tem mais.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Ordem de leitura fixa: **quando · quem · o quê · por quê**. É a ordem em que a pergunta chega —
 * "quando isso mudou?" vem antes de "quem mudou?", que vem antes do valor.
 */
function ItemEvento({
  linha,
  pessoas,
  agentes,
  etapas,
}: {
  linha: LinhaHistorico;
  pessoas: ReadonlyMap<string, string>;
  agentes: ReadonlyMap<string, string>;
  etapas: ReadonlyMap<string, string>;
}) {
  const e = linha.evento;
  const ator = resolverAtor(e.ator, pessoas, agentes);

  return (
    <li className="border-b border-linha py-1.5 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <time
          className="font-mono text-[11.5px] tabular-nums text-suave"
          dateTime={e.criado_em}
          title={instanteCompleto(e.criado_em)}
        >
          {instante(e.criado_em)}
        </time>
        <span
          className={`text-[12px] ${ator.especie === "sistema" ? "font-mono text-mute" : "text-suave"}`}
        >
          {ator.rotulo}
        </span>
        {linha.repeticoes > 1 ? (
          <span className="font-mono text-[11px] tabular-nums text-mute">
            ×{linha.repeticoes}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 text-[13px] leading-snug text-tinta">
        <Oque evento={e} etapas={etapas} pessoas={pessoas} />
      </div>
      {e.motivo ? (
        <div className="mt-0.5 text-[12px] leading-snug text-suave">{e.motivo}</div>
      ) : null}
    </li>
  );
}

function Oque({
  evento,
  etapas,
  pessoas,
}: {
  evento: EventoHistorico;
  etapas: ReadonlyMap<string, string>;
  pessoas: ReadonlyMap<string, string>;
}) {
  if (evento.tipo === "lead_criado") {
    const et = traduzirEtapa(evento.etapa_inicial, etapas);
    return (
      <>
        Lead criado{et ? <> em <Etapa e={et} /></> : null}
      </>
    );
  }

  if (evento.tipo === "etapa_alterada") {
    const de = traduzirEtapa(evento.etapa_de, etapas);
    const para = traduzirEtapa(evento.etapa_para, etapas);
    // SEM `etapa_de` em 600 de 626 casos. Renderiza só "→ destino" — nunca "— → destino",
    // nunca "undefined → destino". O traço no lugar da origem afirma uma origem vazia que
    // não existe; a seta sozinha diz a verdade, que é "passou a estar aqui".
    return (
      <>
        {de ? (
          <>
            <Etapa e={de} /> <span className="text-mute">→</span>{" "}
          </>
        ) : (
          <span className="text-mute">→ </span>
        )}
        {para ? <Etapa e={para} /> : <span className="text-suave">etapa não informada</span>}
      </>
    );
  }

  // dono_atribuido — e `dono_id` NULO é REMOÇÃO EXPLÍCITA, não dado faltando (contrato de
  // `atribuirDono`). Renderizar como linha quebrada seria transformar uma decisão em defeito.
  if (!evento.dono_id) return <>Passou a não ter responsável</>;
  const nome = pessoas.get(evento.dono_id);
  return (
    <>
      Responsável:{" "}
      {nome ?? (
        <span title={evento.dono_id}>Usuário removido ({evento.dono_id.slice(0, 8)})</span>
      )}
    </>
  );
}

function Etapa({ e }: { e: { rotulo: string; foraDaConfig: boolean } }) {
  if (!e.foraDaConfig) return <span className="font-medium">{e.rotulo}</span>;
  // slug + marca, NUNCA linha em branco. Acontece hoje: `novo` e `qualificando`.
  return (
    <span className="font-medium" title="fora da configuração atual do funil">
      <span className="font-mono">{e.rotulo}</span>
      <span className="ml-1 text-[11px] font-normal text-mute">(fora da config)</span>
    </span>
  );
}

/** Relativo no dia corrente, absoluto no resto. O instante completo fica no `title`, sem clique. */
function instante(iso: string): string {
  const t = Date.parse((iso ?? "").trim());
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t);
  const agora = new Date();
  const mesmoDia =
    d.getDate() === agora.getDate() &&
    d.getMonth() === agora.getMonth() &&
    d.getFullYear() === agora.getFullYear();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function instanteCompleto(iso: string): string {
  const t = Date.parse((iso ?? "").trim());
  if (!Number.isFinite(t)) return "instante ilegível";
  return new Date(t).toLocaleString("pt-BR");
}
