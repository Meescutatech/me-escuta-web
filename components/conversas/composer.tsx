"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { criarClienteBrowser } from "@/lib/supabase/client";
import {
  ACCEPT_ANEXO,
  caminhoSaida,
  escolherMimeGravacao,
  mimeBase,
  validarAnexo,
  type CategoriaAnexo,
} from "@/lib/conversas/anexo";
import {
  despacharAoCliente,
  efeitoDoComando,
  ehModoInterno,
  menuComandos,
  MOTIVO_VAZIA,
  rotuloModo,
  type ComandoComposer,
  type ModoComposer,
  type ModoInterno,
} from "@/lib/conversas/composer-modo";
import { motivoFaltando, posicoesDe, type TemplateHsmNoChat } from "@/lib/conversas/template-hsm";
import { placeholdersPendentes, type TemplateMensagem, type VariaveisTemplate } from "@/lib/templates";
import {
  aplicarMencao,
  avisoSemAcesso,
  gatilhoMencao,
  mencoesVivas,
  separarMencionaveis,
  type Mencionavel,
  type MencaoResolvida,
} from "@/lib/conversas/mencao";
import { criarAnotacaoLead, criarTarefaLead } from "@/app/(app)/lead/actions";
import type { TipoTarefa } from "@/lib/tarefa-tipos";
import { iniciaisDe } from "@/lib/dados/tarefa-calculos";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VereditoEnvio } from "./regras/numero.ts";
import { BotaoEnvio, ListaProgramadas } from "./botao-envio";
import type { EnvioProgramadoLinha } from "@/lib/conversas/envios-programados";

/*
 * Composer do /conversas.
 *  · Rodada 6 — mídia bidirecional: clipe (foto/áudio) e microfone (MediaRecorder), upload
 *    direto pro Storage em saida/<uuid>.<ext>; a mecânica de envio/retry continua no inbox.
 *  · Rodada 13 / Bloco C — comandos `/`, modo nota (âmbar) e modo tarefa (navy), menção `@`
 *    resolvida para uuid na escrita. Mockup: Design/composer-comandos-v3.html.
 *
 * A TRAVA (C3) mora em `despacharAoCliente` (lib/conversas/composer-modo.ts): existe UM
 * caminho para o cliente e ele não corre em modo interno. O botão trocar de rótulo e a cor
 * tomarem o campo inteiro são o aviso; a trava é o código.
 */

export interface MidiaPronta {
  caminho: string;
  mime: string;
  tipo: CategoriaAnexo;
  legenda: string | null;
}

interface Anexo {
  blob: Blob;
  mime: string;
  ext: string;
  categoria: CategoriaAnexo;
  nome: string;
  previewUrl: string;
}

