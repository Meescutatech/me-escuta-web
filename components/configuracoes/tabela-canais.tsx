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
  TriangleAlertIcon,
} from "lucide-react";
import {
  ativarCanal,
  desativarCanal,
  registrarCanal,
} from "@/app/(app)/configuracoes/canais/actions";
import {
  AVISO_APLICACAO_RUNTIME,
  AVISO_RISCO_BAN,
  canalIdDoForm,
  colunasVisiveis,
  avisoDesativacao,
  contagemDaLista,
  entradaAdicionar,
  estadoDoCanal,
  opcoesDepartamento,
  ordenarCanais,
  podeGerirCanais,
  rotuloDepartamento,
  rotuloEstadoCanal,
  rotuloFinalidade,
  semProblemas,
  validarRegistroCanal,
  TEXTO_FINALIDADE_AUSENTE,
  TEXTO_NUMERO_DE_TESTE,
  type Canal,
  type FormCanal,
  type Papel,
  type Provedor,
} from "./regras/canais.ts";
import type { Departamento } from "@/lib/departamentos/escopo";
import { PainelSessao } from "./painel-sessao";
import { BarraPublicacao, Dialogo } from "./kit";
import { CascaConfig, Contagem } from "@/components/ensaio/casca-config";
import { SheetNumeroLite, type PessoaDoNumero } from "./sheet-numero-lite";
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormItemLayout } from "@/components/ui/form-item-layout";
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
  /** estado da sessão, quando o canal é não oficial e já houve pareamento. */
  sessao?: { status: string; viva?: boolean } | null;
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

/** `<select>` nativo com a pele do `Input` do preset. Nativo de propósito: ver `CampoDepartamento`. */
const SELETOR =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export function TabelaCanais({
  canais,
  meuPapel,
  meuId = null,
  minhasLotacoes = null,
  indisponivel,
  f8Pronto,
  departamentos,
  dominioIndisponivel,
  r22Legivel,
  nivelLegivel,
  pessoas = [],
  declaracaoLegivel,
}: {
  canais: CanalNaTela[];
  meuPapel: Papel | null;
  /** uid de quem está logado. O membro registra o PRÓPRIO número, e é este id que fixa o dono. */
  meuId?: string | null;
  /** onde quem está logado está lotado, já expandido pelo banco. `null` = não deu para ler. */
  minhasLotacoes?: string[] | null;
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
  /** membros ATIVOS — é deles que sai o dono do número não oficial, que a porta exige. */
  pessoas?: PessoaDoNumero[];
}) {
  const router = useRouter();
  const gestor = podeGerirCanais(meuPapel);
  /* 16/09 · "Adicionar número" deixou de ser só da gestão: a gestão escolhe o tipo, o membro vai
     direto ao próprio número não oficial. Oficial, ligar e desligar continuam com `gestor`. */
  const entrada = entradaAdicionar(meuPapel);
  const [busca, setBusca] = useState("");
  const [abrindo, setAbrindo] = useState(false);
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
          <Button onClick={() => (entrada === "escolher" ? setAbrindo(true) : setConectando(true))}>
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

      {gestor && abrindo ? (
        <BlocoAdicionar
          aoFechar={() => setAbrindo(false)}
          aoErro={setErro}
          aoAviso={setAviso}
          departamentos={departamentos}
          dominioIndisponivel={dominioIndisponivel}
          aoEscolherNaoOficial={() => {
            setAbrindo(false);
            setConectando(true);
          }}
        />
      ) : null}

      <SheetNumeroLite
        aberto={conectando}
        aoFechar={() => setConectando(false)}
        pessoas={pessoas}
        departamentos={departamentos}
        f8Pronto={f8Pronto}
        meuPapel={meuPapel}
        meuId={meuId}
        minhasLotacoes={minhasLotacoes}
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
                    <Button onClick={() => (entrada === "escolher" ? setAbrindo(true) : setConectando(true))}>
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
  const [corte, setCorte] = useState("");
  const estado = estadoDoCanal(canal);
  const lite = canal.provedor === "nao_oficial";

  const situacao: { txt: string; tom: "ok" | "atencao" | "ruim" | "neutro" } = lite
    ? canal.sessao?.status === "conectado"
      ? { txt: "Conectado", tom: "ok" }
      : canal.sessao?.status === "aguardando_qr"
        ? { txt: "Aguardando o QR", tom: "atencao" }
        : canal.sessao?.status === "banido"
          ? { txt: "Banido pelo WhatsApp", tom: "ruim" }
          : { txt: "Desconectado", tom: "neutro" }
    : canal.ativo
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
          <div className="flex items-center gap-1.5">
            <Ponto tom={situacao.tom} />
            <span className="text-ui-13 text-foreground">{situacao.txt}</span>
          </div>
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
    </>
  );
}

