import type { ReactNode } from "react";
import { NavConfiguracoes } from "@/components/ensaio/nav-configuracoes";
import { CARGOS_ATIVOS } from "@/lib/ensaio/fixtures/cargos";
import { gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import { gerarConvitesEnsaio, gerarMembrosEnsaio } from "@/lib/ensaio/fixtures/membros";
import { gerarAgentesEnsaio } from "@/lib/ensaio/fixtures/agentes";
import { gerarIntegracoesEnsaio } from "@/lib/ensaio/fixtures/integracoes";
import type { EstadoSecao } from "@/lib/ensaio/config-secoes";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { lerEstadosSecoes } from "@/lib/dados/config-secoes-reais";

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
/**
 * 11/09/2026 · OS SELOS DESTE MENU ERAM FIXTURE — em produção também.
 *
 * Este layout montava "4 ativos", "2 de 4", "88 %", "1 aberto", "8" a partir das fixtures de
 * ensaio, SEM guarda nenhuma: usuário real via número inventado em toda tela da seção. Era o
 * único lugar do app que mentia sem pedir licença, e mentia no lugar mais difícil de perceber —
 * ninguém confere um selo de menu contra nada.
 *
 * Agora a fonte segue o caminho: ensaio usa fixture (é para isso que ele existe), e o caminho
 * real lê o banco. O que o banco ainda não sabe dizer fica SEM selo, nunca com um chutado.
 */
export default async function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) {
    const estadosReais = await lerEstadosSecoes();
    return (
      <div className="flex min-h-[calc(100vh-var(--altura-topo))] bg-background">
        <NavConfiguracoes estados={estadosReais} />
        <main className="min-w-0 flex-1 px-6 pb-[120px] pt-8 2xl:px-8">
          <div className="max-w-[1600px]">{children}</div>
        </main>
      </div>
    );
  }

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
    // "3 no ar" fazia "Números conectados" truncar em 240px — o rótulo vence o estado.
    "/configuracoes/canais": { texto: String(noAr) },
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
