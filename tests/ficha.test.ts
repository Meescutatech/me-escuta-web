import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtDataHora,
  inputParaValor,
  nivelPrazo,
  parseConfigFicha,
  parseTags,
  valorParaInput,
  valorParaTexto,
} from "../lib/dados/ficha-calculos.ts";

/*
 * Testes da lógica PURA da ficha (Rodada 8) — roda com `npm test` (node --test, type
 * stripping). O shape de CONFIG_REAL espelha a config `ficha_lead` v1 vigente no remoto
 * (rotulo, editavel no GRUPO, tipos selecao/data_hora/texto_longo/arquivo…).
 */

// recorte fiel da config real (grupos Principal editavel:true; Venda sem editavel)
const CONFIG_REAL = {
  grupos: [
    {
      nome: "Principal",
      editavel: true,
      campos: [
        { slug: "estado", tipo: "selecao", opcoes: ["Minas Gerais", "São Paulo"], rotulo: "Estado", kommo_field_id: 1870973 },
        { slug: "cidade", tipo: "texto", rotulo: "Cidade", kommo_field_id: 1515302 },
        { slug: "hora_consulta", tipo: "data_hora", rotulo: "Hora consulta", kommo_field_id: 1086234 },
      ],
    },
    {
      nome: "Venda",
      campos: [
        { slug: "contrato", tipo: "arquivo", rotulo: "Contrato" },
        { slug: "obs_venda", tipo: "texto_longo", rotulo: "Observações" },
      ],
    },
  ],
};

test("parseConfigFicha: shape real — rotulo vira nome, editavel herda do GRUPO", () => {
  const grupos = parseConfigFicha(CONFIG_REAL)!;
  assert.equal(grupos.length, 2);

  const principal = grupos[0];
  assert.equal(principal.nome, "Principal");
  assert.deepEqual(
    principal.campos.map((c) => [c.slug, c.nome, c.tipo, c.editavel]),
    [
      ["estado", "Estado", "selecao", true],
      ["cidade", "Cidade", "texto", true],
      ["hora_consulta", "Hora consulta", "data_hora", true],
    ],
  );
  assert.deepEqual(principal.campos[0].opcoes, ["Minas Gerais", "São Paulo"]);

  // grupo sem editavel → campos read-only; tipo sem editor (arquivo) NUNCA é editável
  const venda = grupos[1];
  assert.deepEqual(
    venda.campos.map((c) => [c.slug, c.tipo, c.editavel]),
    [
      ["contrato", "outro", false],
      ["obs_venda", "texto_longo", false],
    ],
  );
});

test("parseConfigFicha: tipo 'arquivo' em grupo editável continua sem edição", () => {
  const grupos = parseConfigFicha({
    grupos: [{ nome: "G", editavel: true, campos: [{ slug: "doc", tipo: "arquivo" }] }],
  })!;
  assert.equal(grupos[0].campos[0].editavel, false);
});

test("parseConfigFicha: config ausente/inválida/sem campos → null (estado honesto)", () => {
  assert.equal(parseConfigFicha(null), null);
  assert.equal(parseConfigFicha({}), null);
  assert.equal(parseConfigFicha({ grupos: [] }), null);
  assert.equal(parseConfigFicha({ grupos: [{ nome: "X", campos: [{ rotulo: "sem slug" }] }] }), null);
});

test("parseConfigFicha: campos soltos sem grupos viram grupo único", () => {
  const grupos = parseConfigFicha({ campos: [{ slug: "a", tipo: "texto", editavel: true }] })!;
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].campos[0].editavel, true); // editavel no CAMPO sobrescreve
});

test("parseTags: array de strings e de objetos; lixo vira []", () => {
  assert.deepEqual(parseTags(["27", "DEVOLUÇÃO"]), ["27", "DEVOLUÇÃO"]);
  assert.deepEqual(parseTags([{ nome: "vip" }, { name: "x" }, "", null]), ["vip", "x"]);
  assert.deepEqual(parseTags("27"), []);
  assert.deepEqual(parseTags(null), []);
});

// ─────────────── card 3: grupos da ficha devem ser editáveis ───────────────

