import { EmBreve } from "@/components/ensaio/em-breve";

export default function EventosPage() {
  return (
    <EmBreve
      titulo="Eventos"
      descricao="O vocabulário do ledger — cada tipo de evento que o sistema registra — e quem pode registrar cada um."
      oQueVem={[
        "A lista dos tipos de evento (mensagem_recebida, etapa_alterada, tarefa_criada…) com a versão do payload de cada um.",
        "Quem pode registrar cada tipo: pessoa, agente, webhook — e o que a porta recusa.",
        "Contagem por tipo nos últimos 30 dias e o último registrado.",
      ]}
    />
  );
}
