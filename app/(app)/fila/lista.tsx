"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { validarSugestao } from "./actions";
import type { DadosFila, Proposta } from "./dados";
import { cn } from "@/lib/utils";

/*
 * A LISTA DA FILA (W3 · 22/08/2026) — escrita do lado de quem usa.
 *
 * O cartão tem UM herói: o texto que o agente quer mandar. Tudo em volta é contexto e fica
 * quieto — nome do agente, paciente, e as duas últimas falas da conversa. É essa a ordem da
 * decisão real: leio o que vai sair, olho para quem, confiro o que veio antes, decido.
 *
 * A tela anterior nomeava a função de banco que o botão chamava. Ninguém que valida uma fila
 * precisa saber o nome de uma função — e quem precisa, não descobre por uma tela de operação.
 *
 * COR NUNCA SOZINHA: todo cartão impedido carrega a frase do impedimento escrita, não só a
 * moldura âmbar. Quem não distingue as cores lê exatamente a mesma informação.
 */

type Decidida = { estado: "ok"; texto: string } | { estado: "erro"; texto: string };

export function ListaFila({ dados }: { dados: DadosFila }) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-7">
      <Cabecalho dados={dados} />
      <FiltroAgentes porAgente={dados.porAgente} ativo={dados.filtro} />

      {dados.erro ? (
        <Aviso tom="vermelho">{dados.erro}</Aviso>
      ) : dados.itens.length === 0 ? (
        <Aviso tom="neutro">
          {dados.filtro
            ? "Nenhuma proposta deste agente esperando. Escolha “Todos” para ver o resto."
            : "Nada esperando por você. Quando um agente propuser alguma coisa, ela aparece aqui."}
        </Aviso>
      ) : (
        <ul className="mt-5 space-y-3">
          {dados.itens.map((p) => (
            <li key={p.id}>
              <Cartao proposta={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Cabecalho({ dados }: { dados: DadosFila }) {
  const mostrando = dados.itens.length;
  const noFiltro = dados.totalNoFiltro;
  return (
    <header className="mb-5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[34px] font-[650] leading-[1.1] tracking-[-0.02em] tabular-nums text-tinta">
          {dados.total == null ? "—" : dados.total.toLocaleString("pt-BR")}
        </span>
        <h1 className="text-[15px] text-suave">
          {dados.total === 1 ? "proposta esperando por você" : "propostas esperando por você"}
        </h1>
      </div>
      <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-[1.55] text-suave">
        Os agentes escrevem, você decide. Nada chega ao paciente sem passar por aqui.
      </p>
      {/* O “de N” é o conserto que mais importa deste cabeçalho: a tela antiga mostrava 50 e
          não dizia que existiam mais 355 esperando. Fila que esconde o próprio tamanho faz
          quem trabalha achar que terminou. */}
      {noFiltro != null && noFiltro > mostrando && (
        <p className="mt-1 text-[13px] text-mute">
          Mostrando as {mostrando} mais recentes de {noFiltro.toLocaleString("pt-BR")}
          {dados.filtro ? " neste agente" : ""}. Decida estas e as próximas sobem.
        </p>
      )}
    </header>
  );
}

function FiltroAgentes({
  porAgente,
  ativo,
}: {
  porAgente: DadosFila["porAgente"];
  ativo: string | null;
}) {
  if (!porAgente || porAgente.length === 0) return null;
  return (
    <nav aria-label="Filtrar por agente" className="flex flex-wrap gap-1.5 border-b border-linha pb-4">
      <Chip href="/fila" ativo={!ativo} rotulo="Todos" qtd={porAgente.reduce((s, a) => s + a.qtd, 0)} />
      {porAgente.map((a) => (
        <Chip
          key={a.agente}
          href={`/fila?agente=${encodeURIComponent(a.agente)}`}
          ativo={ativo === a.agente}
          rotulo={a.rotulo}
          qtd={a.qtd}
        />
      ))}
    </nav>
  );
}

function Chip({ href, ativo, rotulo, qtd }: { href: string; ativo: boolean; rotulo: string; qtd: number }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45",
        ativo
          ? "bg-[#EAECF5] font-semibold text-navy"
          : "border border-linha bg-branco font-medium text-suave hover:bg-hover hover:text-tinta",
      )}
    >
      {rotulo}
      <span className="font-mono text-[11.5px] tabular-nums opacity-70">{qtd.toLocaleString("pt-BR")}</span>
    </Link>
  );
}

function Cartao({ proposta }: { proposta: Proposta }) {
  const router = useRouter();
  const [decidida, setDecidida] = useState<Decidida | null>(null);
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  function decidir(decisao: "aprovada" | "rejeitada") {
    iniciar(async () => {
      const r = await validarSugestao(proposta.id, decisao);
      if (r.ok) {
        setDecidida({ estado: "ok", texto: decisao === "aprovada" ? "Aprovada e enviada." : "Recusada." });
        router.refresh();
      } else {
        setDecidida({ estado: "erro", texto: r.motivo ?? "Não foi possível registrar a decisão." });
      }
    });
  }

  if (decidida?.estado === "ok") {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-linha bg-hover px-5 py-3 text-[13.5px] text-suave">
        <span className="font-semibold text-verde">{decidida.texto}</span>
        <span className="text-mute">Sai da fila ao atualizar.</span>
      </div>
    );
  }

  const impedida = proposta.bloqueio != null;
  const semTexto = proposta.corpo.trim().length === 0;
  // Fila é para varrer. Uma proposta do Jarvis passa de 2.000 caracteres e empurra as outras para
  // fora da tela; as da Clara têm 2 ou 3 linhas e cabem inteiras. O corte só existe acima do que
  // já não cabe, e o texto integral fica a um clique — nunca escondido de vez.
  const longa = proposta.corpo.length > 700;
  const corpoVisivel = longa && !aberto ? proposta.corpo.slice(0, 700).trimEnd() + "…" : proposta.corpo;

  return (
    <article
      className={cn(
        "rounded-[10px] border bg-branco px-5 py-4",
        impedida ? "border-amarelo-bd" : "border-linha",
      )}
    >
      {/* quem propôs · o que quer fazer · quando */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13.5px] font-semibold text-navy">{proposta.agenteRotulo}</span>
        <span className="text-mute">·</span>
        <span className="text-[13.5px] text-tinta">{proposta.tipoRotulo}</span>
        <time
          dateTime={proposta.criadoEm}
          className="ml-auto font-mono text-[11.5px] tabular-nums text-mute"
          title={new Date(proposta.criadoEm).toLocaleString("pt-BR")}
        >
          {dataCurta(proposta.criadoEm)}
        </time>
      </div>

      {/* para quem — o dado que estava a um passo e a tela não mostrava */}
      <div className="mt-0.5 text-[13px] text-suave">
        {proposta.leadId ? (
          <>
            Paciente:{" "}
            <Link
              href={`/conversas?lead=${proposta.leadId}`}
              className="font-semibold text-navy underline decoration-linha-forte underline-offset-2 hover:decoration-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
            >
              {proposta.leadNome ?? proposta.telefone ?? "sem nome"}
            </Link>
          </>
        ) : (
          <span className="text-mute">Sem paciente vinculado.</span>
        )}
      </div>

      {/* o herói do cartão: o texto que vai sair */}
      {semTexto ? (
        /* O lugar do texto conta o que houve com o texto. É por isso que a tarja de impedimento
           lá embaixo não se repete neste caso — a informação já está aqui, escrita. */
        <p className="mt-3 rounded-[7px] border border-dashed border-linha-forte bg-hover px-3.5 py-3 text-[13.5px] leading-[1.5] text-suave">
          <strong className="font-semibold text-tinta">O agente não escreveu nada.</strong>{" "}
          {proposta.ehMensagem
            ? "Não há mensagem para enviar — recuse para tirar isto da fila."
            : "Esta proposta chegou sem conteúdo para revisar."}
        </p>
      ) : (
        <blockquote className="mt-3 border-l-[3px] border-laranja bg-branco pl-3.5 text-[15px] leading-[1.55] text-tinta">
          <p className="whitespace-pre-wrap">{corpoVisivel}</p>
          {longa && (
            <button
              onClick={() => setAberto((v) => !v)}
              className="mt-1.5 rounded text-[13px] font-semibold text-laranja-esc hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45"
            >
              {aberto ? "Mostrar menos" : `Ler tudo (${proposta.corpo.length.toLocaleString("pt-BR")} caracteres)`}
            </button>
          )}
        </blockquote>
      )}

      {proposta.detalhes.length > 0 && (
        <dl className="mt-3 space-y-1.5">
          {proposta.detalhes.map((d) => (
            <div key={d.rotulo} className="text-[13px] leading-[1.5]">
              <dt className="inline font-semibold text-suave">{d.rotulo}: </dt>
              <dd className="inline text-tinta">{d.valor}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* o que veio antes — quieto, mas presente: aprovar sem o contexto é adivinhar */}
      {proposta.trecho.length > 0 && (
        <div className="mt-3.5 border-t border-linha pt-2.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
            Na conversa
          </div>
          <ul className="space-y-1">
            {proposta.trecho.map((m, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-[1.5]">
                <span className={cn("shrink-0 font-semibold", m.direcao === "entrada" ? "text-navy" : "text-suave")}>
                  {m.direcao === "entrada" ? "Paciente" : "Nós"}
                </span>
                <span className="min-w-0 flex-1 truncate text-suave" title={m.corpo}>
                  {m.corpo || "(sem texto)"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* impedimento: a frase escrita, sempre — a moldura âmbar é reforço, nunca o recado */}
      {impedida && proposta.bloqueioTipo !== "sem_texto" && (
        <p className="mt-3.5 rounded-[7px] bg-amarelo-bg px-3.5 py-2.5 text-[13px] font-medium leading-[1.5] text-amarelo">
          {proposta.bloqueio}
        </p>
      )}

      <div className="mt-3.5 flex items-center gap-2">
        {!impedida && (
          <button
            onClick={() => decidir("aprovada")}
            disabled={pendente}
            className="rounded-md bg-laranja px-4 py-2 text-[13.5px] font-semibold text-branco transition-colors hover:bg-laranja-esc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45 disabled:opacity-50"
          >
            {pendente ? "Enviando…" : "Aprovar e enviar"}
          </button>
        )}
        <button
          onClick={() => decidir("rejeitada")}
          disabled={pendente}
          className="rounded-md border-[1.5px] border-linha-forte bg-branco px-4 py-2 text-[13.5px] font-semibold text-suave transition-colors hover:bg-hover hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45 disabled:opacity-50"
        >
          {pendente ? "Aguarde…" : "Recusar"}
        </button>
        {decidida?.estado === "erro" && (
          <span role="alert" className="text-[13px] font-medium text-vermelho">
            {decidida.texto}
          </span>
        )}
      </div>
    </article>
  );
}

function Aviso({ tom, children }: { tom: "vermelho" | "neutro"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "mt-5 rounded-[10px] border px-5 py-4 text-[13.5px] leading-[1.55]",
        tom === "vermelho"
          ? "border-vermelho-bd bg-vermelho-bg text-vermelho"
          : "border-linha bg-branco text-suave",
      )}
    >
      {children}
    </p>
  );
}

/** "16/07 11:21" — data curta no fuso da máquina de quem lê. */
function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
