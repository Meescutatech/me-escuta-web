import type { ReactNode } from "react";
import { NavConfiguracoes } from "@/components/ensaio/nav-configuracoes";
import { CARGOS_ATIVOS } from "@/lib/ensaio/fixtures/cargos";
import { gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import { gerarConvitesEnsaio, gerarMembrosEnsaio } from "@/lib/ensaio/fixtures/membros";
import { gerarAgentesEnsaio } from "@/lib/ensaio/fixtures/agentes";
import { gerarIntegracoesEnsaio } from "@/lib/ensaio/fixtures/integracoes";
import type { EstadoSecao } from "@/lib/ensaio/config-secoes";

/**
 * CONFIGURAÇÕES — nav à esquerda, tela à direita. Não existe página-índice.
 *
 * O layout é SERVIDOR porque é ele quem conta o estado de cada seção (as fixtures são puras, mas
 * `new Date()` no cliente produziria hidratação diferente da do servidor). O que precisa do
 * `usePathname` — marcar o item ativo — vive em `NavConfiguracoes`, cliente.
 *
 * Largura da área de conteúdo: regra global do Diogo (10/09, 23:20) — fluida, gutter 24px (32px em
 * ≥1536), `max-w` só em 1600. `pb-[120px]` é o respiro para a barra sticky de publicação.
 */
export default function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  const agora = new Date();
  const membros = gerarMembrosEnsaio(agora);
  const convites = gerarConvitesEnsaio(agora).filter((c) => c.status === "pendente" || c.status === "expirado");
  const canais = gerarCanaisEnsaio(agora);
  const agentes = gerarAgentesEnsaio(agora);
  const conexoes = gerarIntegracoesEnsaio(agora);

  const comAcesso = membros.filter((m) => m.ativo).length;
  const noAr = canais.filter((c) => c.ativo).length;
  const ligados = agentes.filter((a) => a.ativo).length;
  const conexoesOk = conexoes.filter((c) => c.estado === "conectada").length;
  const conexoesAtencao = conexoes.filter((c) => c.estado === "atencao").length;

  const estados: Record<string, EstadoSecao> = {
    // O convite pendente vence a contagem de pessoas: contagem é informação, convite é dívida.
    "/configuracoes/membros":
      convites.length > 0
        ? { texto: convites.length === 1 ? "1 convite" : `${convites.length} convites`, atencao: true }
        : { texto: String(comAcesso) },
    "/configuracoes/cargos": { texto: `${CARGOS_ATIVOS.length} ativos` },
    "/configuracoes/canais": { texto: `${noAr} no ar` },
    "/configuracoes/agentes": { texto: `${ligados} de ${agentes.length}` },
    "/configuracoes/claude": { texto: "2" },
    "/configuracoes/conexoes":
      conexoesAtencao > 0
        ? { texto: `${conexoesAtencao} atenção`, atencao: true }
        : { texto: `${conexoesOk} de ${conexoes.length}` },
    "/configuracoes/funil": { texto: "5 etapas" },
    "/configuracoes/templates": { texto: "6" },
    "/configuracoes/eventos": { texto: "em breve" },
    "/configuracoes/identidades": { texto: "88 %", atencao: true },
    "/configuracoes/suporte": { texto: "1 aberto", atencao: true },
    "/configuracoes/auditoria": { texto: "8" },
  };

  return (
    <div className="flex min-h-[calc(100vh-var(--altura-topo))] bg-background">
      <NavConfiguracoes estados={estados} />
      <main className="min-w-0 flex-1 px-6 pb-[120px] pt-8 2xl:px-8">
        <div className="max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}
