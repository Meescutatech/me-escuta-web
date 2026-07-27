/**
 * Lógica PURA do tempo real (Rodada 9, fase 1) — sem I/O, testável com node --test.
 * O hook (components/projecao-viva.ts) usa estas funções; a "verdade" é sempre a releitura
 * das projeções via server component (router.refresh) — realtime é só DICA.
 */

/** Debounce do refetch: várias dicas em rajada viram UMA releitura. */
export function deveRefazer(ultimaMs: number, agoraMs: number, folgaMs: number): boolean {
  return agoraMs - ultimaMs >= folgaMs;
}

/*
 * ── Debounce COMPARTILHADO por rota (F4, Rodada 16) ────────────────────────────────────────────
 *
 * `deveRefazer` sempre esteve correta; errado era onde o "última atualização" morava. Era um
 * `useRef` DENTRO de `useProjecaoViva` — uma cópia por instância do hook. Como o sino monta em
 * toda tela autenticada, qualquer rota tem no mínimo duas instâncias, e duas instâncias com
 * relógios próprios não se debouncam: o diagnóstico observou releituras chegando em pares
 * separados por ~1 s (6.179 ms e 7.174 ms). Duas releituras completas onde cabia uma.
 *
 * O registro vive no escopo do MÓDULO (uma cópia por página carregada) e é chaveado por ROTA, não
 * global: releitura legítima de outra rota não pode ser engolida por uma que acabou de acontecer.
 */
const ultimaPorRota = new Map<string, number>();

/**
 * Pede uma releitura para `rota`. Devolve `true` só para a PRIMEIRA chamada dentro da janela de
 * `folgaMs` — as outras instâncias do hook na mesma rota recebem `false` e não refazem nada.
 */
export function tentarRefazer(rota: string, agoraMs: number, folgaMs: number): boolean {
  const ultima = ultimaPorRota.get(rota);
  // rota nunca relida ainda: a primeira dica passa sempre, sem depender de o relógio ser grande
  if (ultima !== undefined && !deveRefazer(ultima, agoraMs, folgaMs)) return false;
  ultimaPorRota.set(rota, agoraMs);
  return true;
}

/** Só para teste: zera o registro compartilhado entre casos. */
export function reiniciarDebounceCompartilhado(): void {
  ultimaPorRota.clear();
}

/*
 * ── Fontes vivas do inbox (F5, Rodada 16) ──────────────────────────────────────────────────────
 *
 * Função PURA porque a regra que ela carrega é a correção do defeito, e regra que mora dentro de
 * um hook não tem como ser provada por portão.
 *
 * A REGRA: `canal` (Broadcast from Database, que exige canal privado) e `tabela`
 * (postgres_changes) NUNCA na mesma entrada. O hook cria um canal por entrada; com as duas juntas,
 * as duas assinaturas compartilham o destino — e canal privado sem política de leitura em
 * `realtime.messages` morre com `CHANNEL_ERROR: Unauthorized`, levando o postgres_changes junto.
 * Era isso que deixava o inbox mudo: `/conversas` aberto, ZERO assinatura em core.conversa e
 * core.mensagem no banco.
 *
 * Por isso o inbox assina HOJE só postgres_changes. Religar o Broadcast no futuro é acrescentar
 * uma entrada com `canal` PRÓPRIO — sem tocar nas de `tabela`.
 */
export interface FonteTabela {
  schema: string;
  table: string;
  filter?: string;
}

export interface FonteVivaPura {
  canal?: string;
  tabela?: FonteTabela;
}

/** As fontes que o inbox assina: a lista sempre; a thread aberta, filtrada, quando houver. */
export function montarFontesConversa(conversaId: string | null): FonteVivaPura[] {
  const fontes: FonteVivaPura[] = [{ tabela: { schema: "core", table: "conversa" } }];
  if (conversaId) {
    fontes.push({
      tabela: { schema: "core", table: "mensagem", filter: `conversa_id=eq.${conversaId}` },
    });
  }
  return fontes;
}

/**
 * Guarda em tempo de execução da mesma regra (o tipo já a impede em compilação; isto é para o
 * portão e para quem construir fontes dinamicamente). Devolve a lista de problemas, vazia = ok.
 */
export function problemasNasFontes(fontes: readonly FonteVivaPura[]): string[] {
  const problemas: string[] = [];
  fontes.forEach((f, i) => {
    if (f.canal && f.tabela)
      problemas.push(
        `fonte ${i}: 'canal' e 'tabela' na mesma entrada — a falha de um derruba o outro`,
      );
    if (!f.canal && !f.tabela) problemas.push(`fonte ${i}: nem 'canal' nem 'tabela'`);
  });
  return problemas;
}

/**
 * Cards que ENTRARAM desde a última leitura (pro pulso visual discreto de 1x).
 * Primeira leitura não pulsa nada (prevIds vazio + primeiraLeitura=true).
 */
export function novosIds(
  prevIds: ReadonlySet<string>,
  atuais: readonly string[],
  primeiraLeitura: boolean,
): string[] {
  if (primeiraLeitura) return [];
  return atuais.filter((id) => !prevIds.has(id));
}

/** Carimbo "atualizado há Xs" do dashboard. <5s = "agora". */
export function fmtAtras(segundos: number): string {
  if (segundos < 5) return "agora";
  if (segundos < 60) return `há ${Math.floor(segundos)}s`;
  const min = Math.floor(segundos / 60);
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  return `há ${h}h`;
}
