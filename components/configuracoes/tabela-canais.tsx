"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CopyIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  ativarCanal,
  desativarCanal,
  removerCanal,
} from "@/app/(app)/configuracoes/canais/actions";
import {
  AVISO_APLICACAO_RUNTIME,
  AVISO_RISCO_BAN,
  colunasVisiveis,
  avisoDesativacao,
  contagemDaLista,
  entradaAdicionar,
  estadoDoCanal,
  ordenarCanais,
  podeGerirCanais,
  podeRemoverCanal,
  rotuloDepartamento,
  rotuloEstadoCanal,
  estadoLiteNaTela,
  rotuloFinalidade,
  TEXTO_FINALIDADE_AUSENTE,
  TEXTO_NUMERO_DE_TESTE,
  type Canal,
  type Papel,
} from "./regras/canais.ts";
import type { Departamento } from "@/lib/departamentos/escopo";
import { PainelSessao } from "./painel-sessao";
import { BarraPublicacao, Dialogo } from "./kit";
import { CascaConfig, Contagem } from "@/components/ensaio/casca-config";
import { SheetNumeroLite } from "./sheet-numero-lite";
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from "@/components/ui/alert";
import { AlertDialogModal } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * F9 · Números de WhatsApp. Inventário do que a operação usa para falar.
 *
 * Três coisas que não são estética e sobreviveram ao redesenho de 11/09:
 *
 *  1. COLUNA COM VALOR ÚNICO SOME (decisão do Orquestrador). Enquanto todo canal for do mesmo
 *     departamento, DEPARTAMENTO sai; enquanto todos forem oficiais, PROVEDOR sai. Elas voltam
 *     sozinhas quando passam a significar alguma coisa.
 *  2. O ESTADO DEPENDE DO PROVEDOR e é o ponto delicado da tabela. Canal oficial tem Ativo/Inativo;
 *     canal não oficial tem SESSÃO, que se conecta lendo QR. Oferecer "Ativar" no não oficial
 *     saltaria para Conectado sem passar pelo pareamento — ficção de interface.
 *  3. O TOKEN NÃO APARECE. Nem mascarado, nem como campo, nem como palavra: ele vive no ambiente
 *     do runtime, e o rodapé da tela diz isso em vez de mostrar um cadeado decorativo.
 *
 * ── O QUE O REDESENHO DE 11/09 MUDOU (só apresentação; leitura, actions e portão F8 intactos) ──
 *
 *  A. O AVISO DE BAN É DITO UMA VEZ. Ele morava numa faixa âmbar REPETIDA embaixo de cada linha
 *     não oficial — duas faixas idênticas com o mesmo parágrafo, empurrando a tabela para baixo.
 *     Texto repetido não é ênfase: é ruído que ensina a pular a cor âmbar. Agora ele é um `Alert`
 *     único no topo, que só existe quando existe ao menos um canal não oficial, e cada linha
 *     carrega um MARCADOR (o selo "Não oficial") que devolve o texto inteiro no hover.
 *
 *  B. VERMELHO SÓ PARA O QUE QUEBROU. O formulário mostrava as mensagens de
 *     `validarRegistroCanal` em vermelho debaixo de TODO campo assim que abria — seis blocos
 *     vermelhos num formulário em branco, nenhum deles um erro. A validação não mudou uma linha;
 *     mudou QUANDO ela aparece: cada campo tem uma `description` CINZA desde o começo (o que
 *     digitar), e a mensagem vermelha só entra depois que a pessoa mexeu naquele campo.
 *
 *  C. UMA AÇÃO PRIMÁRIA POR LINHA, com nome explicado. Os rótulos ("Gerenciar", "Ver código",
 *     "Conectar", "Ligar", "Desligar") continuam mudando com o estado — mentir um rótulo só seria
 *     pior —, mas agora cada um diz no hover o que abre. O que é secundário (copiar id, copiar
 *     número) saiu da linha e foi para o menu ⋯.
 *
 *  D. HIERARQUIA. Nome (14px, medium) > número (12px mono) > id técnico (11px mono, esmaecido).
 *     Antes os sete campos disputavam o mesmo peso e o `lite:diogo` gritava tanto quanto o nome.
 *
 * Nada de Switch para ligar/desligar, embora a tela de ensaio use um: aqui LIGAR exige data de
 * corte e DESLIGAR pede confirmação (mensagem em voo vira falha permanente). Switch é o desenho de
 * uma ação instantânea e sem pergunta — não é o caso, e prometer isso seria o mesmo tipo de ficção
 * do item 2.
 */

