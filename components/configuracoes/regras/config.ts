/**
 * F14 · REGRAS PURAS do editor de configuração de sistema.
 *
 * A promessa: um gestor muda valor de negócio — tipo de tarefa, horário, validade de convite —
 * pela tela, com histórico, sem deploy. Hoje mexer em qualquer uma delas é abrir migration.
 *
 * Quatro invariantes, cada uma com um defeito medido atrás:
 *
 *  1. CONFIG É IMUTÁVEL. Publicar é `insert` de versão nova; nunca `update`. `core.v_config_vigente`
 *     resolve a maior versão por nome, e `unique(nome, versao)` é a rede embaixo.
 *  2. TRAVA OTIMISTA, NÃO LAST-WRITE-WINS. A concorrência daqui não é evento fora de ordem: são
 *     DUAS GESTORAS COM A MESMA TELA ABERTA. `versao_base` faz a segunda ser RECUSADA com
 *     `serialization_failure`; sem ela, a segunda vence e a primeira "salvou" e sumiu.
 *  3. VALIDAR CONTRA O MESMO CONTRATO QUE O LEITOR APLICA. É a lição do `contrato-followup.ts`:
 *     valor que passa na tela e o motor não lê falha em silêncio. Por isso cada nome tem
 *     validador espelhando o parser real, e o espelho aponta o arquivo que ele espelha.
 *  4. ALLOWLIST (ARB-18.3). A porta recusa nome inexistente e prefixo `flag.*`. A tela não oferece
 *     o que a porta recusaria — e também não oferece o que seria NO-OP, que é pior que recusa
 *     porque parece ter funcionado.
 */

import { montarEnvelope, payloadSeguro, type EnvelopeEvento } from "./porta.ts";
import type { Papel } from "./canais.ts";

export type Conteudo = Record<string, unknown>;

export interface ConfigVigente {
  nome: string;
  versao: number;
  payload: Conteudo;
  vigente_desde: string | null;
}

export interface VersaoHistorico {
  nome: string;
  versao: number;
  payload: Conteudo;
  vigente_desde: string | null;
  criado_por: string | null;
  evento_id: string | null;
  vigente: boolean;
  publicado_por_nome: string | null;
  publicado_por_email: string | null;
}

export function podePublicarConfig(papel: Papel | null): boolean {
  return papel === "admin" || papel === "owner";
}

// ─────────────────────────────────────── allowlist ───────────────────────────────────────

export const PREFIXO_FLAG = "flag.";

export type MotivoForaDoEditor = "tela_dedicada" | "config_morta" | "interna";

export interface ContratoConfig {
  nome: string;
  rotulo: string;
  /** o que muda quando salvar — a peça de desenho desta tela. */
  consequencia: string;
  /** onde aquilo aparece, em nome de tela/arquivo que existe. */
  ondeAparece: string[];
  /** false = a tela mostra em leitura e diz por quê. */
  editorGenerico: boolean;
  foraDoEditor?: MotivoForaDoEditor;
  motivoForaDoEditor?: string;
  /** espelho do parser real; o comentário nomeia o arquivo espelhado. */
  validar: (c: Conteudo, ctx: ContextoValidacao) => ProblemaConfig[];
}

/** Dado do banco que o validador precisa e que não está no payload. Injetado, nunca lido daqui. */
export interface ContextoValidacao {
  /** chaves de etapa em uso por algum lead (mirror de `porta.validar_config_publicada`). */
  etapasEmUso?: string[];
  /** chaves de tipo de tarefa em uso por alguma tarefa. */
  tiposTarefaEmUso?: string[];
  /** slugs de campo da ficha com valor gravado em `core.lead_campo`. */
  slugsFichaEmUso?: string[];
}

export interface ProblemaConfig {
  campo: string;
  motivo: string;
  /** `aviso` não impede publicar; `erro` impede. */
  gravidade: "erro" | "aviso";
}

function erro(campo: string, motivo: string): ProblemaConfig {
  return { campo, motivo, gravidade: "erro" };
}
function aviso(campo: string, motivo: string): ProblemaConfig {
  return { campo, motivo, gravidade: "aviso" };
}

function lista(c: Conteudo, chave: string): unknown[] | null {
  const v = c?.[chave];
  return Array.isArray(v) ? v : null;
}

