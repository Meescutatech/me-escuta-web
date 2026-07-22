/*
 * Proxy HTTP com latência artificial POR REQUEST — reproduz localmente o custo de rede
 * function→Supabase (iad1→us-west-2 ≈ 65ms; BR→us-west-2 ≈ 190ms) pra medição antes/depois
 * de profundidade serial de queries. Encaminha tudo pro Supabase LOCAL (kong :54421).
 *
 * Uso: DELAY_MS=65 PORTA=54520 node scripts/perf-proxy-latencia.mjs
 */
import http from "node:http";

const DELAY_MS = Number(process.env.DELAY_MS ?? 65);
const PORTA = Number(process.env.PORTA ?? 54520);
const ALVO = process.env.ALVO ?? "http://127.0.0.1:54421";

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
