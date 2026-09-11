import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import { PrecisaDeAtencao } from "./atencao";
import { FunilEtapas, MetaDoMes } from "./funil-etapas";
import { HeatmapHoraDia } from "./heatmap";
import { JarvisDiz } from "@/components/jarvis/jarvis-diz";
import { hrefPergunta } from "@/lib/dados/dashboard-dono-calculos";
import { KpisDono } from "./kpis";
import { MensagensPorDia, QuemAtendeu } from "./quem-atendeu";

/**
 * Visão geral — a ordem é a ordem da pergunta das 8h:
 *   1. como estamos indo (seis números com variação e trajetória)
 *   2. o que precisa de mim agora (lista viva) + o Jarvis resumindo o dia
 *   3. o funil e a meta (dinheiro)
 *   4. quem atendeu e quanto falou (operação)
 *   5. quando chega (o horário certo de ter gente)
 */
export function AbaGeral({ dados }: { dados: DadosDashboardDono }) {
  return (
    <div className="flex flex-col gap-4">
      <KpisDono dados={dados} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <PrecisaDeAtencao atencao={dados.atencao} />
        <JarvisDiz frase={dados.jarvis.frase} observacoes={dados.jarvis.observacoes} perguntas={dados.jarvis.perguntas} geradoEm={dados.jarvis.geradoEm} hrefPergunta={hrefPergunta} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <FunilEtapas dados={dados} />
        <MetaDoMes meta={dados.meta} valorEmNegociacao={dados.valorNegociacao.total} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <QuemAtendeu dados={dados} />
        <MensagensPorDia dados={dados} />
      </div>

      <HeatmapHoraDia heatmap={dados.heatmap} periodo={dados.periodo} />
    </div>
  );
}