/** `[{chave, rotulo, ativo}]` — a forma que `tipo_tarefa` e `canal_captacao` compartilham. */
function validarCatalogoChaveRotulo(
  c: Conteudo,
  chaveLista: string,
  emUso: string[] | undefined,
  nomeDoQueSome: string,
): ProblemaConfig[] {
  const p: ProblemaConfig[] = [];
  const itens = lista(c, chaveLista);
  if (!itens) {
    p.push(erro(chaveLista, `a config precisa da chave "${chaveLista}" como lista — sem ela o leitor devolve vazio e o seletor da tela fica sem opção`));
    return p;
  }
  if (itens.length === 0) {
    p.push(erro(chaveLista, `a lista "${chaveLista}" está vazia — publicar assim apaga todas as opções da operação`));
  }
  const vistas = new Set<string>();
  itens.forEach((raw, i) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const chave = String(item.chave ?? "").trim();
    const rotulo = String(item.rotulo ?? "").trim();
    if (!chave) {
      p.push(erro(`${chaveLista}[${i}].chave`, "cada item precisa de uma chave (é o valor que fica gravado no dado, não o texto da tela)"));
    } else if (!/^[a-z0-9_]+$/.test(chave)) {
      p.push(erro(`${chaveLista}[${i}].chave`, `chave "${chave}" fora do formato: só minúsculas, números e _ (é comparada por igualdade exata no banco)`));
    } else if (vistas.has(chave)) {
      p.push(erro(`${chaveLista}[${i}].chave`, `chave "${chave}" repetida — a validação do banco casa a primeira e a segunda vira letra morta`));
    } else {
      vistas.add(chave);
    }
    if (!rotulo) {
      p.push(erro(`${chaveLista}[${i}].rotulo`, "cada item precisa de um rótulo — é o que a operação lê na tela"));
    }
    if (item.ativo !== undefined && typeof item.ativo !== "boolean") {
      p.push(erro(`${chaveLista}[${i}].ativo`, "`ativo` tem de ser verdadeiro ou falso"));
    }
  });
  for (const usada of emUso ?? []) {
    if (!vistas.has(usada)) {
      p.push(
        aviso(
          chaveLista,
          `"${usada}" está em uso e sumiu da lista: ${nomeDoQueSome}. O dado antigo não some, mas deixa de ter rótulo e não pode ser escolhido de novo.`,
        ),
      );
    }
  }
  return p;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CATALOGO: ContratoConfig[] = [
  {
    nome: "tipo_tarefa",
    rotulo: "Tipos de tarefa",
    consequencia:
      "O seletor de tipo no /task e na ficha do lead passa a oferecer exatamente esta lista. Tipo removido some do seletor; tarefa antiga com aquele tipo continua existindo.",
    ondeAparece: ["seletor de tipo da tarefa", "core.tipo_tarefa_valido() (recusa tarefa com tipo fora da lista)"],
    editorGenerico: true,
    // espelho de: core.tipo_tarefa_valido() (0037) + core.v_tipo_tarefa
    validar: (c, ctx) => validarCatalogoChaveRotulo(c, "tipos", ctx.tiposTarefaEmUso, "tarefas com esse tipo perdem o rótulo e a criação de novas é recusada pelo banco"),
  },
  {
    nome: "canal_captacao",
    rotulo: "Canais de captação",
    consequencia:
      "A taxonomia de origem do lead. A borda de captação recusa fonte fora desta lista, então tirar uma fonte que ainda chega derruba a captação daquele canal.",
    ondeAparece: ["core.canal_captacao_valido() (borda de captação)", "core.v_canal_captacao"],
    editorGenerico: true,
    // espelho de: core.canal_captacao_valido() (0057)
    validar: (c) => validarCatalogoChaveRotulo(c, "fontes", undefined, "a borda passa a recusar lead com essa fonte"),
  },
  {
    nome: "expediente",
    rotulo: "Horário de atendimento",
    consequencia:
      "Vale no PRÓXIMO disparo da Clara e do follow-up — sem deploy. Fora da janela, ela não escreve.",
    ondeAparece: ["Clara", "follow-up"],
    editorGenerico: true,
    validar: (c) => {
      const p: ProblemaConfig[] = [];
      const inicio = String(c?.inicio ?? "");
      const fim = String(c?.fim ?? "");
      if (!HORA.test(inicio)) p.push(erro("inicio", 'início fora do formato HH:MM (ex.: "08:00")'));
      if (!HORA.test(fim)) p.push(erro("fim", 'fim fora do formato HH:MM (ex.: "18:00")'));
      if (HORA.test(inicio) && HORA.test(fim) && inicio >= fim) {
        p.push(erro("fim", "o fim precisa ser depois do início — invertido, a janela fica vazia e a Clara nunca escreve"));
      }
      const dias = lista(c, "dias_semana");
      if (!dias) {
        p.push(erro("dias_semana", 'a config precisa de "dias_semana" como lista (0=domingo … 6=sábado)'));
      } else if (dias.length === 0) {
        p.push(erro("dias_semana", "sem nenhum dia marcado a Clara nunca atende"));
      } else {
        const invalidos = dias.filter((d) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6);
        if (invalidos.length > 0) p.push(erro("dias_semana", "dia da semana fora de 0..6"));
        if (new Set(dias.map(String)).size !== dias.length) p.push(erro("dias_semana", "dia repetido na lista"));
      }
      return p;
    },
  },
  {
    nome: "convite",
    rotulo: "Convite de membro",
    consequencia:
      "Vale para os convites criados a partir de agora — os já enviados mantêm a validade com que nasceram.",
    ondeAparece: ["fluxo de convite (api.criar_convite)", "/configuracoes/membros"],
    editorGenerico: true,
    // espelho de: 0035 (dias_validade lido na criação do convite)
    validar: (c) => {
      const p: ProblemaConfig[] = [];
      const dias = c?.dias_validade;
      if (!Number.isInteger(dias) || (dias as number) < 1 || (dias as number) > 90) {
        p.push(erro("dias_validade", "a validade precisa ser um número inteiro de 1 a 90 dias"));
      }
      if (typeof c?.envio_email_ativo !== "boolean") {
        p.push(erro("envio_email_ativo", "`envio_email_ativo` tem de ser verdadeiro ou falso"));
      } else if (c.envio_email_ativo === true) {
        p.push(
          aviso(
            "envio_email_ativo",
            "ligar o envio por e-mail sem DNS de envio configurado faz o convite não chegar e ninguém saber — hoje o convite vai por link (decisão de 22/07).",
          ),
        );
      }
      return p;
    },
  },
  {
    nome: "presenca",
    rotulo: "Presença (batimento)",
    consequencia:
      "Muda a JANELA usada pela métrica de presença no banco. NÃO muda a cadência real do front.",
    ondeAparece: ["core.presenca_janela (0036)"],
    editorGenerico: true,
    // espelho de: core.presenca_janela (0036, lê batimento_seg e tolerancia_seg) — e ATENÇÃO:
    // `interacao_seg` não tem leitor no banco, e batimento/interação estão HARDCODED no front
    // (lib/presenca.ts: BATIMENTO_MS=60000, INTERACAO_MS=300000). É a divergência clássica do
    // contrato-followup, ao contrário: aqui o número muda e o comportamento não.
    validar: (c) => {
      const p: ProblemaConfig[] = [];
      const num = (k: string) => (Number.isInteger(c?.[k]) ? (c[k] as number) : null);
      const bat = num("batimento_seg");
      const tol = num("tolerancia_seg");
      const inter = num("interacao_seg");
      if (bat === null || bat < 5) p.push(erro("batimento_seg", "batimento precisa ser inteiro de 5 segundos para cima"));
      if (tol === null || tol < 10) p.push(erro("tolerancia_seg", "tolerância precisa ser inteiro de 10 segundos para cima"));
      if (inter === null || inter < 30) p.push(erro("interacao_seg", "janela de interação precisa ser inteiro de 30 segundos para cima"));
      if (bat !== null && tol !== null && tol <= bat) {
        p.push(erro("tolerancia_seg", "a tolerância tem de ser maior que o batimento — igual ou menor, todo batimento pontual conta como atraso"));
      }
      if (bat !== null && bat !== 60) {
        p.push(
          aviso(
            "batimento_seg",
            "o front pulsa a cada 60 s POR CÓDIGO (lib/presenca.ts). Mudar aqui muda só a janela da métrica no banco; a cadência real continua 60 s até alguém mudar o código.",
          ),
        );
      }
      if (inter !== null && inter !== 300) {
        p.push(
          aviso(
            "interacao_seg",
            "nenhum leitor usa `interacao_seg`: o front usa 300 s por código. Este valor não tem efeito hoje.",
          ),
        );
      }
      return p;
    },
  },
  {
    nome: "ficha_lead",
    rotulo: "Campos da ficha do lead",
    consequencia:
      "Redesenha a ficha do lead para todo mundo, na hora. Campo que sai da config deixa de aparecer — o valor gravado continua no banco, mas some da tela.",
    ondeAparece: ["ficha do lead", "lib/dados/ficha-calculos.ts (parseConfigFicha)"],
    editorGenerico: true,
    // espelho de: parseConfigFicha (lib/dados/ficha-calculos.ts) — as MESMAS tolerâncias:
    // grupos[] com campos[]; campo sem slug é DESCARTADO pelo parser (aqui vira erro, porque
    // descarte silencioso na ficha é campo que some sem ninguém entender).
    validar: (c, ctx) => {
      const p: ProblemaConfig[] = [];
      const grupos = lista(c, "grupos");
      if (!grupos) {
        p.push(erro("grupos", 'a ficha precisa da chave "grupos" como lista — sem ela o parser devolve null e a tela mostra "ficha não configurada"'));
        return p;
      }
      if (grupos.length === 0) p.push(erro("grupos", "sem nenhum grupo a ficha do lead fica vazia para todo mundo"));
      const slugs = new Set<string>();
      grupos.forEach((graw, gi) => {
        const g = (graw ?? {}) as Record<string, unknown>;
        if (!String(g.nome ?? "").trim()) p.push(erro(`grupos[${gi}].nome`, "todo grupo precisa de nome"));
        const campos = Array.isArray(g.campos) ? g.campos : null;
        if (!campos) {
          p.push(erro(`grupos[${gi}].campos`, "todo grupo precisa da lista `campos`"));
          return;
        }
        campos.forEach((craw, ci) => {
          const campo = (craw ?? {}) as Record<string, unknown>;
          const slug = String(campo.slug ?? campo.chave ?? campo.id ?? "").trim();
          if (!slug) {
            p.push(erro(`grupos[${gi}].campos[${ci}].slug`, "campo sem slug é DESCARTADO em silêncio pelo leitor da ficha — some da tela sem erro"));
          } else if (slugs.has(slug)) {
            p.push(erro(`grupos[${gi}].campos[${ci}].slug`, `slug "${slug}" repetido — dois campos gravariam no mesmo lugar`));
          } else {
            slugs.add(slug);
          }
          if (!String(campo.rotulo ?? campo.nome ?? "").trim()) {
            p.push(erro(`grupos[${gi}].campos[${ci}].rotulo`, `campo "${slug || ci}" sem rótulo aparece com o slug cru na tela`));
          }
        });
      });
      for (const usado of ctx.slugsFichaEmUso ?? []) {
        if (!slugs.has(usado)) {
          p.push(aviso("grupos", `o campo "${usado}" tem valor gravado em leads e sumiu da ficha — o dado fica no banco, invisível na tela.`));
        }
      }
      return p;
    },
  },
  {
    nome: "funil_vendas",
    rotulo: "Etapas do funil",
    consequencia:
      "Muda o board inteiro. Etapa em uso que não for declarada faz o banco recusar a publicação — e, se passasse, deixaria card órfão sem coluna.",
    ondeAparece: ["board /funil", "core.etapa_valida()"],
    editorGenerico: false,
    foraDoEditor: "tela_dedicada",
    motivoForaDoEditor:
      "o funil tem tela própria (mockup H14-10): mexer nas etapas por editor de JSON genérico é a forma mais rápida de derrubar o board de 680 leads.",
    // espelho de: porta.validar_config_publicada (CONTRATO-C §7.4) + lerEtapasReais (lib/dados/funil.ts)
    validar: (c, ctx) => {
      const p: ProblemaConfig[] = [];
      const etapas = lista(c, "etapas");
      if (!etapas) {
        p.push(erro("etapas", 'funil_vendas exige a chave "etapas" como lista — é o que o banco recusa primeiro'));
        return p;
      }
      if (etapas.length === 0) p.push(erro("etapas", "board sem nenhuma etapa não existe"));
      const chaves = new Set<string>();
      etapas.forEach((raw, i) => {
        const e = (raw ?? {}) as Record<string, unknown>;
        const chave = String(e.chave ?? "").trim();
        if (!chave) p.push(erro(`etapas[${i}].chave`, "toda etapa precisa de chave — é ela que fica gravada no estado do lead"));
        else if (chaves.has(chave)) p.push(erro(`etapas[${i}].chave`, `etapa "${chave}" repetida`));
        else chaves.add(chave);
        if (!String(e.nome ?? "").trim()) p.push(erro(`etapas[${i}].nome`, "toda etapa precisa de nome visível"));
      });
      const faltando = (ctx.etapasEmUso ?? []).filter((x) => !chaves.has(x));
      if (faltando.length > 0) {
        p.push(
          erro(
            "etapas",
            `a versão nova não declara etapa(s) em uso por lead: ${faltando.join(", ")}. O banco recusa — e é bom que recuse: sem a etapa declarada, esses cards ficam sem coluna e o board para de aceitar movimentação deles.`,
          ),
        );
      }
      return p;
    },
  },
  {
    nome: "numero_whatsapp",
    rotulo: "Número → área",
    consequencia: "Nenhuma, hoje.",
    ondeAparece: ["core.area_do_numero() — sem chamador vivo"],
    editorGenerico: false,
    foraDoEditor: "config_morta",
    motivoForaDoEditor:
      "a ARB-18.2 cravou que a área efetiva vem de core.canal_whatsapp (config_jsonb->>'area'). Editar esta config seria um no-op invisível: a tela diria 'publicado' e o roteamento não mudaria. Mexa na área pela tela de Canais.",
    validar: () => [],
  },
  {
    nome: "demo_clara",
    rotulo: "Demo da Clara",
    consequencia: "Configuração da página da Clara.",
    ondeAparece: ["/configuracoes/clara"],
    editorGenerico: false,
    foraDoEditor: "tela_dedicada",
    motivoForaDoEditor: "essa config tem tela própria em /configuracoes/clara, com validação de contrato do runtime.",
    validar: () => [],
  },
];

