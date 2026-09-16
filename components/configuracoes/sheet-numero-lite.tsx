"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { registrarMeuNumero } from "@/app/(app)/configuracoes/canais/actions";
import {
  criarSessao,
  lerEstadoSessao,
  type EstadoSessaoNaTela,
} from "@/app/(app)/configuracoes/canais/lite/actions";
import { AVISO_RISCO_BAN, podeGerirCanais, type Papel } from "./regras/canais.ts";
import { decidirQuadro } from "./regras/qr-pareamento.ts";
import { descricaoEstadoSessao, intervaloRelituraMs, rotuloEstadoSessao } from "./regras/lite-sessao.ts";
import { QuadroDePareamento } from "./painel-sessao";

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
 *
 * O aviso do risco fica onde estava: na primeira tela, antes do botão.
 */
type Momento = "quem" | "parear";

export function SheetNumeroLite({
  aberto,
  aoFechar,
  f8Pronto,
  meuPapel,
}: {
  aberto: boolean;
  aoFechar: () => void;
  f8Pronto: boolean;
  /** só para o aviso de "fechar sem parear": a gestão reabre o QR pela lista, o membro não. */
  meuPapel: Papel | null;
}) {
  const router = useRouter();
  const [momento, setMomento] = useState<Momento>("quem");
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, iniciar] = useTransition();
  const [canalId, setCanalId] = useState("");
  const [sessao, setSessao] = useState<EstadoSessaoNaTela | null>(null);
  const reabrePelaLista = podeGerirCanais(meuPapel);

  // ENQUANTO espera o pareamento, relê; ao conectar, PARA. O intervalo é regra pura e testada —
  // um laço que não sabe parar sozinho é o que transforma uma tela aberta em carga no runtime.
  const conectado = sessao?.estado === "conectado";
  useEffect(() => {
    if (momento !== "parear" || !canalId || conectado) return;
    const ms = intervaloRelituraMs(sessao?.estado ?? "desconectado");
    if (!ms) return;
    const t = setInterval(() => void lerEstadoSessao(canalId).then(setSessao), ms);
    return () => clearInterval(t);
  }, [momento, canalId, conectado, sessao?.estado]);

  // conectou: a lista lá atrás tem de mostrar o número novo sem a pessoa recarregar
  useEffect(() => {
    if (conectado) router.refresh();
  }, [conectado, router]);

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

  function registrarEParear() {
    setErro(null);
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
      setMomento("parear");
      router.refresh();
      setSessao(await criarSessao(id, { f8Pronto }));
    });
  }

  function fechar() {
    aoFechar();
    setTimeout(() => {
      setMomento("quem");
      setCanalId("");
      setSessao(null);
      setErro(null);
    }, 220);
  }

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && fechar()}>
      <SheetContent className="sm:max-w-[460px]">
        <SheetHeader>
          <SheetTitle>
            {momento === "quem" ? "Conectar o seu número" : conectado ? "Número conectado" : "Aponte a câmera"}
          </SheetTitle>
          <SheetDescription>
            {momento === "quem"
              ? "Registre o seu WhatsApp e gere o QR. O número continua sendo seu; o sistema passa a ler e responder por ele."
              : conectado
                ? "Seu número está conectado. Ele nasce desligado: quem liga é admin ou Proprietário."
                : "No seu celular: WhatsApp › Aparelhos conectados › Conectar um aparelho."}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5">
          {momento === "quem" ? (
            <>
              {/* O aviso fica ANTES do botão: depois dele o número já está registrado, e o risco é
                  sobre o WhatsApp PESSOAL — não é aviso que se dá em retrospecto. */}
              <p className="rounded-md bg-warning-bg px-3.5 py-3 text-ui-12 leading-relaxed text-warning-ink">
                {AVISO_RISCO_BAN}
              </p>

              {erro && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
                  {erro}
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <QuadroDePareamento quadro={quadro} />
              <div className="text-center">
                <p className="text-[13.5px] font-medium text-foreground">{rotuloEstadoSessao(sessao?.estado ?? "desconectado")}</p>
                <p className="mt-0.5 max-w-[34ch] text-ui-12 leading-relaxed text-muted-foreground">
                  {descricaoEstadoSessao(sessao?.estado ?? "desconectado")}
                </p>
              </div>
              {/* 🔴 O MOTIVO. Sem esta linha o quadro vazio dizia "Nenhum código ativo. Peça uma
                  sessão para gerar." — um texto genérico sobre uma recusa ESPECÍFICA que o servidor
                  já tinha explicado. Foi assim que o consentimento faltando virou "o QR não
                  aparece": a tela sabia por quê e não contava. */}
              {sessao?.motivo && (
                <p role="alert" className="max-w-[40ch] rounded-md bg-destructive/10 px-3 py-2 text-center text-[12.5px] leading-relaxed text-destructive">
                  {sessao.motivo}
                </p>
              )}
              {canalId && <p className="text-ui-11 font-mono text-muted-foreground">{canalId}</p>}
              {/* Quem não é gestão não tem a ação da linha na lista: fechar antes de parear é deixar o
                  QR para admin ou Proprietário gerar de novo. Dito antes, não depois. */}
              {!reabrePelaLista && !conectado && (
                <p className="max-w-[40ch] text-center text-ui-12 leading-relaxed text-muted-foreground">
                  Se fechar agora, o QR não reabre por aqui: peça a um admin ou Proprietário para
                  gerá-lo de novo pela lista.
                </p>
              )}
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          {momento === "quem" ? (
            <>
              <Button variant="outline" onClick={fechar}>
                Cancelar
              </Button>
              <Button disabled={gravando} onClick={registrarEParear}>
                {gravando ? "Registrando…" : "Registrar e gerar o QR"}
              </Button>
            </>
          ) : (
            <Button onClick={fechar}>
              {conectado ? "Pronto" : reabrePelaLista ? "Fechar e parear depois" : "Fechar sem parear"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
