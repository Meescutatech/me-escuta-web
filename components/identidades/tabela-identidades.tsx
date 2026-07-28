"use client";

import { useState, useTransition } from "react";
import { vincularIdentidadeExterna } from "@/app/(app)/configuracoes/identidades/actions";
import type { CoberturaDePara, LinhaDePara } from "@/lib/dados/identidades";

/**
 * De-para do Kommo — SEM DESIGN. Só função (o Diogo lapida depois).
 *
 * As quatro coisas que este componente existe para fazer, e nenhuma é cosmética:
 *   1. TRÊS ESTADOS por linha, distintos, com "não decidido" como INICIAL — descarte nunca é
 *      default. É a única proteção de interface contra descartar 355 leads por engano.
 *   2. O PESO ao lado da decisão (quantos leads dependem daquele ID). Sem isso a escolha é cega.
 *   3. COMPLETUDE que BLOQUEIA o backfill, não que avisa. Aviso é ignorável; o passo é
 *      irreversível.
 *   4. Estados de VAZIO, CARREGANDO, ERRO e SEM PERMISSÃO tratados como telas diferentes.
 */

interface Props {
  meuPapel: string | null;
  linhas: LinhaDePara[];
  cobertura: CoberturaDePara;
  elegiveis: Array<{ id: string; nome: string; email: string }>;
}

const ROTULO_ESTADO: Record<LinhaDePara["estado"], string> = {
  vinculado: "Vinculado",
  descartado: "Descartado (não é pessoa)",
  sem_decisao: "Ainda não decidido",
};