/** Campo → como chamá-lo na linha "ainda falta", em voz de gente. */
const NOME_DO_CAMPO: Record<string, string> = {
  nome: "o nome",
  canalId: "o phone_number_id",
  wabaId: "o WABA id",
  numeroE164: "o número",
  finalidade: "a finalidade",
  provedor: "o tipo de número",
  departamento: "o departamento",
};

/**
 * O bloco de adição mora NA PÁGINA, não num modal: o padrão do convite de Membros já é este, e
 * modal rouba o contexto da lista que a pessoa acabou de ler.
 *
 * ── O QUE MUDOU EM 11/09 ───────────────────────────────────────────────────────────────────────
 *
 * 1. AJUDA É CINZA, ERRO É VERMELHO, e o vermelho só entra depois que a pessoa mexeu no campo.
 *    Antes, `validarRegistroCanal` era desenhada assim que o bloco abria: seis parágrafos
 *    vermelhos num formulário em branco, nenhum deles um erro de verdade. A validação está
 *    intacta — ela continua sendo a mesma função, e o botão continua desabilitado até passar.
 *    O que mudou é o MOMENTO: `tocados` guarda em que campos a pessoa já mexeu.
 *
 * 2. O TIPO DE NÚMERO DECIDE O QUE APARECE. Oficial pede três dados técnicos da Meta, e eles
 *    ganham um bloco próprio; não oficial não pede nenhum — e o bloco inteiro some, em vez de
 *    ficar na tela desabilitado ou vazio pedindo para ser ignorado.
 *
 * 3. Os `placeholder` de id continuam sendo exemplos reais de formato, mas agora o que explica o
 *    campo é a linha cinza embaixo dele — antes o exemplo tinha de fazer os dois trabalhos, e
 *    parecia valor já preenchido.
 */
