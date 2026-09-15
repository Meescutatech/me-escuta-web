import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVISO_QR_SEM_PRAZO,
  BORDA_MODULOS,
  ECC_QR,
  TEXTO_QUADRO_CONECTADO,
  TEXTO_QUADRO_IMAGEM_PERDIDA,
  TEXTO_QUADRO_SEM_CODIGO,
  caminhoDeMatriz,
  decidirQuadro,
  desenharQr,
  pixelsPorModulo,
} from "../components/configuracoes/regras/qr-pareamento.ts";
import {
  imagemQrSegura,
  podeCriarSessao,
  validadeQr,
} from "../components/configuracoes/regras/lite-sessao.ts";
import type { Canal } from "../components/configuracoes/regras/canais.ts";

/*
 * F11 — o DESENHO do QR de pareamento. Os quatro jeitos de esta tela falhar em silêncio, que são
 * exatamente os quatro blocos abaixo:
 *   1. o desenho quebrar a tela e levar junto o código legível, que é o plano B da pessoa;
 *   2. o QR sair sem a zona de silêncio e o aparelho não ler, sem ninguém entender por quê;
 *   3. o módulo sair pequeno demais para uma câmera de celular na mão;
 *   4. o caminho SVG desenhar coisa diferente da matriz — QR errado lê e é RECUSADO pelo aparelho,
 *      que é pior que QR que não lê.
 */

/** Um código de pareamento no formato real do WhatsApp multi-device: 4 segmentos por vírgula. */
/** 288px do quadro menos 2×10px de respiro (`p-2.5`) = os pixels que sobram para o QR. */
const UTEIS_PX = 288 - 2 * 10;

/** Um PNG 1×1 de verdade, em `data:` — a forma exata em que o WuzAPI manda o QR. */
const IMAGEM_REAL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const CODIGO_REAL =
  "2@n7Xk9pQwErTyUiOpAsDfGhJkLzXcVbNm1234567890abcd=," +
  "kJh8Gf6Dq2Ws4Ed5Rf7Tg9Yh0Uj1Ik2Ol3Pm4Qn5Ro6Sp7Tq8=," +
  "aZ1sX2dC3fV4gB5hN6jM7kL8pO9iU0yT1rE2wQ3zA4xS5cD6=," +
  "9wErTyUiOpAsDfGhJkLzXcVbNmQwErTyUiOpAsDfGhJkLzX=";

// ─────────────────────────── 1. falha devolve null, nunca lança ───────────────────────────

test("código vazio, nulo ou só espaço NÃO desenha — e não lança", () => {
  assert.equal(desenharQr(null), null);
  assert.equal(desenharQr(undefined), null);
  assert.equal(desenharQr(""), null);
  assert.equal(desenharQr("   \n  "), null);
});

test("payload que estoura a versão 40 devolve null em vez de derrubar a tela", () => {
  // sem o try/catch de `desenharQr` isto é um RangeError('Data too long') dentro do render, e o
  // componente inteiro morre — a pessoa perderia também o código em texto.
  assert.equal(desenharQr("x".repeat(10_000)), null);
});

// ─────────────────────────── 2. a zona de silêncio é do SVG ───────────────────────────

test("a zona de silêncio tem 4 módulos nos QUATRO lados (ISO/IEC 18004)", () => {
  assert.equal(BORDA_MODULOS, 4);
  // conferido pela GEOMETRIA do desenho, não pela opção passada ao codificador: o que o aparelho
  // enxerga é o branco em volta do módulo mais externo, não o nome do parâmetro.
  for (const codigo of ["a", CODIGO_REAL]) {
    const d = desenharQr(codigo)!;
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (const m of d.caminho.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      const x = Number(m[1]), y = Number(m[2]), largura = Number(m[3]);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + largura);
      maxY = Math.max(maxY, y + 1);
    }
    assert.equal(minX, BORDA_MODULOS, "zona de silêncio curta à esquerda");
    assert.equal(minY, BORDA_MODULOS, "zona de silêncio curta em cima");
    assert.equal(d.lado - maxX, BORDA_MODULOS, "zona de silêncio curta à direita");
    assert.equal(d.lado - maxY, BORDA_MODULOS, "zona de silêncio curta embaixo");
  }
});

