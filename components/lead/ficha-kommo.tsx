"use client";

import { useEffect, useState } from "react";
import type { FichaDoLead } from "@/lib/dados/lead-painel";
import {
  inputParaValor,
  valorParaInput,
  valorParaTexto,
  type CampoFicha,
} from "@/lib/dados/ficha-calculos";
import { salvarCampoFicha } from "@/app/(app)/lead/actions";
import { cn } from "@/lib/utils";

/*
 * FICHA réplica Kommo (R9 — mockup r9-conversa.html): abas horizontais de grupos com
 * sublinhado navy, linhas de 38px label/valor com hairline, edição inline — select nativo
 * sem borda com chevron discreto (salva no change), input/textarea salvam no Enter/blur,
 * vazio = "Selecione" (selects) ou "—" em cinza --pt. MESMA porta/contrato da R8:
 * lead_atualizado {campos: {slug: valor|null}} — mudou só a anatomia/pele.
 * Estados honestos: config ausente → "ficha não configurada"; projeção 0028 indisponível →
 * somente leitura com aviso. Abas extras (Tarefas/Anotações) entram na mesma régua de abas.
 */

/*
 * ⚠️ ESTE CHEVRON É O ÚLTIMO LUGAR ONDE O #9AA1AA SOBREVIVEU À TROCA DE TOKEN DA W4.
 *
 * A cor está PERCENT-ENCODED dentro de um data-URI (`%239AA1AA`), então nem `grep '#9AA1AA'` nem
 * varredura de CSS/Tailwind alcançam — o token foi dado como extinto no repo enquanto ele seguia
 * desenhando a setinha de todo select da ficha. Quem for procurar cor morta de novo: `grep -rn "%23"`.
 *
 * Medido: #9AA1AA dava 2,61:1 no branco — abaixo até do piso de 3:1 do SC 1.4.11 para objeto
 * gráfico, e o chevron é o que diz "isto aqui é editável". #5F6873 (o `mute` vivo) dá 5,65:1.
 */
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%235F6873' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")";

export interface AbaExtra {
  chave: string;
  rotulo: string;
  contagem?: number;
  conteudo: React.ReactNode;
}

// ─────────────── linha de campo ───────────────

