/**
 * Lógica pura da aba Configurações > Membros (Rodada 11 / Bloco C).
 * Espelha a matriz de permissão §3 da SPEC-WORKSPACE-USUARIOS para HABILITAR/DESABILITAR
 * controles na UI — a defesa real vive no banco (api.registrar_evento v3 + porta.*, 0035);
 * aqui é só ergonomia (não mostrar botão que a porta vai recusar).
 */

/**
 * A FONTE UNICA do vocabulario de papel na web — e ela e unica por causa de um defeito medido.
 *
 * ESPELHA O CHECK DE `core.usuario.papel`. A migration `0250` (T9, D43) acrescentou `marketing`
 * ao dominio do banco, e a web tinha TRES copias desta lista (aqui, em `regras/canais.ts` e na
 * allowlist de `lerPapelAtual`). Nenhuma das tres foi atualizada, e o efeito nao dava erro em
 * lugar nenhum: o Fernando faz login, o banco responde `marketing`, a web le `null` — e ele fica
 * sem papel nenhum na interface inteira, INCLUSIVE na tela que a T9 existe para liberar. A RLS o
 * deixaria ler a atribuicao; a UI o trataria como estranho.
 *
 * Tres copias e o motivo de ninguem ter atualizado: quem le uma nao sabe das outras. Agora e uma,
 * e as outras importam daqui.
 *
 * Ampliar a lista e SEGURO e foi conferido antes: os 27 gates de papel do app sao allowlist
 * POSITIVA (`=== "admin" || === "owner"`), entao nenhum concede nada a `marketing` por omissao.
 * O unico com forma negativa e `podeAbrirChamado` (`papel !== null`), e abrir chamado e
 * justamente o que todo autenticado pode.
 */
export const PAPEIS = ["owner", "admin", "membro", "marketing"] as const;
export type Papel = (typeof PAPEIS)[number];

/**
 * Quem ve a tela de marketing (RF-12 / D23). A mesma tripla da policy `captacao_sel_marketing`
 * da `0251` — e e de proposito que a lista esteja escrita nos dois lugares: a RLS e a defesa
 * real (a rota sozinha nao protege o dado), e esta evita entregar uma tela vazia a quem o banco
 * ja ia recusar, o que pareceria defeito da tela.
 *
 * Papel indisponivel (`null`) NAO ve: falha fechado.
 */
export function podeVerMarketing(papel: Papel | null): boolean {
  return papel === "marketing" || papel === "admin" || papel === "owner";
}

export interface MembroLinha {
  id: string;
  nome: string | null;
  email: string;
  papel: Papel;
  funcao: string | null;
  ativo: boolean;
  ultimo_acesso_em: string | null;
}

export interface ConviteLinha {
  id: string;
  email: string;
  /**
   * Era `"admin" | "membro"` — o UNICO lugar deste arquivo que reescrevia o vocabulario em vez de
   * usar `Papel`, e por isso o unico que a `0250` nao alcancou. Um convite `marketing` gravado no
   * banco chegava aqui como valor fora do tipo. Leitura: a fonte e o CHECK do banco, entao o tipo
   * daqui e `Papel` inteiro; quem ESCREVE convite usa `PapelConvidavel` (owner nunca nasce de convite).
   */
  papel: Papel;
  funcao: string | null;
  criado_em: string;
  expira_em: string;
  status: "pendente" | "aceito" | "revogado" | "expirado";
}

export function rotuloPapel(papel: Papel): string {
  if (papel === "owner") return "Proprietário";
  if (papel === "admin") return "Admin";
  // Sem este caso, quem tem papel `marketing` apareceria como "Membro" na lista — a tela
  // afirmaria um papel que a pessoa não tem, e quem fosse conferir acesso leria errado.
  if (papel === "marketing") return "Marketing";
  return "Membro";
}

/** `valor` veio de fora do type-system (rede, banco, `<select>`) e pertence ao dominio? */
export function ehPapel(valor: unknown): valor is Papel {
  return typeof valor === "string" && (PAPEIS as readonly string[]).includes(valor);
}

