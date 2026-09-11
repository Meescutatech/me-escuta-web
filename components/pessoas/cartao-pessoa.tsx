import type { ReactNode } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { iniciaisMembro, rotuloPapel, type Papel } from "@/lib/membros";
import { cargoDe, type Cargo } from "@/lib/ensaio/fixtures/cargos";

/**
 * CARTÃO DE PESSOA — a peça única em que uma pessoa aparece no sistema.
 *
 * Existe por um defeito que os dois benchmarks têm e que não queremos herdar: nem o Twenty nem o
 * LiderHub têm um componente de pessoa. No Twenty o único reuso é a pilha de avatares
 * (`WorkspaceMemberAvatarStack.tsx:72`) e a linha de membro é remontada à mão em cada tela; no
 * LiderHub o par avatar+nome+e-mail está escrito três vezes só dentro de `features/settings`
 * (`ui/team-members-field.tsx:32` e `:254`, `ui/member-row.tsx:180`). O resultado, nos dois, é a
 * mesma pessoa com três desenhos diferentes.
 *
 * Uma peça, três variantes:
 *  · `linha`  — dentro de uma lista/tabela (Membros, e o que os irmãos montarem em funil/tarefas);
 *  · `card`   — dentro de um bloco (quem ocupa um cargo, quem está lotado num departamento);
 *  · `sheet`  — o cabeçalho do painel de perfil.
 *
 * O CARGO é o substantivo (Diogo, 22:50): onde se lia "Membro · Pré-venda (gestora)" lê-se "SDR",
 * e papel + departamento viram a explicação embaixo. Quando papel e lotação não casam com nenhum
 * cargo ativo, mostra o papel cru — inventar um cargo seria pior do que não ter.
 */

export interface VinculoPessoa {
  departamento: string;
  papel_no_departamento: "membro" | "gestor";
}

export interface NumeroDaPessoa {
  canal_id: string;
  apelido: string;
  numero: string;
  ativo: boolean;
}

export interface MetricaPessoa {
  rotulo: string;
  valor: string;
}

export interface Pessoa {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  /** Subtítulo livre ("Fonoaudióloga · CRFa 3-12849"). */
  funcao?: string | null;
  ativo?: boolean;
  departamentos?: VinculoPessoa[];
  ultimoAcessoEm?: string | null;
  entrouEm?: string | null;
  /** URL da foto; sem ela cai nas iniciais. */
  foto?: string | null;
}

export type VariantePessoa = "linha" | "card" | "sheet";

export interface CartaoPessoaProps {
  pessoa: Pessoa;
  variante: VariantePessoa;
  agora: Date;
  /** Rótulo legível de um departamento — a tela sabe a árvore, o cartão não. */
  rotuloDepartamento?: (chave: string) => string;
  /** Números de que a pessoa é dona (`config_jsonb.responsavel_id`, D91 R1). */
  numeros?: NumeroDaPessoa[];
  /** Três números de 7 dias: mensagens · tarefas concluídas · com IA. */
  metricas?: MetricaPessoa[];
  souEu?: boolean;
  /** Abre o painel de perfil. Sem ele o cartão é só leitura. */
  onAbrir?: () => void;
  /** Menu ⋯ ou botões, à direita. */
  acoes?: ReactNode;
  className?: string;
}

