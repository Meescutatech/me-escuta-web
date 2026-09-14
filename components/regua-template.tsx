import { Fragment } from "react";
import { POSICAO_DIVISORIA, reguaDoTemplate, type StatusTemplate } from "@/lib/templates-whatsapp";
import { cn } from "@/lib/utils";

/*
 * A RÉGUA DO TEMPLATE — a assinatura desta tela (Design/templates-hsm-r22.html, tela 5).
 *
 * Mesma gramática da régua do funil (`components/regua-funil.tsx`, r9-tokens §4): barra
 * segmentada, 3px de altura, raio 2, gap 2. É de propósito que sejam a mesma forma — é isso que
 * faz a tela nova parecer o mesmo produto, em vez de um módulo colado.
 *
 * O que ela ACRESCENTA à do funil é UMA coisa: a **divisória de posse**. O funil é todo nosso e
 * não precisa dela; o template não é. À esquerda da divisória o trabalho e o atraso são nossos;
 * à direita é a Meta, e o tempo dela não é negociável — até 24 horas. Sem essa marca a régua
 * seria decoração; com ela, ela responde a pergunta que a operação faz todo dia: *por que isso
 * ainda não saiu?*
 *
 * Um chip diz O QUÊ. A régua diz ONDE e DE QUEM É A VEZ.
 *
 * Cores: `--navy` para o que já é fato, `--laranja` para onde está agora, `--linha` para o que
 * não aconteceu. Verde/vermelho/âmbar entram só no segmento final, como semântica — nunca como
 * cor de marca. Server-safe: sem estado, sem relógio.
 */

const COR: Record<string, string> = {
  feito: "bg-navy",
  agora: "bg-laranja",
  falhou: "bg-vermelho",
  pausa: "bg-amarelo",
  futuro: "bg-linha",
};

/** O rótulo herda a cor do desfecho — e só dele. Em curso, ele é texto de apoio. */
const COR_ROTULO: Partial<Record<StatusTemplate, string>> = {
  aprovado: "text-verde font-semibold",
  recusado: "text-vermelho font-semibold",
  pausado: "text-amarelo font-semibold",
};

export function ReguaTemplate({
  status,
  motivoStatus,
  detalhe,
  compacta,
}: {
  status: StatusTemplate;
  /** motivo cru da Meta — vira o detalhe quando o status é `recusado`. */
  motivoStatus?: string | null;
  /** Sobrescreve o detalhe da direita (a lista usa a data; a legenda usa o texto padrão). */
  detalhe?: string | null;
  /** `true` esconde a linha de rótulos — para quando o estado já está dito ao lado. */
  compacta?: boolean;
}) {
  const r = reguaDoTemplate({ status, motivo_status: motivoStatus ?? null });
  const direita = detalhe !== undefined ? detalhe : r.detalhe;

  return (
    <div>
      <div
        className="flex h-[3px] items-center gap-[2px]"
        role="img"
        aria-label={`${r.rotulo}${direita ? ` — ${direita}` : ""}${
          r.dono === "meta" ? " · a vez é da Meta" : ""
        }`}
      >
        {r.segmentos.map((s, i) => (
          <Fragment key={i}>
            <span className={cn("h-[3px] flex-1 rounded-[2px]", COR[s])} />
            {/* a divisória de posse: onde o controle passa para a Meta */}
            {i === POSICAO_DIVISORIA - 1 && (
              <span aria-hidden="true" className="mx-[3px] h-[9px] w-px flex-none bg-mute" />
            )}
          </Fragment>
        ))}
      </div>
      {!compacta && (
        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11.5px] text-mute">
          <span className={cn("min-w-0 truncate", COR_ROTULO[status] ?? "text-suave")}>{r.rotulo}</span>
          {direita && (
            // mono só para DADO DE MÁQUINA (r9-tokens §1): a data `06/08` é dado, "não submetido"
            // é prosa. Mono em prosa faz a linha inteira parecer carimbo e some com a distinção.
            <span
              className={cn("min-w-0 truncate text-right text-mute", /^\d/.test(direita) && "font-mono tabular-nums")}
              title={direita}
            >
              {direita}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A legenda dos seis estados, lado a lado. Vive na própria tela de templates (não num
 * `/design-system` que ninguém abre) porque o público dela é quem está olhando uma régua e não
 * sabe ler: ela responde ali, no lugar da dúvida.
 */
export const ESTADOS_DA_REGUA: { status: StatusTemplate; explicacao: string }[] = [
  { status: "rascunho", explicacao: "escrito, não enviado" },
  { status: "enviando", explicacao: "a caminho da Meta" },
  { status: "pendente", explicacao: "a vez é da Meta, até 24h" },
  { status: "aprovado", explicacao: "pronto para usar" },
  { status: "recusado", explicacao: "o motivo vem da Meta, cru" },
  { status: "pausado", explicacao: "está falhando agora" },
];