/**
 * Rótulo a partir de um papel CRU. A tela pública de aceite (`app/convite/aceitar/page.tsx`) lê
 * `ConviteValidado.papel` como `string` — o runtime devolve o que o banco gravou, sem tipo. Sem
 * esta peneira a tela cai num ternário `=== "admin" ? "Admin" : "Membro"`, que foi exatamente o
 * defeito: um convite `marketing` anunciava **"Acesso de Membro"** no instante em que a pessoa
 * decide aceitar.
 *
 * Valor fora do domínio degrada para o papel de MENOR acesso — nunca para um rótulo inventado, e
 * nunca para o rótulo do papel mais poderoso.
 */
export function rotuloPapelBruto(valor: string | null | undefined): string {
  return ehPapel(valor) ? rotuloPapel(valor) : "Membro";
}

/**
 * O que um convite pode conceder. `owner` está fora de propósito: proprietário não nasce de
 * convite, e oferecê-lo no `<select>` seria montar uma ação que a porta recusa.
 *
 * A ordem é a do `<select>` (o padrão primeiro) e a lista é a fonte única das `<option>` —
 * acrescentar papel aqui acrescenta a opção na tela, e é assim que a próxima adição não repete
 * o defeito de 22/08: `<option>` nova e leitor do `<select>` desalinhados.
 */
export const PAPEIS_CONVIDAVEIS = ["membro", "admin", "marketing"] as const satisfies readonly Papel[];
export type PapelConvidavel = (typeof PAPEIS_CONVIDAVEIS)[number];

/**
 * Lê o valor de um `<select>` de papel de convite. Existe porque a leitura anterior era
 * `(ref.value === "admin" ? "admin" : "membro")`: qualquer `<option>` acrescentada e não prevista
 * ali virava **"membro" em silêncio** — a pessoa escolhia Marketing, o convite saía Membro, e não
 * havia erro em lugar nenhum. Aqui, valor fora do domínio cai no padrão porque É o padrão do
 * `<select>` (`defaultValue="membro"`), não porque foi engolido.
 */
export function papelConvidavelOuPadrao(valor: string | null | undefined): PapelConvidavel {
  return (PAPEIS_CONVIDAVEIS as readonly string[]).includes(valor ?? "") ? (valor as PapelConvidavel) : "membro";
}

/** Gestão de membros/convites (convidar, reenviar, revogar convite): admin e owner. */
export function podeGerirMembros(meuPapel: Papel | null): boolean {
  return meuPapel === "admin" || meuPapel === "owner";
}

/**
 * Select de papel na linha (§3):
 *  - ninguém edita o próprio papel; o papel do owner é fixo ("Proprietário", texto);
 *  - owner: muda o papel de qualquer um que não seja owner;
 *  - admin: só PROMOVE membro -> admin OU marketing (rebaixar é só do owner);
 *  - membro: nada.
 *
 * O alvo que JÁ é `marketing` é inalcançável para o admin, e isto aqui está certo — mas a razão não
 * é a que estava escrita antes ("quem dá acesso a mídia é o proprietário"). Lido do corpo VIVO de
 * `api.registrar_evento` em produção (31/08):
 *
 *     elsif v_meu_papel = 'admin' then
 *       if not (v_alvo_papel = 'membro' and v_papel_para in ('admin','marketing')) then raise ...
 *
 * Ou seja: o banco autoriza o admin a promover **membro -> marketing**; o que ele recusa é mexer em
 * quem já saiu de `membro`. É a mesma regra que já valia para `admin`, não uma proteção especial do
 * dado de mídia. A função abaixo bate com isso porque `alvo.papel === "membro"` cobre exatamente o
 * caso autorizado.
 */
export function podeMudarPapel(meuPapel: Papel | null, alvo: { papel: Papel; souEu: boolean }): boolean {
  if (alvo.souEu || alvo.papel === "owner") return false;
  if (meuPapel === "owner") return true;
  if (meuPapel === "admin") return alvo.papel === "membro";
  return false;
}

