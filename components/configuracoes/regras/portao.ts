/**
 * OS PORTÕES DE SEGURANÇA DA WEB-B, como REGRA EXECUTÁVEL — não como prosa.
 *
 * Motivo, escrito por quem apanhou: a auditoria (§6, E-5) mediu que os três portões da minha spec
 * provavam compilação e uma função pura, e **nenhum critério de segurança**. Ficaram sem comando
 * as quatro afirmações que mais importam:
 *
 *   1. "não exibir, transmitir ou registrar qualquer token"      → `PORTAO_SEGREDO`
 *   2. "a web não contém token de instância do provedor"          → `PORTAO_SEGREDO` + `PORTAO_CLIENTE`
 *   3. "sucesso só depois de reler a projeção (readback, V7)"     → `PORTAO_READBACK`
 *   4. "sem papel de gestão, a tela degrada para leitura"         → `PORTAO_PAPEL`
 *
 * Cada portão é uma função PURA sobre `Arquivo[]` — conteúdo em memória, sem `fs`. É isso que
 * permite prová-lo nos DOIS sentidos no mesmo teste: aplicado aos arquivos reais (tem de aprovar)
 * e aplicado a um arquivo sintético violado (tem de REPROVAR). Portão que nunca se viu reprovando
 * é decoração — e decoração verde é pior que portão nenhum, porque dá confiança.
 */

import { TIPOS_ESCRITOS_WEB_B } from "./porta.ts";

export interface Arquivo {
  caminho: string;
  conteudo: string;
}

export interface Violacao {
  portao: string;
  caminho: string;
  linha?: number;
  motivo: string;
}

export interface Portao {
  nome: string;
  /** o que ele prova, em uma frase — vai no relatório e na saída do teste. */
  prova: string;
  avaliar: (arquivos: Arquivo[]) => Violacao[];
}

function linhas(a: Arquivo): { n: number; texto: string }[] {
  return a.conteudo.split("\n").map((texto, i) => ({ n: i + 1, texto }));
}

