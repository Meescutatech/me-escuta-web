/**
 * F11 · O DESENHO do QR de pareamento — função pura, sem React, sem I/O, sem rede.
 *
 * ⚠️ PREMISSA CORRIGIDA (leitura do Go do provedor). Este arquivo nasceu dizendo que o WuzAPI
 * devolve CÓDIGO CRU. Ele não devolve: `wmiau.go` chama `qrcode.Encode(...)` e grava
 * `"data:image/png;base64," + base64(PNG)`, e `handlers.go` entrega isso em `{"QRCode": …}`. O
 * dialeto de produção manda IMAGEM PRONTA.
 *
 * O desenhador continua aqui, e não por apego: ele é a nossa INDEPENDÊNCIA DE DIALETO. O adaptador
 * do runtime trata de propósito as três formas que os provedores usam (data-URI, base64 de PNG sem
 * prefixo, e código cru), e o dia em que o provedor mudar — ou em que a segunda fono entrar por
 * outro — quem chega só com o código continua tendo um QR na tela em vez de um parágrafo de texto.
 * Imagem quando há imagem; desenho quando só há código. Nada aqui toca o runtime.
 *
 * Três decisões que este arquivo carrega, cada uma com uma forma própria de dar errado:
 *
 *  (a) CORREÇÃO DE ERRO `L`, e não a `M` que a maioria das bibliotecas usa por padrão. O QR de
 *      pareamento vive segundos numa TELA: não amassa, não borra, não desbota. O que a correção de
 *      erro compra aqui é resiliência contra um dano que não existe, e o que ela cobra é módulo
 *      menor — MEDIDO com o código real de 199 caracteres, `L` dá versão 9 e 53 módulos de lado,
 *      `M` dá versão 10 e 57, o que encolhe cada módulo em 7% no mesmo quadro (4,00px contra
 *      3,75px nos 244px úteis). Módulo maior é o que faz a câmera ler de primeira.
 *
 *  (b) A ZONA DE SILÊNCIO É DO SVG, não do CSS. A ISO/IEC 18004 exige 4 módulos brancos em volta,
 *      e "em volta" é medido em MÓDULOS — quantidade que só se conhece depois de saber a versão do
 *      QR. Padding em pixels não sabe disso: os mesmos 10px são 2 módulos num código curto e 3 num
 *      longo, e o decodificador falha sem dizer por quê. Com a borda dentro do `viewBox`, ela
 *      escala junto e continua valendo em qualquer tamanho de quadro.
 *
 *  (c) FALHA DEVOLVE `null`, NUNCA LANÇA. Payload que estoura a versão 40 faz o codificador lançar
 *      `RangeError: Data too long`. Num componente de cliente isso derruba a árvore inteira e a
 *      pessoa perde também o código legível — que é justamente o caminho alternativo dela. Aqui a
 *      falha vira ausência de desenho, e a tela rebaixa o QR em vez de sumir.
 *
 * Biblioteca: `uqr` — zero dependência em runtime, 27 KB de dist, ESM e CJS no mesmo pacote (é o
 * que a faz funcionar tanto no bundle do Next quanto no `node --test` deste repo). Ela devolve a
 * MATRIZ; o SVG é nosso, e é por isso que estas regras são testáveis como as outras.
 */

import { encode } from "uqr";

/** Ver (a). Não mude para `M` sem medir o módulo em pixels no quadro real. */
export const ECC_QR = "L" as const;

/** Ver (b). ISO/IEC 18004: 4 módulos brancos em volta, e não menos. */
export const BORDA_MODULOS = 4;

export interface QrDesenhado {
  /** lado da matriz em MÓDULOS, borda inclusa. É o `viewBox`: `0 0 lado lado`. */
  lado: number;
  /** um único `d` de `<path>`, com os módulos escuros fundidos em corridas horizontais. */
  caminho: string;
  /** versão do QR (1-40). Serve para conferir tamanho de módulo, não aparece na tela. */
  versao: number;
}

/**
 * Matriz → `d` de UM `<path>`.
 *
 * Por que um caminho só e não um `<rect>` por módulo: a tela redesenha o QR a cada 5 s enquanto
 * aguarda pareamento (o relê já existente). Um código de 57 módulos de lado tem ~1.600 módulos
 * escuros, e trocar 1.600 nós do DOM de 5 em 5 segundos é caro à toa. Fundir cada corrida
 * horizontal de módulos vizinhos num só retângulo derruba isso para algumas centenas de sub-
 * caminhos, e o desenho é idêntico ao pixel.
 *
 * Coordenada é o índice do módulo, não pixel: o `viewBox` faz a escala. Assim o mesmo `d` serve
 * para um quadro de 264px e para um de 120px, sem recalcular nada.
 */
