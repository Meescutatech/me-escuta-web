import { redirect } from "next/navigation";
import { lerSessaoEnsaio, rotuloDepartamento } from "@/lib/ensaio/sessao";
import { gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import { MeuNumeroEnsaio } from "@/components/ensaio/meu-numero";

export const dynamic = "force-dynamic";

/**
 * /configuracoes/canais/meu-numero — a fono conecta o próprio celular (R6 do contrato D91).
 * Hoje só existe em MODO ENSAIO; fora dele volta para a lista de números (o encanamento real é
 * o W4 da noite de 10/09).
 */
export default function MeuNumeroPage({ searchParams }: { searchParams: { reconectar?: string } }) {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/canais");
  const meu = gerarCanaisEnsaio().find((c) => c.responsavel_id === ensaio.id) ?? null;
  const departamento = ensaio.departamentos[0]?.departamento ?? meu?.departamento ?? "pre_venda";
  return (
    <MeuNumeroEnsaio
      eu={ensaio}
      meuCanal={meu}
      departamentoRotulo={rotuloDepartamento(departamento)}
      reconectar={searchParams.reconectar === "1"}
    />
  );
}
