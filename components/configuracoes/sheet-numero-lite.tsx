"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { registrarMeuNumero } from "@/app/(app)/configuracoes/canais/actions";
import {
  criarSessao,
  lerEstadoSessao,
  type EstadoSessaoNaTela,
} from "@/app/(app)/configuracoes/canais/lite/actions";
import { momentoInicialDoPainel, podeGerirCanais, type Papel } from "./regras/canais.ts";
import type { Departamento } from "@/lib/departamentos/escopo";
import { decidirQuadro } from "./regras/qr-pareamento.ts";
import { descricaoEstadoSessao, intervaloRelituraMs, rotuloEstadoSessao, telaDoQr } from "./regras/lite-sessao.ts";
import { QuadroDePareamento } from "./painel-sessao";
import { FormNumeroOficial } from "./form-numero-oficial";

/**
 * CONECTAR UM NÚMERO NÃO OFICIAL — um fluxo só, num painel lateral.
 *
 * ── Por que isto existe (14/09) ────────────────────────────────────────────────────────────────
 * Antes eram três lugares: o formulário inline de "Adicionar número", a linha da tabela, e o painel
 * de sessão atrás de um "Ver o QR". Quem conecta um número faz as três coisas de uma vez e não
 * pensa nelas como três — pensa em "botar o WhatsApp da Jade no sistema".
 *
 * E o formulário não funcionava: a porta exige `responsavel_id` no canal não oficial e a tela nunca
 * o mandava. A recusa aparecia como texto de banco numa faixa no topo da página, longe do botão.
 *
 * ── A ordem é imposta pelo backend, não escolhida ──────────────────────────────────────────────
 * O QR não pode vir antes do registro: `podeCriarSessao` recusa com "registre o canal antes — a
 * sessão se pendura num canal existente", e o provisionamento devolve 404 para canal que não está
 * no ledger. Então são dois momentos de verdade, e é por isso que eles são numerados — não por
 * enfeite. O que o painel faz é não fazer a pessoa sair do lugar entre um e outro.
 *
 * ── Por que painel lateral, e não caixa no meio da tela ────────────────────────────────────────
 * Parear é ESPERAR: a pessoa pega o celular, abre o WhatsApp, acha "Aparelhos conectados". Uma
 * caixa modal escurece o sistema inteiro durante essa espera e some com a lista de números, que é
 * o contexto. O painel deixa a lista visível ao lado.
 *
 * ── 16/09 · D116: o número é de quem cadastra, e o painel é só o botão ──────────────────────────
 * Houve um seletor de pessoa, um "Para quê", um departamento e um número. Saíram todos: o dono é
 * quem está logado, o nome é o do cadastro, a finalidade é produção e o departamento deixou de ser
 * exigido (0348). Tudo isso é decidido no SERVIDOR (`registrarMeuNumero`) — a tela não monta form,
 * e por isso não tem como escolher o dono de ninguém. O número do WhatsApp virou card (o runtime
 * passa a gravá-lo no pareamento).
 *
 * ── 16/09 (tarde) · o painel é a porta única de "Adicionar número" ────────────────────────────
 * A primeira tela é o SELETOR (oficial × não oficial); o formulário do oficial mora aqui
 * (`FormNumeroOficial`), e escolher "Não oficial" registra na hora. A fono não tem o que escolher e
 * o painel já abre gerando. Enquanto o QR não chega, "Gerando o QR…" (`telaDoQr`) — antes o quadro
 * vazio dizia "nenhum código ativo" nesses segundos. O aviso de ban saiu: o risco está na opção.
 */

/*
 * DOIS momentos, e o consentimento NÃO é um deles — decisão do Diogo em 14/09, e medida antes:
 *
 *   BANCO   CHECK (provedor <> 'nao_oficial' OR ativo IS NOT TRUE OR consentimento_em IS NOT NULL)
 *   RUNTIME zero referência a consentimento no caminho da sessão
 *
 * Ou seja: o consentimento é exigido para o canal ficar ATIVO, não para PAREAR. A trava que estava
 * aqui era só nossa, e mais dura que a do banco — parear não põe nada em movimento: o canal nasce
 * desligado e nenhuma mensagem entra ou sai enquanto ninguém o liga. O ban que ameaça o WhatsApp
 * pessoal dela vem do USO.
 *
 * A proteção continua inteira, no degrau em que ela decide: `canal_ativado` é recusado sem
 * consentimento pela `api.registrar_evento` (ARB-16) E pela regra do web. Duas travas concordando,
 * em vez de três em que uma discordava.
 */