/** "há 6 min" · "há 2 h" · "ontem" · "há 3 dias" · "nunca entrou". */
export function desdeQuando(iso: string | null | undefined, agora: Date): string {
  if (!iso) return "nunca entrou";
  const ms = agora.getTime() - new Date(iso).getTime();
  if (ms < 60_000) return "agora";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

const TAMANHO_AVATAR: Record<VariantePessoa, "sm" | "lg" | "xl"> = { linha: "lg", card: "sm", sheet: "xl" };

function FotoPessoa({ pessoa, variante, souEu }: { pessoa: Pessoa; variante: VariantePessoa; souEu?: boolean }) {
  return (
    <Avatar size={TAMANHO_AVATAR[variante]} variant={souEu ? "solid" : "subtle"} className={cn(!pessoa.ativo && pessoa.ativo !== undefined && "grayscale")}>
      {pessoa.foto ? <AvatarImage src={pessoa.foto} alt="" /> : null}
      <AvatarFallback>{iniciaisMembro(pessoa.nome, pessoa.email)}</AvatarFallback>
    </Avatar>
  );
}

/** Nome + (você) + selo de acesso revogado, e embaixo o CARGO (ou o papel cru). */
function NomeECargo({ pessoa, cargo, variante, souEu }: { pessoa: Pessoa; cargo: Cargo | null; variante: VariantePessoa; souEu?: boolean }) {
  const tamanhoNome = variante === "sheet" ? "text-[19px]" : variante === "linha" ? "text-[15.5px]" : "text-[14px]";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className={cn("truncate font-semibold leading-tight text-foreground", tamanhoNome)}>{pessoa.nome}</span>
        {souEu && <span className="shrink-0 text-ui-12 font-normal text-muted-foreground">(você)</span>}
        {pessoa.ativo === false && (
          <Badge variant="muted" size="xs">
            sem acesso
          </Badge>
        )}
      </div>
      <div className={cn("mt-0.5 flex items-center gap-1.5 truncate", variante === "sheet" ? "text-[13.5px]" : "text-[13px]")}>
        <span className="font-medium text-foreground">{cargo ? cargo.nome : rotuloPapel(pessoa.papel)}</span>
        <span className="truncate text-muted-foreground">· {pessoa.funcao || pessoa.email}</span>
      </div>
    </div>
  );
}

function Departamentos({ pessoa, rotulo }: { pessoa: Pessoa; rotulo: (c: string) => string }) {
  const vinculos = pessoa.departamentos ?? [];
  if (vinculos.length === 0) {
    return (
      <span className="text-[13px] text-muted-foreground">
        {pessoa.papel === "owner" || pessoa.papel === "admin" ? "todos" : pessoa.papel === "marketing" ? "captação" : "sem lotação"}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {vinculos.map((v) => (
        <span key={v.departamento} className="inline-flex items-center gap-1">
          <Badge variant="outline" size="sm" className="bg-card">
            {rotulo(v.departamento)}
          </Badge>
          {v.papel_no_departamento === "gestor" && (
            <Badge variant="info" size="xs">
              gestora
            </Badge>
          )}
        </span>
      ))}
    </div>
  );
}

function Numeros({ numeros }: { numeros: NumeroDaPessoa[] }) {
  if (numeros.length === 0) return <span className="text-[13px] text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {numeros.map((n) => (
        <Link
          key={n.canal_id}
          href="/configuracoes/canais"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-[13px] text-foreground underline-offset-2 hover:underline"
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", n.ativo ? "bg-success-ink" : "bg-muted-foreground/50")} aria-hidden />
          <span className="truncate">{n.apelido}</span>
        </Link>
      ))}
    </div>
  );
}

/** Três números de 7 dias, lado a lado — valor grande, rótulo miúdo. Zero é "—", nunca "0". */
export function MetricasPessoa({ metricas, className }: { metricas: MetricaPessoa[]; className?: string }) {
  return (
    <div className={cn("flex gap-5", className)}>
      {metricas.map((m) => (
        <div key={m.rotulo} className="min-w-0">
          <div className={cn("text-[15px] font-semibold leading-none tabular-nums", m.valor === "0" ? "text-muted-foreground" : "text-foreground")}>
            {m.valor === "0" ? "—" : m.valor}
          </div>
          <div className="mt-1 truncate text-ui-11 text-muted-foreground">{m.rotulo}</div>
        </div>
      ))}
    </div>
  );
}

