import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPT_ANEXO_SUPORTE,
  AVISO_PII,
  BUCKET_SUPORTE,
  LIMITE_ANEXO_BYTES,
  LIMITE_TITULO,
  TIPO_PADRAO,
  caminhoAnexoSuporte,
  codigoTicket,
  contarPorAba,
  dividirRelato,
  previaTitulo,
  envelopeSuporte,
  filtrarTickets,
  nomeArquivoSeguro,
  normalizarRota,
  payloadTicketAberto,
  payloadTicketComentado,
  payloadTicketResolvido,
  podeAbrirChamado,
  podeEnviarChamado,
  podeEscolherTipo,
  podeResolverChamado,
  primeiraPasta,
  semProblemasChamado,
  validarAnexoSuporte,
  validarChamado,
  type FormChamado,
  type Ticket,
} from "../components/suporte/regras/suporte.ts";

/*
 * F12 — chamado de suporte. O risco nº 1 aqui não é o formulário: é o CAMINHO DO ANEXO.
 * A policy do Storage compara `(storage.foldername(name))[1]` com `auth.uid()`. Um caminho montado
 * errado ou um nome de arquivo hostil tira o objeto do escopo do dono — e o print de bug de uma
 * pessoa pode conter conversa de paciente. Por isso metade destes testes é sobre uma string.
 */

function form(p: Partial<FormChamado> = {}): FormChamado {
  return { tipo: "bug", titulo: "Board não carrega", descricao: "abri /funil e ficou girando", onde: "/funil", ...p };
}

function ticket(p: Partial<Ticket> = {}): Ticket {
  return {
    numero: 1,
    id: "t1",
    tipo: "bug",
    titulo: "x",
    descricao: "y",
    onde: "/funil",
    status: "aberto",
    resolucao: null,
    aberto_em: "2026-07-26T10:00:00Z",
    resolvido_em: null,
    autor_nome: "Diogo",
    autor_email: "d@e.com",
    resolvido_por_nome: null,
    comentarios: 0,
    anexos: 0,
    ...p,
  };
}

// ═══════════════════════ o caminho do anexo (a RLS depende dele) ═══════════════════════

const UID = "11111111-2222-3333-4444-555555555555";
const TICKET = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("o caminho é <uid>/<ticket_id>/<arquivo>, nessa ordem", () => {
  assert.equal(caminhoAnexoSuporte(UID, TICKET, "print.png"), `${UID}/${TICKET}/print.png`);
  assert.equal(primeiraPasta(caminhoAnexoSuporte(UID, TICKET, "print.png")), UID);
});

test("nome com barra NÃO cria pasta a mais — o objeto sairia do escopo do dono", () => {
  const c = caminhoAnexoSuporte(UID, TICKET, "a/b/c.png");
  assert.equal(c, `${UID}/${TICKET}/c.png`);
  assert.equal(c.split("/").length, 3);
  assert.equal(primeiraPasta(c), UID);
});

test("travessia de diretório não escapa", () => {
  for (const hostil of ["../../etc/passwd", "..\\..\\x.png", "/absoluto/x.png", "....//x.png"]) {
    const c = caminhoAnexoSuporte(UID, TICKET, hostil);
    assert.equal(primeiraPasta(c), UID, hostil);
    assert.equal(c.split("/").length, 3, hostil);
    assert.ok(!c.includes(".."), hostil);
  }
});

test("nome vazio, só pontos ou só símbolos vira um nome utilizável", () => {
  assert.equal(nomeArquivoSeguro(""), "anexo.bin");
  assert.equal(nomeArquivoSeguro("..."), "anexo.bin");
  assert.equal(nomeArquivoSeguro("/"), "anexo.bin");
});

test("espaço, acento e controle viram nome seguro e curto", () => {
  assert.equal(nomeArquivoSeguro("captura de tela.png"), "captura_de_tela.png");
  assert.ok(!/\s/.test(nomeArquivoSeguro("a b\tc.png")));
  assert.ok(nomeArquivoSeguro("x".repeat(300) + ".png").length <= 80);
});

test("o bucket é o do contrato — e é privado por desenho", () => {
  assert.equal(BUCKET_SUPORTE, "suporte-anexos");
});

// ═══════════════════════ validação do anexo ═══════════════════════

test("a recusa NOMEIA o limite violado, nunca 'arquivo inválido'", () => {
  const grande = validarAnexoSuporte({ type: "image/png", size: LIMITE_ANEXO_BYTES + 1 });
  assert.equal(grande.ok, false);
  assert.match((grande as { motivo: string }).motivo, /limite é 10 MB/);
  assert.match((grande as { motivo: string }).motivo, /10\.?\d? MB/);
});