function fmtSegundos(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * W-D2 (R2/R4 do contrato D91) · um canal pelo qual esta pessoa pode ENVIAR. Já filtrado no
 * servidor (`porta.canais_de_envio(uid)`); o composer só desenha e deixa trocar.
 */
export interface CanalEnvioComposer {
  id: string;
  apelido: string;
  numero: string;
  provedor: "waba" | "nao_oficial";
  /** o número de produção (Kommo) — pré-selecionado (R2). */
  producao: boolean;
  /** `responsavel_id` = a pessoa logada (o número dela). */
  proprio: boolean;
}

export function Composer({
  modoClara,
  pending,
  leadId,
  conversaId,
  nomeLead,
  mencionaveis,
  tiposTarefa,
  templates,
  templatesHsm = [],
  variaveis,
  autorId,
  autorEmail,
  onEnviarTexto,
  onEnviarTemplate,
  onEnviarMidia,
  onDigitar,
  aoPublicar,
  avisar,
  origem,
  programadas,
  onProgramar,
  janelaAteMs,
  onCancelarProgramado,
  canaisEnvio = null,
  canalConversaId = null,
  onPedirAoJarvis = null,
}: {
  modoClara: boolean;
  pending: boolean;
  /**
   * M7 · POR QUAL NÚMERO esta resposta sai, e se ela pode sair (SPEC-M7 §5.2).
   *
   * `null` = a view ainda não expõe as colunas do chip; então nada é dito e nada é bloqueado —
   * "não sei" não vira aviso nem trava. Ver `regras/numero.ts`.
   *
   * Não há SELETOR, e a ausência é deliberada: a resposta sai SEMPRE pelo mesmo número que
   * recebeu. Enquanto isso for a regra, a classe inteira de "respondeu pelo chip errado" não
   * tem como acontecer.
   */
  origem: VereditoEnvio | null;
  /** null = conversa ainda sem lead: nota e tarefa não têm onde nascer. */
  leadId: string | null;
  conversaId: string | null;
  nomeLead: string | null;
  mencionaveis: Mencionavel[];
  tiposTarefa: TipoTarefa[];
  /** Templates ativos do menu / (SPEC-TEMPLATES §6). Vazio = seção não aparece. */
  templates: TemplateMensagem[];
  /**
   * T2 (14/09) · os HSM APROVADOS do canal DESTA conversa. Já filtrados na leitura: template de
   * outro canal é recusado pela porta, e oferecer o que será recusado faz a recusa ser a primeira
   * notícia. Vazio = a seção não aparece, e isso é degrade honesto.
   */
  templatesHsm?: TemplateHsmNoChat[];
  /** Só variáveis CONFIÁVEIS (§5.2) — o Inbox decide o que entra; nome ruim fica de fora. */
  variaveis: VariaveisTemplate;
  autorId: string | null;
  autorEmail: string | null;
  /**
   * templateId acompanha o texto quando o rascunho nasceu de template (§6.4).
   * `canalEscolhidoId` é o número marcado no seletor — `null` quando intocado. Sem ele na
   * assinatura, o TypeScript aceitava a omissão em silêncio e o seletor virava decoração (15/09).
   */
  onEnviarTexto: (texto: string, templateId?: string | null, canalEscolhidoId?: string | null) => void;
  /** T2 · manda o HSM. `parametros` é POSICIONAL — o índice é a posição menos um. */
  onEnviarTemplate?: (templateId: string, parametros: string[]) => void;
  onEnviarMidia: (m: MidiaPronta) => void;
  onDigitar?: () => void;
  aoPublicar: () => void;
  avisar: (msg: string) => void;
  /**
   * R27/F1 · o que já está programado nesta conversa (agendado + falhou), da view
   * `api.v_envios_programados`. O Inbox lê no servidor; aqui só se desenha e se cancela.
   */
  programadas: EnvioProgramadoLinha[];
  /** Grava `envio_programado`. Devolve true quando gravou — só então o campo esvazia. */
  onProgramar: (quandoMs: number, texto: string) => Promise<boolean>;
  /** E4 · fim da janela livre de 24h da conversa (epoch ms); null = a tela não sabe. */
  janelaAteMs?: number | null;
  onCancelarProgramado: (id: string) => void;
  /**
   * W-D2 · "Enviando por {número}". `null` = sem seletor (comportamento M7 de sempre). Com lista, o
   * canal DESTA conversa vem marcado; escolher outro NÃO muda este fio — abre/cria a conversa com o
   * mesmo cliente naquele número (R3: `md5(pnid|tel)`), e a tela diz isso antes do envio.
   */
  canaisEnvio?: CanalEnvioComposer[] | null;
  canalConversaId?: string | null;
  /**
   * W-D3 v6 (Diogo, 00:45) · `@jarvis` DENTRO DE NOTA INTERNA aciona ele nesta conversa: a nota é
   * salva como qualquer outra (fica o registro de quem pediu) e o pedido segue para o Jarvis, que
   * responde no fio como nota dele. `null` = a tela não sabe pedir (fora do ensaio) e a menção
   * vira só texto, como antes — nunca some silenciosamente.
   */
  onPedirAoJarvis?: ((pergunta: string) => void) | null;
}) {
  // W-D2 · canal escolhido para ENVIAR: começa no canal da conversa (R3); null = ainda sem canal.
  const [canalEscolhidoId, setCanalEscolhidoId] = useState<string | null>(null);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const canalDaConversa = canaisEnvio?.find((c) => c.id === canalConversaId) ?? null;
  const canalEscolhido =
    canaisEnvio?.find((c) => c.id === (canalEscolhidoId ?? canalConversaId)) ?? canalDaConversa ?? canaisEnvio?.find((c) => c.producao) ?? canaisEnvio?.[0] ?? null;
  const fioNovo = !!canaisEnvio && !!canalEscolhido && canalEscolhido.id !== canalConversaId;
  const [rascunho, setRascunho] = useState("");
  // W-D3 (Diogo, 22:40) · a dica do rodapé só aparece com o campo em foco
  const [focado, setFocado] = useState(false);
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [subindo, setSubindo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  // ── modo, menu de comandos e menção (R13) ──
  const [modo, setModo] = useState<ModoComposer>("mensagem");
  const [iComando, setIComando] = useState(0);
  const [mencoes, setMencoes] = useState<MencaoResolvida[]>([]);
  const [gatilho, setGatilho] = useState<{ inicio: number; termo: string } | null>(null);
  const [iMencao, setIMencao] = useState(0);
  const [salvando, setSalvando] = useState(false);
  // rascunho nasceu de template? viaja no payload do envio (§6.4); zerar o campo descarta
  const [templateId, setTemplateId] = useState<string | null>(null);

  // campos que só a tarefa revela
  const [responsavelId, setResponsavelId] = useState<string>("");
  const [tipoTarefa, setTipoTarefa] = useState<string>("");
  const [prazo, setPrazo] = useState("");
  const [descricao, setDescricao] = useState("");

  const campoRef = useRef<HTMLTextAreaElement>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const descartarGravacaoRef = useRef(false);
  const cronometroRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const interno = ehModoInterno(modo);
  const podeComandar = !!leadId;

  /*
   * T2 · TEMPLATE HSM ARMADO — escolhido, montado, esperando confirmação.
   *
   * Estado separado do rascunho de propósito: o rascunho é texto que a pessoa escreve e edita; o
   * HSM é um objeto aprovado pela Meta, e o que sai é `template_id` + parâmetros. Enquanto houver
   * um armado, o campo de texto dá lugar à prévia — não dá para "misturar" um template com uma
   * frase digitada, e oferecer isso seria oferecer uma mensagem que a Meta recusa.
   */
  const [hsmArmado, setHsmArmado] = useState<{
    templateId: string;
    nome: string;
    texto: string;
    parametros: string[];
    faltando: number[];
  } | null>(null);

  /**
   * O primeiro nome, e só quando ele é CONFIÁVEL: `variaveis` já chega peneirada pelo Inbox (§5.2
   * — "nome ruim de lead nem entra no objeto"). Herdar essa peneira é o que separa preencher
   * "Oi, Ana!" de preencher "Oi, 5531999…!" numa mensagem para paciente real.
   */
  const primeiroNomeDoLead = (variaveis.nome ?? "").trim().split(/\s+/)[0] || undefined;
  const comandos = useMemo(
    () => (modo === "mensagem" && podeComandar && !anexo ? menuComandos(rascunho, templates, templatesHsm) : []),
    [modo, podeComandar, anexo, rascunho, templates],
  );
  // §5.3: placeholder que sobrou trava o envio (a trava mora em despacharAoCliente; isto é o aviso)
  const pendentes = useMemo(
    () => (modo === "mensagem" && rascunho.includes("{{") ? placeholdersPendentes(rascunho) : []),
    [modo, rascunho],
  );
  const listaMencao = useMemo(
    () => (interno && gatilho ? separarMencionaveis(mencionaveis, gatilho.termo) : null),
    [interno, gatilho, mencionaveis],
  );
  const alvosMencao = useMemo(
    () => (listaMencao ? [...listaMencao.humanos, ...listaMencao.agentes] : []),
    [listaMencao],
  );

  useEffect(() => setIComando(0), [rascunho]);
  useEffect(() => setIMencao(0), [gatilho?.termo]);

  // troca de conversa: o rascunho interno não pode vazar de um lead pro outro
  useEffect(() => {
    sairDoModo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaId]);

  useEffect(() => {
    const url = anexo?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [anexo?.previewUrl]);

  useEffect(() => {
    return () => {
      const g = gravadorRef.current;
      if (g && g.state !== "inactive") {
        descartarGravacaoRef.current = true;
        g.stop();
      }
      if (cronometroRef.current) clearInterval(cronometroRef.current);
    };
  }, []);

  // ─────────────── modo ───────────────

  function entrarNoModo(alvo: ModoInterno) {
    setModo(alvo);
    setRascunho("");
    setTemplateId(null);
    setMencoes([]);
    setGatilho(null);
    setResponsavelId(autorId ?? "");
    setTipoTarefa("");
    setPrazo("");
    setDescricao("");
    requestAnimationFrame(() => campoRef.current?.focus());
  }

  function sairDoModo(silencioso = false) {
    setModo("mensagem");
    setRascunho("");
    setTemplateId(null);
    setMencoes([]);
    setGatilho(null);
    setDescricao("");
    if (!silencioso) requestAnimationFrame(() => campoRef.current?.focus());
  }

  /**
   * T1 (exigência (a) do GO): o que um comando faz é decidido por `efeitoDoComando` — união
   * exaustiva com never-check. NENHUM efeito envia nada: modo entra em modo interno, template
   * só escreve no rascunho. O envio continua tendo um único portão (`enviarAoCliente`).
   */
  function executarComando(c: ComandoComposer) {
    const efeito = efeitoDoComando(c, variaveis, { primeiroNome: primeiroNomeDoLead });
    switch (efeito.tipo) {
      case "entrar_modo":
        entrarNoModo(efeito.modo);
        return;
      case "inserir_rascunho": {
        setRascunho(efeito.texto);
        setTemplateId(efeito.templateId);
        requestAnimationFrame(() => {
          const el = campoRef.current;
          if (!el) return;
          el.focus();
          // seleciona o primeiro placeholder pendente — digitar já o substitui (§5.3)
          const m = /\{\{[^{}]*\}\}/.exec(efeito.texto);
          if (m) el.setSelectionRange(m.index, m.index + m[0].length);
          else el.setSelectionRange(efeito.texto.length, efeito.texto.length);
        });
        return;
      }
      case "armar_template_hsm": {
        /*
         * ARMAR, e nada mais. T1 continua inteiro: nenhum comando do menu envia.
         *
         * O texto vai para a PRÉVIA e não para o rascunho editável, e a diferença não é estética:
         * o corpo que sai é montado pelo sender a partir da definição que a Meta aprovou. Deixar a
         * pessoa editar aqui mudaria o que ela lê e não o que a paciente recebe — a pior mentira
         * possível numa tela de envio.
         */
        setHsmArmado({
          templateId: efeito.templateId,
          nome: efeito.nome,
          texto: efeito.texto,
          parametros: efeito.parametros,
          faltando: efeito.faltando,
        });
        setRascunho("");
        return;
      }
      default: {
        const nunca: never = efeito;
        return nunca;
      }
    }
  }

  // ─────────────── anexo / gravação (rodada 6, intocado) ───────────────

  function definirAnexo(blob: Blob, nome: string) {
    const v = validarAnexo(blob);
    if (!v.ok) {
      avisar(v.motivo);
      return;
    }
    setAnexo({
      blob,
      mime: v.mime,
      ext: v.ext,
      categoria: v.categoria,
      nome,
      previewUrl: URL.createObjectURL(blob),
    });
  }

  function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) definirAnexo(f, f.name);
  }

  async function iniciarGravacao() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      avisar("este navegador não suporta gravação de áudio");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      avisar("sem acesso ao microfone — libere a permissão no navegador");
      return;
    }
    const mime = escolherMimeGravacao((m) => MediaRecorder.isTypeSupported(m));
    const gravador = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    pedacosRef.current = [];
    descartarGravacaoRef.current = false;
    gravador.ondataavailable = (ev) => {
      if (ev.data.size > 0) pedacosRef.current.push(ev.data);
    };
    gravador.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (cronometroRef.current) clearInterval(cronometroRef.current);
      setGravando(false);
      setSegundos(0);
      if (descartarGravacaoRef.current) return;
      const tipo = mimeBase(gravador.mimeType || mime || "audio/webm");
      const blob = new Blob(pedacosRef.current, { type: tipo });
      definirAnexo(blob, "Gravação de voz");
    };
    gravadorRef.current = gravador;
    gravador.start();
    setGravando(true);
    setSegundos(0);
    cronometroRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
  }

  function pararGravacao(descartar: boolean) {
    descartarGravacaoRef.current = descartar;
    const g = gravadorRef.current;
    if (g && g.state !== "inactive") g.stop();
  }

  // ─────────────── envio ao cliente (o único caminho) ───────────────

  async function enviarAoCliente() {
    if (pending || subindo) return;
    if (!anexo) {
      // C3: a trava decide. Em modo interno (ou com {{placeholder}} pendente) `enviar` nem é chamado.
      const r = despacharAoCliente(modo, rascunho, (texto) => {
        const deTemplate = templateId;
        setRascunho("");
        setTemplateId(null);
        // `canalEscolhido` já existia aqui desde o M7 — só nunca saía do desenho (aviso âmbar e cor
        // do rótulo). Agora ele acompanha o texto, e quem decide o que fazer com isso é a regra pura.
        onEnviarTexto(texto, deTemplate, canalEscolhido?.id ?? null);
      });
      if (!r.enviado && r.motivo && r.motivo !== MOTIVO_VAZIA) avisar(r.motivo);
      return;
    }
    const r = despacharAoCliente(modo, rascunho || "anexo", () => undefined);
    if (!r.enviado) {
      if (r.motivo && r.motivo !== MOTIVO_VAZIA) avisar(r.motivo);
      return;
    }
    setSubindo(true);
    try {
      const caminho = caminhoSaida(crypto.randomUUID(), anexo.ext);
      const { error } = await criarClienteBrowser()
        .storage.from("midia-whatsapp")
        .upload(caminho, anexo.blob, { contentType: anexo.mime, upsert: false });
      if (error) {
        console.error("upload do anexo falhou:", error.message);
        avisar("não deu pra subir o anexo — tente de novo");
        return;
      }
      const legenda = anexo.categoria === "imagem" ? rascunho.trim() || null : null;
      onEnviarMidia({ caminho, mime: anexo.mime, tipo: anexo.categoria, legenda });
      setAnexo(null);
      setRascunho("");
    } finally {
      setSubindo(false);
    }
  }

  // ─────────────── publicar nota / tarefa ───────────────

  async function publicar() {
    if (!leadId || salvando) return;
    const texto = rascunho.trim();
    if (!texto) return;
    const vivas = mencoesVivas(rascunho, mencoes);

    /*
     * W-D3 v6 · O PEDIDO AO JARVIS SAI ANTES DA GRAVAÇÃO, e isto é deliberado: são dois efeitos
     * independentes — a nota é o registro de quem pediu, a resposta dele é trabalho. Se a
     * gravação falhar (e ela falha com banco fora do ar), quem pediu continua recebendo a
     * resposta e vê o aviso do que não gravou. Amarrar os dois faria uma falha de escrita comer
     * silenciosamente a pergunta que a pessoa acabou de fazer.
     */
    const pedido = modo === "nota" && onPedirAoJarvis ? perguntaAoJarvis(texto) : null;
    if (pedido !== null) {
      onPedirAoJarvis?.(pedido);
      sairDoModo();
    }

    setSalvando(true);
    try {
      const r =
        modo === "nota"
          ? await criarAnotacaoLead(leadId, {
              texto,
              tipo: "interna",
              autorId,
              autorEmail,
              mencoes: vivas,
            })
          : await criarTarefaLead(leadId, {
              titulo: texto,
              descricao,
              tipo: tipoTarefa || null,
              responsavelId: responsavelId || null,
              responsavel: responsavelId ? null : autorEmail,
              prazoIso: prazo ? new Date(prazo).toISOString() : null,
              conversaId,
              mencoes: vivas,
            });

      if (!r.ok) {
        avisar(pedido !== null ? `Perguntei ao Jarvis, mas a nota não gravou: ${r.motivo ?? "erro"}` : `Não deu pra salvar: ${r.motivo ?? "erro"}`);
        return;
      }
      // C8: a escrita nunca é bloqueada por permissão — o aviso é efêmero e só pro autor
      const aviso = avisoSemAcesso(vivas);
      avisar(aviso ?? (pedido !== null ? "Pedido ao Jarvis — a resposta entra no fio." : modo === "nota" ? "Nota salva — só a equipe vê." : "Tarefa criada."));
      if (pedido === null) sairDoModo();
      aoPublicar();
    } finally {
      setSalvando(false);
    }
  }

  // ─────────────── teclado ───────────────

  function aoMudarTexto(valor: string, caret: number) {
    setRascunho(valor);
    if (!valor.trim()) setTemplateId(null); // zerar o campo descarta o vínculo com o template (§6.4)
    if (interno) setGatilho(gatilhoMencao(valor, caret));
    else if (valor.trim()) onDigitar?.();
  }

  function escolherMencao(alvo: Mencionavel) {
    if (!gatilho) return;
    const caret = campoRef.current?.selectionStart ?? rascunho.length;
    const r = aplicarMencao(rascunho, caret, gatilho, alvo);
    setRascunho(r.texto);
    setMencoes((m) => [...m, r.mencao]);
    setGatilho(null);
    requestAnimationFrame(() => {
      campoRef.current?.focus();
      campoRef.current?.setSelectionRange(r.caret, r.caret);
    });
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 1) autocomplete de menção tem prioridade sobre tudo
    if (gatilho && alvosMencao.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIMencao((i) => {
          const n = alvosMencao.length;
          return (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
        });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        escolherMencao(alvosMencao[iMencao] ?? alvosMencao[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setGatilho(null);
        return;
      }
    }

    // 2) menu de comandos
    if (comandos.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIComando((i) => {
          const n = comandos.length;
          return (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
        });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        executarComando(comandos[iComando] ?? comandos[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setRascunho("");
        return;
      }
    }

    // 3) Esc sai do modo interno — a saída explícita da spec §6.2
    if (e.key === "Escape" && interno) {
      e.preventDefault();
      sairDoModo();
      return;
    }

    // 4) Enter: publica em modo interno, envia em modo mensagem
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (interno) void publicar();
      else void enviarAoCliente();
    }
  }

  // ─────────────── render ───────────────

  const ehImagemAnexo = anexo?.categoria === "imagem";
  const placeholder = anexo
    ? ehImagemAnexo
      ? "Legenda da foto (opcional)…"
      : "Áudio não leva legenda no WhatsApp"
    : modo === "nota"
      ? "O que a equipe precisa saber sobre este lead…"
      : modo === "tarefa"
        ? "O que precisa ser feito…"
        : modoClara
          ? "Escreva para assumir a conversa…"
          : "Escreva como Sara…";

  const pele =
    modo === "nota"
      ? "border-nota-linha bg-nota-fundo"
      : modo === "tarefa"
        ? "border-tarefa-linha bg-tarefa-fundo"
        : "border-linha-forte bg-branco focus-within:border-foco-comp";

  return (
    <div className="flex-shrink-0 bg-board px-4 pb-4 pt-3">
      {anexo && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-linha bg-branco px-3 py-2">
          {ehImagemAnexo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={anexo.previewUrl}
              alt="Prévia da foto anexada"
              className="h-14 w-14 shrink-0 rounded-lg border border-linha object-cover"
            />
          ) : (
            <audio controls preload="metadata" src={anexo.previewUrl} className="h-9 w-64 max-w-full" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.8rem] font-medium text-navy">{anexo.nome}</div>
            <div className="text-[0.72rem] text-mute">
              {ehImagemAnexo ? "Foto" : "Áudio"} · {(anexo.blob.size / (1024 * 1024)).toFixed(1)}MB
            </div>
          </div>
          <button
            onClick={() => setAnexo(null)}
            disabled={subindo}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[0.78rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta disabled:opacity-50"
          >
            Descartar
          </button>
        </div>
      )}

      {gravando && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-vermelho-bd bg-vermelho-bg px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-vermelho" />
          <span className="text-[0.84rem] font-medium tabular-nums text-navy">
            Gravando… {fmtSegundos(segundos)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => pararGravacao(true)}
              className="rounded-lg px-3 py-1.5 text-[0.78rem] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
            >
              Descartar
            </button>
            <button
              onClick={() => pararGravacao(false)}
              className="rounded-lg bg-navy px-3.5 py-1.5 text-[0.78rem] font-semibold text-branco transition-colors hover:bg-navy-esc"
            >
              Parar
            </button>
          </div>
        </div>
      )}

      {/* ── A PRÉVIA DO TEMPLATE ARMADO ──────────────────────────────────────────────────────
          Ela toma o lugar do campo de texto, e não senta ao lado dele: template e frase digitada
          não se misturam numa mensagem só, e oferecer o contrário seria oferecer algo que a Meta
          recusa. O texto é LEITURA — o que sai é montado pelo sender a partir da definição
          aprovada, então deixar editar aqui mudaria a prévia e não a mensagem. */}
      {hsmArmado && (
        <div className="mb-2 rounded-lg border border-linha bg-board p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[12px] text-suave">{hsmArmado.nome}</span>
            <button
              type="button"
              onClick={() => setHsmArmado(null)}
              className="shrink-0 text-[12px] text-mute underline-offset-2 hover:text-tinta hover:underline"
            >
              Cancelar
            </button>
          </div>

          <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-tinta">{hsmArmado.texto}</p>

          {hsmArmado.faltando.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {hsmArmado.faltando.map((n) => (
                <label key={n} className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-[11.5px] text-mute">{`{{${n}}}`}</span>
                  <input
                    value={hsmArmado.parametros[n - 1] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setHsmArmado((a) => {
                        if (!a) return a;
                        const parametros = [...a.parametros];
                        parametros[n - 1] = v;
                        return {
                          ...a,
                          parametros,
                          // o que ainda falta se recalcula do array, e não de um contador à parte:
                          // dois lugares contando lacuna é como a tela libera o que a porta recusa
                          faltando: parametros
                            .map((x, i) => ((x ?? "").trim() === "" ? i + 1 : 0))
                            .filter((x) => x > 0),
                        };
                      });
                    }}
                    autoComplete="off"
                    aria-label={`valor da variável ${n}`}
                    className="h-8 w-full rounded-md border border-linha bg-branco px-2.5 text-[13px] text-tinta focus:border-laranja focus:outline-none"
                  />
                </label>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[11.5px] leading-snug text-mute">
              {hsmArmado.faltando.length > 0
                ? motivoFaltando(hsmArmado.faltando)
                : "Sai como está escrito. Abre uma janela de 24 horas para conversar."}
            </span>
            <button
              type="button"
              disabled={hsmArmado.faltando.length > 0}
              onClick={() => {
                if (hsmArmado.faltando.length > 0) return;
                onEnviarTemplate?.(hsmArmado.templateId, hsmArmado.parametros);
                setHsmArmado(null);
              }}
              className="h-8 shrink-0 rounded-md bg-laranja px-3 text-[12.5px] font-semibold text-branco hover:bg-laranja-esc disabled:opacity-45"
            >
              Mandar template
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        {/* menu de comandos — abre pra cima, ancorado no campo (mockup, estado b) */}
        {comandos.length > 0 && (
          <div
            role="listbox"
            aria-label="Comandos"
            className="absolute bottom-full left-0 z-30 mb-2 w-[340px] max-w-full rounded-lg border border-linha bg-branco p-[5px] shadow-forte"
          >
            {comandos.map((c, i) => {
              const primeiroTemplate = c.acao === "template" && (i === 0 || comandos[i - 1].acao !== "template");
              const primeiroHsm = c.acao === "template_hsm" && (i === 0 || comandos[i - 1].acao !== "template_hsm");
              const temAsDuasSecoes = comandos.some((x) => x.acao === "template") && comandos.some((x) => x.acao === "modo");
              const qtdVar = c.acao === "template_hsm" ? posicoesDe(c.template.corpo).length : 0;
              return (
                <div key={c.acao === "modo" ? c.comando : c.template.id} className="contents">
                  {i === 0 && c.acao === "modo" && temAsDuasSecoes && <Cabecalho>Comandos</Cabecalho>}
                  {primeiroTemplate && temAsDuasSecoes && <Cabecalho>Templates</Cabecalho>}
                  {/* Cabeçalho PRÓPRIO, e o nome diz o que muda: estes custam dinheiro, abrem uma
                      janela de 24h e são os únicos que funcionam com a janela fechada. */}
                  {primeiroHsm && <Cabecalho>Templates aprovados (WhatsApp)</Cabecalho>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === iComando}
                    onMouseEnter={() => setIComando(i)}
                    onClick={() => executarComando(c)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left",
                      i === iComando && "bg-hover",
                    )}
                  >
                    <span className="min-w-[64px] shrink-0 font-mono text-[12.5px] font-medium text-tinta">{c.comando}</span>
                    <span className="truncate text-[12.5px] text-suave">{c.explicacao}</span>
                    {/* "2 variáveis" antes de escolher: é a diferença entre um clique e um
                        formulário, e saber disso antes evita abrir o que não dá tempo de preencher. */}
                    {qtdVar > 0 && (
                      <span className="ml-auto shrink-0 text-[10.5px] text-mute">
                        {qtdVar} {qtdVar === 1 ? "variável" : "variáveis"}
                      </span>
                    )}
                    {i === iComando && qtdVar === 0 && <span className="ml-auto font-mono text-[10.5px] text-mute">↵</span>}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* autocomplete de menção — pessoas e agentes em listas separadas (mockup, estado e) */}
        {listaMencao && alvosMencao.length > 0 && (
          <div
            role="listbox"
            aria-label="Mencionar"
            className="absolute bottom-full left-0 z-30 mb-2 w-[340px] max-w-full rounded-lg border border-linha bg-branco p-[5px] shadow-forte"
          >
            {listaMencao.humanos.length > 0 && <Cabecalho>Pessoas</Cabecalho>}
            {listaMencao.humanos.map((m, i) => (
              <LinhaMencao
                key={m.id}
                alvo={m}
                selecionada={i === iMencao}
                aoEntrar={() => setIMencao(i)}
                aoEscolher={() => escolherMencao(m)}
              />
            ))}
            {listaMencao.agentes.length > 0 && <Cabecalho>Agentes</Cabecalho>}
            {listaMencao.agentes.map((m, i) => {
              const idx = listaMencao.humanos.length + i;
              return (
                <LinhaMencao
                  key={m.id}
                  alvo={m}
                  selecionada={idx === iMencao}
                  aoEntrar={() => setIMencao(idx)}
                  aoEscolher={() => escolherMencao(m)}
                />
              );
            })}
            {listaMencao.agentes.length > 0 && (
              <p className="mt-1 border-t border-linha px-2.5 pb-[5px] pt-[7px] text-[11.5px] leading-snug text-mute">
                Agentes ainda não respondem a menções — a menção fica registrada e um humano continua decidindo.
              </p>
            )}
          </div>
        )}

        <div className={cn("rounded-xl border", pele)}>
          {/* faixa de modo — só existe quando o campo está em nota ou tarefa */}
          {interno && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-t-[11px] border-b py-[7px] pl-3.5 pr-3 text-[12px]",
                modo === "nota"
                  ? "border-nota-linha bg-nota-faixa text-amarelo"
                  : "border-tarefa-linha bg-tarefa-faixa text-tarefa-tinta",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "h-[7px] w-[7px] shrink-0 rounded-full",
                  modo === "nota" ? "bg-amarelo/70" : "bg-tarefa-tinta/70",
                )}
              />
              <span className="font-[650] uppercase tracking-[0.07em] text-[10.5px]">{rotuloModo(modo)}</span>
              <span className={cn("truncate", modo === "nota" ? "text-suave" : "text-tarefa-suave")}>
                {modo === "nota"
                  ? "o cliente não vê nada disto"
                  : `fica no lead${nomeLead ? ` de ${nomeLead}` : ""} · o cliente não vê`}
              </span>
              <button
                type="button"
                onClick={() => sairDoModo()}
                className="ml-auto flex shrink-0 items-center gap-1.5 rounded-[5px] px-1.5 py-[3px] text-[11.5px] text-suave transition-colors hover:bg-branco/70 hover:text-tinta"
              >
                Sair do modo
                <kbd className="rounded border border-linha bg-branco px-1 py-px font-mono text-[10.5px]">Esc</kbd>
              </button>
            </div>
          )}

          {/* ═════ M7 · O AVISO ANTES DO CLIQUE (SPEC-M7 §5.2, CA-13) ═════
              Ele é VISÍVEL, não tooltip: um aviso que só aparece ao passar o mouse não existe
              para quem está digitando. E a distinção entre AVISAR e BLOQUEAR é o ponto do
              critério, que tem de reprovar nos DOIS sentidos:
               · teste  -> avisa e DEIXA enviar. Ensaio por número de teste é legítimo — foi assim
                 que as 12 mensagens de 27/07 chegaram ao telefone do Diogo. Bloquear quebraria o
                 ensaio. O que não é legítimo é descobrir DEPOIS.
               · não cadastrado / desligado -> DESABILITA, com o motivo nomeado. */}
          {!interno && origem && (origem.motivo || origem.aviso || (origem.respondePor && !canaisEnvio)) ? (
            <div
              className={cn(
                "flex items-start gap-2 border-b px-3.5 py-[7px] text-[12px]",
                origem.motivo
                  ? "border-vermelho-bd bg-vermelho-bg text-vermelho"
                  : origem.aviso
                    ? "border-nota-linha bg-nota-faixa text-amarelo"
                    : "border-linha bg-board text-mute",
              )}
            >
              {origem.motivo ? (
                <span className="font-[650]">Não dá para responder:</span>
              ) : origem.aviso ? (
                <span className="font-[650]">Atenção:</span>
              ) : null}
              <span className="min-w-0 flex-1">
                {origem.motivo ??
                  origem.aviso ??
                  (origem.respondePor ? `responde por: ${origem.respondePor}` : "")}
              </span>
              {/* o número que responde fica visível MESMO quando há aviso — é a informação que
                  o §5.2 exige do composer, e ela não some por causa do alarme. */}
              {(origem.motivo || origem.aviso) && origem.respondePor ? (
                <span className="shrink-0 opacity-80">· responde por: {origem.respondePor}</span>
              ) : null}
            </div>
          ) : null}
          {/* envios programados — acima do campo, onde o Gmail põe a tarja; sempre com "cancelar" */}
          {!interno && programadas.length > 0 && (
            <ListaProgramadas
              linhas={programadas}
              onCancelar={onCancelarProgramado}
              onRetomarTexto={(corpo) => {
                setRascunho(corpo);
                setTemplateId(null);
                campoRef.current?.focus();
              }}
            />
          )}

          <div className="flex items-end gap-1.5 py-2 pl-2 pr-2">
            {!interno && (
              <>
                <input
                  ref={inputArquivoRef}
                  type="file"
                  accept={ACCEPT_ANEXO}
                  onChange={aoEscolherArquivo}
                  className="hidden"
                  aria-label="Anexar foto ou áudio"
                />
                <button
                  onClick={() => inputArquivoRef.current?.click()}
                  disabled={subindo || gravando}
                  title="Anexar foto ou áudio"
                  aria-label="Anexar foto ou áudio"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-mute transition-colors hover:bg-hover hover:text-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] stroke-current" fill="none">
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <button
                  onClick={iniciarGravacao}
                  disabled={subindo || gravando || !!anexo}
                  title="Gravar áudio"
                  aria-label="Gravar áudio"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-mute transition-colors hover:bg-hover hover:text-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] stroke-current" fill="none">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
                  </svg>
                </button>
              </>
            )}
            <textarea
              ref={campoRef}
              rows={1}
              value={rascunho}
              onChange={(e) => aoMudarTexto(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onClick={(e) => {
                if (interno) setGatilho(gatilhoMencao(rascunho, e.currentTarget.selectionStart ?? 0));
              }}
              onKeyDown={aoTeclar}
              onFocus={() => setFocado(true)}
              onBlur={() => setFocado(false)}
              disabled={!!anexo && !ehImagemAnexo}
              placeholder={placeholder}
              aria-label={interno ? rotuloModo(modo) : "Mensagem para o cliente"}
              className="max-h-28 flex-1 resize-none bg-transparent py-1 pl-1.5 text-[0.9rem] leading-relaxed text-tinta outline-none placeholder:text-mute disabled:opacity-60"
            />
            {!interno && (
              <BotaoEnvio
                onEnviar={() => void enviarAoCliente()}
                // grava de verdade (R27/F1): o campo só esvazia depois que a porta aceitou
                onProgramar={async (quando) => {
                  const texto = rascunho;
                  const ok = await onProgramar(quando, texto);
                  if (ok) {
                    setRascunho("");
                    setTemplateId(null);
                  }
                }}
                enviando={subindo}
                janelaAteMs={janelaAteMs}
                desabilitado={
                  pending || subindo || gravando || (!anexo && !rascunho.trim()) ||
                  // M7 · o sender já devolveria `falha_permanente` (sender.ts:313-322) e a
                  // mensagem não volta sozinha. Falha permanente DEPOIS do clique é pior que
                  // botão desabilitado ANTES dele.
                  (!interno && origem !== null && !origem.pode)
                }
                motivoDesabilitado={
                  origem && !origem.pode ? origem.motivo ?? "envio indisponível" : undefined
                }
              />
            )}
          </div>

          {/* campos que a tarefa exige: responsável, prazo, tipo (mockup, estado d) */}
          {modo === "tarefa" && (
            <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-1 pt-1.5">
              <Campo rotulo="Responsável">
                <Select
                  value={responsavelId}
                  onValueChange={(v) => setResponsavelId(String(v ?? ""))}
                  // `items` é o que faz o gatilho mostrar o NOME, não o uuid (Base UI `Select.Value`)
                  items={Object.fromEntries(mencionaveis.filter((m) => m.tipo === "humano" && m.ativo).map((m) => [m.id, m.nome]))}
                >
                  <SelectTrigger aria-label="Responsável pela tarefa" className="h-6 border-0 bg-transparent px-1 text-[12.5px] font-medium text-tinta shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mencionaveis
                      .filter((m) => m.tipo === "humano" && m.ativo)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo rotulo="Prazo">
                <input
                  type="datetime-local"
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                  aria-label="Prazo da tarefa (data e hora)"
                  className="cursor-pointer bg-transparent font-mono text-[12px] tabular-nums text-tinta outline-none"
                />
              </Campo>
              <Campo rotulo="Tipo">
                <Select value={tipoTarefa || null} onValueChange={(v) => setTipoTarefa(String(v ?? ""))} items={Object.fromEntries(tiposTarefa.map((t) => [t.chave, t.rotulo]))}>
                  <SelectTrigger
                    aria-label="Tipo da tarefa"
                    className={cn("h-6 border-0 bg-transparent px-1 text-[12.5px] shadow-none", tipoTarefa ? "font-medium text-tinta" : "text-mute")}
                  >
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposTarefa.map((t) => (
                      <SelectItem key={t.chave} value={t.chave}>
                        {t.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            </div>
          )}

          {/* a descrição é OPCIONAL e estava com a maior largura da caixa — peso invertido. Desce
              para linha própria, sem caixa: quem não precisa dela nem repara; quem precisa, escreve. */}
          {modo === "tarefa" && (
            <div className="px-3.5 pb-1">
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descrição, se precisar"
                aria-label="Descrição da tarefa"
                className="w-full border-b border-transparent bg-transparent py-1 text-[12.5px] text-tinta outline-none transition-colors placeholder:text-tarefa-suave/70 hover:border-tarefa-linha focus:border-laranja"
              />
            </div>
          )}

          {/* W-D2 · fio novo: trocar o número NÃO responde por aqui — abre outra conversa (R3).
              15/09: UMA faixa, não duas. Empilhar o aviso do número da conversa com o do fio novo
              não era só feio — o aviso de cima fala do canal ERRADO: ele descreve o número por onde
              a conversa entrou, enquanto a mensagem vai sair pelo número escolhido. Com fio novo,
              quem manda é o escolhido, e é dele que a faixa fala. */}
          {!interno && fioNovo && canalEscolhido && (
            <div className="flex items-center gap-2 border-t border-nota-linha bg-nota-faixa px-3.5 py-[7px] text-[12px] text-amarelo">
              <span className="min-w-0 flex-1 truncate">
                Abre um fio novo com {nomeLead ?? "este cliente"} por{" "}
                <span className="font-[650]">{nomeCurtoCanal(canalEscolhido)}</span> — esta conversa continua como está.
              </span>
              <button
                type="button"
                onClick={() => setCanalEscolhidoId(null)}
                className="shrink-0 rounded px-1.5 py-px font-medium underline-offset-2 hover:underline"
              >
                voltar
              </button>
            </div>
          )}

          {/* barra de rodapé (Diogo, 22:40): UMA linha, 12px muted — "Enviando por X ▾" como texto,
              e a dica só com o campo em foco. Nada de chip, caixa ou bolinha. */}
          <div className="flex min-h-[28px] items-center gap-3 py-1 pl-3.5 pr-2.5 text-[12px] text-mute">
            {!interno && canaisEnvio && canalEscolhido && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setSeletorAberto((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={seletorAberto}
                  title={`Por qual número esta mensagem sai · ${canalEscolhido.numero}`}
                  className={cn(
                    "inline-flex max-w-[280px] items-center gap-1 rounded transition-colors hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40",
                    fioNovo ? "text-amarelo" : "text-mute",
                  )}
                >
                  <span>Enviando por</span>
                  <span className={cn("truncate font-medium", fioNovo ? "text-amarelo" : "text-suave")}>{nomeCurtoCanal(canalEscolhido)}</span>
                  <svg viewBox="0 0 24 24" className="size-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {seletorAberto && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setSeletorAberto(false)} aria-hidden />
                    <ul
                      role="listbox"
                      aria-label="Número de envio"
                      className="absolute bottom-full left-0 z-30 mb-1.5 w-[300px] overflow-hidden rounded-lg border border-linha-forte bg-branco py-1 shadow-forte animate-rise"
                    >
                      <li className="px-3 pb-1 pt-1.5 text-[11px] text-mute">Número desta conversa</li>
                      {canaisEnvio
                        .filter((c) => c.id === canalConversaId)
                        .map((c) => (
                          <OpcaoCanal key={c.id} c={c} marcado={canalEscolhido.id === c.id} onEscolher={() => { setCanalEscolhidoId(null); setSeletorAberto(false); }} />
                        ))}
                      {canaisEnvio.some((c) => c.id !== canalConversaId) && (
                        <li className="mt-1 border-t border-linha px-3 pb-1 pt-2 text-[11px] text-mute">
                          Falar com {nomeLead ? nomeLead.split(" ")[0] : "o cliente"} por outro número
                        </li>
                      )}
                      {canaisEnvio
                        .filter((c) => c.id !== canalConversaId)
                        .map((c) => (
                          <OpcaoCanal key={c.id} c={c} marcado={canalEscolhido.id === c.id} onEscolher={() => { setCanalEscolhidoId(c.id); setSeletorAberto(false); }} novo />
                        ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            <span className="min-w-0 truncate">
              {interno ? (
                <>
                  Digite <Tecla>@</Tecla> para {modo === "nota" ? "avisar alguém" : "atribuir a outra pessoa"}
                  {modo === "nota" && onPedirAoJarvis ? (
                    <>
                      {" · "}
                      <Tecla>@jarvis</Tecla> pergunta a ele
                    </>
                  ) : null}
                </>
              ) : comandos.length > 0 ? (
                <>
                  <Tecla>↑</Tecla> <Tecla>↓</Tecla> navega · <Tecla>Esc</Tecla> cancela
                </>
              ) : pendentes.length > 0 ? (
                <span className="text-amarelo">
                  Complete {pendentes.join(", ")} antes de enviar — variável sem valor.
                </span>
              ) : !focado ? null : podeComandar ? (
                <>
                  Digite <Tecla>/</Tecla> para nota{templates.length > 0 ? ", tarefa e templates" : " e tarefa"}
                </>
              ) : (
                "Conversa sem lead vinculado — nota e tarefa precisam de um lead."
              )}
            </span>
            {interno && (
              <span className="ml-auto flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => sairDoModo()}
                  className="rounded-md px-3 py-1.5 text-[13px] font-medium text-suave transition-colors hover:bg-hover hover:text-tinta"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void publicar()}
                  disabled={salvando || !rascunho.trim()}
                  className="rounded-md bg-laranja px-3.5 py-1.5 text-[13px] font-semibold text-branco transition-colors hover:bg-laranja-esc disabled:opacity-50"
                >
                  {modo === "nota" ? "Salvar nota" : "Criar tarefa"}
                </button>
              </span>
            )}
          </div>
        </div>
      </div>

      {!interno && (
        <p className="mt-2 text-center text-[0.72rem] text-mute">
          {subindo ? (
            <>Enviando anexo…</>
          ) : modoClara ? (
            <>
              A Clara está conduzindo — <b className="font-medium text-suave">ao enviar, você assume a conversa</b>. Ou aprove a sugestão acima.
            </>
          ) : (
            <>
              Você assumiu — escrevendo como <b className="font-medium text-suave">Sara</b>. A Clara volta quando você devolver.
            </>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * W-D3 v6 · a nota menciona o Jarvis? Devolve a PERGUNTA (o texto sem a menção) ou `null`.
 * Aceita `@jarvis` e `/jarvis` em qualquer posição — quem escreve "vou perguntar ao @jarvis o que
 * fazer" está pedindo, e exigir que a menção venha no começo seria regra de máquina, não de gente.
 */
export function perguntaAoJarvis(texto: string): string | null {
  const re = /(^|\s)[@/]jarvis\b/i;
  if (!re.test(texto)) return null;
  return texto.replace(new RegExp(re.source, "gi"), "$1").replace(/\s{2,}/g, " ").trim();
}

/** "Oficial" para o WABA de produção; o primeiro segmento do apelido para os outros (Diogo, 23:10). */
function nomeCurtoCanal(c: CanalEnvioComposer): string {
  return c.producao ? "Oficial" : c.apelido.split(" · ")[0].trim() || c.apelido;
}

function OpcaoCanal({ c, marcado, onEscolher, novo = false }: { c: CanalEnvioComposer; marcado: boolean; onEscolher: () => void; novo?: boolean }) {
  return (
    <li
      role="option"
      aria-selected={marcado}
      onClick={onEscolher}
      className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[12.5px] hover:bg-hover", marcado && "bg-board")}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate font-medium text-tinta">{nomeCurtoCanal(c)}</span>
          {c.producao && <span className="text-[11px] text-mute">produção</span>}
          {c.proprio && <span className="text-[11px] text-mute">seu</span>}
        </span>
        <span className="block truncate font-mono text-[11px] tabular-nums text-mute">
          {c.numero}
          {novo ? " · abre conversa nova" : ""}
        </span>
      </span>
      {marcado && (
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-navy" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </li>
  );
}

function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-linha bg-board px-1.5 py-px font-mono text-[11px] text-suave">
      {children}
    </kbd>
  );
}

function Cabecalho({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-[5px] pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
      {children}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <span className="flex h-[30px] items-center gap-2 rounded-[7px] border border-tarefa-linha bg-branco px-2.5 text-[12.5px] transition-colors focus-within:border-laranja">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-tarefa-suave">{rotulo}</span>
      {children}
    </span>
  );
}

/** Linha do autocomplete. Humano = avatar redondo navy; agente = quadrado mono + "em breve". */
function LinhaMencao({
  alvo,
  selecionada,
  aoEntrar,
  aoEscolher,
}: {
  alvo: Mencionavel;
  selecionada: boolean;
  aoEntrar: () => void;
  aoEscolher: () => void;
}) {
  const agente = alvo.tipo === "agente";
  return (
    <button
      type="button"
      role="option"
      aria-selected={selecionada}
      onMouseEnter={aoEntrar}
      onClick={aoEscolher}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left",
        selecionada && "bg-hover",
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center text-[10px] font-semibold",
          agente
            ? "h-6 w-6 rounded-md border border-[#F4C7AC] bg-laranja-cl font-mono text-[11px] text-laranja-esc"
            : "h-6 w-6 rounded-full bg-navy text-branco",
        )}
      >
        {iniciaisDe(alvo.nome)}
      </span>
      <span className={cn("truncate text-[13px] font-medium", agente ? "text-suave" : "text-tinta")}>
        {alvo.nome}
      </span>
      {agente && (
        <span className="shrink-0 rounded-full border border-linha px-1.5 py-px font-mono text-[10px] text-mute">
          em breve
        </span>
      )}
      {!alvo.ativo && !agente && (
        <span className="shrink-0 rounded-full border border-linha px-1.5 py-px font-mono text-[10px] text-mute">
          sem acesso
        </span>
      )}
      {alvo.papel && (
        <span className={cn("ml-auto shrink-0 text-[11.5px]", agente ? "text-mute" : "text-suave")}>
          {alvo.papel}
        </span>
      )}
    </button>
  );
}
