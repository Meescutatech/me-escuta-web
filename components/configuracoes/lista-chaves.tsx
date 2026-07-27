"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { contratoDe, podeEditarConfig, type ConfigVigente } from "./regras/config.ts";
import { BTN, Cabecalho, ENTRADA, Faixa } from "./kit";
import { dataCurta } from "./kit";

/**
 * F14 · /configuracoes/avancado — inventário do que o sistema lê como DADO em vez de código.
 *
 * A linha inteira é clicável e o alvo é um `<Link>` de verdade cujo `::after` cobre a linha —
 * nada de `role="button"` com outro controle dentro (ARIA inválido). Chave que esta tela não
 * edita continua listada, com o motivo à direita: esconder o que existe faria a pessoa procurar
 * numa lista que mente sobre o próprio tamanho.
 */
export function ListaChaves({
  vigentes,
  autores,
  indisponivel,
}: {
  vigentes: ConfigVigente[];
  /** nome da chave → quem publicou a versão vigente (vem do histórico, no servidor). */
  autores: Record<string, string>;
  indisponivel: boolean;
}) {
  const [busca, setBusca] = useState("");
  const nomes = useMemo(() => vigentes.map((v) => v.nome), [vigentes]);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? vigentes.filter((v) => v.nome.toLowerCase().includes(q)) : vigentes;
  }, [vigentes, busca]);

  return (
    <>
      <Cabecalho
        titulo="Todas as configurações"
        contador={vigentes.length}
        descricao="Tudo que o sistema lê como dado em vez de código."
      />

      {/* busca à ESQUERDA (ressalva 2 do Croqui) — ela filtra a lista abaixo. */}
      <div className="mb-4 max-w-[320px]">
        <input
          className={ENTRADA}
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="buscar chave…"
          aria-label="Buscar chave de configuração"
        />
      </div>

      {indisponivel ? (
        <Faixa tom="erro">
          Não foi possível ler <span className="font-mono">core.v_config_vigente</span>. A conexão
          caiu — tente de novo em alguns segundos.
        </Faixa>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_56px_100px_118px_100px] items-center gap-3 border-b border-linha px-2 pb-2 pt-2.5 text-[11.5px] font-medium uppercase tracking-[0.05em] text-mute">
        <span>Chave</span>
        <span>Versão</span>
        <span>Publicada</span>
        <span>Por</span>
        <span />
      </div>

      {filtradas.length === 0 && busca.trim() ? (
        <div className="flex items-center gap-2.5 px-2 py-6 text-[13px] text-suave">
          Nenhuma chave corresponde a “{busca.trim()}”.
          <button className={BTN.texto} type="button" onClick={() => setBusca("")}>
            Limpar busca
          </button>
        </div>
      ) : (
        filtradas.map((v) => {
          const veredito = podeEditarConfig(v.nome, nomes);
          const contrato = contratoDe(v.nome);
          const linha = (
            <>
              <span className="min-w-0 truncate font-mono text-[13px] text-tinta">{v.nome}</span>
              <span className="font-mono text-[12.5px] tabular-nums text-suave">v{v.versao}</span>
              <span className="text-[12.5px] tabular-nums text-suave">{dataCurta(v.vigente_desde)}</span>
              <span className="min-w-0 truncate text-[12.5px] text-suave">{autores[v.nome] ?? "—"}</span>
              <span className="text-right text-[11.5px] text-mute">
                {veredito.editavel ? "" : contrato?.foraDoEditor === "tela_dedicada" ? "tela própria" : "leitura"}
              </span>
            </>
          );
          return veredito.editavel ? (
            <Link
              key={v.nome}
              href={`/configuracoes/avancado/${encodeURIComponent(v.nome)}`}
              className="grid min-h-[48px] grid-cols-[minmax(0,1fr)_56px_100px_118px_100px] items-center gap-3 border-b border-linha px-2 py-1.5 hover:bg-hover"
            >
              {linha}
            </Link>
          ) : (
            <div
              key={v.nome}
              title={veredito.motivo}
              className="grid min-h-[48px] grid-cols-[minmax(0,1fr)_56px_100px_118px_100px] items-center gap-3 border-b border-linha px-2 py-1.5"
            >
              {linha}
            </div>
          );
        })
      )}
    </>
  );
}
