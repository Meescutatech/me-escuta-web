import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 14/09/2026 — A TELA DE MEMBROS TEM DE GRAVAR.
 *
 * O defeito que estes testes existem para não deixar voltar: em 11/09 três commits promoveram
 * telas de ensaio ao caminho real, religaram a LEITURA no banco e deixaram a ESCRITA nos handlers
 * locais. O efeito medido em 14/09: um convite gerado pela tela devolveu "Link pronto — vale 7
 * dias" com token `cnv_ium8131lr76bzczq`, o contador subiu de 5 para 6, e `core.convite` não teve
 * nenhuma linha criada naquele dia. Revogar acesso era `setMembros`; revogar convite dizia "o link
 * não abre mais" e o link abria.
 *
 * Por que a prova é sobre o TEXTO-FONTE e não sobre comportamento: o que falhou não foi uma conta
 * errada — foi uma CHAMADA QUE NÃO EXISTIA. Um teste de unidade sobre a função local passaria
 * verdinho exatamente no estado quebrado, porque a função local funcionava: ela só não falava com
 * o servidor. O que separa a tela certa da errada é haver ou não a chamada, e é isso que se assere
 * aqui. Um render de verdade (Playwright contra o banco) provaria mais, e não existe nesta casa.
 *
 * ⚠️ Cada asserção foi vista REPROVAR: rodei a bateria com o arquivo mutado (chamada removida,
 * campo de e-mail removido, parâmetro do cliente reintroduzido) antes de considerá-la guarda.
 */

const membros = readFileSync(new URL("../components/ensaio/membros.tsx", import.meta.url), "utf8");
const acoes = readFileSync(
  new URL("../app/(app)/configuracoes/membros/actions.ts", import.meta.url),
  "utf8",
);

test("a tela de Membros importa as actions reais — as sete sempre existiram, o ramo novo é que não as chamava", () => {
  for (const nome of [
    "gerarConvitePorCargo",
    "mudarCargo as acaoMudarCargo",
    "reativarAcesso as acaoReativarAcesso",
    "reenviarConvite as acaoReenviarConvite",
    "revogarAcesso as acaoRevogarAcesso",
    "revogarConvite as acaoRevogarConvite",
  ]) {
    assert.ok(membros.includes(nome), `falta importar \`${nome}\` de membros/actions`);
  }
});

test("cada escrita da tela chama a action — e não um setState", () => {
  const chamadas = [
    "acaoRevogarAcesso(m.id)",
    "acaoReativarAcesso(m.id)",
    "acaoRevogarConvite(c.id)",
    "acaoReenviarConvite(c.id)",
    "acaoMudarCargo(m.id, chave)",
    "gerarConvitePorCargo(email, chaveCargo)",
  ];
  for (const c of chamadas) {
    assert.ok(membros.includes(c), `a tela não chama \`${c}\``);
  }
});

test("revogar e devolver acesso são DOIS eventos, não um interruptor", () => {
  // `acesso_revogado` e `acesso_reativado` (0035) existem separados de propósito: o ledger registra
  // os dois sentidos com autor e hora. Um único `alternar(ativo)` perderia essa metade.
  assert.ok(membros.includes("m.ativo ? () => acaoRevogarAcesso(m.id) : () => acaoReativarAcesso(m.id)"));
  assert.ok(acoes.includes('"acesso_revogado"') && acoes.includes('"acesso_reativado"'));
});

test("o token do convite nunca é fabricado no navegador fora do ensaio", () => {
  // O token real é `randomBytes(32).toString("base64url")` — 43 caracteres, sem prefixo, sorteado
  // no runtime (src/convites/token.ts). O prefixo `cnv_` só pode sobreviver no ramo do ensaio.
  const linhas = membros.split("\n");
  const fabricacoes = linhas
    .map((l, i) => [l, i] as const)
    // comentário que CITA o defeito não é o defeito — e esta linha existe porque o primeiro
    // rascunho deste teste reprovou no próprio texto que explica o bug
    .filter(([l]) => l.includes("cnv_${Math.random") && !/^\s*(\*|\/\/)/.test(l));
  assert.ok(fabricacoes.length > 0, "o ensaio perdeu o token de mentira — refaça este teste");
  for (const [, i] of fabricacoes) {
    // o ramo do ensaio abre no máximo 12 linhas acima de cada fabricação
    const acima = linhas.slice(Math.max(0, i - 12), i).join("\n");
    assert.ok(
      acima.includes("if (ensaio)"),
      `linha ${i + 1}: token fabricado fora de um ramo \`if (ensaio)\` — é o convite fantasma voltando`,
    );
  }
});

test("o modal pede e-mail, e sem e-mail válido não deixa gerar", () => {
  // A prova sem ler código, que foi como o defeito apareceu: o modal no ar pedia Cargo e Nome
  // opcional e NÃO pedia e-mail — e `POST /admin/convites` recusa sem e-mail (400 "email inválido").
  assert.ok(membros.includes('id="convite-email"'), "o modal não tem campo de e-mail");
  assert.ok(membros.includes("const emailOk = emailConviteValido(email)"));
  assert.ok(membros.includes("disabled={!emailOk || gerando}"), "o botão Gerar link não trava sem e-mail");
});

test("convite sem token guardado oferece gerar link NOVO, nunca copiar um link vazio", () => {
  // `core.v_convite` não expõe token e `ops.convite_token` guarda só o hash: no caminho real
  // `token` vem "" (lib/dados/membros-reais.ts:96). Copiar produziria `...?token=` — um link morto.
  assert.ok(membros.includes("{c.token ? ("), "o botão Copiar link não é condicionado ao token");
  assert.ok(membros.includes("Gerar link novo"));
});

test("mudar cargo não aceita papel nem lotação vindos do cliente", () => {
  // A guarda de `papel_alterado` compara o papel ATUAL ("admin só promove membro a admin"). Se o
  // `papel_de` viesse do navegador, a guarda passaria a validar o que o navegador disse.
  assert.ok(
    acoes.includes("export async function mudarCargo(usuarioId: string, cargo: string)"),
    "mudarCargo ganhou parâmetro vindo do cliente — o estado atual tem de ser LIDO no servidor",
  );
  assert.ok(acoes.includes('.rpc("expandir_cargo"'), "a expansão do cargo tem de vir do banco (0338)");
  assert.ok(acoes.includes('.from("v_membro")') && acoes.includes('.from("usuario_departamento")'));
});

test("mudar cargo compõe com os três eventos que existem — não inventa `cargo_alterado`", () => {
  for (const tipo of ["papel_alterado", "usuario_departamento_removido", "usuario_departamento_atribuido"]) {
    assert.ok(acoes.includes(`"${tipo}"`), `mudarCargo não emite \`${tipo}\``);
  }
  // como TIPO de evento (entre aspas). Citá-lo em comentário para explicar que não existe é o
  // oposto de emiti-lo.
  assert.ok(!acoes.includes('"cargo_alterado"'), "não existe evento `cargo_alterado` no banco");
});

test("falha parcial de mudar cargo é dita, não escondida", () => {
  // São até três escritas e não há transação. Devolver só `ok: false` faria a tela dizer "não deu
  // certo" sobre uma mudança que entrou pela metade.
  assert.ok(acoes.includes("passos: PassoCargo[]"));
  assert.ok(membros.includes('toast.error(entrou > 0 ? "O cargo mudou pela metade." : "Não gravou."'));
});
