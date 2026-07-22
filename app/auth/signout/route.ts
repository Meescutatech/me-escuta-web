import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Encerra a sessão e volta para /login. */
export async function POST(request: NextRequest) {
  const supabase = criarClienteServidor();
  // sessao_encerrada só no logout EXPLÍCITO (spec §5.2); fim de presença real é derivado
  // por ausência de batimento — este evento é melhor esforço e nunca bloqueia o logout.
  await supabase
    .schema("api")
    .rpc("registrar_evento", {
      p: { tipo: "sessao_encerrada", id_externo: randomUUID(), versao_payload: 1, payload: {} },
    })
    .then(() => undefined, () => undefined);
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