const POR_NOME = new Map(CATALOGO.map((c) => [c.nome, c]));

export function contratoDe(nome: string): ContratoConfig | null {
  return POR_NOME.get(nome) ?? null;
}

export type VeredictoEdicao =
  | { editavel: true }
  | { editavel: false; motivo: string };

/**
 * ESPELHO da allowlist da porta (ARB-18.3) + as exclusões próprias da tela. As duas regras da
 * porta são duras (nome inexistente e `flag.*`); as outras são da tela, e cada uma diz por quê —
 * oferecer edição que vira no-op é pior que não oferecer, porque parece ter funcionado.
 */
export function podeEditarConfig(nome: string, nomesExistentes: string[]): VeredictoEdicao {
  if (nome.startsWith(PREFIXO_FLAG)) {
    return { editavel: false, motivo: "flags são internas e mudam por migration — não aparecem nesta tela" };
  }
  if (!nomesExistentes.includes(nome)) {
    return {
      editavel: false,
      motivo: "esta chave ainda não existe em core.config; criar chave nova é migration, e a porta recusa",
    };
  }
  const contrato = contratoDe(nome);
  if (!contrato) {
    return {
      editavel: false,
      motivo: "esta config não tem contrato de validação nesta tela — publicar sem espelho do leitor é o defeito que o contrato-followup existe para evitar",
    };
  }
  if (!contrato.editorGenerico) {
    return { editavel: false, motivo: contrato.motivoForaDoEditor ?? "editada em outro lugar" };
  }
  return { editavel: true };
}

