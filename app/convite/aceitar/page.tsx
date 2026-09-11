import { ensaioLigado } from "@/lib/ensaio/modo";
import { DEPARTAMENTOS_ENSAIO } from "@/lib/ensaio/sessao";
import { gerarConvitesEnsaio, gerarMembrosEnsaio } from "@/lib/ensaio/fixtures/membros";
import { AceitarConviteEnsaio } from "@/components/ensaio/convite-aceitar";
import { PaginaAceiteReal } from "./aceitar-real";

export const dynamic = "force-dynamic";

/**
 * /convite/aceitar?token=… — pública. Em produção o runtime valida o token (`aceitar-real.tsx`).
 * Em MODO ENSAIO o token é resolvido na fixture: qualquer token desconhecido cai no convite
 * "vitrine" (gestora de Pré-venda); `token=expirado` mostra o estado vencido.
 */
export default function PaginaAceite({ searchParams }: { searchParams: { token?: string } }) {
  if (!ensaioLigado()) return <PaginaAceiteReal />;

  const agora = new Date();
  const token = searchParams.token ?? "";
  const convites = gerarConvitesEnsaio(agora);
  const membros = gerarMembrosEnsaio(agora);
  const doToken = convites.find((c) => c.token === token) ?? null;
  const convite = token === "expirado"
    ? { estado: "expirado" as const }
    : doToken
      ? { estado: "valido" as const, convite: doToken }
      : {
          estado: "valido" as const,
          convite: {
            id: "c0000000-0000-4000-8000-000000000100",
            nome: "Sara Oliveira",
            email: null,
            papel: "membro" as const,
            departamentos: [{ departamento: "pre_venda", papel_no_departamento: "gestor" as const }],
            criado_em: new Date(agora.getTime() - 3_600_000).toISOString(),
            expira_em: new Date(agora.getTime() + 6 * 86_400_000).toISOString(),
            status: "pendente" as const,
            token: token || "cnv_vitrine",
            criado_por: membros.find((m) => m.papel === "admin")!.id,
          },
        };
  const convidadoPor = convite.estado === "valido" ? membros.find((m) => m.id === convite.convite.criado_por)?.nome ?? null : null;

  return (
    <AceitarConviteEnsaio
      resultado={convite}
      convidadoPor={convidadoPor}
      departamentos={DEPARTAMENTOS_ENSAIO}
      agoraIso={agora.toISOString()}
    />
  );
}
