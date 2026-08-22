"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { criarClienteBrowser } from "@/lib/supabase/client";
import {
  ASSENTAMENTO_MS,
  estadoDoSelo,
  problemasNasFontes,
  tentarRefazer,
  type EstadoSelo,
  type FonteTabela,
} from "@/lib/tempo-real";
import { intervaloEfetivo } from "@/lib/intervalos-vivos";

/**
 * Projeção "viva" genérica (Rodada 9) — generalização do padrão das conversas (RF-9/32):
 * Supabase Realtime é DICA (chegou algo → refetch); a VERDADE é sempre a releitura das
 * projeções via server component (router.refresh()).
 *
 * A publication `supabase_realtime` TEM as 6 tabelas core.* (conversa, mensagem, lead,
 * estado_lead, mencao, tarefa), em local e em produção — conferido na fonte em 26/07. O
 * comentário que vivia aqui dizendo que ela estava VAZIA era falso e mandou todo mundo olhar
 * para o lado errado por quatro dias (E-008). O que calava o inbox era outra coisa, e está
 * descrita em `lib/tempo-real.ts`: canal privado e postgres_changes pendurados no MESMO canal.
 *
 * Duas regras que este arquivo passa a garantir:
 *   1. UM canal por fonte, e nenhuma fonte mistura Broadcast com postgres_changes. Falha de
 *      autorização de um canal nunca derruba o outro.
 *   2. O status de `subscribe()` é PROPAGADO ao chamador (e vai para o console quando falha).
 *      Antes ele era engolido: o canal morria e a tela seguia exibindo "ao vivo".
 *   3. (22/08) O TÓPICO do canal é ÚNICO por instância do hook e por rodada de assinatura.
 *      O bloco abaixo explica por quê — é o defeito que deixou a /tarefas sem tempo real.
 *
 * ── TÓPICO ÚNICO: o erro que congelava a /tarefas ──────────────────────────────────────────────
 *
 * Erro real, capturado no navegador em 22/08 com a /tarefas aberta:
 *
 *   Error: cannot add `postgres_changes` callbacks for realtime:pg:core.tarefa:* after `subscribe()`
 *
 * A leitura fácil ("o .on() está DEPOIS do .subscribe()") está errada: neste arquivo o `.on()`
 * sempre foi antes. O defeito é COLISÃO DE TÓPICO, e são dois fatos do realtime-js 2.110.3
 * (lidos na fonte, em node_modules/@supabase/realtime-js/dist/main/):
 *
 *   · RealtimeClient.channel(topico) NÃO cria canal novo quando o tópico já existe — devolve o
 *     canal EXISTENTE (`const exists = this.getChannels().find(c => c.topic === realtimeTopic)`).
 *   · RealtimeChannel.on(...) LANÇA quando o canal está `isJoined() || isJoining()` e o tipo é
 *     postgres_changes/presence (RealtimeChannel.js:413-419) — a mensagem acima, literal.
 *
 * Na /tarefas duas instâncias montadas ao mesmo tempo pediam a MESMA tabela e portanto o mesmo
 * nome calculado `pg:core.tarefa:*`: o SINO (components/notificacoes/sino.tsx — mora no header,
 * logo monta em TODA tela autenticada; assina core.mencao + core.tarefa) e a VisaoTarefas
 * (assina core.tarefa). A segunda a chegar recebia o canal já `joined` da primeira e o `.on()`
 * lançava DENTRO da IIFE assíncrona — rejeição não tratada, o laço `for` morria ali e NENHUMA
 * fonte daquela instância assinava. Por isso a tarefa criada pelo Jarvis nunca aparecia sozinha:
 * o tempo real de core.tarefa nunca chegou a existir.
 *
 * Alcance MEDIDO da colisão hoje (grep de todos os chamadores do hook, 22/08): só core.tarefa.
 *   sino = mencao + tarefa · /tarefas = tarefa · /funil = estado_lead + lead ·
 *   /conversas = conversa + mensagem(filtrada) · carimbo-vivo = [] (nenhuma fonte).
 * `tarefa` é a única tabela pedida por dois chamadores que montam juntos. As outras escaparam
 * por sorte de nomenclatura, não por proteção — qualquer tela nova que repita uma tabela do
 * sino cairia no mesmo buraco. Por isso o conserto é no hook, não na chamada da /tarefas.
 *
 * O mesmo tópico único fecha um segundo modo de falha, mais raro e mais difícil de ver:
 * `removeChannel()` é ASSÍNCRONO (espera o ack do leave), então o canal antigo continua em
 * `socket.channels` por alguns ms depois do cleanup. Um efeito que remontasse nessa janela
 * recriaria o mesmo tópico e pegaria o canal em `leaving` — mesmo erro, agora intermitente.
 *
 * ── O TERCEIRO EIXO: instância + rodada NÃO bastam (conserto de 22/08, revisão adversarial) ────
 *
 * O sufixo `#instancia.rodada` fecha a colisão ENTRE duas instâncias do hook e entre duas rodadas
 * da mesma instância. Ele NÃO fecha a colisão DENTRO da mesma rodada: duas fontes iguais no mesmo
 * array (`[{tabela: tarefa}, {tabela: tarefa}]`, ou a mesma tabela pedida com o mesmo filtro por
 * dois pedaços do chamador) produzem o MESMO `nome` calculado e, com instância e rodada iguais, o
 * MESMO tópico.
 *
 * E aí o estrago é PIOR do que o original, por causa do `catch` que esta mesma frente escreveu:
 *   1ª fonte  → `channel(topico)` cria o canal, `.on()` passa, `.subscribe()` entra;
 *   2ª fonte  → `channel(topico)` devolve o canal EXISTENTE (já joining), `.on()` LANÇA,
 *               o catch registra a falha e chama `removeChannel(canal)` — que remove o canal
 *               da PRIMEIRA fonte, porque é o mesmo objeto.
 * Resultado: o laço não morre mais (o catch resolveu isso), mas as DUAS fontes ficam sem tempo
 * real, e o selo mostra a falha de uma só. Trocar "laço morto" por "canal bom derrubado" não é
 * conserto.
 *
 * Por isso o tópico leva também o ÍNDICE da fonte no array. `topicosDaRodada` (abaixo, pura e
 * exportada) é quem calcula os três eixos, e é ela que o teste exercita — não uma cópia da regra
 * escrita duas vezes.
 */

