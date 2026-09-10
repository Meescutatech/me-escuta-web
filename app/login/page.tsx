"use client";

import { useFormState, useFormStatus } from "react-dom";
import { entrar } from "./actions";
import { Button } from "@/components/ui/button";
import { Marca } from "@/components/ui/marca";
import { carimboBuild } from "@/components/ui/marca-build";

/*
 * LOGIN — atualizado em 22/08 (W4).
 *
 * Estava congelado em 16/07 e era a tela MENOS fiel a direcao aprovada: logo em emoji (👂), card
 * com `shadow-forte` e erro como paragrafo solto. Em R9 superficie se separa por HAIRLINE, nao por
 * sombra — a sombra pesada aqui fazia a primeira tela do sistema parecer de outro app.
 *
 * O que foi seguido (BENCHMARK-DESIGN-GERAL §1, recomendacoes 1 a 4):
 *  1. cabecalho de marca unico (<Marca />) no lugar do emoji;
 *  2. card branco + `border border-linha` sobre `bg-board`, sem sombra;
 *  3. <label> visiveis mantidos — o convite usa placeholder-como-label e AQUI esta melhor;
 *     nao regredir pro padrao pior so por consistencia.
 *  4. erro como faixa role="alert", no mesmo idioma do convite.
 *
 * O que foi recusado, e por que: login social/SSO (acesso e por convite, universo de 4 a 12
 * pessoas, cada provedor e uma superficie de auth a manter) e "esqueci minha senha" (o caminho de
 * verdade nao existe; link que leva a nada e pior que ausencia).
 */

function BotaoEntrar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full font-semibold">
      {pending ? "Entrando..." : "Entrar"}
    </Button>
  );
}

const campo =
  "w-full rounded-md border border-linha-forte bg-branco px-3 py-2 text-sm text-tinta outline-none " +
  "placeholder:text-mute focus:border-laranja focus:ring-2 focus:ring-laranja/25";

export default function LoginPage({ searchParams }: { searchParams: { proxima?: string } }) {
  const [erro, formAction] = useFormState(entrar, null);

  return (
    <main className="grid min-h-screen place-items-center bg-board px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="rounded-[10px] border border-linha bg-branco p-8">
          <Marca className="mb-6" />

          <h1 className="text-[20px] font-[650] tracking-[-0.01em] text-tinta">Entrar</h1>
          <p className="mt-1.5 text-[13.5px] text-suave">
            Acesso restrito ao sistema. Use o e-mail do seu convite.
          </p>

          <form action={formAction} className="mt-6 space-y-4">
            <input type="hidden" name="proxima" value={searchParams.proxima ?? "/funil"} />

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-[12.5px] font-semibold text-suave">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={campo}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="senha" className="block text-[12.5px] font-semibold text-suave">
                Senha
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                autoComplete="current-password"
                required
                className={campo}
              />
            </div>

            {/*
              role="alert" e o que faz o leitor de tela anunciar a falha; sem ele o erro aparece na
              tela e some pra quem nao esta olhando. A faixa repete o idioma de /convite/aceitar.
            */}
            {erro ? (
              <p role="alert" className="rounded-md bg-vermelho-bg px-3 py-2 text-[12.5px] text-vermelho">
                {erro}
              </p>
            ) : null}

            <BotaoEntrar />
          </form>
        </div>

        {/*
          O carimbo de build TAMBEM aqui: /login e a unica tela alcancavel sem sessao, entao e por
          ela que se descobre qual versao esta no ar quando o login e justamente o que quebrou.
        */}
        <p className="mt-4 text-center font-mono text-[10.5px] text-mute">{carimboBuild}</p>
      </div>
    </main>
  );
}
