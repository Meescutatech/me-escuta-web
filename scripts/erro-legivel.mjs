// erro-legivel.mjs — imprimir o erro REAL, não "{}".
//
// Achado do Portão no R16-23: em execuções sequenciais, os portões batiam no limite de criação de
// usuário do GoTrue e a mensagem saía como `{}`. A causa é banal e cara: `${erro.message}` de um
// objeto sem `message` vira `undefined`, e `JSON.stringify` de um Error vira `{}` porque `message`
// e `stack` não são enumeráveis. O portão reprovava dizendo nada, e quem lia gastava uma execução
// para descobrir que o problema era ambiente, não produto.

/** Texto útil de qualquer coisa que uma API de erro devolva — Error, objeto do GoTrue, ou string. */
export function erroLegivel(erro) {
  if (erro == null) return "(sem erro)";
  if (typeof erro === "string") return erro;

  const partes = [];
  const campo = (k) => {
    const v = erro?.[k];
    if (v != null && v !== "") partes.push(`${k}=${typeof v === "object" ? JSON.stringify(v) : v}`);
  };
  // a ordem importa: `message` primeiro, porque é o que responde "o que aconteceu"
  for (const k of ["message", "name", "status", "code", "error_code", "hint", "details"]) campo(k);

  if (partes.length === 0) {
    // último recurso: enumeráveis próprios + a forma bruta, para nunca cair em "{}"
    try {
      const cru = JSON.stringify(erro, Object.getOwnPropertyNames(erro));
      if (cru && cru !== "{}") return cru;
    } catch {
      /* segue para o String() abaixo */
    }
    return String(erro);
  }
  return partes.join(" · ");
}
