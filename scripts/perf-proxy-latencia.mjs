/*
 * Proxy HTTP com latência artificial POR REQUEST — reproduz localmente o custo de rede
 * function→Supabase (iad1→us-west-2 ≈ 65ms; BR→us-west-2 ≈ 190ms) pra medição antes/depois
 * de profundidade serial de queries. Encaminha tudo pro Supabase LOCAL (kong :54421).
 *
 * Uso: DELAY_MS=65 PORTA=<sua porta livre> ALVO=http://127.0.0.1:<SUA_ME_API_PORT> node scripts/perf-proxy-latencia.mjs
 *
 * Sem default de PORTA nem de ALVO (F7): os antigos (54520/54421) eram da faixa compartilhada —
 * este processo ESCUTA numa porta e ENCAMINHA para outra; errar qualquer uma das duas é entrar no
 * caminho de rede de outro agente.
 */
import http from "node:http";

function exigir(nome, exemplo) {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`ABORTADO: ${nome} não está definida.  ex.: ${nome}=${exemplo}`);
    process.exit(2);
  }
  return valor;
}

const DELAY_MS = Number(process.env.DELAY_MS ?? 65);
const PORTA = Number(exigir("PORTA", "54640"));
const ALVO = exigir("ALVO", "http://127.0.0.1:<SUA_ME_API_PORT>");

const alvo = new URL(ALVO);
let contagem = 0;

http
  .createServer((req, res) => {
    contagem++;
    setTimeout(() => {
      const encaminhada = http.request(
        {
          hostname: alvo.hostname,
          port: alvo.port,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: `${alvo.hostname}:${alvo.port}` },
        },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        },
      );
      encaminhada.on("error", () => {
        res.writeHead(502);
        res.end("proxy: alvo indisponível");
      });
      req.pipe(encaminhada);
    }, DELAY_MS);
  })
  .listen(PORTA, () => {
    console.log(`proxy latência ${DELAY_MS}ms: http://127.0.0.1:${PORTA} → ${ALVO}`);
    setInterval(() => process.stdout.write(`\rrequests: ${contagem} `), 2000).unref();
  });
