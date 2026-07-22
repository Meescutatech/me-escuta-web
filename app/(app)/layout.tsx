import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Navegacao } from "@/components/navegacao";

/** Iniciais pro avatar (ex.: "diogo@meescuta.com" → "DI"). */
function iniciais(email: string): string {
  const nome = email.split("@")[0].replace(/[._-]/g, " ").trim();
  const partes = nome.split(/\s+/);
  const letras = partes.length >= 2 ? partes[0][0] + partes[1][0] : nome.slice(0, 2);
  return letras.toUpperCase();
}

/**
 * Shell autenticado. Topbar com a identidade Me Escuta (👂 + "me escuta" serif), navegação
 * principal e chip do usuário. Sem sessão → /login (defesa além do middleware).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const email = user.email ?? "usuario";

  return (
    <div className="flex min-h-screen flex-col">
      {/* topbar r9: 52px, marca com ponto laranja, hairline única */}
      <header className="flex h-[52px] flex-shrink-0 items-center gap-7 border-b border-linha bg-branco px-5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-laranja" aria-hidden />
          <span className="text-[15px] font-[650] text-navy">Me Escuta</span>
        </div>
        <Navegacao />
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[12.5px] text-suave sm:block">{email}</span>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-navy text-[11.5px] font-semibold text-branco">
            {iniciais(email)}
          </span>
          <form action="/auth/signout" method="post">
            <Button variante="outline" type="submit" className="px-3 py-1.5 text-xs">
              Sair
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
