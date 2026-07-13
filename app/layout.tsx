import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Me Escuta — Sistema",
  description: "Operação de agentes com human-in-the-loop. Timeline do ledger + fila de sugestões.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
