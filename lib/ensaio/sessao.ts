import { cookies } from "next/headers";
import {
  escolherAtivo,
  ordenar,
  resolverEscopo,
  visiveisPara,
  type Departamento,
  type ParAncestral,
  type Sinonimo,
} from "@/lib/departamentos/escopo";
import { lerPreferenciaDepartamento, type EstadoEscopo } from "@/lib/dados/departamentos";
import { COOKIE_COMO, ensaioLigado, pessoaPorChave, type PessoaEnsaio } from "./modo";

/**
 * A SESSÃO DE ENSAIO — lida do cookie, montada da fixture, sem tocar no Supabase.
 *
 * Só existe com `ensaioLigado()`. Fora dele, `lerSessaoEnsaio()` devolve `null` e o layout segue o
 * caminho real (`supabase.auth.getUser()`), inalterado.
 */
export function lerSessaoEnsaio(): PessoaEnsaio | null {
  if (!ensaioLigado()) return null;
  try {
    return pessoaPorChave(cookies().get(COOKIE_COMO)?.value ?? null);
  } catch {
    return pessoaPorChave(null);
  }
}

/**
 * Departamentos da fixture — a árvore real da Me Escuta em 09/2026 (`core.v_departamento`):
 * Comercial (Pré-venda = entrada, Pós-venda > Cobrança), Clínico (fronteira constitucional),
 * Marketing. Ordem e níveis são os da config publicada.
 */
export const DEPARTAMENTOS_ENSAIO: Departamento[] = [
  { chave: "comercial", rotulo: "Comercial", pai: null, nivel: 1, ativo: true, entrada: false, ordem: 10 },
  { chave: "pre_venda", rotulo: "Pré-venda", pai: "comercial", nivel: 2, ativo: true, entrada: true, ordem: 11 },
  { chave: "pos_venda", rotulo: "Pós-venda", pai: "comercial", nivel: 2, ativo: true, entrada: false, ordem: 12 },
  { chave: "cobranca", rotulo: "Cobrança", pai: "pos_venda", nivel: 3, ativo: true, entrada: false, ordem: 13 },
  { chave: "clinico", rotulo: "Clínico", pai: null, nivel: 1, ativo: true, entrada: false, ordem: 20 },
  { chave: "marketing", rotulo: "Marketing", pai: null, nivel: 1, ativo: true, entrada: false, ordem: 30 },
];

/** Fechamento transitivo, inclui a si mesma (como `core.v_departamento_arvore`). */
export const ARVORE_ENSAIO: ParAncestral[] = (() => {
  const saida: ParAncestral[] = [];
  for (const d of DEPARTAMENTOS_ENSAIO) {
    let atual: string | null = d.chave;
    while (atual) {
      saida.push({ chave: d.chave, ancestral: atual });
      atual = DEPARTAMENTOS_ENSAIO.find((x) => x.chave === atual)?.pai ?? null;
    }
  }
  return saida;
})();

export const SINONIMOS_ENSAIO: Sinonimo[] = [
  { chave: "pre_venda", sinonimo: "vendas" },
  { chave: "pre_venda", sinonimo: "comercial_pre" },
];

/** Rótulo de um departamento pela chave — para badges em tabelas. */
export function rotuloDepartamento(chave: string | null | undefined): string {
  if (!chave) return "—";
  return DEPARTAMENTOS_ENSAIO.find((d) => d.chave === chave)?.rotulo ?? chave;
}

/**
 * O `EstadoEscopo` que o layout real produz, calculado com as MESMAS funções puras
 * (`visiveisPara`, `escolherAtivo`, `resolverEscopo`) sobre a fixture — o header de ensaio se
 * comporta exatamente como o de produção para cada papel: Rodolfo vê tudo, Sara vê Comercial e
 * filhos, a fono vê só Clínico (fail-closed do `clinico` exercido de verdade).
 */
export function estadoEscopoEnsaio(pessoa: PessoaEnsaio): EstadoEscopo {
  const vinculos = pessoa.departamentos.map((d) => d.departamento);
  const visiveis = ordenar(visiveisPara(DEPARTAMENTOS_ENSAIO, vinculos, pessoa.papel));
  const ativo = escolherAtivo(visiveis, lerPreferenciaDepartamento());
  const chaves = visiveis.map((d) => d.chave);
  const escopo = ativo ? resolverEscopo(ativo.chave, ARVORE_ENSAIO, SINONIMOS_ENSAIO, chaves) : null;
  return { visiveis, ativo, escopo, indisponivel: false, arvore: ARVORE_ENSAIO, sinonimos: SINONIMOS_ENSAIO };
}