// recorte que espelha a config REAL de produção (v3): 5 grupos com editavel:false
const CONFIG_PRODUCAO_V3 = {
  grupos: [
    {
      nome: "Principal",
      editavel: true,
      campos: [
        { slug: "estado", tipo: "selecao", opcoes: ["Minas Gerais", "São Paulo"], rotulo: "Estado" },
        { slug: "cidade", tipo: "texto", rotulo: "Cidade" },
      ],
    },
    {
      nome: "Qualificação",
      editavel: true,
      campos: [
        { slug: "desejo", tipo: "selecao", opcoes: ["Não", "Sim"], rotulo: "Desejo" },
      ],
    },
    {
      nome: "Paciente",
      editavel: true,
      campos: [
        { slug: "nome_completo", tipo: "texto", rotulo: "Nome Completo" },
        { slug: "cpf", tipo: "texto", rotulo: "CPF" },
        { slug: "endereco_completo_com_cep", tipo: "endereco", rotulo: "Endereço Completo com CEP" },
      ],
    },
    {
      nome: "Teste",
      editavel: true,
      campos: [
        { slug: "inicio_do_teste", tipo: "data", rotulo: "Início do Teste" },
        { slug: "teste_finalizado", tipo: "selecao", opcoes: ["Não", "Sim"], rotulo: "Teste Finalizado?" },
      ],
    },
    {
      nome: "AASI",
      editavel: true,
      campos: [
        { slug: "plano", tipo: "selecao", opcoes: ["Plano Unilateral", "Plano Bilateral"], rotulo: "Plano" },
        { slug: "no_de_serie_oe", tipo: "texto", rotulo: "Nº de Série OE" },
        { slug: "programacao", tipo: "arquivo", rotulo: "Programação" },
      ],
    },
    {
      nome: "Venda",
      editavel: true,
      campos: [
        { slug: "parcelamento", tipo: "selecao", opcoes: ["3", "6", "12"], rotulo: "Parcelamento" },
        { slug: "vendeu", tipo: "selecao", opcoes: ["Não", "Sim"], rotulo: "Vendeu?" },
        { slug: "data_da_venda", tipo: "data", rotulo: "Data da Venda" },
      ],
    },
    {
      nome: "Pós-Venda",
      editavel: true,
      campos: [
        { slug: "ultimo_nps_csat_feedback", tipo: "numero", rotulo: "Último NPS/CSAT/Feedback" },
        { slug: "feedback", tipo: "texto_longo", rotulo: "Feedback" },
      ],
    },
  ],
};

test("parseConfigFicha: grupos Paciente/Teste/AASI/Venda/Pós-Venda devem ter campos editáveis (exceto tipo sem editor)", () => {
  const grupos = parseConfigFicha(CONFIG_PRODUCAO_V3)!;
  assert.equal(grupos.length, 7);

  // Paciente: texto é editável, endereço (tipo outro) não
  const paciente = grupos.find((g) => g.nome === "Paciente")!;
  assert.equal(paciente.campos.find((c) => c.slug === "nome_completo")!.editavel, true, "nome_completo deve ser editável");
  assert.equal(paciente.campos.find((c) => c.slug === "cpf")!.editavel, true, "cpf deve ser editável");
  assert.equal(paciente.campos.find((c) => c.slug === "endereco_completo_com_cep")!.editavel, false, "endereço nunca edita");

  // Teste: data e seleção são editáveis
  const teste = grupos.find((g) => g.nome === "Teste")!;
  assert.equal(teste.campos.find((c) => c.slug === "inicio_do_teste")!.editavel, true, "inicio_do_teste deve ser editável");
  assert.equal(teste.campos.find((c) => c.slug === "teste_finalizado")!.editavel, true, "teste_finalizado deve ser editável");

  // AASI: texto/seleção editáveis, arquivo não
  const aasi = grupos.find((g) => g.nome === "AASI")!;
  assert.equal(aasi.campos.find((c) => c.slug === "plano")!.editavel, true, "plano deve ser editável");
  assert.equal(aasi.campos.find((c) => c.slug === "no_de_serie_oe")!.editavel, true, "no_de_serie_oe deve ser editável");
  assert.equal(aasi.campos.find((c) => c.slug === "programacao")!.editavel, false, "programação (arquivo) nunca edita");

  // Venda: tudo editável
  const venda = grupos.find((g) => g.nome === "Venda")!;
  assert.equal(venda.campos.find((c) => c.slug === "vendeu")!.editavel, true, "vendeu deve ser editável");
  assert.equal(venda.campos.find((c) => c.slug === "data_da_venda")!.editavel, true, "data_da_venda deve ser editável");

  // Pós-Venda: número e texto_longo editáveis
  const posVenda = grupos.find((g) => g.nome === "Pós-Venda")!;
  assert.equal(posVenda.campos.find((c) => c.slug === "ultimo_nps_csat_feedback")!.editavel, true, "nps deve ser editável");
  assert.equal(posVenda.campos.find((c) => c.slug === "feedback")!.editavel, true, "feedback deve ser editável");
});

