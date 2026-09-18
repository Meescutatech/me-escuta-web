import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import * as canais from "../components/configuracoes/regras/canais.ts";

/*
 * CARD 2j · A TELA CONTA DUAS VERDADES, NÃO UMA — 18/09/2026.
 *
 * O defeito, medido em `components/configuracoes/tabela-canais.tsx:588-598`: a célula "Estado" do
 * canal Lite mostra SÓ o status da sessão (Conectado / Aguardando o QR / Banido / Desconectado),
 * enquanto a do canal oficial mostra SÓ `canal.ativo` (Ativo / Ligado / Desligado). Duas coisas
 * independentes desenhadas como se fossem uma:
 *
 *   • a SESSÃO está viva  — o WhatsApp do aparelho está pareado e de pé no WuzAPI;
 *   • o CANAL está ligado — `core.canal_whatsapp.ativo`, que é o que decide se o runtime ingere e
 *     se o número entra no seletor "Número desta conversa" (`api.canais_de_envio`: `where k.ativo`).
 *
 * Um canal ligado com a sessão caída e um canal desligado com a sessão de pé desenham IGUAL hoje. E
 * foi exatamente essa ambiguidade que fez o relato de 17/09 ("a tela diz Conectado e o número não
 * aparece para enviar") custar meio dia de medição.
 *
 * ⚠️ O CASO QUE NINGUÉM ESPERA, e que o card 2j existe para nomear: o container do WuzAPI não tem
 * volume (medido 18/09 — `MOUNTS=[]`). O SQLite das sessões é recriado a cada deploy do WuzAPI (não
 * do runtime), então toda sessão morre nesse deploy enquanto `pareado_em` sobrevive na projeção. A tela não pode
 * cravar a frase "a sessão cai no deploy" — no dia em que o volume for montado ela vira mentira. A
 * frase tem de sair do FATO: já foi pareado antes × está desconectado agora.
 *
 * KISS (decisão do Diogo, 18/09): este card só MOSTRA. Ligar/desligar pela tela, reparear, derrubar
 * a sessão e o batimento de uptime ficam de fora — nada disso entra aqui.
 */

type Qualquer = Record<string, any>;
const r = canais as unknown as Qualquer;

const TABELA = "components/configuracoes/tabela-canais.tsx";
const PAGINA = "app/(app)/configuracoes/canais/page.tsx";

function ler(caminho: string): string {
  return readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8");
}

