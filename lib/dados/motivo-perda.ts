import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * MOTIVO DE PERDA (R20) — vocabulário controlado de por que um lead foi perdido.
 *
 * Por que estruturado e não texto livre: sem chave estável, (a) o breakup automático não tem
 * condição de disparo — "mandar a mensagem de despedida só para quem sumiu, nunca para quem achou
 * caro" é uma pergunta que texto livre não responde; e (b) o relatório de perda vira nuvem de
 * palavras. O Kommo pede motivo na saída e é de lá que a lista abaixo veio.
 *
 * Vocabulário é CONFIG (Constituição §4), não código: mora em `core.config` sob a chave
 * `motivo_perda`, e muda pela tela sem deploy. A migration `0122` semeia a v1.
 *
 * DEGRAU DECLARADO: enquanto a `0122` não descer, a config não existe e a leitura devolve a
 * semente embutida abaixo, com `daConfig: false`. A tela funciona; quem olha vê o aviso. É o
 * contrário de silenciar — o pior desenho aqui seria a tela não deixar marcar perdido porque uma
 * migration não rodou.
 */

export interface MotivoPerda {
  chave: string;
  rotulo: string;
  /** pede uma frase junto (ex.: "outro", "preço") — a chave estrutura, o texto explica */
  pedeDetalhe?: boolean;
}

/** Semente v1 — espelho dos motivos que a operação usa hoje no Kommo. */
export const MOTIVOS_SEMENTE: MotivoPerda[] = [
  { chave: "sem_resposta", rotulo: "Parou de responder" },
  { chave: "preco", rotulo: "Preço / não cabe no orçamento", pedeDetalhe: true },
  { chave: "credito_negado", rotulo: "Crédito negado" },
  { chave: "comprou_concorrente", rotulo: "Comprou de concorrente", pedeDetalhe: true },
  { chave: "sem_perda_auditiva", rotulo: "Não tem perda auditiva" },
  { chave: "adiou", rotulo: "Adiou a decisão" },
  { chave: "contato_invalido", rotulo: "Contato inválido / trote" },
  { chave: "duplicado", rotulo: "Lead duplicado" },
  { chave: "outro", rotulo: "Outro", pedeDetalhe: true },
];

export interface MotivosPerda {
  motivos: MotivoPerda[];
  /** false = veio da semente embutida porque a config ainda não existe (pré-0122) */
  daConfig: boolean;
}

export async function lerMotivosPerda(): Promise<MotivosPerda> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .schema("core")
      .from("v_config_vigente")
      .select("payload")
      .eq("nome", "motivo_perda")
      .maybeSingle();
    const lista = (data as any)?.payload?.motivos;
    if (error || !Array.isArray(lista) || lista.length === 0) return { motivos: MOTIVOS_SEMENTE, daConfig: false };
    const motivos = lista
      .filter((m: any) => m?.chave && m?.ativo !== false)
      .map((m: any) => ({
        chave: String(m.chave),
        rotulo: String(m.rotulo ?? m.chave),
        pedeDetalhe: m.pede_detalhe === true,
      }));
    return motivos.length > 0 ? { motivos, daConfig: true } : { motivos: MOTIVOS_SEMENTE, daConfig: false };
  } catch {
    return { motivos: MOTIVOS_SEMENTE, daConfig: false };
  }
}
