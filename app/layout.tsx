import type { Metadata } from "next";
import { inter, fraunces } from "@/lib/fontes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Me Escuta — Sistema",
  description: "Operação de agentes com human-in-the-loop. Funil, conversas e o ledger do sistema.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-fundo text-texto antialiased">{children}</body>
    </html>
  );
}
