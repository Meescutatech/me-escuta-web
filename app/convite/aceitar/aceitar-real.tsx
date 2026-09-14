"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { aceitarConviteAction, validarConvite, type ConviteValidado } from "./actions";
import { rotuloPapelBruto } from "@/lib/membros";
import { cargoPorChave } from "@/lib/ensaio/fixtures/cargos";

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
  // O catálogo de cargos é o MESMO que a tela de convite mostra a quem convida (0338 transcreveu
  // este arquivo para `core.cargo_catalogo`). Quem convida e quem aceita leem a mesma promessa.
  const cargo = convite !== "carregando" && convite.cargo ? cargoPorChave(convite.cargo) : null;
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
    // `email_do_convite`, e não `email`: o nome foi trocado justamente para o Chrome não
    // reconhecer o campo como login e preencher a conta salva de outra pessoa.
    const email = String(form.get("email_do_convite") ?? "").trim().toLowerCase();
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
      // `entrou` separa dois sucessos: com sessão vai direto para o trabalho; sem ela a conta
      // EXISTE e só falta entrar — e o `?conta=criada` é o que faz o login dizer isso em vez de
      // deixar a pessoa achar que o convite falhou e tentar de novo.
      router.push(r.entrou ? "/funil" : `/login?conta=criada&email=${encodeURIComponent(email)}`);
      router.refresh();
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
            {/*
              ── A TELA DE BOAS-VINDAS (14/09) ────────────────────────────────────────────────────
              Quem abre isto é a fono, no celular, pelo WhatsApp, e nunca viu o sistema. A versão
              anterior a tratava como um formulário de confirmação: dizia "Você foi convidado",
              anunciava o PAPEL técnico ("Acesso de Admin") e mostrava o e-mail do convite mascarado
              — que num link de grupo é o marcador `a*********@convite.invalid`, um endereço que não
              é de ninguém. Três coisas erradas na primeira frase que ela lê.

              Agora a tela diz, nesta ordem: o CARGO (o nome que a operação usa), o que ele
              significa em uma frase, e o que ela vai ver quando entrar. É o mínimo de tutorial que
              cabe no lugar onde de fato se lê — antes de pedir qualquer campo.
            */}
            <h1 className="text-[21px] font-[650] leading-tight tracking-[-0.015em] text-tinta">
              {cargo ? <>Boas-vindas — você entra como {cargo.nome}</> : "Boas-vindas à Me Escuta"}
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-suave">
              {cargo?.resumo ??
                (convite.funcao
                  ? `Seu acesso é de ${rotuloPapelBruto(convite.papel)} · ${convite.funcao}.`
                  : `Seu acesso é de ${rotuloPapelBruto(convite.papel)}.`)}
            </p>

            {cargo && cargo.ve.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5 rounded-md bg-board px-3.5 py-3">
                {cargo.ve.slice(0, 3).map((v) => (
                  <li key={v} className="text-[12.5px] leading-snug text-suave">
                    {v}
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 text-[13px] text-suave">Crie sua conta para entrar.</p>

            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                enviar(new FormData(e.currentTarget));
              }}
            >
              {/* O NOME vem primeiro: é o campo sobre ELA, e abrir por "confirme o e-mail do
                  convite" era abrir por burocracia numa tela de chegada. */}
              <label className="grid gap-1">
                <span className="text-[12px] text-mute">Seu nome</span>
                <input
                  name="nome"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Como a equipe vai te chamar"
                  aria-label="Seu nome"
                  className="h-9 rounded-md border border-linha bg-branco px-2.5 text-[13px] text-tinta placeholder:text-mute focus:border-laranja focus:outline-none"
                />
              </label>
              {/*
                11/09 · RÓTULO ACIMA, E AUTOFILL DESLIGADO NO CAMPO DO E-MAIL.
                O campo era só `placeholder`, e o Chrome preenchia nele o login SALVO de quem está
                abrindo — vimos `admin@meescuta.com` entrar sozinho num convite de outra pessoa.
                A proteção continua valendo no link de grupo, e ali é ainda pior: como qualquer
                e-mail é aceito, o autofill criaria a conta com o endereço ERRADO sem erro nenhum.
              */}
              <label className="grid gap-1">
                <span className="text-[12px] text-mute">
                  {convite.aberto ? "Seu e-mail" : "Seu e-mail (o mesmo do convite)"}
                </span>
                <input
                  name="email_do_convite"
                  type="email"
                  required
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder={convite.aberto ? "o e-mail que você vai usar para entrar" : undefined}
                  aria-label={convite.aberto ? "Seu e-mail" : "Seu e-mail, o mesmo do convite"}
                  className="h-9 rounded-md border border-linha bg-branco px-2.5 text-[13px] text-tinta placeholder:text-mute focus:border-laranja focus:outline-none"
                />
                {!convite.aberto && convite.email_mascarado && (
                  <span className="text-[11.5px] text-mute">O convite foi para {convite.email_mascarado}.</span>
                )}
              </label>
              <label className="grid gap-1">
                <span className="text-[12px] text-mute">Crie uma senha — mínimo 8 caracteres</span>
                <input
                  name="senha"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  aria-label="Crie uma senha, mínimo 8 caracteres"
                  className="h-9 rounded-md border border-linha bg-branco px-2.5 text-[13px] text-tinta placeholder:text-mute focus:border-laranja focus:outline-none"
                />
              </label>
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
                {pendente ? "Criando sua conta…" : "Criar conta e entrar"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}

/** A página REAL (runtime valida o token). Em modo ensaio `page.tsx` renderiza a fixture. */
export function PaginaAceiteReal() {
  return (
    <Suspense fallback={null}>
      <AceitarConvite />
    </Suspense>
  );
}
