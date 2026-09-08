import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS_DESCARTE,
  ESTADOS_SESSAO,
  INTERVALO_RELEITURA_MS,
  MEIOS_CONSENTIMENTO,
  TERMO_CANAL_PESSOAL,
  TERMO_EXIGE_DIZER,
  TERMO_VERSAO,
  exigeAceiteDoTermo,
  motivoAceiteDesatualizado,
  descricaoEstadoSessao,
  devoRelerEstado,
  estadoDeFlags,
  estadoSessaoValido,
  intervaloRelituraMs,
  normalizarRespostaRuntime,
  payloadConsentimento,
  podeCriarSessao,
  proximoEstado,
  qrExpirado,
  resumirDescartes,
  rotuloEstadoSessao,
  sanitizarLinhaDescarte,
  suspeitaFiltroCego,
  termoNomeiaODano,
  validarConsentimento,
  type FormConsentimento,
} from "../components/configuracoes/regras/lite-sessao.ts";
import type { Canal } from "../components/configuracoes/regras/canais.ts";

/*
 * F11 — sessão do número NÃO OFICIAL. Os quatro riscos que estes testes existem para segurar:
 *  1. a tela mentir sobre o estado (IsConnected ≠ IsLoggedIn — uma tela com booleano mente);
 *  2. abrir sessão sem o consentimento da titular (o dano é do WhatsApp pessoal dela);
 *  3. o contador cego deixar de ser cego;
 *  4. o filtro barrar paciente conhecido em silêncio (nono dígito) sem ninguém ver.
 */

function canal(p: Partial<Canal> = {}): Canal {
  return {
    canal_id: "lite:jade",
    nome: "Jade",
    provedor: "nao_oficial",
    ativo: true,
    numero: null,
    waba_id: null,
    area_efetiva: "comercial",
    departamento: null,
    pareado_em: null,
    consentimento_em: "2026-07-26T12:00:00Z",
    consentimento_titular: "Jade",
    consentimento_texto_versao: null,
    consentimento_por: null,
    finalidade: "teste",
    risco_ban_aceito: true,
    desativado_em: null,
    criado_em: null,
    inbox_desde: "2026-07-20T00:00:00Z",
    // D70 · o fixture nasce SEM nivel e SEM declaracao, que e o estado real de todo canal em
    // producao hoje (medido 08/09/2026: a view nao tem a coluna). `nivelDoCanal` cai em `estrito`.
    nivel: null,
    nivel_declarado: false,
    ...p,
  };
}

// ═══════════ o achado (a): três estados de conexão, não dois ═══════════

test("IsConnected sem IsLoggedIn é 'aguardando_qr' — NÃO é conectado", () => {
  assert.equal(estadoDeFlags({ conectado: true, logado: false }), "aguardando_qr");
  assert.equal(estadoDeFlags({ conectado: false, logado: false }), "desconectado");
  assert.equal(estadoDeFlags({ conectado: true, logado: true }), "conectado");
});

test("banido vence tudo — inclusive 'logado'", () => {
  assert.equal(estadoDeFlags({ conectado: true, logado: true, banido: true }), "banido");
});

test("o vocabulário de estado é o do banco (check de ops.sessao_canal)", () => {
  assert.deepEqual(ESTADOS_SESSAO, ["desconectado", "aguardando_qr", "conectado", "banido"]);
  assert.ok(estadoSessaoValido("aguardando_qr"));
  assert.ok(!estadoSessaoValido("aguardando_pareamento")); // o nome do meu rascunho não vale
});

test("máquina de estados: parear conecta, cair desconecta, banido não volta sozinho", () => {
  assert.equal(proximoEstado("desconectado", "pediu_sessao"), "aguardando_qr");
  assert.equal(proximoEstado("aguardando_qr", "pareou"), "conectado");
  assert.equal(proximoEstado("conectado", "caiu"), "desconectado");
  assert.equal(proximoEstado("conectado", "banido"), "banido");
  assert.equal(proximoEstado("banido", "pediu_sessao"), "banido");
  assert.equal(proximoEstado("banido", "pareou"), "banido");
});

test("pedir sessão de novo com a sessão conectada não a joga para trás", () => {
  assert.equal(proximoEstado("conectado", "pediu_sessao"), "conectado");
  assert.equal(proximoEstado("conectado", "qr_recebido"), "conectado");
});

// ═══════════ releitura e QR ═══════════

