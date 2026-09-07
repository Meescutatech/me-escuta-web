import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registrarFerramentas } from "./ferramentas";
import { ErroDeConfiguracao, abrirSessao } from "./sessao";

/**
 * Servidor MCP de marketing da Me Escuta — o ponto de entrada.
 *
 * Roda na máquina de quem pergunta (stdio), entra no sistema como um usuário normal e lê pela
 * MESMA RLS e pelas MESMAS consultas da tela `/marketing`. Nasceu da **D68** (07/09/2026).
 *
 * ⚠️ REGRA DO STDIO, e ela quebra o servidor em silêncio se for violada: em transporte stdio o
 * protocolo VIVE no stdout. Um `console.log` solto corrompe a conversa e o cliente desconecta
 * sem dizer por quê. Todo diagnóstico vai para **stderr**, sempre.
 */

function aviso(msg: string): void {
  process.stderr.write(`[me-escuta-marketing] ${msg}\n`);
}

async function principal(): Promise<void> {
  const cliente = await abrirSessao();

  const servidor = new McpServer(
    { name: "me-escuta-marketing", version: "1.0.0" },
    {
      instructions:
        "Dados de marketing da Me Escuta: origem dos leads, campanhas, custo e funil. " +
        "As respostas trazem um cabeçalho com o estado da leitura — leia-o antes de afirmar números. " +
        "Quando um valor aparece como '—', ele é DESCONHECIDO, nunca zero: não conclua ausência a partir dele. " +
        "A série de captação começou em 31/08/2026; período anterior a isso é 'ainda não medíamos', não 'não houve lead'.",
    },
  );

  registrarFerramentas(servidor, cliente);
  await servidor.connect(new StdioServerTransport());
  aviso("conectado — pronto para responder.");
}

principal().catch((erro: unknown) => {
  // Configuração errada é o caso comum, e merece uma mensagem que diga o que fazer — não um
  // stack trace. Qualquer outra falha sai inteira, porque aí eu quero o rastro.
  if (erro instanceof ErroDeConfiguracao) {
    aviso(`não consegui iniciar: ${erro.message}`);
  } else {
    aviso(`falha inesperada: ${erro instanceof Error ? (erro.stack ?? erro.message) : String(erro)}`);
  }
  process.exit(1);
});
