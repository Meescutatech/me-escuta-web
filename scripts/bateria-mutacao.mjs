// bateria-mutacao.mjs — motor das BATERIAS DE MUTAÇÃO exigidas pela ARB-23.
//
// A regra: nenhum portão é aceito sem UMA MUTAÇÃO POR ASSERÇÃO, cada uma provando que aquela
// asserção fica VERMELHA quando o que ela protege é quebrado. Portão verde na primeira tentativa
// é ausência de informação, não prova (origem: E-014 e E-021, o mesmo buraco achado duas vezes).
//
// Cada mutação aqui:
//   1. carimba o sha256 do arquivo ANTES;
//   2. aplica uma troca ÚNICA no arquivo REAL (se o trecho não for único, aborta — mutação
//      ambígua não prova nada);
//   3. roda o comando do portão e exige rc != 0 E a asserção esperada em VERMELHO — reprovar por
//      outro motivo não conta, senão a bateria fica verde por acidente;
//   4. restaura e CONFERE o sha256 contra o de antes.
//
// A conferência de restauração é a parte que ninguém lembra e é a que evita deixar o repo sujo:
// se qualquer arquivo não voltar byte a byte, a bateria REPROVA mesmo que todas as mutações
// tenham disparado.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const sha = (caminho) => createHash("sha256").update(readFileSync(caminho)).digest("hex");

/**
 * @param {object} cfg
 * @param {string} cfg.nome            rótulo da bateria (ex.: "F21")
 * @param {string[]} cfg.comando       comando do portão, já quebrado em argv
 * @param {Array<{id:string, protege:string, arquivo:string, de:string, para:string,
 *                esperaVermelho:RegExp, rcEsperado?:number}>} cfg.mutacoes
 */
export async function rodarBateria({ nome, comando, mutacoes }) {
  console.log(`\nBATERIA DE MUTAÇÃO · ${nome} — ${mutacoes.length} mutações (ARB-23)`);
  console.log(`  comando do portão: ${comando.join(" ")}\n`);

  const resultados = [];
  for (const m of mutacoes) {
    const antes = sha(m.arquivo);
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

    writeFileSync(m.arquivo, original.replace(m.de, m.para));
    let rc = 0;
    let saida = "";
    try {
      saida = execFileSync(comando[0], comando.slice(1), {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (erro) {
      rc = erro.status ?? -1;
      saida = `${erro.stdout ?? ""}${erro.stderr ?? ""}`;
    }
    writeFileSync(m.arquivo, original);
    const depois = sha(m.arquivo);

    const disparou = m.esperaVermelho.test(saida);
    const reprovou = m.rcEsperado != null ? rc === m.rcEsperado : rc !== 0;
    const restaurou = antes === depois;
    resultados.push({
      ...m,
      rc,
      veredito: disparou && reprovou && restaurou ? "DISPAROU" : "NÃO DISPAROU",
      detalhe:
        !restaurou
          ? `arquivo NÃO voltou ao original (sha ${antes.slice(0, 12)} → ${depois.slice(0, 12)})`
          : !reprovou
            ? `o portão não reprovou (rc=${rc}) — a asserção não protege o que diz proteger`
            : !disparou
              ? `reprovou (rc=${rc}) mas por OUTRO motivo — ${m.esperaVermelho} não apareceu`
              : `rc=${rc}, asserção certa em vermelho, arquivo restaurado`,
    });
  }

  for (const r of resultados) {
    const marca = r.veredito === "DISPAROU" ? "OK  " : "FALHA";
    console.log(`  ${marca} · ${r.id} protege "${r.protege}"`);
    console.log(`         ${r.detalhe}`);
  }

  const falhas = resultados.filter((r) => r.veredito !== "DISPAROU");
  console.log("");
  if (falhas.length) {
    console.log(
      `BATERIA ${nome} · VERMELHA — ${falhas.length}/${resultados.length} mutações não disparam. ` +
        "Asserção que não fica vermelha quando o defeito volta é decoração.",
    );
    process.exit(1);
  }
  console.log(
    `BATERIA ${nome} · VERDE — ${resultados.length}/${resultados.length} mutações disparam a ` +
      "asserção certa, e todos os arquivos voltaram byte a byte.",
  );
  process.exit(0);
}
