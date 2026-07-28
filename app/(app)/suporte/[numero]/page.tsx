import Link from "next/link";
import { lerPapelAtual, lerUidAtual } from "@/components/configuracoes/dados/porta";
import {
  lerAnexosComUrl,
  lerComentarios,
  lerTicketPorNumero,
} from "@/components/suporte/dados/suporte";
import { FioConversa } from "@/components/suporte/fio-conversa";
import {
  MOTIVO_CHAMADO_INACESSIVEL,
  codigoTicket,
  numeroDaRota,
  podeComentarChamado,
  rotuloTipo,
} from "@/components/suporte/regras/suporte.ts";
import { BlocoVazio, Cabecalho, Chip, Faixa, dataHora } from "@/components/configuracoes/kit";

export const dynamic = "force-dynamic";

/**
 * M5 · `/suporte/<numero>` — o DETALHE do chamado. A superfície que faltava.
 *
 * Endereçada pelo `numero` da view (`/suporte/14`) porque é o que um humano cita — "o chamado 14".
 * O número é `row_number` (ARB-21), então ele PODE deslizar se um evento de abertura entrar fora
 * de ordem no replay; o link canônico interno continua sendo o uuid, e isto está declarado, não
 * descoberto depois.
 *
 * Esta tela é onde os TRÊS leitores que existiam sem consumidor finalmente ligam: `lerComentarios`,
 * `lerAnexos` e `urlAssinadaAnexo`. O anexo subia, era gravado, tinha URL assinada pronta — e não
 * havia tela que o mostrasse.
 *
 * `/suporte` NÃO participa do escopo transversal por departamento (SPEC-M5 §5.6-bis). Bug e ideia
 * são sobre a FERRAMENTA, que é a mesma para todo departamento, e quem responde é o time de
 * produto, que não pertence a nenhum. Quem introduzir escopo transversal exclui o suporte NO MESMO
 * COMMIT — entre introduzir e excluir existe uma janela em que chamados somem, e essa janela não
 * tem volta. A proteção de hoje (o leitor do suporte não estar em `lib/dados/`) é acidente de
 * organização de pasta, não decisão, e morre no primeiro refactor que consolide os leitores.
 */
