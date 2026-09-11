import { redirect } from "next/navigation";

/** Seção extinta em 10/09 (22:00): Meta/Lite/Kommo/Resend foram para Canais › Meta / WhatsApp. */
export default function IntegracoesRedirect() {
  redirect("/configuracoes/meta");
}
