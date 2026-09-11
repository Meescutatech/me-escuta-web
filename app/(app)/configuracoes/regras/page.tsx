import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { RegrasEnsaio } from "@/components/ensaio/regras";

export const dynamic = "force-dynamic";

/** /configuracoes/regras — Operação › Regras e SLAs. */
export default function RegrasPage() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/funil");
  return <RegrasEnsaio gestao={ensaio.papel === "owner" || ensaio.papel === "admin"} />;
}
