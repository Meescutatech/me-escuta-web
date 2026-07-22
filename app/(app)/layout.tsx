import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerContadoresSidebar } from "@/lib/dados/sidebar";
import { Sidebar } from "@/components/sidebar";
import { PresencaBatimento } from "@/components/presenca-batimento";

/**
 * Shell autenticado (r9): SIDEBAR de ícones retrátil no lugar do menu de topo — colapsada
 * (60px) por padrão, expande no hover em overlay. O main tem margem FIXA de 60px: o
 * conteúdo nunca pula quando a sidebar abre. Sem sessão → /login (defesa além do middleware).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const contadores = await lerContadoresSidebar();

  return (
    <div className="min-h-screen pl-[60px]">
      <Sidebar
        email={user.email ?? "usuario"}
        contFunil={contadores.funil}
        contNaoLidas={contadores.naoLidas}
      />
      <main>{children}</main>
      <PresencaBatimento />
    </div>
  );
}
