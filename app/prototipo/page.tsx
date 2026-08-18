import { PrototipoWorkshop } from "@/components/prototipo/workshop";

/**
 * /prototipo — as QUATRO telas fechadas no workshop de 12/08, para o Diogo ver e clicar.
 *
 * É rota PÚBLICA e de FIXTURES: nenhuma leitura do Supabase, nenhuma escrita, nenhum dado de
 * paciente real. O `.env.local` deste repo aponta para produção, e a única garantia que vale é a
 * que não depende de disciplina: esta página não tem por onde escrever.
 *
 * Os componentes aqui são os MESMOS que estão ligados nas telas reais (composer de /conversas,
 * card e board de /funil, drawer do lead) — a página é a vitrine, não uma segunda implementação.
 *
 * `agora` é calculado no servidor e desce como prop: fixture com prazo tem que ser relativa ao
 * relógio (senão o card "estourado" envelhece até virar absurdo), e chamar Date.now() nos dois
 * lados quebraria a hidratação.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Protótipo do workshop — Me Escuta",
};

export default function PaginaPrototipo() {
  return <PrototipoWorkshop agora={Date.now()} />;
}
