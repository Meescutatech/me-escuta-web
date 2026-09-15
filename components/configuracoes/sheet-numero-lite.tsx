"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormItemLayout } from "@/components/ui/form-item-layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { registrarCanal, previsaoCanalId } from "@/app/(app)/configuracoes/canais/actions";
import {
  criarSessao,
  lerEstadoSessao,
  type EstadoSessaoNaTela,
} from "@/app/(app)/configuracoes/canais/lite/actions";
import { AVISO_RISCO_BAN, type FormCanal } from "./regras/canais.ts";
import type { Departamento } from "@/lib/departamentos/escopo";
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
 * ── Uma escolha em vez de duas ────────────────────────────────────────────────────────────────
 * Era "Nome de quem cedeu o número" (texto livre, virava o slug) + nada sobre o dono. Agora se
 * ESCOLHE a pessoa: dela saem o nome, o id `lite:<slug>` e o `responsavel_id` que a porta exige.
 * Um campo a menos e a recusa do banco deixa de existir.
 */

export interface PessoaDoNumero {
  id: string;
  nome: string;
  email: string;
}

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
  pessoas,
  departamentos,
  f8Pronto,
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** membros ATIVOS — é deles que sai o dono do número. Lista vazia é estado tratado, não vazio mudo. */
  pessoas: PessoaDoNumero[];
  departamentos: Departamento[];
  f8Pronto: boolean;
}) {
  const router = useRouter();
  const [momento, setMomento] = useState<Momento>("quem");
  const [pessoaId, setPessoaId] = useState("");
  const [finalidade, setFinalidade] = useState<"" | "teste" | "producao">("");
  const [departamento, setDepartamento] = useState("");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, iniciar] = useTransition();

  const [canalId, setCanalId] = useState("");
  const [sessao, setSessao] = useState<EstadoSessaoNaTela | null>(null);


  const pessoa = pessoas.find((p) => p.id === pessoaId) ?? null;
  const pronto = !!pessoa && finalidade !== "";

  // A PRÉVIA DO ID vem do servidor, e não de um slugify local: o id é chave primária e id
  // determinístico de conversa, e duas implementações do mesmo slug é como elas divergem no dia
  // em que alguém tem acento no nome.
  const [previsao, setPrevisao] = useState("");
  useEffect(() => {
    if (!pessoa) return setPrevisao("");
    let vivo = true;
    void previsaoCanalId(formDe(pessoa, finalidade, departamento, numero)).then((v) => vivo && setPrevisao(v));
    return () => {
      vivo = false;
    };
  }, [pessoa, finalidade, departamento, numero]);

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
    if (!pessoa || finalidade === "") return;
    setErro(null);
    iniciar(async () => {
      const form = formDe(pessoa, finalidade, departamento, numero);
      const r = await registrarCanal(form);
      if (!r.ok) {
        setErro(r.motivo ?? "não deu para registrar o número");
        return;
      }
      const id = await previsaoCanalId(form);
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
      setPessoaId("");
      setFinalidade("");
      setDepartamento("");
      setNumero("");
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
            {momento === "quem" ? "Conectar um número" : conectado ? "Número conectado" : "Aponte a câmera"}
          </SheetTitle>
          <SheetDescription>
            {momento === "quem"
              ? "O número é de uma pessoa, e continua sendo dela. O sistema passa a ler e responder por ele."
              : conectado
                ? `${pessoa?.nome ?? "O número"} está conectado. Ele nasce DESLIGADO — para ligar, o consentimento dela precisa estar registrado.`
                : "No celular dela: WhatsApp › Aparelhos conectados › Conectar um aparelho."}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5">
          {momento === "quem" ? (
            <>
              <FormItemLayout
                label="De quem é o número"
                required
                description="Dela saem o nome do canal e o id. É ela quem pareia e quem responde."
              >
                {pessoas.length === 0 ? (
                  // Vazio com direção, não vazio mudo: sem ninguém na lista o caminho é convidar.
                  <p className="text-ui-12 leading-relaxed text-warning-ink">
                    Ninguém com acesso ainda. Convide a pessoa em Membros — o número se pendura nela,
                    e sem dono a porta recusa o registro.
                  </p>
                ) : (
                  <Select value={pessoaId} onValueChange={(v) => setPessoaId(String(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="escolha a pessoa" />
                    </SelectTrigger>
                    <SelectContent>
                      {pessoas.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex flex-col">
                            <span className="text-ui-13 font-medium text-foreground">{p.nome}</span>
                            <span className="text-ui-11 text-muted-foreground">{p.email}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormItemLayout>

              <FormItemLayout
                label="Para quê"
                required
                description="Teste só entrega a quem está na lista de permissão. Produção fala com paciente."
              >
                <Select value={finalidade} onValueChange={(v) => setFinalidade(v as "teste" | "producao")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teste">Teste</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </FormItemLayout>

              <FormItemLayout label="Departamento" description="Quem responde por ele. Dá para declarar depois.">
                <Select value={departamento} onValueChange={(v) => setDepartamento(String(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="— não declarado —" />
                  </SelectTrigger>
                  <SelectContent>
                    {departamentos
                      .filter((d) => d.ativo && d.nivel > 1)
                      .map((d) => (
                        <SelectItem key={d.chave} value={d.chave}>
                          {d.rotulo}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </FormItemLayout>

              <FormItemLayout label="Número" description="Opcional — o número é dela e pode não ser conhecido agora.">
                <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="+55 11 99999-8888" />
              </FormItemLayout>

              {previsao && (
                <p className="text-ui-12 text-muted-foreground">
                  O id deste canal será <span className="font-mono">{previsao}</span> — legível, estável, e nunca o
                  número dela.
                </p>
              )}

              {/* O aviso fica ANTES do botão. Depois dele o número já está registrado, e o risco é
                  sobre o WhatsApp PESSOAL de outra pessoa — não é aviso que se dá em retrospecto. */}
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
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          {momento === "quem" ? (
            <>
              <Button variant="outline" onClick={fechar}>
                Cancelar
              </Button>
              <Button disabled={!pronto || gravando} onClick={registrarEParear}>
                {gravando ? "Registrando…" : pronto ? "Registrar e gerar o QR" : "Falta escolher a pessoa e o para quê"}
              </Button>
            </>
          ) : (
            <Button onClick={fechar}>{conectado ? "Pronto" : "Fechar e parear depois"}</Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** O `FormCanal` do não oficial. O nome e o dono saem da MESMA pessoa — é o ponto do fluxo. */
function formDe(
  pessoa: PessoaDoNumero,
  finalidade: "" | "teste" | "producao",
  departamento: string,
  numero: string,
): FormCanal {
  return {
    canalId: "",
    nome: pessoa.nome,
    provedor: "nao_oficial",
    numeroE164: numero.trim(),
    wabaId: "",
    departamento,
    finalidade,
    responsavelId: pessoa.id,
  };
}
