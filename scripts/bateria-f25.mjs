// bateria-f25.mjs — uma mutação por asserção do PORTÃO F25 (ARB-23).
//
// Uso:  cd me-escuta-web && npm run bateria:f25

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rodarBateria } from "./bateria-mutacao.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (r) => resolve(raiz, r);

await rodarBateria({
  nome: "F25",
  comando: ["node", "--experimental-strip-types", p("scripts/portao-f25-nao-lidas.mjs")],
  mutacoes: [
    {
      id: "M0",
      protege: "(0) vacuidade — cenário sem as duas classes aprova contador sempre-tudo",
      arquivo: p("scripts/portao-f25-nao-lidas.mjs"),
      de: `const LIDAS = 5; // última mensagem é de SAÍDA`,
      para: `const LIDAS = 0; // última mensagem é de SAÍDA`,
      esperaVermelho: /VERMELHO· \(0\) vacuidade/,
    },
    {
      id: "M1",
      protege: "(1) o contador estreito dá o MESMO número da lista",
      arquivo: p("lib/dados/conversas.ts"),
      // o proxy invertido: conta as respondidas em vez das que esperam resposta
      de: `    return ids.filter((id) => ultimaDirecao.get(id) === "entrada").length;`,
      para: `    return ids.filter((id) => ultimaDirecao.get(id) === "saida").length;`,
      esperaVermelho: /VERMELHO· \(1\) DIVERGÊNCIA/,
    },
    {
      id: "M2",
      protege: "(2) o contador não faz join com v_lead_card",
      arquivo: p("lib/dados/conversas.ts"),
      de: `    const previas = await lerPrevias(supabase, ids, "conversa_id,direcao,timestamp_origem,criado_em");`,
      para: `    await supabase.schema("core").from("v_lead_card").select("lead_id").in("lead_id", ids);
    const previas = await lerPrevias(supabase, ids, "conversa_id,direcao,timestamp_origem,criado_em");`,
      esperaVermelho: /VERMELHO· \(2\) o contador ainda lê v_lead_card/,
    },
    {
      id: "M3",
      protege: "(3) o contador não lê `corpo` — é o que pesa",
      arquivo: p("lib/dados/conversas.ts"),
      de: `    const previas = await lerPrevias(supabase, ids, "conversa_id,direcao,timestamp_origem,criado_em");`,
      para: `    const previas = await lerPrevias(supabase, ids, "conversa_id,direcao,corpo,timestamp_origem,criado_em");`,
      esperaVermelho: /VERMELHO· \(3\) o contador ainda lê `corpo`/,
    },
    {
      id: "M4",
      protege: "(4) o contador não lê a config do funil",
      arquivo: p("lib/dados/conversas.ts"),
      de: `    if (error || !convs) return null;
    if (convs.length === 0) return 0;`,
      para: `    if (error || !convs) return null;
    if (convs.length === 0) return 0;
    await supabase.schema("core").from("v_config_vigente").select("payload").eq("nome", "funil_vendas");`,
      esperaVermelho: /VERMELHO· \(4\) o contador ainda lê v_config_vigente/,
    },
    {
      id: "M5",
      protege: "(5) o payload do contador fica abaixo do teto declarado",
      arquivo: p("lib/dados/conversas.ts"),
      // trazer a linha inteira em vez de só o id: o número continua certo e o custo volta
      de: `      .from("v_conversa")
      .select("id")
      .eq("visivel_inbox", true)
      .order("ultima_entrada_em", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(LIMITE_PAGINA);`,
      para: `      .from("v_conversa")
      .select("id,telefone,lead_id,mode,dono_atual,status,atualizado_em,ultima_entrada_em")
      .eq("visivel_inbox", true)
      .order("ultima_entrada_em", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(LIMITE_PAGINA);`,
      esperaVermelho: /VERMELHO· \(5\) payload do contador \d+ B passou do teto/,
    },
    {
      id: "M6",
      protege: "(6) 'última mensagem' é mesmo a última — a ordem que decide o proxy",
      arquivo: p("lib/dados/conversas.ts"),
      // pegar a ÚLTIMA linha da lista em vez da primeira inverte o sentido de "última mensagem":
      // a lista vem em ordem decrescente, então isso passa a olhar a mensagem mais ANTIGA
      de: `      if (!ultimaDirecao.has(k)) ultimaDirecao.set(k, String(m.direcao));`,
      para: `      ultimaDirecao.set(k, String(m.direcao));`,
      esperaVermelho: /VERMELHO· \((1|6)\)/,
    },
    {
      id: "M7",
      protege: "(7) o controle negativo é capaz de acusar a leitura antiga",
      arquivo: p("scripts/portao-f25-nao-lidas.mjs"),
      // se o "antes" medir a implementação NOVA, a comparação antes×depois deixa de comparar
      de: `const { conversas: listaAntiga } = await lerConversas({ cliente: falsoAntes });
const nAntes = listaAntiga.filter((c) => c.nao_lida).length;`,
      para: `const nAntes = await contarNaoLidas(falsoAntes);`,
      esperaVermelho: /VERMELHO· \(7\) controle negativo não acusou/,
    },
    {
      id: "M8",
      protege: "(8) a barra lateral não passa mais pela leitura inteira do inbox",
      arquivo: p("lib/dados/sidebar.ts"),
      // M6/R18: o alvo textual mudou junto com a chamada (o contador passou a receber o escopo)
      de: `      contarNaoLidas(undefined, escopo),`,
      para: `      (async () => {
        const { conversas } = await (await import("./conversas")).lerConversas();
        return conversas.filter((c) => c.nao_lida).length;
      })(),`,
      esperaVermelho: /VERMELHO· \(8\) a barra lateral ainda passa por lerConversas/,
    },
    {
      id: "M9",
      protege: "(8-bis) o contador da barra lateral respeita o escopo da tela para a qual aponta",
      arquivo: p("lib/dados/sidebar.ts"),
      // O defeito que M9 encena é o que a régua afrouxada do (8) deixaria passar: a chamada volta a
      // ser global, o número da barra conta o inbox inteiro e a lista escopada mostra outro.
      de: `      contarNaoLidas(undefined, escopo),`,
      para: `      contarNaoLidas(),`,
      esperaVermelho: /VERMELHO· \(8-bis\) contarNaoLidas sem escopo/,
    },
  ],
});
