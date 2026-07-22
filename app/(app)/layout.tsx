import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Navegacao } from "@/components/navegacao";
import { PresencaBatimento } from "@/components/presenca-batimento";

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
      <header className="flex h-[58px] flex-shrink-0 items-center gap-6 border-b border-borda bg-branco px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-laranja text-lg text-branco shadow-laranja">
            👂
          </span>
          <span className="font-serif text-lg font-semibold text-navy">
            me <b className="font-bold text-laranja">escuta</b>
          </span>
        </div>
        <Navegacao />
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-[0.82rem] font-semibold text-navy">{email}</div>
            <div className="text-[0.68rem] text-mute">operação · sistema</div>
          </div>
          <span className="grid h-[33px] w-[33px] place-items-center rounded-full bg-navy text-[0.76rem] font-bold text-branco">
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
      <PresencaBatimento />
    </div>
  );
}
