"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { aceitarConviteAction, validarConvite, type ConviteValidado } from "./actions";

/**
 * Página PÚBLICA de aceite de convite (/convite/aceitar?token=...). O conhecimento do
 * token é a credencial; o email digitado tem que bater com o do convite (spec §4.2).
 * Mensagem específica por causa: expirado pede convite novo; usado/revogado é genérico.
 */

const MOTIVOS: Record<string, string> = {
  token_desconhecido: "Este convite não é válido.",
  ja_usado: "Este convite não é mais válido.",
  revogado: "Este convite não é mais válido.",
  expirado: "Este convite expirou — peça um novo à gestão da Me Escuta.",
  token_ausente: "Link de convite incompleto.",
  runtime_fora_do_ar: "Não foi possível checar o convite agora. Tente de novo em instantes.",
};

function AceitarConvite() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [convite, setConvite] = useState<ConviteValidado | "carregando">("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    if (!token) {
      setConvite({ valido: false, motivo: "token_ausente" });
      return;
    }
    void validarConvite(token).then(setConvite);
  }, [token]);

  function enviar(form: FormData) {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const nome = String(form.get("nome") ?? "").trim();
    const senha = String(form.get("senha") ?? "");
    if (!email || !email.includes("@")) return setErro("Informe o email do convite.");
    if (!nome) return setErro("Informe seu nome.");
    if (senha.length < 8) return setErro("A senha precisa de pelo menos 8 caracteres.");
    setErro(null);
    startTransition(async () => {
      const r = await aceitarConviteAction({ token, email, nome, senha });
      if (!r.ok) {
        setErro(r.motivo ?? "não foi possível aceitar o convite");
        return;
      }
      router.push("/login?convite=aceito");
    });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-board px-4">
      <div className="w-full max-w-[400px] rounded-[10px] border border-linha bg-branco p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <svg viewBox="0 0 96 100" fill="none" stroke="#EC662E" strokeWidth="9" strokeLinecap="round" aria-hidden className="h-[34px] w-8">
            <path d="M12 62 C4 48 6 28 20 16 C34 5 56 5 67 17 C76 26 78 40 71 50 C66 58 58 61 54 68 C50 75 50 82 44 87 C37 93 27 90 24 83" />
            <path d="M34 48 C31 38 37 28 47 28 C56 28 61 36 58 43 C56 49 49 50 45 46" />
            <path d="M84 14 C92 23 92 37 85 46" />
          </svg>
          <span className="flex flex-col items-end font-extrabold leading-[0.9] tracking-[-0.02em] text-navy">
            <span>me</span>
            <span>escuta</span>
          </span>
        </div>

        {convite === "carregando" && <p className="text-[13.5px] text-suave">Checando convite…</p>}

        {convite !== "carregando" && !convite.valido && (
          <div>
            <h1 className="text-[20px] font-[650] tracking-[-0.01em] text-tinta">Convite inválido</h1>
            <p className="mt-2 text-[13.5px] text-suave">{MOTIVOS[convite.motivo ?? ""] ?? MOTIVOS.token_desconhecido}</p>
          </div>
        )}

        {convite !== "carregando" && convite.valido && (
          <div>
            <h1 className="text-[20px] font-[650] tracking-[-0.01em] text-tinta">Você foi convidado</h1>
            <p className="mt-1.5 text-[13.5px] text-suave">
              Acesso de <strong className="text-tinta">{convite.papel === "admin" ? "Admin" : "Membro"}</strong>
              {convite.funcao ? ` · ${convite.funcao}` : ""} para {convite.email_mascarado ?? "seu email"}. Confirme o
              email do convite e crie sua senha.
            </p>
            <form
              className="mt-5 flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                enviar(new FormData(e.currentTarget));
              }}
            >
              <input
                name="email"
                type="email"
                required
                placeholder="Email do convite"
                aria-label="Email do convite"
                className="h-9 rounded-md border border-linha bg-branco px-2.5 text-[13px] text-tinta placeholder:text-mute focus:border-laranja focus:outline-none"
              />
              <input
                name="nome"
                type="text"
                required
                placeholder="Seu nome"
                aria-label="Seu nome"
                className="h-9 rounded-md border border-linha bg-branco px-2.5 text-[13px] text-tinta placeholder:text-mute focus:border-laranja focus:outline-none"
              />
              <input
                name="senha"
                type="password"
                required
                minLength={8}
                placeholder="Crie uma senha (mín. 8 caracteres)"
                aria-label="Senha"
                className="h-9 rounded-md border border-linha bg-branco px-2.5 text-[13px] text-tinta placeholder:text-mute focus:border-laranja focus:outline-none"
              />
              {erro && (
                <p role="alert" className="rounded-md bg-[#FBEFED] px-3 py-2 text-[12.5px] text-vermelho">
                  {erro}
                </p>
              )}
              <button
                type="submit"
                disabled={pendente}
                className="h-9 rounded-md bg-laranja text-[13px] font-semibold text-branco hover:bg-laranja-esc disabled:opacity-60"
              >
                {pendente ? "Criando acesso…" : "Aceitar convite"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PaginaAceite() {
  return (
    <Suspense fallback={null}>
      <AceitarConvite />
    </Suspense>
  );
}
