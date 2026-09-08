// apoio-banco-canal.mjs — o "banco" falso da tela de canais, num lugar só.
//
// POR QUE ELE SAIU DO PORTÃO E VIROU MÓDULO: o portão `portao-d70-nivel-acao.mjs` e a suíte
// `tests/nivel-acao.test.ts` julgam a MESMA ação (`definirNivelCanal`) e precisam do mesmo cliente
// falso. Duas cópias divergiriam — e o jeito de divergir aqui é silencioso e caro: uma das cópias
// para de aplicar os `eq` de verdade, o readback passa a aprovar qualquer linha, e o teste que
// deveria pegar "a tela disse salvo e nada mudou" passa verde.
//
// O que ele implementa é a parte do postgrest-js que o código de produção usa — `select`, `eq`,
// `not`, `order`, `limit`, e o `then` para o caso de `await` sem `limit`. Os `eq` são APLICADOS,
// não registrados e ignorados: sem isso o teste mede a si mesmo.
//
// E implementa uma coisa a mais, que é o degrau da R33: o PostgREST recusa a CONSULTA INTEIRA
// quando uma coluna pedida não existe na view (`42703`), em vez de devolver a linha sem a coluna.
// É o que separa "a base não tem a migration" de "não achei a linha".

/**
 * @param {object} o
 * @param {Record<string, unknown>} o.canal   a ÚNICA linha da view (mutável: o registro a altera)
 * @param {string|null} o.papel               o que `api.papel_atual` devolve
 * @param {string[]} o.colunasDaView          as colunas que a view expõe nesta base
 * @param {(args: unknown) => unknown} o.aoRegistrar  o que `api.registrar_evento` responde
 */
export function criarBancoDeCanal({ canal, papel, colunasDaView, aoRegistrar }) {
  const rpcs = [];
  const consultas = [];

  function tabela(nome) {
    const eqs = [];
    const q = {
      select(colunas) {
        q._colunas = colunas ?? "";
        return q;
      },
      eq(campo, valor) {
        eqs.push({ campo, valor });
        return q;
      },
      not(campo) {
        eqs.push({ campo, valor: "<naoNulo>" });
        return q;
      },
      order: () => q,
      limit() {
        return q._resolver();
      },
      _resolver() {
        const pedidas = String(q._colunas ?? "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        // PostgREST recusa a CONSULTA INTEIRA por uma coluna que a view não tem — é o degrau.
        const faltando = pedidas.find((c) => !colunasDaView.includes(c));
        consultas.push({ tabela: nome, colunas: q._colunas, faltando: faltando ?? null });
        if (faltando) {
          return Promise.resolve({
            data: null,
            error: { message: `column ${nome}.${faltando} does not exist`, code: "42703" },
          });
        }
        const casa = eqs.every((f) =>
          f.valor === "<naoNulo>" ? canal[f.campo] != null : canal[f.campo] === f.valor,
        );
        const linhasResp = casa
          ? [Object.fromEntries(pedidas.map((c) => [c, canal[c] ?? null]))]
          : [];
        return Promise.resolve({ data: linhasResp, error: null });
      },
      then(res, rej) {
        return q._resolver().then(res, rej);
      },
    };
    return q;
  }

  return {
    rpcs,
    consultas,
    schema(nomeSchema) {
      return {
        from: (t) => tabela(t),
        rpc: async (nome, args) => {
          rpcs.push({ schema: nomeSchema, nome, args });
          if (nome === "papel_atual") return { data: papel, error: null };
          if (nome === "registrar_evento") return aoRegistrar(args);
          return { data: null, error: { message: `rpc inesperada: ${nome}` } };
        },
      };
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  };
}

/** As 18 colunas medidas em produção + as duas do D70 — o mundo DEPOIS da migration. */
export const COLUNAS_COM_NIVEL = [
  "canal_id", "nome", "provedor", "ativo", "numero", "waba_id", "area_efetiva", "inbox_desde",
  "pareado_em", "consentimento_em", "consentimento_titular", "consentimento_texto_versao",
  "risco_ban_aceito", "desativado_em", "criado_em", "finalidade", "consentimento_por",
  "departamento", "nivel", "nivel_declarado",
];

/** Canal não oficial com tudo em ordem: consentimento vigente, papel resolvido, nível no padrão. */
export const CANAL_LITE = {
  canal_id: "lite:jade",
  nome: "Jade",
  provedor: "nao_oficial",
  ativo: true,
  numero: null,
  waba_id: null,
  area_efetiva: "comercial",
  inbox_desde: "2026-09-08T00:00:00Z",
  pareado_em: "2026-09-08T17:06:00Z",
  consentimento_em: "2026-09-08T17:00:00Z",
  consentimento_titular: "Jade",
  consentimento_texto_versao: "v2", // = TERMO_VERSAO vigente
  risco_ban_aceito: true,
  desativado_em: null,
  criado_em: "2026-09-08T16:00:00Z",
  finalidade: "producao",
  consentimento_por: null,
  departamento: "pre_venda",
  nivel: "estrito",
  nivel_declarado: false,
};
