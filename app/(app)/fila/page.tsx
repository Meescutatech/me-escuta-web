import { lerFila } from "./dados";
import { ListaFila } from "./lista";

/**
 * /FILA — onde "o agente propõe, o humano valida" vira trabalho.
 *
 * Até 22/08 esta tela estava fora do menu (só quem soubesse a URL chegava), mostrava 50 de 405
 * sem dizer que existiam mais, renderizava 5 de 7 cartões com o corpo em branco e explicava ao
 * operador qual função de banco o botão chamava. Ela agora entra pela barra lateral, diz o
 * tamanho real da fila, agrupa por agente, mostra o paciente e o que ele disse, e fala a língua
 * de quem valida.
 */
export const dynamic = "force-dynamic";

export default async function FilaPage({
  searchParams,
}: {
  searchParams: Promise<{ agente?: string }>;
}) {
  const { agente } = await searchParams;
  const filtro = agente?.trim() ? agente.trim() : null;
  const dados = await lerFila(filtro);
  return <ListaFila dados={dados} />;
}
