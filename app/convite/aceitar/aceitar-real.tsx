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

const ENTRADA =
  "h-10 w-full rounded-md border border-linha bg-branco px-3 text-[14px] text-tinta placeholder:text-mute focus:border-laranja focus:outline-none";

/**
 * Um campo com rótulo, dica e o sinal de pronto.
 *
 * O sinal (✓) aparece no RÓTULO e não dentro da caixa: no celular o cursor e o teclado já disputam
 * o interior do campo, e um ícone ali some atrás do texto digitado. A dica ocupa sempre a mesma
 * linha — quando vira aviso ela troca de cor, e não de posição, para o formulário não pular sob o
 * dedo de quem está preenchendo.
 */
function Campo({
  rotulo,
  dica,
  ok,
  mostrarAviso,
  aviso,
  children,
}: {
  rotulo: string;
  dica?: string | undefined;
  ok: boolean;
  mostrarAviso: boolean;
  aviso?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-suave">{rotulo}</span>
        {ok && (
          <span aria-hidden className="text-[12px] leading-none text-verde">
            ✓
          </span>
        )}
      </span>
      {children}
      {(mostrarAviso || dica) && (
        <span className={`text-[11.5px] leading-snug ${mostrarAviso ? "text-vermelho" : "text-mute"}`}>
          {mostrarAviso ? aviso : dica}
        </span>
      )}
    </label>
  );
}

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

  /*
   * ── O FORMULÁRIO RESPONDE ENQUANTO SE DIGITA (14/09, pedido do Diogo) ────────────────────────
   * Antes era um `FormData` no submit: a pessoa preenchia os três campos no escuro, clicava, e só
   * então descobria que a senha tinha 7 caracteres. Num celular, com a fono abrindo pelo WhatsApp,
   * esse erro custa a tentativa inteira.
   *
   * Agora cada campo diz o que falta no momento em que passa a faltar, o botão só acende quando
   * os três estão prontos, e ele DIZ o que falta em vez de ficar cinza sem explicação — botão
   * desabilitado e mudo é a forma mais comum de travar alguém sem que ela saiba por quê.
   */
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const tocar = (c: string) => setTocado((t) => ({ ...t, [c]: true }));

  const nomeOk = nome.trim().length >= 2;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const senhaOk = senha.length >= 8;
  const prontoPara = nomeOk && emailOk && senhaOk;
  const faltando = [!nomeOk && "seu nome", !emailOk && "um e-mail válido", !senhaOk && "8 caracteres na senha"]
    .filter(Boolean)
    .join(" · ");

  /*
   * A dica do campo de e-mail, calculada AQUI e não no JSX, por uma razão que um teste me cobrou:
   * no JSX ela era um ternário aninhado dentro de outro, e uma guarda que some ali some em
   * silêncio. Num link de grupo o `email_mascarado` é `aberto-<cargo>@convite.invalid` — um
   * endereço que não é de ninguém — e foi exatamente ele que apareceu mascarado na tela.
   *
   * O ramo aberto NÃO PODE alcançar `email_mascarado`, e este `if` é o que torna isso legível e
   * verificável. (O runtime também parou de devolvê-lo no canal aberto; são duas defesas, e é de
   * propósito: a divergência entre as duas pontas foi o bug de 14/09.)
   */
  const dicaEmail = (() => {
    if (convite === "carregando" || !convite.valido) return undefined;
    if (convite.aberto) return "É por ele que você entra daqui em diante";
    return convite.email_mascarado ? `O convite foi para ${convite.email_mascarado}` : undefined;
  })();

  useEffect(() => {
    if (!token) {
      setConvite({ valido: false, motivo: "token_ausente" });
      return;
    }
    void validarConvite(token).then(setConvite);
  }, [token]);

  function enviar() {
    if (!prontoPara) {
      setTocado({ nome: true, email: true, senha: true });
      return;
    }
    setErro(null);
    startTransition(async () => {
      const r = await aceitarConviteAction({
        token,
        email: email.trim().toLowerCase(),
        nome: nome.trim(),
        senha,
      });
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
            {/* 14/09, segunda passada: o Diogo cortou a lista do que cada cargo alcança —
                "só coloque boas vindas". Estava certo: uma tela de chegada não é o lugar de
                explicar permissão, e a lista empurrava o formulário para fora da primeira dobra
                no celular, que é onde essa tela é aberta. O cargo fica, em uma linha, porque é a
                única coisa que a pessoa precisa reconhecer para saber que o link é o dela. */}
            <h1 className="text-[21px] font-[650] leading-tight tracking-[-0.015em] text-tinta">
              Boas-vindas à Me Escuta
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-suave">
              {cargo ? (
                <>
                  Você entra como <strong className="font-[620] text-tinta">{cargo.nome}</strong>. Preencha os três
                  campos e o sistema abre.
                </>
              ) : (
                "Preencha os três campos e o sistema abre."
              )}
            </p>

            <form
              className="mt-5 flex flex-col gap-3"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                enviar();
              }}
            >
              {/* O NOME vem primeiro: é o campo sobre ELA, e abrir por "confirme o e-mail do
                  convite" era abrir por burocracia numa tela de chegada. */}
              <Campo
                rotulo="Seu nome"
                dica="Como a equipe vai te chamar"
                ok={nomeOk}
                mostrarAviso={!!tocado.nome && !nomeOk}
                aviso="Escreva pelo menos duas letras."
              >
                <input
                  name="nome"
                  type="text"
                  autoComplete="name"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onBlur={() => tocar("nome")}
                  placeholder="Jade Ferreira"
                  aria-label="Seu nome"
                  className={ENTRADA}
                />
              </Campo>

              {/*
                11/09 · AUTOFILL DESLIGADO NO CAMPO DO E-MAIL.
                O campo era só `placeholder`, e o Chrome preenchia nele o login SALVO de quem está
                abrindo — vimos `admin@meescuta.com` entrar sozinho num convite de outra pessoa.
                A proteção vale MAIS no link de grupo, não menos: como qualquer e-mail é aceito ali,
                o autofill criaria a conta com o endereço errado sem erro nenhum.
              */}
              <Campo
                rotulo={convite.aberto ? "Seu e-mail" : "Seu e-mail (o mesmo do convite)"}
                dica={dicaEmail}
                ok={emailOk}
                mostrarAviso={!!tocado.email && !emailOk}
                aviso="Falta o @ ou o final do endereço."
              >
                <input
                  name="email_do_convite"
                  type="email"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => tocar("email")}
                  placeholder="jade@gmail.com"
                  aria-label={convite.aberto ? "Seu e-mail" : "Seu e-mail, o mesmo do convite"}
                  className={ENTRADA}
                />
              </Campo>

              <Campo
                rotulo="Crie uma senha"
                dica={senha.length === 0 ? "Mínimo 8 caracteres" : senhaOk ? "Boa" : `Faltam ${8 - senha.length}`}
                ok={senhaOk}
                mostrarAviso={false}
              >
                <input
                  name="senha"
                  type="password"
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  onBlur={() => tocar("senha")}
                  aria-label="Crie uma senha, mínimo 8 caracteres"
                  className={ENTRADA}
                />
              </Campo>

              {erro && (
                <p role="alert" className="rounded-md bg-[#FBEFED] px-3 py-2 text-[12.5px] text-vermelho">
                  {erro}
                </p>
              )}

              {/* O botão DIZ o que falta. Desabilitado e mudo é a forma mais comum de travar
                  alguém sem que ela saiba por quê — e no celular não há hover para descobrir. */}
              <button
                type="submit"
                disabled={pendente || !prontoPara}
                className="mt-1 h-10 rounded-md bg-laranja text-[13.5px] font-semibold text-branco transition-opacity hover:bg-laranja-esc disabled:opacity-45"
              >
                {pendente ? "Criando sua conta…" : prontoPara ? "Criar conta e entrar" : `Falta ${faltando}`}
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
