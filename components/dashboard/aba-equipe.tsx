import Link from "next/link";
import { ArrowRightLeftIcon, CheckSquareIcon, UsersIcon, ZapIcon } from "lucide-react";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import { fmtInt, fmtMinutos, fmtPct, variacao } from "@/lib/dados/dashboard-ceo-calculos";
import { mediaEquipeMin, type LinhaEquipe } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { Acao, COR_AGENTE, COR_HUMANO, Ponto, Th } from "./pecas";
import { barraDeTempo, BlocoVazio, CartaoIndicador, CelulaMetrica, fracaoDoMaximo, ItemLegenda, SecaoTabela, SeloVariacao } from "./relatorio";

/**
 * Aba Equipe — quem atendeu, quanto cada um carregou e como cada um se compara com a média do
 * próprio grupo. Agentes e pessoas estão na MESMA tabela porque respondem à mesma pergunta ("quem
 * segurou o período?"), mas a régua da barra de 1ª resposta é a média do próprio tipo: comparar os
 * 4 min da Clara com a 1h15 da Sara pintaria toda pessoa de vermelho e não diria nada.
 *
 * Uma ordem só: agentes primeiro, depois pessoas, cada grupo por conversas. Cabeçalho não ordena
 * — quem procura o extremo de uma métrica lê os destaques logo abaixo, com nome e número.
 */

const ROTULO_DEP: Record<string, string> = { pre_venda: "Pré-venda", pos_venda: "Pós-venda", clinico: "Clínico" };

function LinhaPessoa({ r, maxConversas, mediaTipo, periodo, ativo }: { r: LinhaEquipe; maxConversas: number; mediaTipo: number | null; periodo: number; ativo: boolean }) {
  const conv = r.conversas.atual ?? 0;
  const resp = r.respondidas.atual ?? 0;
  const barra = barraDeTempo(r.primeiraResposta.medianaMin, mediaTipo);
  const amostra = r.primeiraResposta.amostra;
  const cel = "px-2 py-2.5 align-top";
  return (
    <tr className={cn("border-t border-border/70", ativo && "bg-muted/40")}>
      <td className="py-2.5 pr-2 align-top">
        <Link href={`/?periodo=${periodo}&aba=equipe&ator=${encodeURIComponent(r.ator)}`} className="flex items-center gap-2 hover:underline">
          <Ponto tipo={r.tipo} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-ui-13 font-medium text-foreground">{r.nome}</span>
            <span className="truncate text-ui-11 text-muted-foreground">
              {r.tipo === "agente" ? "agente" : r.departamento ? ROTULO_DEP[r.departamento] ?? r.departamento : "sem departamento"}
              {!r.ativo ? " · inativo" : ""}
            </span>
          </span>
        </Link>
      </td>
      <td className={cel}>
        <CelulaMetrica valor={fmtInt(conv)} barra={{ fracao: fracaoDoMaximo(conv, maxConversas), tom: "neutro" }} tituloBarra={`${fmtInt(conv)} de ${fmtInt(maxConversas)}, o maior volume do período`} />
      </td>
      <td className={cel}>
        <CelulaMetrica valor={fmtInt(resp)} secundario={conv > 0 ? fmtPct(resp / conv) : undefined} barra={{ fracao: fracaoDoMaximo(resp, conv), tom: "bom" }} tituloBarra={`${fmtInt(resp)} das ${fmtInt(conv)} conversas tiveram a 1ª resposta dele(a)`} />
      </td>
      <td className={cel} title={amostra > 0 ? `mediana de ${amostra} conversas · antes: ${fmtMinutos(r.primeiraResposta.anteriorMin)}` : undefined}>
        <CelulaMetrica
          valor={`${fmtMinutos(r.primeiraResposta.medianaMin)}${amostra > 0 && amostra < 5 ? " *" : ""}`}
          tom={barra?.tomTexto ?? "neutro"}
          barra={barra}
          tituloBarra={`${fmtMinutos(r.primeiraResposta.medianaMin)} contra ${fmtMinutos(mediaTipo)} da mediana ${r.tipo === "agente" ? "dos agentes" : "das pessoas"}`}
        />
      </td>
      <td className={cn(cel, "text-right text-ui-13 tabular-nums text-foreground")}>
        <span className="inline-flex items-center gap-1.5">
          {fmtInt(r.tarefasConcluidas.atual)}
          <SeloVariacao delta={variacao(r.tarefasConcluidas)} tamanho="sm" />
        </span>
        <span className="block text-ui-11 text-muted-foreground">{fmtInt(r.tarefasCriadas.atual)} criadas</span>
      </td>
      <td className={cn(cel, "text-right text-ui-13 tabular-nums text-foreground")}>{fmtInt(r.transbordos.atual)}</td>
      <td className={cn(cel, "text-right text-ui-13 tabular-nums")}>
        {r.cargaAgora == null ? <span className="text-muted-foreground">—</span> : <span className={cn("font-medium", r.cargaAgora >= 8 ? "text-danger-ink" : "text-foreground")}>{fmtInt(r.cargaAgora)}</span>}
      </td>
    </tr>
  );
}