export interface CanalNaTela extends Canal {
  /**
   * estado da sessão, quando o canal é não oficial e já houve pareamento.
   *
   * ⚠️ Não há campo `viva` aqui de propósito (card 2j). `core.v_sessao_canal.viva` depende de
   * `ultimo_batimento`, que só avança quando ALGUÉM ABRE A TELA — não existe batimento de fundo.
   * Um canal que ninguém olhou há seis minutos apareceria como morto estando de pé. Enquanto o
   * batimento não existir, o campo só teria como mentir, e a página cravava `viva: false` para
   * todo canal. A tela conta a sessão pelo `status` e o canal pelo `ativo`, e diz QUANDO leu
   * (`vistoEm` = `ops.sessao_canal.atualizado_em`): o status é uma foto, não um batimento.
   */
  sessao?: { status: string; vistoEm: string | null } | null;
}

/**
 * ✅ R22/A1 · A CONSTANTE MORREU AQUI (D22-1, e paga a ARB-R18-02).
 *
 * O que havia neste lugar era um array de QUATRO strings, copiado byte a byte do mockup
 * `numeros-whatsapp-r10.html`. Os quatro valores estão preservados no commit que os removeu e no
 * `ESTADO-R22.md` §2 (B1) — deliberadamente NÃO repetidos aqui, porque o portão de `grep` não
 * distingue comentário de código, e um literal citado é exatamente como alguém o cola de volta.
 * Medido no banco: dois deles não eram chave de nada (um era sinônimo, o outro nem existia) e os
 * outros dois eram nós de agrupamento, que a porta RECUSA desde o M8. Quatro opções, quatro erradas.
 *
 * O efeito perverso estava escrito no próprio comentário que aqui existia, e era preciso: *"mockup
 * e código concordam entre si e divergem só do banco — quem abrir os dois encontra duas fontes
 * coerentes e nenhuma correta, e sai mais confiante do que entrou."*
 *
 * O domínio agora vem de `core.v_departamento` pelo servidor (`lerDominioDepartamentos`), desce por
 * prop, e a regra de quais nós são ESCOLHÍVEIS vive em `regras/canais.ts` (`opcoesDepartamento`),
 * junto do resto das regras puras — não aqui, no componente.
 *
 * ⚠ Não recriar uma lista de departamentos neste arquivo, em nenhuma forma. `tests/canais.test.ts`
 * varre o repositório inteiro e fica VERMELHO se ela voltar — a guarda é `grep`, não revisão
 * humana, porque isto já aconteceu uma vez.
 */


