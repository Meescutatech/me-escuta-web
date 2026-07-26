"use client";

import { useMemo, useState, useTransition } from "react";
import {
  alternarClara,
  salvarFollowup,
  publicarPrompt,
  zerarLeadDemo,
} from "@/app/(app)/configuracoes/clara/actions";
import {
  PISO_JANELA_PRODUCAO_MIN,
  HORARIO_PRODUCAO,
  contratoOk,
  efeitoRuntime,
  problemasContrato,
} from "@/lib/clara/contrato-followup";

/**
 * Painel da Clara (Configurações > Clara, SPEC §2-bis) — desenho R9: hairlines, sem sombra,
 * Inter única, mono só pra dado de máquina, laranja como ÚNICO acento de ação.
 * A assinatura da página é o cabeçalho-disjuntor: o estado VIVO do agente (ponto pulsante +
 * interruptor mestre) — desligar aqui silencia a próxima mensagem, na hora.
 */

export interface VersaoPrompt {
  versao: number;
  justificativa: string | null;
  prompt: string;
  ator: string;
  em: string;
}

export interface LeadDemo {
  lead_id: string;
  nome: string | null;
  telefone: string | null;
}

interface Props {
  gestor: boolean;
  ativa: boolean;
  prompt: string;
  promptVersao: number;
  followup: {
    ativo: boolean;
    janelasMin: number[];
    inicio: number;
    fim: number;
    /** "demo" só com `modo:"demo"` explícito na config — travas de produção desligadas. */
    modo: "producao" | "demo";
  };
  historico: VersaoPrompt[];
  telefonesDemo: string[];
  leadsDemo: LeadDemo[];
}

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function kChars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",")} mil` : String(n);
}

/** Interruptor no idioma da casa: pílula hairline, verde semântico quando ligada. */
function Interruptor(props: { ligada: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.ligada}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.ligada)}
      className={`relative h-[26px] w-[46px] flex-none rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:cursor-not-allowed disabled:opacity-50 ${
        props.ligada ? "border-verde-bd bg-verde" : "border-linha-forte bg-linha"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[2px] h-[20px] w-[20px] rounded-full bg-branco transition-[left] ${
          props.ligada ? "left-[23px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

export function PainelClara(props: Props) {
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // prompt
  const [editandoPrompt, setEditandoPrompt] = useState(false);
  const [textoPrompt, setTextoPrompt] = useState(props.prompt);
  const [justificativa, setJustificativa] = useState("");
  const [versaoAberta, setVersaoAberta] = useState<number | null>(null);

  // follow-up (as 4 janelas da cadência do n8n; menos janelas = cadência mais curta)
  const [fuAtivo, setFuAtivo] = useState(props.followup.ativo);
  const [janelas, setJanelas] = useState<string[]>(props.followup.janelasMin.map(String));
  const [inicio, setInicio] = useState(String(props.followup.inicio));
  const [fim, setFim] = useState(String(props.followup.fim));

  // Contrato de produção (espelho do runtime — lib/clara/contrato-followup):
  // o que está DIGITADO valida em tempo real; o que está SALVO denuncia divergência.
  const problemasForm = useMemo(
    () =>
      problemasContrato(
        janelas.map((j) => Number(j)).filter((n) => n > 0),
        Number(inicio),
        Number(fim),
      ),
    [janelas, inicio, fim],
  );
  const formOk = contratoOk(problemasForm);
  const modoDemo = props.followup.modo === "demo";
  const salvo = useMemo(
    () => efeitoRuntime(props.followup.janelasMin, props.followup.inicio, props.followup.fim),
    [props.followup.janelasMin, props.followup.inicio, props.followup.fim],
  );

  const roda = (acao: () => Promise<{ ok: boolean; motivo?: string }>, feito: string) => {
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.motivo ?? "não foi possível salvar");
      else setAviso(feito);
    });
  };

  const soLeitura = !props.gestor;

  return (
    <div className="animate-rise">
      {/* ===== cabeçalho-disjuntor: o estado vivo da Clara ===== */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold text-tinta">Clara</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-suave">
            Agente de pré-venda no WhatsApp: responde sozinha, preenche a ficha do lead e passa o
            bastão pro time nos pontos certos.
          </p>
          <div className="mt-3 flex items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className={`h-[9px] w-[9px] flex-none rounded-full ${
                props.ativa ? "bg-verde animate-pulse-live" : "bg-mute"
              }`}
            />
            <span className={props.ativa ? "font-medium text-verde" : "font-medium text-suave"}>
              {props.ativa ? "Respondendo conversas" : "Desligada — mensagens ficam pro time"}
            </span>
            <span className="text-mute">·</span>
            <span className="font-mono text-[12px] text-suave">prompt v{props.promptVersao}</span>
            <span className="text-mute">·</span>
            <span className="text-suave">
              follow-up {fuAtivo ? janelas.filter(Boolean).join("/") + " min" : "desligado"}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 pt-1">
          <Interruptor
            ligada={props.ativa}
            disabled={soLeitura || pendente}
            onChange={(v) =>
              roda(
                () => alternarClara(v),
                v ? "Clara ligada — volta a responder na próxima mensagem" : "Clara desligada — a próxima mensagem já fica em silêncio",
              )
            }
          />
          <span className="text-[11px] text-mute">{props.ativa ? "Desligar" : "Ligar"}</span>
        </div>
      </div>

      {soLeitura && (
        <p className="mt-4 rounded-md border border-linha bg-hover px-3 py-2 text-[12px] text-suave">
          Você está vendo em modo leitura — mudar a Clara exige papel de gestão.
        </p>
      )}
      {erro && (
        <p className="mt-4 rounded-md border border-vermelho-bd bg-vermelho-bg px-3 py-2 text-[12px] text-vermelho">
          {erro}
        </p>
      )}
      {aviso && !erro && (
        <p className="mt-4 rounded-md border border-verde-bd bg-verde-bg px-3 py-2 text-[12px] text-verde">
          {aviso}
        </p>
      )}

      {/* ===== prompt versionado ===== */}
      <section className="mt-8 border-t border-linha pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-tinta">Prompt do agente</h2>
            <p className="mt-0.5 text-[12px] text-suave">
              O roteiro completo da Clara. Cada publicação vira uma versão auditável — dá pra voltar.
            </p>
          </div>
          <span className="font-mono text-[12px] text-suave">
            v{props.promptVersao} · {kChars(props.prompt.length)} caracteres
          </span>
        </div>

        {!editandoPrompt ? (
          <button
            type="button"
            onClick={() => {
              setTextoPrompt(props.prompt);
              setEditandoPrompt(true);
            }}
            className="mt-3 rounded-md border border-linha bg-branco px-3 py-1.5 text-[13px] font-medium text-tinta hover:bg-hover"
          >
            Ver e editar prompt
          </button>
        ) : (
          <div className="mt-3">
            <textarea
              value={textoPrompt}
              onChange={(e) => setTextoPrompt(e.target.value)}
              readOnly={soLeitura}
              spellCheck={false}
              rows={22}
              className="w-full resize-y rounded-md border border-linha bg-branco p-3 font-mono text-[12px] leading-relaxed text-tinta focus:border-foco-comp focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                readOnly={soLeitura}
                placeholder="O que mudou? (vai pro histórico)"
                className="min-w-0 flex-1 rounded-md border border-linha bg-branco px-3 py-1.5 text-[13px] text-tinta placeholder:text-mute focus:border-foco-comp focus:outline-none"
              />
              <button
                type="button"
                disabled={soLeitura || pendente || textoPrompt.trim() === props.prompt.trim()}
                onClick={() =>
                  roda(
                    () => publicarPrompt(textoPrompt, justificativa, props.promptVersao),
                    `Prompt v${props.promptVersao + 1} publicado — vale a partir da próxima conversa`,
                  )
                }
                className="rounded-md bg-laranja px-3.5 py-1.5 text-[13px] font-semibold text-branco hover:bg-laranja-esc disabled:cursor-not-allowed disabled:opacity-50"
              >
                Publicar versão nova
              </button>
              <button
                type="button"
                onClick={() => setEditandoPrompt(false)}
                className="rounded-md px-2 py-1.5 text-[13px] text-suave hover:text-tinta"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {props.historico.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
              Versões anteriores
            </h3>
            <ul className="mt-2 divide-y divide-linha border-y border-linha">
              {props.historico.map((v) => (
                <li key={v.versao} className="py-2.5 text-[13px]">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[12px] font-medium text-tinta">v{v.versao}</span>
                    <span className="min-w-0 flex-1 truncate text-suave">
                      {v.justificativa ?? "sem descrição"}
                    </span>
                    <span className="font-mono text-[11px] text-mute">{dataCurta(v.em)}</span>
                    <button
                      type="button"
                      onClick={() => setVersaoAberta(versaoAberta === v.versao ? null : v.versao)}
                      className="text-[12px] text-suave underline-offset-2 hover:underline"
                    >
                      {versaoAberta === v.versao ? "esconder" : "ver"}
                    </button>
                    {v.versao !== props.promptVersao && (
                      <button
                        type="button"
                        disabled={soLeitura || pendente}
                        onClick={() =>
                          roda(
                            () =>
                              publicarPrompt(
                                v.prompt,
                                `restauração da v${v.versao}`,
                                props.promptVersao,
                              ),
                            `Prompt restaurado a partir da v${v.versao} (publicado como v${props.promptVersao + 1})`,
                          )
                        }
                        className="text-[12px] font-medium text-navy underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        Restaurar
                      </button>
                    )}
                  </div>
                  {versaoAberta === v.versao && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-linha bg-board p-3 font-mono text-[11px] leading-relaxed text-suave">
                      {v.prompt}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ===== follow-up ===== */}
      <section className="mt-8 border-t border-linha pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-tinta">Follow-up de lead parado</h2>
            <p className="mt-0.5 text-[12px] text-suave">
              Lead que some é retomado nas janelas abaixo, só em horário comercial. A mudança vale
              já pro próximo disparo.
            </p>
          </div>
          <Interruptor ligada={fuAtivo} disabled={soLeitura || pendente} onChange={setFuAtivo} />
        </div>

        {/* o salvo diverge do que roda: a página mostra, nunca esconde (contrato = runtime) */}
        {!modoDemo && salvo.divergente && (
          <p className="mt-3 rounded-md border border-amarelo-bd bg-amarelo-bg px-3 py-2 text-[12px] leading-relaxed text-amarelo">
            O que está salvo não é o que roda: a cadência gravada (
            <span className="font-mono">{props.followup.janelasMin.join("/")} min</span>, das{" "}
            {props.followup.inicio} às {props.followup.fim}h) está fora do contrato de produção, e o
            runtime aplica <span className="font-mono">{salvo.janelasEfetivasMin.join("/")} min</span>, das{" "}
            {salvo.horarioEfetivo.inicio} às {salvo.horarioEfetivo.fim}h. Salve valores dentro dos
            limites abaixo para a tela e a Clara voltarem a dizer a mesma coisa.
          </p>
        )}
        {modoDemo && (
          <p className="mt-3 rounded-md border border-linha bg-hover px-3 py-2 text-[12px] leading-relaxed text-suave">
            Modo demonstração gravado na configuração: as travas de produção estão desligadas e a
            cadência vale exatamente como está. Salvar aqui grava valores de produção e desliga o
            modo demonstração.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
              Janelas (minutos após a última tentativa · mín. {PISO_JANELA_PRODUCAO_MIN})
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              {janelas.map((j, i) => (
                <label key={i} className="flex items-center gap-1">
                  <span className="font-mono text-[11px] text-mute">{i + 1}ª</span>
                  <input
                    value={j}
                    onChange={(e) => {
                      const c = [...janelas];
                      c[i] = e.target.value.replace(/\D/g, "");
                      setJanelas(c);
                    }}
                    readOnly={soLeitura}
                    inputMode="numeric"
                    aria-label={`Janela ${i + 1} em minutos`}
                    className="w-[62px] rounded-md border border-linha bg-branco px-2 py-1.5 text-center font-mono text-[13px] text-tinta focus:border-foco-comp focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
              Horário comercial ({HORARIO_PRODUCAO.inicioMin}–{HORARIO_PRODUCAO.fimMax}h)
            </span>
            <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-suave">
              das
              <input
                value={inicio}
                onChange={(e) => setInicio(e.target.value.replace(/\D/g, ""))}
                readOnly={soLeitura}
                inputMode="numeric"
                aria-label="Início do horário comercial"
                className="w-[46px] rounded-md border border-linha bg-branco px-2 py-1.5 text-center font-mono text-[13px] text-tinta focus:border-foco-comp focus:outline-none"
              />
              às
              <input
                value={fim}
                onChange={(e) => setFim(e.target.value.replace(/\D/g, ""))}
                readOnly={soLeitura}
                inputMode="numeric"
                aria-label="Fim do horário comercial"
                className="w-[46px] rounded-md border border-linha bg-branco px-2 py-1.5 text-center font-mono text-[13px] text-tinta focus:border-foco-comp focus:outline-none"
              />
              h
            </div>
          </div>
          <button
            type="button"
            disabled={soLeitura || pendente || !formOk}
            onClick={() =>
              roda(
                () =>
                  salvarFollowup({
                    ativo: fuAtivo,
                    janelasMin: janelas.map((j) => Number(j)).filter((n) => n > 0),
                    inicio: Number(inicio),
                    fim: Number(fim),
                  }),
                "Cadência de follow-up salva — o próximo disparo já usa os valores novos",
              )
            }
            className="rounded-md bg-laranja px-3.5 py-1.5 text-[13px] font-semibold text-branco hover:bg-laranja-esc disabled:cursor-not-allowed disabled:opacity-50"
          >
            Salvar cadência
          </button>
        </div>

        {/* validação em tempo real com o PORQUÊ — mesmo contrato que a action recusa no servidor */}
        {problemasForm.janelas && (
          <p className="mt-2 text-[12px] leading-relaxed text-vermelho" role="alert">
            {problemasForm.janelas}
          </p>
        )}
        {problemasForm.horario && (
          <p className="mt-2 text-[12px] leading-relaxed text-vermelho" role="alert">
            {problemasForm.horario}
          </p>
        )}
      </section>

      {/* ===== demo / restart ===== */}
      <section className="mt-8 border-t border-linha pt-6 pb-4">
        <h2 className="text-[15px] font-semibold text-tinta">Demonstração</h2>
        <p className="mt-0.5 max-w-[560px] text-[12px] leading-relaxed text-suave">
          Números de teste autorizados podem recomeçar do zero: o <span className="font-mono text-[11px]">/restart</span>{" "}
          (mandado pelo próprio WhatsApp, ou o botão aqui) apaga conversa, ficha, score e histórico
          do lead de demonstração. Leads reais não entram nesta lista e não podem ser apagados.
        </p>
        {props.telefonesDemo.length === 0 ? (
          <p className="mt-3 text-[12px] text-mute">
            Nenhum número de teste na lista — a lista (config <span className="font-mono text-[11px]">demo_clara</span>)
            entra por versão de configuração.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {props.telefonesDemo.map((tel) => {
              const lead = props.leadsDemo.find((l) => l.telefone === tel);
              return (
                <li key={tel} className="flex items-center gap-3 text-[13px]">
                  <span className="font-mono text-[12px] text-tinta">+{tel}</span>
                  <span className="min-w-0 flex-1 truncate text-suave">
                    {lead ? (lead.nome ?? "lead de demo em andamento") : "sem conversa no momento"}
                  </span>
                  {lead && (
                    <button
                      type="button"
                      disabled={soLeitura || pendente}
                      onClick={() => {
                        if (window.confirm(`Zerar a demo do +${tel}? Apaga conversa, ficha e histórico deste lead de teste.`)) {
                          roda(() => zerarLeadDemo(lead.lead_id), "Demo zerada — a próxima mensagem começa do zero");
                        }
                      }}
                      className="rounded-md border border-vermelho-bd bg-vermelho-bg px-2.5 py-1 text-[12px] font-medium text-vermelho hover:brightness-95 disabled:opacity-50"
                    >
                      Zerar demo
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
