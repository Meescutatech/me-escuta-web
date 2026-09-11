"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { interpretarContexto, sugestoesPorContexto, type ContextoTela, type PapelUsuario } from "./contrato";

/**
 * O CONTEXTO DE TELA DO JARVIS (W-JX, 11/09/2026) — "pergunto no dashboard, ele me responde no
 * dashboard".
 *
 * Aqui mora o que o Jarvis sabe sobre ONDE a pessoa está quando ela o chama: a rota, os filtros
 * ligados, o item aberto, o título da tela, as perguntas que fazem sentido AQUI e o que ele tem a
 * dizer sobre ESTA tela (o `aviso`, que faz o dock piscar).
 *
 * Duas camadas, e a de baixo já basta:
 *   1. a BASE vem de graça do `usePathname()` + `useSearchParams()` — toda tela tem contexto sem
 *      escrever uma linha;
 *   2. a tela REFINA com `useContextoJarvis({...})` quando sabe mais do que a URL conta (o nome do
 *      paciente da conversa aberta, o aviso "4 sem resposta", as perguntas próprias).
 *
 * Para as telas (o que os irmãos precisam chamar):
 *
 *     useContextoJarvis({
 *       titulo: "Conversas",
 *       item: { tipo: "conversa", id: conversaId, rotulo: "Maria Aparecida" },
 *       sugestoes: ["O que o Jarvis sugere aqui?"],
 *       aviso: { quantidade: 4, texto: "conversas sem resposta", pergunta: "Quantas conversas estão sem resposta?" },
 *     });
 *
 * É um efeito: pode ser chamado com valor que muda a cada render (a comparação é por conteúdo,
 * não por referência — sem laço infinito). Ao desmontar, o registro da tela some sozinho.
 *
 * Para abrir o Jarvis de qualquer lugar: `const { abrir } = useJarvis(); abrir("pergunta opcional")`.
 * Sem provedor montado, `useJarvis()` devolve no-ops — nada quebra numa tela isolada.
 */

export type TipoItem = "lead" | "conversa" | "tarefa" | "campanha";

export interface ItemDaTela {
  tipo: TipoItem;
  id: string;
  /** nome para a pessoa ler: "Maria Aparecida" */
  rotulo?: string | null;
}

/** O que o Jarvis tem a dizer sobre ESTA tela — é isto que faz o dock falar. */
export interface AvisoJarvis {
  /** "leads parados" — o número vem separado para o dock poder destacá-lo */
  texto: string;
  quantidade?: number | null;
  /** DE ONDE veio: "no funil", "nesta conversa", "em tarefas". Sem isto o dock fica solto. */
  onde?: string | null;
  /** uma linha do que ele diria — aparece ao passar o mouse, antes de abrir qualquer coisa */
  previa?: string | null;
  /** a pergunta que o clique no dock já dispara */
  pergunta?: string | null;
}

/**
 * AS TRÊS ALTURAS DO JARVIS (11/09, depois do "não pode ficar assim jogado no canto"):
 *   fechado — a pílula ancorada, dizendo de onde vem o que ela tem a dizer;
 *   pequeno — a pílula VIRA um campo fino ali mesmo: pergunta curta, resposta em 1-3 linhas, no
 *             máximo uma ação. Sem véu, sem escurecer nada, sem tirar ninguém do lugar;
 *   popup   — o overlay ancorado no alto, para o que precisa de blocos, listas e trace.
 * ⌘K sobe um degrau de cada vez (fechado → pequeno → popup); ⇧⌘K vai direto ao popup.
 */
export type ModoJarvis = "fechado" | "pequeno" | "popup";

export interface ContextoJarvisTela {
  rota: string;
  busca: string | null;
  titulo: string | null;
  item: ItemDaTela | null;
  filtros: Record<string, string>;
  sugestoes: string[] | null;
  aviso: AvisoJarvis | null;
}

/** O que uma tela registra — tudo opcional; o que não vier, a URL preenche. */
export type RegistroDeTela = Partial<Omit<ContextoJarvisTela, "rota" | "busca" | "filtros">> & {
  filtros?: Record<string, string> | null;
};

