// bateria-mutacao.mjs — motor das BATERIAS DE MUTAÇÃO exigidas pela ARB-23.
//
// A regra: nenhum portão é aceito sem UMA MUTAÇÃO POR ASSERÇÃO, cada uma provando que aquela
// asserção fica VERMELHA quando o que ela protege é quebrado. Portão verde na primeira tentativa
// é ausência de informação, não prova (origem: E-014 e E-021).
//
// ── O QUE MUDOU NESTA VERSÃO, E POR QUÊ (veredicto do Portão no R16-23) ────────────────────────
// O motor anterior tinha quatro buracos, e um deles deixou uma mutação PLANTADA em
// dashboard-calculos.ts quando o Portão matou a bateria por timeout. Instrumento que suja o repo
// quando morre é pior que instrumento nenhum: o próximo a rodar mede o defeito plantado.
//
//   1. BASELINE. O portão é executado SEM mutação nenhuma antes de tudo. Se ele já estiver
//      vermelho, toda mutação "dispararia" — pelo motivo errado. Baseline vermelho RECUSA (rc=2),
//      não reprova: não há o que medir.
//   2. RESTAURAÇÃO NÃO-TAUTOLÓGICA. O sha conferido no fim é comparado com o sha PRÉ-MUTAÇÃO,
//      lido do disco antes de qualquer escrita — não com o sha do que a própria restauração
//      acabou de escrever, que sempre bate consigo mesmo e não prova nada. E antes disso confere
//      que a mutação REALMENTE mudou o arquivo: troca que não altera bytes não é mutação, é no-op
//      disfarçado de prova.
//   3. FINALLY SEMPRE, mais guardas de processo (SIGINT/SIGTERM/uncaughtException) e timeout por
//      execução. Morrer no meio passa a restaurar; travar passa a virar falha, não faca.
//   4. ÁRVORE LIMPA nas duas pontas: recusa começar com `git status --porcelain` sujo e ASSERTA
//      porcelain vazio no fim. É a única prova de que nada ficou plantado.
//
// E o veredito é fechado: QUALQUER mutação que não dispare (ou que aborte) faz a bateria sair
// VERMELHA com rc=1. Bateria nunca devolve 0 com mutação pendente.

import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 15 * 60 * 1000;

const sha = (caminho) => createHash("sha256").update(readFileSync(caminho)).digest("hex");

const porcelain = () =>
  execSync("git status --porcelain", { cwd: RAIZ, encoding: "utf8" }).trim();

function executar(comando) {
  try {
    return {
      rc: 0,
      saida: execFileSync(comando[0], comando.slice(1), {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: TIMEOUT_MS,
        cwd: RAIZ,
      }),
    };
  } catch (erro) {
    return {
      rc: erro.status ?? (erro.killed ? 124 : -1),
      saida: `${erro.stdout ?? ""}${erro.stderr ?? ""}`,
      matou: Boolean(erro.killed),
    };
  }
}

/**
 * @param {object} cfg
 * @param {string} cfg.nome
 * @param {string[]} cfg.comando        comando do portão, já quebrado em argv
 * @param {Array<{id:string, protege:string, arquivo:string, de:string, para:string,
 *                esperaVermelho:RegExp, rcEsperado?:number}>} cfg.mutacoes
 */
