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
  registrarConsentimento,
  type EstadoSessaoNaTela,
} from "@/app/(app)/configuracoes/canais/lite/actions";
import { AVISO_RISCO_BAN, type FormCanal } from "./regras/canais.ts";
import type { Departamento } from "@/lib/departamentos/escopo";
import { decidirQuadro } from "./regras/qr-pareamento.ts";
import {
  MEIOS_CONSENTIMENTO,
  TERMO_CANAL_PESSOAL,
  TERMO_VERSAO,
  descricaoEstadoSessao,
  intervaloRelituraMs,
  rotuloEstadoSessao,
  type MeioConsentimento,
} from "./regras/lite-sessao.ts";
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

/** O meio, na palavra que a gestão usa — `MEIOS_CONSENTIMENTO` guarda a chave que vai ao ledger. */
const ROTULO_MEIO: Record<MeioConsentimento, string> = {
  assinatura: "Assinou um termo",
  whatsapp: "Disse por WhatsApp",
  presencial: "Concordou pessoalmente",
  video: "Gravou um vídeo",
};

export interface PessoaDoNumero {
  id: string;
  nome: string;
  email: string;
}

/*
 * TRÊS momentos, e o do meio não é burocracia — é a razão de o aviso de ban existir.
 *
 * Eu tinha deixado o consentimento de fora nesta tela, por ter lido a guarda ERRADA:
 * `exigeAceiteDoTermo` devolve `false` no nível `estrito`, e concluí que o aceite não travava nada.
 * Trava outra coisa. Quem barra o pareamento é `podeCriarSessao`, e o texto dela é explícito:
 *
 *   "sem o consentimento da titular registrado, a sessão não abre. O número é dela: um ban tira o
 *    WhatsApp PESSOAL dela, sem volta, e ninguém aqui pode consentir no lugar dela"
 *
 * Medido em 14/09 com o canal recém-criado na tela: `consentimento_em` nulo, sessão devolvida
 * "desconectado", e o quadro mostrando "Nenhum código ativo" sem dizer por quê. Ler uma guarda não
 * prova que ela é a guarda que decide — é a segunda vez no mesmo dia que isso me pega.
 */
type Momento = "quem" | "consentimento" | "parear";

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

  // o consentimento da titular — sem ele `podeCriarSessao` recusa, e está certa em recusar
  const [meio, setMeio] = useState<MeioConsentimento | "">("");
  const [aceite, setAceite] = useState(false);

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
      setCanalId(await previsaoCanalId(form));
      setMomento("consentimento");
      router.refresh();
    });
  }

  /** Registra o aceite e SÓ ENTÃO pede a sessão — a ordem é a da porta, não a minha. */
  function consentirEParear() {
    if (!pessoa || meio === "" || !aceite) return;
    setErro(null);
    iniciar(async () => {
      const r = await registrarConsentimento({
        canalId,
        titularNome: pessoa.nome,
        meio,
        aceitoEm: new Date().toISOString(),
        textoVersao: TERMO_VERSAO,
        aceiteMarcado: aceite,
      });
      if (!r.ok) {
        setErro(r.motivo ?? "não deu para registrar o consentimento");
        return;
      }
      setMomento("parear");
      router.refresh();
      setSessao(await criarSessao(canalId, { f8Pronto }));
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
      setMeio("");
      setAceite(false);
      setErro(null);
    }, 220);
  }

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && fechar()}>
      <SheetContent className="sm:max-w-[460px]">
        <SheetHeader>
          <SheetTitle>
            {momento === "quem"
              ? "Conectar um número"
              : momento === "consentimento"
                ? `${pessoa?.nome?.split(" ")[0] ?? "Ela"} precisa concordar`
                : conectado
                  ? "Número conectado"
                  : "Aponte a câmera"}
          </SheetTitle>
          <SheetDescription>
            {momento === "quem"
              ? "O número é de uma pessoa, e continua sendo dela. O sistema passa a ler e responder por ele."
              : momento === "consentimento"
                ? "O risco é do WhatsApp pessoal dela. Ninguém aqui pode consentir no lugar dela — o que se registra é que ela consentiu."
                : conectado
                  ? `${pessoa?.nome ?? "O número"} está conectado. Ele nasce desligado — ligar é o próximo passo, na lista.`
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
          ) : momento === "consentimento" ? (
            <>
              {/* O termo, inteiro. Não é resumo nem link: o dano que ele nomeia é o WhatsApp pessoal
                  dela, e resumo de dano é como ninguém lê a parte que importa. */}
              <p className="whitespace-pre-line rounded-md bg-warning-bg px-3.5 py-3 text-ui-12 leading-relaxed text-warning-ink">
                {TERMO_CANAL_PESSOAL}
              </p>

              <FormItemLayout label="Como ela consentiu" required description="Fica no registro, com a data de hoje.">
                <Select value={meio} onValueChange={(v) => setMeio(v as MeioConsentimento)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEIOS_CONSENTIMENTO.map((m) => (
                      <SelectItem key={m} value={m}>
                        {ROTULO_MEIO[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItemLayout>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={aceite}
                  onChange={(e) => setAceite(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                />
                <span className="text-[13px] leading-snug text-foreground">
                  {pessoa?.nome ?? "A titular"} leu isto e concordou em ceder o número.
                </span>
              </label>

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
                {gravando ? "Registrando…" : pronto ? "Continuar" : "Falta escolher a pessoa e o para quê"}
              </Button>
            </>
          ) : momento === "consentimento" ? (
            <>
              <Button variant="outline" onClick={fechar}>
                Agora não
              </Button>
              <Button disabled={meio === "" || !aceite || gravando} onClick={consentirEParear}>
                {gravando ? "Registrando…" : meio === "" ? "Falta dizer como ela consentiu" : !aceite ? "Falta marcar que ela concordou" : "Registrar e gerar o QR"}
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
