"use server";

import { randomUUID } from "crypto";
import {
  lerPapelAtual,
  registrarEventoComReadback,
  type ResultadoAcao,
} from "@/components/configuracoes/dados/porta";
import {
  lerConfigVigente,
  lerContextoValidacao,
} from "@/components/configuracoes/dados/config";
import {
  conteudoIgual,
  payloadConfigPublicada,
  podeEditarConfig,
  podePublicarConfig,
  temErro,
  validarConteudo,
  versaoResultante,
  type Conteudo,
  type ProblemaConfig,
} from "@/components/configuracoes/regras/config.ts";

/**
 * F14 · Publicação de configuração de sistema.
 *
 * A ordem das guardas é a que evita mentira, não a que é bonita:
 *   1. papel  — não oferecer o que a porta recusaria;
 *   2. allowlist — nome inexistente e `flag.*` são recusados pela porta (ARB-18.3); as demais
 *      exclusões são desta tela e cada uma diz por quê (no-op é pior que recusa);
 *   3. contrato por nome — espelho do parser real do leitor, com o contexto do banco injetado
 *      (etapas em uso, tipos em uso, slugs com valor). É a lição do `contrato-followup`;
 *   4. igual ao vigente — versão nova sem mudança polui o histórico;
 *   5. `versao_base` — a TRAVA OTIMISTA. Ela é da porta, não daqui: só o banco sabe o que chegou
 *      na frente. A tela manda a versão que tinha na tela e trata `serialization_failure` como
 *      "recarregue", não como erro genérico.
 */

const ROTA = "/configuracoes/avancado";

export interface ResultadoPublicacao extends ResultadoAcao {
  /** versão que resultaria da publicação, para a tela confirmar o efeito. */
  versaoResultante?: number;
  problemas?: ProblemaConfig[];
  /** true = a versão vigente mudou entre abrir e publicar. A tela manda recarregar. */
  conflito?: boolean;
}

export async function publicarConfig(entrada: {
  nome: string;
  versaoBase: number;
  conteudo: Conteudo;
  justificativa: string;
}): Promise<ResultadoPublicacao> {
  const papel = await lerPapelAtual();
  if (!podePublicarConfig(papel)) {
    return { ok: false, motivo: "publicar configuração exige admin ou owner", classe: "permissao" };
  }

  const [vigente, ctx] = await Promise.all([lerConfigVigente(entrada.nome), lerContextoValidacao()]);
  if (!vigente) {
    return {
      ok: false,
      motivo: `a config "${entrada.nome}" não existe em core.config — criar chave nova é migration, e a porta recusa`,
      classe: "recusa",
    };
  }

  const veredito = podeEditarConfig(entrada.nome, [vigente.nome]);
  if (!veredito.editavel) return { ok: false, motivo: veredito.motivo, classe: "recusa" };

  const problemas = validarConteudo(entrada.nome, entrada.conteudo, ctx);
  if (temErro(problemas)) {
    return { ok: false, motivo: problemas.find((p) => p.gravidade === "erro")!.motivo, problemas, classe: "recusa" };
  }

  if (conteudoIgual(entrada.conteudo, vigente.payload)) {
    return { ok: false, motivo: "nada mudou em relação à versão vigente", problemas, classe: "recusa" };
  }

  if ((entrada.justificativa ?? "").trim().length === 0) {
    return { ok: false, motivo: "escreva o que mudou — é o que o histórico vai mostrar daqui a três meses", classe: "recusa" };
  }

  const r = await registrarEventoComReadback({
    tipo: "config_publicada",
    payload: payloadConfigPublicada({
      nome: entrada.nome,
      versaoBase: entrada.versaoBase,
      conteudo: entrada.conteudo,
      justificativa: entrada.justificativa,
    }),
    idExterno: randomUUID(),
    revalidar: [ROTA, "/configuracoes/funil", "/funil", "/conversas"],
  });

  if (!r.ok) {
    // conflito de versão chega como SQLSTATE 40001 — o texto da porta já explica o que houve e
    // qual versão chegou na frente; o que muda aqui é a tela mandar recarregar em vez de repetir.
    return { ...r, conflito: r.classe === "conflito_versao", problemas };
  }
  return { ...r, versaoResultante: versaoResultante(entrada.versaoBase), problemas };
}

/** Pré-visualização do veredito, para a tela desabilitar o botão em vez de receber vermelho. */
export async function conferirAntesDePublicar(entrada: {
  nome: string;
  conteudo: Conteudo;
}): Promise<{ problemas: ProblemaConfig[]; igualAoVigente: boolean; versaoVigente: number | null }> {
  const [vigente, ctx] = await Promise.all([lerConfigVigente(entrada.nome), lerContextoValidacao()]);
  return {
    problemas: validarConteudo(entrada.nome, entrada.conteudo, ctx),
    igualAoVigente: vigente ? conteudoIgual(entrada.conteudo, vigente.payload) : false,
    versaoVigente: vigente?.versao ?? null,
  };
}
