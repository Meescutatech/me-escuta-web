import { redirect } from "next/navigation";
import { lerSessaoEnsaio, DEPARTAMENTOS_ENSAIO } from "@/lib/ensaio/sessao";
import { gerarMembrosEnsaio } from "@/lib/ensaio/fixtures/membros";
import { gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import { DepartamentosEnsaio } from "@/components/ensaio/departamentos";

export const dynamic = "force-dynamic";

/** /configuracoes/departamentos — Pessoas › Departamentos e cargos. */
export default function DepartamentosPage() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/membros");
  const agora = new Date();
  return (
    <DepartamentosEnsaio
      departamentos={DEPARTAMENTOS_ENSAIO}
      membros={gerarMembrosEnsaio(agora)}
      canais={gerarCanaisEnsaio(agora)}
      gestao={ensaio.papel === "owner" || ensaio.papel === "admin"}
    />
  );
}