test("conectado PARA de reler; aguardando pareamento relê a cada 5 s", () => {
  assert.equal(intervaloRelituraMs("aguardando_qr"), INTERVALO_RELEITURA_MS);
  assert.equal(intervaloRelituraMs("conectado"), null);
  assert.equal(intervaloRelituraMs("desconectado"), null);
  assert.equal(intervaloRelituraMs("banido"), null);
  assert.ok(devoRelerEstado("aguardando_qr"));
  assert.ok(!devoRelerEstado("conectado"));
});

test("QR sem validade declarada é tratado como EXPIRADO — nunca se desenha QR velho", () => {
  const agora = Date.parse("2026-07-27T00:00:00Z");
  assert.ok(qrExpirado(null, agora));
  assert.ok(qrExpirado("", agora));
  assert.ok(qrExpirado("qualquer coisa", agora));
  assert.ok(qrExpirado("2026-07-26T23:59:59Z", agora));
  assert.ok(!qrExpirado("2026-07-27T00:00:20Z", agora));
});

test("a resposta do runtime é normalizada; fora do contrato vira desconectado sem QR", () => {
  assert.deepEqual(normalizarRespostaRuntime({ estado: "conectado", desde: "x" }), {
    estado: "conectado",
    qr: null,
    // o contrato passou a transportar a IMAGEM (campo `qr_imagem` do runtime), porque é ela que o
    // dialeto de produção manda. `deepEqual` é de propósito: campo novo que entre no contrato sem
    // passar por normalização REPROVA aqui, em vez de chegar cru ao `src` de um `<img>`.
    qr_imagem: null,
    qr_formato: null,
    qr_expira_em: null,
    desde: "x",
    motivo: null,
    provedor_indisponivel: false,
    causa_rede: null,
  });
  assert.equal(normalizarRespostaRuntime({ estado: "seiLá" }).estado, "desconectado");
  assert.equal(normalizarRespostaRuntime(null).estado, "desconectado");
  assert.equal(normalizarRespostaRuntime({ estado: "aguardando_qr", qr: "" }).qr, null);
});

test("'não sei' atravessa a normalização e MANTÉM o relê armado", () => {
  // O runtime, quando não alcança o provedor, devolve o ÚLTIMO estado conhecido + a marca. Se a
  // marca não atravessasse, a tela leria `aguardando_qr` sem saber que a leitura falhou — ou, pior,
  // no desenho antigo leria `desconectado` e PARARIA de reler, congelando a fono no meio do
  // pareamento com a instância viva do outro lado.
  const r = normalizarRespostaRuntime({
    estado: "aguardando_qr",
    provedor_indisponivel: true,
    causa_rede: "timeout",
  });
  assert.equal(r.provedor_indisponivel, true);
  assert.equal(r.causa_rede, "timeout");

  // e o relê: armado enquanto indisponível, INCLUSIVE nos estados em que normalmente pararia
  assert.equal(intervaloRelituraMs("aguardando_qr", true), INTERVALO_RELEITURA_MS);
  assert.equal(intervaloRelituraMs("desconectado", true), INTERVALO_RELEITURA_MS);
  assert.equal(intervaloRelituraMs("conectado", true), INTERVALO_RELEITURA_MS);
  // sem a marca, nada muda: o comportamento antigo continua valendo
  assert.equal(intervaloRelituraMs("desconectado"), null);
  assert.ok(devoRelerEstado("desconectado", true));
  assert.ok(!devoRelerEstado("desconectado"));
});

test("a IMAGEM do QR atravessa a normalização — era aqui que ela morria", () => {
  // O runtime já mandava `qr_imagem` (contrato de `whatsapp/lite/sessao.ts`) e a rota serializa o
  // estado inteiro. Quem descartava era esta função, que só copiava `qr`: o PNG do provedor chegava
  // à fronteira da web e sumia sem erro nenhum — quadro vazio, log limpo.
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const r = normalizarRespostaRuntime({ estado: "aguardando_qr", qr_imagem: png, qr_formato: "imagem" });
  assert.equal(r.qr_imagem, png);
  assert.equal(r.qr_formato, "imagem");
});

test("imagem que não é `data:image/…;base64,` não passa da borda", () => {
  // a normalização é o ÚNICO lugar onde um `src` de `<img>` pode nascer nesta trilha.
  assert.equal(normalizarRespostaRuntime({ estado: "aguardando_qr", qr_imagem: "javascript:alert(1)" }).qr_imagem, null);
  assert.equal(normalizarRespostaRuntime({ estado: "aguardando_qr", qr_imagem: "https://exemplo.com/qr.png" }).qr_imagem, null);
});

