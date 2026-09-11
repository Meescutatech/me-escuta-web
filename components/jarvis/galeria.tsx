"use client";

import { useState } from "react";
import { AssinaturaJarvis, MarcaJarvis } from "./marca";
import { JarvisDiz } from "./jarvis-diz";
import { PropostaJarvisInline } from "./proposta-inline";
import { PropostaTarefaCard } from "./proposta-tarefa-card";
import { ReguaAutonomia, type LinhaAutonomia, type NivelAutonomia } from "./regua-autonomia";
import type { AjusteProposta, MotivoDescarte, Pessoa, PropostaJarvis } from "./tipos";
import type { ObservacaoJarvis } from "./jarvis-diz";

/**
 * GALERIA TEMPORÁRIA das superfícies do Jarvis (W-J) — `/jarvis/galeria?como=sara`.
 * Os 5 componentes com a fixture, e o ciclo proposta → aceita/ajustada/descartada exercido em
 * memória para a prova visual. Sai quando os donos das telas montarem os componentes.
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
    responsavel_nome: ajuste.responsavel_nome === undefined ? p.responsavel_nome : (ajuste.responsavel_nome?.split(" ")[0] ?? null),
    original: { fazer: p.fazer, prazo: p.prazo, responsavel_nome: p.responsavel_nome },
  };
}

function descartar(p: PropostaJarvis, quem: string, motivo: MotivoDescarte, obs: string | null): PropostaJarvis {
  return { ...p, estado: "descartada", decidido_por: quem, decidido_em: new Date().toISOString(), motivo_descarte: motivo, observacao_descarte: obs };
}

function Bloco({ titulo, caminho, assinatura, children }: { titulo: string; caminho: string; assinatura: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-[15px] font-[650] tracking-[-0.01em] text-tinta">{titulo}</h2>
        <p className="font-mono text-[11px] text-suave">
          {caminho} · <span className="text-mute">{assinatura}</span>
        </p>
      </header>
      {children}
    </section>
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
  const [fio, setFio] = useState(inline);
  const [fila, setFila] = useState(tarefas);
  const [linhas, setLinhas] = useState(regua);
  const [registro, setRegistro] = useState<string[]>([]);

  const anotar = (s: string) => setRegistro((r) => [`${new Date().toLocaleTimeString("pt-BR")} · ${s}`, ...r].slice(0, 8));

  return (
    <div className="mx-auto max-w-[880px] space-y-10 px-6 py-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-[650] tracking-[-0.015em] text-tinta">Superfícies do Jarvis</h1>
          <p className="text-[13px] text-suave">galeria temporária · ensaio como {quem} · nada aqui escreve no banco</p>
        </div>
        <MarcaJarvis tamanho={32} rotulo="Jarvis" />
      </header>

      <Bloco titulo="1 · Marca" caminho="components/jarvis/marca.tsx" assinatura="MarcaJarvis({ tamanho: 16|20|32, variante: 'selo'|'traco', vivo?, rotulo? }) · AssinaturaJarvis({ tamanho, vivo?, sufixo? })">
        <div className="flex flex-wrap items-center gap-8 rounded-[11px] border border-linha bg-branco px-5 py-4">
          <div className="flex items-center gap-4">
            <MarcaJarvis tamanho={16} />
            <MarcaJarvis tamanho={20} />
            <MarcaJarvis tamanho={32} />
            <span className="text-[11.5px] text-suave">selo 16 · 20 · 32</span>
          </div>
          <div className="flex items-center gap-4 text-tinta">
            <MarcaJarvis tamanho={16} variante="traco" />
            <MarcaJarvis tamanho={20} variante="traco" />
            <MarcaJarvis tamanho={32} variante="traco" />
            <span className="text-[11.5px] text-suave">traço (currentColor) — sidebar e header</span>
          </div>
          <div className="flex items-center gap-4">
            <MarcaJarvis tamanho={32} vivo />
            <span className="text-[11.5px] text-suave">vivo — consultando</span>
          </div>
          <div className="flex items-center gap-4">
            <AssinaturaJarvis tamanho={20} sufixo="propõe" />
            <AssinaturaJarvis tamanho={16} sufixo="criou tarefa" />
          </div>
          <div className="flex items-center gap-3 rounded-md bg-navy px-3 py-2 text-branco">
            <MarcaJarvis tamanho={20} variante="traco" />
            <span className="text-[11.5px]">sobre navy (sidebar ativa)</span>
          </div>
        </div>
      </Bloco>

      <Bloco titulo="2 · Nota interna no fio — o ciclo inteiro" caminho="components/jarvis/proposta-inline.tsx" assinatura="PropostaJarvisInline({ proposta, responsaveis?, onAceitar?, onDescartar?, onIrAoTrecho?, hrefTrecho?, hrefTarefa?, somenteLeitura?, modoInicial?, onVoltar?, agoraMs? })">
        <div className="space-y-3 rounded-[11px] border border-linha bg-branco p-4">
          {fio.map((p) => (
            <PropostaJarvisInline
              key={p.id}
              proposta={p}
              responsaveis={responsaveis}
              onIrAoTrecho={(id) => anotar(`rolar até a mensagem ${id ?? "?"}`)}
              hrefTarefa={p.estado !== "proposta" && p.estado !== "descartada" ? `/tarefas?lead=${p.lead_id}` : null}
              onAceitar={(prop, ajuste) => {
                setFio((l) => l.map((x) => (x.id === prop.id ? decidir(x, quem, ajuste) : x)));
                anotar(`${ajuste ? "validar_sugestao(aprovada, ajuste)" : "validar_sugestao(aprovada)"} → tarefa_criada · ${prop.id}`);
              }}
              onDescartar={(prop, motivo, obs) => {
                setFio((l) => l.map((x) => (x.id === prop.id ? descartar(x, quem, motivo, obs) : x)));
                anotar(`validar_sugestao(rejeitada, ${motivo}${obs ? `: ${obs}` : ""}) → sugestao_rejeitada · ${prop.id}`);
              }}
            />
          ))}
          <p className="pt-2 text-[11.5px] font-semibold text-mute">Modos de edição abertos (mesmo card, `modoInicial`)</p>
          <PropostaJarvisInline proposta={{ ...inline[0], id: "s-demo-ajustar" }} responsaveis={responsaveis} modoInicial="ajustar" onAceitar={(prop, ajuste) => anotar(`demo ajustar → ${ajuste ? "com ajuste" : "sem ajuste"}`)} />
          <PropostaJarvisInline proposta={{ ...inline[0], id: "s-demo-descartar" }} responsaveis={responsaveis} modoInicial="descartar" onDescartar={(prop, motivo) => anotar(`demo descartar → ${motivo}`)} />
        </div>
      </Bloco>

      <Bloco titulo="3 · Jarvis diz — dashboard" caminho="components/jarvis/jarvis-diz.tsx" assinatura="JarvisDiz({ frase, observacoes[], perguntas[], geradoEm, hrefPergunta? })">
        <JarvisDiz frase={diz.frase} observacoes={diz.observacoes} perguntas={diz.perguntas} geradoEm={diz.geradoEm} />
        <JarvisDiz frase={null} observacoes={[]} perguntas={diz.perguntas.slice(0, 2)} geradoEm={null} />
      </Bloco>

      <Bloco titulo="4 · Card de proposta em /tarefas" caminho="components/jarvis/proposta-tarefa-card.tsx" assinatura="PropostaTarefaCard({ proposta, responsaveis?, hrefConversa?, onAceitar?, onDescartar?, agoraMs? }) · dePropostaPendente(p, responsaveis) em tipos.ts">
        <div className="space-y-2 rounded-[11px] border border-linha bg-board p-4">
          {fila.length === 0 && <p className="text-[13px] text-suave">Nenhuma proposta esperando você.</p>}
          {fila.map((p) => (
            <PropostaTarefaCard
              key={p.id}
              proposta={p}
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

      <Bloco titulo="5 · Régua de autonomia — /configuracoes/inteligencia" caminho="components/jarvis/regua-autonomia.tsx" assinatura="ReguaAutonomia({ linhas: LinhaAutonomia[], podeEditar, onMudar?(chave, nivel) })">
        <ReguaAutonomia
          linhas={linhas}
          podeEditar={podeEditarRegua}
          onMudar={(chave, nivel: NivelAutonomia) => {
            setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, nivel, alteradaPor: `${quem} · agora` } : l)));
            anotar(`autonomia_alterada{capacidade: ${chave}, nivel: ${nivel}}`);
          }}
        />
      </Bloco>

      <section className="rounded-[11px] border border-dashed border-linha-forte px-4 py-3">
        <p className="mb-1 text-[11.5px] font-semibold text-mute">O que cada clique viraria no ledger (só registro da galeria)</p>
        {registro.length === 0 ? (
          <p className="text-[12.5px] text-suave">Nenhum clique ainda.</p>
        ) : (
          <ul className="space-y-0.5 font-mono text-[11.5px] text-suave">
            {registro.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
