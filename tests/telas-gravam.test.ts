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
    "gerarConviteAberto",
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
    "gerarConviteAberto(chaveCargo)",
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
    // o ramo do ensaio abre acima de cada fabricação. A janela é 20 e não 5 porque o objeto
    // `ConviteEnsaio` do ensaio tem 12 campos — o que se prova é que a fabricação está DENTRO de um
    // ramo de ensaio, não a que distância ele abre.
    const acima = linhas.slice(Math.max(0, i - 20), i).join("\n");
    assert.ok(
      acima.includes("if (ensaio)"),
      `linha ${i + 1}: token fabricado fora de um ramo \`if (ensaio)\` — é o convite fantasma voltando`,
    );
  }
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

/*
 * ── LINK ABERTO: um link, várias pessoas (14/09, depois que o Diogo viu a tela) ────────────────
 *
 * O defeito que estes fecham não estava no banco. As migrations 0342-0344 estavam APLICADAS em
 * produção desde 11/09 e o recurso não existia para ninguém, porque a única porta de entrada — a
 * rota `POST /admin/convites` do runtime — fazia `corpo.canal === "email" ? "email" : "link"` e
 * descartava o valor em silêncio. Banco pronto + porta que descarta é a classe de defeito mais cara
 * desta casa, porque nada quebra e ninguém descobre.
 */

test("o convite pendente diz que é de grupo, e não mostra o marcador `.invalid`", () => {
  assert.ok(membros.includes('const grupo = c.canal === "link_aberto"'));
  assert.ok(membros.includes('{grupo ? "Link do grupo"'), "o marcador apareceria como e-mail na lista");
  assert.ok(membros.includes("várias pessoas"));
});

test("`canal` e `cargo` vêm do banco — a tela não adivinha qual convite é aberto", () => {
  const leitor = readFileSync(new URL("../lib/dados/membros-reais.ts", import.meta.url), "utf8");
  assert.ok(leitor.includes("canal,cargo"), "o select não traz canal nem cargo de core.v_convite");
  assert.ok(leitor.includes('c.canal === "link_aberto" ? "link_aberto"'));
});

test("o modal do convite NAO pede e-mail e NAO oferece escolha — D102, cravada pelo Diogo na tela", () => {
  // ⛔ SUBSTITUI, no lugar da versao errada, tres testes que gravavam contratos ja removidos:
  //   - "o modal pede e-mail, e sem e-mail valido nao deixa gerar"
  //   - "a escolha entre um e varios e feita de CONSEQUENCIA, nao de rotulo"
  //   - a asercao `emailOk = paraGrupo || ...` dos outros dois
  // Eles nao estavam errados quando foram escritos: mediam o passo intermediario desta MESMA
  // rodada (modal com e-mail, depois modal com escolha um/varios). O Diogo olhou a tela rodando e
  // cravou: "Quero somente o link pra convite, os usuarios entram e criam a conta normalmente."
  // Contrato novo: UM campo (cargo) e UM botao. Nao ha modo nominal para exigir e-mail.
  assert.ok(!membros.includes('id="convite-email"'), "voltou campo de e-mail ao modal");
  assert.ok(!membros.includes("paraGrupo"), "voltou o modo um/varios");
  assert.ok(!membros.includes("Uma pessoa"), "voltou a escolha entre uma e varias pessoas");
});

test("o link aberto e pedido pela action real, e o canal chega ao banco", () => {
  assert.ok(membros.includes("gerarConviteAberto(chaveCargo)"), "a tela nao chama a action do link aberto");
  assert.ok(acoes.includes('canal: "link_aberto"'), "a action nao pede o canal aberto");
});

test("no link aberto a tela NAO inventa e-mail — quem monta o marcador e o servidor", () => {
  // e-mail e identidade, e identidade inventada pelo navegador e a classe de defeito da ARB-26 —
  // a mesma do token `cnv_${Math.random()}` que esta rodada comecou consertando.
  // Com a D102 a guarda fica MAIS forte, nao mais fraca: antes o web podia mandar `email: null`
  // num dos dois modos; agora nao ha campo de e-mail nenhum para inventar.
  assert.ok(!membros.includes('id="convite-email"'), "a tela voltou a coletar e-mail");
  assert.ok(
    !acoes.includes(".invalid"),
    "o marcador `.invalid` nao pode nascer no web — ele e do runtime (src/convites/servidor.ts)",
  );
  assert.ok(acoes.includes("export async function gerarConviteAberto(cargo: string)"));
  assert.ok(
    !/gerarConviteAberto\([^)]*email/.test(acoes),
    "gerarConviteAberto nao recebe e-mail: o modo aberto existe justamente para nao pedir um",
  );
});

test("a tela diz a verdade sobre o link: serve para varias, e nunca 'uma vez so'", () => {
  // `porta.aceitar_convite` (0342) ignora `usado_em` no canal aberto: o link NAO se consome.
  // Com a D102 todo convite e aberto, entao a frase do uso unico nao pode existir em lugar nenhum.
  assert.ok(membros.includes("serve para várias pessoas"));
  assert.ok(!membros.includes("serve uma vez só"), "sobrou a frase do uso unico, que nao vale mais");
});

/*
 * ── A TELA DE CHEGADA (14/09) ──────────────────────────────────────────────────────────────────
 * Quem abre `/convite/aceitar` é a fono, no celular, e nunca viu o sistema. O print do Diogo
 * mostrava a primeira frase dela errada de três jeitos ao mesmo tempo: "Você foi convidado",
 * "Acesso de **Admin**" (o papel técnico, não o cargo) e o e-mail do convite mascarado — que num
 * link de grupo é o marcador `a*********@convite.invalid`, um endereço que não é de ninguém.
 */