type Momento = "escolher" | "oficial" | "parear";

/** Uma opção do seletor de tipo. O texto diz o que é e o risco — não há aviso separado. */
function OpcaoTipo({ titulo, explicacao, onClick }: { titulo: string; explicacao: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-lg border border-border p-3 text-left transition-colors",
        "hover:border-primary/50 hover:bg-primary/[0.04] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
    >
      <span className="text-ui-13 font-medium text-foreground">{titulo}</span>
      <span className="text-ui-12 leading-relaxed text-muted-foreground">{explicacao}</span>
    </button>
  );
}

export function SheetNumeroLite({
  aberto,
  aoFechar,
  f8Pronto,
  meuPapel,
  departamentos,
  dominioIndisponivel,
  aoAviso,
}: {
  aberto: boolean;
  aoFechar: () => void;
  f8Pronto: boolean;
  meuPapel: Papel | null;
  /** só o formulário do OFICIAL usa — o número pessoal não escolhe departamento. */
  departamentos: Departamento[];
  dominioIndisponivel: boolean;
  aoAviso: (m: string) => void;
}) {
  const router = useRouter();
  const inicial = momentoInicialDoPainel(meuPapel);
  const [momento, setMomento] = useState<Momento>(inicial === "gerando" ? "parear" : "escolher");
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, iniciar] = useTransition();
  const [canalId, setCanalId] = useState("");
  const [sessao, setSessao] = useState<EstadoSessaoNaTela | null>(null);
  const reabrePelaLista = podeGerirCanais(meuPapel);
  const temQr = Boolean(sessao?.qr || sessao?.qrImagem);

  // ENQUANTO espera o pareamento, relê — rápido até o primeiro QR chegar, depois a cada 5 s — e
  // PARA ao conectar. Um laço que não sabe parar sozinho vira carga no runtime.
  const conectado = sessao?.estado === "conectado";
  useEffect(() => {
    if (momento !== "parear" || !canalId || conectado) return;
    const ms = intervaloRelituraMs(sessao?.estado ?? "desconectado", false, temQr);
    if (!ms) return;
    const t = setInterval(() => void lerEstadoSessao(canalId).then(setSessao), ms);
    return () => clearInterval(t);
  }, [momento, canalId, conectado, sessao?.estado, temQr]);

  // conectou: a lista lá atrás tem de mostrar o número novo sem a pessoa recarregar
  useEffect(() => {
    if (conectado) router.refresh();
  }, [conectado, router]);

  // A fono não tem o que escolher: abrir o painel JÁ é pedir o número. Uma vez por abertura.
  const disparou = useRef(false);
  useEffect(() => {
    if (!aberto) {
      disparou.current = false;
      return;
    }
    if (inicial === "gerando" && !disparou.current) {
      disparou.current = true;
      registrarEParear();
    }
    // registrarEParear é estável o bastante: só lê estado dentro da transição
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, inicial]);

  const quadro = useMemo(
    () =>
      decidirQuadro({
        qr: sessao?.qr ?? null,
        qrImagem: sessao?.qrImagem ?? null,
        formato: sessao?.qrFormato ?? null,
        qrValido: sessao?.qrValido ?? false,
        semPrazo: sessao?.qrSemPrazo ?? false,
        conectado,
      }),
    [sessao, conectado],
  );

  const tela = telaDoQr({
    gravando,
    sessao: sessao ? { estado: sessao.estado, temQr, motivo: sessao.motivo ?? null } : null,
    erro,
  });

  function registrarEParear() {
    if (gravando) return;
    setErro(null);
    setSessao(null);
    setMomento("parear");
    iniciar(async () => {
      const r = await registrarMeuNumero();
      if (!r.ok) {
        setErro(r.motivo ?? "não deu para registrar o seu número");
        return;
      }
      // o id GRAVADO: se `lite:ana` já existia, o canal nasceu `lite:ana-2`
      const id = r.canalId ?? "";
      if (!id) {
        setErro("o número foi registrado, mas o servidor não disse com qual id — recarregue a página e gere o QR pela lista");
        return;
      }
      setCanalId(id);
      router.refresh();
      setSessao(await criarSessao(id, { f8Pronto }));
    });
  }

  function fechar() {
    aoFechar();
    setTimeout(() => {
      setMomento(inicial === "gerando" ? "parear" : "escolher");
      setCanalId("");
      setSessao(null);
      setErro(null);
    }, 220);
  }

  const titulo =
    momento === "escolher"
      ? "Adicionar número"
      : momento === "oficial"
        ? "Número oficial"
        : tela === "conectado"
          ? "Número conectado"
          : tela === "qr"
            ? "Aponte a câmera"
            : tela === "erro"
              ? "Não deu para gerar o QR"
              : "Gerando o QR…";
  const descricao =
    momento === "escolher"
      ? "Ele nasce desligado; ligar é um segundo passo."
      : momento === "oficial"
        ? "Os dados saem do painel da Meta."
        : tela === "conectado"
          ? "Seu número está conectado. Ele nasce desligado: quem liga é admin ou Proprietário."
          : tela === "qr"
            ? "No seu celular: WhatsApp › Aparelhos conectados › Conectar um aparelho."
            : tela === "erro"
              ? "O motivo está abaixo."
              : "Registrando o seu número e preparando a conexão. Leva alguns segundos.";

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && fechar()}>
      <SheetContent className="sm:max-w-[460px]">
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
          <SheetDescription>{descricao}</SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5">
          {momento === "escolher" ? (
            <div className="flex flex-col gap-2.5">
              <OpcaoTipo
                titulo="Oficial (WhatsApp Cloud API)"
                explicacao="Número da empresa aprovado na Meta. Sem risco de bloqueio."
                onClick={() => setMomento("oficial")}
              />
              <OpcaoTipo
                titulo="Não oficial (biblioteca)"
                explicacao="O seu WhatsApp, conectado por QR. Pode ser banido pelo WhatsApp — e o ban atinge a sua conta pessoal."
                onClick={registrarEParear}
              />
            </div>
          ) : momento === "oficial" ? (
            <FormNumeroOficial
              departamentos={departamentos}
              dominioIndisponivel={dominioIndisponivel}
              aoCancelar={() => setMomento("escolher")}
              aoRegistrar={(m) => {
                aoAviso(m);
                fechar();
              }}
            />
          ) : tela === "gerando" ? (
            <div className="flex flex-col items-center gap-3 py-10" role="status" aria-live="polite">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
              <p className="text-[13.5px] font-medium text-foreground">Gerando o QR…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {tela !== "erro" && <QuadroDePareamento quadro={quadro} />}
              {tela !== "erro" && (
                <div className="text-center">
                  <p className="text-[13.5px] font-medium text-foreground">{rotuloEstadoSessao(sessao?.estado ?? "desconectado")}</p>
                  <p className="mt-0.5 max-w-[34ch] text-ui-12 leading-relaxed text-muted-foreground">
                    {descricaoEstadoSessao(sessao?.estado ?? "desconectado")}
                  </p>
                </div>
              )}
              {(erro || sessao?.motivo) && (
                <p role="alert" className="max-w-[40ch] rounded-md bg-destructive/10 px-3 py-2 text-center text-[12.5px] leading-relaxed text-destructive">
                  {erro ?? sessao?.motivo}
                </p>
              )}
              {canalId && <p className="text-ui-11 font-mono text-muted-foreground">{canalId}</p>}
              {/* Quem não é gestão não tem a ação da linha na lista: fechar antes de parear é deixar o
                  QR para admin ou Proprietário gerar de novo. Dito antes, não depois. */}
              {!reabrePelaLista && tela === "qr" && (
                <p className="max-w-[40ch] text-center text-ui-12 leading-relaxed text-muted-foreground">
                  Se fechar agora, o QR não reabre por aqui: peça a um admin ou Proprietário para
                  gerá-lo de novo pela lista.
                </p>
              )}
            </div>
          )}
        </SheetBody>

        {momento !== "oficial" && (
          <SheetFooter>
            <Button variant={tela === "conectado" ? "default" : "outline"} onClick={fechar}>
              {momento === "escolher"
                ? "Cancelar"
                : tela === "conectado"
                  ? "Pronto"
                  : reabrePelaLista
                    ? "Fechar e parear depois"
                    : "Fechar sem parear"}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
