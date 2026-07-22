"use client";

import { useState } from "react";
import type { AnotacaoLead } from "@/lib/dados/lead-painel";
import { fmtDataHora } from "@/lib/dados/ficha-calculos";
import { criarAnotacaoLead } from "@/app/(app)/lead/actions";

/*
 * ANOTAÇÕES do lead (Rodada 8) — lista da projeção core.anotacao + criar (evento
 * anotacao_adicionada pela porta). Autor exibido = payload.autor (e-mail de quem escreveu).
 */

/** autor legível: e-mail vira o prefixo; artefatos técnicos (humano:<uid>) viram "equipe". */
function rotuloAutor(autor: string | null): string {
  if (!autor) return "equipe";
  if (/^humano:/i.test(autor) || /^sistema$/i.test(autor)) return "equipe";
  return autor.includes("@") ? autor.split("@")[0] : autor;
}

export function AnotacoesLead({
  leadId,
  anotacoes,
  autor,
  aoAtualizar,
}: {
  leadId: string;
  anotacoes: AnotacaoLead[];
  autor: string | null;
  aoAtualizar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const agora = new Date();

  async function criar() {
    if (!texto.trim() || ocupado) return;
    setOcupado(true);
    setErro(null);
    const r = await criarAnotacaoLead(leadId, texto, autor);
    setOcupado(false);
    if (!r.ok) {
      setErro(r.motivo ?? "erro ao salvar");
      return;
    }
    setTexto("");
    aoAtualizar();
  }

  return (
    <div className="flex flex-col gap-1.5">
      {anotacoes.length === 0 && <p className="text-[0.78rem] text-mute">Nenhuma anotação ainda.</p>}

      {anotacoes.map((n) => (
        <div key={n.id} className="rounded-md border border-linha border-l-[3px] border-l-laranja-cl bg-branco px-3 py-2">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-[0.72rem] font-semibold text-navy">{rotuloAutor(n.autor)}</span>
            <span className="ml-auto shrink-0 text-[0.68rem] tabular-nums text-mute">
              {fmtDataHora(n.criado_em, agora)}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-[0.8rem] leading-relaxed text-texto">{n.texto}</p>
        </div>
      ))}

      <div className="flex items-end gap-1.5 rounded-[9px] border-[1.5px] border-borda-forte bg-branco py-1.5 pl-2.5 pr-1.5">
        <textarea
          rows={1}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void criar();
            }
          }}
          placeholder="Anotação para a equipe…"
          className="max-h-24 min-w-0 flex-1 resize-none bg-transparent py-1 text-[0.8rem] outline-none placeholder:text-mute"
        />
        <button
          type="button"
          onClick={() => void criar()}
          disabled={ocupado || !texto.trim()}
          title="Salvar anotação"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-laranja text-branco hover:bg-laranja-esc disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 stroke-current" fill="none">
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
      {erro && <p className="text-[0.72rem] font-semibold text-vermelho">{erro}</p>}
    </div>
  );
}