export function TabelaCanais({
  canais,
  meuPapel,
  meuId = null,
  indisponivel,
  f8Pronto,
  departamentos,
  dominioIndisponivel,
  r22Legivel,
  nivelLegivel,
  declaracaoLegivel,
}: {
  canais: CanalNaTela[];
  meuPapel: Papel | null;
  /** uid de quem está logado — o portão do QR compara com o dono do canal. */
  meuId?: string | null;
  indisponivel: boolean;
  f8Pronto: boolean;
  /** R22/A1 · o domínio vindo de `core.v_departamento`, já ordenado. Nunca uma constante local. */
  departamentos: Departamento[];
  /** `true` = a view de departamento não respondeu. O `<select>` diz isso e não oferece nada. */
  dominioIndisponivel: boolean;
  /** `false` = a coluna `departamento` não existe nesta base (0130 não aplicada). */
  r22Legivel: boolean;
  /** D70 · `false` = a coluna `nivel` não existe nesta base. O painel DIZ que não leu. */
  nivelLegivel: boolean;
  /** D70 · `false` = a view não expõe `nivel_declarado`; não dá para dizer se alguém escolheu. */
  declaracaoLegivel: boolean;
}) {
  const router = useRouter();
  const gestor = podeGerirCanais(meuPapel);
  /* 16/09 · "Adicionar número" deixou de ser só da gestão: a gestão escolhe o tipo, o membro vai
     direto ao próprio número não oficial. Oficial, ligar e desligar continuam com `gestor`. */
  const entrada = entradaAdicionar(meuPapel);
  const [busca, setBusca] = useState("");
  /* 14/09 · o número NÃO OFICIAL saiu do formulário inline e virou um painel lateral com o QR.
     O oficial continua aqui: ele é mesmo um formulário — três dados técnicos que se copiam do
     painel da Meta. O não oficial não é: é uma pessoa, um celular e uma espera. */
  const [conectando, setConectando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<CanalNaTela | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const ordenados = useMemo(() => ordenarCanais(canais) as CanalNaTela[], [canais]);
  const cols = useMemo(() => colunasVisiveis(ordenados), [ordenados]);
  /*
   * 14/09 · CANAL DESLIGADO SAI DA LISTA — soft delete, e só no front.
   *
   * Não existe evento de remoção: `porta.projetor_registro` tem registrado, atualizado, ativado,
   * desativado, pareado, despareado e nível — nenhum apaga. É de propósito: o canal é um fato do
   * ledger, e o histórico das conversas que entraram por ele continua apontando para o id.
   *
   * O que sobra, e é o que a operação de fato quer, é não ver mais: desligar tira da lista. O fato
   * fica, o número some da frente, e um toggle traz de volta quem precisar. Nada é apagado — e a
   * frase "N desligados" existe para que a lista NUNCA minta sobre quantos números existem.
   *
   * Busca IGNORA o filtro: quem digita o nome de um número desligado está procurando justamente
   * por ele, e sumir com o resultado da busca seria a tela dizendo que ele não existe.
   */
  const [verDesligados, setVerDesligados] = useState(false);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q) {
      return ordenados.filter((c) =>
        `${c.nome} ${c.numero ?? ""} ${c.canal_id}`.toLowerCase().includes(q),
      );
    }
    return verDesligados ? ordenados : ordenados.filter((c) => c.ativo);
  }, [ordenados, busca, verDesligados]);

  // 16/09 · os contadores contam o que está NA TELA, numa regra só. Antes o "1 não oficial" contava
  // o desligado escondido, e o topo dizia uma coisa que a lista abaixo não mostrava.
  const { numeros, desligadosEscondidos, naoOficiais } = contagemDaLista({ todos: ordenados, visiveis: filtrados, busca, verDesligados });
  const podeEsconder = verDesligados && !busca.trim() && filtrados.some((c) => !c.ativo);

  // Uma coluna escondida some da grade inteira — cabeçalho, célula e largura saem juntos.
  const larguras = [
    "30%",
    cols.finalidade ? "11%" : null,
    cols.provedor ? "13%" : null,
    cols.departamento ? "13%" : null,
    "15%",
    "13%",
    "5%",
  ].filter(Boolean) as string[];
  const nColunas = larguras.length;

  function desativar(canal: CanalNaTela) {
    setErro(null);
    iniciar(async () => {
      const r = await desativarCanal(canal.canal_id, { confirmado: true });
      setConfirmar(null);
      if (!r.ok) setErro(r.motivo ?? "não deu para desligar");
      else {
        setAviso(AVISO_APLICACAO_RUNTIME);
        router.refresh(); // B1: sem isto a linha na tela continua a de antes da escrita
      }
    });
  }

  function ativar(canal: CanalNaTela, corte: string) {
    setErro(null);
    iniciar(async () => {
      const r = await ativarCanal(canal.canal_id, corte);
      if (!r.ok) setErro(r.motivo ?? "não deu para ligar");
      else {
        setAviso(AVISO_APLICACAO_RUNTIME);
        router.refresh();
      }
    });
  }

  return (
    <CascaConfig
      titulo="Números de WhatsApp"
      descricao="Os números por onde a operação fala, e o que cada um está autorizado a fazer. Registrar um número não exige deploy; ele nasce desligado."
      acao={
        entrada ? (
          <Button onClick={() => setConectando(true)}>
            <PlusIcon data-icon="inline-start" />
            Adicionar número
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* A busca fica à ESQUERDA (ressalva 2 do Croqui): ela filtra o que está abaixo, então mora
            do lado em que o olho começa a linha. A ação primária já está na ponta oposta, no topo. */}
        <label className="relative block w-[260px] max-w-full">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            autoComplete="off"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou número"
            aria-label="Buscar número"
            className="pl-8"
          />
        </label>
        <Contagem>
          {busca.trim()
            ? `${numeros} de ${ordenados.length} ${ordenados.length === 1 ? "número" : "números"}`
            : `${numeros} ${numeros === 1 ? "número" : "números"}`}
          {/* A lista nunca mente sobre quantos existem: o que está escondido é dito, e se traz de
              volta com um clique. */}
          {desligadosEscondidos > 0 || podeEsconder ? (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => setVerDesligados((v) => !v)}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                {verDesligados
                  ? "esconder os desligados"
                  : `${desligadosEscondidos} desligado${desligadosEscondidos === 1 ? "" : "s"}`}
              </button>
            </>
          ) : null}
          {naoOficiais > 0
            ? ` · ${naoOficiais} ${naoOficiais === 1 ? "não oficial" : "não oficiais"}`
            : ""}
        </Contagem>
      </div>

      {entrada === "nao_oficial" ? (
        <p className="text-ui-13 leading-relaxed text-muted-foreground">
          Você pode registrar o seu próprio número pessoal e gerar o QR dele. Número oficial e ligar
          ou desligar canais ficam com <b>admin</b> e <b>Proprietário</b>.
        </p>
      ) : !gestor ? (
        <p className="text-ui-13 leading-relaxed text-muted-foreground">
          Você está vendo esta tela em leitura. Números e canais são geridos por <b>admin</b> e{" "}
          <b>Proprietário</b>.
        </p>
      ) : null}

      {indisponivel ? (
        <Alert variant="destructive">
          <AlertIcon>
            <TriangleAlertIcon />
          </AlertIcon>
          <AlertContent>
            <AlertTitle>Não foi possível ler a lista de números</AlertTitle>
            <AlertDescription>
              A leitura de <span className="font-mono">core.v_canal_whatsapp</span> não respondeu. A
              conexão caiu ou a migration ainda não subiu neste ambiente.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {erro ? (
        <Alert variant="destructive">
          <AlertIcon>
            <TriangleAlertIcon />
          </AlertIcon>
          <AlertContent>
            <AlertDescription className="text-foreground">{erro}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {aviso ? (
        <Alert variant="info">
          <AlertIcon>
            <InfoIcon />
          </AlertIcon>
          <AlertContent>
            <AlertDescription className="text-foreground">{aviso}</AlertDescription>
          </AlertContent>
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setAviso(null)}>
            Entendi
          </Button>
        </Alert>
      ) : null}

      {/* ── O AVISO DE BAN, UMA VEZ SÓ ──────────────────────────────────────────────────────────
          Ele não pode sumir: o dano não é da empresa, é do WhatsApp pessoal de quem cedeu o
          número. Mas dito duas vezes, com o mesmo parágrafo, ele vira paisagem. Aqui ele aparece
          uma vez, e só quando há de fato um canal não oficial na lista; na linha, o selo "Não
          oficial" devolve o texto inteiro no hover. */}
      {naoOficiais > 0 ? (
        <Alert variant="warning">
          <AlertIcon>
            <TriangleAlertIcon />
          </AlertIcon>
          <AlertContent>
            <AlertTitle>
              {naoOficiais === 1
                ? "1 número não oficial em uso"
                : `${naoOficiais} números não oficiais em uso`}
            </AlertTitle>
            <AlertDescription>{AVISO_RISCO_BAN}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <SheetNumeroLite
        aberto={conectando}
        aoFechar={() => setConectando(false)}
        f8Pronto={f8Pronto}
        meuPapel={meuPapel}
        departamentos={departamentos}
        dominioIndisponivel={dominioIndisponivel}
        aoAviso={setAviso}
      />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table className="table-fixed">
          <colgroup>
            {larguras.map((l, i) => (
              <col key={i} style={{ width: l }} />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              {cols.finalidade ? <TableHead>Finalidade</TableHead> : null}
              {cols.provedor ? <TableHead>Provedor</TableHead> : null}
              {cols.departamento ? <TableHead>Departamento</TableHead> : null}
              <TableHead>Estado</TableHead>
              <TableHead>
                <span className="sr-only">Ação</span>
              </TableHead>
              <TableHead>
                <span className="sr-only">Mais ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {indisponivel ? (
              <>
                <LinhaFantasma colunas={nColunas} />
                <LinhaFantasma colunas={nColunas} />
              </>
            ) : filtrados.length === 0 && busca.trim() ? (
              <TableEmpty colSpan={nColunas}>
                <span className="inline-flex flex-wrap items-center justify-center gap-2">
                  Nenhum número corresponde a “{busca.trim()}”.
                  <Button variant="link" size="sm" onClick={() => setBusca("")}>
                    Limpar busca
                  </Button>
                </span>
              </TableEmpty>
            ) : filtrados.length === 0 ? (
              <TableEmpty colSpan={nColunas}>
                <span className="inline-flex flex-col items-center gap-3">
                  <span className="text-ui-14 font-medium text-foreground">
                    Nenhum número registrado.
                  </span>
                  <span>Registre o primeiro para a operação começar a falar por aqui.</span>
                  {entrada ? (
                    <Button onClick={() => setConectando(true)}>
                      <PlusIcon data-icon="inline-start" />
                      Adicionar número
                    </Button>
                  ) : null}
                </span>
              </TableEmpty>
            ) : (
              filtrados.map((c) => (
                <LinhaCanal
                  key={c.canal_id}
                  canal={c}
                  cols={cols}
                  colunas={nColunas}
                  departamentos={departamentos}
                  r22Legivel={r22Legivel}
                  nivelLegivel={nivelLegivel}
                  declaracaoLegivel={declaracaoLegivel}
                  gestor={gestor}
                  pendente={pendente}
                  expandido={expandido === c.canal_id}
                  aoExpandir={() => setExpandido(expandido === c.canal_id ? null : c.canal_id)}
                  aoDesativar={() => setConfirmar(c)}
                  aoAtivar={(corte) => ativar(c, corte)}
                  meuPapel={meuPapel}
                  meuId={meuId}
                  f8Pronto={f8Pronto}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-ui-12 leading-relaxed text-muted-foreground">
        O token de cada número vem do ambiente do servidor — esta tela nunca o pede, nem o mostra
        mascarado.
      </p>

      {confirmar ? (
        <Dialogo
          titulo={`Desligar ${confirmar.nome}?`}
          aoFechar={() => setConfirmar(null)}
          acoes={
            <>
              <Button variant="outline" onClick={() => setConfirmar(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" disabled={pendente} onClick={() => desativar(confirmar)}>
                Desligar mesmo assim
              </Button>
            </>
          }
        >
          <p className="text-ui-13 leading-relaxed text-muted-foreground">
            {avisoDesativacao(null)}
          </p>
        </Dialogo>
      ) : null}
    </CascaConfig>
  );
}

function LinhaFantasma({ colunas }: { colunas: number }) {
  return (
    <TableRow aria-hidden="true">
      <TableCell>
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      </TableCell>
      {Array.from({ length: colunas - 1 }, (_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-3 w-16" />
        </TableCell>
      ))}
    </TableRow>
  );
}

/** Ponto de estado: a cor é a informação, o texto ao lado é quem a diz por extenso. */
function Ponto({ tom }: { tom: "ok" | "atencao" | "ruim" | "neutro" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        tom === "ok" && "bg-success-ink",
        tom === "atencao" && "bg-warning",
        tom === "ruim" && "bg-destructive",
        tom === "neutro" && "bg-muted-foreground/45",
      )}
    />
  );
}

function LinhaCanal({
  canal,
  cols,
  colunas,
  gestor,
  pendente,
  expandido,
  aoExpandir,
  aoDesativar,
  aoAtivar,
  meuPapel,
  meuId,
  f8Pronto,
  departamentos,
  r22Legivel,
  nivelLegivel,
  declaracaoLegivel,
}: {
  canal: CanalNaTela;
  colunas: number;
  departamentos: Departamento[];
  r22Legivel: boolean;
  nivelLegivel: boolean;
  declaracaoLegivel: boolean;
  cols: { provedor: boolean; departamento: boolean; finalidade: boolean; consentimento: boolean };
  gestor: boolean;
  pendente: boolean;
  expandido: boolean;
  aoExpandir: () => void;
  aoDesativar: () => void;
  aoAtivar: (corte: string) => void;
  meuPapel: Papel | null;
  meuId: string | null;
  f8Pronto: boolean;
}) {
  const router = useRouter();
  const [corte, setCorte] = useState("");
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [removendo, iniciarRemocao] = useTransition();
  const estado = estadoDoCanal(canal);
  const lite = canal.provedor === "nao_oficial";
  const mostraRemover = podeRemoverCanal(meuPapel, meuId, canal);

  /**
   * CARD 2j · O LITE TEM DOIS ESTADOS, E ELES NÃO COINCIDEM.
   *
   * O que havia aqui mostrava, para o Lite, SÓ o status da sessão — e foi por isso que um canal
   * "Conectado" que não aparecia no seletor de envio pareceu defeito de outra coisa por meio dia
   * (relato de 17/09). A sessão é o aparelho pareado no WuzAPI; `ativo` é o que faz o runtime
   * ingerir e o número entrar no seletor. A regra pura decide as palavras; a célula só as desenha.
   */
  const estadoLite = lite
    ? estadoLiteNaTela({
        ativo: canal.ativo,
        statusSessao: canal.sessao?.status,
        pareadoEm: canal.pareado_em,
        vistoEm: canal.sessao?.vistoEm,
      })
    : null;

  const situacao: { txt: string; tom: "ok" | "atencao" | "ruim" | "neutro" } = canal.ativo
    ? { txt: "Ativo", tom: "ok" }
    : { txt: rotuloEstadoCanal(estado), tom: "neutro" };

  /**
   * A AÇÃO PRIMÁRIA DA LINHA — uma só, e o rótulo muda com o estado em vez de mentir um fixo:
   * "Conectar" num canal já conectado prometeria uma ação que não é a que acontece.
   *
   * O que o redesenho acrescenta é a EXPLICAÇÃO: cada rótulo diz, no hover, o que ele abre. A
   * queixa não era de que os nomes mudam — é que mudavam sem que desse para saber a diferença.
   *
   * BUG JÁ CONSERTADO (D70/TAREFA 0) e preservado aqui: a condição era
   * `lite && canal.sessao?.status !== "conectado" && gestor`, e o botão SUMIA exatamente no estado
   * em que o painel é mais necessário — o canal conectado. Medido em produção 08/09/2026:
   * `lite:diogo` está pareado, e sem este botão não havia como abrir o painel, encerrar a sessão
   * nem trocar o nível.
   */
  const acao: { txt: string; dica: string; ao: () => void; abre: boolean } | null = !gestor
    ? null
    : expandido
      ? { txt: "Fechar", dica: "Fecha o painel desta linha.", ao: aoExpandir, abre: true }
      : lite
        ? canal.sessao?.status === "conectado"
          ? {
              txt: "Gerenciar",
              dica: "Abre o painel do pareamento: encerrar a sessão, consentimento da titular e quem pode responder por este número.",
              ao: aoExpandir,
              abre: true,
            }
          : canal.sessao?.status === "aguardando_qr"
            ? {
                txt: "Ver o QR",
                dica: "Mostra o código para a dona do celular ler e concluir o pareamento.",
                ao: aoExpandir,
                abre: true,
              }
            : {
                txt: "Conectar",
                dica: "Abre o painel que gera o QR para parear o celular com este canal.",
                ao: aoExpandir,
                abre: true,
              }
        : canal.ativo
          ? {
              txt: "Desligar",
              dica: "Para o envio e o recebimento por este número. Pede confirmação antes.",
              ao: aoDesativar,
              abre: false,
            }
          : {
              txt: "Ligar",
              dica: "Abre a data de corte: a partir de quando as conversas deste número entram no inbox.",
              ao: aoExpandir,
              abre: true,
            };

  function confirmarERemover() {
    iniciarRemocao(async () => {
      const r = await removerCanal(canal.canal_id);
      setConfirmarRemocao(false);
      if (!r.ok) {
        toast.error(r.motivo ?? "Não foi possível remover a conexão.");
      } else {
        toast("Conexão removida.", { description: `${canal.nome} não aparece mais na lista.` });
        router.refresh();
      }
    });
  }

  function copiar(valor: string, oque: string) {
    void navigator.clipboard
      ?.writeText(valor)
      .then(() => toast(`${oque} copiado.`, { description: valor }))
      .catch(() => toast.error(`Não deu para copiar o ${oque.toLowerCase()}.`));
  }

  return (
    <>
      <TableRow className={cn(expandido && "bg-muted/40")}>
        {/* ── IDENTIDADE ─────────────────────────────────────────────────────────────────────
            Três degraus de peso, e é isso que responde à queixa de hierarquia: o nome é o que a
            pessoa procura, o número é o que ela confere, e o id técnico é o que ela cola num
            chamado. Ele continua na tela — só parou de gritar. */}
        <TableCell>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
            >
              {lite ? (
                <SmartphoneIcon className="size-4" />
              ) : (
                <ShieldCheckIcon className="size-4" />
              )}
            </span>
            <div className="min-w-0">
              <div className="truncate text-ui-14 font-medium text-foreground">{canal.nome}</div>
              {canal.numero ? (
                <div className="truncate font-mono text-ui-12 tabular-nums text-foreground">
                  {canal.numero}
                </div>
              ) : (
                /* BUG CONSERTADO (achado do Croqui). O texto anterior dizia "número ainda não
                   aprovado na Meta" — e isso é falso e caro: medido na Graph API, a Meta DEVOLVE o
                   número (`627327023793464` → `+1 555 725 2751`, GREEN, VERIFIED). Quem nunca
                   registrou fomos nós. A tela explicava um vazio NOSSO com causa ALHEIA, e deixava
                   quem lê esperando por terceiro em vez de agir. */
                <HintTooltip
                  title="Número não registrado aqui"
                  content="A Meta tem o número; nós é que não o gravamos. Enquanto faltar, ninguém sabe pelo banco qual número está falando com a paciente."
                >
                  <span className="text-ui-12 text-warning-ink">sem número registrado</span>
                </HintTooltip>
              )}
              <div className="truncate font-mono text-ui-11 text-muted-foreground">
                {canal.canal_id}
              </div>
            </div>
          </div>
        </TableCell>

        {/* M7 / ARB-R18-05 · finalidade. Âmbar quando é TESTE e quando NÃO FOI DECLARADA — os dois
            são aviso, não metadado. Cinza só quando é produção, que é o caso sem novidade.
            Aqui o âmbar é TEXTO, não pastilha: a pastilha âmbar da linha é uma só, e é a do
            provedor não oficial, que é o fato mais grave. Dois selos âmbar na mesma linha ensinam
            a ignorar os dois. */}
        {cols.finalidade ? (
          <TableCell>
            {canal.finalidade === "producao" ? (
              <span className="text-ui-13 text-foreground">Produção</span>
            ) : (
              <HintTooltip
                title={canal.finalidade === "teste" ? "Número de teste" : "Finalidade não declarada"}
                content={
                  canal.finalidade === "teste" ? TEXTO_NUMERO_DE_TESTE : TEXTO_FINALIDADE_AUSENTE
                }
              >
                <span className="text-ui-13 font-medium text-warning-ink">
                  {rotuloFinalidade(canal.finalidade)}
                </span>
              </HintTooltip>
            )}
          </TableCell>
        ) : null}

        {/* ── O MARCADOR DE RISCO DA LINHA ───────────────────────────────────────────────────
            O parágrafo inteiro do ban está no `Alert` do topo, dito uma vez. Aqui fica só a
            marca — e ela devolve o texto completo no hover, para quem parou justamente nesta
            linha e quer saber por que ela está marcada. */}
        {cols.provedor ? (
          <TableCell>
            {lite ? (
              <HintTooltip title="Número não oficial" content={AVISO_RISCO_BAN}>
                <Badge variant="warning" size="xs">
                  Não oficial
                </Badge>
              </HintTooltip>
            ) : (
              <span className="text-ui-13 text-foreground">Oficial</span>
            )}
          </TableCell>
        ) : null}

        {cols.departamento ? (
          <TableCell>
            {/* RÓTULO, nunca a chave: `Pré-venda`, não `pre_venda`. Chave é identificador de banco,
                e a gestora não deveria precisar aprendê-la para usar a tela. Sem departamento o
                texto fica ÂMBAR e diz "não declarado" — mesmo tratamento de `finalidade` ausente,
                porque as duas ausências são aviso, não metadado. */}
            {canal.departamento ? (
              <Badge variant="outline" size="xs" className="max-w-full truncate bg-card">
                {rotuloDepartamento(canal.departamento, departamentos)}
              </Badge>
            ) : (
              <HintTooltip
                title="Departamento não declarado"
                content={
                  r22Legivel
                    ? "Enquanto este número não declarar um departamento, ninguém sabe qual time responde por ele."
                    : "Esta base ainda não tem a coluna `departamento` (migration 0130 não aplicada) — a tela não sabe, e não supõe."
                }
              >
                <span className="text-ui-13 font-medium text-warning-ink">Não declarado</span>
              </HintTooltip>
            )}
          </TableCell>
        ) : null}

        <TableCell>
          {estadoLite ? (
            <>
              <div className="flex items-center gap-1.5">
                <Ponto tom={estadoLite.sessao.tom} />
                <span className="text-ui-13 text-foreground">{estadoLite.sessao.txt}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <Ponto tom={estadoLite.canal.tom} />
                <span className="text-ui-13 text-foreground">{estadoLite.canal.txt}</span>
              </div>
              {/* A frase só aparece quando há o que explicar: com os dois selos verdes ela seria
                  ruído. Ela é a resposta à pergunta que a tela antiga deixava no ar — este número
                  aparece para enviar, ou não, e por quê. */}
              {!estadoLite.apareceParaEnviar || estadoLite.sessao.tom !== "ok" ? (
                <div className="mt-1 max-w-[34ch] text-ui-11 text-muted-foreground">
                  {estadoLite.porQue}
                </div>
              ) : null}
              {/* A sessão é uma foto tirada quando alguém abriu o número — não há batimento de
                  fundo. Sem a hora, "Sessão conectada" em verde depois de um deploy seria mentira. */}
              {estadoLite.visto ? (
                <div className="mt-0.5 text-ui-11 text-muted-foreground">
                  sessão lida às {estadoLite.visto}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <Ponto tom={situacao.tom} />
              <span className="text-ui-13 text-foreground">{situacao.txt}</span>
            </div>
          )}
          {estado === "bloqueado_sem_consentimento" ? (
            <div className="mt-0.5 text-ui-11 text-warning-ink">
              falta o consentimento da titular
            </div>
          ) : null}
        </TableCell>

        <TableCell className="text-right">
          {acao ? (
            /* `title` nativo, e não `Tooltip`: o gatilho do preset embrulha o filho num `span`
               focável, o que daria DOIS paradas de Tab por linha para uma explicação. O texto é
               curto e a dupla estado→ação já se lê como frase ("Conectado" → "Gerenciar"). */
            <Button
              variant="outline"
              size="sm"
              title={acao.dica}
              aria-expanded={acao.abre ? expandido : undefined}
              disabled={pendente}
              onClick={acao.ao}
            >
              {acao.txt}
            </Button>
          ) : null}
        </TableCell>

        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`Mais ações de ${canal.nome}`} />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => copiar(canal.canal_id, "Id do canal")}>
                <CopyIcon />
                Copiar o id do canal
              </DropdownMenuItem>
              {canal.numero ? (
                <DropdownMenuItem onClick={() => copiar(canal.numero as string, "Número")}>
                  <CopyIcon />
                  Copiar o número
                </DropdownMenuItem>
              ) : null}
              {canal.waba_id ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => copiar(canal.waba_id as string, "WABA id")}>
                    <CopyIcon />
                    Copiar o WABA id
                  </DropdownMenuItem>
                </>
              ) : null}
              {mostraRemover ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setConfirmarRemocao(true)}
                  >
                    <Trash2Icon />
                    Remover conexão
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {expandido && !lite ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colunas} className="bg-muted/40 px-4 py-4">
            <div className="max-w-[560px]">
              <p className="text-ui-13 font-medium text-foreground">A partir de quando?</p>
              <p className="mt-1 text-ui-12 leading-relaxed text-muted-foreground">
                Ligar sem data de corte despeja o histórico inteiro deste número no inbox de todo
                mundo. Informe de quando em diante as conversas entram.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <Input
                  className="w-[190px]"
                  type="date"
                  value={corte}
                  onChange={(e) => setCorte(e.target.value)}
                  aria-label="Data de corte do inbox"
                />
                <Button
                  disabled={pendente || (!canal.inbox_desde && !corte)}
                  onClick={() => aoAtivar(corte ? new Date(corte).toISOString() : "")}
                >
                  Ligar canal
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}

      {expandido && lite ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colunas} className="p-0">
            <PainelSessao
              canal={canal}
              meuPapel={meuPapel}
              meuId={meuId}
              f8Pronto={f8Pronto}
              nivelLegivel={nivelLegivel}
              declaracaoLegivel={declaracaoLegivel}
            />
          </TableCell>
        </TableRow>
      ) : null}

      <AlertDialogModal
        open={confirmarRemocao}
        onOpenChange={setConfirmarRemocao}
        icon={<Trash2Icon className="size-5" />}
        title={`Remover a conexão de ${canal.nome}?`}
        description="O canal não aparecerá mais na lista. As conversas antigas continuam no histórico."
        cancelLabel="Cancelar"
        confirmLabel="Remover conexão"
        confirmVariant="destructive"
        onConfirm={confirmarERemover}
        loading={removendo}
      />
    </>
  );
}

export { BarraPublicacao };