// ─────────────────────────────────────── publicar ───────────────────────────────────────

export function validarConteudo(nome: string, conteudo: Conteudo, ctx: ContextoValidacao = {}): ProblemaConfig[] {
  const contrato = contratoDe(nome);
  if (!contrato) {
    return [erro("nome", `sem contrato de validação para "${nome}" — esta tela não publica o que não sabe validar`)];
  }
  if (!conteudo || typeof conteudo !== "object" || Array.isArray(conteudo)) {
    return [erro("conteudo", "o conteúdo tem de ser um objeto JSON — o banco recusa qualquer outra coisa")];
  }
  return contrato.validar(conteudo, ctx);
}

export function temErro(problemas: ProblemaConfig[]): boolean {
  return problemas.some((p) => p.gravidade === "erro");
}

/** Igualdade estrutural com ordem de chave irrelevante e ordem de array significativa. */
export function conteudoIgual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const aArr = Array.isArray(a);
  if (aArr !== Array.isArray(b)) return false;
  if (aArr) {
    const x = a as unknown[];
    const y = b as unknown[];
    return x.length === y.length && x.every((v, i) => conteudoIgual(v, y[i]));
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const kx = Object.keys(x);
  const ky = Object.keys(y);
  if (kx.length !== ky.length) return false;
  return kx.every((k) => Object.prototype.hasOwnProperty.call(y, k) && conteudoIgual(x[k], y[k]));
}