const aceite = readFileSync(new URL("../app/convite/aceitar/aceitar-real.tsx", import.meta.url), "utf8");
const acoesAceite = readFileSync(new URL("../app/convite/aceitar/actions.ts", import.meta.url), "utf8");

test("a tela anuncia o CARGO, não o papel técnico do banco", () => {
  assert.ok(aceite.includes("cargoPorChave(convite.cargo)"), "a tela não resolve o cargo");
  assert.ok(aceite.includes("Você entra como <strong"));
  assert.ok(aceite.includes("{cargo.nome}"));
  assert.ok(!aceite.includes("Acesso de <strong"), "o papel técnico voltou para a primeira frase");
});

test("a tela NÃO lista o que cada cargo alcança (Diogo, 14/09)", () => {
  // Cortado a pedido dele: tela de chegada não é lugar de explicar permissão, e a lista empurrava
  // o formulário para fora da primeira dobra no celular — que é onde ela é aberta.
  assert.ok(!aceite.includes("cargo.ve"), "a lista de telas voltou");
  assert.ok(!aceite.includes("cargo.telas"));
  assert.ok(aceite.includes("Boas-vindas à Me Escuta"));
});

test("o formulário responde enquanto se digita, e o botão diz o que falta", () => {
  // Antes era `FormData` no submit: a pessoa preenchia os três campos no escuro e só descobria a
  // senha curta depois de clicar. No celular esse erro custa a tentativa inteira.
  for (const sinal of ["const nomeOk =", "const emailOk =", "const senhaOk =", "const prontoPara ="]) {
    assert.ok(aceite.includes(sinal), `falta ${sinal}`);
  }
  assert.ok(aceite.includes("`Falta ${faltando}`"), "o botão desabilitado precisa dizer o motivo");
  assert.ok(aceite.includes("disabled={pendente || !prontoPara}"));
  // o QUE `prontoPara` é, e não só que ele é usado: a primeira versão deste teste passava com
  // `prontoPara = true`, que libera o botão com os três campos vazios
  assert.ok(aceite.includes("const prontoPara = nomeOk && emailOk && senhaOk;"));
  assert.ok(aceite.includes("senha.length >= 8"), "a régra dos 8 caracteres saiu do cliente");
});

test("no link de grupo a tela não pede 'o mesmo e-mail do convite' nem mostra o marcador", () => {
  assert.ok(aceite.includes('convite.aberto ? "Seu e-mail" : "Seu e-mail (o mesmo do convite)"'));
  // A dica é um valor NOMEADO com o guarda explícito, e não um ternário aninhado no JSX — a
  // primeira versão deste teste passava com o guarda removido, porque a janela de linhas pegava o
  // `convite.aberto` do RÓTULO logo acima. Guarda que o teste não vê sumir não é guarda.
  const bloco = aceite.slice(aceite.indexOf("const dicaEmail"), aceite.indexOf("})();", aceite.indexOf("const dicaEmail")));
  assert.ok(bloco.length > 0, "o `dicaEmail` sumiu — a dica voltou para dentro do JSX");
  assert.ok(bloco.includes("if (convite.aberto) return"), "o ramo aberto não é tratado ANTES do marcador");
  assert.ok(
    bloco.indexOf("convite.aberto") < bloco.indexOf("email_mascarado"),
    "o marcador é alcançável antes de checar se o link é aberto",
  );
  // e em nenhum outro lugar do arquivo o marcador é LIDO — comentário que o cita não conta, o que
  // este teste aprendeu na própria pele mais cedo hoje, duas vezes
  const leituras = aceite
    .split("\n")
    .filter((l) => l.includes("email_mascarado") && !/^\s*(\*|\/\/)/.test(l));
  assert.equal(leituras.length, 1, `email_mascarado lido fora do \`dicaEmail\`: ${leituras.join(" | ")}`);
  assert.ok(bloco.includes(leituras[0].trim()), "a leitura do marcador saiu de dentro do `dicaEmail`");
});



test("o autofill continua desligado no e-mail — e no link aberto ele é PIOR", () => {
  // Como o link de grupo aceita qualquer e-mail, o login salvo do Chrome criaria a conta com o
  // endereço errado sem erro nenhum. A proteção de 11/09 vale mais aqui, não menos.
  assert.ok(aceite.includes('name="email_do_convite"'));
  assert.ok(aceite.includes('autoComplete="off"'));
});

test("aceitar entra direto — e o sucesso sem sessão continua sendo sucesso", () => {
  assert.ok(acoesAceite.includes("signInWithPassword"), "o aceite não entra");
  assert.ok(acoesAceite.includes("return { ok: true, entrou: false };"));
  assert.ok(aceite.includes('router.push(r.entrou ? "/funil"'));
  // o degrade manda para o login DIZENDO que a conta existe; sem isso a tela é idêntica à de quem
  // errou a senha, e a pessoa tenta aceitar de novo um convite já aceito
  assert.ok(aceite.includes("/login?conta=criada&email="));
  const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  assert.ok(login.includes("Sua conta está pronta"));
});

test("falha do login automático NÃO vira erro de aceite — a conta já existe", () => {
  // `ok: false` aqui faria a pessoa clicar de novo e levar "este email já tem cadastro".
  assert.ok(!/signInWithPassword[\s\S]{0,200}return \{ ok: false/.test(acoesAceite));
});
