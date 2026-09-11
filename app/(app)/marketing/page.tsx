import { redirect } from "next/navigation";

/**
 * `/marketing` virou a aba Marketing do dashboard do dono (W-D4, 10/09/2026): mesma leitura
 * (`lerMarketing`, D68), mesma recusa por papel e por flag — só que dentro de `/`. A rota fica
 * para não quebrar link antigo (sidebar, MCP do Fernando, favoritos) e só redireciona, levando o
 * período junto.
 */
export default function MarketingPage({ searchParams }: { searchParams?: { p?: string } }) {
  const p = searchParams?.p;
  const periodo = p === "7d" ? "7" : p === "90d" ? "90" : "30";
  redirect(`/?aba=marketing&periodo=${periodo}`);
}