test("PDF e vídeo ficam de fora nesta fatia, e a recusa diz o que serve", () => {
  const pdf = validarAnexoSuporte({ type: "application/pdf", size: 1000 });
  assert.equal(pdf.ok, false);
  assert.match((pdf as { motivo: string }).motivo, /só imagem/);
  assert.match((pdf as { motivo: string }).motivo, /JPEG|PNG/);
});

test("imagem válida passa e devolve mime canônico e extensão", () => {
  assert.deepEqual(validarAnexoSuporte({ type: "image/JPEG", size: 1000 }), { ok: true, mime: "image/jpeg", ext: "jpg" });
  assert.deepEqual(validarAnexoSuporte({ type: "image/png;charset=x", size: 1 }), { ok: true, mime: "image/png", ext: "png" });
});

test("arquivo vazio é recusado", () => {
  assert.equal(validarAnexoSuporte({ type: "image/png", size: 0 }).ok, false);
});

test("o accept do input só oferece o que a validação aceita", () => {
  for (const m of ACCEPT_ANEXO_SUPORTE.split(",")) {
    assert.equal(validarAnexoSuporte({ type: m, size: 10 }).ok, true, m);
  }
});

// ═══════════════════════ o formulário ═══════════════════════

test("título vazio NÃO submete — o botão nasce desabilitado (APRENDIZADOS §7)", () => {
  assert.equal(podeEnviarChamado(form({ titulo: "   " }), "membro"), false);
  assert.match(validarChamado(form({ titulo: "" })).titulo!, /título/);
  assert.equal(podeEnviarChamado(form(), "membro"), true);
});

test("descrição vazia é recusada, e o motivo diz o que escrever", () => {
  assert.match(validarChamado(form({ descricao: " " })).descricao!, /o que você esperava/);
});

test("título longo demais diz o limite e o tamanho atual", () => {
  const p = validarChamado(form({ titulo: "a".repeat(LIMITE_TITULO + 5) }));
  assert.match(p.titulo!, new RegExp(String(LIMITE_TITULO)));
  assert.match(p.titulo!, new RegExp(String(LIMITE_TITULO + 5)));
});

test("tipo fora do domínio é recusado", () => {
  assert.ok(validarChamado(form({ tipo: "duvida" as never })).tipo);
  assert.ok(semProblemasChamado(validarChamado(form({ tipo: "ideia" }))));
});

test("QUALQUER autenticado abre chamado; só gestão resolve e escolhe o tipo", () => {
  assert.ok(podeAbrirChamado("membro"));
  assert.ok(!podeAbrirChamado(null));
  assert.ok(!podeResolverChamado("membro"));
  assert.ok(podeResolverChamado("admin") && podeResolverChamado("owner"));
  assert.ok(!podeEscolherTipo("membro"));
  assert.equal(TIPO_PADRAO, "bug");
});

test("a rota entra sem query nem hash — o ledger é append-only", () => {
  assert.equal(normalizarRota("/lead/abc?telefone=5511#topo"), "/lead/abc");
  assert.equal(normalizarRota("  /funil  "), "/funil");
  assert.equal(normalizarRota("javascript:alert(1)"), "");
  assert.equal(normalizarRota("https://outro.site/x"), "");
  assert.equal(normalizarRota(""), "");
});

test("o aviso de PII nomeia o que não colar e por quê", () => {
  assert.match(AVISO_PII, /paciente/);
  assert.match(AVISO_PII, /append-only/);
});

// ═══════════════════════ payloads ═══════════════════════

test("o ticket_id vai no payload — é o que torna a releitura determinística", () => {
  const p = payloadTicketAberto({ ticketId: TICKET, form: form(), anexos: [] });
  assert.equal(p.ticket_id, TICKET);
  assert.equal(p.onde, "/funil");
  assert.deepEqual(p.anexos, []);
});

test("o evento carrega o CAMINHO do anexo, nunca o binário", () => {
  const p = payloadTicketAberto({
    ticketId: TICKET,
    form: form(),
    anexos: [{ caminho: `${UID}/${TICKET}/print.png`, mime: "image/png", nome: "print.png", bytes: 1234 }],
  });
  const anexos = p.anexos as Record<string, unknown>[];
  assert.deepEqual(Object.keys(anexos[0]).sort(), ["bytes", "caminho", "mime", "nome"]);
  assert.ok(!JSON.stringify(p).includes("base64"));
});

