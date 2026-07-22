"use client";

import { useState } from "react";
import type { FichaDoLead } from "@/lib/dados/lead-painel";
import {
  inputParaValor,
  valorParaInput,
  valorParaTexto,
  type CampoFicha,
} from "@/lib/dados/ficha-calculos";
import { salvarCampoFicha } from "@/app/(app)/lead/actions";
import { cn } from "@/lib/utils";

/*
 * FICHA do lead (Rodada 8) — a coleta de dados que a operação faz DURANTE a conversa (o que
 * ela usa no Kommo). Grupos colapsáveis vindos da config `ficha_lead`; valores da projeção
 * core.lead_campo; edição inline emite `lead_atualizado {campos}` pela porta.
 * Estados honestos: config ausente → "não configurada"; projeção ausente (0028 pendente) →
 * read-only com aviso, SEM edição (evento sem projeção viraria valor fantasma na tela).
 */

function LinhaCampo({
  leadId,
  campo,
  valor,
  editavelAqui,
  aoAtualizar,
}: {
  leadId: string;
  campo: CampoFicha;
  valor: unknown;
  editavelAqui: boolean;
  aoAtualizar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [input, setInput] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function abrir() {
    if (!editavelAqui) return;
    setInput(valorParaInput(campo.tipo, valor));
    setErro(null);
    setEditando(true);
  }

  async function salvar() {
    const parse = inputParaValor(campo.tipo, input);
    if (!parse.ok) {
      setErro(parse.erro);
      return;
    }
    // sem mudança → só fecha, sem evento à toa
    if (valorParaInput(campo.tipo, valor) === input.trim()) {
      setEditando(false);
      return;
    }
    setSalvando(true);
    const r = await salvarCampoFicha(leadId, campo.slug, parse.valor);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.motivo ?? "erro ao salvar");
      return;
    }
    setEditando(false);
    aoAtualizar();
  }

  const clsInput =
    "w-full rounded-md border border-linha-forte bg-branco px-2 py-1 text-[0.82rem] text-tinta outline-none focus:border-laranja";

  return (
    <div className="py-[5px] text-[0.83rem]">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate pt-px text-suave" title={campo.nome}>
          {campo.nome}
        </span>
        {!editando ? (
          <button
            type="button"
            onClick={abrir}
            disabled={!editavelAqui}
            title={editavelAqui ? "Editar" : undefined}
            className={cn(
              "max-w-[55%] truncate text-right font-medium text-tinta",
              editavelAqui && "cursor-pointer rounded px-1 -mr-1 hover:bg-hover hover:text-navy",
              !editavelAqui && "cursor-default",
            )}
          >
            {valorParaTexto(campo.tipo, valor)}
          </button>
        ) : (
          <div className="w-[58%]">
            {campo.tipo === "opcao" || campo.tipo === "booleano" ? (
              <select
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setEditando(false)}
                className={clsInput}
              >
                <option value="">—</option>
                {campo.tipo === "booleano" ? (
                  <>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </>
                ) : (
                  campo.opcoes.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))
                )}
              </select>
            ) : (
              <input
                autoFocus
                type={campo.tipo === "data" ? "date" : "text"}
                inputMode={campo.tipo === "numero" ? "decimal" : undefined}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void salvar();
                  if (e.key === "Escape") setEditando(false);
                }}
                className={clsInput}
              />
            )}
            <div className="mt-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void salvar()}
                disabled={salvando}
                className="rounded bg-laranja px-2 py-0.5 text-[0.7rem] font-semibold text-branco hover:bg-laranja-esc disabled:opacity-60"
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="rounded px-1.5 py-0.5 text-[0.7rem] text-mute hover:text-suave"
              >
                Cancelar
              </button>
              {erro && <span className="text-[0.7rem] font-semibold text-vermelho">{erro}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FichaLead({
  leadId,
  ficha,
  aoAtualizar,
}: {
  leadId: string;
  ficha: FichaDoLead;
  aoAtualizar: () => void;
}) {
  if (!ficha.grupos) {
    return (
      <p className="text-[0.78rem] leading-relaxed text-mute">
        Ficha não configurada ainda — a definição dos campos (config <code>ficha_lead</code>)
        chega com a trilha de dados.
      </p>
    );
  }

  const projecaoOk = ficha.valores != null;
  const valores = ficha.valores ?? {};

  return (
    <div className="flex flex-col gap-1.5">
      {!projecaoOk && (
        <p className="mb-1 rounded-md bg-laranja-cl px-2.5 py-1.5 text-[0.72rem] leading-relaxed text-laranja-esc">
          Os valores da ficha ficam disponíveis quando a projeção (migration 0028) for aplicada
          — até lá a ficha é somente leitura.
        </p>
      )}
      {ficha.grupos.map((g, i) => (
        <details key={g.chave} open={i === 0} className="group rounded-[9px] border border-linha bg-branco">
          <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[0.78rem] font-semibold text-tinta [&::-webkit-details-marker]:hidden">
            <svg
              viewBox="0 0 24 24"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3 stroke-mute transition-transform group-open:rotate-90"
              fill="none"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            {g.nome}
            <span className="ml-auto font-normal tabular-nums text-mute">
              {g.campos.filter((c) => valores[c.slug] != null && valores[c.slug] !== "").length}/{g.campos.length}
            </span>
          </summary>
          <div className="border-t border-linha px-3 py-1.5">
            {g.campos.map((c) => (
              <LinhaCampo
                key={c.slug}
                leadId={leadId}
                campo={c}
                valor={valores[c.slug]}
                editavelAqui={c.editavel && projecaoOk}
                aoAtualizar={aoAtualizar}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
