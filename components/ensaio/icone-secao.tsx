import type { ReactNode } from "react";
import {
  UsersIcon,
  IdCardIcon,
  SmartphoneIcon,
  CableIcon,
  WaypointsIcon,
  BotIcon,
  KanbanIcon,
  MessageSquareTextIcon,
  GaugeIcon,
  ActivityIcon,
  Building2Icon,
  FingerprintIcon,
  LifeBuoyIcon,
  ScrollTextIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { IconeSecao as NomeIcone } from "@/lib/ensaio/config-secoes";
import { MarcaJarvis } from "@/components/jarvis/marca";

/**
 * Um ícone lucide por seção — a nav lateral é o único lugar que os usa desde que o hub-índice
 * morreu (11/09). `cargos` é o crachá e não mais o organograma: o que se escolhe é o cargo, e a
 * árvore de departamentos virou sub-seção. `conexoes` é o cabo, e não a nuvem da Meta: a seção
 * cobre cinco conexões, não só uma.
 */
export const ICONES_SECAO: Record<NomeIcone, ReactNode> = {
  membros: <UsersIcon />,
  cargos: <IdCardIcon />,
  numeros: <SmartphoneIcon />,
  mapa: <WaypointsIcon />,
  agentes: <MarcaJarvis />,
  claude: <BotIcon />,
  conexoes: <CableIcon />,
  funil: <KanbanIcon />,
  templates: <MessageSquareTextIcon />,
  regras: <GaugeIcon />,
  eventos: <ActivityIcon />,
  geral: <Building2Icon />,
  identidades: <FingerprintIcon />,
  suporte: <LifeBuoyIcon />,
  auditoria: <ScrollTextIcon />,
};

export function IconeSecao({ nome, className }: { nome: NomeIcone; className?: string }) {
  return <span className={cn("inline-flex [&_svg]:size-4", className)}>{ICONES_SECAO[nome]}</span>;
}