// ─────────────── valor ⇄ exibição/editor ───────────────

test("valorParaTexto: vazio honesto, seleção crua, data e data_hora no fuso SP", () => {
  assert.equal(valorParaTexto("texto", null), "—");
  assert.equal(valorParaTexto("selecao", "Teleconsulta"), "Teleconsulta");
  assert.equal(valorParaTexto("data", "2026-07-22"), "22/07/2026");
  // 17:00Z = 14:00 em São Paulo
  assert.equal(valorParaTexto("data_hora", "2025-07-31T17:00:00+00:00"), "31/07/2025 14:00");
  assert.equal(valorParaTexto("numero", 8900), "8.900");
  assert.equal(valorParaTexto("booleano", true), "Sim");
});

test("valorParaInput/inputParaValor: data_hora roda ida-e-volta no fuso da operação", () => {
  const iso = "2025-07-31T17:00:00.000Z";
  const input = valorParaInput("data_hora", iso); // → datetime-local em SP
  assert.equal(input, "2025-07-31T14:00");
  const volta = inputParaValor("data_hora", input);
  assert.deepEqual(volta, { ok: true, valor: iso });
});

test("inputParaValor: vazio limpa (null), número pt-BR, inválidos não viram evento", () => {
  assert.deepEqual(inputParaValor("texto", "  "), { ok: true, valor: null });
  assert.deepEqual(inputParaValor("numero", "1.234,5"), { ok: true, valor: 1234.5 });
  assert.equal(inputParaValor("numero", "abc").ok, false);
  assert.equal(inputParaValor("data", "31/07/2026").ok, false);
  assert.deepEqual(inputParaValor("data", "2026-07-31"), { ok: true, valor: "2026-07-31" });
  assert.deepEqual(inputParaValor("selecao", "Sim"), { ok: true, valor: "Sim" });
  assert.equal(inputParaValor("outro", "x").ok, false); // campo sem editor nunca escreve
});

// ─────────────── datas e prazo ───────────────

test("fmtDataHora: hoje/ontem/amanhã/dd-mm no fuso SP", () => {
  const agora = new Date("2026-07-21T18:00:00-03:00");
  assert.equal(fmtDataHora("2026-07-21T19:30:00-03:00", agora), "hoje 19:30");
  assert.equal(fmtDataHora("2026-07-20T22:00:00-03:00", agora), "ontem 22:00");
  assert.equal(fmtDataHora("2026-07-22T09:00:00-03:00", agora), "amanhã 09:00");
  assert.equal(fmtDataHora("2026-07-15T10:00:00-03:00", agora), "15/07 10:00");
  // borda de dia: 01:30Z de 22/07 ainda é 22:30 SP de 21/07 → "hoje"
  assert.equal(fmtDataHora("2026-07-22T01:30:00Z", agora), "hoje 22:30");
});

test("nivelPrazo: vencido → atrasada; <24h → breve; senão null", () => {
  const agora = new Date("2026-07-21T12:00:00-03:00").getTime();
  assert.equal(nivelPrazo("2026-07-21T11:00:00-03:00", agora), "atrasada");
  assert.equal(nivelPrazo("2026-07-21T18:00:00-03:00", agora), "breve");
  assert.equal(nivelPrazo("2026-07-23T12:00:00-03:00", agora), null);
  assert.equal(nivelPrazo(null, agora), null);
  assert.equal(nivelPrazo("lixo", agora), null);
});