test("o viewBox é o lado em MÓDULOS — é o que faz a borda escalar junto com o quadro", () => {
  const d = desenharQr(CODIGO_REAL)!;
  // qualquer coordenada do caminho tem de caber no viewBox `0 0 lado lado`.
  for (const m of d.caminho.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    assert.ok(Number(m[1]) + Number(m[3]) <= d.lado, "corrida horizontal vaza o viewBox");
    assert.ok(Number(m[2]) < d.lado, "linha fora do viewBox");
  }
});

// ─────────────────────────── 3. tamanho de módulo escaneável ───────────────────────────

test("correção de erro é L — e é o que segura o módulo grande", () => {
  assert.equal(ECC_QR, "L");
});

test("no quadro de 288px o código real dá pelo menos 3px por módulo", () => {
  const d = desenharQr(CODIGO_REAL)!;
  const px = pixelsPorModulo(UTEIS_PX, d.lado);
  assert.ok(px >= 3, `só ${px.toFixed(2)}px por módulo em ${d.lado} módulos — câmera erra abaixo de 3`);
  // o quadro cresceu de 264 para 288px para o PNG de 256px do provedor caber SEM reamostragem; o
  // desenho ganhou de carona. Se alguém encolher o quadro de volta, este número denuncia.
  assert.ok(px > 4, `${px.toFixed(2)}px por módulo — o quadro de 288px deveria dar ~4,4`);
});

test("mesmo um código bem mais longo que o real continua acima do piso de 3px", () => {
  const d = desenharQr(CODIGO_REAL + "," + CODIGO_REAL)!;
  const px = pixelsPorModulo(UTEIS_PX, d.lado);
  assert.ok(px >= 3, `${px.toFixed(2)}px por módulo em ${d.lado} módulos`);
});

test("o PNG de 256px do provedor cabe INTEIRO nos pixels úteis — nada é reamostrado", () => {
  // é o motivo do quadro de 288px. `qrcode.Encode(evt.Code, …, 256)` no `wmiau.go` do provedor sai
  // com 256px de lado; a tela põe a imagem com `max-h-full max-w-full`, que só ENCOLHE. Com 268
  // úteis ela nunca encolhe, e a beira do módulo chega à câmera como saiu do codificador.
  assert.ok(UTEIS_PX >= 256, `${UTEIS_PX}px úteis não cabem o PNG de 256px do provedor`);
});

test("pixelsPorModulo não divide por zero nem devolve NaN", () => {
  assert.equal(pixelsPorModulo(244, 0), 0);
  assert.equal(pixelsPorModulo(Number.NaN, 57), 0);
});

// ─────────────────────────── 4. o caminho é a matriz, módulo a módulo ───────────────────────────

test("matriz toda branca não vira caminho — e não vira QR", () => {
  assert.equal(caminhoDeMatriz([[false, false], [false, false]]), "");
});

test("módulos vizinhos na mesma linha viram UMA corrida, não três retângulos", () => {
  // é o que derruba ~1.600 nós de DOM para algumas centenas a cada redesenho de 5 s.
  assert.equal(caminhoDeMatriz([[true, true, true]]), "M0 0h3v1h-3z");
});

test("corridas separadas por um módulo branco não se fundem", () => {
  assert.equal(caminhoDeMatriz([[true, false, true]]), "M0 0h1v1h-1zM2 0h1v1h-1z");
});

test("cada linha começa do zero — corrida NÃO atravessa a quebra de linha", () => {
  // se atravessasse, o QR sairia deslocado e o aparelho recusaria o pareamento sem dizer por quê.
  assert.equal(caminhoDeMatriz([[true], [true]]), "M0 0h1v1h-1zM0 1h1v1h-1z");
});

test("linha ausente ou irregular não lança — a matriz do provedor não é contrato nosso", () => {
  assert.doesNotThrow(() => caminhoDeMatriz([[true], undefined as never, [false, true]]));
});