test("`qr_formato` fora do vocabulário vira null, não a string crua", () => {
  assert.equal(normalizarRespostaRuntime({ estado: "aguardando_qr", qr_formato: "png" }).qr_formato, null);
  assert.equal(normalizarRespostaRuntime({ estado: "aguardando_qr", qr_formato: "codigo" }).qr_formato, "codigo");
});

test("cada estado tem rótulo e explicação — e a do banido diz que o dano é pessoal", () => {
  for (const e of ESTADOS_SESSAO) {
    assert.ok(rotuloEstadoSessao(e).length > 0);
    assert.ok(descricaoEstadoSessao(e).length > 0);
  }
  assert.match(descricaoEstadoSessao("banido"), /pessoal/);
});

// ═══════════ o portão da sessão ═══════════

test("SEM CONSENTIMENTO não abre sessão — e o motivo nomeia o dano de quem cedeu o número", () => {
  const v = podeCriarSessao({ papel: "admin", canal: canal({ consentimento_em: null }), f8Pronto: true });
  assert.equal(v.pode, false);
  assert.match(v.motivo!, /PESSOAL/);
  assert.match(v.motivo!, /sem volta|não/);
});

test("F8 pendente bloqueia, com o motivo do ledger que não devolve", () => {
  const v = podeCriarSessao({ papel: "owner", canal: canal(), f8Pronto: false });
  assert.equal(v.pode, false);
  assert.match(v.motivo!, /F8/);
});

test("o consentimento é reportado ANTES do F8 — destravar F8 não pode parecer solução", () => {
  const v = podeCriarSessao({ papel: "admin", canal: canal({ consentimento_em: null }), f8Pronto: false });
  assert.match(v.motivo!, /consentimento/);
  assert.ok(!/F8/.test(v.motivo!));
});

test("membro não cria sessão; canal WABA não tem sessão por pareamento", () => {
  assert.equal(podeCriarSessao({ papel: "membro", canal: canal(), f8Pronto: true }).pode, false);
  assert.equal(
    podeCriarSessao({ papel: "admin", canal: canal({ provedor: "waba" }), f8Pronto: true }).pode,
    false,
  );
});

test("sem canal registrado não há onde pendurar a sessão", () => {
  const v = podeCriarSessao({ papel: "admin", canal: null, f8Pronto: true });
  assert.equal(v.pode, false);
  assert.match(v.motivo!, /registre o canal/i);
});

test("com tudo em ordem libera — e avisa que canal desligado não ingere", () => {
  const ok = podeCriarSessao({ papel: "admin", canal: canal(), f8Pronto: true });
  assert.equal(ok.pode, true);
  assert.deepEqual(ok.avisos, []);

  const desligado = podeCriarSessao({ papel: "admin", canal: canal({ ativo: false }), f8Pronto: true });
  assert.equal(desligado.pode, true);
  assert.match(desligado.avisos[0], /desligado/);
});

// ═══════════ o termo ═══════════

test("o TERMO nomeia o dano — se alguém reescrever sem isso, este teste reprova", () => {
  assert.ok(termoNomeiaODano(TERMO_CANAL_PESSOAL));
  assert.match(TERMO_CANAL_PESSOAL, /SEU WhatsApp pessoal/);
});

test("um termo genérico NÃO passa — é o sentido reprovando", () => {
  assert.ok(!termoNomeiaODano("Ao continuar, você concorda com os termos de uso."));
  assert.ok(!termoNomeiaODano("Conectamos seu número. Pode haver riscos."));
});

test("consentimento sem nome da titular, sem meio ou com data futura é recusado", () => {
  const agora = Date.parse("2026-07-27T00:00:00Z");
  const base: FormConsentimento = {
    canalId: "lite:jade",
    titularNome: "Jade",
    meio: "whatsapp",
    aceitoEm: "2026-07-26T20:00:00Z",
    textoVersao: TERMO_VERSAO,
    aceiteMarcado: true,
  };
  assert.deepEqual(validarConsentimento(base, agora), {});
  assert.ok(validarConsentimento({ ...base, titularNome: "J" }, agora).titularNome);
  assert.ok(validarConsentimento({ ...base, meio: "carta" as never }, agora).meio);
  assert.match(validarConsentimento({ ...base, aceitoEm: "2026-07-28T00:00:00Z" }, agora).aceitoEm!, /futuro/);
  assert.ok(validarConsentimento({ ...base, aceiteMarcado: false }, agora).aceiteMarcado);
  assert.ok(validarConsentimento({ ...base, textoVersao: "" }, agora).textoVersao);
});

