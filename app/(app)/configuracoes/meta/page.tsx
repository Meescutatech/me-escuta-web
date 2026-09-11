import { redirect } from "next/navigation";

/** Meta/WhatsApp saiu de Canais em 11/09 e virou Inteligência › Conexões. A rota antiga leva lá. */
export default function MetaPage() {
  redirect("/configuracoes/conexoes");
}