test("o caminho reconstrói EXATAMENTE a matriz que recebeu", () => {
  // a prova que importa: desenhar módulo errado produz um QR que o aparelho LÊ e RECUSA.
  const matriz = [
    [true, false, true, true],
    [false, false, false, false],
    [true, true, false, true],
  ];
  const lidos = new Set<string>();
  for (const m of caminhoDeMatriz(matriz).matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    const [x, y, largura] = [Number(m[1]), Number(m[2]), Number(m[3])];
    for (let i = 0; i < largura; i++) lidos.add(`${x + i},${y}`);
  }
  for (let y = 0; y < matriz.length; y++) {
    for (let x = 0; x < matriz[y].length; x++) {
      assert.equal(lidos.has(`${x},${y}`), matriz[y][x], `módulo ${x},${y} saiu trocado`);
    }
  }
});

test("o mesmo código desenha sempre igual — o relê de 5 s não pode piscar QR diferente", () => {
  assert.deepEqual(desenharQr(CODIGO_REAL), desenharQr(CODIGO_REAL));
});

test("espaço em volta do código é aparado — base64 não tem espaço, quebra de linha mudaria o QR", () => {
  assert.deepEqual(desenharQr(`\n ${CODIGO_REAL} \n`), desenharQr(CODIGO_REAL));
});

// ═══════════════ 5. AS TRÊS INVARIANTES DA TELA ═══════════════
//
// `decidirQuadro` existe para que estas três sejam PROVADAS, e não conferidas a olho: antes, a
// decisão morava metade num ternário do JSX e metade num early return dentro do componente, e
// nenhuma das duas metades era alcançável por teste sem um renderizador de React que este repo
// não tem.

// ─────────── invariante 1 · QR vencido não aparece, em forma nenhuma ───────────

test("QR vencido NÃO desenha — mesmo com o código em mãos, o quadro esvazia", () => {
  // é o caso perigoso: o código EXISTE e é perfeitamente desenhável. O que o proíbe é `qrValido`.
  assert.ok(desenharQr(CODIGO_REAL), "pré-condição: este código desenha quando é válido");
  const q = decidirQuadro({ qr: CODIGO_REAL, qrValido: false, conectado: false });
  assert.equal(q.modo, "vazio");
});

test("QR vencido também NÃO cai para o código cru — expirado está morto nas DUAS formas", () => {
  // a degradação que parece elegante e é a pior saída: quem escaneia (ou digita) um código morto
  // não recebe erro nenhum, não acontece nada, e conclui que o sistema quebrou.
  const q = decidirQuadro({ qr: CODIGO_REAL, qrValido: false, conectado: false });
  assert.notEqual(q.modo, "codigo_cru");
  assert.ok(!JSON.stringify(q).includes(CODIGO_REAL.slice(0, 24)), "o código vencido vazou na tela");
});

test("quadro vazio sempre diz POR QUE está vazio — e o motivo muda com o estado", () => {
  const conectado = decidirQuadro({ qr: null, qrValido: false, conectado: true });
  const semNada = decidirQuadro({ qr: null, qrValido: false, conectado: false });
  assert.equal(conectado.modo === "vazio" && conectado.texto, TEXTO_QUADRO_CONECTADO);
  assert.equal(semNada.modo === "vazio" && semNada.texto, TEXTO_QUADRO_SEM_CODIGO);
  // "conectado, nada a ler" é sucesso; "nenhum código ativo" é convite a agir. Trocar os dois
  // faria a tela pedir uma sessão que já está de pé.
  assert.notEqual(TEXTO_QUADRO_CONECTADO, TEXTO_QUADRO_SEM_CODIGO);
});

test("`qrValido` true com código ausente ou em branco continua vazio — e não lança", () => {
  for (const qr of [null, undefined, "", "   "]) {
    assert.equal(decidirQuadro({ qr, qrValido: true, conectado: false }).modo, "vazio");
  }
});

// ─────────── invariante 2 · o código cru sobrevive ao desenho ───────────

test("com o QR desenhado, o código cru CONTINUA no resultado — é a saída de emergência", () => {
  const q = decidirQuadro({ qr: CODIGO_REAL, qrValido: true, conectado: false });
  assert.equal(q.modo, "qr");
  assert.equal(q.modo === "qr" && q.codigo, CODIGO_REAL);
  assert.ok(q.modo === "qr" && q.desenho.lado > 0);
});

