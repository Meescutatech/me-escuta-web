// stubs/supabase-server.mjs — `@/lib/supabase/server` fora do Next.
//
// O `criarClienteServidor()` de verdade lê a sessão dos COOKIES, e cookie só existe dentro de uma
// requisição. Fora do Next ele estoura "cookies was called outside a request scope" — e é por isso
// que o portão do F6 usava uma réplica da action em vez da action real.
//
// Aqui o portão publica em `globalThis.__PORTAO_CLIENTE__` um cliente supabase-js JÁ AUTENTICADO
// (usuário real, criado e logado pelo portão), e este stub o entrega. A sessão e o RLS são os de
// um usuário de verdade: o que muda é de onde o token veio, não quem ele é.
//
// Se o portão esquecer de publicar o cliente, isto ESTOURA em vez de devolver algo inerte —
// portão que fala com um cliente fantasma passaria verde sem tocar no banco.

export function criarClienteServidor() {
  const cliente = globalThis.__PORTAO_CLIENTE__;
  if (!cliente) {
    throw new Error(
      "stub de @/lib/supabase/server usado sem cliente publicado — o portão precisa definir " +
        "globalThis.__PORTAO_CLIENTE__ com um cliente autenticado antes de importar a action real",
    );
  }
  return cliente;
}
