import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerContadoresSidebar } from "@/lib/dados/sidebar";
import { lerNotificacoes } from "@/lib/dados/notificacoes";
import { Sidebar } from "@/components/sidebar";
import { PresencaBatimento } from "@/components/presenca-batimento";
import { Sino } from "@/components/notificacoes/sino";

/**
 * Shell autenticado (r9): SIDEBAR de ícones retrátil no lugar do menu de topo — colapsada
 * (60px) por padrão, expande no hover em overlay. O main tem margem FIXA de 60px: o
 * conteúdo nunca pula quando a sidebar abre. Sem sessão → /login (defesa além do middleware).
 *
 * R13/Bloco B: o SINO (D5) mora aqui, fixo no canto superior direito — o app não tem barra de
 * topo compartilhada, e o sino precisa existir em toda tela autenticada.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [contadores, notificacoes] = await Promise.all([
    lerContadoresSidebar(),
    lerNotificacoes(),
  ]);

  return (
    <div className="min-h-screen pl-[60px]">
      <Sidebar
        email={user.email ?? "usuario"}
        contFunil={contadores.funil}
        contNaoLidas={contadores.naoLidas}
        contVencidas={contadores.tarefasVencidas}
      />
      <Sino inicial={notificacoes.itens} disponivel={notificacoes.disponivel} />
      <main>{children}</main>
      <PresencaBatimento />
    </div>
  );
}
