"use client";

import { useState } from "react";
import { SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarcaJarvis, type VarianteMarca } from "./marca";
import { JarvisDiz, type ObservacaoJarvis } from "./jarvis-diz";
import { PropostaJarvisInline, type VarianteNota } from "./proposta-inline";
import { PropostaTarefaCard } from "./proposta-tarefa-card";
import { ReguaAutonomia, type LinhaAutonomia, type NivelAutonomia } from "./regua-autonomia";
import type { AjusteProposta, MotivoDescarte, Pessoa, PropostaJarvis } from "./tipos";

/**
 * GALERIA TEMPORÁRIA — v2: VARIANTES LADO A LADO para o Diogo escolher (`/jarvis/galeria?como=sara`).
 * Marca: (a) arco · (b) faísca · (c) palavra, contra o sparkles genérico. Nota: (a) sem lateral ·
 * (b) com lateral. Nada aqui escreve no banco; o ciclo é exercido em memória.
 */

function decidir(p: PropostaJarvis, quem: string, ajuste: AjusteProposta | null): PropostaJarvis {
  const agora = new Date().toISOString();
  if (!ajuste) return { ...p, estado: "aceita", decidido_por: quem, decidido_em: agora };
  return {
    ...p,
    estado: "ajustada",
    decidido_por: quem,
    decidido_em: agora,
    fazer: ajuste.fazer ?? p.fazer,
    prazo: ajuste.prazo === undefined ? p.prazo : ajuste.prazo,
    responsavel_id: ajuste.responsavel_id === undefined ? p.responsavel_id : ajuste.responsavel_id,
    responsavel_nome: ajuste.responsavel_nome === undefined ? p.responsavel_nome : ajuste.responsavel_nome,
    original: { fazer: p.fazer, prazo: p.prazo, responsavel_nome: p.responsavel_nome },
  };
}

function descartar(p: PropostaJarvis, quem: string, motivo: MotivoDescarte, obs: string | null): PropostaJarvis {
  return { ...p, estado: "descartada", decidido_por: quem, decidido_em: new Date().toISOString(), motivo_descarte: motivo, observacao_descarte: obs };
}

const MARCAS: Array<{ v: VarianteMarca; rotulo: string; nota: string }> = [
  { v: "arco", rotulo: "(a) arco", nota: "glifo próprio: ponto + arco — escuta/atenção" },
  { v: "faisca", rotulo: "(b) faísca", nota: "sparkles reinterpretado: um raio só, assimétrico" },
  { v: "palavra", rotulo: "(c) palavra", nota: "wordmark mono com ponto de estado — uso inline" },
];

function Bloco({ titulo, caminho, assinatura, children }: { titulo: string; caminho: string; assinatura?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-[15px] font-medium tracking-[-0.01em] text-foreground">{titulo}</h2>
        <p className="font-mono text-[11px] text-muted-foreground">
          {caminho}
          {assinatura && <span> · {assinatura}</span>}
        </p>
      </header>
      {children}
    </section>
  );
}

function LinhaMarca({ variante, rotulo, nota }: { variante: VarianteMarca | "sparkles"; rotulo: string; nota: string }) {
  const M = ({ t, vivo }: { t: 16 | 20 | 32; vivo?: boolean }) =>
    variante === "sparkles" ? <SparklesIcon width={t} height={t} strokeWidth={1.5} className={cn(vivo && "text-primary")} /> : <MarcaJarvis variante={variante} tamanho={t} vivo={vivo} />;
  return (
    <tr className="border-t border-border text-foreground">
      <td className="py-3 pr-4 align-middle">
        <p className="text-[13px] font-medium">{rotulo}</p>
        <p className="text-[12px] text-muted-foreground">{nota}</p>
      </td>
      <td className="px-3 py-3 align-middle">
        <M t={16} />
      </td>
      <td className="px-3 py-3 align-middle">
        <M t={20} />
      </td>
      <td className="px-3 py-3 align-middle">
        <M t={32} />
      </td>
      <td className="px-3 py-3 align-middle">
        <M t={20} vivo />
      </td>
      <td className="px-3 py-3 align-middle">
        {variante === "palavra" ? (
          <span className="text-[12px] text-muted-foreground">—</span>
        ) : (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-navy text-branco">
            <M t={20} />
          </span>
        )}
      </td>
      <td className="px-3 py-3 align-middle">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-suave hover:bg-hover">
          <M t={20} />
        </span>
      </td>
      <td className="px-3 py-3 align-middle text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <M t={16} />
          <span className="text-foreground">{variante === "palavra" ? "sugere uma tarefa" : "Jarvis sugere uma tarefa"}</span>
        </span>
      </td>
    </tr>
  );
}

