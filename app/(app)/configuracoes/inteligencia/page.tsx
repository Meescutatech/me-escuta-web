import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { mapaInteligenciaEnsaio } from "@/lib/ensaio/inteligencia";
import { MapaInteligenciaTela } from "@/components/inteligencia/mapa";

export const dynamic = "force-dynamic";

/** /configuracoes/inteligencia — o Mapa: números → agentes → quem valida → o que sai. */
export default function InteligenciaPage() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/agentes");
  return <MapaInteligenciaTela mapa={mapaInteligenciaEnsaio(new Date())} />;
}
