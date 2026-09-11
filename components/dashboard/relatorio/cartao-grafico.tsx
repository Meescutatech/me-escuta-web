import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DicaInfo } from "./dica-info";

/** Altura padrão da área de gráfico — o esqueleto e o vazio usam a MESMA medida. */
export const ALTURA_GRAFICO = 220;

/**
 * Moldura de bloco de relatório — a variante COM cabeçalho (portado de `chart-card.tsx`).
 *
 * A regra de escolha contra o `CabecalhoSecao`: **tem cor a decodificar ou controle no cabeçalho
 * → card; senão → rótulo.** Este custa ~60px de altura e paga por isso com espaço para ícone,
 * descrição, controles e o painel do "i" com legenda.
 */
export function CartaoGrafico({
  titulo,
  descricao,
  dica,
  legenda,
  rodape,
  icone: Icone,
  acoes,
  carregando = false,
  erro = false,
  mensagemErro = "Não foi possível carregar este bloco.",
  aoTentar,
  vazio = false,
  mensagemVazio = "Sem dados no período",
  alturaConteudo = ALTURA_GRAFICO,
  className,
  children,
}: {
  titulo: string;
  /** Uma linha, truncada, dizendo O QUE o bloco mostra. O COMO ler vai na `dica`. */
  descricao?: string;
  dica?: string;
  legenda?: ReactNode;
  rodape?: ReactNode;
  icone: React.ComponentType<{ className?: string }>;
  /** Controles à direita do título. */
  acoes?: ReactNode;
  carregando?: boolean;
  /** Falha SÓ deste bloco: fica dentro do card e não derruba os vizinhos. */
  erro?: boolean;
  mensagemErro?: string;
  aoTentar?: () => void;
  vazio?: boolean;
  mensagemVazio?: string;
  alturaConteudo?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card data-slot="cartao-grafico" className={cn("gap-3", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icone className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-ui-14 font-semibold">{titulo}</CardTitle>
            {descricao ? <p className="mt-0.5 truncate text-ui-11 text-muted-foreground">{descricao}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {acoes}
          <DicaInfo titulo={titulo} dica={dica} legenda={legenda} rodape={rodape} />
        </div>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <Skeleton className="w-full rounded-lg" style={{ height: alturaConteudo }} />
        ) : erro ? (
          <div className="flex flex-col items-center justify-center gap-2.5" style={{ height: alturaConteudo }}>
            <p className="text-ui-13 text-muted-foreground">{mensagemErro}</p>
            {aoTentar ? (
              <Button type="button" variant="outline" size="sm" onClick={aoTentar}>
                Tentar novamente
              </Button>
            ) : null}
          </div>
        ) : vazio ? (
          <p className="flex items-center justify-center text-ui-13 text-muted-foreground" style={{ height: alturaConteudo }}>
            {mensagemVazio}
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
