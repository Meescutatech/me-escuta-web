import type { PessoaEnsaio } from "../modo";

/**
 * CLAUDE (MCP) de ensaio — o que cada CARGO consegue fazer pelo Claude, as ferramentas expostas
 * e quem já conectou. O escopo é derivado do papel + lotação (R4 do contrato): o MCP não abre
 * nada que a pessoa não veria na tela.
 */

export interface FerramentaMcp {
  chave: string;
  rotulo: string;
  descricao: string;
  /** leitura ou ação (ação sempre passa pela porta, com a pessoa como ator) */
  tipo: "ler" | "agir";
}

export interface EscopoMcp {
  titulo: string;
  frase: string;
  ferramentas: FerramentaMcp[];
}

const F = {
  conversas_ler: { chave: "conversas.ler", rotulo: "Ler conversas", descricao: "As conversas e mensagens que você vê na caixa de entrada.", tipo: "ler" as const },
  conversas_responder: { chave: "conversas.responder", rotulo: "Responder pelo seu número", descricao: "Enviar mensagem como você, pelo canal da conversa.", tipo: "agir" as const },
  leads_ler: { chave: "leads.ler", rotulo: "Ler o funil", descricao: "Leads, etapa, valor, dono e histórico.", tipo: "ler" as const },
  leads_mover: { chave: "leads.mover", rotulo: "Mover etapa", descricao: "Trocar a etapa de um lead, com você como autora.", tipo: "agir" as const },
  tarefas_ler: { chave: "tarefas.ler", rotulo: "Ler tarefas", descricao: "Suas tarefas e as do seu departamento.", tipo: "ler" as const },
  tarefas_criar: { chave: "tarefas.criar", rotulo: "Criar e concluir tarefas", descricao: "Tarefa com prazo e responsável; concluir com resultado.", tipo: "agir" as const },
  pacientes_ler: { chave: "pacientes.ler", rotulo: "Ler os seus pacientes", descricao: "Ficha, exames e adaptação dos pacientes atendidos por você.", tipo: "ler" as const },
  captacao_ler: { chave: "captacao.ler", rotulo: "Ler captação e mídia", descricao: "Leads por origem, custo por campanha, CPL.", tipo: "ler" as const },
  relatorios_ler: { chave: "relatorios.ler", rotulo: "Ler relatórios", descricao: "O dashboard: por pessoa, por canal, funil no período.", tipo: "ler" as const },
  config_ler: { chave: "config.ler", rotulo: "Ler configurações", descricao: "Membros, números, agentes e o que está publicado.", tipo: "ler" as const },
  agentes_autonomia: { chave: "agentes.autonomia", rotulo: "Mudar autonomia dos agentes", descricao: "Publicar a régua por tipo de ação — nunca o que a Constituição tranca.", tipo: "agir" as const },
};

export function escopoMcpPara(pessoa: PessoaEnsaio): EscopoMcp {
  if (pessoa.papel === "owner" || pessoa.papel === "admin") {
    return {
      titulo: pessoa.papel === "owner" ? "Dono · tudo" : "Admin · tudo, menos trocar o dono",
      frase: "Você vê e faz pelo Claude tudo o que faz na tela: conversas, funil, tarefas, relatórios, configurações e a autonomia dos agentes.",
      ferramentas: [F.conversas_ler, F.conversas_responder, F.leads_ler, F.leads_mover, F.tarefas_ler, F.tarefas_criar, F.relatorios_ler, F.captacao_ler, F.config_ler, F.agentes_autonomia],
    };
  }
  if (pessoa.papel === "marketing") {
    return {
      titulo: "Marketing · captação e relatórios",
      frase: "Você lê captação, custo de mídia e os relatórios. Não vê conversas nem pacientes.",
      ferramentas: [F.captacao_ler, F.relatorios_ler],
    };
  }
  const clinico = pessoa.departamentos.some((d) => d.departamento === "clinico");
  if (clinico) {
    return {
      titulo: "Fonoaudióloga · os seus pacientes",
      frase: "Você lê e responde as conversas do seu número, vê os seus pacientes e cuida das suas tarefas. Nada de outros departamentos.",
      ferramentas: [F.conversas_ler, F.conversas_responder, F.pacientes_ler, F.tarefas_ler, F.tarefas_criar],
    };
  }
  const gestora = pessoa.departamentos.some((d) => d.papel_no_departamento === "gestor");
  return {
    titulo: gestora ? "Gestora de Pré-venda · mensagens, leads e tarefas" : "Pré-venda · mensagens, leads e tarefas",
    frase: "Você lê e responde conversas de Pré-venda, move leads no funil e cria ou conclui tarefas — tudo como você, pelo seu login.",
    ferramentas: [F.conversas_ler, F.conversas_responder, F.leads_ler, F.leads_mover, F.tarefas_ler, F.tarefas_criar],
  };
}

export interface ConexaoMcp {
  usuario_id: string;
  nome: string;
  cliente: "Claude Desktop" | "Claude Code" | "Claude (web/cowork)";
  conectado_em: string;
  ultimo_uso_em: string | null;
  chamadas_7d: number;
}

export function gerarConexoesMcp(agora: Date = new Date()): ConexaoMcp[] {
  const t = agora.getTime();
  const H = 3_600_000;
  return [
    { usuario_id: "e0000000-0000-4000-8000-000000000003", nome: "Diogo Tambasco", cliente: "Claude Code", conectado_em: new Date(t - 9 * 24 * H).toISOString(), ultimo_uso_em: new Date(t - 40 * 60_000).toISOString(), chamadas_7d: 312 },
    { usuario_id: "f0000000-0000-4000-8000-000000000101", nome: "Fernando Lopes", cliente: "Claude Desktop", conectado_em: new Date(t - 2 * 24 * H).toISOString(), ultimo_uso_em: new Date(t - 5 * H).toISOString(), chamadas_7d: 47 },
  ];
}

export const ENDERECO_MCP = "https://mcp.meescuta.com/sse";
