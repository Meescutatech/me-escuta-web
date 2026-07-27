/*
 * SENTINELA DE CONEXÃO (F7 · R16-08) — prova que um script abortou ANTES de tocar a rede.
 *
 * Carregue com `--import` na frente do script sob teste:
 *
 *     node --import ./scripts/sentinela-conexao.mjs scripts/perf-seed-local.mjs
 *
 * Ele instrumenta as duas portas de saída de todo cliente Postgres/HTTP em node — `net.connect` e
 * `tls.connect`. Na primeira tentativa de conexão, imprime `SENTINELA: TENTOU CONECTAR …` e mata o
 * processo com código 99.
 *
 * POR QUE ISSO EXISTE (defeito B-4 da AUDITORIA-SPECS-FASE1). O portão do F7 dizia provar
 * "o seed aborta antes de conectar" com:
 *
 *     ! ( env -u DATABASE_URL node scripts/perf-seed-local.mjs 2>&1 | grep -q 'connect' )
 *
 * O que ele afirma é outra coisa: *"a saída não contém a substring `connect`"*. Um seed que
 * conectasse no 54422 do vizinho e escrevesse lá — o incidente literal das 21:59 que o item existe
 * para matar — passa nesse portão desde que não imprima essa palavra. Aqui a tentativa de conexão
 * é interceptada no ponto onde ela de fato acontece, e o veredito é o código de saída.
 *
 * O sentinela é verificado antes de ser usado (ele também é um vigia, e vigia não testado não vale
 * nada): o portão roda um script que SABIDAMENTE conecta e exige que o código 99 apareça. Sem esse
 * controle positivo, "não acusou" não distinguiria "não conectou" de "sentinela quebrado".
 */

import net from "node:net";
import tls from "node:tls";

function descrever(args) {
  const primeiro = args[0];
  if (typeof primeiro === "object" && primeiro !== null) {
    const { host, port, path } = primeiro;
    return path ? `unix:${path}` : `${host ?? "?"}:${port ?? "?"}`;
  }
  if (typeof primeiro === "number") return `${args[1] ?? "localhost"}:${primeiro}`;
  return String(primeiro);
}

function acusar(via, args) {
  console.error(`SENTINELA: TENTOU CONECTAR via ${via} → ${descrever(args)}`);
  process.exit(99);
}

const netConnect = net.connect;
net.connect = function (...args) {
  acusar("net.connect", args);
  return netConnect.apply(this, args);
};
net.createConnection = net.connect;

const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  acusar("net.Socket#connect", args);
  return socketConnect.apply(this, args);
};

const tlsConnect = tls.connect;
tls.connect = function (...args) {
  acusar("tls.connect", args);
  return tlsConnect.apply(this, args);
};