export function CartaoPessoa({
  pessoa,
  variante,
  agora,
  rotuloDepartamento = (c) => c,
  numeros = [],
  metricas,
  souEu,
  onAbrir,
  acoes,
  className,
}: CartaoPessoaProps) {
  const cargo = cargoDe({ papel: pessoa.papel, departamentos: pessoa.departamentos ?? [] });

  if (variante === "sheet") {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        <div className="flex items-start gap-3.5">
          <FotoPessoa pessoa={pessoa} variante="sheet" souEu={souEu} />
          <div className="min-w-0 flex-1">
            <NomeECargo pessoa={pessoa} cargo={cargo} variante="sheet" souEu={souEu} />
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Departamentos pessoa={pessoa} rotulo={rotuloDepartamento} />
              <span className="text-ui-12 text-muted-foreground">{pessoa.email}</span>
            </div>
          </div>
          {acoes}
        </div>
        {metricas && metricas.length > 0 && (
          <div className="flex items-end justify-between border-t border-border pt-3.5">
            <MetricasPessoa metricas={metricas} />
            <div className="text-right">
              <div className="text-[13.5px] leading-none text-foreground">{desdeQuando(pessoa.ultimoAcessoEm, agora)}</div>
              <div className="mt-1 text-ui-11 text-muted-foreground">último acesso</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (variante === "card") {
    const conteudo = (
      <>
        <FotoPessoa pessoa={pessoa} variante="card" souEu={souEu} />
        <NomeECargo pessoa={pessoa} cargo={cargo} variante="card" souEu={souEu} />
      </>
    );
    return onAbrir ? (
      <button
        type="button"
        onClick={onAbrir}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {conteudo}
      </button>
    ) : (
      <div className={cn("flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5", className)}>{conteudo}</div>
    );
  }

  // variante "linha" — colunas que somem de fora para dentro conforme a tela estreita, na ordem
  // inversa da importância: números primeiro, depois os 7 dias, depois os departamentos.
  return (
    <div
      role={onAbrir ? "button" : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      onClick={onAbrir}
      onKeyDown={onAbrir ? (e) => ((e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAbrir())) : undefined}
      aria-label={onAbrir ? `Abrir o perfil de ${pessoa.nome}` : undefined}
      className={cn(
        "flex items-center gap-4 px-4 py-3",
        onAbrir && "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
        pessoa.ativo === false && "opacity-60",
        className,
      )}
    >
      <div className="flex min-w-0 flex-[1.6] items-center gap-3">
        <FotoPessoa pessoa={pessoa} variante="linha" souEu={souEu} />
        <NomeECargo pessoa={pessoa} cargo={cargo} variante="linha" souEu={souEu} />
      </div>
      <div className="hidden min-w-0 flex-1 md:block">
        <Departamentos pessoa={pessoa} rotulo={rotuloDepartamento} />
      </div>
      <div className="hidden min-w-0 flex-1 xl:block">
        <Numeros numeros={numeros} />
      </div>
      {metricas && metricas.length > 0 && (
        // largura fixa idêntica à do cabeçalho (`w-[198px]` = 3 × 58 + 2 × gap-3) para as três
        // colunas de números ficarem no mesmo eixo em todas as linhas, com qualquer valor.
        <div className="hidden w-[198px] shrink-0 lg:block">
          <MetricasPessoa metricas={metricas} className="gap-3 [&>div]:w-[58px]" />
        </div>
      )}
      <div className="w-[104px] shrink-0 text-right text-[13px] text-muted-foreground">{desdeQuando(pessoa.ultimoAcessoEm, agora)}</div>
      {acoes ? (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {acoes}
        </div>
      ) : (
        <div className="w-8 shrink-0" aria-hidden />
      )}
    </div>
  );
}

/** Cabeçalho da lista em `linha` — as mesmas proporções, para as colunas ficarem alinhadas. */
export function CabecalhoCartaoPessoa({ className, metricas = true }: { className?: string; metricas?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 border-b border-border bg-table-header px-4 py-2 text-ui-11 font-medium uppercase tracking-[0.06em] text-muted-foreground",
        className,
      )}
    >
      <span className="min-w-0 flex-[1.6]">Pessoa e cargo</span>
      <span className="hidden min-w-0 flex-1 md:block">Departamentos</span>
      <span className="hidden min-w-0 flex-1 xl:block">Números de que é dona</span>
      {/* sem número nas linhas a coluna não existe — senão o cabeçalho promete uma medida que
          nenhuma linha entrega, e ainda desalinha "Último acesso". */}
      {metricas && <span className="hidden w-[198px] shrink-0 lg:block">Últimos 7 dias</span>}
      <span className="w-[104px] shrink-0 text-right">Último acesso</span>
      <span className="w-8 shrink-0" />
    </div>
  );
}