test("a versão do termo vai no payload — aceite sobre texto antigo não cobre texto novo", () => {
  const p = payloadConsentimento({
    canalId: "lite:jade",
    titularNome: "  Jade  ",
    meio: "presencial",
    aceitoEm: "2026-07-26T20:00:00Z",
    textoVersao: TERMO_VERSAO,
    aceiteMarcado: true,
  });
  assert.deepEqual(p, {
    canal_id: "lite:jade",
    titular_nome: "Jade",
    texto_versao: TERMO_VERSAO,
    meio: "presencial",
    aceito_em: "2026-07-26T20:00:00Z",
  });
  assert.deepEqual(MEIOS_CONSENTIMENTO, ["assinatura", "whatsapp", "presencial", "video"]);
});

// ═══════════ o contador CEGO ═══════════

test("a linha do contador é ALLOWLIST: coluna nova com PII não chega à tela", () => {
  const bruta = {
    canal_id: "lite:jade",
    dia: "2026-07-26",
    motivo: "contraparte_desconhecida",
    quantidade: 12,
    telefone: "+5511999998888", // ← se a view um dia trouxer isso
    corpo: "oi, tudo bem?",
    id_externo: "wamid.ABC",
  };
  const limpa = sanitizarLinhaDescarte(bruta) as Record<string, unknown>;
  assert.ok(!("telefone" in limpa));
  assert.ok(!("corpo" in limpa));
  assert.ok(!("id_externo" in limpa));
  assert.equal(limpa.quantidade, 12);
  assert.deepEqual(Object.keys(limpa).sort(), [...CAMPOS_DESCARTE].sort());
});

test("nenhum campo do contador pode ter cara de PII", () => {
  for (const c of CAMPOS_DESCARTE) {
    assert.ok(!/telefone|corpo|conteudo|payload|wamid|id_externo/.test(c), `campo suspeito: ${c}`);
  }
});

test("o resumo soma por motivo e devolve a janela coberta", () => {
  const r = resumirDescartes([
    sanitizarLinhaDescarte({ dia: "2026-07-25", motivo: "contraparte_desconhecida", quantidade: 10, primeiro_em: "2026-07-25T01:00:00Z", ultimo_em: "2026-07-25T22:00:00Z" }),
    sanitizarLinhaDescarte({ dia: "2026-07-26", motivo: "contraparte_desconhecida", quantidade: 5, primeiro_em: "2026-07-26T01:00:00Z", ultimo_em: "2026-07-26T20:00:00Z" }),
    sanitizarLinhaDescarte({ dia: "2026-07-26", motivo: "grupo", quantidade: 40, primeiro_em: "2026-07-26T02:00:00Z", ultimo_em: "2026-07-26T21:00:00Z" }),
  ]);
  assert.equal(r.total, 55);
  assert.deepEqual(r.porMotivo, [
    { motivo: "grupo", quantidade: 40 },
    { motivo: "contraparte_desconhecida", quantidade: 15 },
  ]);
  assert.equal(r.desde, "2026-07-25T01:00:00Z");
  assert.equal(r.ate, "2026-07-26T21:00:00Z");
});

test("resumo de lista vazia é zero, não NaN", () => {
  const r = resumirDescartes([]);
  assert.equal(r.total, 0);
  assert.deepEqual(r.porMotivo, []);
  assert.equal(r.desde, null);
});

// ═══════════ o sinal do nono dígito ═══════════

test("descartados > 0 e NADA guardado em 24 h acende a suspeita", () => {
  const s = suspeitaFiltroCego({ descartados24h: 37, persistidas24h: 0 });
  assert.equal(s.suspeito, true);
  assert.match(s.motivo!, /37/);
  assert.match(s.motivo!, /chave canônica|telefone cru/);
});

test("com alguma coisa guardada, não acende — sinal falso desliga portão", () => {
  assert.equal(suspeitaFiltroCego({ descartados24h: 37, persistidas24h: 2 }).suspeito, false);
  assert.equal(suspeitaFiltroCego({ descartados24h: 0, persistidas24h: 0 }).suspeito, false);
});

// ═════════════════ D70.b · o termo v2 e a TRAVA DE VERSÃO que não existia ═════════════════

/*
 * MEDIDO em 08/09/2026: `TERMO_VERSAO` tinha UM uso em todo o repositório — carimbar o valor no
 * envio do formulário. NADA comparava a versão gravada no banco com a vigente, apesar de a própria
 * tela prometer à titular que "se o texto mudar, este aceite não cobre o novo". Os testes abaixo
 * são o que transforma aquela frase em regra.
 */

