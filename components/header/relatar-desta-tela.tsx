"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FormularioRelato } from "@/components/suporte/formulario-relato";
import type { Papel } from "@/components/configuracoes/regras/canais.ts";

/**
 * RELATAR O PROBLEMA **DESTA TELA** — o ato, não o lugar.
 *
 * Isto NÃO duplica o item "Relatar problema" da sidebar, e a distinção é a metade da resposta que o
 * M5 precisava (§4.3): a sidebar é o **lugar** (`/configuracoes/suporte`, onde a pessoa vê os
 * relatos dela e a conversa com o time); o header é o **ato com contexto**, sem sair da tela. O
 * valor não é o atalho — é que o relato nasce sabendo onde o problema aconteceu, coisa que um
 * formulário três cliques abaixo perde.
 *
 * A ROTA REAL, e é aqui que uma dependência inteira desapareceu. A SPEC-M6 §6.6 pedia ao M5 uma
 * chave nova `rota_origem` no payload. **Ela já existe e se chama `onde`** — está no payload, na
 * guarda dentro de `api.registrar_evento`, no projetor `porta.proj_suporte_ticket` e na coluna
 * `core.suporte_ticket.onde`, tudo no SHA implantado. E
 * `app/(app)/configuracoes/suporte/page.tsx:8-13` **já declara estar esperando este gatilho**:
 * *"o `referer` é a melhor aproximação disponível no servidor; quando o gatilho global entrar, ele
 * passa a rota real e este palpite deixa de ser usado."* Então o trabalho é uma linha —
 * `usePathname()` no lugar do palpite — e zero mudança de schema, de payload ou de coordenação.
 * Registro do erro de ter pedido o que já estava no ar: `ERROS-E-BLOQUEIOS.md` E-103.
 *
 * O QUE O ENVELOPE **NÃO** LEVA, e é decisão, não omissão: `lead_id`. Quem implementar isto vai ter
 * `selecionada.lead_id` à mão em `/conversas` e vai achar que é de graça carimbar. Não é.
 * (1) Ticket de suporte é fato do SISTEMA, não do lead — carimbar faria a ficha do lead exibir
 * "relatou um bug" no histórico do M4. (2) LGPD: o ledger é append-only, e ligar o ticket a um
 * titular cria vínculo de PII que o esquecimento teria de percorrer. (3) O bucket
 * `suporte-anexos` foi separado de `anexos-lead` exatamente para não cruzar com `core.anexo.path`
 * (`components/suporte/regras/suporte.ts:213-214`). Está escrito aqui para não ser "consertado".
 */
export function RelatarDestaTela({ meuPapel }: { meuPapel: Papel | null }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
        aria-label="Relatar problema desta tela"
        title="Relatar problema desta tela"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-[6px] text-suave hover:bg-hover hover:text-tinta",
          aberto && "bg-hover text-tinta",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-[19px] w-[19px]"
        >
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 8.2v4.6M12 15.6v.2" />
        </svg>
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(31,35,40,.28)]">
          {/* clique no fundo fecha; o painel para o clique dentro dele */}
          <div className="absolute inset-0" onClick={() => setAberto(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Relatar problema desta tela"
            className="relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto border-l border-linha bg-branco p-5"
          >
            {/* A pessoa NÃO SAI DA TELA: ao enviar, a folha fecha e ela continua onde estava. */}
            <FormularioRelato
              rotaAtual={pathname}
              meuPapel={meuPapel}
              aoSair={() => setAberto(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
