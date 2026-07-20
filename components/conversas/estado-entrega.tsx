import type { EstadoEntrega } from "@/lib/dados/conversas";
import { cn } from "@/lib/utils";

/**
 * Ícone do estado de entrega (SPEC RF-28, linguagem do WhatsApp — BENCHMARK-UX P4):
 * relógio (na_fila/enviando) → ✓ (enviado) → ✓✓ (entregue) → ✓✓ azul (lido).
 * `falhou` é tratado fora (linha de erro + tentar de novo). Sem status → não renderiza nada:
 * check só quando a projeção da Trilha A afirmar (fallback honesto, nunca check mentiroso).
 */
export function EstadoEntregaIcone({ estado }: { estado: EstadoEntrega | null | undefined }) {
  if (!estado || estado === "falhou") return null;

  if (estado === "na_fila" || estado === "enviando") {
    return (
      <svg
        viewBox="0 0 24 24"
        strokeWidth={2}
        strokeLinecap="round"
        className="inline-block h-[13px] w-[13px] stroke-mute align-[-2px]"
        fill="none"
        aria-label="aguardando envio"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  const duplo = estado === "entregue" || estado === "lido";
  return (
    <svg
      viewBox="0 0 26 24"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "inline-block h-[13px] w-[14px] align-[-2px]",
        estado === "lido" ? "stroke-azul" : "stroke-mute",
      )}
      fill="none"
      aria-label={estado === "lido" ? "lida" : estado === "entregue" ? "entregue" : "enviada"}
    >
      <path d="m2 13 4 4L15 8" />
      {duplo && <path d="m11 16.5 1.5 1.5L23 9" />}
    </svg>
  );
}
