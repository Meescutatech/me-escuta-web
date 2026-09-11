import { redirect } from "next/navigation";

/** "Integrações" nunca foi seção — virou Inteligência › Conexões. */
export default function IntegracoesPage() {
  redirect("/configuracoes/conexoes");
}
