import Link from "next/link";

/** Estado vazio de UMA linha + uma acao. Sem paragrafo, sem explicacao de sistema. */
export function Vazio({ texto, acao }: { texto: string; acao?: { rotulo: string; href: string } }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-suave">
      <span>{texto}</span>
      {acao && (
        <Link href={acao.href} className="font-medium text-navy underline-offset-2 hover:underline">
          {acao.rotulo}
        </Link>
      )}
    </p>
  );
}

export const TEXTO_SEM_CAPTURA = "A captura entra no ar quando o app Meta sair do modo de desenvolvimento.";
export const TEXTO_SEM_CUSTO = "O custo de midia entra quando a ingestao do Meta e do Google for ligada.";