export interface EstadoBotaoPublicar {
  habilitado: boolean;
  motivo?: string;
}

/** Versão nova sem mudança polui o histórico — e histórico poluído é histórico que ninguém lê. */
export function estadoBotaoPublicar(entrada: {
  papel: Papel | null;
  editavel: boolean;
  conteudo: Conteudo;
  vigente: Conteudo | null;
  problemas: ProblemaConfig[];
  justificativa: string;
}): EstadoBotaoPublicar {
  if (!podePublicarConfig(entrada.papel)) return { habilitado: false, motivo: "publicar configuração exige admin ou owner" };
  if (!entrada.editavel) return { habilitado: false, motivo: "esta config não é editável por aqui" };
  if (temErro(entrada.problemas)) return { habilitado: false, motivo: "corrija os erros apontados antes de publicar" };
  if (entrada.vigente !== null && conteudoIgual(entrada.conteudo, entrada.vigente)) {
    return { habilitado: false, motivo: "nada mudou em relação à versão vigente" };
  }
  if ((entrada.justificativa ?? "").trim().length === 0) {
    return { habilitado: false, motivo: "escreva o que mudou — é o que o histórico vai mostrar daqui a três meses" };
  }
  return { habilitado: true };
}

export function versaoResultante(versaoBase: number): number {
  return versaoBase + 1;
}