export function caminhoDeMatriz(matriz: readonly (readonly boolean[])[]): string {
  const partes: string[] = [];
  for (let y = 0; y < matriz.length; y++) {
    const linha = matriz[y] ?? [];
    let x = 0;
    while (x < linha.length) {
      if (!linha[x]) {
        x++;
        continue;
      }
      let largura = 1;
      while (x + largura < linha.length && linha[x + largura]) largura++;
      partes.push(`M${x} ${y}h${largura}v1h-${largura}z`);
      x += largura;
    }
  }
  return partes.join("");
}

/**
 * Código cru → desenho, ou `null` quando não há desenho possível.
 *
 * O `trim` não é enfeite: o código do WhatsApp é base64 separado por vírgula e não tem espaço em
 * lugar nenhum, então uma quebra de linha grudada pelo transporte mudaria o conteúdo codificado e
 * produziria um QR que o aparelho lê e recusa — falha muda, e das piores de investigar.
 */
export function desenharQr(codigo: string | null | undefined): QrDesenhado | null {
  const texto = (codigo ?? "").trim();
  if (!texto) return null;
  try {
    const qr = encode(texto, { ecc: ECC_QR, border: BORDA_MODULOS });
    if (!qr || !Array.isArray(qr.data) || qr.data.length === 0) return null;
    const caminho = caminhoDeMatriz(qr.data);
    // matriz sem um módulo escuro sequer não é QR — é um quadrado branco com cara de carregando.
    if (!caminho) return null;
    return { lado: qr.size, caminho, versao: qr.version };
  } catch {
    return null;
  }
}

/**
 * Quantos PIXELS tem cada módulo, dado o lado do quadro. Existe para ser medida, não para decorar:
 * abaixo de ~3px por módulo a câmera de celular começa a errar em tela comum, e é o número que
 * qualquer mudança de tamanho do quadro precisa respeitar.
 */
export function pixelsPorModulo(ladoQuadroPx: number, lado: number): number {
  if (!Number.isFinite(ladoQuadroPx) || !Number.isFinite(lado) || lado <= 0) return 0;
  return ladoQuadroPx / lado;
}

// ─────────────────────────── o que o quadro mostra, e por quê ───────────────────────────

/**
 * As quatro coisas que podem ocupar o quadro. É uma união fechada de propósito: o `modo` decide o
 * desenho, e cada modo carrega EXATAMENTE o que aquele desenho precisa — não há um estado em que a
 * tela tenha um desenho e não tenha o código, nem o contrário.
 *
 * `semPrazo` viaja em todo modo que tem algo a ler porque é informação da PESSOA, não do desenho:
 * o provedor de produção não declara expiração nenhuma (ver `validadeQr`), e alguém que aponta a
 * câmera precisa saber que o prazo é de segundos e ninguém está contando por ela.
 */
export type QuadroPareamento =
  /** o dialeto de produção: o provedor já mandou o QR desenhado. `codigo` pode não existir. */
  | { modo: "imagem"; imagem: string; codigo: string | null; semPrazo: boolean }
  /** veio só o código, e nós desenhamos. `codigo` viaja junto: alimenta a saída em texto. */
  | { modo: "qr"; codigo: string; desenho: QrDesenhado; semPrazo: boolean }
  /** desenhar falhou, o código continua válido — a pessoa lê o texto e pareia pelo provedor. */
  | { modo: "codigo_cru"; codigo: string; semPrazo: boolean }
  /** não há nada legível AGORA. `texto` diz por quê, porque quadro vazio sem motivo é defeito. */
  | { modo: "vazio"; texto: string };

export const TEXTO_QUADRO_CONECTADO = "Sessão conectada. Nada a ler.";
export const TEXTO_QUADRO_SEM_CODIGO = "Nenhum código ativo. Peça uma sessão para gerar.";
/**
 * O runtime anunciou imagem e não mandou imagem exibível. É contrato quebrado entre dois processos
 * nossos, e some sem sintoma se a tela apenas encolher os ombros: o quadro fica vazio com o texto
 * de "nenhum código ativo", alguém pede outra sessão, e o defeito volta idêntico. Nomear a
 * divergência é o que faz alguém ir olhar o campo `qr_imagem` em vez de clicar de novo.
 */
