import Link from "next/link";
import { PhoneIcon, SmartphoneIcon } from "lucide-react";
import type { DadosDashboardDono } from "@/lib/dados/dashboard-dono";
import { fmtInt, fmtMinutos, fmtPct, variacao } from "@/lib/dados/dashboard-ceo-calculos";
import { MINUTOS_SLA_CANAL, type LinhaCanal } from "@/lib/dados/dashboard-dono-calculos";
import { cn } from "@/lib/utils";
import { Acao, Th } from "./pecas";
import { BarraParticipacao, BlocoVazio, CartaoIndicador, CelulaMetrica, CORES_SERIE, fracaoDoMaximo, ItemLegenda, SecaoTabela, SeloVariacao, type Fatia } from "./relatorio";

/**
 * Aba Canais — por NÚMERO: o oficial (Clara) e os Lite de cada pessoa. É a pergunta que decide onde
 * pôr gente: se o número da Sara responde em 42 min e o da Clara em 3, o problema não é "a equipe
 * está lenta", é "aquele número não tem quem responda".
 *
 * 1ª resposta acima de 5 min fica vermelha — o mesmo limiar que o LiderHub chama de SLA de
 * primeira resposta. Desconectado é a notícia mais grave e vem antes de qualquer número.
 */

const ROTULO_DEP: Record<string, string> = { pre_venda: "Pré-venda", pos_venda: "Pós-venda", clinico: "Clínico" };

function LinhaNumero({ c, cor, maxRecebidas }: { c: LinhaCanal; cor: string; maxRecebidas: number }) {
  const rec = c.recebidas.atual ?? 0;
  const resp = c.respondidas.atual ?? 0;
  const lento = c.primeiraRespostaMin != null && c.primeiraRespostaMin > MINUTOS_SLA_CANAL;
  const cel = "px-2 py-2.5 align-top";
  return (
    <tr className={cn("border-t border-border/70", !c.conectado && "bg-danger-tint/40")}>
      <td className="py-2.5 pr-2 align-top">
        <Link href={`/conversas?canal=${encodeURIComponent(c.canal_id)}`} className="flex items-center gap-2.5 hover:underline">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-ui-13 font-medium text-foreground">{c.apelido}</span>
            <span className="truncate text-ui-11 text-muted-foreground tabular-nums">
              {c.numero} · {c.provedor === "waba" ? "oficial" : "Lite"} · {ROTULO_DEP[c.departamento] ?? c.departamento}
            </span>
          </span>
        </Link>
      </td>
      <td className={cel}>
        {c.ativo ? (
          c.conectado ? (
            <span className="inline-flex items-center gap-1.5 text-ui-12 text-success-ink">
              <span aria-hidden className="size-1.5 rounded-full bg-success-ink" /> conectado
            </span>
          ) : (
            <Link href="/configuracoes/canais" className="inline-flex items-center gap-1.5 text-ui-12 font-medium text-danger-ink hover:underline">
              <span aria-hidden className="size-1.5 rounded-full bg-danger-ink" /> desconectado
            </Link>
          )
        ) : (
          <span className="text-ui-12 text-muted-foreground">desligado</span>
        )}
      </td>
      <td className={cel}>
        <CelulaMetrica valor={fmtInt(rec)} barra={{ fracao: fracaoDoMaximo(rec, maxRecebidas), tom: "neutro" }} tituloBarra={`${fmtInt(rec)} de ${fmtInt(maxRecebidas)}, o número com mais conversas`} />
      </td>
      <td className={cel}>
        <CelulaMetrica valor={fmtInt(resp)} secundario={rec > 0 ? fmtPct(resp / rec) : undefined} barra={{ fracao: fracaoDoMaximo(resp, rec), tom: "bom" }} tituloBarra={`${fmtInt(resp)} das ${fmtInt(rec)} conversas recebidas foram respondidas`} />
      </td>
      <td className={cn(cel, "text-right text-ui-13 font-medium tabular-nums", lento ? "text-danger-ink" : "text-foreground")} title={lento ? `acima do limiar de ${MINUTOS_SLA_CANAL} min` : undefined}>
        {fmtMinutos(c.primeiraRespostaMin)}
      </td>
      <td className={cn(cel, "text-right text-ui-13 tabular-nums", c.semResposta > 0 ? "font-medium text-warning-ink" : "text-foreground")}>{fmtInt(c.semResposta)}</td>
      <td className={cn(cel, "text-right text-ui-13 tabular-nums text-foreground")}>{fmtInt(c.conversasAbertas)}</td>
    </tr>
  );
}

