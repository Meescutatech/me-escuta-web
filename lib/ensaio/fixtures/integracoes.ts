/**
 * INTEGRAÇÕES de ensaio — o que é da CONEXÃO com terceiros, separado dos NÚMEROS (pedido do Diogo,
 * 10/09: "conexão do WhatsApp/Meta ≠ números conectados"). O número é operação; a integração é o
 * encanamento que faz o número existir.
 *
 * Os valores são verossímeis e FICTÍCIOS (ids, URLs). Nada aqui é credencial — tokens aparecem só
 * como "válido até" e "…últimos 4".
 */

export type EstadoIntegracao = "conectada" | "atencao" | "desconectada" | "nao_configurada";

export interface Integracao {
  chave: string;
  nome: string;
  fornecedor: string;
  papel: string;
  estado: EstadoIntegracao;
  resumo: string;
  campos: Array<{ rotulo: string; valor: string; estado?: "ok" | "atencao" | "erro"; mono?: boolean }>;
  acoes: Array<{ rotulo: string; primaria?: boolean }>;
  /** Constituição §1.3 — fica (integrar) ou morre (substituir). */
  destino: "fica" | "substituir";
}

const H = 3_600_000;

export function gerarIntegracoesEnsaio(agora: Date = new Date()): Integracao[] {
  const t = agora.getTime();
  const em = (ms: number) => new Date(t + ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const ha = (ms: number) => {
    const min = Math.round(ms / 60_000);
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
  };
  return [
    {
      chave: "meta",
      nome: "WhatsApp Cloud API",
      fornecedor: "Meta",
      papel: "Recebe e envia as mensagens dos números oficiais. É o app da Meta — dele nascem os números WABA.",
      estado: "conectada",
      resumo: "App em produção · webhook assinado · qualidade do número alta",
      campos: [
        { rotulo: "Conta comercial (WABA)", valor: "1067455192551392", mono: true },
        { rotulo: "App da Meta", valor: "Me Escuta Atendimento · 8843…2210", mono: true },
        { rotulo: "Modo do app", valor: "Produção", estado: "ok" },
        { rotulo: "Webhook", valor: "https://me-escuta-runtime.byllcz.easypanel.host/webhook/meta", mono: true },
        { rotulo: "Assinatura do webhook", valor: `messages · leadgen · confirmada ${ha(2 * H)}`, estado: "ok" },
        { rotulo: "Qualidade do número", valor: "Alta · limite 1.000 conversas/24 h", estado: "ok" },
        { rotulo: "Token do System User", valor: `válido até ${em(58 * 24 * H)} · …f2a9`, estado: "ok", mono: true },
        { rotulo: "Lead Ads", valor: `leads_retrieval liberado · último lead ${ha(41 * 60_000)}`, estado: "ok" },
      ],
      acoes: [{ rotulo: "Testar webhook", primaria: true }, { rotulo: "Rotacionar token" }, { rotulo: "Abrir no Meta Business" }],
      destino: "fica",
    },
    {
      chave: "lite",
      nome: "WhatsApp Lite",
      fornecedor: "WuzAPI (próprio, na VPS)",
      papel: "Pareia celulares da equipe por QR. Cada fono ganha o próprio número sem precisar da Meta.",
      estado: "conectada",
      resumo: "2 instâncias pareadas · admin fechado",
      campos: [
        { rotulo: "Servidor", valor: "vps · rede interna · v1.4.2", mono: true },
        { rotulo: "Instâncias", valor: "lite:sara · lite:ana-paula", mono: true },
        { rotulo: "Webhook de entrada", valor: "…/webhook/lite · token único", mono: true, estado: "ok" },
        { rotulo: "Painel /admin", valor: "fechado (404 externo)", estado: "ok" },
      ],
      acoes: [{ rotulo: "Ver instâncias", primaria: true }, { rotulo: "Reiniciar serviço" }],
      destino: "fica",
    },
    {
      chave: "claude",
      nome: "Adicionar ao Claude",
      fornecedor: "MCP remoto",
      papel: "Deixa o Claude (Desktop, Code, cowork) ler os relatórios e o funil com o seu login — sem senha compartilhada.",
      estado: "atencao",
      resumo: "Servidor no ar · 1 pessoa conectada (Fernando) · OAuth pendente para o cowork",
      campos: [
        { rotulo: "Endereço do MCP", valor: "https://mcp.meescuta.com/sse", mono: true },
        { rotulo: "Ferramentas expostas", valor: "captacao · funil · relatorios (12 tools)" },
        { rotulo: "Quem conectou", valor: "Fernando Lopes (marketing) · Diogo Tambasco" },
        { rotulo: "OAuth (Cowork / web)", valor: "não publicado — só Desktop e Code", estado: "atencao" },
      ],
      acoes: [{ rotulo: "Copiar link de instalação", primaria: true }, { rotulo: "Ver tutorial" }],
      destino: "fica",
    },
    {
      chave: "kommo",
      nome: "Kommo",
      fornecedor: "Kommo",
      papel: "O sistema antigo. Fica ligado só para importar o histórico (7.100 leads, 361 mil eventos).",
      estado: "atencao",
      resumo: "Renovado · importação 92 % · webhook de saída desligado",
      campos: [
        { rotulo: "Conta", valor: "meescuta.kommo.com", mono: true },
        { rotulo: "Token de API", valor: `válido até ${em(83 * 24 * H)} · …7d1c`, estado: "ok", mono: true },
        { rotulo: "Importação de leads", valor: "6.532 de 7.100 · retomada às 02:00", estado: "atencao" },
        { rotulo: "Escrita de volta", valor: "desligada (D18: o Kommo morre)", estado: "ok" },
      ],
      acoes: [{ rotulo: "Retomar importação", primaria: true }, { rotulo: "Ver leads sem de-para" }],
      destino: "substituir",
    },
    {
      chave: "resend",
      nome: "Resend",
      fornecedor: "Resend",
      papel: "E-mail transacional. Hoje só o convite usaria — e o convite é por link, então está em espera.",
      estado: "desconectada",
      resumo: "Chave configurada · envio de convite por e-mail desligado (V1 é link)",
      campos: [
        { rotulo: "Domínio remetente", valor: "meescuta.com · DKIM ok", estado: "ok" },
        { rotulo: "Convite por e-mail", valor: "desligado — `convite.envio_email_ativo=false`", mono: true },
      ],
      acoes: [{ rotulo: "Ligar e-mail de convite" }],
      destino: "fica",
    },
    {
      chave: "asaas",
      nome: "Asaas",
      fornecedor: "Asaas",
      papel: "Cobrança e boletos. É de onde a Priscila vai ler quem está em atraso.",
      estado: "nao_configurada",
      resumo: "Chave no cofre · nunca chamado pelo sistema",
      campos: [{ rotulo: "Ambiente", valor: "produção (não conectado)" }],
      acoes: [{ rotulo: "Conectar", primaria: true }],
      destino: "fica",
    },
    {
      chave: "serasa",
      nome: "Serasa",
      fornecedor: "Serasa Experian",
      papel: "Consulta de crédito para o Levindo. Sem ela não há score.",
      estado: "nao_configurada",
      resumo: "Credencial não configurada",
      campos: [{ rotulo: "Contrato", valor: "RAF · pendente" }],
      acoes: [{ rotulo: "Conectar", primaria: true }],
      destino: "fica",
    },
  ];
}