function Destaque({ rotulo, nome, valor, tipo }: { rotulo: string; nome: string; valor: string; tipo: "agente" | "humano" | "sistema" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <span className="text-ui-11 text-muted-foreground">{rotulo}</span>
      <span className="flex items-center gap-2 text-ui-13 font-medium text-foreground">
        <Ponto tipo={tipo} />
        <span className="truncate">{nome}</span>
      </span>
      <span className="text-ui-14 font-semibold tabular-nums text-foreground">{valor}</span>
    </div>
  );
}

export function AbaEquipe({ dados }: { dados: DadosDashboardDono }) {
  const linhas = dados.equipe.filter((r) => r.ativo || r.temAtividade);
  const pessoas = linhas.filter((r) => r.tipo === "humano");
  const max = Math.max(1, ...linhas.map((r) => r.conversas.atual ?? 0));
  // A régua das barras é o MESMO número do KPI e do rodapé: a mediana de 1ª resposta de todas as
  // conversas respondidas por pessoas (e, para agentes, por agentes) — um número só na tela.
  const mediaPessoas = dados.atendimento.primeiraResposta.humanoMin ?? mediaEquipeMin(pessoas);
  const mediaAgentes = dados.atendimento.primeiraResposta.agenteMin ?? mediaEquipeMin(linhas.filter((r) => r.tipo === "agente"));
  const concluidas = linhas.reduce((s, r) => s + (r.tarefasConcluidas.atual ?? 0), 0);
  const concluidasAntes = linhas.reduce((s, r) => s + (r.tarefasConcluidas.anterior ?? 0), 0);
  const transbordos = dados.atendimento.transbordos;
  const semCarga = linhas.every((r) => r.cargaAgora == null);

  const maisRapida = pessoas.filter((r) => r.primeiraResposta.medianaMin != null && r.primeiraResposta.amostra >= 5).sort((a, b) => a.primeiraResposta.medianaMin! - b.primeiraResposta.medianaMin!)[0];
  const maisConversas = [...pessoas].sort((a, b) => (b.conversas.atual ?? 0) - (a.conversas.atual ?? 0))[0];
  const maisTarefas = [...pessoas].sort((a, b) => (b.tarefasConcluidas.atual ?? 0) - (a.tarefasConcluidas.atual ?? 0))[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <CartaoIndicador tamanho="sm" rotulo="Pessoas ativas" dica="Pessoas da equipe que responderam, moveram lead ou concluíram tarefa no período." icone={UsersIcon} valor={fmtInt(pessoas.length)} />
        <CartaoIndicador
          tamanho="sm"
          rotulo="1ª resposta · pessoas"
          dica="Mediana de 1ª resposta das conversas em que uma pessoa respondeu primeiro. É a régua das barras de tempo da tabela e o número do rodapé."
          icone={ZapIcon}
          acento="var(--chart-1)"
          valor={fmtMinutos(dados.atendimento.primeiraResposta.humanoMin)}
        />
        <CartaoIndicador tamanho="sm" rotulo="Tarefas concluídas" dica="Tarefas concluídas por toda a equipe no período." icone={CheckSquareIcon} valor={fmtInt(concluidas)} delta={variacao({ atual: concluidas, anterior: concluidasAntes })} />
        <CartaoIndicador tamanho="sm" rotulo="Transbordos" dica="Conversas que a Clara passou para uma pessoa no período. Cair é a Clara segurando mais." icone={ArrowRightLeftIcon} valor={fmtInt(transbordos.atual)} delta={variacao(transbordos)} menorEhMelhor />
      </div>

      <SecaoTabela
        titulo="Desempenho por pessoa"
        descricao="Uma linha por quem atendeu no período — agentes primeiro, depois pessoas."
        icone={UsersIcon}
        meta={`${fmtInt(pessoas.length)} ${pessoas.length === 1 ? "pessoa" : "pessoas"} · ${fmtInt(linhas.length - pessoas.length)} ${linhas.length - pessoas.length === 1 ? "agente" : "agentes"}`}
        dica="Conversas são as conversas distintas em que o ator deu a sua primeira resposta. A barra de 1ª resposta compara com a mediana do PRÓPRIO tipo (agentes com agentes, pessoas com pessoas) — não existe meta de tempo no produto, então a régua é o desempenho real. Carga é quantas conversas abertas estão com a pessoa agora."
        legenda={
          <ul className="flex flex-col gap-2">
            <ItemLegenda cor={COR_AGENTE} nome="Azul" glosa="agente (Clara, Jarvis)." />
            <ItemLegenda cor={COR_HUMANO} nome="Laranja" glosa="pessoa da equipe." />
            <ItemLegenda cor="var(--chart-1)" nome="Verde" glosa="1ª resposta na mediana do tipo ou abaixo." />
            <ItemLegenda cor="var(--chart-5)" nome="Vermelho" glosa="50% acima da mediana do tipo ou mais." />
          </ul>
        }
        rodape="Clicar no nome recorta o dashboard inteiro naquele ator (o mesmo 'ver como' de cima). * = menos de 5 conversas na amostra."
      >
        {linhas.length === 0 ? (
          <BlocoVazio titulo="Ninguém atuou no período" descricao="Assim que a equipe responder a primeira conversa, o desempenho de cada pessoa aparece aqui." acao={<Acao href="/configuracoes/membros">Ver membros</Acao>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <Th direita={false}>Quem</Th>
                  <Th>Conversas</Th>
                  <Th>Respondidas</Th>
                  <Th>1ª resposta</Th>
                  <Th>Tarefas</Th>
                  <Th>Transbordos</Th>
                  <Th title="conversas abertas com esta pessoa agora">Carga agora</Th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((r) => (
                  <LinhaPessoa key={r.ator} r={r} maxConversas={max} mediaTipo={r.tipo === "agente" ? mediaAgentes : mediaPessoas} periodo={dados.periodo} ativo={dados.atorFiltro === r.ator} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border text-ui-11 text-muted-foreground">
                  <td className="py-2 pr-2">Mediana · pessoas / agentes</td>
                  <td />
                  <td />
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtMinutos(mediaPessoas)} / {fmtMinutos(mediaAgentes)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtInt(concluidas)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtInt(transbordos.atual)}</td>
                  <td className="px-2 py-2 text-right">{semCarga ? "sem leitura" : ""}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SecaoTabela>

      {pessoas.length >= 2 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {maisRapida && <Destaque rotulo="Responde mais rápido" nome={maisRapida.nome} valor={fmtMinutos(maisRapida.primeiraResposta.medianaMin)} tipo="humano" />}
          {maisConversas && <Destaque rotulo="Mais conversas" nome={maisConversas.nome} valor={fmtInt(maisConversas.conversas.atual)} tipo="humano" />}
          {maisTarefas && <Destaque rotulo="Mais tarefas concluídas" nome={maisTarefas.nome} valor={fmtInt(maisTarefas.tarefasConcluidas.atual)} tipo="humano" />}
        </div>
      )}
    </div>
  );
}
