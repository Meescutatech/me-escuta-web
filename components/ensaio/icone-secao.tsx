import type { ReactNode } from "react";
import {
  UsersIcon,
  NetworkIcon,
  SmartphoneIcon,
  CloudCogIcon,
  WaypointsIcon,
  BrainCircuitIcon,
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

/** Um ícone lucide por seção do hub — usado pela navegação (layout) e pelas linhas do índice (page). */
export const ICONES_SECAO: Record<NomeIcone, ReactNode> = {
  membros: <UsersIcon />,
  departamentos: <NetworkIcon />,
  numeros: <SmartphoneIcon />,
  meta: <CloudCogIcon />,
  mapa: <WaypointsIcon />,
  agentes: <BrainCircuitIcon />,
  claude: <BotIcon />,
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
