import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { GeralEnsaio } from "@/components/ensaio/geral";

export const dynamic = "force-dynamic";

/** /configuracoes/geral — nome, marca e fuso. Só existe em ensaio por enquanto. */
export default function GeralPage() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/membros");
  return <GeralEnsaio gestao={ensaio.papel === "owner" || ensaio.papel === "admin"} />;
}