export interface FonteViva {
  /** canal de Broadcast from Database (privado) — opcional, e NUNCA junto de `tabela` */
  canal?: string;
  /** postgres_changes — opcional, e NUNCA junto de `canal` */
  tabela?: FonteTabela;
}

/** Rótulo LEGÍVEL da fonte — chave do status e texto do console. Não vai para o servidor. */
export function rotuloDaFonte(f: FonteViva): string {
  return f.canal ?? `pg:${f.tabela?.schema}.${f.tabela?.table}:${f.tabela?.filter ?? "*"}`;
}

/**
 * Os tópicos de UMA rodada de assinatura. Três eixos, e cada um fecha uma colisão real:
 *   · `idInstancia` — duas instâncias do hook montadas juntas (o sino × a /tarefas, medido 22/08);
 *   · `rodada`      — a janela em que o canal da rodada anterior ainda não terminou de sair;
 *   · `indice`      — duas fontes IGUAIS dentro do mesmo array (ver "O TERCEIRO EIXO" acima).
 *
 * Pura e exportada de propósito: era a única parte deste arquivo que um teste podia alcançar sem
 * um DOM, e é onde mora a garantia que interessa — tópicos todos distintos.
 *
 * O `nome` (rótulo) de propósito NÃO leva os três eixos: é o texto que vai para o console e para o
 * selo, e "pg:core.tarefa:*" é o que o operador entende. Consequência assumida e limitada: com
 * duas fontes IGUAIS o mapa de status guarda uma entrada só, então se uma assinar e a outra
 * falhar, o selo mostra a última que escreveu. Isso é bem menos grave que o defeito consertado
 * (canal bom derrubado, as duas fontes mudas) e some sozinho quando o chamador não repete fonte —
 * que é o caso de todos os chamadores de hoje, medidos no bloco "TÓPICO ÚNICO".
 */