function regra(nome: string) {
  const f = r[nome];
  assert.equal(typeof f, "function", `falta a regra pura \`${nome}\` em components/configuracoes/regras/canais.ts`);
  return f;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// A REGRA PURA — os dois selos, e a frase que diz se o número aparece para enviar
// ══════════════════════════════════════════════════════════════════════════════════════════════

test("2j.1 · conectado E ligado: os dois selos verdes, e o número aparece para enviar", () => {
  const f = regra("estadoLiteNaTela");
  const e = f({ ativo: true, statusSessao: "conectado", pareadoEm: "2026-09-18T10:00:00Z" });
  assert.equal(e.sessao.tom, "ok");
  assert.equal(e.canal.tom, "ok");
  assert.equal(e.apareceParaEnviar, true);
  assert.match(e.canal.txt, /ligado/i);
});

test("2j.2 · 🔴 O RELATO DE 17/09: sessão conectada e canal DESLIGADO não podem desenhar igual", () => {
  const f = regra("estadoLiteNaTela");
  const ligado = f({ ativo: true, statusSessao: "conectado", pareadoEm: "2026-09-18T10:00:00Z" });
  const desligado = f({ ativo: false, statusSessao: "conectado", pareadoEm: "2026-09-18T10:00:00Z" });

  // a sessão é a MESMA nos dois — é o canal que difere, e é isso que a tela escondia
  assert.equal(desligado.sessao.txt, ligado.sessao.txt);
  assert.notEqual(desligado.canal.txt, ligado.canal.txt);
  assert.equal(desligado.apareceParaEnviar, false);
  assert.match(desligado.canal.txt, /desligado/i);
  assert.match(desligado.porQue, /desligado/i, "a tela não diz POR QUE o número não aparece para enviar");
});

test("2j.3 · 🔴 canal LIGADO com a sessão CAÍDA: aparece no seletor, mas o envio vai falhar — e a tela avisa", () => {
  const f = regra("estadoLiteNaTela");
  const e = f({ ativo: true, statusSessao: "desconectado", pareadoEm: "2026-09-18T10:00:00Z" });

  // `api.canais_de_envio` filtra só por `ativo`: o número ESTÁ no seletor mesmo com a sessão morta.
  // Esconder isso seria a tela mentindo pelo outro lado.
  assert.equal(e.apareceParaEnviar, true);
  assert.equal(e.sessao.tom === "ok", false, "sessão caída não pode ter o tom de tudo certo");
  assert.match(e.porQue, /sess[ãa]o/i, "a tela não avisa que o envio vai falhar com a sessão caída");
});

test("2j.4 · pareado ANTES e desconectado AGORA: a tela deriva do fato que precisa parear de novo", () => {
  const f = regra("estadoLiteNaTela");
  const caiu = f({ ativo: true, statusSessao: "desconectado", pareadoEm: "2026-09-18T10:00:00Z" });
  const nunca = f({ ativo: false, statusSessao: "desconectado", pareadoEm: null });

  assert.match(caiu.porQue, /parear de novo|parear novamente|repare/i, "não diz que precisa parear de novo");
  assert.doesNotMatch(
    nunca.porQue ?? "",
    /parear de novo|parear novamente/i,
    "número que NUNCA pareou não pode ser convidado a parear 'de novo'",
  );
});

test("2j.5 · desligado e nunca pareado: nada de verde, e não aparece para enviar", () => {
  const f = regra("estadoLiteNaTela");
  const e = f({ ativo: false, statusSessao: "desconectado", pareadoEm: null });
  assert.equal(e.apareceParaEnviar, false);
  assert.equal(e.sessao.tom === "ok", false);
  assert.equal(e.canal.tom === "ok", false);
});

test("2j.6 · aguardando o QR e banido continuam com o próprio nome — o card não apaga estado que existe", () => {
  const f = regra("estadoLiteNaTela");
  assert.match(f({ ativo: false, statusSessao: "aguardando_qr", pareadoEm: null }).sessao.txt, /QR/i);
  const banido = f({ ativo: true, statusSessao: "banido", pareadoEm: "2026-09-18T10:00:00Z" });
  assert.match(banido.sessao.txt, /banido/i);
  assert.equal(banido.sessao.tom, "ruim");
});

test("2j.7 · a regra é pura: mesma entrada, mesma saída, e não lê relógio nem rede", () => {
  const f = regra("estadoLiteNaTela");
  const entrada = { ativo: true, statusSessao: "conectado", pareadoEm: "2026-09-18T10:00:00Z" };
  assert.deepEqual(f(entrada), f(entrada));
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// A FIAÇÃO — a tela tem de USAR a regra, senão ela é só um arquivo bonito
// ══════════════════════════════════════════════════════════════════════════════════════════════

test("2j.8 · a tabela usa estadoLiteNaTela para o Lite, em vez do ternário que mostra um estado só", () => {
  const tabela = ler(TABELA);
  assert.match(tabela, /estadoLiteNaTela\s*\(/, `${TABELA} não chama a regra estadoLiteNaTela`);
});

test("2j.9 · a tabela desenha OS DOIS selos do Lite — o do canal não pode ficar de fora", () => {
  // Janela pelo FECHAMENTO REAL da célula, não por N caracteres: o cálculo mora ~200 linhas acima
  // do render, e uma janela fixa a partir da chamada mede a distância entre os dois, não o desenho.
  // É o erro nº 6 do registro deste repo, e ele reapareceu aqui na primeira escrita desta guarda.
  const tabela = ler(TABELA);
  const i = tabela.indexOf("{estadoLite ? (");
  assert.notEqual(i, -1, "a célula não tem o ramo do Lite — a tabela voltou a mostrar um estado só");
  const fim = tabela.indexOf("</TableCell>", i);
  assert.notEqual(fim, -1, "célula sem fechamento — reescrever esta guarda");
  const celula = tabela.slice(i, fim);

  assert.match(celula, /estadoLite\.sessao\.(txt|tom)/, "o selo da SESSÃO não é desenhado na célula");
  assert.match(celula, /estadoLite\.canal\.(txt|tom)/, "o selo do CANAL não é desenhado na célula");
  assert.match(celula, /estadoLite\.porQue/, "a frase que diz se o número aparece para enviar não é desenhada");
});

test("2j.10 · 🔴 `viva: false` cravado na página sai — campo que a tela não sabe preencher é mentira", () => {
  const pagina = ler(PAGINA);
  assert.doesNotMatch(
    pagina,
    /viva\s*:\s*false/,
    `${PAGINA} ainda crava \`viva: false\` para todo canal Lite — a página não lê essa coluna, então o campo afirma o que ninguém mediu`,
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REVISÃO DE 18/09 — o status da sessão é uma FOTO, não um batimento
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `ops.sessao_canal.status` só é escrito quando alguém chama a rota de sessão (abre o painel). Não
// há batimento de fundo. Depois de um deploy do WuzAPI a sessão morre e a linha continua dizendo
// `conectado` — a primeira versão deste card pintava os dois selos de verde e escondia a frase: a
// tela toda verde com a sessão morta, que é a mentira que o card existe para eliminar. O conserto
// KISS (sem polling, sem batimento): dizer QUANDO aquilo foi lido. A decisão do Diogo foi "banco +
// visto às HH:MM".

test("2j.11 · 🔴 a sessão diz QUANDO foi lida — conectado sem hora é afirmação sem data", () => {
  const f = regra("estadoLiteNaTela");
  const e = f({
    ativo: true,
    statusSessao: "conectado",
    pareadoEm: "2026-09-18T10:00:00Z",
    vistoEm: "2026-09-18T17:32:00Z",
  });
  assert.equal(typeof e.visto, "string", "a regra não devolve quando a sessão foi lida");
  assert.match(e.visto, /14:32/, "a hora da leitura não sai no fuso de Brasília (17:32Z = 14:32)");
});

test("2j.12 · sem leitura nenhuma, a tela não inventa hora", () => {
  const f = regra("estadoLiteNaTela");
  const e = f({ ativo: true, statusSessao: "conectado", pareadoEm: "2026-09-18T10:00:00Z", vistoEm: null });
  assert.equal(e.visto, null);
});

test("2j.13 · 🔴 status ausente (leitura falhou) com canal já pareado NÃO vira 'sessão caída'", () => {
  // `page.tsx` recebe `sessao: null` quando a view não responde. A primeira versão tratava isso
  // como desconectado e afirmava "o envio vai falhar até parear de novo": o "não sei" virava "caiu".
  const f = regra("estadoLiteNaTela");
  const e = f({ ativo: true, statusSessao: null, pareadoEm: "2026-09-18T10:00:00Z" });
  assert.doesNotMatch(e.sessao.txt, /ca[ií]da/i, "sem leitura, a tela afirma que a sessão caiu");
  assert.doesNotMatch(e.porQue, /parear de novo/i, "sem leitura, a tela manda parear de novo");
  assert.notEqual(e.sessao.tom, "ok");
});

test("2j.14 · a página entrega a hora da leitura à tabela, e a célula a desenha", () => {
  const pagina = ler(PAGINA);
  // ancorado na ATRIBUIÇÃO, não no nome: passar `qr_expira_em` como hora da leitura mantinha o texto
  // `atualizado_em` em outro lugar do arquivo e deixava a guarda verde (achado do revisor, 18/09).
  assert.match(
    pagina,
    /vistoEm\s*:\s*sessao\.atualizado_em/,
    `${PAGINA} não entrega \`atualizado_em\` como hora da leitura — a tela não tem como dizer quando leu`,
  );

  const tabela = ler(TABELA);
  assert.match(tabela, /vistoEm\s*:\s*canal\.sessao\?\.vistoEm/, "a tabela não passa a hora da leitura para a regra");
  const i = tabela.indexOf("{estadoLite ? (");
  const celula = tabela.slice(i, tabela.indexOf("</TableCell>", i));
  assert.match(celula, /estadoLite\.visto/, "a célula não desenha quando a sessão foi lida");
});
