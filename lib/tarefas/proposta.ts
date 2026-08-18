/**
 * A FORMA DE UMA PROPOSTA DE TAREFA — o vocabulário da operação, não o meu.
 *
 * O robô do Kommo já escreve para a Sarah no formato "POR QUE AGORA: … FAZER: …", e ela lê isso
 * todo dia. Os campos abaixo têm esses nomes de propósito: quando o texto da tela e o nome do
 * campo divergem, é sempre a tela que acaba cedendo, e a operação passa a ler duas línguas.
 *
 * `porqueAgora` e `trecho` são OBRIGATÓRIOS no tipo, e continuam obrigatórios mesmo quando a
 * tarefa nasce criada sozinha. O que a autonomia muda é QUEM APROVA — não a transparência
 * (D10). Tarefa automática sem motivo visível é a Sarah recebendo ordem de um robô sem poder
 * discordar, que é exatamente o que o princípio da casa proíbe.
 */
export interface PropostaTarefa {
  id: string;
  /** chave do tipo — é ela que decide o modo em `decidirAutonomia` */
  tipoChave: string;
  /** FAZER: o ato, em imperativo curto */
  fazer: string;
  /** POR QUE AGORA: a justificativa medida, nunca genérica */
  porqueAgora: string;
  /** a evidência citada — a frase da conversa que disparou tudo */
  trecho: { texto: string; quando: string; autor: string };
  prazoSugerido: string;
  responsavelSugerido: string;
}