export default async function DetalheChamadoPage({
  params,
}: {
  params: { numero: string };
}) {
  const numero = numeroDaRota(params.numero);
  if (numero === null) return <NaoAcessivel />;

  const [{ ticket, autorId, indisponivel }, papel, meuUid] = await Promise.all([
    lerTicketPorNumero(numero),
    lerPapelAtual(),
    lerUidAtual(),
  ]);

  // INDISPONÍVEL ≠ VAZIO, e a tela não pode confundir os dois. "Não existe ou não é seu" é uma
  // resposta; "a leitura falhou" é a ausência de resposta. Mostrar a primeira quando aconteceu a
  // segunda ensina a pessoa a desistir de um chamado que existe.
  if (indisponivel) {
    return (
      <>
        <Voltar />
        <Faixa tom="erro">
          Não foi possível ler este chamado agora. A conexão caiu ou a migration ainda não subiu
          neste ambiente — não é que ele não exista.
        </Faixa>
      </>
    );
  }

  if (!ticket) return <NaoAcessivel />;

  const [comentarios, anexos] = await Promise.all([
    lerComentarios(ticket.id),
    lerAnexosComUrl(ticket.id),
  ]);

  const podeComentar = podeComentarChamado(papel, autorId, meuUid);

  return (
    <>
      <Cabecalho
        voltar={<Voltar />}
        titulo={ticket.titulo}
        contador={codigoTicket(ticket.numero)}
        descricao={
          <>
            {rotuloTipo(ticket.tipo)} · {ticket.autor_nome ?? ticket.autor_email ?? "—"} ·{" "}
            {dataHora(ticket.aberto_em)}
          </>
        }
        acoes={
          <>
            <Chip tom={ticket.status === "aberto" ? "ambar" : "neutro"}>
              {ticket.status === "aberto" ? "aberto" : "resolvido"}
            </Chip>
            {/* SEM seletor de estado: o banco tem DOIS estados (`aberto|resolvido`) e o mockup r10
                oferecia QUATRO. Onde mockup e código divergem, vence o código implantado — a porta
                recusaria `em_analise` e `descartado`, e a tela teria oferecido um estado que não
                existe. `em_analise`/`descartado` seguem dívida declarada (ARB-18.4), não
                esquecimento. Resolver é UMA AÇÃO, e ela vive na lista. */}
          </>
        }
      />

      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-tinta">
        {ticket.descricao}
      </p>

      {anexos.length > 0 ? (
        <section className="mt-5">
          <h2 className="mb-2 text-[13.5px] font-semibold text-tinta">Prints</h2>
          <div className="flex flex-wrap gap-2.5">
            {anexos.map((a) =>
              a.url ? (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded border border-linha hover:border-navy"
                >
                  {/* <img> cru e não next/image: a URL é ASSINADA e expira em 1800 s, então o
                      otimizador não pode cachear nem reescrever o host. Otimizar aqui produziria
                      quadrado quebrado depois de meia hora. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.nome ?? "print do chamado"}
                    className="h-[120px] w-auto max-w-[220px] object-cover"
                  />
                </a>
              ) : (
                <span
                  key={a.id}
                  className="flex h-[120px] w-[160px] items-center justify-center rounded border border-dashed border-linha px-2 text-center text-[12px] text-suave"
                >
                  imagem indisponível
                </span>
              ),
            )}
          </div>
        </section>
      ) : null}

      {/* CONTEXTO — o que faz um bug ser reproduzível. `versao` é a coluna que a 0115 acrescenta;
          `departamento_ativo` entra no payload quando o M8 existir, e a ausência dele não quebra
          nada aqui. */}
      <section className="mt-5 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-linha pt-3">
        <Dado rotulo="Tela de origem" valor={ticket.onde} mono />
        <Dado rotulo="Versão do sistema" valor={ticket.versao} mono />
      </section>

      {ticket.status === "resolvido" && ticket.resolucao ? (
        <section className="mt-5 rounded border border-linha bg-board p-3">
          <h2 className="mb-1 text-[13px] font-semibold text-tinta">
            Resolvido{ticket.resolvido_por_nome ? ` por ${ticket.resolvido_por_nome}` : ""}
            {ticket.resolvido_em ? ` · ${dataHora(ticket.resolvido_em)}` : ""}
          </h2>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-tinta">
            {ticket.resolucao}
          </p>
        </section>
      ) : null}

      <FioConversa
        ticketId={ticket.id}
        comentarios={comentarios}
        podeComentar={podeComentar}
        meuUid={meuUid}
      />
    </>
  );
}

function Voltar() {
  return (
    <Link href="/suporte" className="mb-2 inline-block text-[12.5px] text-suave hover:text-navy">
      ← Suporte
    </Link>
  );
}

function Dado({ rotulo, valor, mono }: { rotulo: string; valor: string | null; mono?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11.5px] text-suave">{rotulo}</span>
      <span className={`text-[13px] text-tinta ${mono ? "font-mono" : ""}`}>{valor ?? "—"}</span>
    </span>
  );
}

/**
 * UMA FRASE SÓ para "não existe" e "não é seu". A RLS devolve vazio nos dois e não distingue —
 * distinguir aqui vazaria a existência de chamado alheio para quem varresse /suporte/1, /2, /3.
 */
function NaoAcessivel() {
  return (
    <>
      <Voltar />
      <BlocoVazio
        titulo={MOTIVO_CHAMADO_INACESSIVEL}
        apoio="Se você acha que deveria ver este chamado, peça a quem administra o sistema."
      />
    </>
  );
}