test("desenho impossível rebaixa para o código cru em vez de sumir com ele", () => {
  // payload que estoura a versão 40: `desenharQr` devolve null, e o que a pessoa precisa (o
  // código) tem de continuar na tela — a alternativa seria um quadro vazio mentindo que expirou.
  const gigante = "x".repeat(10_000);
  const q = decidirQuadro({ qr: gigante, qrValido: true, conectado: false });
  assert.equal(q.modo, "codigo_cru");
  assert.equal(q.modo === "codigo_cru" && q.codigo, gigante);
});

test("TODO modo com código válido carrega o código — a união não tem estado sem saída", () => {
  // varre os dois modos que existem com código válido: nenhum pode chegar à tela sem o texto.
  for (const codigo of [CODIGO_REAL, "x".repeat(10_000)]) {
    const q = decidirQuadro({ qr: codigo, qrValido: true, conectado: false });
    assert.notEqual(q.modo, "vazio");
    assert.equal("codigo" in q && q.codigo, codigo);
  }
});

// ─────────── invariante 3 · o portão de criação de sessão NÃO afrouxou ───────────

function canalLite(p: Partial<Canal> = {}): Canal {
  return {
    canal_id: "lite:jade",
    nome: "Jade",
    provedor: "nao_oficial",
    ativo: true,
    numero: null,
    waba_id: null,
    area_efetiva: "comercial",
    departamento: null,
    pareado_em: null,
    consentimento_em: "2026-07-26T12:00:00Z",
    consentimento_titular: "Jade",
    consentimento_texto_versao: null,
    consentimento_por: null,
    finalidade: "teste",
    risco_ban_aceito: true,
    desativado_em: null,
    criado_em: null,
    inbox_desde: "2026-07-20T00:00:00Z",
    // D70 · o fixture nasce SEM nivel e SEM declaracao, que e o estado real de todo canal em
    // producao hoje (medido 08/09/2026: a view nao tem a coluna). `nivelDoCanal` cai em `estrito`.
    nivel: null,
    nivel_declarado: false,
    ...p,
  };
}

test("desenhar o QR não afrouxou o portão: os bloqueios do PAREAMENTO seguem de pé", () => {
  // Esta trilha só ensinou a tela a DESENHAR um código que ela já recebia. Se um dos bloqueios
  // tivesse caído no caminho, o QR passaria a ser emitido para quem não pode pedi-lo. Por isso o
  // portão é reafirmado aqui, ao lado do desenho, e não só no arquivo de regras ao lado.
  //
  // ⚠️ Eram QUATRO e passaram a ser TRÊS em 14/09, e a diferença não é afrouxamento: o
  // consentimento saiu do pareamento e foi para o LIGAR, que é onde o banco também o cobra
  // (ARB-16) e onde o risco de fato começa — parear não põe nada em movimento, o canal nasce
  // desligado. A asserção foi junto, para `tests/canais.test.ts`.
  assert.equal(podeCriarSessao({ papel: "membro", canal: canalLite(), f8Pronto: true }).pode, false);
  assert.equal(
    podeCriarSessao({ papel: "admin", canal: canalLite({ provedor: "waba" }), f8Pronto: true }).pode,
    false,
  );
  assert.equal(podeCriarSessao({ papel: "admin", canal: canalLite(), f8Pronto: false }).pode, false);
  // e o que MUDOU, dito aqui também para ninguém achar que caiu por acidente
  assert.equal(
    podeCriarSessao({ papel: "admin", canal: canalLite({ consentimento_em: null }), f8Pronto: true }).pode,
    true,
    "sem consentimento o QR SAI — a exigência mora no ligar",
  );

  // e o caminho legítimo continua abrindo — portão que nunca deixa passar não é portão, é parede.
  assert.equal(podeCriarSessao({ papel: "admin", canal: canalLite(), f8Pronto: true }).pode, true);
  assert.equal(podeCriarSessao({ papel: "owner", canal: canalLite(), f8Pronto: true }).pode, true);
});

