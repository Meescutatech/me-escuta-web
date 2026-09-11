import { redirect } from "next/navigation";
import { lerSessaoEnsaio } from "@/lib/ensaio/sessao";
import { gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import { gerarConvitesEnsaio, gerarMembrosEnsaio } from "@/lib/ensaio/fixtures/membros";
import { gerarAgentesEnsaio } from "@/lib/ensaio/fixtures/agentes";
import { HubConfiguracoes } from "@/components/ensaio/hub-configuracoes";

export const dynamic = "force-dynamic";

/**
 * /configuracoes — o ÍNDICE do hub: um card por seção, cada um com o número que resume o estado
 * dela ("4 pessoas · 2 convites", "3 números no ar", "2 de 4 agentes ligados"). Fora do ensaio
 * ainda redireciona para Membros (a única seção viva do Bloco C); o índice real vem quando cada
 * seção tiver leitura própria de estado.
 */
export default function ConfiguracoesIndex() {
  const ensaio = lerSessaoEnsaio();
  if (!ensaio) redirect("/configuracoes/membros");

  const agora = new Date();
  const membros = gerarMembrosEnsaio(agora);
  const convites = gerarConvitesEnsaio(agora);
  const canais = gerarCanaisEnsaio(agora);
  const agentes = gerarAgentesEnsaio(agora);

  const resumo: Record<string, { linha: string; atencao?: string }> = {
    "/configuracoes/geral": { linha: "Me Escuta · Contagem/MG · Brasília" },
    "/configuracoes/departamentos": { linha: "6 departamentos · 2 com gestora" },
    "/configuracoes/meta": {
      linha: "app em produção · webhook ok",
      atencao: "Kommo: importação 92 %",
    },
    "/configuracoes/inteligencia": { linha: "3 números → 2 agentes ligados → 2 validadoras" },
    "/configuracoes/claude": { linha: "2 pessoas conectadas", atencao: "OAuth do cowork pendente" },
    "/configuracoes/regras": { linha: "SLA por etapa no padrão · janela 24 h" },
    "/configuracoes/identidades": { linha: "745 leads aguardando de-para do Kommo" },
    "/configuracoes/suporte": { linha: "1 relato aberto" },
    "/configuracoes/membros": {
      linha: `${membros.filter((m) => m.ativo).length} pessoas com acesso`,
      atencao: convites.length ? `${convites.length} convite${convites.length > 1 ? "s" : ""} pendente${convites.length > 1 ? "s" : ""}` : undefined,
    },
    "/configuracoes/canais": { linha: `${canais.filter((c) => c.ativo).length} de ${canais.length} números no ar` },
    "/configuracoes/agentes": {
      linha: `${agentes.filter((a) => a.ativo).length} de ${agentes.length} ligados`,
      atencao: agentes.some((a) => a.pendencias.length) ? "Levindo e Priscila esperam credencial" : undefined,
    },
    "/configuracoes/funil": { linha: "7 etapas · prazo por etapa no padrão" },
    "/configuracoes/templates": { linha: "6 mensagens prontas ativas" },
    "/configuracoes/avancado": { linha: "12 configurações publicadas · última há 2 dias" },
  };

  return <HubConfiguracoes resumo={resumo} />;
}
