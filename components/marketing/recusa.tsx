import Link from "next/link";
import type { Papel } from "@/components/configuracoes/dados/porta";

/**
 * A RECUSA DA ROTA (RF-12 / D23) — e ela DIZ o que houve, em vez de fingir que a página não existe.
 *
 * A saída fácil era `notFound()`. Foi recusada: 404 afirma "isto não existe" para uma tela que
 * existe, e quem recebe esse 404 não tem o que fazer com ele — abre um chamado dizendo que o
 * link está quebrado, e alguém gasta uma tarde. Aqui o texto nomeia o papel que falta e diz
 * quem concede, então a pessoa resolve sozinha.
 *
 * Isso é interface interna, não superfície pública: esconder a existência da tela de um colega
 * autenticado não compra segurança nenhuma. O que protege o dado é a RLS da `0251`, e ela
 * continua de pé mesmo que esta tela fosse renderizada por engano.
 */
export function RecusaMarketing({ motivo, papel }: { motivo: "papel" | "flag"; papel: Papel | null }) {
  const porFlag = motivo === "flag";
  return (
    <div className="mx-auto max-w-[560px] px-6 py-16">
      <h1 className="text-[20px] font-[650] tracking-[-0.01em] text-tinta">
        {porFlag ? "O modulo de marketing esta desligado" : "Esta tela pede o papel de marketing"}
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-suave">
        {porFlag ? (
          <>
            A flag <span className="font-mono">flag.modulo_marketing</span> esta desligada em{" "}
            <span className="font-mono">core.config</span>. Enquanto ela estiver assim, a tela nao abre para
            ninguem — inclusive para quem tem o papel. Ligar a flag e mudanca de banco, nao de tela.
          </>
        ) : (
          <>
            De onde vieram os leads e quanto custaram e dado de midia: so <strong>marketing</strong>,{" "}
            <strong>admin</strong> e <strong>owner</strong> veem. Seu papel hoje e{" "}
            <span className="font-mono">{papel ?? "nenhum"}</span>.
          </>
        )}
      </p>
      {!porFlag && (
        <p className="mt-3 text-[13px] leading-relaxed text-suave">
          Quem concede o papel e o owner ou um admin, em Membros. O papel entra junto com o convite, num passo
          so — ninguem precisa mexer no banco para isso.
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="rounded-[7px] border border-linha px-3 py-1.5 text-[12.5px] text-suave hover:bg-hover"
        >
          Voltar para a visao geral
        </Link>
        {!porFlag && (
          <Link
            href="/configuracoes/membros"
            className="rounded-[7px] bg-laranja px-3 py-1.5 text-[12.5px] font-semibold text-branco hover:bg-laranja-esc"
          >
            Ver Membros
          </Link>
        )}
      </div>
    </div>
  );
}