function ehCliente(a: Arquivo): boolean {
  return /^\s*["']use client["']/m.test(a.conteudo);
}

function ehServidor(a: Arquivo): boolean {
  return /^\s*["']use server["']/m.test(a.conteudo);
}

// ───────────────────────────── 1 · segredo não passa por aqui ─────────────────────────────

/**
 * As ÚNICAS variáveis de ambiente com cara de segredo que esta trilha pode nomear, e o motivo de
 * cada uma. Qualquer outra é violação — inclusive uma que "parece inofensiva": a decisão de
 * introduzir um segredo novo tem de ser declarada, não descoberta em revisão.
 */
export const ENV_SEGREDO_PERMITIDO: Record<string, string> = {
  RUNTIME_LITE_TOKEN:
    "segredo compartilhado com a rota interna de sessão do runtime (padrão RUNTIME_PRESENCA_TOKEN). Só servidor.",
};

const NOME_SECRETO = /(TOKEN|SECRET|SENHA|PASSWORD|API[_-]?KEY|CREDENTIAL|PRIVATE[_-]?KEY)/i;

/** Literal com cara de credencial: JWT, token da Graph, chave longa em base64/hex. */
const LITERAL_SUSPEITO: { re: RegExp; nome: string }[] = [
  { re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, nome: "JWT literal" },
  { re: /\bEAA[A-Za-z0-9]{20,}/, nome: "access token da Graph (EAA…)" },
  { re: /\bsb[ph]_[A-Za-z0-9_-]{20,}/, nome: "chave de projeto Supabase" },
  { re: /\b[A-Fa-f0-9]{40,}\b/, nome: "hex longo com cara de chave" },
];

export const PORTAO_SEGREDO: Portao = {
  nome: "segredo",
  prova:
    "nenhum arquivo da Web-B contém literal de credencial, e a única env secreta nomeada é a declarada em ENV_SEGREDO_PERMITIDO",
  avaliar(arquivos) {
    const v: Violacao[] = [];
    for (const a of arquivos) {
      for (const { n, texto } of linhas(a)) {
        for (const env of texto.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)) {
          const nome = env[1];
          if (!NOME_SECRETO.test(nome)) continue;
          if (!(nome in ENV_SEGREDO_PERMITIDO)) {
            v.push({
              portao: "segredo",
              caminho: a.caminho,
              linha: n,
              motivo: `env secreta não declarada: ${nome}. Introduzir segredo novo é decisão, não detalhe — declare em ENV_SEGREDO_PERMITIDO com o motivo.`,
            });
          }
          if (nome.startsWith("NEXT_PUBLIC_")) {
            v.push({
              portao: "segredo",
              caminho: a.caminho,
              linha: n,
              motivo: `${nome} é NEXT_PUBLIC_: vai inteiro para o bundle do browser. Segredo em NEXT_PUBLIC_ é segredo publicado.`,
            });
          }
        }
        for (const { re, nome } of LITERAL_SUSPEITO) {
          if (re.test(texto)) {
            v.push({ portao: "segredo", caminho: a.caminho, linha: n, motivo: `${nome} embutido no código` });
          }
        }
      }
    }
    return v;
  },
};

// ───────────────────────── 2 · o cliente não toca em segredo nem em I/O ─────────────────────────

export const PORTAO_CLIENTE: Portao = {
  nome: "cliente",
  prova:
    "nenhum componente client lê process.env nem importa módulo de dados (servidor) — é o que impede o token de instância chegar ao browser",
  avaliar(arquivos) {
    const v: Violacao[] = [];
    for (const a of arquivos) {
      if (!ehCliente(a)) continue;
      for (const { n, texto } of linhas(a)) {
        if (/process\.env\./.test(texto)) {
          v.push({
            portao: "cliente",
            caminho: a.caminho,
            linha: n,
            motivo: "componente client lendo process.env — tudo que ele lê é enviado ao browser",
          });
        }
        if (/from\s+["'][^"']*\/dados\//.test(texto) || /from\s+["']\.\.?\/dados\//.test(texto)) {
          v.push({
            portao: "cliente",
            caminho: a.caminho,
            linha: n,
            motivo: "componente client importando módulo de dados (servidor) — puxa o cliente do Supabase e o segredo junto",
          });
        }
      }
    }
    return v;
  },
};

// ───────────────────────────── 3 · readback em todo caminho de escrita ─────────────────────────────

/**
 * O ÚNICO arquivo autorizado a chamar `api.registrar_evento` nesta trilha. Um único ponto de
 * escrita é o que torna o portão possível: com a chamada espalhada por quatro `actions.ts`,
 * "esqueci o readback em um deles" é indetectável por regra simples — e é exatamente assim que a
 * R14/R15 produziu uma tela que dizia "salvo" com a lista vazia.
 */
export const ARQUIVO_ESCRITA = "components/configuracoes/dados/porta.ts";

const MARCAS_READBACK = ["confirmarProjecao", "conferir"];

/**
 * DÍVIDA HERDADA, declarada com dono e data — não exceção permanente.
 *
 * Três telas que JÁ EXISTIAM dentro desta fronteira escrevem direto na porta, sem readback. O
 * portão as encontrou na primeira execução (26/07), e esconder isso com um filtro de "arquivos
 * novos" seria transformar um achado em ponto cego. Elas não entram na fase 1 porque adotar o
 * helper do F6 exige acrescentar a ação na tabela `CONFERENCIA` **junto** de um caso de portão que
 * a exercite com escrita real (regra do Orquestrador; E-020) — e escrita real depende de banco.
 *
 * O teste trava o TAMANHO desta lista: ela pode encolher, nunca crescer.
 */
export const ESCRITA_SEM_READBACK_HERDADA: Record<string, string> = {
  "app/(app)/configuracoes/templates/actions.ts":
    "template_criado/atualizado/arquivado — a projeção tem `ultima_posicao`; adotar = 3 linhas em CONFERENCIA + portão de escrita real (fase 2)",
  "app/(app)/configuracoes/clara/actions.ts":
    "config_atualizada (config de AGENTE, projetor porta.proj_config_agente) + o caminho versionado do prompt (0007/0008), que já tem trava própria",
  "app/(app)/configuracoes/membros/actions.ts":
    "convite/usuário — parte da escrita vai por serviço HTTP externo (CONVITES_URL), então a conferência não é só releitura de projeção",
};

function herdado(caminho: string): boolean {
  return Object.prototype.hasOwnProperty.call(ESCRITA_SEM_READBACK_HERDADA, caminho);
}

export const PORTAO_READBACK: Portao = {
  nome: "readback",
  prova:
    "api.registrar_evento é chamado em um só arquivo da trilha, e esse arquivo confere a projeção antes de devolver sucesso",
  avaliar(arquivos) {
    const v: Violacao[] = [];
    for (const a of arquivos) {
      const chama = /rpc\(\s*["']registrar_evento["']/.test(a.conteudo);
      if (!chama || herdado(a.caminho)) continue;
      if (a.caminho !== ARQUIVO_ESCRITA) {
        v.push({
          portao: "readback",
          caminho: a.caminho,
          motivo: `chamada direta a registrar_evento fora do ponto único de escrita (${ARQUIVO_ESCRITA}) — escreva por lá, senão o readback vira opcional`,
        });
        continue;
      }
      const faltando = MARCAS_READBACK.filter((m) => !a.conteudo.includes(m));
      if (faltando.length > 0) {
        v.push({
          portao: "readback",
          caminho: a.caminho,
          motivo: `o ponto de escrita não confere a projeção (faltam: ${faltando.join(", ")}) — sucesso sem releitura é a tela mentindo`,
        });
      }
    }
    if (!arquivos.some((a) => a.caminho === ARQUIVO_ESCRITA)) {
      v.push({
        portao: "readback",
        caminho: ARQUIVO_ESCRITA,
        motivo: "o ponto único de escrita não existe — sem ele não há onde garantir o readback",
      });
    }
    return v;
  },
};

// ───────────────────────────── 4 · papel degradando para leitura ─────────────────────────────

/**
 * Toda página de gestão desta trilha resolve o papel no servidor e o repassa. A defesa real é a
 * guarda da porta (o banco recusa); esta regra impede a outra metade do defeito: uma tela que
 * OFERECE o botão que o banco vai recusar, e devolve erro em vez de não oferecer.
 */
export const ROTAS_DE_GESTAO = [
  "app/(app)/configuracoes/canais/page.tsx",
  "app/(app)/configuracoes/funil/page.tsx",
  "app/(app)/configuracoes/avancado/[nome]/page.tsx",
];

export const PORTAO_PAPEL: Portao = {
  nome: "papel",
  prova:
    "toda página de gestão da trilha resolve o papel no servidor (api.papel_atual, direto ou pelo helper) — sem papel, a tela nasce em leitura",
  avaliar(arquivos) {
    const v: Violacao[] = [];
    for (const caminho of ROTAS_DE_GESTAO) {
      const a = arquivos.find((x) => x.caminho === caminho);
      if (!a) continue; // página ainda não existe (fase 1): não é violação, é ausência
      if (!/papel_atual|lerPapelAtual/.test(a.conteudo)) {
        v.push({
          portao: "papel",
          caminho,
          motivo: "página de gestão sem leitura de papel_atual — ela ofereceria escrita para quem o banco vai recusar",
        });
      }
    }
    return v;
  },
};

// ───────────────────── 5 · o caminho do anexo, de que a RLS depende ─────────────────────

export const PORTAO_CAMINHO_ANEXO: Portao = {
  nome: "caminho_anexo",
  prova:
    "o caminho do anexo de suporte só é montado por caminhoAnexoSuporte — a RLS por autor do Storage depende de <uid> ser a primeira pasta",
  avaliar(arquivos) {
    const v: Violacao[] = [];
    for (const a of arquivos) {
      if (a.caminho.endsWith("components/suporte/regras/suporte.ts")) continue; // é a definição
      for (const { n, texto } of linhas(a)) {
        // string montando caminho com barra dentro de template literal, no contexto de upload
        if (/["'`][^"'`]*suporte-anexos[^"'`]*\/[^"'`]*["'`]/.test(texto)) {
          v.push({
            portao: "caminho_anexo",
            caminho: a.caminho,
            linha: n,
            motivo: "caminho de anexo montado à mão — use caminhoAnexoSuporte(uid, ticketId, nome)",
          });
        }
        if (/\.upload\(/.test(texto) && !/caminho/.test(texto)) {
          v.push({
            portao: "caminho_anexo",
            caminho: a.caminho,
            linha: n,
            motivo: "upload sem variável `caminho` à vista — o caminho tem de vir de caminhoAnexoSuporte",
          });
        }
      }
    }
    return v;
  },
};

// ───────────────────────────── 6 · fronteira de arquivos (E-009/E-010) ─────────────────────────────

export const PREFIXOS_PERMITIDOS = [
  "app/(app)/configuracoes/",
  "components/configuracoes/",
  "components/suporte/",
  "tests/",
];

/** `components/sidebar.tsx` é exceção NOMINAL da ARB-05: 2 inserções, como último commit. */
export const EXCECOES_FRONTEIRA = ["components/sidebar.tsx"];

export const PORTAO_FRONTEIRA: Portao = {
  nome: "fronteira",
  prova: "nenhum arquivo da trilha fora de app/(app)/configuracoes, components/{configuracoes,suporte} e tests",
  avaliar(arquivos) {
    return arquivos
      .filter(
        (a) =>
          !EXCECOES_FRONTEIRA.includes(a.caminho) &&
          !PREFIXOS_PERMITIDOS.some((p) => a.caminho.startsWith(p)),
      )
      .map((a) => ({
        portao: "fronteira",
        caminho: a.caminho,
        motivo: "arquivo fora da fronteira da Web-B (ARB-04/ARB-05) — colisão de trilha é o erro mais caro da noite",
      }));
  },
};

// ───────────────── 7 · a UI não conhece a palavra "token" ─────────────────

/**
 * O EARS que a auditoria mediu sem comando: *"o sistema NÃO DEVE exibir, transmitir ou registrar
 * qualquer token"* e *"a web NÃO DEVE conter, receber ou transmitir token de instância"*.
 *
 * A primeira versão desta regra proibia a PALAVRA token em qualquer `.tsx` — e reprovou o rodapé
 * que o próprio mockup escreveu: *"O token de cada número vem do ambiente do servidor — esta tela
 * nunca o pede"*. A frase é o oposto do defeito: ela existe para a gestora saber que a tela não
 * pede credencial. Proibir a palavra teria apagado a única linha que conta isso.
 *
 * O que não pode descer é o VALOR. Então a regra passou a mirar token em posição de CÓDIGO —
 * `.token`, `token=`, `token:`, `{token}`, `process.env.*TOKEN` — e a deixar passar a palavra
 * em prosa, JSX de texto e comentário.
 */
/** token em posição de CÓDIGO: acesso a campo, atribuição, chave de objeto, interpolação, env. */
const TOKEN_COMO_VALOR =
  /[.{[]\s*\w*token\w*\b|\b\w*token\w*\s*[=:(]|process\.env\.\w*TOKEN/i;

export const PORTAO_TOKEN_NA_UI: Portao = {
  nome: "token_na_ui",
  prova:
    "nenhum .tsx e nenhum componente client da Web-B referencia um VALOR de token (a palavra em prosa é permitida — é ela que diz à gestora que a tela não pede credencial)",
  avaliar(arquivos) {
    const v: Violacao[] = [];
    for (const a of arquivos) {
      if (!a.caminho.endsWith(".tsx") && !ehCliente(a)) continue;
      for (const { n, texto } of linhas(a)) {
        if (!TOKEN_COMO_VALOR.test(texto)) continue;
        {
          v.push({
            portao: "token_na_ui",
            caminho: a.caminho,
            linha: n,
            motivo: "valor de token referenciado do lado que vira HTML — a tela mostra presença/ausência de credencial, nunca a credencial",
          });
        }
      }
    }
    return v;
  },
};

// ───────────────── 8 · todo tipo de evento escrito está declarado ─────────────────

/**
 * O irmão estático do fail-closed de `dados/porta.ts`: nenhum tipo de evento aparece nas actions
 * sem conferência declarada. Pega o caso que o fail-closed só pegaria em produção — alguém
 * acrescenta `canal_despareado` numa action, o tipo entra no ledger, o dispatcher não tem o ramo,
 * e a tela diz "salvo" até alguém reparar que nada mudou.
 */
const LITERAL_TIPO_EVENTO = /"(canal_[a-z_]+|config_[a-z_]+|suporte_[a-z_]+|aceite_[a-z_]+)"/g;

export const PORTAO_TIPOS_DECLARADOS: Portao = {
  nome: "tipos_declarados",
  prova: "todo tipo de evento citado nas actions está em TIPOS_ESCRITOS_WEB_B (com conferência ou exceção)",
  avaliar(arquivos) {
    const v: Violacao[] = [];
    for (const a of arquivos) {
      if (!a.caminho.endsWith("actions.ts") || herdado(a.caminho)) continue;
      for (const { n, texto } of linhas(a)) {
        for (const m of texto.matchAll(LITERAL_TIPO_EVENTO)) {
          const tipo = m[1];
          if (!TIPOS_ESCRITOS_WEB_B.includes(tipo)) {
            v.push({
              portao: "tipos_declarados",
              caminho: a.caminho,
              linha: n,
              motivo: `o tipo "${tipo}" é escrito sem conferência declarada — tipo novo sem ramo no dispatcher entra no ledger e não projeta`,
            });
          }
        }
      }
    }
    return v;
  },
};


// ───────────────── 9 · contraste: --pt não carrega informação (C1 do parecer) ─────────────────

/**
 * `--pt` (#9AA1AA) dá 2,61:1 sobre branco — o mínimo AA para texto é 4,5:1, e `--suave` (#67707B)
 * dá 5,02:1. O r9-tokens declara `--pt` como "placeholder, desabilitado". Usá-lo em RÓTULO
 * ESTRUTURAL (cabeçalho de coluna, nome de seção, grupo da sub-nav) apaga a diferença entre "isto
 * está vazio" e "isto é o nome da coluna", e joga o menor texto da interface para 2,6:1.
 *
 * A regra mira a assinatura de rótulo estrutural — `uppercase` com `tracking-` — porque é ela que
 * distingue um label de um placeholder sem precisar julgar a palavra.
 */
const ROTULO_ESTRUTURAL = /uppercase[^"`]*tracking-\[|tracking-\[[^"`]*uppercase/;

export const PORTAO_CONTRASTE: Portao = {
  nome: "contraste",
  prova:
    "nenhum rótulo estrutural (uppercase + tracking) usa text-mute — --pt fica em placeholder e desabilitado, onde 2,6:1 não carrega informação",
  avaliar(arquivos) {
    const v: Violacao[] = [];
    for (const a of arquivos) {
      if (!/\.tsx$/.test(a.caminho)) continue;
      for (const { n, texto } of linhas(a)) {
        if (ROTULO_ESTRUTURAL.test(texto) && /text-mute/.test(texto)) {
          v.push({
            portao: "contraste",
            caminho: a.caminho,
            linha: n,
            motivo: "rótulo estrutural em text-mute (--pt, 2,61:1) — use text-suave (--suave, 5,02:1)",
          });
        }
      }
    }
    return v;
  },
};

export const PORTOES: Portao[] = [
  PORTAO_SEGREDO,
  PORTAO_CLIENTE,
  PORTAO_READBACK,
  PORTAO_PAPEL,
  PORTAO_CAMINHO_ANEXO,
  PORTAO_FRONTEIRA,
  PORTAO_TOKEN_NA_UI,
  PORTAO_TIPOS_DECLARADOS,
  PORTAO_CONTRASTE,
];

export function avaliarTodos(arquivos: Arquivo[]): Violacao[] {
  return PORTOES.flatMap((p) => p.avaliar(arquivos));
}

export function formatarViolacoes(v: Violacao[]): string {
  if (v.length === 0) return "sem violações";
  return v
    .map((x) => `  ✗ [${x.portao}] ${x.caminho}${x.linha ? `:${x.linha}` : ""} — ${x.motivo}`)
    .join("\n");
}

/** Exportado para o teste do próprio portão: `ehServidor` documenta o outro lado de `ehCliente`. */
export const _internos = { ehCliente, ehServidor };
