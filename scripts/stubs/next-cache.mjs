// stubs/next-cache.mjs — `next/cache` fora do Next.
//
// Existe por um motivo só: deixar o PORTÃO importar e executar o `registrarEventoUI` REAL, em vez
// de uma réplica. A réplica foi o buraco que o Portão explorou no R16-23 — ele moveu o
// `return { ok: true }` para ANTES do `revalidatePath`, a string que o grep procurava continuou no
// arquivo, e o portão passou verde sobre um artefato que tinha parado de propagar `duplicado`.
//
// `revalidatePath` só faz sentido dentro do ciclo de requisição do Next; fora dele é ruído, não
// comportamento. Virar no-op AQUI não enfraquece nada: o que o portão julga é o valor de retorno e
// a conferência da projeção, e ambos acontecem antes. Nada do produto muda — o stub vive no
// resolvedor do portão, e o `next/cache` de verdade continua sendo o que roda em produção.

export function revalidatePath() {}
export function revalidateTag() {}
export function unstable_cache(fn) {
  return fn;
}
export function unstable_noStore() {}