export const TEXTO_QUADRO_IMAGEM_PERDIDA =
  "O runtime disse que mandaria o QR como imagem e não mandou nenhuma legível. Gere outro código; se repetir, é o campo qr_imagem da rota de sessão.";

/** A frase do prazo. Fica aqui, e não no JSX, para ser exercida pelo mesmo teste que a decisão. */
export const AVISO_QR_SEM_PRAZO =
  "Este provedor não informa até quando o código vale — e o prazo do WhatsApp é de segundos. Se a câmera não pegar em poucos instantes, gere outro.";

/**
 * A decisão do quadro, inteira e sem React — é o que torna as duas invariantes da tela testáveis
 * em vez de conferíveis a olho.
 *
 * INVARIANTE 1 — QR VENCIDO NÃO VIRA DESENHO, E NEM VIRA TEXTO. `qrValido` falso devolve `vazio`,
 * ponto. O reflexo natural aqui é errado: quando o desenho não serve, cair para o código cru
 * PARECE degradação elegante, e é a pior saída possível — o código expirado está morto nas duas
 * formas. Quem escaneia um QR morto não recebe erro: não acontece nada, e a conclusão da pessoa é
 * que o sistema quebrou. Some, e diz que sumiu.
 *
 * INVARIANTE 2 — O CÓDIGO CRU SOBREVIVE AO DESENHO. Nos dois modos em que existe código válido, o
 * `codigo` está no resultado. A tela pode rebaixá-lo (um `<details>` fechado quando o QR desenha),
 * nunca descartá-lo: ele é o caminho alternativo de quem está com a câmera falhando.
 *
 * Recebe primitivos, não o objeto de estado da tela: o relê monta um objeto novo a cada 5 s, e um
 * parâmetro-objeto invalidaria a memoização a cada volta — recodificando um QR idêntico à toa.
 */
export function decidirQuadro(estado: {
  qr?: string | null;
  /** o `data:` já FILTRADO por `imagemQrSegura`. Aqui não se valida `src`; aqui se escolhe modo. */
  qrImagem?: string | null;
  /** o que o runtime DISSE ter mandado. Só serve para denunciar quando não bate com o que chegou. */
  formato?: "codigo" | "imagem" | null;
  qrValido?: boolean;
  semPrazo?: boolean;
  conectado?: boolean;
}): QuadroPareamento {
  const codigo = (estado.qr ?? "").trim();
  const imagem = (estado.qrImagem ?? "").trim();
  const semPrazo = estado.semPrazo === true;

  const vazio = (texto: string): QuadroPareamento => ({ modo: "vazio", texto });

  // INVARIANTE 1, e ela vem ANTES de tudo de propósito: vale para a imagem exatamente como valia
  // para o código. Um PNG vencido é tão morto quanto um texto vencido, e é PIOR de diagnosticar —
  // ele parece perfeito na tela, a câmera lê, e o celular simplesmente não faz nada.
  if (!estado.qrValido) {
    return vazio(estado.conectado ? TEXTO_QUADRO_CONECTADO : TEXTO_QUADRO_SEM_CODIGO);
  }

  // IMAGEM PRIMEIRO quando as duas chegam. Não é preferência de gosto: a imagem saiu do
  // codificador do PRÓPRIO provedor sobre o código dele, e o nosso desenho é uma RE-codificação.
  // Onde as duas existem, a que tem menos passos entre o WhatsApp e a câmera é a do provedor.
  if (imagem) {
    return { modo: "imagem", imagem, codigo: codigo || null, semPrazo };
  }

  if (codigo) {
    const desenho = desenharQr(codigo);
    return desenho
      ? { modo: "qr", codigo, desenho, semPrazo }
      : { modo: "codigo_cru", codigo, semPrazo };
  }

  // Chegou nada. Se o runtime tinha PROMETIDO imagem, o quadro diz isso em vez de fingir que
  // ninguém pediu sessão — os dois vazios levariam a pessoa a ações opostas.
  if (estado.formato === "imagem") return vazio(TEXTO_QUADRO_IMAGEM_PERDIDA);
  return vazio(estado.conectado ? TEXTO_QUADRO_CONECTADO : TEXTO_QUADRO_SEM_CODIGO);
}
