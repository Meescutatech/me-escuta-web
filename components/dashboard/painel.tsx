import Link from "next/link";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import type { VisaoMarketing } from "@/lib/dados/marketing";
import { tipoDoAtor } from "@/lib/dados/dashboard-ceo-calculos";
import { montarHref, type Aba } from "@/lib/dados/dashboard-dono-calculos";
import { AbaCanais } from "./aba-canais";
import { AbaEquipe } from "./aba-equipe";
import { AbaGeral } from "./aba-geral";
import { AbaMarketing } from "./aba-marketing";
import { AbasDashboard } from "./abas";
import { ControlesDashboard } from "./controles";
import { Acao, ddmm, Ponto } from "./pecas";

/*
 * Dashboard do DONO (W-D4, 10/09/2026) — refeito do zero sobre o kit de relatório do LiderHub.
 *
 * A pergunta que a tela responde às 8h: "o que precisa da minha atenção hoje e como estamos
 * indo?". Quatro abas, todas na URL (`?aba=`): Visão geral (KPIs, atenção, Jarvis, funil + meta,
 * quem atendeu, heatmap) · Equipe (tabela por pessoa) · Canais (tabela por número) · Marketing (a
 * tela do Fernando, dentro de casa). Período, departamento e "ver como" valem para todas.
 *
 * O que saiu, e por quê: os títulos em caixa alta com tracking (viravam ruído ao lado dos números);
 * as setas "→" nos links (o verbo já diz o que acontece); o mono nos rótulos (só o dado é
 * tabular). O que ficou: o trilho agente × pessoa, que é a assinatura da tela.
 */

export function PainelDashboard({
  dados,
  marketing,
  mostrarDepartamento,
  verMarketing,
}: {
  dados: DadosDashboardDono;
  /** só vem quando a aba Marketing está aberta E o papel pode ver */
  marketing: VisaoMarketing | null;
  mostrarDepartamento: boolean;
  verMarketing: boolean;
}) {
  const { periodo, aba, departamento } = dados;
  const atorNome = dados.atorFiltro ? dados.porAtor.find((r) => r.ator === dados.atorFiltro)?.nome ?? dados.atorFiltro : null;
  const tudoIndisponivel = dados.indisponiveis.length >= 7;
  const ocultar: Aba[] = verMarketing ? [] : ["marketing"];

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-12 pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ControlesDashboard periodo={periodo} atorFiltro={dados.atorFiltro} atores={dados.atores} aba={aba} departamento={departamento} mostrarDepartamento={mostrarDepartamento} />
        {atorNome && (
          <span className="flex items-center gap-1.5 text-ui-12 text-muted-foreground">
            <Ponto tipo={tipoDoAtor(dados.atorFiltro!)} />
            <b className="font-semibold text-foreground">{atorNome}</b>
            <Link href={montarHref({ periodo, ator: null, aba, departamento })} className="ml-1 font-medium text-foreground underline decoration-foreground/30 underline-offset-[3px] hover:decoration-foreground">
              limpar
            </Link>
          </span>
        )}
        <span className="ml-auto text-ui-11 tabular-nums text-muted-foreground">
          {ddmm(dados.janela.inicio)} – {ddmm(dados.janela.fim)}
        </span>
      </div>

      {departamento && (
        <p className="mb-3 text-ui-12 text-muted-foreground">
          {dados.departamentoAplicado
            ? "Recorte aplicado a atenção, equipe e canais. KPIs, funil e série seguem de toda a operação — as views do ledger ainda não separam por departamento."
            : "As leituras do ledger ainda não separam por departamento: os números abaixo são de toda a operação."}
        </p>
      )}

      <div className="mb-4">
        <AbasDashboard aba={aba} periodo={periodo} ator={dados.atorFiltro} departamento={departamento} ocultar={ocultar} />
      </div>

      {tudoIndisponivel ? (
        <p className="rounded-xl bg-card px-5 py-10 text-center text-ui-13 text-muted-foreground ring-1 ring-foreground/10">
          As leituras do dashboard não responderam. <Acao href="/suporte">Relatar</Acao>
        </p>
      ) : aba === "equipe" ? (
        <AbaEquipe dados={dados} />
      ) : aba === "canais" ? (
        <AbaCanais dados={dados} />
      ) : aba === "marketing" ? (
        marketing ? (
          <AbaMarketing visao={marketing} periodo={periodo} />
        ) : (
          <p className="rounded-xl bg-card px-5 py-10 text-center text-ui-13 text-muted-foreground ring-1 ring-foreground/10">
            Marketing pede o papel de marketing, admin ou owner. <Acao href="/configuracoes/membros">Ver membros</Acao>
          </p>
        )
      ) : (
        <AbaGeral dados={dados} />
      )}
    </main>
  );
}