interface ValorJarvis {
  contexto: ContextoJarvisTela;
  /** o contexto no formato do contrato do runtime (F9) */
  contratoTela: ContextoTela;
  modo: ModoJarvis;
  /** atalho de leitura: `modo !== "fechado"` */
  aberto: boolean;
  abrir: (pergunta?: string | null, modo?: ModoJarvis) => void;
  /** do pequeno para o popup, guardando a pergunta que já estava lá */
  expandir: (pergunta?: string | null) => void;
  fechar: () => void;
  /** ⌘K: sobe um degrau; do popup, fecha */
  alternar: () => void;
  /** pergunta que o overlay deve disparar assim que abrir (consumida uma vez) */
  perguntaPendente: string | null;
  consumirPergunta: () => void;
  registrar: (id: string, registro: RegistroDeTela | null) => void;
  papel: PapelUsuario;
  usuarioId: string;
  ensaio: boolean;
  montado: boolean;
}

const Ctx = createContext<ValorJarvis | null>(null);

const VAZIO: ContextoJarvisTela = { rota: "/", busca: null, titulo: null, item: null, filtros: {}, sugestoes: null, aviso: null };

const SEM_PROVEDOR: ValorJarvis = {
  contexto: VAZIO,
  contratoTela: { rota: "/", busca: null, lead_id: null, conversa_id: null },
  modo: "fechado",
  aberto: false,
  abrir: () => {},
  expandir: () => {},
  fechar: () => {},
  alternar: () => {},
  perguntaPendente: null,
  consumirPergunta: () => {},
  registrar: () => {},
  papel: "membro",
  usuarioId: "",
  ensaio: false,
  montado: false,
};

/** Controle do Jarvis de qualquer componente. Sem provedor, devolve no-ops. */
export function useJarvis(): ValorJarvis {
  return useContext(Ctx) ?? SEM_PROVEDOR;
}

/**
 * A TELA REGISTRA O QUE SABE. Chame no corpo do componente da tela; a comparação é por conteúdo,
 * então pode passar objeto literal.
 */
export function useContextoJarvis(registro: RegistroDeTela | null | undefined): void {
  const { registrar } = useJarvis();
  const id = useIdEstavel();
  const serial = JSON.stringify(registro ?? null);
  useEffect(() => {
    registrar(id, serial === "null" ? null : (JSON.parse(serial) as RegistroDeTela));
    return () => registrar(id, null);
  }, [id, serial, registrar]);
}

let contador = 0;
function useIdEstavel(): string {
  const ref = useRef<string | null>(null);
  if (ref.current === null) ref.current = `tela-${++contador}`;
  return ref.current;
}

/** Filtros legíveis da URL — sem os identificadores técnicos, que viram `item`. */
function filtrosDe(busca: string | null): Record<string, string> {
  if (!busca) return {};
  const fora = new Set(["lead", "c", "conversa", "como", "pergunta", "contexto", "jarvis"]);
  const saida: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(busca)) {
    if (!fora.has(k) && v) saida[k] = v;
  }
  return saida;
}

