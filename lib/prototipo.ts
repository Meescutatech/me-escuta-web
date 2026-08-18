/**
 * MARCADOR DE PROTÓTIPO — r23/prototipo-workshop.
 *
 * O `.env.local` deste repo aponta para o Supabase de PRODUÇÃO. As quatro telas do workshop
 * (12/08) existem para o Diogo CLICAR e entender o escopo, então nenhuma interação nova pode
 * escrever lá. A regra é uma só e está escrita aqui para não virar convenção oral:
 *
 *   toda interação nova destas telas termina em useState do componente — nunca em server action.
 *
 * Leitura continua permitida (o board e o drawer seguem lendo a projeção real). O que muda é a
 * saída: programar envio, aprovar sugestão de tarefa e marcar audiometria PARAM no estado local
 * e se anunciam como protótipo na tela. Um botão que parece salvar e não salva é pior que um
 * botão rotulado — daí o selo visível, não um comentário no código.
 */

/** Texto único do selo. Muda aqui, muda em todo lugar. */
export const SELO_PROTOTIPO = "Protótipo — nada é salvo";

/** Motivo longo, para o title/tooltip do selo. */
export const MOTIVO_PROTOTIPO =
  "Esta tela é um protótipo do workshop de 12/08. As ações ficam no estado da tela e não gravam no banco de produção.";