export function topicosDaRodada(
  fontes: FonteViva[],
  idInstancia: string,
  rodada: number,
): { fonte: FonteViva; nome: string; topico: string }[] {
  return fontes.map((fonte, indice) => {
    const nome = rotuloDaFonte(fonte);
    return { fonte, nome, topico: `${nome}#${idInstancia}.${rodada}.${indice}` };
  });
}

export interface EstadoVivo {
  /**
   * true só com EVIDÊNCIA de que a dica chega: todas as assinaturas confirmadas E (um evento já
   * recebido OU passado o assentamento). `SUBSCRIBED` sozinho não basta — medido: escrita feita
   * logo após o SUBSCRIBED se perdeu em 2 de 4 rodadas (ver lib/tempo-real.ts).
   */
  aoVivo: boolean;
  /** assinou, mas ainda sem evidência de entrega. Não é falha, e não é "ao vivo". */
  conectando: boolean;
  /** falhas observadas, no formato "<canal>: <status>" — vazio quando não há. */
  falhas: string[];
  selo: EstadoSelo;
}

export function useProjecaoViva(
  fontes: FonteViva[],
  opts: {
    intervaloMs: number;
    ativo?: boolean;
    folgaMs?: number;
    /**
     * Quando informado, o intervalo cai para este piso enquanto o tempo real NÃO estiver
     * confirmado. Use nas telas cujo intervalo só é longo porque o Realtime as sustenta
     * (/conversas e /funil). Sem ele, `intervaloMs` vale sempre.
     */
    pisoSemTempoRealMs?: number;
  },
): EstadoVivo {
  const router = useRouter();
  const rota = usePathname() ?? "/";
  const { intervaloMs, ativo = true, folgaMs = 1200, pisoSemTempoRealMs } = opts;
  // dep estável: fontes é recriado a cada render do chamador
  const chaveFontes = JSON.stringify(fontes);

  // Sufixo do tópico (ver "TÓPICO ÚNICO" no topo). `useId` distingue DUAS INSTÂNCIAS do hook
  // montadas juntas (sino × /tarefas); o contador distingue duas RODADAS da mesma instância,
  // que é a janela em que o canal anterior ainda não terminou de sair.
  const idInstancia = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rodadaRef = useRef(0);

  const [status, setStatus] = useState<Record<string, string>>({});
  // evidências de que a dica chega de verdade (R16-06bis)
  const [recebeuEvento, setRecebeuEvento] = useState(false);
  const [assentou, setAssentou] = useState(false);

  // folga muda sem precisar remontar assinatura nem relógio
  const folgaRef = useRef(folgaMs);
  folgaRef.current = folgaMs;

  // O debounce é COMPARTILHADO por rota (F4): duas instâncias do hook na mesma página produzem
  // UMA releitura, não duas separadas por ~1 s.
  const atualizar = useCallback(() => {
    if (!tentarRefazer(rota, Date.now(), folgaRef.current)) return;
    router.refresh();
  }, [rota, router]);

  // um evento que CHEGOU é a prova direta de que o caminho funciona — melhor que qualquer relógio
  const aoChegarDica = useCallback(() => {
    setRecebeuEvento(true);
    atualizar();
  }, [atualizar]);

  // ── efeito 1: assinaturas. Depende só das fontes — mudar o intervalo NÃO remonta canal
  // (senão o piso condicional viraria laço: reassina → confirma → sobe o intervalo → reassina).
  useEffect(() => {
    setRecebeuEvento(false);
    setAssentou(false);
    if (!ativo) {
      setStatus({});
      return;
    }
    const fontesEfetivas = JSON.parse(chaveFontes) as FonteViva[];
    if (fontesEfetivas.length === 0) {
      setStatus({});
      return;
    }

    const problemas = problemasNasFontes(fontesEfetivas);
    if (problemas.length > 0) {
      // não silencia: fonte mal formada é o defeito original voltando
      console.error("[projecao-viva] fontes inválidas:", problemas.join(" · "));
    }

    const supabase = criarClienteBrowser();
    const canais: RealtimeChannel[] = [];
    const rodada = ++rodadaRef.current;
    let cancelado = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelado) return;
      // o Realtime avalia RLS com este JWT — sem setAuth, postgres_changes não entrega nada
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);

      // `nome` continua sendo o rótulo LEGÍVEL (chave do status, texto do console); o tópico que
      // vai para o servidor leva instância+rodada+ÍNDICE para nunca colidir. Ver "TÓPICO ÚNICO".
      for (const { fonte: f, nome, topico } of topicosDaRodada(fontesEfetivas, idInstancia, rodada)) {
        if (f.canal && f.tabela) continue; // já reportado acima; não abrimos o canal defeituoso
        // canal privado só existe para Broadcast, e só quando alguém pedir `canal` explicitamente.
        // Enquanto não houver política de leitura em `realtime.messages`, ninguém pede — as fontes
        // do inbox são todas de `tabela` (ver montarFontesConversa).
        let canal = supabase.channel(topico, f.canal ? { config: { private: true } } : undefined);
        try {
          if (f.canal) canal = canal.on("broadcast", { event: "*" }, aoChegarDica);
          if (f.tabela) {
            canal = canal.on(
              "postgres_changes",
              { event: "*", schema: f.tabela.schema, table: f.tabela.table, filter: f.tabela.filter },
              aoChegarDica,
            );
          }
        } catch (e) {
          // `.on()` lança quando o canal já entrou (RealtimeChannel.js:413-419). O tópico único
          // deveria tornar isso impossível; se voltar a acontecer, o que NÃO pode é a exceção
          // subir e matar o laço calada — era assim que a /tarefas perdia todas as suas fontes.
          const detalhe = `ERRO_AO_ASSINAR: ${e instanceof Error ? e.message : String(e)}`;
          console.error(`[projecao-viva] canal "${nome}" — ${detalhe}`);
          setStatus((anterior) => ({ ...anterior, [nome]: detalhe }));
          supabase.removeChannel(canal);
          continue;
        }
        canais.push(
          canal.subscribe((estado, erro) => {
            const detalhe = erro ? `${estado}: ${erro.message}` : estado;
            if (estado !== "SUBSCRIBED") {
              console.error(`[projecao-viva] canal "${nome}" — ${detalhe}`);
            }
            setStatus((anterior) => ({ ...anterior, [nome]: detalhe }));
          }),
        );
      }
    })();

    return () => {
      cancelado = true;
      for (const c of canais) supabase.removeChannel(c);
      setStatus({});
    };
  }, [chaveFontes, ativo, aoChegarDica, idInstancia]);

  const { todosSubscribed, falhas } = useMemo(() => {
    const entradas = Object.entries(status);
    return {
      todosSubscribed: entradas.length > 0 && entradas.every(([, s]) => s === "SUBSCRIBED"),
      falhas: entradas.filter(([, s]) => s !== "SUBSCRIBED").map(([n, s]) => `${n}: ${s}`),
    };
  }, [status]);

  // ── assentamento: o servidor pode levar até ~2 s para ter a assinatura DEPOIS do SUBSCRIBED.
  // Enquanto isso o selo diz "conectando" e o polling segue no piso curto — nada se perde calado.
  useEffect(() => {
    if (!todosSubscribed || recebeuEvento) return;
    const t = setTimeout(() => setAssentou(true), ASSENTAMENTO_MS);
    return () => clearTimeout(t);
  }, [todosSubscribed, recebeuEvento]);

  const selo = estadoDoSelo({ todosSubscribed, recebeuEvento, assentou });
  const aoVivo = selo === "ao-vivo";

  // ── efeito 2: o piso. Polling só com a aba visível + releitura ao focar.
  const intervaloUsado =
    pisoSemTempoRealMs == null ? intervaloMs : intervaloEfetivo(intervaloMs, aoVivo, pisoSemTempoRealMs);

  useEffect(() => {
    if (!ativo) return;
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, intervaloUsado);
    const aoFocar = () => atualizar();
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoFocar);
    return () => {
      clearInterval(tick);
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoFocar);
    };
  }, [ativo, intervaloUsado, atualizar]);

  return { aoVivo, conectando: selo === "conectando", falhas, selo };
}