/**
 * Opções que o select de papel pode oferecer para um alvo (já sabendo que é editável).
 *
 * ⚠️ Esta função É o hardcode da promoção — a `<option>` da tela sai daqui. Enquanto ela devolvia
 * `["admin", "membro"]` para o owner, dois defeitos andavam juntos: ninguém conseguia conceder
 * `marketing` pela interface (o Fernando só ganhava acesso virando `admin`, o que lhe entrega TODO
 * lead, conversa e dado de paciente), e o alvo que JÁ era `marketing` renderizava um
 * `<select value="marketing">` sem `<option>` correspondente — **valor órfão: a tela exibia o papel
 * errado de quem já era marketing**.
 *
 * A lista do owner tem que conter todo papel não-owner alcançável por ele, senão o órfão volta.
 *
 * 🔴 A do admin também inclui `marketing`, e isso foi conferido contra o banco, não deduzido: o corpo
 * vivo de `api.registrar_evento` em produção autoriza `v_alvo_papel = 'membro' and v_papel_para in
 * ('admin','marketing')` para quem é admin. Deixar `marketing` de fora aqui criava o pior dos dois
 * mundos — o banco aceitaria a promoção e a interface não a ofereceria, então o Fernando continuaria
 * dependendo do owner para uma coisa que qualquer admin já podia fazer.
 */
export function opcoesDePapel(meuPapel: Papel | null, papelAlvo: Papel): Papel[] {
  if (meuPapel === "owner") return ["admin", "membro", "marketing"];
  if (meuPapel === "admin" && papelAlvo === "membro") return ["admin", "membro", "marketing"];
  return [papelAlvo];
}

/** Revogar/reativar acesso (§3): owner qualquer não-owner; admin só membro; nunca a si mesmo. */
export function podeRevogar(meuPapel: Papel | null, alvo: { papel: Papel; souEu: boolean }): boolean {
  if (alvo.souEu || alvo.papel === "owner") return false;
  if (meuPapel === "owner") return true;
  if (meuPapel === "admin") return alvo.papel === "membro";
  return false;
}

/** Funcao (subtítulo livre): a própria qualquer um edita; a de outro, admin/owner. */
export function podeEditarFuncao(meuPapel: Papel | null, souEu: boolean): boolean {
  if (souEu) return true;
  return podeGerirMembros(meuPapel);
}

/** Iniciais pro avatar ("Diogo Fonseca" → "DF"; fallback no email). */
export function iniciaisMembro(nome: string | null, email: string): string {
  const base = (nome ?? "").trim() || email.split("@")[0].replace(/[._-]/g, " ").trim();
  const partes = base.split(/\s+/).filter(Boolean);
  const letras = partes.length >= 2 ? partes[0][0] + partes[partes.length - 1][0] : base.slice(0, 2);
  return letras.toUpperCase();
}

/** "Membro · convidado há 2 dias" (linha pendente do mockup). */
export function convidadoHa(criadoEm: string, agora: Date): string {
  const criado = new Date(criadoEm);
  const ms = agora.getTime() - criado.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "convidado agora";
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "convidado agora";
  if (horas < 24) return `convidado há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(horas / 24);
  return `convidado há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function emailConviteValido(email: string): boolean {
  const e = email.trim();
  return e.length >= 5 && e.includes("@") && e.indexOf("@") > 0 && e.indexOf("@") < e.length - 1 && !e.includes(" ");
}

/** Separa e ordena a tabela única do mockup: ativos (owner primeiro, depois nome) + pendentes no fim. */
export function ordenarTabela(membros: MembroLinha[], convites: ConviteLinha[]): {
  ativos: MembroLinha[];
  pendentes: ConviteLinha[];
} {
  // `marketing` cai no mesmo degrau de `membro` (2) — a ordenação é por alcance de gestão, e
  // marketing não gere ninguém. Dentro do degrau desempata o nome, então a lista fica estável.
  const peso = (p: Papel) => (p === "owner" ? 0 : p === "admin" ? 1 : 2);
  const ativos = [...membros]
    .filter((m) => m.ativo)
    .sort((a, b) => peso(a.papel) - peso(b.papel) || (a.nome ?? a.email).localeCompare(b.nome ?? b.email, "pt-BR"));
  const pendentes = [...convites]
    .filter((c) => c.status === "pendente" || c.status === "expirado")
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  return { ativos, pendentes };
}
