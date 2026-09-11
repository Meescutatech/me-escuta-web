/**
 * TELEFONE BR — lógica PURA para "este número já é de alguém?" (W-D3, nova conversa por número).
 *
 * O problema que isto resolve não é formatar: é o NONO DÍGITO. O Kommo guardou anos de leads
 * antes e depois da virada (2012-2016, por DDD), e o mesmo celular existe na base como
 * `+55 31 8871-2345` e como `+55 31 98871-2345`. Quem digita hoje digita com o 9; quem procura
 * só pelo que digitou não acha o lead antigo e cadastra em dobro — que é exatamente o
 * "cliente com dois cadastros" que a Sara reclama no Kommo.
 *
 * Então a busca compara por CHAVE CANÔNICA (E.164 com o 9 posto quando falta) e devolve as
 * VARIANTES (com e sem o 9) para quem precisa do texto gravado. Sem I/O, sem biblioteca —
 * a regra cabe em vinte linhas e o teste morde ela direto.
 */

/** Só dígitos, com o 55 na frente quando vier número nacional. */
export function digitosBR(entrada: string): string {
  let d = entrada.replace(/\D/g, "");
  if (!d) return "";
  // "0" de operadora (031…) ou DDD sem país: 10/11 dígitos → nacional
  if (d.length === 12 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}

/**
 * Chave canônica: `55` + DDD + celular COM o 9. Fixo (2-5 depois do DDD) fica como está.
 * Devolve `null` quando não é um número brasileiro reconhecível.
 */
export function chaveCanonicaBR(entrada: string): string | null {
  const d = digitosBR(entrada);
  if (!d.startsWith("55")) return null;
  const nacional = d.slice(2);
  if (nacional.length < 10 || nacional.length > 11) return null;
  const ddd = nacional.slice(0, 2);
  const numero = nacional.slice(2);
  if (numero.length === 9) {
    return numero.startsWith("9") ? `55${ddd}${numero}` : null;
  }
  // 8 dígitos: celular antigo (começa em 6-9) ganha o 9; fixo (2-5) fica
  if (/^[6-9]/.test(numero)) return `55${ddd}9${numero}`;
  return `55${ddd}${numero}`;
}

/** As formas em que o mesmo número pode estar gravado: com e sem o 9. Sempre em E.164. */
export function variantesBR(entrada: string): string[] {
  const chave = chaveCanonicaBR(entrada);
  if (!chave) {
    const d = digitosBR(entrada);
    return d ? [`+${d}`] : [];
  }
  const ddd = chave.slice(2, 4);
  const numero = chave.slice(4);
  const saida = [`+${chave}`];
  if (numero.length === 9 && numero.startsWith("9")) saida.push(`+55${ddd}${numero.slice(1)}`);
  return saida;
}

/** O mesmo número, ignorando o 9? */
export function mesmoNumeroBR(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ka = chaveCanonicaBR(a) ?? digitosBR(a);
  const kb = chaveCanonicaBR(b) ?? digitosBR(b);
  return !!ka && ka === kb;
}

/** "(31) 99881-1234" — como a lista e o cabeçalho já mostram. */
export function formatarNacionalBR(entrada: string | null | undefined): string {
  if (!entrada) return "—";
  let d = entrada.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return entrada;
}

/** O número digitado tem o 9 e o gravado não (ou vice-versa)? Para a tela DIZER como achou. */
export function achouPelaVarianteBR(digitado: string, gravado: string): boolean {
  return mesmoNumeroBR(digitado, gravado) && digitosBR(digitado) !== digitosBR(gravado);
}
