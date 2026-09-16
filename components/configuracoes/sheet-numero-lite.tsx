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
import {
  AVISO_RISCO_BAN,
  estadoDoDepartamento,
  estadoDoRegistro,
  itensPessoas,
  type Finalidade,
  type FormCanal,
  type Papel,
} from "./regras/canais.ts";
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
 *
 * ── 16/09 · a fono registra o próprio ──────────────────────────────────────────────────────────
 * O membro abre este mesmo painel, mas sem escolha: o número é dele, a finalidade é produção e o
 * "Para quê" não aparece. Quem decide isso é `estadoDoRegistro` — o painel não relê o estado bruto,
 * porque com o seletor escondido a finalidade bruta fica vazia para sempre.
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
  meuPapel,
  meuId,
  minhasLotacoes = null,
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** membros ATIVOS — é deles que sai o dono do número. Lista vazia é estado tratado, não vazio mudo. */
  pessoas: PessoaDoNumero[];
  departamentos: Departamento[];
  f8Pronto: boolean;
  meuPapel: Papel | null;
  /** uid de quem está logado — é ele que fixa o dono quando o papel é membro. */
  meuId: string | null;
  /** onde quem está logado está lotado (expandido pelo banco). Só o membro depende disto. */
  minhasLotacoes?: string[] | null;
}) {
  const router = useRouter();
  const [momento, setMomento] = useState<Momento>("quem");
  const [pessoaId, setPessoaId] = useState("");
  const [finalidade, setFinalidade] = useState<Finalidade | "">("");
  const [departamento, setDepartamento] = useState("");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, iniciar] = useTransition();

  const [canalId, setCanalId] = useState("");
  const [sessao, setSessao] = useState<EstadoSessaoNaTela | null>(null);


  const registro = estadoDoRegistro({ papel: meuPapel, uid: meuId, pessoas, pessoaId, finalidade });
  const { pessoa, pessoaFixa, mostraFinalidade } = registro;
  const finalidadeDoForm = registro.finalidade;
  // 16/09 · o departamento entra no "pronto": a porta recusa o não oficial sem ele (Parte B da 0337)
  // e o do membro fora das lotações dele (PMEE6). O botão não pode prometer o que o banco recusa.
  const depto = estadoDoDepartamento({
    papel: meuPapel,
    departamentos,
    lotacoes: minhasLotacoes,
    departamento,
  });
  const pronto = registro.pronto && depto.valido;

  // A PRÉVIA DO ID vem do servidor, e não de um slugify local: o id é chave primária e id
  // determinístico de conversa, e duas implementações do mesmo slug é como elas divergem no dia
  // em que alguém tem acento no nome.
  const [previsao, setPrevisao] = useState("");
  useEffect(() => {
    if (!pessoa) return setPrevisao("");
    let vivo = true;
    void previsaoCanalId(formDe(pessoa, finalidadeDoForm, departamento, numero)).then((v) => vivo && setPrevisao(v));
    return () => {
      vivo = false;
    };
  }, [pessoa, finalidadeDoForm, departamento, numero]);

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
    if (!pessoa || !pronto) return;
    setErro(null);
    iniciar(async () => {
      const form = formDe(pessoa, finalidadeDoForm, departamento, numero);
      const r = await registrarCanal(form);
      if (!r.ok) {
        setErro(r.motivo ?? "não deu para registrar o número");
        return;
      }
      // 16/09 · o id GRAVADO, não a prévia: se `lite:ana` já existia, o canal nasceu `lite:ana-2`, e
      // pedir a sessão pela prévia penduraria o QR no número de outra pessoa.
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
            {momento === "quem"
              ? pessoaFixa
                ? "Conectar o seu número"
                : "Conectar um número"
              : conectado
                ? "Número conectado"
                : "Aponte a câmera"}
          </SheetTitle>
          <SheetDescription>
            {momento === "quem"
              ? pessoaFixa
                ? "Registre o seu WhatsApp pessoal e gere o QR. O número continua sendo seu; o sistema passa a ler e responder por ele."
                : "O número é de uma pessoa, e continua sendo dela. O sistema passa a ler e responder por ele."
              : conectado
                ? pessoaFixa
                  ? "Seu número está conectado. Ele nasce desligado: quem liga é admin ou Proprietário, depois de registrar o seu consentimento."
                  : `${pessoa?.nome ?? "O número"} está conectado. Ele nasce DESLIGADO — para ligar, o consentimento dela precisa estar registrado.`
                : pessoaFixa
                  ? "No seu celular: WhatsApp › Aparelhos conectados › Conectar um aparelho."
                  : "No celular dela: WhatsApp › Aparelhos conectados › Conectar um aparelho."}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5">
          {momento === "quem" ? (
            <>
              <FormItemLayout
                label="De quem é o número"
                required
                description={
                  pessoaFixa
                    ? "Seu, e só seu. Número oficial, ligar e desligar ficam com admin e Proprietário."
                    : "Dela saem o nome do canal e o id. É ela quem pareia e quem responde."
                }
              >
                {pessoaFixa ? (
                  pessoa ? (
                    <span className="flex flex-col rounded-lg border border-input px-2.5 py-1.5">
                      <span className="text-ui-13 font-medium text-foreground">{pessoa.nome}</span>
                      <span className="text-ui-11 text-muted-foreground">{pessoa.email}</span>
                    </span>
                  ) : (
                    // Membro que não se acha na lista de ativos: sem dono, a porta recusaria.
                    <p className="text-ui-12 leading-relaxed text-warning-ink">
                      Não achamos o seu cadastro entre os membros ativos. Peça a um admin para
                      conferir o seu acesso em Membros.
                    </p>
                  )
                ) : registro.pessoas.length === 0 ? (
                  // Vazio com direção, não vazio mudo: sem ninguém na lista o caminho é convidar.
                  <p className="text-ui-12 leading-relaxed text-warning-ink">
                    Ninguém com acesso ainda. Convide a pessoa em Membros — o número se pendura nela,
                    e sem dono a porta recusa o registro.
                  </p>
                ) : (
                  <Select
                    value={pessoaId}
                    onValueChange={(v) => setPessoaId(String(v))}
                    items={itensPessoas(registro.pessoas)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="escolha a pessoa" />
                    </SelectTrigger>
                    <SelectContent>
                      {registro.pessoas.map((p) => (
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

              {/* O membro não escolhe: o número dele é de trabalho, e vai como produção. */}
              {mostraFinalidade ? (
                <FormItemLayout
                  label="Para quê"
                  required
                  description="Teste só entrega a quem está na lista de permissão. Produção fala com paciente."
                >
                  <Select value={finalidade} onValueChange={(v) => setFinalidade(v as Finalidade)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teste">Teste</SelectItem>
                      <SelectItem value="producao">Produção</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItemLayout>
              ) : null}

              {/* Obrigatório, e não "dá para declarar depois": a porta recusa o registro sem ele, e
                  depois do registro só a gestão muda o departamento. O membro vê só onde está lotado. */}
              <FormItemLayout
                label="Departamento"
                required
                description={
                  pessoaFixa
                    ? "Onde você responde por ele. Só aparecem os departamentos em que você está lotada."
                    : "Quem responde por ele. O número não nasce sem um."
                }
              >
                {depto.opcoes.length === 0 ? (
                  <p className="text-ui-12 leading-relaxed text-warning-ink">{depto.falta}</p>
                ) : (
                  <Select
                    value={departamento}
                    onValueChange={(v) => setDepartamento(String(v))}
                    items={Object.fromEntries(depto.opcoes.map((d) => [d.chave, d.rotulo]))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="escolha o departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {depto.opcoes.map((d) => (
                        <SelectItem key={d.chave} value={d.chave}>
                          {d.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormItemLayout>

              <FormItemLayout
                label="Número"
                description={
                  pessoaFixa
                    ? "Opcional. Com DDD, se quiser que apareça na lista."
                    : "Opcional — o número é dela e pode não ser conhecido agora."
                }
              >
                <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="+55 11 99999-8888" />
              </FormItemLayout>

              {previsao && (
                <p className="text-ui-12 text-muted-foreground">
                  O id deste canal será <span className="font-mono">{previsao}</span> (ou com um sufixo, se
                  já estiver em uso) — legível, estável, e nunca o número.
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
              {/* O membro não tem a ação da linha na lista (ela é da gestão): fechar antes de parear
                  é deixar o QR para admin ou Proprietário gerar de novo. Dito antes, não depois. */}
              {pessoaFixa && !conectado && (
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
              <Button disabled={!pronto || gravando} onClick={registrarEParear}>
                {gravando
                  ? "Registrando…"
                  : pronto
                    ? "Registrar e gerar o QR"
                    : pessoaFixa
                      ? !pessoa
                        ? "Cadastro não encontrado"
                        : depto.opcoes.length === 0
                          ? "Sem lotação"
                          : "Falta escolher o departamento"
                      : registro.pronto
                        ? "Falta escolher o departamento"
                        : "Falta escolher a pessoa e o para quê"}
              </Button>
            </>
          ) : (
            <Button onClick={fechar}>
              {conectado ? "Pronto" : pessoaFixa ? "Fechar sem parear" : "Fechar e parear depois"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** O `FormCanal` do não oficial. O nome e o dono saem da MESMA pessoa — é o ponto do fluxo. */
function formDe(
  pessoa: PessoaDoNumero,
  finalidade: Finalidade | "",
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
