/*
 * Medição E2E LOCAL do TTFB por rota (next start + Supabase local, opcionalmente atrás do
 * proxy de latência). Loga com usuário de TESTE LOCAL via @supabase/ssr (mesmo formato de
 * cookie do app) e mede TTFB (primeiro byte = quando a navegação responde) e TOTAL (stream
 * completo = dados na tela) de cada rota. NUNCA aponta pra produção.
 *
 * Uso: BASE=http://127.0.0.1:3101 SUPABASE_URL=http://127.0.0.1:54520 node scripts/perf-medir-rotas.mjs
 */
import { createServerClient } from "@supabase/ssr";

const BASE = process.env.BASE ?? "http://127.0.0.1:3101";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54520";
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"; // anon DEMO do supabase local — público, não é segredo
const EMAIL = process.env.PERF_EMAIL ?? "perf@meescuta.local";
const SENHA = process.env.PERF_SENHA ?? "perf-local-123";
const AMOSTRAS = Number(process.env.AMOSTRAS ?? 7);

// login com o MESMO client do app → cookies no formato exato do @supabase/ssr
const jar = new Map();
const supabase = createServerClient(SUPABASE_URL, ANON, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (error) {
  console.error("login local falhou:", error.message);
  process.exit(1);
}
const cookie = [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");

const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function medirRota(rota) {
  const ttfbs = [];
  const totais = [];
  let bytes = 0;
  let status = 0;
  for (let i = 0; i < AMOSTRAS; i++) {
    const t0 = performance.now();
    const r = await fetch(BASE + rota, { headers: { cookie }, redirect: "manual" });
    status = r.status;
    const leitor = r.body.getReader();
    let primeiro = null;
    let tam = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (primeiro === null) primeiro = performance.now() - t0;
      if (done) break;
      tam += value?.length ?? 0;
    }
    ttfbs.push(primeiro ?? performance.now() - t0);
    totais.push(performance.now() - t0);
    bytes = tam;
  }
  console.log(
    `${rota.padEnd(26)} status=${status}  TTFB p50=${mediana(ttfbs).toFixed(0).padStart(5)}ms  total p50=${mediana(totais).toFixed(0).padStart(5)}ms  max=${Math.max(...totais).toFixed(0).padStart(5)}ms  html=${(bytes / 1024).toFixed(0)}KB`,
  );
}

console.log(`base=${BASE} supabase=${SUPABASE_URL} amostras=${AMOSTRAS}`);
for (const rota of ["/funil", "/conversas", "/timeline", "/fila", "/", "/configuracoes/membros"]) {
  await medirRota(rota);
}
