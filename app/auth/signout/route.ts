import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Encerra a sessão e volta para /login. */
export async function POST(request: NextRequest) {
  const supabase = criarClienteServidor();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
