// cliente-falso.mjs — cliente Supabase FALSO QUE CONTA CHAMADAS, exigido pelas specs do F24a e do
// F25 ("um cliente Supabase falso que conta chamadas e mede payload").
//
// Existe porque "≤ 12 requisições" e "o contador não lê prévia nem faz join de lead" são
// afirmações sobre O QUE O CÓDIGO PEDE AO BANCO — e isso não se prova pelo resultado. Duas
// implementações podem devolver o mesmo número fazendo 37 ou 9 round-trips, e é justamente a
// diferença entre elas que os dois itens existem para cortar.
//
// Imita a parte do encadeamento do postgrest-js que o nosso código usa. Cada consulta se registra
// no momento em que é AGUARDADA (o builder é thenable), então a contagem é de requisições reais,
// não de objetos criados.

/**
 * @param {(q: object) => {data?: unknown, error?: unknown, count?: number}} responder
 *        recebe a consulta descrita e devolve a resposta a fingir.
 */
export function criarClienteFalso(responder) {
  const chamadas = [];

  function novaConsulta(schema, tabela) {
    const q = {
      schema,
      tabela,
      colunas: null,
      head: false,
      count: null,
      filtros: [],
      ordem: [],
      limite: null,
      single: false,
    };
    const filtro = (op) => (campo, ...resto) => {
      q.filtros.push({ op, campo, valores: resto });
      return api;
    };
    const api = {
      select(colunas, opcoes) {
        q.colunas = colunas ?? null;
        if (opcoes?.head) q.head = true;
        if (opcoes?.count) q.count = opcoes.count;
        return api;
      },
      eq: filtro("eq"),
      neq: filtro("neq"),
      gt: filtro("gt"),
      gte: filtro("gte"),
      lt: filtro("lt"),
      lte: filtro("lte"),
      is: filtro("is"),
      in: filtro("in"),
      not: filtro("not"),
      like: filtro("like"),
      ilike: filtro("ilike"),
      contains: filtro("contains"),
      or(expr) {
        q.filtros.push({ op: "or", campo: null, valores: [expr] });
        return api;
      },
      order(campo, opcoes) {
        q.ordem.push({ campo, ...(opcoes ?? {}) });
        return api;
      },
      limit(n) {
        q.limite = n;
        return api;
      },
      range(de, ate) {
        q.limite = ate - de + 1;
        return api;
      },
      maybeSingle() {
        q.single = true;
        return api;
      },
      single() {
        q.single = true;
        return api;
      },
      then(aoResolver, aoRejeitar) {
        chamadas.push(q);
        let r;
        try {
          r = responder(q) ?? {};
        } catch (e) {
          r = { data: null, error: { message: String(e?.message ?? e) } };
        }
        const resposta = {
          data: r.data ?? null,
          error: r.error ?? null,
          count: r.count ?? null,
        };
        // payload trafegado: é o que separa "1 requisição barata" de "1 requisição de 70 KiB".
        // head-count não traz linha nenhuma — por isso é a requisição mais barata que existe.
        q.bytes = q.head ? 0 : Buffer.byteLength(JSON.stringify(resposta.data ?? null), "utf8");
        return Promise.resolve(resposta).then(aoResolver, aoRejeitar);
      },
    };
    return api;
  }

  return {
    chamadas,
    /** total de requisições ao PostgREST até agora */
    get total() {
      return chamadas.length;
    },
    /** soma dos bytes de payload (head-counts contam zero) */
    get bytes() {
      return chamadas.reduce((s, c) => s + (c.bytes ?? 0), 0);
    },
    tocou(tabela) {
      return chamadas.some((c) => c.tabela === tabela);
    },
    leu(coluna) {
      return chamadas.some((c) => typeof c.colunas === "string" && c.colunas.split(",").includes(coluna));
    },
    resumo() {
      return chamadas.map((c) => `${c.tabela}${c.head ? " (head)" : `[${c.colunas ?? "*"}]`}`);
    },
    zerar() {
      chamadas.length = 0;
    },
    schema: (s) => ({ from: (t) => novaConsulta(s, t) }),
    from: (t) => novaConsulta("public", t),
    storage: {
      from: () => ({
        createSignedUrls: async (caminhos) => ({
          data: caminhos.map((path) => ({ path, signedUrl: `https://falso/${path}?token=fixo`, error: null })),
          error: null,
        }),
      }),
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  };
}