export function GaleriaJarvis({
  quem,
  responsaveis,
  inline,
  tarefas,
  diz,
  regua,
  podeEditarRegua,
}: {
  quem: string;
  responsaveis: Pessoa[];
  inline: PropostaJarvis[];
  tarefas: PropostaJarvis[];
  diz: { frase: string; observacoes: ObservacaoJarvis[]; perguntas: string[]; geradoEm: string };
  regua: LinhaAutonomia[];
  podeEditarRegua: boolean;
}) {
  const [marca, setMarca] = useState<VarianteMarca>("arco");
  const [fioA, setFioA] = useState(inline);
  const [fioB, setFioB] = useState(inline);
  const [fila, setFila] = useState(tarefas);
  const [linhas, setLinhas] = useState(regua);
  const [registro, setRegistro] = useState<string[]>([]);
  const anotar = (s: string) => setRegistro((r) => [`${new Date().toLocaleTimeString("pt-BR")} · ${s}`, ...r].slice(0, 8));

  const coluna = (variante: VarianteNota, fio: PropostaJarvis[], setFio: (f: (l: PropostaJarvis[]) => PropostaJarvis[]) => void) => (
    <div className="space-y-2.5">
      <p className="text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">{variante === "a" ? "(a) sem lateral" : "(b) lateral 2px em primary"}</span> · proposta, ajustar, descartar, e as quatro decididas
      </p>
      <PropostaJarvisInline
        proposta={fio[0]}
        variante={variante}
        marca={marca}
        responsaveis={responsaveis}
        onIrAoTrecho={(id) => anotar(`rolar até a mensagem ${id ?? "?"}`)}
        onAceitar={(prop, ajuste) => {
          setFio((l) => l.map((x) => (x.id === prop.id ? decidir(x, quem, ajuste) : x)));
          anotar(`${ajuste ? "validar_sugestao(aprovada, ajuste)" : "validar_sugestao(aprovada)"} → tarefa_criada · ${prop.id}`);
        }}
        onDescartar={(prop, motivo, obs) => {
          setFio((l) => l.map((x) => (x.id === prop.id ? descartar(x, quem, motivo, obs) : x)));
          anotar(`validar_sugestao(rejeitada, ${motivo}${obs ? `: ${obs}` : ""}) → sugestao_rejeitada · ${prop.id}`);
        }}
      />
      <PropostaJarvisInline proposta={{ ...inline[0], id: `demo-ajustar-${variante}` }} variante={variante} marca={marca} responsaveis={responsaveis} modoInicial="ajustar" onAceitar={(_, a) => anotar(`demo ajustar → ${a ? "com ajuste" : "sem ajuste"}`)} />
      <PropostaJarvisInline proposta={{ ...inline[0], id: `demo-descartar-${variante}` }} variante={variante} marca={marca} responsaveis={responsaveis} modoInicial="descartar" onDescartar={(_, m) => anotar(`demo descartar → ${m}`)} />
      {fio.slice(1).map((p) => (
        <PropostaJarvisInline key={p.id} proposta={p} variante={variante} marca={marca} hrefTarefa={p.estado !== "descartada" ? `/tarefas?lead=${p.lead_id}` : null} />
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1100px] space-y-10 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-medium tracking-[-0.015em] text-foreground">Jarvis — variantes para escolher</h1>
          <p className="text-[13px] text-muted-foreground">galeria temporária · ensaio como {quem} · nada escreve no banco</p>
        </div>
        <div role="radiogroup" aria-label="Marca aplicada nos cards" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <span>marca nos cards:</span>
          {MARCAS.map((m, i) => (
            <span key={m.v} className="inline-flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>·</span>}
              <button
                type="button"
                role="radio"
                aria-checked={marca === m.v}
                onClick={() => setMarca(m.v)}
                className={cn("underline-offset-[3px] hover:text-foreground", marca === m.v && "font-medium text-foreground underline")}
              >
                {m.rotulo}
              </button>
            </span>
          ))}
        </div>
      </header>

      <Bloco titulo="1 · Marca — três variantes contra o sparkles genérico" caminho="components/jarvis/marca.tsx" assinatura="MarcaJarvis({ variante: 'arco'|'faisca'|'palavra', tamanho: 16|20|32, vivo?, rotulo? }) · AssinaturaJarvis({ variante, tamanho, vivo?, sufixo? })">
        <div className="overflow-x-auto rounded-md border border-border bg-card px-4">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11.5px] text-muted-foreground">
                <th className="py-2 pr-4 font-medium">variante</th>
                <th className="px-3 py-2 font-medium">16</th>
                <th className="px-3 py-2 font-medium">20</th>
                <th className="px-3 py-2 font-medium">32</th>
                <th className="px-3 py-2 font-medium">vivo</th>
                <th className="px-3 py-2 font-medium">sidebar ativa</th>
                <th className="px-3 py-2 font-medium">header</th>
                <th className="px-3 py-2 font-medium">assinatura da nota</th>
              </tr>
            </thead>
            <tbody>
              <LinhaMarca variante="sparkles" rotulo="referência: sparkles genérico" nota="lucide, o que está hoje em 3 lugares — a régua é ficar melhor que isto" />
              {MARCAS.map((m) => (
                <LinhaMarca key={m.v} variante={m.v} rotulo={m.rotulo} nota={m.nota} />
              ))}
            </tbody>
          </table>
        </div>
      </Bloco>

      <Bloco titulo="2 · Nota do Jarvis no fio — (a) e (b) lado a lado" caminho="components/jarvis/proposta-inline.tsx" assinatura="PropostaJarvisInline({ proposta, variante?: 'a'|'b', marca?, mostrarLead?, responsaveis?, onAceitar?, onDescartar?, onIrAoTrecho?, hrefTrecho?, hrefTarefa?, somenteLeitura?, modoInicial?, onVoltar?, agoraMs? })">
        <div className="grid gap-6 rounded-md border border-border bg-card p-4 lg:grid-cols-2">
          {coluna("a", fioA, setFioA)}
          {coluna("b", fioB, setFioB)}
        </div>
      </Bloco>

      <Bloco titulo="3 · Jarvis diz — dashboard" caminho="components/jarvis/jarvis-diz.tsx" assinatura="JarvisDiz({ frase, observacoes[], perguntas[], geradoEm, hrefPergunta?, marca? })">
        <div className="grid gap-4 lg:grid-cols-2">
          <JarvisDiz marca={marca} frase={diz.frase} observacoes={diz.observacoes} perguntas={diz.perguntas} geradoEm={diz.geradoEm} />
          <JarvisDiz marca={marca} frase={null} observacoes={[]} perguntas={diz.perguntas.slice(0, 2)} geradoEm={null} />
        </div>
      </Bloco>

      <Bloco titulo="4 · Proposta em /tarefas — a mesma nota, com o lead" caminho="components/jarvis/proposta-tarefa-card.tsx" assinatura="PropostaTarefaCard({ proposta, variante?, marca?, responsaveis?, hrefConversa?, onAceitar?, onDescartar?, agoraMs? }) · dePropostaPendente(p, responsaveis) em tipos.ts">
        <div className="space-y-2 rounded-md border border-border bg-background p-4">
          {fila.length === 0 && <p className="text-[13px] text-muted-foreground">Nenhuma proposta esperando você.</p>}
          {fila.map((p) => (
            <PropostaTarefaCard
              key={p.id}
              proposta={p}
              variante="b"
              marca={marca}
              responsaveis={responsaveis}
              hrefConversa={`/conversas?c=${p.conversa_id}`}
              onAceitar={(prop, ajuste) => {
                setFila((l) => l.filter((x) => x.id !== prop.id));
                anotar(`/tarefas · aceita${ajuste ? " com ajuste" : ""} → tarefa_criada · ${prop.id}`);
              }}
              onDescartar={(prop, motivo) => {
                setFila((l) => l.filter((x) => x.id !== prop.id));
                anotar(`/tarefas · descartada (${motivo}) · ${prop.id}`);
              }}
            />
          ))}
        </div>
      </Bloco>

      <Bloco titulo="5 · Régua de autonomia — /configuracoes/inteligencia" caminho="components/jarvis/regua-autonomia.tsx" assinatura="ReguaAutonomia({ linhas: LinhaAutonomia[], podeEditar, onMudar?(chave, nivel), marca? })">
        <ReguaAutonomia
          marca={marca}
          linhas={linhas}
          podeEditar={podeEditarRegua}
          onMudar={(chave, nivel: NivelAutonomia) => {
            setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, nivel, alteradaPor: `${quem} · agora` } : l)));
            anotar(`autonomia_alterada{capacidade: ${chave}, nivel: ${nivel}}`);
          }}
        />
      </Bloco>

      <section className="rounded-md border border-border px-4 py-3">
        <p className="mb-1 text-[12px] font-medium text-muted-foreground">O que cada clique viraria no ledger (registro da galeria)</p>
        {registro.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">Nenhum clique ainda.</p>
        ) : (
          <ul className="space-y-0.5 font-mono text-[11.5px] text-muted-foreground">
            {registro.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