/** "no funil · etapa qualificado" — a linha que o overlay mostra no topo. */
export function ondeEstou(c: ContextoJarvisTela): string {
  const nome =
    c.titulo ??
    (c.rota === "/"
      ? "no dashboard"
      : c.rota.startsWith("/funil")
        ? "no funil"
        : c.rota.startsWith("/conversas")
          ? "nas conversas"
          : c.rota.startsWith("/tarefas")
            ? "nas tarefas"
            : c.rota.startsWith("/marketing")
              ? "em marketing"
              : c.rota.startsWith("/configuracoes")
                ? "em configurações"
                : c.rota.replace(/^\//, ""));
  const base = c.titulo ? `em ${c.titulo}` : nome;
  const partes = [base];
  if (c.item?.rotulo) partes.push(c.item.rotulo);
  const filtros = Object.entries(c.filtros).map(([k, v]) => `${k} ${v.replace(/_/g, " ")}`);
  if (filtros.length) partes.push(filtros.join(" · "));
  return partes.join(" · ");
}

/** "no funil", "nesta conversa", "em tarefas" — o de-onde que o dock precisa dizer antes de abrir. */
export function ondeCurto(c: ContextoJarvisTela): string {
  if (c.item?.tipo === "conversa") return "nesta conversa";
  if (c.item?.tipo === "lead") return "neste lead";
  if (c.rota === "/") return "no dashboard";
  if (c.rota.startsWith("/funil")) return "no funil";
  if (c.rota.startsWith("/conversas")) return "nas conversas";
  if (c.rota.startsWith("/tarefas")) return "em tarefas";
  if (c.rota.startsWith("/marketing")) return "em marketing";
  if (c.rota.startsWith("/configuracoes")) return "nas configurações";
  return `em ${c.rota.replace(/^\//, "")}`;
}

/** As perguntas que cabem AQUI: as da tela primeiro; sem elas, as do contrato. */
export function sugestoesDaTela(c: ContextoJarvisTela, contrato: ContextoTela, papel: PapelUsuario): string[] {
  if (c.sugestoes && c.sugestoes.length > 0) return c.sugestoes.slice(0, 4);
  return sugestoesPorContexto(contrato, papel).slice(0, 4);
}

export function ProvedorJarvis({
  usuarioId,
  papel,
  ensaio = false,
  children,
}: {
  usuarioId: string;
  papel: PapelUsuario;
  ensaio?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const busca = useSearchParams();
  const [registros, setRegistros] = useState<Record<string, RegistroDeTela>>({});
  const [modo, setModo] = useState<ModoJarvis>("fechado");
  const [perguntaPendente, setPerguntaPendente] = useState<string | null>(null);

  const registrar = useCallback((id: string, registro: RegistroDeTela | null) => {
    setRegistros((r) => {
      if (registro === null) {
        if (!(id in r)) return r;
        const { [id]: _fora, ...resto } = r;
        return resto;
      }
      return { ...r, [id]: registro };
    });
  }, []);

  const q = busca.toString();
  const buscaCrua = q ? `?${q}` : null;

  const contexto = useMemo<ContextoJarvisTela>(() => {
    const rota = (pathname || "/").replace(/\/+$/, "") || "/";
    const base: ContextoJarvisTela = { ...VAZIO, rota, busca: buscaCrua, filtros: filtrosDe(buscaCrua) };
    // a última tela a registrar ganha — telas aninhadas refinam a de fora
    for (const r of Object.values(registros)) {
      if (r.titulo !== undefined) base.titulo = r.titulo ?? null;
      if (r.item !== undefined) base.item = r.item ?? null;
      if (r.sugestoes !== undefined) base.sugestoes = r.sugestoes ?? null;
      if (r.aviso !== undefined) base.aviso = r.aviso ?? null;
      if (r.filtros !== undefined && r.filtros) base.filtros = { ...base.filtros, ...r.filtros };
    }
    return base;
  }, [pathname, buscaCrua, registros]);

  const contratoTela = useMemo<ContextoTela>(() => {
    const cru = `${contexto.rota}${contexto.busca ?? ""}`;
    const c = interpretarContexto(cru);
    if (contexto.item?.tipo === "conversa" && !c.conversa_id) c.conversa_id = contexto.item.id;
    if (contexto.item?.tipo === "lead" && !c.lead_id) c.lead_id = contexto.item.id;
    return c;
  }, [contexto]);

  /*
   * LINK QUE JÁ ABRE O JARVIS: `?jarvis=pequeno|popup` (opcionalmente com `&pergunta=`) sobre
   * QUALQUER tela. Serve para mandar "olha isto" para alguém, para a demo, e é como os prints
   * desta rodada foram tirados. Dispara uma vez e limpa os parâmetros da URL, para que um reload
   * não repita a pergunta — mesmo cuidado que a `/jarvis?pergunta=` já tinha.
   */
  const deepLink = useRef(false);
  useEffect(() => {
    if (deepLink.current) return;
    const alvo = busca.get("jarvis");
    if (alvo !== "pequeno" && alvo !== "popup") return;
    deepLink.current = true;
    const q = (busca.get("pergunta") ?? "").trim().slice(0, 500) || null;
    if (q) setPerguntaPendente(q);
    setModo(alvo);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("jarvis");
      url.searchParams.delete("pergunta");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* sem URL para limpar */
    }
  }, [busca]);

  const abrir = useCallback((pergunta?: string | null, alvo: ModoJarvis = "pequeno") => {
    if (pergunta) setPerguntaPendente(pergunta);
    setModo(alvo === "fechado" ? "pequeno" : alvo);
  }, []);
  const expandir = useCallback((pergunta?: string | null) => {
    if (pergunta) setPerguntaPendente(pergunta);
    setModo("popup");
  }, []);
  const fechar = useCallback(() => {
    setModo("fechado");
    setPerguntaPendente(null);
  }, []);
  const alternar = useCallback(() => setModo((m) => (m === "fechado" ? "pequeno" : m === "pequeno" ? "popup" : "fechado")), []);
  const consumirPergunta = useCallback(() => setPerguntaPendente(null), []);

  const valor = useMemo<ValorJarvis>(
    () => ({ contexto, contratoTela, modo, aberto: modo !== "fechado", abrir, expandir, fechar, alternar, perguntaPendente, consumirPergunta, registrar, papel, usuarioId, ensaio, montado: true }),
    [contexto, contratoTela, modo, abrir, expandir, fechar, alternar, perguntaPendente, consumirPergunta, registrar, papel, usuarioId, ensaio],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
