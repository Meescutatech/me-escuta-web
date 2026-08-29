"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Departamento } from "@/lib/departamentos/escopo";
import { ITENS_MENU_CONTA, ROTA_SIGNOUT, linhaDepartamentos } from "@/lib/header/navegacao";

/**
 * QUEM EU SOU — o avatar abre um menu com nome + email, Configurações e Sair.
 *
 * F4 (27/08): o rodapé "admin · Sair" da sidebar foi removido e este menu é o ÚNICO lugar de
 * Sair e o ÚNICO caminho de menu para Configurações (saiu da sidebar). A lista de departamentos,
 * que antes era o corpo do dropdown, vira linha secundária pequena sob o email.
 *
 * Teclado: `role="menu"` com `menuitem`s; setas ↑/↓ movem o foco, Home/End vão às pontas, Esc
 * fecha e devolve o foco ao avatar; ao abrir, o foco vai ao primeiro item. Anel de foco visível
 * em tudo que recebe Tab.
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
  const gatilho = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const itensFocaveis = () =>
    Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!aberto) return;
    itensFocaveis()[0]?.focus();
    const aoClicar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", aoClicar);
    return () => document.removeEventListener("mousedown", aoClicar);
  }, [aberto]);

  const fechar = () => {
    setAberto(false);
    gatilho.current?.focus();
  };

  const aoTeclarNoMenu = (e: React.KeyboardEvent) => {
    const itens = itensFocaveis();
    const i = itens.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      fechar();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      itens[(i + 1) % itens.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      itens[(i - 1 + itens.length) % itens.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      itens[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itens[itens.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setAberto(false);
    }
  };

  const classeItem =
    "block w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] font-medium text-tinta no-underline hover:bg-hover focus-visible:outline-none focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-laranja/45";

  return (
    <div ref={caixa} className="relative">
      <button
        ref={gatilho}
        type="button"
        onClick={() => setAberto((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !aberto) {
            e.preventDefault();
            setAberto(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls="menu-conta"
        aria-label={`Sua conta: ${nome ?? email}`}
        className="grid h-7 w-7 place-items-center rounded-full bg-navy text-[11.5px] font-semibold text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/45 focus-visible:ring-offset-2 focus-visible:ring-offset-branco"
      >
        {iniciais(nome ?? email)}
      </button>

      {aberto && (
        <div
          id="menu-conta"
          ref={menu}
          role="menu"
          aria-label="Sua conta"
          onKeyDown={aoTeclarNoMenu}
          className="absolute right-0 top-[36px] z-50 w-[248px] overflow-hidden rounded-[10px] border border-linha bg-branco shadow-[0_4px_16px_rgba(31,35,40,.10)]"
        >
          <div className="border-b border-linha px-3 py-2.5">
            <p className="truncate text-[13.5px] font-semibold text-tinta">{nome ?? email.split("@")[0]}</p>
            <p className="truncate text-[12px] text-suave">{email}</p>
            {/* departamentos: linha secundária, não seção — o nome é a informação, não o título */}
            <p
              className="mt-1 truncate text-[11px] text-suave"
              title={departamentos.map((d) => d.rotulo).join(" · ")}
            >
              {linhaDepartamentos(departamentos.map((d) => d.rotulo))}
            </p>
          </div>
          <div className="p-1.5">
            {ITENS_MENU_CONTA.map((it) =>
              it.id === "sair" ? (
                <form key={it.id} action={ROTA_SIGNOUT} method="post">
                  <button type="submit" role="menuitem" className={classeItem}>
                    {it.rotulo}
                  </button>
                </form>
              ) : (
                <Link
                  key={it.id}
                  href={it.href}
                  role="menuitem"
                  onClick={() => setAberto(false)}
                  className={classeItem}
                >
                  {it.rotulo}
                </Link>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Mesma derivação que a sidebar usava, para as iniciais não divergirem entre lugares. */
function iniciais(quem: string): string {
  const base = quem.includes("@") ? quem.split("@")[0] : quem;
  const nome = base.replace(/[._-]/g, " ").trim();
  const partes = nome.split(/\s+/);
  const letras = partes.length >= 2 ? partes[0][0] + partes[1][0] : nome.slice(0, 2);
  return letras.toUpperCase();
}
