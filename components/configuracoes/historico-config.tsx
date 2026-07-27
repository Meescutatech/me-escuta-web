import { autorDaVersao, origemDaVersao, type VersaoHistorico } from "./regras/config.ts";
import { dataHora } from "./kit";

/**
 * Histórico de uma chave de configuração — a peça que nenhuma tela de configuração costuma ter e
 * que aqui sai de graça, porque `core.config` é imutável e versionada.
 *
 * Duas honestidades embutidas:
 *  · versão que NÃO nasceu de evento é marcada como tal. As 14 linhas de hoje vieram de
 *    `seed:0001`, `sistema:migration-0064`, `demo:diogo` — ninguém publicou aquilo pela tela, e o
 *    histórico deve dizer isso em vez de inventar um autor;
 *  · data e autor saem da MESMA linha (ressalva 3 do Croqui). O par não se mistura entre versões.
 */
export function HistoricoConfig({ versoes }: { versoes: VersaoHistorico[] }) {
  if (versoes.length === 0) {
    return <p className="px-2 py-4 text-[13px] text-suave">Sem histórico legível para esta chave.</p>;
  }
  return (
    <div>
      {versoes.map((v) => {
        const autor = autorDaVersao(v);
        const daTela = origemDaVersao(v) === "tela";
        return (
          <div
            key={v.versao}
            className="grid min-h-[38px] grid-cols-[44px_1fr_auto_auto] items-center gap-3 border-b border-linha text-[13px]"
          >
            <span className="font-mono tabular-nums text-tinta">v{v.versao}</span>
            <span className="min-w-0 truncate text-suave">
              {autor ?? (
                <span className="text-mute">
                  {v.criado_por ?? "—"}{" "}
                  <span className="text-[11.5px]">(não veio da tela)</span>
                </span>
              )}
            </span>
            <span className="whitespace-nowrap text-[12.5px] text-suave">{dataHora(v.vigente_desde)}</span>
            <span className="whitespace-nowrap text-[11.5px] text-mute">
              {v.vigente ? "vigente" : daTela ? "" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
