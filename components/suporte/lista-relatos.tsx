"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolverChamado } from "@/app/(app)/configuracoes/suporte/actions";
import {
  codigoTicket,
  contarPorAba,
  filtrarTickets,
  podeResolverChamado,
  rotuloTipo,
  type AbaTicket,
  type Ticket,
} from "./regras/suporte.ts";
import type { Papel } from "../configuracoes/regras/canais.ts";
import { BTN, BlocoVazio, Cabecalho, Dialogo, AREA, Faixa, Fantasma, dataCurta } from "../configuracoes/kit";
import { FormularioRelato } from "./formulario-relato";

/**
 * F12 · Suporte — bug e ideia que vieram de quem usa o sistema.
 *
 * Duas escolhas do mockup r10 que mudam o que a tela é:
 *  · CONTADOR só de ABERTOS no cabeçalho. "3 abertos" é débito; "17 relatos" é acervo, e acervo
 *    não pede nada de ninguém.
 *  · O ESCOPO é dito em voz alta quando é restrito: quem não é gestão vê só os próprios relatos, e
 *    a tela avisa — senão a pessoa acha que o sistema tem três chamados no total.
 */
export function ListaRelatos({
  tickets,
  meuPapel,
  indisponivel,
  rotaAtual,
}: {
  tickets: Ticket[];
  meuPapel: Papel | null;
  indisponivel: boolean;
  rotaAtual: string;
}) {
  const router = useRouter();
  const gestor = podeResolverChamado(meuPapel);
  const [aba, setAba] = useState<AbaTicket>("abertos");
  const [relatando, setRelatando] = useState(false);
  const [resolvendo, setResolvendo] = useState<Ticket | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const contagem = useMemo(() => contarPorAba(tickets), [tickets]);
  const visiveis = useMemo(() => filtrarTickets(tickets, aba), [tickets, aba]);

  if (relatando) {
    return <FormularioRelato rotaAtual={rotaAtual} meuPapel={meuPapel} aoSair={() => setRelatando(false)} />;
  }

  return (
    <>
      <Cabecalho
        titulo="Suporte"
        contador={`${contagem.abertos} ${contagem.abertos === 1 ? "aberto" : "abertos"}`}
        descricao="Bug e ideia que vieram de quem usa o sistema."
        acoes={
          <button className={`${BTN.primario} ml-auto`} type="button" onClick={() => setRelatando(true)}>
            Relatar problema
          </button>
        }
      />

      <div className="flex gap-[18px] border-b border-linha" role="tablist" aria-label="Filtro de estado">
        {(
          [
            ["abertos", "Abertos"],
            ["resolvidos", "Resolvidos"],
            ["todos", "Todos"],
          ] as const
        ).map(([k, r]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={aba === k}
            onClick={() => setAba(k)}
            className={`relative pb-2 text-[13.5px] ${
              aba === k
                ? "font-semibold text-navy after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-navy after:content-['']"
                : "text-suave hover:text-tinta"
            }`}
          >
            {r}
            <span className="ml-1.5 font-mono text-[11.5px] tabular-nums text-suave">{contagem[k]}</span>
          </button>
        ))}
      </div>

      {!gestor ? (
        <p className="mt-2.5 text-[13px] text-suave">Você vê só os relatos que você mesmo enviou.</p>
      ) : null}

      <div className="mt-3">
        {erro ? <Faixa tom="erro">{erro}</Faixa> : null}
        {indisponivel ? (
          <Faixa tom="erro">
            Não foi possível ler <span className="font-mono">core.v_suporte_ticket</span>. A conexão
            caiu ou a migration ainda não subiu neste ambiente.
          </Faixa>
        ) : null}
      </div>

      <div role="tabpanel">
        {indisponivel ? (
          <>
            <Fantasma larguras={[48, 38, 240]} segunda={[150]} />
            <Fantasma larguras={[48, 38, 240]} segunda={[150]} />
          </>
        ) : visiveis.length === 0 ? (
          <BlocoVazio
            titulo={aba === "resolvidos" ? "Nenhum relato resolvido ainda." : "Nenhum relato aberto."}
            apoio="Achou algo errado ou teve uma ideia? Conte aqui — vai com o print e a tela junto."
            acao={
              <button className={BTN.primario} type="button" onClick={() => setRelatando(true)}>
                Relatar problema
              </button>
            }
          />
        ) : (
          visiveis.map((t) => (
            <div
              key={t.id}
              className="grid min-h-[48px] grid-cols-[58px_54px_minmax(0,1fr)_78px] items-center gap-3 border-b border-linha px-2 py-1.5 hover:bg-hover"
            >
              <span className="font-mono text-[12.5px] tabular-nums text-tinta">
                {codigoTicket(t.numero)}
              </span>
              <span className="text-[11.5px] text-suave">{rotuloTipo(t.tipo)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-tinta">{t.titulo}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-suave">
                  {t.autor_nome ?? t.autor_email ?? "—"}
                  {t.onde ? <span className="ml-1.5 font-mono text-mute">{t.onde}</span> : null}
                  {t.anexos > 0 ? <span className="ml-1.5 text-mute">{t.anexos} img</span> : null}
                </span>
              </span>
              <span className="flex items-center justify-end gap-2">
                <span className="text-[12.5px] tabular-nums text-suave">{dataCurta(t.aberto_em)}</span>
                {gestor && t.status === "aberto" ? (
                  <button className={BTN.mini} type="button" onClick={() => setResolvendo(t)}>
                    Resolver
                  </button>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>

      {resolvendo ? (
        <DialogoResolver
          ticket={resolvendo}
          aoFechar={() => {
            setResolvendo(null);
            router.refresh();
          }}
          aoErro={(m) => {
            setErro(m);
            setResolvendo(null);
          }}
        />
      ) : null}
    </>
  );
}

function DialogoResolver({
  ticket,
  aoFechar,
  aoErro,
}: {
  ticket: Ticket;
  aoFechar: () => void;
  aoErro: (m: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [pendente, iniciar] = useTransition();
  return (
    <Dialogo
      titulo={`Resolver ${codigoTicket(ticket.numero)}`}
      aoFechar={aoFechar}
      acoes={
        <>
          <button className={BTN.secundario} type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            className={BTN.primario}
            type="button"
            disabled={pendente || !texto.trim()}
            onClick={() =>
              iniciar(async () => {
                const r = await resolverChamado(ticket.id, texto);
                if (!r.ok) aoErro(r.motivo ?? "não deu para resolver");
                else aoFechar();
              })
            }
          >
            Registrar resposta
          </button>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-suave">
        Escreva o que foi feito. É isto que quem abriu o relato vai ler.
      </p>
      <textarea
        className={AREA}
        rows={4}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="o que mudou, e o que a pessoa deve fazer agora"
      />
    </Dialogo>
  );
}