export async function rodarBateria({ nome, comando, mutacoes }) {
  console.log(`\nBATERIA DE MUTAÇÃO · ${nome} — ${mutacoes.length} mutações (ARB-23)`);
  console.log(`  comando do portão: ${comando.join(" ")}`);

  // ── guarda 0 · árvore limpa na entrada ──────────────────────────────────────────────────
  const sujeiraInicial = porcelain();
  if (sujeiraInicial) {
    console.error(
      `\nBATERIA ${nome} · RECUSADA — a árvore não está limpa. A bateria escreve nos arquivos ` +
        `REAIS, então ela só pode rodar sobre um estado que sabe restaurar. Commite ou guarde:\n` +
        sujeiraInicial,
    );
    process.exit(2);
  }

  // ── guarda 1 · restauração garantida mesmo se o processo morrer ─────────────────────────
  const emAberto = new Map(); // arquivo → conteúdo original
  const restaurarTudo = () => {
    for (const [arquivo, conteudo] of emAberto) {
      try {
        writeFileSync(arquivo, conteudo);
      } catch {
        /* melhor esforço: se nem isso der, o porcelain no fim acusa */
      }
    }
    emAberto.clear();
  };
  const morrerLimpo = (sinal) => () => {
    restaurarTudo();
    console.error(`\nBATERIA ${nome} · INTERROMPIDA (${sinal}) — arquivos restaurados.`);
    process.exit(130);
  };
  process.on("SIGINT", morrerLimpo("SIGINT"));
  process.on("SIGTERM", morrerLimpo("SIGTERM"));
  process.on("uncaughtException", (e) => {
    restaurarTudo();
    console.error(`\nBATERIA ${nome} · ERRO NÃO TRATADO — arquivos restaurados.\n${e?.stack ?? e}`);
    process.exit(3);
  });

  // ── guarda 2 · BASELINE: o portão tem de estar VERDE antes de qualquer mutação ──────────
  const base = executar(comando);
  if (base.rc !== 0) {
    console.error(
      `\nBATERIA ${nome} · RECUSADA — baseline VERMELHO (rc=${base.rc}). Com o portão já ` +
        `reprovando, toda mutação "dispararia" pelo motivo errado. Últimas linhas:\n` +
        base.saida.trim().split("\n").slice(-12).join("\n"),
    );
    process.exit(2);
  }
  console.log(`  baseline: portão VERDE sem mutação (rc=0)\n`);

  // ── as mutações ─────────────────────────────────────────────────────────────────────────
  const resultados = [];
  for (const m of mutacoes) {
    const shaPre = sha(m.arquivo); // ← lido ANTES de qualquer escrita: é a referência real
    const original = readFileSync(m.arquivo, "utf8");

    const ocorrencias = original.split(m.de).length - 1;
    if (ocorrencias !== 1) {
      resultados.push({
        ...m,
        veredito: "ABORTADA",
        detalhe: `o trecho aparece ${ocorrencias}x em ${m.arquivo} — mutação ambígua não prova nada`,
      });
      continue;
    }

    let rc = 0;
    let saida = "";
    let shaMutado = null;
    emAberto.set(m.arquivo, original);
    try {
      writeFileSync(m.arquivo, original.replace(m.de, m.para));
      shaMutado = sha(m.arquivo);
      if (shaMutado !== shaPre) {
        const r = executar(comando);
        rc = r.rc;
        saida = r.saida;
      }
    } finally {
      writeFileSync(m.arquivo, original);
      emAberto.delete(m.arquivo);
    }
    const shaPos = sha(m.arquivo); // ← comparado com shaPre, não com o que acabamos de escrever

    if (shaMutado === shaPre) {
      resultados.push({
        ...m,
        veredito: "ABORTADA",
        detalhe: "a troca não alterou um byte — no-op disfarçado de mutação",
      });
      continue;
    }

    const disparou = m.esperaVermelho.test(saida);
    const reprovou = m.rcEsperado != null ? rc === m.rcEsperado : rc !== 0;
    const restaurou = shaPos === shaPre;
    resultados.push({
      ...m,
      rc,
      veredito: disparou && reprovou && restaurou ? "DISPAROU" : "NÃO DISPAROU",
      detalhe: !restaurou
        ? `arquivo NÃO voltou ao original (sha pré ${shaPre.slice(0, 12)} → pós ${shaPos.slice(0, 12)})`
        : !reprovou
          ? `o portão não reprovou (rc=${rc}) — a asserção não protege o que diz proteger`
          : !disparou
            ? `reprovou (rc=${rc}) mas por OUTRO motivo — ${m.esperaVermelho} não apareceu`
            : `rc=${rc}, asserção certa em vermelho, arquivo restaurado (sha confere com o pré)`,
    });
  }

  for (const r of resultados) {
    const marca = r.veredito === "DISPAROU" ? "OK  " : "FALHA";
    console.log(`  ${marca} · ${r.id} protege "${r.protege}"`);
    console.log(`         ${r.detalhe}`);
  }

  // ── guarda 3 · nada ficou plantado ──────────────────────────────────────────────────────
  const sujeiraFinal = porcelain();
  console.log("");
  if (sujeiraFinal) {
    console.log(
      `BATERIA ${nome} · VERMELHA — a bateria DEIXOU RASTRO na árvore. Isto é falha do ` +
        `instrumento, não do produto:\n${sujeiraFinal}`,
    );
    process.exit(1);
  }
  console.log("  árvore limpa no fim (git status --porcelain vazio) — nada ficou plantado");

  const pendentes = resultados.filter((r) => r.veredito !== "DISPAROU");
  if (pendentes.length) {
    console.log(
      `\nBATERIA ${nome} · VERMELHA — ${pendentes.length}/${resultados.length} mutações não ` +
        "disparam. Asserção que não fica vermelha quando o defeito volta é decoração.",
    );
    process.exit(1);
  }
  console.log(
    `\nBATERIA ${nome} · VERDE — ${resultados.length}/${resultados.length} mutações disparam a ` +
      "asserção certa, com baseline verde antes e árvore limpa depois.",
  );
  process.exit(0);
}
