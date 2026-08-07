"use client";

import { useEffect, useRef, useState } from "react";
import type { MotivoPerda } from "@/lib/dados/motivo-perda";
import { cn } from "@/lib/utils";

/**
 * MOTIVO DE PERDA (R20) — o diálogo que aparece quando um card cai numa etapa de tipo `perdido`.
 *
 * Ele é BLOQUEANTE de propósito, e essa é a decisão de desenho que importa: o Kommo pergunta o
 * motivo na saída, e é de lá que vem o único dado que responde "por que perdemos". Deixar passar
 * sem motivo transforma 392 perdas por trimestre em um número sem leitura.
 *
 * Mas cancelar DESFAZ a movimentação — nunca deixa o lead perdido sem motivo. O estado "perdido
 * sem motivo" não existe por construção: ou os dois, ou nenhum.
 */
export function DialogoMotivoPerda({
  nomeLead,
  etapaNome,
  motivos,
  daConfig,
  onConfirmar,
  onCancelar,
}: {
  nomeLead: string;
  etapaNome: string;
  motivos: MotivoPerda[];
  /** false = a config `motivo_perda` ainda não existe; a lista é a semente embutida */
  daConfig: boolean;
  onConfirmar: (motivo: { chave: string; detalhe?: string }) => void;
  onCancelar: () => void;
}) {
  const [chave, setChave] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") onCancelar();
    }
    document.addEventListener("keydown", aoTeclar);
    caixa.current?.focus();
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onCancelar]);

  const escolhido = motivos.find((m) => m.chave === chave) ?? null;
  const faltaDetalhe = escolhido?.pedeDetalhe === true && detalhe.trim() === "";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/20 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancelar();
      }}
    >
      <div
        ref={caixa}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Motivo da perda"
        className="w-full max-w-[420px] rounded-[10px] border border-linha bg-branco p-5 shadow-forte outline-none"
      >
        <h2 className="text-[15px] font-[650] text-tinta">Por que perdemos?</h2>
        <p className="mt-1 text-[12.5px] text-suave">
          <b className="font-semibold text-tinta">{nomeLead}</b> vai para <b className="font-semibold text-tinta">{etapaNome}</b>.
          Sem motivo, a movimentação não acontece.
        </p>

        <div className="mt-3.5 flex flex-col gap-0.5">
          {motivos.map((m) => (
            <label
              key={m.chave}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[13px] transition-colors",
                chave === m.chave ? "bg-laranja-cl text-laranja-esc" : "text-tinta hover:bg-hover",
              )}
            >
              <input
                type="radio"
                name="motivo-perda"
                checked={chave === m.chave}
                onChange={() => {
                  setChave(m.chave);
                  setDetalhe("");
                }}
                className="h-3.5 w-3.5"
              />
              {m.rotulo}
            </label>
          ))}
        </div>

        {escolhido?.pedeDetalhe && (
          <label className="mt-3 block">
            <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-suave">Em uma frase</span>
            <input
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              autoFocus
              placeholder="o que ela disse"
              className="mt-1 w-full rounded-[6px] border border-linha bg-branco px-2.5 py-1.5 text-[13px] text-tinta outline-none focus:border-linha-forte"
            />
          </label>
        )}

        {!daConfig && (
          <p className="mt-3 font-mono text-[10.5px] text-mute">
            lista padrão — os motivos ainda não são editáveis nas configurações
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-[6px] border border-linha px-3 py-1.5 text-[12.5px] text-suave hover:border-linha-forte"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => chave && onConfirmar({ chave, detalhe: detalhe.trim() || undefined })}
            disabled={!chave || faltaDetalhe}
            className={cn(
              "rounded-[6px] bg-laranja px-3 py-1.5 text-[12.5px] font-medium text-branco transition-colors hover:bg-laranja-esc",
              (!chave || faltaDetalhe) && "opacity-50",
            )}
          >
            Marcar como perdido
          </button>
        </div>
      </div>
    </div>
  );
}
