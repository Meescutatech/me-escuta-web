"use server";

import { randomUUID } from "crypto";
import {
  registrarEventoComReadback,
  type ResultadoAcao,
} from "@/components/configuracoes/dados/porta";
import {
  paraDefinicaoDaPorta,
  type CategoriaTemplate,
  type DefinicaoTemplate,
} from "@/lib/templates-whatsapp";

/**
 * Ações da tela Templates de WhatsApp (SPEC-B §3 e §8).
 *
 * Escrita pelo PONTO ÚNICO da Web-B (`components/configuracoes/dados/porta.ts`), como toda ação
 * sob `/configuracoes`. Não é cerimônia: é o que faz o readback ser obrigatório em vez de
 * opcional. Sucesso só volta depois de reler a projeção — e a lição que pagou por isso é a tela
 * que dizia "salvo" com a lista vazia (R14/R15, ao vivo).
 *
 * ⚠ **Consequência de hoje, declarada:** `core.template_whatsapp` ainda não existe (entregável de
 * B1). Enquanto ela não subir, o readback RECUSA estas escritas com motivo legível. É o
 * comportamento certo — o oposto seria a tela afirmar que criou algo que não existe em lugar
 * nenhum.
 *
 * NENHUMA CHAMADA À META SAI DAQUI. Toda chamada à Meta é efeito colateral e vai por fila (§1.3),
 * pelo mesmo motivo do sender: o POST da Graph não é idempotente, e fundir submissão com escrita
 * no ledger transformaria indisponibilidade da Meta em falha de gravação nossa.
 *
 * CRIAR E SUBMETER SÃO DOIS ATOS (§3), e é a decisão de desenho mais cara deste arquivo:
 * `template_whatsapp_criado` nasce em `rascunho`, local, sem tocar na Meta; submeter é um segundo
 * ato, com autor, e é o que enfileira. Nome de template não se edita, e nome apagado fica
 * bloqueado para reuso — o rascunho revisável é a diferença entre corrigir e queimar o nome.
 *
 * As guardas de papel (admin/owner) são do BANCO. A UI só esconde o botão que a porta recusaria.
 *
 * 🔴 **RF-8, e é o que fazia esta tela não gravar nada.** A tela fala a forma PLANA; a porta
 * (`0117`) exige a forma ANINHADA (`corpo.texto`, `cabecalho.tipo`, exemplos posicionais por
 * componente). Mandar o rascunho cru daqui produziria *"a definicao exige corpo.texto"* em 100%
 * das criações. A tradução é `paraDefinicaoDaPorta`, e ela é obrigatória nesta fronteira.
 */

const ROTAS = ["/configuracoes/templates-whatsapp", "/conversas"];

export async function criarTemplateWhatsapp(dados: {
  nome: string;
  idioma: string;
  categoria: CategoriaTemplate;
  canal_id: string;
  definicao: DefinicaoTemplate;
}): Promise<ResultadoAcao> {
  return registrarEventoComReadback({
    tipo: "template_whatsapp_criado",
    idExterno: randomUUID(),
    payload: {
      nome: dados.nome.trim(),
      idioma: dados.idioma,
      categoria: dados.categoria,
      canal_id: dados.canal_id,
      definicao: paraDefinicaoDaPorta(dados.definicao) as unknown as Record<string, unknown>,
    },
    revalidar: ROTAS,
  });
}

/** O único ato que aciona a Meta — e ele só enfileira; quem chama a Graph é o worker (§5). */
export async function submeterTemplateWhatsapp(templateId: string): Promise<ResultadoAcao> {
  return registrarEventoComReadback({
    tipo: "template_whatsapp_submetido",
    idExterno: randomUUID(),
    payload: { template_id: templateId },
    revalidar: ROTAS,
  });
}

export async function arquivarTemplateWhatsapp(
  templateId: string,
  motivo?: string,
): Promise<ResultadoAcao> {
  const payload: Record<string, unknown> = { template_id: templateId };
  const m = motivo?.trim();
  if (m) payload.motivo = m;
  return registrarEventoComReadback({
    tipo: "template_whatsapp_arquivado",
    idExterno: randomUUID(),
    payload,
    revalidar: ROTAS,
  });
}