// ═══════════════ 6. A IMAGEM DO PROVEDOR — o dialeto que o desenhador NÃO cobre ═══════════════
//
// O desenhador acima nasceu para um formato que o provedor de produção nunca manda. MEDIDO no Go
// do WuzAPI: `wmiau.go` faz `qrcode.Encode(...)` e grava `"data:image/png;base64," + base64(PNG)`;
// `handlers.go` devolve isso em `{"QRCode": …}`. É IMAGEM PRONTA — e ela era descartada na
// fronteira, porque o contrato da web só transportava o código. Estes testes travam as duas pontas
// dessa correção: a imagem chega, e continua sujeita às MESMAS invariantes do código.

test("com imagem, o quadro entra no modo imagem — e leva o `data:` intacto", () => {
  const q = decidirQuadro({ qrImagem: IMAGEM_REAL, qrValido: true, conectado: false });
  assert.equal(q.modo, "imagem");
  assert.equal(q.modo === "imagem" && q.imagem, IMAGEM_REAL);
});

test("imagem GANHA do código quando os dois chegam — menos um passo até a câmera", () => {
  // o PNG saiu do codificador do próprio provedor sobre o código dele; o nosso desenho é uma
  // RE-codificação. Onde as duas existem, desenhar de novo só adiciona um lugar para errar.
  const q = decidirQuadro({ qr: CODIGO_REAL, qrImagem: IMAGEM_REAL, qrValido: true });
  assert.equal(q.modo, "imagem");
  // e a invariante 2 continua valendo: o código NÃO é jogado fora, vira a saída em texto.
  assert.equal(q.modo === "imagem" && q.codigo, CODIGO_REAL);
});

test("imagem sem código não inventa código — o campo vem null, não string vazia", () => {
  // é o caso de produção: o WuzAPI manda UM campo só. `""` viraria um `<details>` vazio na tela.
  const q = decidirQuadro({ qrImagem: IMAGEM_REAL, qrValido: true });
  assert.equal(q.modo === "imagem" && q.codigo, null);
});

test("sem imagem, o desenhador continua sendo o caminho — ele é a independência de dialeto", () => {
  const q = decidirQuadro({ qr: CODIGO_REAL, qrImagem: null, qrValido: true });
  assert.equal(q.modo, "qr");
});

// ─────────── a invariante 1 vale para a IMAGEM exatamente como valia para o código ───────────

test("imagem VENCIDA não aparece — e é o caso mais perigoso dos dois", () => {
  // um PNG vencido parece perfeito na tela, a câmera lê, e o celular não faz nada. Quem está
  // pareando conclui que o sistema quebrou. Some, e diz que sumiu.
  const q = decidirQuadro({ qrImagem: IMAGEM_REAL, qr: CODIGO_REAL, qrValido: false });
  assert.equal(q.modo, "vazio");
  assert.ok(!JSON.stringify(q).includes(IMAGEM_REAL.slice(0, 40)), "a imagem vencida vazou na tela");
});

// ─────────── o quadro vazio nunca é mudo, nem quando o culpado somos nós ───────────

test("runtime prometeu imagem e não mandou nenhuma: o quadro ACUSA, não encolhe os ombros", () => {
  const q = decidirQuadro({ formato: "imagem", qr: null, qrImagem: null, qrValido: true });
  assert.equal(q.modo === "vazio" && q.texto, TEXTO_QUADRO_IMAGEM_PERDIDA);
  // não pode virar "peça uma sessão": os dois vazios levam a pessoa a ações opostas.
  assert.notEqual(TEXTO_QUADRO_IMAGEM_PERDIDA, TEXTO_QUADRO_SEM_CODIGO);
  assert.notEqual(TEXTO_QUADRO_IMAGEM_PERDIDA, TEXTO_QUADRO_CONECTADO);
});

// ═══════════════ 7. AUSÊNCIA DE PRAZO NÃO É MORTE ═══════════════
//
// O defeito que esta trilha conserta, em uma linha: `qrExpirado(null)` devolvia `true`, e o
// provedor de produção NUNCA manda prazo — logo todo QR real era classificado como vencido e a
// tela ficava vazia por cima de uma imagem escaneável. É o pior tipo de defeito: o que parece
// certo. `validadeQr` separa "o provedor disse que morreu" de "o provedor não disse nada".

