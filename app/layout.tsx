import type { Metadata } from "next";
import { inter } from "@/lib/fontes";
import "./globals.css";

// Favicon = orelha do logo em data-URI (r9-tokens §5; stroke 11 pra legibilidade em 16px)
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 100' fill='none' stroke='%23EC662E' stroke-width='11' stroke-linecap='round'%3E%3Cpath d='M12 62 C4 48 6 28 20 16 C34 5 56 5 67 17 C76 26 78 40 71 50 C66 58 58 61 54 68 C50 75 50 82 44 87 C37 93 27 90 24 83'/%3E%3Cpath d='M34 48 C31 38 37 28 47 28 C56 28 61 36 58 43 C56 49 49 50 45 46'/%3E%3Cpath d='M84 14 C92 23 92 37 85 46'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: "Me Escuta — Sistema",
  description: "Operação de agentes com human-in-the-loop. Funil, conversas e o ledger do sistema.",
  icons: { icon: FAVICON },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-screen bg-fundo text-texto antialiased">{children}</body>
    </html>
  );
}
