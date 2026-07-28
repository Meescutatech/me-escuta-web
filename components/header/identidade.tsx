"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Departamento } from "@/lib/departamentos/escopo";

/**
 * QUEM EU SOU — nome, email, os departamentos da pessoa e Sair.
 *
 * Hoje a identidade mora no rodapé da sidebar, **atrás do hover** (`components/sidebar.tsx:212-231`,
 * `opacity-0 ... group-hover:opacity-100`) e a sidebar colapsada tem 60px. Pela regra do §4.1
 * identidade é header: não é destino, e muda com quem está logado.
 *
 * MAS O BLOCO DA SIDEBAR CONTINUA EXISTINDO NESTA RODADA, e a duplicação é declarada, não
 * esquecida: removê-lo é alterar linhas existentes de `components/sidebar.tsx`, e o ARB-05 restringe
 * aquele arquivo a duas inserções nominais, "nenhuma linha existente alterada". A extensão do ARB-05
 * é pedido em aberto ao Orquestrador (SPEC-M6 §9.4). Enquanto ela não sair, a identidade fica
 * duplicada por uma rodada — dívida com destino — e o **C8** (`git diff` vazio em `sidebar.tsx`)
 * existe para me impedir de "resolver" isso sozinho.
 */
export function Identidade({
  email,
  nome,
  departamentos,
}: {
  email: string;
  nome: string | null;
  /** Os departamentos que a pessoa vê. Lista, não contagem: aqui o nome é a informação. */
  departamentos: Departamento[];
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    const aoClicar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicar);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Sua conta: ${nome ?? email}`}
        className="grid h-7 w-7 place-items-center rounded-full bg-navy text-[11.5px] font-semibold text-branco"
      >
        {iniciais(nome ?? email)}
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label="Sua conta"
          className="absolute right-0 top-[36px] z-50 w-[248px] overflow-hidden rounded-[10px] border border-linha bg-branco shadow-[0_4px_16px_rgba(31,35,40,.10)]"
        >
          <div className="border-b border-linha px-3 py-2.5">
            <p className="truncate text-[13.5px] font-semibold text-tinta">{nome ?? email.split("@")[0]}</p>
            <p className="truncate text-[12px] text-suave">{email}</p>
          </div>
          <div className="border-b border-linha px-3 py-2.5">
            <p className="pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-suave">
              Seus departamentos
            </p>
            {departamentos.length === 0 ? (
              // Estado vazio com o motivo, não em branco. Hoje `core.usuario_departamento` nasce
              // vazia e o fail-open é o caminho NORMAL — quem lê "nenhum" sem explicação conclui
              // que perdeu acesso.
              <p className="text-[12.5px] text-suave">
                Você ainda não tem vínculo — está vendo todos, menos o clínico.
              </p>
            ) : (
              <p className="text-[12.5px] text-tinta">
                {departamentos.map((d) => d.rotulo).join(" · ")}
              </p>
            )}
          </div>
          <form action="/auth/signout" method="post" className="p-1.5">
            <button
              type="submit"
              className="w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] font-medium text-suave hover:bg-hover hover:text-tinta"
            >
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Mesma derivação da sidebar (`sidebar.tsx:77-82`), para as duas iniciais não divergirem. */
function iniciais(quem: string): string {
  const base = quem.includes("@") ? quem.split("@")[0] : quem;
  const nome = base.replace(/[._-]/g, " ").trim();
  const partes = nome.split(/\s+/);
  const letras = partes.length >= 2 ? partes[0][0] + partes[1][0] : nome.slice(0, 2);
  return letras.toUpperCase();
}