test("rota vazia não vai no payload (campo ausente é melhor que campo mentiroso)", () => {
  const p = payloadTicketAberto({ ticketId: TICKET, form: form({ onde: "" }), anexos: [] });
  assert.ok(!("onde" in p));
});

test("comentar e resolver mandam o ticket_id e o texto aparado", () => {
  assert.deepEqual(payloadTicketComentado("t1", "  oi  "), { ticket_id: "t1", texto: "oi" });
  assert.deepEqual(payloadTicketResolvido("t1", " feito "), { ticket_id: "t1", resolucao: "feito" });
});

test("envelope de suporte na forma exata da porta, e a guarda antissegredo vale aqui também", () => {
  const r = envelopeSuporte("suporte_ticket_aberto", "ext", { ticket_id: "t1", titulo: "x" });
  assert.ok(r.ok);
  assert.equal(r.envelope.versao_payload, 1);
  const mau = envelopeSuporte("suporte_ticket_comentado", "ext", { ticket_id: "t1", texto: "minha senha é 123" });
  assert.ok(mau.ok, "texto com a palavra senha no CONTEÚDO passa — a guarda é sobre CHAVE");
  const mau2 = envelopeSuporte("suporte_ticket_comentado", "ext", { ticket_id: "t1", senha: "123" });
  assert.ok(!mau2.ok);
});

// ═══════════════════════ código citável e listagem ═══════════════════════

test("o código citável é S-014, com três dígitos", () => {
  assert.equal(codigoTicket(14), "S-014");
  assert.equal(codigoTicket(1), "S-001");
  assert.equal(codigoTicket(1234), "S-1234");
  assert.equal(codigoTicket(0), "S-000");
  assert.equal(codigoTicket(NaN), "S-000");
});

test("as abas são aberto/resolvido (ARB-18.4) e contam certo", () => {
  const lista = [
    ticket({ id: "a", numero: 1, status: "aberto", aberto_em: "2026-07-26T10:00:00Z" }),
    ticket({ id: "b", numero: 2, status: "resolvido", aberto_em: "2026-07-26T12:00:00Z" }),
    ticket({ id: "c", numero: 3, status: "aberto", aberto_em: "2026-07-26T11:00:00Z" }),
  ];
  assert.deepEqual(filtrarTickets(lista, "abertos").map((t) => t.id), ["c", "a"]);
  assert.deepEqual(filtrarTickets(lista, "resolvidos").map((t) => t.id), ["b"]);
  assert.deepEqual(filtrarTickets(lista, "todos").map((t) => t.id), ["b", "c", "a"]);
  assert.deepEqual(contarPorAba(lista), { abertos: 2, resolvidos: 1, todos: 3 });
});

// ═══════════════════════ um campo, dois dados (desenho do r10) ═══════════════════════

test("a PRIMEIRA LINHA vira o título; a descrição fica com o texto inteiro", () => {
  const r = dividirRelato("Board não carrega\n\nabri /funil e ficou girando");
  assert.equal(r.titulo, "Board não carrega");
  assert.equal(r.descricao, "Board não carrega\n\nabri /funil e ficou girando");
});

test("relato de UMA linha não fica sem descrição — a porta exige as duas", () => {
  const r = dividirRelato("o botão de publicar não faz nada");
  assert.equal(r.titulo, "o botão de publicar não faz nada");
  assert.equal(r.descricao, "o botão de publicar não faz nada");
  assert.ok(r.descricao.length > 0);
});

test("título longo demais é cortado com reticência, e a descrição continua inteira", () => {
  const longa = "a".repeat(LIMITE_TITULO + 40);
  const r = dividirRelato(longa);
  assert.equal(r.titulo.length, LIMITE_TITULO);
  assert.ok(r.titulo.endsWith("…"));
  assert.equal(r.descricao, longa);
});

test("a prévia mostra o traço enquanto não há texto — nunca 'undefined'", () => {
  assert.equal(previaTitulo(""), "—");
  assert.equal(previaTitulo("   \n  "), "—");
  assert.equal(previaTitulo("Erro no funil"), "Erro no funil");
});

test("o par título/descrição derivado passa na validação do chamado", () => {
  const { titulo, descricao } = dividirRelato("Board não carrega\nabri e girou");
  assert.ok(semProblemasChamado(validarChamado({ tipo: "bug", titulo, descricao, onde: "/funil" })));
});
