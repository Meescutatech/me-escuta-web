"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  convidadoHa,
  emailConviteValido,
  iniciaisMembro,
  opcoesDePapel,
  ordenarTabela,
  papelConvidavelOuPadrao,
  PAPEIS_CONVIDAVEIS,
  podeEditarFuncao,
  podeGerirMembros,
  podeMudarPapel,
  podeRevogar,
  rotuloPapel,
  type ConviteLinha,
  type MembroLinha,
  type Papel,
} from "@/lib/membros";
import {
  gerarLinkConvite,
  mudarFuncao,
  mudarPapel,
  reativarAcesso,
  reenviarConvite,
  revogarAcesso,
  revogarConvite,
} from "@/app/(app)/configuracoes/membros/actions";

/**
 * Aba Membros — fiel ao mockup configuracoes-membros-v2.html (receita do benchmark):
 * UMA tabela (ativos + pendentes), convite = uma linha de formulário, papel = select
 * inline, ⋯ para ativos, Reenviar/Revogar para pendentes. Hairline é a única borda.
 * MUDANÇA DE ESCOPO 22/07: botão primário = GERAR LINK de convite (email atrás de flag).
 */

const GRID = "grid grid-cols-[minmax(0,1fr)_186px_108px_122px] items-center gap-3 max-[980px]:grid-cols-[minmax(0,1fr)_108px_122px]";

