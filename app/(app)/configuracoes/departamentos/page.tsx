import { redirect } from "next/navigation";

/** A tela de departamentos virou sub-seção de Cargos (11/09) — a rota antiga continua valendo. */
export default function DepartamentosPage() {
  redirect("/configuracoes/cargos");
}
