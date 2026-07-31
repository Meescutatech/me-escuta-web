"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { comentarChamado } from "@/app/(app)/suporte/actions";
import { AREA, BTN, Faixa, dataHora } from "../configuracoes/kit";
import type { ComentarioTicket } from "./regras/suporte.ts";

/**
 * M5 · O FIO DE CONVERSA — o único componente novo do item.
 *
 * O mockup r10 tem um bloco **Resposta** único. O pedido era *interativo*, e uma resposta só não é
 * conversa: vira LISTA cronológica do mesmo bloco (autor, carimbo, texto), com o campo de escrever
 * ao pé. É repetição de uma gramática que já existe desenhada — por isso coube em spec e o
 * `suporte-r11.html` não precisou existir.
 *
 * DUAS COISAS QUE NÃO SÃO DETALHE:
 *
 * 1. QUEM NÃO PODE COMENTAR NÃO VÊ O CAMPO — não vê o campo desabilitado. Campo cinza sem
 *    explicação é a tela dizendo "você pode, mas não agora", e não é isso: é "não é seu"
 *    (SPEC-M5 §5.5). A regra é `podeComentarChamado`, espelho da policy de SELECT da 0070.
 *
 * 2. O TEXTO DIGITADO NÃO SE PERDE quando a escrita falha. O `texto` só é limpo DEPOIS de a porta
 *    confirmar. Perder um parágrafo porque a rede caiu é como se ensina alguém a não relatar bug
 *    de novo — e quem está aqui já está com um problema.
 */
export function FioConversa({
  ticketId,
  comentarios,
  podeComentar,
  meuUid,
}: {
  ticketId: string;
  comentarios: ComentarioTicket[];
  podeComentar: boolean;
  meuUid: string | null;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const r = await comentarChamado(ticketId, texto);
      if (!r.ok) {
        // a mensagem da porta aparece CRUA, em PT-BR (ARB-21). Ela é escrita para ser lida por
        // quem opera — traduzir para "algo deu errado" é jogar fora a única informação útil.
        setErro(r.motivo ?? "não deu para enviar o comentário");
        return;
      }
      setTexto("");
      router.refresh();
    });
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2.5 text-[13.5px] font-semibold text-tinta">
        Conversa
        {comentarios.length > 0 ? (
          <span className="ml-1.5 font-mono text-[11.5px] tabular-nums text-suave">
            {comentarios.length}
          </span>
        ) : null}
      </h2>

      {comentarios.length === 0 ? (
        <p className="text-[13px] text-suave">
          Ainda sem resposta. {podeComentar ? "Escreva abaixo se tiver algo a acrescentar." : null}
        </p>
      ) : (
        <ol className="border-t border-linha">
          {comentarios.map((c) => {
            const meu = meuUid !== null && c.autor_id === meuUid;
            return (
              <li key={c.id} className="border-b border-linha py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12.5px] font-medium text-tinta">
                    {meu ? "Você" : (c.autor_id ?? "—")}
                  </span>
                  <span className="font-mono text-[11.5px] tabular-nums text-suave">
                    {dataHora(c.criado_em)}
                  </span>
                </div>
                {/* whitespace-pre-wrap: o relato foi digitado com quebras de linha e elas são
                    parte do que a pessoa quis dizer — colapsá-las remonta o texto em um parágrafo
                    que ela não escreveu. */}
                <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-tinta">
                  {c.texto}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {podeComentar ? (
        <div className="mt-3.5">
          {erro ? <Faixa tom="erro">{erro}</Faixa> : null}
          <textarea
            className={AREA}
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="responder no chamado"
            aria-label="Escrever no chamado"
          />
          <div className="mt-2 flex items-center gap-2.5">
            <button
              className={BTN.primario}
              type="button"
              disabled={pendente || texto.trim().length === 0}
              onClick={enviar}
            >
              {pendente ? "Enviando…" : "Responder"}
            </button>
            <span className="text-[12px] text-suave">
              Quem recebe a resposta é avisado no sino.
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
