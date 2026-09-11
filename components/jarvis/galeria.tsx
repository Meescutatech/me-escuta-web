"use client";

import { useState } from "react";
import { SparklesIcon } from "lucide-react";
import { MarcaJarvis } from "./marca";
import { JarvisDiz, type ObservacaoJarvis } from "./jarvis-diz";
import { PropostaJarvisInline } from "./proposta-inline";
import { PropostaTarefaCard } from "./proposta-tarefa-card";
import { ReguaAutonomia, type LinhaAutonomia, type NivelAutonomia } from "./regua-autonomia";
import { ListaDeAcoes, type ItemAcao } from "./lista-de-acoes";
import { RespostaBlocos } from "./resposta";
import type { AjusteProposta, MotivoDescarte, Pessoa, PropostaJarvis } from "./tipos";
import { responderEnsaio } from "@/lib/ensaio/jarvis";

/**
 * GALERIA TEMPORÁRIA — a ESCOLHIDA (Diogo, 10/09/2026 22:40): arco + nota sem lateral.
 * Todos os tamanhos e todos os estados; o ciclo exercido em memória. Nada escreve no banco.
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

function Celula({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-10 items-center">{children}</div>
      <span className="text-[11px] text-muted-foreground">{rotulo}</span>
    </div>
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
  percurso,
  atencao,
}: {
  quem: string;
  responsaveis: Pessoa[];
  inline: PropostaJarvis[];
  tarefas: PropostaJarvis[];
  diz: { frase: string; observacoes: ObservacaoJarvis[]; perguntas: string[]; geradoEm: string };
  regua: LinhaAutonomia[];
  podeEditarRegua: boolean;
  percurso: ItemAcao[];
  atencao: ItemAcao[];
}) {
  const [fio, setFio] = useState(inline);
  const [fila, setFila] = useState(tarefas);
  const [linhas, setLinhas] = useState(regua);
  const [registro, setRegistro] = useState<string[]>([]);
  const anotar = (s: string) => setRegistro((r) => [`${new Date().toLocaleTimeString("pt-BR")} · ${s}`, ...r].slice(0, 8));

  return (
    <div className="max-w-[1100px] space-y-10 px-6 py-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-medium tracking-[-0.015em] text-foreground">Jarvis — a escolhida</h1>
          <p className="text-[13px] text-muted-foreground">arco + nota sem lateral · galeria temporária · ensaio como {quem} · nada escreve no banco</p>
        </div>
        <MarcaJarvis tamanho={32} rotulo="Jarvis" className="text-foreground" />
      </header>

      <Bloco titulo="1 · Marca — o arco" caminho="components/jarvis/marca.tsx" assinatura="MarcaJarvis({ tamanho?: 16|20|32, vivo?, rotulo?, className? }) · NomeJarvis()">
        <div className="flex flex-wrap items-start gap-8 rounded-md border border-border/60 px-5 py-4 text-foreground">
          <Celula rotulo="16">
            <MarcaJarvis tamanho={16} />
          </Celula>
          <Celula rotulo="20">
            <MarcaJarvis tamanho={20} />
          </Celula>
          <Celula rotulo="32">
            <MarcaJarvis tamanho={32} />
          </Celula>
          <Celula rotulo="vivo">
            <MarcaJarvis tamanho={20} vivo />
          </Celula>
          <Celula rotulo="sidebar ativa">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-navy text-branco">
              <MarcaJarvis tamanho={20} />
            </span>
          </Celula>
          <Celula rotulo="header">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-suave">
              <MarcaJarvis tamanho={20} />
            </span>
          </Celula>
          <Celula rotulo="muted (nota)">
            <MarcaJarvis tamanho={16} className="text-muted-foreground" />
          </Celula>
          <Celula rotulo="o que substitui">
            <SparklesIcon width={20} height={20} strokeWidth={1.5} className="text-muted-foreground/60" />
          </Celula>
        </div>
      </Bloco>

      <Bloco titulo="2 · Nota no fio — todos os estados" caminho="components/jarvis/proposta-inline.tsx" assinatura="PropostaJarvisInline({ proposta, mostrarLead?, responsaveis?, onAceitar?, onDescartar?, onIrAoTrecho?, hrefTrecho?, hrefTarefa?, somenteLeitura?, modoInicial?, onVoltar?, agoraMs? })">
        <div className="space-y-2.5 rounded-md border border-border/60 bg-background p-4">
          <PropostaJarvisInline
            proposta={fio[0]}
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
          <PropostaJarvisInline proposta={{ ...inline[0], id: "demo-ajustar" }} responsaveis={responsaveis} modoInicial="ajustar" onAceitar={(_, a) => anotar(`demo ajustar → ${a ? "com ajuste" : "sem ajuste"}`)} />
          <PropostaJarvisInline proposta={{ ...inline[0], id: "demo-descartar" }} responsaveis={responsaveis} modoInicial="descartar" onDescartar={(_, m) => anotar(`demo descartar → ${m}`)} />
          {fio.slice(1).map((p) => (
            <PropostaJarvisInline key={p.id} proposta={p} hrefTarefa={p.estado !== "descartada" ? `/tarefas?lead=${p.lead_id}` : null} />
          ))}
        </div>
      </Bloco>

      <Bloco titulo="3 · Em /tarefas — a mesma nota, com o lead" caminho="components/jarvis/proposta-tarefa-card.tsx" assinatura="PropostaTarefaCard({ proposta, responsaveis?, hrefConversa?, onAceitar?, onDescartar?, agoraMs? }) · dePropostaPendente(p, responsaveis) em tipos.ts">
        <div className="space-y-2 rounded-md border border-border/60 bg-background p-4">
          {fila.length === 0 && <p className="text-[13px] text-muted-foreground">Nenhuma proposta esperando você.</p>}
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

      <Bloco titulo="4 · No dashboard" caminho="components/jarvis/jarvis-diz.tsx" assinatura="JarvisDiz({ frase, observacoes[], perguntas[], geradoEm, hrefPergunta?, acoes?: ItemAcao[], rotuloAcoes? })">
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">observações como itens com estado (o resolvido riscado); 3 à vista, "ver mais" abre o resto + "Precisa de atenção" sem pulo</p>
          <JarvisDiz frase={diz.frase} observacoes={diz.observacoes} acoes={atencao} rotuloAcoes="Precisa de atenção" perguntas={diz.perguntas} geradoEm={diz.geradoEm} />
          <JarvisDiz frase={null} observacoes={[]} perguntas={diz.perguntas.slice(0, 2)} geradoEm={null} />
        </div>
      </Bloco>

      <Bloco titulo="5 · Lista de ações com estado" caminho="components/jarvis/lista-de-acoes.tsx" assinatura="ListaDeAcoes({ itens: ItemAcao[], rotulo?, className? }) · ItemAcao = { id, titulo, estado: 'feito'|'andamento'|'pendente'|'atencao', badge?, href?, detalhe?, filhos? }">
        <div className="grid gap-6 rounded-md border border-border/60 bg-background p-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[12px] text-muted-foreground">/tarefas · percurso "Começar as tarefas" (W-D5) — clique numa linha com seta para abrir o detalhe</p>
            <ListaDeAcoes itens={percurso} rotulo="Percurso do dia" />
          </div>
          <div>
            <p className="mb-2 text-[12px] text-muted-foreground">dashboard · "Precisa de atenção" (W-D4)</p>
            <ListaDeAcoes itens={atencao} rotulo="Precisa de atenção" />
          </div>
        </div>
      </Bloco>

      <Bloco titulo="6 · A resposta do /jarvis em blocos" caminho="components/jarvis/resposta.tsx · pergunta.tsx · app/(app)/jarvis/page.tsx" assinatura="RespostaBlocos({ resposta: RespostaJarvis, vivo? }) · PerguntaJarvis({ usuarioId, papel, contexto, perguntaInicial?, enviarAoAbrir?, ensaio?, sugestoes? }) · responderEnsaio(pergunta, agora) em lib/ensaio/jarvis.ts">
        <div className="grid gap-6 rounded-md border border-border/60 bg-background p-4 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-[12.5px] text-muted-foreground">Quais tarefas estão vencidas e de quem?</p>
            <RespostaBlocos resposta={responderEnsaio("Quais tarefas estão vencidas e de quem?", new Date())} />
          </div>
          <div>
            <p className="mb-3 text-[12.5px] text-muted-foreground">Como está o funil esta semana?</p>
            <RespostaBlocos resposta={responderEnsaio("Como está o funil esta semana?", new Date())} />
          </div>
        </div>
      </Bloco>

      <Bloco titulo="7 · Régua de autonomia — /configuracoes/inteligencia" caminho="components/jarvis/regua-autonomia.tsx" assinatura="ReguaAutonomia({ linhas: LinhaAutonomia[], podeEditar, onMudar?(chave, nivel) })">
        <ReguaAutonomia
          linhas={linhas}
          podeEditar={podeEditarRegua}
          onMudar={(chave, nivel: NivelAutonomia) => {
            setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, nivel, alteradaPor: `${quem} · agora` } : l)));
            anotar(`autonomia_alterada{capacidade: ${chave}, nivel: ${nivel}}`);
          }}
        />
      </Bloco>

      <section className="rounded-md border border-border/60 px-4 py-3">
        <p className="mb-1 text-[12px] text-muted-foreground">O que cada clique viraria no ledger (registro da galeria)</p>
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
