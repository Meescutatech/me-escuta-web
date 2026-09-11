"use client";

import { useMemo, useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { salvarCanaisClara } from "@/app/(app)/configuracoes/clara/actions";

/**
 * "Em qual número ela responde" — o bloco do painel da Clara (S12).
 *
 * ── A pergunta que a tela responde ────────────────────────────────────────────────────────
 * Não é "quais canais existem" (a tela de Canais faz isso). É **"se eu ligar a Clara agora, em
 * que número ela vai falar?"** — e até 11/09/2026 a resposta era *em todos*, inclusive na WABA
 * `627327023793464`, compartilhada com o Kommo, onde a equipe humana atende.
 *
 * ── Desenho ───────────────────────────────────────────────────────────────────────────────
 * O idioma é o do painel: hairline, sem sombra, Inter, mono só para dado de máquina (o número e
 * o id do canal SÃO dado de máquina — é por isso que estão em mono, não por textura). A única
 * ousadia é o aviso âmbar do número compartilhado, e ele mora DENTRO da linha daquele número,
 * não como faixa solta no topo: o risco é daquele canal, não da página.
 *
 * Linha, e não grade de cartões: isto é um conjunto pequeno de opções excludentes entre si, e
 * a leitura que importa é vertical (marcado × desmarcado). Nada aqui é sequência, então não há
 * numeração.
 *
 * ⚠️ Sem `<select>` nativo: a escolha é múltipla e cada linha carrega informação que não cabe
 * numa option (o número, a área, o aviso do Kommo).
 */

/** A forma mínima que a tela precisa — sem tocar em `dados/`, que o portão `cliente` proíbe. */
export interface CanalEscolhivel {
  canal_id: string;
  nome: string;
  numero: string | null;
  area_efetiva: string | null;
  provedor: string;
}

interface Props {
  canais: CanalEscolhivel[];
  /** `escopo_leitura.canais` como está no banco. Vazio = todos os números. */
  escolhidos: string[];
  ativa: boolean;
  gestor: boolean;
  /** false = a view `core.v_canal_whatsapp` não respondeu; a tela DIZ isso, não finge lista vazia. */
  canaisLegiveis: boolean;
}

/**
 * A WABA que o Kommo também usa. Medido em produção 11/09/2026: 1.761 envios em 7 dias saíram
 * por ela, e nenhum foi nosso. Ligar a Clara aqui é pôr ela e a Sara na mesma conversa.
 *
 * Está no código, e não em config, porque é um FATO sobre este número específico durante a
 * convivência com o Kommo — some junto com o Kommo (D54), e até lá ninguém deve poder apagá-lo
 * sem querer de uma tela de configuração.
 */
const CANAL_COMPARTILHADO_KOMMO = "627327023793464";

/** `pre_venda` → `Pré-venda`. O banco fala snake_case; a tela fala português. */
function areaLegivel(area: string | null): string {
  if (!area) return "";
  const mapa: Record<string, string> = {
    pre_venda: "Pré-venda",
    pos_venda: "Pós-venda",
    comercial: "Comercial",
    cobranca: "Cobrança",
    clinico: "Clínico",
    marketing: "Marketing",
  };
  return mapa[area] ?? area.replace(/_/g, " ");
}

export function CanaisDaClara(props: Props) {
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>(props.escolhidos);

  const salvos = useMemo(() => [...props.escolhidos].sort().join("|"), [props.escolhidos]);
  const atuais = useMemo(() => [...marcados].sort().join("|"), [marcados]);
  const mudou = salvos !== atuais;
  const soLeitura = !props.gestor;

  /** Onde ela responde HOJE — o que está no banco, não o que está marcado na tela. */
  const hoje = useMemo(() => {
    if (props.escolhidos.length === 0) return null;
    const nomes = props.escolhidos.map(
      (id) => props.canais.find((c) => c.canal_id === id)?.nome ?? id,
    );
    return nomes.join(", ");
  }, [props.escolhidos, props.canais]);

  const marcouKommo = marcados.includes(CANAL_COMPARTILHADO_KOMMO);
  const abertoATodos = marcados.length === 0;

  function alternar(canalId: string) {
    setMarcados((atual) =>
      atual.includes(canalId) ? atual.filter((c) => c !== canalId) : [...atual, canalId],
    );
  }

  function salvar(ligarJunto: boolean) {
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const r = await salvarCanaisClara(marcados, ligarJunto ? true : undefined);
      if (!r.ok) {
        setErro(r.motivo ?? "não foi possível salvar");
        return;
      }
      const onde =
        marcados.length === 0
          ? "todos os números"
          : marcados.map((id) => props.canais.find((c) => c.canal_id === id)?.nome ?? id).join(", ");
      setAviso(
        ligarJunto
          ? `Clara ligada — responde em ${onde} a partir da próxima mensagem`
          : `Salvo — a Clara responde em ${onde} a partir da próxima mensagem`,
      );
    });
  }

  return (
    <section className="mt-8 border-t border-linha pt-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-tinta">Em qual número ela responde</h2>
          <p className="mt-0.5 max-w-[62ch] text-[12px] leading-relaxed text-suave">
            A Clara só fala nos números marcados aqui. Nos outros, a mensagem chega normalmente e
            fica para o time.
          </p>
        </div>
        {/* o estado ATUAL, lido do agente — não o que está marcado na tela */}
        <p className="shrink-0 pt-0.5 text-[12px] text-suave">
          Responde hoje em{" "}
          {hoje ? (
            <span className="font-medium text-tinta">{hoje}</span>
          ) : (
            <span className="font-medium text-amarelo">todos os números</span>
          )}
        </p>
      </div>

      {!props.canaisLegiveis ? (
        <p className="mt-4 rounded-md border border-linha bg-hover px-3 py-2 text-[12px] text-suave">
          Não foi possível ler os números cadastrados agora. A escolha continua valendo como está —
          esta tela só não consegue mostrar a lista.
        </p>
      ) : props.canais.length === 0 ? (
        <p className="mt-4 rounded-md border border-linha bg-hover px-3 py-2 text-[12px] text-suave">
          Nenhum número ativo. Cadastre um em Configurações &gt; Canais para escolher onde a Clara
          responde.
        </p>
      ) : (
        <ul className="mt-4 border-t border-linha">
          {props.canais.map((canal) => {
            const marcado = marcados.includes(canal.canal_id);
            const doKommo = canal.canal_id === CANAL_COMPARTILHADO_KOMMO;
            return (
              <li key={canal.canal_id} className="border-b border-linha">
                <label
                  className={`flex cursor-pointer items-start gap-3 px-1 py-3 transition-colors hover:bg-hover ${
                    soLeitura ? "cursor-not-allowed opacity-60" : ""
                  }`}
                >
                  <Checkbox
                    checked={marcado}
                    disabled={soLeitura || pendente}
                    onCheckedChange={() => alternar(canal.canal_id)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[13px] font-medium text-tinta">{canal.nome}</span>
                      <span className="font-mono text-[12px] text-suave">
                        {canal.numero ?? canal.canal_id}
                      </span>
                      {canal.area_efetiva && (
                        <span className="text-[12px] text-mute">{areaLegivel(canal.area_efetiva)}</span>
                      )}
                      {canal.provedor === "nao_oficial" && (
                        <span className="text-[12px] text-mute">não oficial</span>
                      )}
                    </span>
                    {doKommo && (
                      /* a única ousadia da tela — e ela mora na linha do número, não no topo */
                      <span className="mt-1.5 block rounded-md border border-amarelo-bd bg-amarelo-bg px-2.5 py-1.5 text-[12px] leading-relaxed text-amarelo">
                        Este número é compartilhado com o Kommo — a equipe pode responder junto.
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/* O estado vazio é uma direção, não um vazio: diz o que acontece se ficar assim. */}
      {props.canaisLegiveis && props.canais.length > 0 && abertoATodos && (
        <p className="mt-3 rounded-md border border-amarelo-bd bg-amarelo-bg px-3 py-2 text-[12px] leading-relaxed text-amarelo">
          Nenhum número marcado: a Clara responde em <strong className="font-semibold">todos</strong>,
          inclusive no que a equipe usa. Marque pelo menos um para limitar onde ela fala.
        </p>
      )}
      {marcouKommo && !abertoATodos && (
        <p className="mt-3 rounded-md border border-amarelo-bd bg-amarelo-bg px-3 py-2 text-[12px] leading-relaxed text-amarelo">
          A Clara vai responder no número que a equipe também usa. Ela e a pessoa de plantão podem
          falar com a mesma paciente.
        </p>
      )}

      {erro && (
        <p className="mt-3 rounded-md border border-vermelho-bd bg-vermelho-bg px-3 py-2 text-[12px] text-vermelho">
          {erro}
        </p>
      )}
      {aviso && !erro && (
        <p className="mt-3 rounded-md border border-verde-bd bg-verde-bg px-3 py-2 text-[12px] text-verde">
          {aviso}
        </p>
      )}

      {!soLeitura && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/*
            Ligar e escolher o número no MESMO evento quando ela está desligada. Ligar primeiro e
            escolher depois deixaria a Clara solta no número do Kommo pelo tempo entre os dois
            cliques — a janela é curta e é real, e é justamente a que esta tela existe para fechar.
          */}
          <button
            type="button"
            disabled={pendente || (!mudou && props.ativa)}
            onClick={() => salvar(!props.ativa)}
            className="rounded-md bg-laranja px-3.5 py-1.5 text-[13px] font-semibold text-branco hover:bg-laranja-esc disabled:cursor-not-allowed disabled:opacity-50"
          >
            {props.ativa ? "Salvar os números" : "Salvar e ligar a Clara"}
          </button>
          {mudou && (
            <button
              type="button"
              disabled={pendente}
              onClick={() => {
                setMarcados(props.escolhidos);
                setErro(null);
                setAviso(null);
              }}
              className="rounded-md px-2 py-1.5 text-[13px] text-suave hover:text-tinta"
            >
              Desfazer
            </button>
          )}
          {/* altura reservada: o texto aparece e some sem empurrar o bloco de baixo */}
          <span className="min-h-[18px] text-[12px] text-mute">
            {pendente
              ? "Salvando…"
              : mudou
                ? "Vale a partir da próxima mensagem."
                : props.ativa
                  ? ""
                  : "A Clara está desligada."}
          </span>
        </div>
      )}
    </section>
  );
}