export interface FormPublicacao {
  nome: string;
  versaoBase: number;
  conteudo: Conteudo;
  justificativa: string;
}

/**
 * A UI manda `versao_base`; a PORTA carimba `versao` no payload (CONTRATO-C §7.3). Mandar a
 * versão calculada daqui seria disputar com o banco o cálculo que só ele pode fazer sem corrida.
 */
export function payloadConfigPublicada(f: FormPublicacao): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nome: f.nome,
    versao_base: f.versaoBase,
    conteudo: f.conteudo,
  };
  const m = (f.justificativa ?? "").trim();
  if (m) payload.motivo = m;
  return payload;
}

export function envelopeConfigPublicada(
  idExterno: string,
  payload: Record<string, unknown>,
): { ok: true; envelope: EnvelopeEvento } | { ok: false; motivo: string } {
  const seguro = payloadSeguro(payload);
  if (!seguro.ok) return { ok: false, motivo: seguro.motivo! };
  return { ok: true, envelope: montarEnvelope("config_publicada", idExterno, payload) };
}

/**
 * Quem publicou, para o histórico. As 14 linhas de hoje devolvem null de propósito: nasceram de
 * `seed:0001`, `sistema:migration-0064`, `demo:diogo` — não são pessoas. O histórico dizer
 * "publicado por —" é honesto; inventar autor não é.
 */
export function autorDaVersao(v: VersaoHistorico): string | null {
  const nome = (v.publicado_por_nome ?? "").trim();
  if (nome) return nome;
  const email = (v.publicado_por_email ?? "").trim();
  if (email) return email;
  return null;
}

export function origemDaVersao(v: VersaoHistorico): "tela" | "migration_ou_script" {
  return v.evento_id ? "tela" : "migration_ou_script";
}

export function ordenarHistorico(linhas: VersaoHistorico[]): VersaoHistorico[] {
  return [...linhas].sort((a, b) => b.versao - a.versao);
}
