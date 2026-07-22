import { redirect } from "next/navigation";

/** /configuracoes → a única seção viva do Bloco C. */
export default function ConfiguracoesIndex() {
  redirect("/configuracoes/membros");
}
