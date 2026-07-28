"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { trocarDepartamentoAtivo } from "@/app/(app)/actions-escopo";
import type { Departamento } from "@/lib/departamentos/escopo";

/**
 * SELETOR DE DEPARTAMENTO — o elemento mais importante do header, e a razão nº 1 de ele existir.
 *
 * Não é enfeite e não é filtro: é SELETOR DE ESCOPO, no modelo do workspace switcher da LiderHub
 * (D6-b, com a referência e a captura do Diogo). Porte de FORMA — gatilho com iniciais + rótulo +
 * chevron, painel com marca no ativo — de `Whatsapp_saas/liderhub-web-app-main/apps/web/src/
 * components/workspace-switcher.tsx`, reuso autorizado (CLAUDE.md §3), traduzido para PT-BR e para
 * o nosso vocabulário. **Nenhum segredo, nenhuma credencial, nenhum `.env` deles veio junto.**
 *
 * Onde divergimos deles, de propósito: o seletor deles vive na sidebar (`SidebarMenu`); o nosso vai
 * no header, porque o D6-b manda e porque a nossa sidebar colapsada tem 60px — não cabe nome de
 * departamento nela. A forma porta; o lugar não.
 *
 * O que NÃO tem, e cada ausência é decisão:
 *  · "Todos os departamentos" — MORTO pelo D6-f. O rótulo do topo é promessa dura: o que está
 *    escrito ali é tudo o que a tela mostra, e "Todos" era a única opção que não podia ser promessa.
 *  · Busca — só acima de 6 departamentos (§5.7.3). Com 7 nós em 2 níveis, buscar é cerimônia; e a
 *    LiderHub também não tem, medido no código (o benchmark §3-bis.1 achou que a captura mostrava
 *    algo que o código não tem).
 *  · Contagem de membros/números por linha — é ACRÉSCIMO nosso, não porte, e depende de dado que
 *    hoje é 0 em todos (`v_usuario_departamento` nasce vazia). Contador chutado é pior que contador
 *    nenhum (`app/(app)/configuracoes/layout.tsx:14-17`, precedente já escrito neste código).
 *  · Rodapé "+ Novo departamento" — ver `C17-dep` no `components/header.tsx`.
 */
export function SeletorDepartamento({
  departamentos,
  ativo,
  comPendencia,
}: {
  departamentos: Departamento[];
  ativo: Departamento;
  /** Chaves com pendência. Binário: o componente só pergunta `includes`, nunca quantos. */
  comPendencia: string[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
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

  function trocar(chave: string) {
    if (pendente) return;
    if (chave === ativo.chave) {
      setAberto(false);
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await trocarDepartamentoAtivo(chave);
      if (!r.ok) {
        setErro(r.motivo ?? "não deu para trocar de departamento");
        return;
      }
      setAberto(false);
      // O RÓTULO SÓ MUDA DEPOIS QUE A RELEITURA CONFIRMA. Otimismo aqui faria o topo prometer um
      // escopo que a tela ainda não mostra — e o rótulo é promessa dura (D6-f). É o equivalente,
      // no nosso stack, do `invalidateWorkspaceScopedQueries` da LiderHub: escopo não estreita um
      // resultado, DESCARTA E REFAZ o mundo. A rota não muda: trocar de departamento não navega.
      router.refresh();
    });
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Departamento ativo: ${ativo.rotulo}. Trocar de departamento`}
        /*
         * `aria-busy`, e NÃO `disabled`, enquanto a troca resolve. Dois motivos, e o segundo é o
         * que decidiu: (1) `disabled` no meio de uma transição tira o foco do teclado do elemento
         * que a pessoa acabou de acionar; (2) o C6 mede que não existe affordance morto no header
         * — `disabled` ali dentro é a assinatura de "botão em breve", e um critério que não sabe
         * distinguir "desabilitado porque não existe" de "ocupado por meio segundo" é um critério
         * que alguém desliga. Cliques repetidos são absorvidos pelo `pendente` no início do
         * handler, que é onde a proteção deve estar mesmo.
         */
        aria-busy={pendente}
        className={cn(
          "flex h-8 max-w-[220px] items-center gap-2 rounded-[6px] px-1.5 text-[13.5px] font-medium text-tinta hover:bg-hover",
          aberto && "bg-hover",
          pendente && "opacity-60",
        )}
      >
        <span
          aria-hidden
          className="grid h-6 w-6 flex-none place-items-center rounded-[5px] bg-navy text-[10.5px] font-semibold text-branco"
        >
          {iniciaisDepartamento(ativo.rotulo)}
        </span>
        <span className="truncate">{ativo.rotulo}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-[14px] w-[14px] flex-none text-suave"
        >
          <path d="m8 9 4-4 4 4M16 15l-4 4-4-4" />
        </svg>
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label="Departamentos"
          className="absolute left-0 top-[38px] z-50 w-[260px] overflow-hidden rounded-[10px] border border-linha bg-branco py-1 shadow-[0_4px_16px_rgba(31,35,40,.10)]"
        >
          <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-suave">
            Departamento
          </div>
          {departamentos.map((d) => {
            const ehAtivo = d.chave === ativo.chave;
            // O ponto só aparece no departamento INATIVO: no ativo, a pendência já está na tela.
            const pendencia = !ehAtivo && comPendencia.includes(d.chave);
            return (
              <button
                key={d.chave}
                type="button"
                role="menuitemradio"
                aria-checked={ehAtivo}
                onClick={() => trocar(d.chave)}
                className={cn(
                  "flex w-full items-center gap-2 py-1.5 pr-3 text-left text-[13.5px] hover:bg-hover",
                  d.pai ? "pl-[38px]" : "pl-3",
                  ehAtivo ? "font-semibold text-navy" : "font-medium text-tinta",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{d.rotulo}</span>
                {pendencia && (
                  <span
                    // TEM/NÃO TEM, nunca número (ARB-R17-33). `title` e `sr-only` porque um ponto
                    // colorido sozinho não diz nada a quem usa leitor de tela nem a quem não
                    // distingue a cor.
                    title="Tem conversa não lida neste departamento"
                    className="flex flex-none items-center"
                  >
                    <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-laranja" />
                    <span className="sr-only">tem pendência</span>
                  </span>
                )}
                {ehAtivo && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className="h-[14px] w-[14px] flex-none"
                  >
                    <path d="m5 12.5 4.5 4.5L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
          {erro && (
            <p role="alert" className="px-3 pb-1.5 pt-2 text-[12px] text-vermelho">
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Iniciais do RÓTULO, que é prosa editável na tela — nunca da chave. Ler a chave produziria "PV"
 * para "Pré-venda" em vez de "Pv" e, pior, amarraria o visual ao vocabulário técnico.
 */
function iniciaisDepartamento(rotulo: string): string {
  const partes = rotulo.trim().split(/[\s-]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return rotulo.trim().slice(0, 2).toUpperCase();
}