export function TabelaIdentidades({ meuPapel, linhas, cobertura, elegiveis }: Props) {
  const podeEditar = meuPapel === "admin" || meuPapel === "owner";

  // SEM PERMISSÃO é tela própria, e ela aparece ANTES do clique. A porta recusa `membro` com
  // `insufficient_privilege`; deixar a tela oferecer o controle e só então recusar é a classe
  // ARB-26 — o sistema recusou e a interface não contou.
  if (!podeEditar) {
    return (
      <section>
        <h1>Identidades externas</h1>
        <p>
          Esta tela é de gestão: só <strong>owner</strong> e <strong>admin</strong> decidem a quem
          pertencem os registros vindos de outro sistema. Peça a quem administra o workspace.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1>Identidades externas</h1>
      <p>
        De-para entre quem aparece como responsável no Kommo e quem é a pessoa aqui. Cada linha
        decide o dono de leads reais, e a aplicação dessa decisão <strong>não tem volta</strong> —
        os eventos são gravados num registro que não aceita apagamento.
      </p>

      <PainelCobertura cobertura={cobertura} />

      {linhas.length === 0 ? (
        // VAZIO ≠ QUEBRADO. Sem esta distinção, uma tela em branco vira ticket de bug.
        <p>
          Nenhum identificador externo pendente: todo lead do acervo já tem procedência resolvida.
          Nada a decidir aqui.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">ID no Kommo</th>
              <th scope="col">Leads que dependem</th>
              <th scope="col">Estado</th>
              <th scope="col">Decisão</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <LinhaIdentidade key={l.idExterno} linha={l} elegiveis={elegiveis} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function PainelCobertura({ cobertura }: { cobertura: CoberturaDePara }) {
  // ERRO DE LEITURA ≠ ACERVO VAZIO. Quatro zeros por falha de leitura fariam a soma "fechar" por
  // vacuidade e liberariam o passo irreversível justamente quando não se mediu nada.
  if (!cobertura.lido) {
    return (
      <p role="alert">
        <strong>Não foi possível ler a cobertura do de-para.</strong> Isto não quer dizer que ela
        esteja completa — quer dizer que não sabemos. O backfill continua bloqueado.
      </p>
    );
  }

  const soma =
    cobertura.deIdVinculado +
    cobertura.deIdDescartado +
    cobertura.deIdSemLinha +
    cobertura.semDonoOriginal;

  return (
    <div>
      <h2>Cobertura</h2>
      <ul>
        <li>Com dono identificado: {cobertura.deIdVinculado}</li>
        <li>De identificador descartado: {cobertura.deIdDescartado}</li>
        <li>
          <strong>De identificador ainda não decidido: {cobertura.deIdSemLinha}</strong>
        </li>
        <li>Sem dono na origem: {cobertura.semDonoOriginal}</li>
        <li>
          Soma: {soma} de {cobertura.leadsTotal} leads
        </li>
      </ul>

      {cobertura.fecha ? (
        <p>
          O de-para está completo. A distribuição do acervo pode ser executada — e é um passo{" "}
          <strong>sem volta</strong>.
        </p>
      ) : (
        <p role="alert">
          <strong>Distribuição do acervo BLOQUEADA.</strong>{" "}
          {cobertura.deIdSemLinha > 0
            ? `${cobertura.deIdSemLinha} lead(s) dependem de identificadores que ninguém decidiu ainda. ` +
              "Ausência de decisão não é o mesmo que ausência de dono."
            : `A soma dá ${soma} e o acervo tem ${cobertura.leadsTotal} leads — alguma categoria escapou da contagem.`}
        </p>
      )}
    </div>
  );
}

function LinhaIdentidade({
  linha,
  elegiveis,
}: {
  linha: LinhaDePara;
  elegiveis: Array<{ id: string; nome: string; email: string }>;
}) {
  // ESTADO INICIAL = NÃO DECIDIDO, sempre. O controle nasce vazio mesmo quando a linha já tem
  // decisão: reabrir a decisão é explícito, e nada é submetido sem escolha deliberada.
  const [escolha, setEscolha] = useState<string>("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function salvar() {
    setErro(null);
    const descartar = escolha === "__descartar__";
    iniciar(async () => {
      const r = await vincularIdentidadeExterna(
        "kommo",
        "usuario",
        linha.idExterno,
        descartar ? null : escolha || null,
        descartar,
      );
      if (!r.ok) setErro(r.motivo ?? "recusado");
      else setEscolha("");
    });
  }

  return (
    <tr>
      <td>
        <code>{linha.idExterno}</code>
      </td>
      <td>{linha.leads}</td>
      <td>
        {ROTULO_ESTADO[linha.estado]}
        {linha.estado === "vinculado" && linha.pessoaNome ? ` — ${linha.pessoaNome}` : null}
      </td>
      <td>
        {elegiveis.length === 0 ? (
          // SEM ELEGÍVEL é o estado de produção HOJE (membro ativo = 0). Um select vazio e mudo
          // faria a tela parecer quebrada; o certo é dizer o estado real e o caminho de saída.
          <span>
            Ninguém para vincular ainda — nenhum membro ativo no workspace.{" "}
            <a href="/configuracoes/membros">Convidar</a>. Descartar continua possível abaixo.
          </span>
        ) : null}

        <label>
          <span>Decisão para o ID {linha.idExterno}</span>
          <select
            value={escolha}
            onChange={(e) => setEscolha(e.target.value)}
            disabled={pendente}
          >
            {/* o primeiro item NÃO é uma decisão: é a ausência dela */}
            <option value="">— ainda não decidido —</option>
            {elegiveis.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({u.email})
              </option>
            ))}
            <option value="__descartar__">
              Não corresponde a ninguém — descartar ({linha.leads} leads vão para o rodízio)
            </option>
          </select>
        </label>

        <button type="button" onClick={salvar} disabled={pendente || escolha === ""}>
          {pendente ? "Gravando…" : "Gravar decisão"}
        </button>

        {erro ? (
          // A recusa da porta volta LITERAL: não-membro, acesso revogado e sem permissão são três
          // problemas diferentes com três saídas diferentes.
          <p role="alert">Recusado: {erro}</p>
        ) : null}
      </td>
    </tr>
  );
}
