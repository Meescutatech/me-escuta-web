import { redirect } from "next/navigation";
import { DEPARTAMENTOS_ENSAIO, lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { gerarMembrosEnsaio } from "@/lib/ensaio/fixtures/membros";
import { gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import { CargosEnsaio } from "@/components/ensaio/cargos";

export const dynamic = "force-dynamic";

/**
 * /configuracoes/cargos — o que era "Departamentos e cargos".
 *
 * Fora do ensaio ainda não há leitura própria (o cargo é derivado de `core.usuario.papel` +
 * `core.usuario_departamento`, e a tela real lê as duas): por ora, redireciona para Membros em vez
 * de mostrar uma tela vazia que pareceria defeito.
 */
export default function CargosPage() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/membros");
  const agora = new Date();
  return <CargosEnsaio departamentos={DEPARTAMENTOS_ENSAIO} membros={gerarMembrosEnsaio(agora)} canais={gerarCanaisEnsaio(agora)} />;
}
