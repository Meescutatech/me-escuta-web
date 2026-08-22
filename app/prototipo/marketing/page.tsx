import { notFound } from "next/navigation";
import Link from "next/link";
import { CENARIOS, visaoDeEnsaio, type Cenario } from "./dados-ensaio";
import { PainelMarketing } from "@/components/marketing/painel";

/**
 * ENSAIO DA T7 — a tela com dado, para poder ser OLHADA antes de existir dado real.
 *
 * MORA EM `/prototipo` porque o precedente ja existe e diz a mesma coisa: o middleware libera
 * esse prefixo justamente para tela de FIXTURE, que nao le banco, nao escreve e nao mostra dado
 * de ninguem. Criar um mecanismo novo de ensaio ao lado de um que ja serve seria inventar a
 * segunda porta para o mesmo problema.
 *
 * O que ele NAO e: uma segunda tela. Ele monta a visao pela MESMA `montarVisao` que a rota real
 * usa, e renderiza o MESMO `PainelMarketing`. A unica coisa que muda e de onde vem as linhas.
 * Mockup solto sempre precisa ser re-portado a mao, e a segunda vez sai sem o desenho na frente;
 * isto nao precisa, porque ja e o app.
 *
 * 🔒 FORA DE PRODUCAO. Dado inventado com cara de dado medido e exatamente o que esta tela
 * inteira existe para impedir. `notFound()` em producao nao e zelo: e a mesma regra aplicada a
 * mim mesmo.
 */
export const dynamic = "force-dynamic";

export default function EnsaioMarketingPage({
  searchParams,
}: {
  searchParams?: { p?: string; de?: string; ate?: string; cenario?: string };
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const pedido = (searchParams?.cenario ?? "com-dado") as Cenario;
  const cenario = CENARIOS.includes(pedido) ? pedido : "com-dado";
  const visao = visaoDeEnsaio(cenario, new Date(), searchParams ?? {});

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-amarelo-bd bg-amarelo-bg px-6 py-2 text-[12.5px] text-amarelo">
        <strong className="font-semibold">ENSAIO · os numeros desta tela sao inventados.</strong>
        <span>A tela de verdade e /marketing.</span>
        <span className="ml-2 flex gap-1.5">
          {CENARIOS.map((c) => (
            <Link
              key={c}
              href={`/prototipo/marketing?cenario=${c}`}
              className={`rounded-[6px] border px-2 py-0.5 ${
                c === cenario ? "border-amarelo bg-branco font-semibold" : "border-amarelo-bd hover:bg-branco"
              }`}
            >
              {c}
            </Link>
          ))}
        </span>
      </div>
      <PainelMarketing visao={visao} />
    </>
  );
}