test("D70 · o termo subiu para v2 — e o v1 deixou de ser o vigente", () => {
  assert.equal(TERMO_VERSAO, "v2");
});

test("D70 · o v2 CONTINUA nomeando o dano — as cinco palavras de TERMO_EXIGE_DIZER", () => {
  assert.ok(termoNomeiaODano(TERMO_CANAL_PESSOAL));
  // uma por uma, para a falha dizer QUAL sumiu em vez de só "false"
  for (const frase of TERMO_EXIGE_DIZER) {
    assert.ok(
      TERMO_CANAL_PESSOAL.toLowerCase().includes(frase.toLowerCase()),
      `o termo v2 deixou de dizer "${frase}"`,
    );
  }
  // e o dano segue sendo O DELA, não o da empresa (a asserção que já existia sobre o v1)
  assert.match(TERMO_CANAL_PESSOAL, /SEU WhatsApp pessoal/);
});

test("D70 · 'descartada' no v2 é VERDADE, não palavra posta para passar no teste", () => {
  // A palavra só continua honesta porque o descarte segue existindo — no estrito, que é o padrão.
  // Então ela tem de aparecer JUNTO da descrição do estrito, e não solta numa frase qualquer.
  const paragrafos = TERMO_CANAL_PESSOAL.split("\n\n");
  const oDoDescarte = paragrafos.find((p) => p.toLowerCase().includes("descartada"));
  assert.ok(oDoDescarte, "nenhum parágrafo fala de descarte");
  assert.match(oDoDescarte!.toLowerCase(), /estrito/);
});

test("D70 · o v2 descreve os TRÊS níveis, e nomeia os TRÊS casos de contraparte conhecida", () => {
  const t = TERMO_CANAL_PESSOAL.toLowerCase();
  assert.match(t, /estrito/);
  assert.match(t, /responde quem escrever/);
  assert.match(t, /aberto/);
  // a infidelidade do v1: ele dizia "lead ou paciente" e escondia o TERCEIRO caso do oráculo —
  // quem tem `aceite_contato_registrado`. O v2 nomeia os três.
  assert.match(t, /lead/);
  assert.match(t, /paciente/);
  assert.match(t, /aceite de contato/);
});

test("D70 · o v2 avisa que sair do estrito exige aceitar ESTA versão", () => {
  assert.match(TERMO_CANAL_PESSOAL.toLowerCase(), /sair do estrito/);
});

// ─────────────────────────── exigeAceiteDoTermo ───────────────────────────

test("D70.b · aceite v1 BLOQUEIA qualquer nível não estrito", () => {
  assert.equal(exigeAceiteDoTermo("aberto", "v1"), true);
  assert.equal(exigeAceiteDoTermo("responde_qualquer_um", "v1"), true);
});

test("D70.b · aceite na versão VIGENTE passa", () => {
  assert.equal(exigeAceiteDoTermo("aberto", TERMO_VERSAO), false);
  assert.equal(exigeAceiteDoTermo("responde_qualquer_um", "v2"), false);
  // espaço em volta não é versão diferente
  assert.equal(exigeAceiteDoTermo("aberto", "  v2  "), false);
});

test("D70.b · versão ausente, nula ou vazia EXIGE — não saber é o mesmo que não ter", () => {
  for (const v of [null, undefined, "", "   "]) {
    assert.equal(exigeAceiteDoTermo("aberto", v), true, String(v));
  }
});

test("D70.b · VOLTAR ao estrito nunca exige aceite — apertar o filtro é sempre seguro", () => {
  for (const v of [null, undefined, "", "v0", "v1", "v2"]) {
    assert.equal(exigeAceiteDoTermo("estrito", v), false, String(v));
  }
});

test("D70.b · o motivo NOMEIA a versão velha, para ninguém procurar no escuro", () => {
  assert.match(motivoAceiteDesatualizado("v1"), /v1/);
  assert.match(motivoAceiteDesatualizado("v1"), new RegExp(TERMO_VERSAO));
  assert.match(motivoAceiteDesatualizado(null), /nao registrada|não registrada/);
});

test("D70.b · a trava vale para os DOIS canais lite de produção, que aceitaram v1", () => {
  // Medido em 08/09/2026: `lite:diogo` e `lite:teste-tecnico` têm consentimento_texto_versao='v1'.
  // Este teste é o que impede alguém de "resolver" a trava baixando TERMO_VERSAO de volta a v1.
  const producaoHoje = "v1";
  assert.equal(exigeAceiteDoTermo("aberto", producaoHoje), true);
  assert.notEqual(TERMO_VERSAO, producaoHoje);
});
