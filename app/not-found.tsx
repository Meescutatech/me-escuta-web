import Link from "next/link";
import { Marca } from "@/components/ui/marca";
import { carimboBuild } from "@/components/ui/marca-build";

/**
 * 404 — pagina nao encontrada.
 *
 * Por que existe (medido em 22/08): o app tinha 25 rotas e ZERO not-found/error/global-error. Erro
 * de rota entregava o default do Next — em ingles, em system-ui, e escuro se o sistema do usuario
 * estivesse em dark. Na terca, com gente de verdade clicando, a primeira tela quebrada era uma
 * tela que nao parece do sistema e nao diz o que fazer.
 *
 * Regra de escrita seguida: erro nao pede desculpa e nao e vago. Diz o que aconteceu e da o
 * caminho de volta. O carimbo de build entra porque "que versao voce estava usando?" e sempre a
 * primeira pergunta do suporte.
 */
export default function NaoEncontrado() {
  return (
    <main className="grid min-h-screen place-items-center bg-board px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="rounded-[10px] border border-linha bg-branco p-8">
          <Marca className="mb-6" />

          {/* O 404 aparece escrito porque e o que a pessoa vai digitar/dizer ao pedir ajuda. */}
          <p className="font-mono text-[12px] font-semibold tracking-[0.08em] text-mute">404</p>
          <h1 className="mt-1 text-[20px] font-[650] tracking-[-0.01em] text-tinta">
            Esta página não existe
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-suave">
            O endereço está errado ou o item foi removido. Nada foi perdido — o funil, as conversas
            e as tarefas continuam onde estavam.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/funil"
              className="inline-flex items-center rounded-md bg-laranja px-4 py-2 text-sm font-semibold text-branco outline-none transition-colors hover:bg-laranja-esc focus-visible:ring-2 focus-visible:ring-laranja focus-visible:ring-offset-2"
            >
              Ir para o funil
            </Link>
            <Link
              href="/conversas"
              className="inline-flex items-center rounded-md border-[1.5px] border-linha-forte bg-branco px-4 py-2 text-sm font-semibold text-suave outline-none transition-colors hover:bg-hover hover:text-navy focus-visible:ring-2 focus-visible:ring-laranja focus-visible:ring-offset-2"
            >
              Ir para conversas
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center font-mono text-[10.5px] text-mute">{carimboBuild}</p>
      </div>
    </main>
  );
}