export function AbaCanais({ dados }: { dados: DadosDashboardDono }) {
  const canais = dados.canais;
  if (!canais) {
    return (
      <SecaoTabela titulo="Desempenho por número" descricao="Recebidas, respondidas e 1ª resposta, número a número." icone={PhoneIcon}>
        <BlocoVazio
          titulo="Sem leitura por número"
          descricao="As views do dashboard ainda não registram por qual número a conversa entrou. Enquanto a migration não chega, os números vivem em Configurações → Canais."
          acao={<Acao href="/configuracoes/canais">Abrir canais</Acao>}
        />
      </SecaoTabela>
    );
  }

  const ordenados = [...canais].sort((a, b) => (b.recebidas.atual ?? 0) - (a.recebidas.atual ?? 0));
  const cores = new Map(ordenados.map((c, i) => [c.canal_id, CORES_SERIE[i % CORES_SERIE.length]]));
  const totalRec = ordenados.reduce((s, c) => s + (c.recebidas.atual ?? 0), 0);
  const totalResp = ordenados.reduce((s, c) => s + (c.respondidas.atual ?? 0), 0);
  const totalRecAnt = ordenados.reduce((s, c) => s + (c.recebidas.anterior ?? 0), 0);
  const semResposta = ordenados.reduce((s, c) => s + c.semResposta, 0);
  const desconectados = ordenados.filter((c) => c.ativo && !c.conectado).length;
  const lentos = ordenados.filter((c) => c.primeiraRespostaMin != null && c.primeiraRespostaMin > MINUTOS_SLA_CANAL).length;
  const max = Math.max(1, ...ordenados.map((c) => c.recebidas.atual ?? 0));
  const fatias: Fatia[] = ordenados.map((c) => ({ chave: c.canal_id, rotulo: c.apelido, valor: c.recebidas.atual ?? 0, cor: cores.get(c.canal_id)! }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <CartaoIndicador tamanho="sm" rotulo="Números ativos" dica="Números de WhatsApp ligados: o oficial da empresa e os Lite de cada pessoa." icone={SmartphoneIcon} valor={fmtInt(ordenados.filter((c) => c.ativo).length)} detalhe={desconectados > 0 ? `${desconectados} desconectado` : undefined} />
        <CartaoIndicador tamanho="sm" rotulo="Conversas recebidas" dica="Conversas com mensagem do cliente no período, somando todos os números." icone={PhoneIcon} valor={fmtInt(totalRec)} delta={variacao({ atual: totalRec, anterior: totalRecAnt })} />
        <CartaoIndicador tamanho="sm" rotulo="Respondidas" dica="Conversas que receberam a primeira resposta nossa, somando todos os números." icone={PhoneIcon} valor={totalRec > 0 ? fmtPct(totalResp / totalRec) : "—"} />
        <CartaoIndicador tamanho="sm" rotulo="Acima de 5 min" dica={`Números cuja 1ª resposta mediana passa de ${MINUTOS_SLA_CANAL} min no período.`} icone={PhoneIcon} acento={lentos > 0 ? "var(--chart-5)" : undefined} valor={fmtInt(lentos)} />
      </div>

      <SecaoTabela
        titulo="Desempenho por número"
        descricao="Recebidas, respondidas e 1ª resposta, número a número."
        icone={PhoneIcon}
        meta={semResposta > 0 ? `${fmtInt(semResposta)} sem resposta agora` : undefined}
        dica={`Uma linha por número da empresa. 'Sem resposta' é agora, não do período: conversas em que a última mensagem é do cliente. 1ª resposta acima de ${MINUTOS_SLA_CANAL} min fica em vermelho — é o limiar de SLA que o relatório usa.`}
        legenda={
          <ul className="flex flex-col gap-2">
            {ordenados.map((c) => (
              <ItemLegenda key={c.canal_id} cor={cores.get(c.canal_id)!} nome={c.apelido} glosa={`${c.numero} · ${c.provedor === "waba" ? "oficial" : "Lite"}`} />
            ))}
          </ul>
        }
        rodape="Clicar no número abre a caixa de entrada filtrada nele. Desconectado abre Configurações → Canais."
      >
        <div className="mb-3">
          <BarraParticipacao fatias={fatias} formatar={(v) => `${fmtInt(v)} conversas`} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <Th direita={false}>Número</Th>
                <Th direita={false}>Estado</Th>
                <Th>Recebidas</Th>
                <Th>Respondidas</Th>
                <Th title="mediana no período">1ª resposta</Th>
                <Th title="conversas com a última mensagem do cliente, agora">Sem resposta</Th>
                <Th title="conversas abertas agora">Abertas</Th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((c) => (
                <LinhaNumero key={c.canal_id} c={c} cor={cores.get(c.canal_id)!} maxRecebidas={max} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-ui-11 text-muted-foreground">
                <td className="py-2 pr-2">Todos os números</td>
                <td />
                <td className="px-2 py-2 text-right tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    {fmtInt(totalRec)}
                    <SeloVariacao delta={variacao({ atual: totalRec, anterior: totalRecAnt })} tamanho="sm" />
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{totalRec > 0 ? `${fmtPct(totalResp / totalRec)} · ${fmtInt(totalResp)}` : "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtMinutos(dados.atendimento.primeiraResposta.geralMin.atual)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtInt(semResposta)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtInt(ordenados.reduce((s, c) => s + c.conversasAbertas, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SecaoTabela>
    </div>
  );
}