export function TabelaMembros({
  meuId,
  meuPapel,
  membros,
  convites,
}: {
  meuId: string;
  meuPapel: Papel | null;
  membros: MembroLinha[];
  convites: ConviteLinha[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [linkGerado, setLinkGerado] = useState<{ url: string; email: string; copiado: boolean } | null>(null);
  const [editandoFuncao, setEditandoFuncao] = useState<{ id: string; valor: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const papelRef = useRef<HTMLSelectElement>(null);

  const gestor = podeGerirMembros(meuPapel);
  const { ativos, pendentes } = useMemo(() => ordenarTabela(membros, convites), [membros, convites]);
  const revogados = useMemo(() => membros.filter((m) => !m.ativo), [membros]);

  function rodar(acao: () => Promise<{ ok: boolean; motivo?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.motivo ?? "ação recusada");
      router.refresh();
    });
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  function gerarLink() {
    const email = emailRef.current?.value.trim().toLowerCase() ?? "";
    // Era `(value === "admin" ? "admin" : "membro")`: um ternário que traduzia TODA opção não
    // prevista para "membro" sem erro nenhum. Acrescentar a `<option value="marketing">` sem
    // consertar esta linha faria a pessoa escolher Marketing e receber Membro — em silêncio, com
    // a tela confirmando o convite. O leitor tem que sair da MESMA lista que monta as opções.
    const papel = papelConvidavelOuPadrao(papelRef.current?.value);
    if (!emailConviteValido(email)) {
      setErro("informe um email válido");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const r = await gerarLinkConvite(email, papel);
      if (!r.ok || !r.url) {
        setErro(r.motivo ?? "não foi possível gerar o convite");
        return;
      }
      const copiado = await copiar(r.url);
      setLinkGerado({ url: r.url, email, copiado });
      if (emailRef.current) emailRef.current.value = "";
      router.refresh();
    });
  }

  function reenviar(c: ConviteLinha) {
    setErro(null);
    startTransition(async () => {
      const r = await reenviarConvite(c.id);
      if (!r.ok || !r.url) {
        setErro(r.motivo ?? "não foi possível gerar novo link");
        return;
      }
      const copiado = await copiar(r.url);
      setLinkGerado({ url: r.url, email: c.email, copiado });
      router.refresh();
    });
  }

  function salvarFuncao(m: MembroLinha) {
    if (!editandoFuncao) return;
    const valor = editandoFuncao.valor.trim();
    setEditandoFuncao(null);
    if (valor === (m.funcao ?? "")) return;
    rodar(() => mudarFuncao(m.id, m.funcao, valor));
  }

  return (
    <div>
      {/* M6: o NOME DA PÁGINA subiu para o header (fonte única rota→título, `lib/header/titulos.ts`).
          A LINHA fica — os instrumentos são da tela; só o nome saiu dela (SPEC-M6 §5.4). */}
      <p className="mt-1.5 text-[13.5px] text-suave">Convide pessoas, defina o papel de cada uma e remova acessos.</p>

      {/* convite: uma linha de formulário (V1 = LINK; email fica atrás de flag de config) */}
      {gestor && (
        <form
          className="mb-2 mt-6 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            gerarLink();
          }}
        >
          <input
            ref={emailRef}
            type="email"
            placeholder="email@meescuta.com"
            aria-label="E-mail do convidado"
            className="h-[34px] min-w-0 flex-1 rounded-md border border-linha bg-branco px-2.5 text-[13px] text-tinta placeholder:text-mute focus:border-laranja focus:outline-none"
          />
          <span className="relative flex-none">
            <select
              ref={papelRef}
              aria-label="Papel do convidado"
              defaultValue="membro"
              className="h-[34px] cursor-pointer appearance-none rounded-md border border-linha bg-branco pl-2.5 pr-7 text-[13px] text-tinta"
            >
              {PAPEIS_CONVIDAVEIS.map((p) => (
                <option key={p} value={p}>
                  {rotuloPapel(p)}
                </option>
              ))}
            </select>
            <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-1.5 w-1.5 -translate-y-[70%] rotate-45 border-b-[1.5px] border-r-[1.5px] border-suave" />
          </span>
          <button
            type="submit"
            disabled={pendente}
            className="h-[34px] flex-none whitespace-nowrap rounded-md bg-laranja px-3.5 text-[13px] font-semibold text-branco hover:bg-laranja-esc disabled:opacity-60"
          >
            Gerar link de convite
          </button>
        </form>
      )}

      {erro && (
        <p role="alert" className="mb-2 rounded-md bg-[#FBEFED] px-3 py-2 text-[12.5px] text-vermelho">
          {erro}
        </p>
      )}

      {linkGerado && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-linha bg-board px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-suave" title={linkGerado.url}>
            {linkGerado.url}
          </span>
          <span className="flex-none text-[11.5px] text-verde">
            {linkGerado.copiado ? `copiado — mande para ${linkGerado.email}` : `link de ${linkGerado.email}`}
          </span>
          <button
            type="button"
            onClick={() => void copiar(linkGerado.url).then((ok) => setLinkGerado({ ...linkGerado, copiado: ok }))}
            className="flex-none rounded-md px-2 py-1 text-[12.5px] font-medium text-suave hover:bg-hover hover:text-tinta"
          >
            Copiar link
          </button>
        </div>
      )}

      {/* tabela única: ativos + pendentes */}
      <div className="mt-4 w-full">
        <div aria-hidden className={`${GRID} border-b border-linha px-2 pb-2`}>
          <span className="text-[11.5px] font-medium text-mute">Nome</span>
          <span className="text-[11.5px] font-medium text-mute max-[980px]:hidden">E-mail</span>
          <span className="text-[11.5px] font-medium text-mute">Papel</span>
          <span />
        </div>

        {ativos.map((m) => {
          const souEu = m.id === meuId;
          const papelEditavel = podeMudarPapel(meuPapel, { papel: m.papel, souEu });
          return (
            <div key={m.id} className={`${GRID} min-h-[48px] border-b border-[#F1F0EC] px-2 py-1.5 last:border-b-0 hover:bg-hover`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-7 w-7 flex-none place-items-center rounded-full bg-navy text-[11px] font-semibold text-branco">
                  {iniciaisMembro(m.nome, m.email)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-tinta">
                    {m.nome ?? m.email.split("@")[0]}
                    {souEu && <span className="text-[11.5px] font-normal text-mute"> · você</span>}
                  </div>
                  {editandoFuncao?.id === m.id ? (
                    <input
                      autoFocus
                      value={editandoFuncao.valor}
                      onChange={(e) => setEditandoFuncao({ id: m.id, valor: e.target.value })}
                      onBlur={() => salvarFuncao(m)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") salvarFuncao(m);
                        if (e.key === "Escape") setEditandoFuncao(null);
                      }}
                      placeholder="Função (ex.: Atendimento, Fono)"
                      aria-label={`Função de ${m.nome ?? m.email}`}
                      className="mt-0.5 w-full max-w-[220px] rounded border border-linha bg-branco px-1.5 py-0.5 text-[11.5px] text-tinta focus:border-laranja focus:outline-none"
                    />
                  ) : (
                    <div className="truncate text-[11.5px] text-suave">{m.funcao ?? "—"}</div>
                  )}
                </div>
              </div>
              <span className="truncate font-mono text-[11.5px] text-suave max-[980px]:hidden">{m.email}</span>
              {m.papel === "owner" || !papelEditavel ? (
                <span className="pl-2 text-[13px] text-tinta">{rotuloPapel(m.papel)}</span>
              ) : (
                <span className="relative justify-self-start">
                  <select
                    aria-label={`Papel de ${m.nome ?? m.email}`}
                    value={m.papel}
                    disabled={pendente}
                    onChange={(e) => rodar(() => mudarPapel(m.id, m.papel, e.target.value))}
                    className="h-7 cursor-pointer appearance-none rounded-md border border-transparent bg-transparent pl-2 pr-6 text-[13px] text-tinta hover:border-linha hover:bg-branco"
                  >
                    {opcoesDePapel(meuPapel, m.papel).map((p) => (
                      <option key={p} value={p}>
                        {rotuloPapel(p)}
                      </option>
                    ))}
                  </select>
                  <span aria-hidden className="pointer-events-none absolute right-2 top-1/2 h-[5px] w-[5px] -translate-y-[70%] rotate-45 border-b-[1.5px] border-r-[1.5px] border-mute" />
                </span>
              )}
              <div className="flex items-center justify-end gap-0.5">
                {(podeEditarFuncao(meuPapel, souEu) || podeRevogar(meuPapel, { papel: m.papel, souEu })) && (
                  <details className="relative">
                    <summary
                      aria-label={`Ações para ${m.nome ?? m.email}`}
                      className="grid h-7 w-7 cursor-pointer list-none place-items-center rounded-md text-mute hover:bg-branco hover:text-tinta [&::-webkit-details-marker]:hidden"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="5" cy="12" r="1.7" />
                        <circle cx="12" cy="12" r="1.7" />
                        <circle cx="19" cy="12" r="1.7" />
                      </svg>
                    </summary>
                    <div className="absolute right-0 top-8 z-20 min-w-[212px] rounded-lg border border-linha bg-branco p-1 shadow-[0_4px_16px_rgba(31,35,40,.10)]">
                      {podeEditarFuncao(meuPapel, souEu) && (
                        <button
                          type="button"
                          className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-tinta hover:bg-hover"
                          onClick={(e) => {
                            (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                            setEditandoFuncao({ id: m.id, valor: m.funcao ?? "" });
                          }}
                        >
                          Mudar função…
                        </button>
                      )}
                      {podeRevogar(meuPapel, { papel: m.papel, souEu }) && (
                        <>
                          <div className="mx-1 my-1 h-px bg-linha" />
                          <button
                            type="button"
                            className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-vermelho hover:bg-[#FBEFED]"
                            onClick={(e) => {
                              (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                              rodar(() => revogarAcesso(m.id));
                            }}
                          >
                            Remover da área de trabalho
                          </button>
                        </>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
          );
        })}

        {/* convites pendentes/expirados, na MESMA tabela */}
        {gestor &&
          pendentes.map((c) => (
            <div key={c.id} className={`${GRID} min-h-[48px] border-b border-[#F1F0EC] px-2 py-1.5 last:border-b-0 hover:bg-hover`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <div aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full border-[1.5px] border-dashed border-mute text-mute">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
                    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
                    <path d="m4.5 7 7.5 6 7.5-6" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="truncate font-mono text-[12.5px] text-tinta">{c.email}</div>
                  <div className="truncate font-mono text-[10.5px] tabular-nums text-mute">
                    {rotuloPapel(c.papel)} · {convidadoHa(c.criado_em, new Date())}
                  </div>
                </div>
              </div>
              <span className="max-[980px]:hidden" />
              {c.status === "expirado" ? (
                <span className="justify-self-start whitespace-nowrap rounded-full bg-[#FBEFED] px-2.5 py-1 text-[11.5px] font-semibold text-vermelho">
                  Expirado
                </span>
              ) : (
                // W5: era `text-[#B27A00]` sobre `bg-[#FAF3E3]` — hex CRAVADO na classe, que é
                // por onde a troca de token da W4 não passa. Media 3,35:1, reprovando o piso AA de
                // 4,5:1 num texto de 11,5px. Nos tokens vivos: `amarelo` sobre `amarelo-bg` = 5,16:1.
                <span className="justify-self-start whitespace-nowrap rounded-full bg-amarelo-bg px-2.5 py-1 text-[11.5px] font-semibold text-amarelo">
                  Pendente
                </span>
              )}
              <div className="flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => reenviar(c)}
                  title="Gera um link novo (o antigo deixa de valer) e copia"
                  className="whitespace-nowrap rounded-md px-2 py-1 text-[12.5px] font-medium text-suave hover:bg-branco hover:text-tinta"
                >
                  Reenviar
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => rodar(() => revogarConvite(c.id))}
                  className="whitespace-nowrap rounded-md px-2 py-1 text-[12.5px] font-medium text-suave hover:bg-[#FBEFED] hover:text-vermelho"
                >
                  Revogar
                </button>
              </div>
            </div>
          ))}

        {/* revogados: histórico visível, ação única de reativar (D9) */}
        {revogados.length > 0 && gestor && (
          <>
            <div className="mt-6 border-b border-linha px-2 pb-2 text-[11.5px] font-medium text-mute">Acessos revogados</div>
            {revogados.map((m) => (
              <div key={m.id} className={`${GRID} min-h-[48px] border-b border-[#F1F0EC] px-2 py-1.5 opacity-70 last:border-b-0`}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="grid h-7 w-7 flex-none place-items-center rounded-full bg-mute text-[11px] font-semibold text-branco">
                    {iniciaisMembro(m.nome, m.email)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-tinta">{m.nome ?? m.email.split("@")[0]}</div>
                    <div className="truncate text-[11.5px] text-suave">{m.funcao ?? "—"}</div>
                  </div>
                </div>
                <span className="truncate font-mono text-[11.5px] text-suave max-[980px]:hidden">{m.email}</span>
                <span className="justify-self-start whitespace-nowrap rounded-full bg-hover px-2.5 py-1 text-[11.5px] font-semibold text-suave">
                  Revogado
                </span>
                <div className="flex items-center justify-end">
                  {podeRevogar(meuPapel, { papel: m.papel, souEu: m.id === meuId }) && (
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => rodar(() => reativarAcesso(m.id))}
                      className="whitespace-nowrap rounded-md px-2 py-1 text-[12.5px] font-medium text-suave hover:bg-branco hover:text-tinta"
                    >
                      Reativar acesso
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
