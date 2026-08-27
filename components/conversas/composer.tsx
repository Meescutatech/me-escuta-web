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

export function Composer({
  modoClara,
  pending,
  leadId,
  conversaId,
  nomeLead,
  mencionaveis,
  tiposTarefa,
  templates,
  variaveis,
  autorId,
  autorEmail,
  onEnviarTexto,
  onEnviarMidia,
  onDigitar,
  aoPublicar,
  avisar,
  origem,
  programadas,
  onProgramar,
  onCancelarProgramado,
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
  /** Só variáveis CONFIÁVEIS (§5.2) — o Inbox decide o que entra; nome ruim fica de fora. */
  variaveis: VariaveisTemplate;
  autorId: string | null;
  autorEmail: string | null;
  /** templateId acompanha o texto quando o rascunho nasceu de template (§6.4). */
  onEnviarTexto: (texto: string, templateId?: string | null) => void;
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
  onCancelarProgramado: (id: string) => void;
}) {
  const [rascunho, setRascunho] = useState("");
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
  const comandos = useMemo(
    () => (modo === "mensagem" && podeComandar && !anexo ? menuComandos(rascunho, templates) : []),
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
    const efeito = efeitoDoComando(c, variaveis);
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
        onEnviarTexto(texto, deTemplate);
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
        avisar(`Não deu pra salvar: ${r.motivo ?? "erro"}`);
        return;
      }
      // C8: a escrita nunca é bloqueada por permissão — o aviso é efêmero e só pro autor
      const aviso = avisoSemAcesso(vivas);
      avisar(aviso ?? (modo === "nota" ? "Nota salva — só a equipe vê." : "Tarefa criada."));
      sairDoModo();
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
              const temAsDuasSecoes = comandos.some((x) => x.acao === "template") && comandos.some((x) => x.acao === "modo");
              return (
                <div key={c.acao === "template" ? c.template.id : c.comando} className="contents">
                  {i === 0 && c.acao === "modo" && temAsDuasSecoes && <Cabecalho>Comandos</Cabecalho>}
                  {primeiroTemplate && temAsDuasSecoes && <Cabecalho>Templates</Cabecalho>}
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
                    {i === iComando && <span className="ml-auto font-mono text-[10.5px] text-mute">↵</span>}
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
                  : "border-tarefa-linha bg-tarefa-faixa text-navy",
              )}
            >
              <span className="font-[650] tracking-[0.01em]">{rotuloModo(modo)}</span>
              <span className="truncate text-suave">
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
          {!interno && origem && (origem.motivo || origem.aviso || origem.respondePor) ? (
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
            <div className="flex flex-wrap gap-2 px-3.5 pb-0.5 pt-0.5">
              <Campo rotulo="Responsável">
                <select
                  value={responsavelId}
                  onChange={(e) => setResponsavelId(e.target.value)}
                  aria-label="Responsável pela tarefa"
                  className="cursor-pointer bg-transparent pr-1 text-[12.5px] font-medium text-tinta outline-none"
                >
                  {mencionaveis
                    .filter((m) => m.tipo === "humano" && m.ativo)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                </select>
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
                <select
                  value={tipoTarefa}
                  onChange={(e) => setTipoTarefa(e.target.value)}
                  aria-label="Tipo da tarefa"
                  className={cn(
                    "cursor-pointer bg-transparent pr-1 text-[12.5px] outline-none",
                    tipoTarefa ? "font-medium text-tinta" : "text-mute",
                  )}
                >
                  <option value="">Selecione</option>
                  {tiposTarefa.map((t) => (
                    <option key={t.chave} value={t.chave}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descrição (opcional)"
                aria-label="Descrição da tarefa"
                className="h-[30px] min-w-[180px] flex-1 rounded-md border border-tarefa-linha bg-branco px-2.5 text-[12.5px] text-tinta outline-none placeholder:text-mute focus:border-laranja"
              />
            </div>
          )}

          {/* barra de rodapé: dica à esquerda, ação à direita */}
          <div className="flex items-center gap-2.5 py-2 pl-3.5 pr-2.5">
            <span className="min-w-0 truncate text-[12px] text-mute">
              {interno ? (
                <>
                  Digite <Tecla>@</Tecla> para {modo === "nota" ? "avisar alguém" : "atribuir a outra pessoa"}
                </>
              ) : comandos.length > 0 ? (
                <>
                  <Tecla>↑</Tecla> <Tecla>↓</Tecla> navega · <Tecla>Esc</Tecla> cancela
                </>
              ) : pendentes.length > 0 ? (
                <span className="text-amarelo">
                  Complete {pendentes.join(", ")} antes de enviar — variável sem valor.
                </span>
              ) : podeComandar ? (
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
    <span className="flex h-[30px] items-center gap-[7px] rounded-md border border-tarefa-linha bg-branco px-2.5 text-[12.5px]">
      <span className="text-suave">{rotulo}</span>
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
