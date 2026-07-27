import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS_DESCARTE,
  ESTADOS_SESSAO,
  INTERVALO_RELEITURA_MS,
  MEIOS_CONSENTIMENTO,
  TERMO_CANAL_PESSOAL,
  TERMO_VERSAO,
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
    pareado_em: null,
    consentimento_em: "2026-07-26T12:00:00Z",
    consentimento_titular: "Jade",
    risco_ban_aceito: true,
    desativado_em: null,
    criado_em: null,
    inbox_desde: "2026-07-20T00:00:00Z",
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
    qr_expira_em: null,
    desde: "x",
    motivo: null,
  });
  assert.equal(normalizarRespostaRuntime({ estado: "seiLá" }).estado, "desconectado");
  assert.equal(normalizarRespostaRuntime(null).estado, "desconectado");
  assert.equal(normalizarRespostaRuntime({ estado: "aguardando_qr", qr: "" }).qr, null);
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