function BlocoAdicionar({
  aoFechar,
  aoErro,
  aoAviso,
  departamentos,
  dominioIndisponivel,
  aoEscolherNaoOficial,
}: {
  aoFechar: () => void;
  aoErro: (m: string | null) => void;
  aoAviso: (m: string) => void;
  departamentos: Departamento[];
  dominioIndisponivel: boolean;
  /** escolher "não oficial" SAI daqui e abre o painel de conectar — ver a nota em `setConectando`. */
  aoEscolherNaoOficial: () => void;
}) {
  const router = useRouter();
  const [provedor, setProvedor] = useState<Provedor>("waba");
  const [form, setForm] = useState<FormCanal>({
    canalId: "",
    nome: "",
    provedor: "waba",
    numeroE164: "",
    wabaId: "",
    // vazio no oficial, e ali é legítimo: o número é da empresa, não de uma pessoa
    responsavelId: "",
    // R22/A1 · NASCE VAZIO, como `finalidade`. `"comercial"` era o valor de antes — e `comercial` é
    // nó de agrupamento, que a porta RECUSA desde o M8. O default conveniente não era só feio:
    // era o único valor que o banco não aceita.
    departamento: "",
    // sem valor: quem cadastra é quem sabe. Ver o campo lá embaixo.
    finalidade: "",
  });
  /** Em que campos a pessoa já mexeu. É só isto que separa "ajuda" de "erro" na tela. */
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [pendente, iniciar] = useTransition();
  const atual: FormCanal = { ...form, provedor };
  const problemas = validarRegistroCanal(atual);
  const idPrevisto = canalIdDoForm(atual);
  const lite = provedor === "nao_oficial";

  const tocar = (campo: string) => setTocados((t) => ({ ...t, [campo]: true }));
  const erroDe = (campo: keyof FormCanal) =>
    tocados[campo] ? (problemas[campo] as string | undefined) : undefined;

  const faltando = Object.keys(problemas).map((k) => NOME_DO_CAMPO[k] ?? k);

  function enviar() {
    aoErro(null);
    iniciar(async () => {
      const r = await registrarCanal(atual);
      if (!r.ok) aoErro(r.motivo ?? "não deu para registrar");
      else {
        aoAviso("Número registrado. Ele nasce DESLIGADO — ligar é um segundo passo, com data de corte.");
        aoFechar();
        router.refresh(); // B1: o primeiro número TEM de aparecer na lista e no contador
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-ui-14 font-semibold text-foreground">Adicionar número</h2>
      <p className="mt-1 max-w-[620px] text-ui-13 leading-relaxed text-muted-foreground">
        Registrar é declarar um número que já existe do outro lado. Ele nasce desligado, e ligar é
        um segundo passo.
      </p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {(
          [
            {
              v: "waba" as Provedor,
              t: "Oficial (WhatsApp Cloud API)",
              e: "Número da empresa aprovado na Meta. Sem risco de bloqueio.",
            },
            {
              v: "nao_oficial" as Provedor,
              t: "Não oficial (biblioteca)",
              e: "Número pessoal de alguém, conectado por QR. Pode ser banido pelo WhatsApp — e o ban atinge o WhatsApp pessoal dela.",
            },
          ] as const
        ).map((o) => (
          <button
            key={o.v}
            type="button"
            aria-pressed={provedor === o.v}
            onClick={() => {
              if (o.v === "nao_oficial") return aoEscolherNaoOficial();
              setProvedor(o.v);
            }}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
              provedor === o.v
                ? "border-primary/50 bg-primary/[0.06]"
                : "border-border hover:bg-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 grid size-3.5 flex-none place-items-center rounded-full border",
                provedor === o.v ? "border-primary" : "border-muted-foreground/50",
              )}
            >
              {provedor === o.v ? <span className="size-1.5 rounded-full bg-primary" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-ui-13 font-medium text-foreground">{o.t}</span>
              <span className="mt-0.5 block text-ui-12 leading-relaxed text-muted-foreground">
                {o.e}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormItemLayout
          label={lite ? "Nome de quem cedeu o número" : "Nome do canal"}
          description={
            lite
              ? "É dele que sai o id do canal — legível, e nunca o número dela."
              : "Como a operação chama este número. Só aparece aqui dentro."
          }
          error={erroDe("nome")}
        >
          <Input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            onBlur={() => tocar("nome")}
            placeholder={lite ? "Jade" : "Produção"}
            aria-invalid={erroDe("nome") ? true : undefined}
          />
        </FormItemLayout>

        {/* M7 · finalidade: NASCE SEM ESCOLHA. A opção vazia não é placeholder decorativo — é o
            que impede o default por conveniência, que foi o que produziu dois números vivos que
            ninguém ligou. Enquanto ninguém escolher, `validarRegistroCanal` recusa. */}
        <FormItemLayout
          label="Finalidade"
          description="Teste só entrega a destinatários em lista. Produção fala com paciente."
          error={erroDe("finalidade")}
        >
          <select
            className={SELETOR}
            value={form.finalidade}
            onChange={(e) => {
              tocar("finalidade");
              setForm({ ...form, finalidade: e.target.value as FormCanal["finalidade"] });
            }}
            aria-invalid={erroDe("finalidade") ? true : undefined}
          >
            <option value="">— escolha —</option>
            <option value="teste">Teste</option>
            <option value="producao">Produção</option>
          </select>
        </FormItemLayout>

        {/* R22/A1 · O `<select>` que lê o BANCO, e é NATIVO de propósito.
            Os nós aparecem com a hierarquia inteira, e só as FOLHAS são escolhíveis — os nós de
            agrupamento entram desabilitados, como cabeçalho. Não é enfeite: a porta recusa nó de
            agrupamento (GUARDA:M8:escrita_so_em_folha, herdada pela VD1 da 0130), e oferecer o que
            será recusado faria a recusa ser a primeira notícia. Esconder os pais também não serve:
            sem eles, as folhas chegam como uma lista plana e a árvore que explica os nomes some. */}
        <FormItemLayout
          label="Departamento"
          description="Quem responde por este número. Pode ficar em branco e ser declarado depois."
        >
          {dominioIndisponivel ? (
            <p className="text-ui-12 leading-relaxed text-warning-ink">
              Não deu para ler os departamentos do banco agora. O número pode ser cadastrado sem
              departamento — “não declarado” é um estado honesto; escolher às cegas não é.
            </p>
          ) : (
            <select
              className={SELETOR}
              value={form.departamento}
              onChange={(e) => setForm({ ...form, departamento: e.target.value })}
            >
              <option value="">— não declarado —</option>
              {opcoesDepartamento(departamentos).map((o) => (
                <option key={o.chave} value={o.chave} disabled={!o.selecionavel}>
                  {o.nivel > 1 ? `\u00a0\u00a0\u00a0\u00a0${o.rotulo}` : o.rotulo}
                  {o.selecionavel ? "" : " (agrupamento)"}
                </option>
              ))}
            </select>
          )}
        </FormItemLayout>
      </div>

      {/* ── O BLOCO QUE SÓ O OFICIAL PEDE ──────────────────────────────────────────────────────
          Três dados técnicos, e nenhum deles se inventa: todos vêm da mesma tela do painel da
          Meta. Juntá-los num bloco com um título diz de onde ir buscar, o que seis campos soltos
          numa grade não diziam. No não oficial o bloco não existe — o número é da fono. */}
      {!lite ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-ui-13 font-medium text-foreground">Dados da Meta</p>
          <p className="mt-0.5 text-ui-12 text-muted-foreground">
            Os três saem do painel da Meta, em WhatsApp › Configuração da API.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormItemLayout
              label="phone_number_id"
              description="A chave da conversa do lado da Meta. Não dá para preencher depois."
              error={erroDe("canalId")}
            >
              <Input
                className="font-mono text-ui-12"
                value={form.canalId}
                onChange={(e) => setForm({ ...form, canalId: e.target.value })}
                onBlur={() => tocar("canalId")}
                placeholder="627327023793464"
                aria-invalid={erroDe("canalId") ? true : undefined}
              />
            </FormItemLayout>

            {/* M7 · O CAMPO QUE NÃO EXISTIA. `wabaId` estava no estado inicial do form e não tinha
                entrada nenhuma na tela — logo o `if (waba)` de `payloadCanalRegistrado` era
                inalcançável com valor, e TODO canal cadastrado pela tela nasceria sem identidade,
                calado. É a assinatura exata do `canal_registrado` do `627327023793464` no ledger.
                Registrado em ERROS-E-BLOQUEIOS como E-142. */}
            <FormItemLayout
              label="WABA id"
              description="A conta do WhatsApp Business de onde este número saiu."
              error={erroDe("wabaId")}
            >
              <Input
                className="font-mono text-ui-12"
                value={form.wabaId}
                onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
                onBlur={() => tocar("wabaId")}
                placeholder="966114259004051"
                aria-invalid={erroDe("wabaId") ? true : undefined}
              />
            </FormItemLayout>

            <FormItemLayout
              label="Número (E.164)"
              description="Com + e DDI, sem espaços nem traços."
              error={erroDe("numeroE164")}
            >
              <Input
                className="font-mono text-ui-12"
                value={form.numeroE164}
                onChange={(e) => setForm({ ...form, numeroE164: e.target.value })}
                onBlur={() => tocar("numeroE164")}
                placeholder="+5511999998888"
                aria-invalid={erroDe("numeroE164") ? true : undefined}
              />
            </FormItemLayout>
          </div>
        </div>
      ) : (
        <div className="mt-5 border-t border-border pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormItemLayout
              label="Número (opcional)"
              description="O número é dela e pode não ser conhecido agora. Dá para deixar em branco."
              error={erroDe("numeroE164")}
            >
              <Input
                className="font-mono text-ui-12"
                value={form.numeroE164}
                onChange={(e) => setForm({ ...form, numeroE164: e.target.value })}
                onBlur={() => tocar("numeroE164")}
                placeholder="+5511999998888"
                aria-invalid={erroDe("numeroE164") ? true : undefined}
              />
            </FormItemLayout>
          </div>
          {idPrevisto ? (
            <p className="mt-3 text-ui-12 leading-relaxed text-muted-foreground">
              O id deste canal será{" "}
              <span className="font-mono text-foreground">{idPrevisto}</span> — legível, estável, e
              nunca o número dela.
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-border pt-4">
        {/* Em vez de vermelho por antecipação: uma linha cinza que diz o que ainda falta. Ela
            existe porque o botão fica desabilitado até a validação passar, e botão desabilitado
            sem motivo visível é um beco. */}
        {faltando.length > 0 ? (
          <p className="mr-auto text-ui-12 text-muted-foreground">
            Ainda falta {faltando.join(", ")}.
          </p>
        ) : null}
        <Button variant="ghost" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button disabled={pendente || !semProblemas(problemas)} loading={pendente} onClick={enviar}>
          Registrar número
        </Button>
      </div>
    </section>
  );
}

export { BarraPublicacao };
