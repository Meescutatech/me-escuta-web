import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

/**
 * Shell autenticado (W1). Se não houver sessão, redireciona pro /login (defesa além do middleware).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4 text-sm">
            <span className="font-semibold">Me Escuta</span>
            <Link href="/timeline" className="text-muted-foreground hover:text-foreground">
              Timeline
            </Link>
            <Link href="/fila" className="text-muted-foreground hover:text-foreground">
              Fila
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <Button variante="outline" type="submit">
                Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