test("sem instante nenhum é `sem_prazo`, não `expirado` — é a correção inteira", () => {
  const agora = Date.parse("2026-09-07T12:00:00Z");
  assert.equal(validadeQr(null, agora), "sem_prazo");
  assert.equal(validadeQr(undefined, agora), "sem_prazo");
  assert.equal(validadeQr("", agora), "sem_prazo");
  assert.equal(validadeQr("   ", agora), "sem_prazo");
});

test("instante ilegível é `sem_prazo` — string quebrada não afirma que o código morreu", () => {
  assert.equal(validadeQr("qualquer coisa", Date.parse("2026-09-07T12:00:00Z")), "sem_prazo");
});

test("instante LEGÍVEL no passado continua sendo `expirado` — a invariante 1 não afrouxou", () => {
  const agora = Date.parse("2026-09-07T12:00:00Z");
  assert.equal(validadeQr("2026-09-07T11:59:59Z", agora), "expirado");
  assert.equal(validadeQr("2026-09-07T12:00:00Z", agora), "expirado"); // o próprio instante já venceu
  assert.equal(validadeQr("2026-09-07T12:00:20Z", agora), "valido");
});

test("sem prazo, a tela MOSTRA o QR e diz que ninguém está contando", () => {
  const q = decidirQuadro({ qrImagem: IMAGEM_REAL, qrValido: true, semPrazo: true });
  assert.equal(q.modo, "imagem");
  assert.equal(q.modo === "imagem" && q.semPrazo, true);
  // a frase é dado, não JSX: é o que permite exercê-la aqui em vez de conferir a olho.
  assert.ok(AVISO_QR_SEM_PRAZO.length > 0);
  assert.ok(/segundos/.test(AVISO_QR_SEM_PRAZO), "o aviso precisa dizer que o prazo é de segundos");
});

test("`semPrazo` chega aos TRÊS modos que têm algo a ler", () => {
  // se ele sumisse em um deles, aquele caminho mostraria um QR sem prazo sem dizer nada — e é
  // exatamente o caminho do desenhador que a gente menos exercita.
  const modos = [
    decidirQuadro({ qrImagem: IMAGEM_REAL, qrValido: true, semPrazo: true }),
    decidirQuadro({ qr: CODIGO_REAL, qrValido: true, semPrazo: true }),
    decidirQuadro({ qr: "x".repeat(10_000), qrValido: true, semPrazo: true }),
  ];
  assert.deepEqual(modos.map((m) => m.modo), ["imagem", "qr", "codigo_cru"]);
  for (const m of modos) assert.equal("semPrazo" in m && m.semPrazo, true, `${m.modo} perdeu o semPrazo`);
});

// ═══════════════ 8. O `src` DO `<img>` — a única string desta tela que vira execução ═══════════

test("só `data:image/<tipo conhecido>;base64,` entra num `src`", () => {
  assert.equal(imagemQrSegura(IMAGEM_REAL), IMAGEM_REAL);
  // o STUB do runtime manda SVG em data-URI (uma imagem que se anuncia como não escaneável).
  assert.equal(
    imagemQrSegura("data:image/svg+xml;base64,PHN2Zy8+"),
    "data:image/svg+xml;base64,PHN2Zy8+",
  );
});

test("qualquer outra forma de `src` vira null — inclusive as que parecem imagem", () => {
  for (const v of [
    "javascript:alert(1)",
    "https://exemplo.com/qr.png",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml,<svg onload=alert(1)/>", // sem base64: a carga passaria em texto puro
    "data:image/png;base64,nao base64 com espaco",
    "",
    "   ",
    null,
    undefined,
    42,
    { data: "x" },
  ]) {
    assert.equal(imagemQrSegura(v), null, `passou: ${String(v)}`);
  }
});

test("imagem gigante é recusada — a borda não deixa o runtime despejar no DOM", () => {
  assert.equal(imagemQrSegura(`data:image/png;base64,${"A".repeat(600_000)}`), null);
});

test("o que `imagemQrSegura` recusa não chega ao quadro como imagem", () => {
  // a borda é `normalizarRespostaRuntime`; aqui se prova que o quadro não tem porta dos fundos:
  // com a imagem já filtrada para null, ele cai no código, e sem código cai no vazio.
  const q = decidirQuadro({ qrImagem: imagemQrSegura("javascript:alert(1)"), qrValido: true });
  assert.equal(q.modo, "vazio");
});