function LinhaCampo({
  leadId,
  campo,
  valor,
  editavelAqui,
  aoAtualizar,
  aoErro,
}: {
  leadId: string;
  campo: CampoFicha;
  valor: unknown;
  editavelAqui: boolean;
  aoAtualizar: () => void;
  aoErro: (msg: string) => void;
}) {
  const [input, setInput] = useState(() => valorParaInput(campo.tipo, valor));
  const [editandoTexto, setEditandoTexto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // valor novo do servidor (refetch) re-semeia o editor quando não estamos editando
  useEffect(() => {
    if (!editandoTexto && !salvando) setInput(valorParaInput(campo.tipo, valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  async function salvar(bruto: string) {
    const parse = inputParaValor(campo.tipo, bruto);
    if (!parse.ok) {
      aoErro(`${campo.nome}: ${parse.erro}`);
      setInput(valorParaInput(campo.tipo, valor));
      return;
    }
    if (bruto.trim() === valorParaInput(campo.tipo, valor).trim()) return; // sem mudança → sem evento
    setSalvando(true);
    const r = await salvarCampoFicha(leadId, campo.slug, parse.valor);
    setSalvando(false);
    if (!r.ok) {
      aoErro(`${campo.nome}: ${r.motivo ?? "erro ao salvar"}`);
      setInput(valorParaInput(campo.tipo, valor));
      return;
    }
    aoAtualizar();
  }

  const texto = valorParaTexto(campo.tipo, valor);
  const vazio = valor == null || valor === "";

  return (
    <div className="flex min-h-[38px] items-center gap-3 border-b border-linha/60 last:border-b-0">
      <span className="w-[41%] min-w-[41%] text-[13px] leading-[1.3] text-suave" title={campo.slug}>
        {campo.nome}
      </span>
      <span className="flex min-w-0 flex-1 justify-end">
        {!editavelAqui ? (
          <span className={cn("break-words text-right text-[13.5px] leading-[1.35]", vazio ? "text-mute" : "text-tinta")}>
            {campo.tipo === "selecao" && vazio ? "Selecione" : texto}
          </span>
        ) : campo.tipo === "selecao" || campo.tipo === "booleano" ? (
          <select
            value={input}
            disabled={salvando}
            onChange={(e) => {
              setInput(e.target.value);
              void salvar(e.target.value); // select salva no change (anatomia Kommo)
            }}
            className={cn(
              "inline-select max-w-full cursor-pointer appearance-none rounded bg-transparent py-1.5 pl-1 pr-4 text-right text-[13.5px] hover:bg-hover focus:bg-hover focus:outline-none",
              input === "" ? "text-mute" : "text-tinta",
            )}
            style={{ backgroundImage: CHEVRON, backgroundRepeat: "no-repeat", backgroundPosition: "right 2px center" }}
          >
            <option value="">Selecione</option>
            {campo.tipo === "booleano" ? (
              <>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </>
            ) : (
              campo.opcoes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))
            )}
          </select>
        ) : (
          <input
            type={campo.tipo === "data" ? "date" : campo.tipo === "data_hora" ? "datetime-local" : "text"}
            inputMode={campo.tipo === "numero" ? "decimal" : undefined}
            value={input}
            disabled={salvando}
            placeholder="—"
            onFocus={() => setEditandoTexto(true)}
            onChange={(e) => setInput(e.target.value)}
            onBlur={(e) => {
              setEditandoTexto(false);
              void salvar(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setInput(valorParaInput(campo.tipo, valor));
                setEditandoTexto(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-full rounded bg-transparent py-1.5 pl-1 pr-1 text-right text-[13.5px] text-tinta placeholder:text-mute hover:bg-hover focus:bg-hover focus:outline-none"
          />
        )}
      </span>
    </div>
  );
}

// ─────────────── ficha com abas ───────────────

export function FichaKommo({
  leadId,
  ficha,
  abasExtras = [],
  aoAtualizar,
}: {
  leadId: string;
  ficha: FichaDoLead;
  abasExtras?: AbaExtra[];
  aoAtualizar: () => void;
}) {
  const grupos = ficha.grupos ?? [];
  const [abaAtiva, setAbaAtiva] = useState<string>(grupos[0]?.chave ?? abasExtras[0]?.chave ?? "");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (erro) {
      const t = setTimeout(() => setErro(null), 4000);
      return () => clearTimeout(t);
    }
  }, [erro]);

  if (!ficha.grupos && abasExtras.length === 0) {
    return (
      <p className="px-4 py-3 text-[12.5px] leading-relaxed text-mute">
        Ficha não configurada ainda — a definição dos campos (config <code>ficha_lead</code>) chega
        com a trilha de dados.
      </p>
    );
  }

  const projecaoOk = ficha.valores != null;
  const valores = ficha.valores ?? {};
  const grupoAtivo = grupos.find((g) => g.chave === abaAtiva) ?? null;
  const extraAtiva = abasExtras.find((a) => a.chave === abaAtiva) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* abas horizontais — sublinhado navy na ativa */}
      <div className="scrollbar-none -mb-px flex gap-0.5 overflow-x-auto border-b border-linha px-3" role="tablist">
        {grupos.map((g) => (
          <button
            key={g.chave}
            type="button"
            role="tab"
            aria-selected={abaAtiva === g.chave}
            onClick={() => setAbaAtiva(g.chave)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-2.5 py-2 text-[12.5px]",
              abaAtiva === g.chave
                ? "border-navy font-[650] text-navy"
                : "border-transparent font-medium text-suave hover:text-tinta",
            )}
          >
            {g.nome}
          </button>
        ))}
        {abasExtras.map((a) => (
          <button
            key={a.chave}
            type="button"
            role="tab"
            aria-selected={abaAtiva === a.chave}
            onClick={() => setAbaAtiva(a.chave)}
            className={cn(
              "-mb-px flex items-center gap-1 whitespace-nowrap border-b-2 px-2.5 py-2 text-[12.5px]",
              abaAtiva === a.chave
                ? "border-navy font-[650] text-navy"
                : "border-transparent font-medium text-suave hover:text-tinta",
            )}
          >
            {a.rotulo}
            {a.contagem != null && a.contagem > 0 && (
              <span className="rounded-full bg-laranja-cl px-1.5 font-mono text-[10.5px] text-laranja-esc">{a.contagem}</span>
            )}
          </button>
        ))}
      </div>

      {/* conteúdo da aba */}
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-5 pt-1">
        {grupoAtivo && (
          <>
            {!projecaoOk && (
              <p className="mb-1 mt-2 rounded-[6px] bg-laranja-cl px-2.5 py-1.5 text-[11.5px] leading-relaxed text-laranja-esc">
                Valores da ficha chegam com a projeção (0028) — somente leitura até lá.
              </p>
            )}
            {grupoAtivo.campos.map((c) => (
              <LinhaCampo
                key={c.slug}
                leadId={leadId}
                campo={c}
                valor={valores[c.slug]}
                editavelAqui={c.editavel && projecaoOk}
                aoAtualizar={aoAtualizar}
                aoErro={setErro}
              />
            ))}
            {!grupoAtivo.campos.some((c) => c.editavel) && (
              <p className="pb-0.5 pt-2.5 text-center text-[11.5px] text-mute">
                Campos preenchidos pela operação · edição em rodada futura
              </p>
            )}
          </>
        )}
        {extraAtiva && <div className="pt-3">{extraAtiva.conteudo}</div>}
      </div>

      {erro && (
        <div className="border-t border-linha bg-vermelho-bg px-4 py-2 text-[12px] font-medium text-vermelho">
          {erro}
        </div>
      )}
    </div>
  );
}
