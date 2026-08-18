"use client";

import { useState } from "react";
import { DndContext } from "@dnd-kit/core";
import { BotaoEnvio, ChipProgramado, type EnvioProgramado } from "@/components/conversas/botao-envio";
import { CartaoSugestaoTarefa } from "@/components/conversas/sugestao-tarefa";
import { CartaoLead } from "@/components/funil/card-lead";
import { SeletorOrdem } from "@/components/funil/seletor-ordem";
import { BotaoAudiometria } from "@/components/lead/botao-audiometria";
import { ordenarCards, ORDEM_PADRAO, type ChaveOrdem } from "@/lib/dados/funil-ordenacao";
import { MOTIVO_PROTOTIPO, SELO_PROTOTIPO } from "@/lib/prototipo";
import { cn } from "@/lib/utils";
import { carimbo, sugerirTarefa } from "@/lib/conversas/sugestao-jarvis";
import { cardsExemplo, conversaExemplo } from "./fixtures";

/*
 * A VITRINE das quatro telas do workshop de 12/08, na ordem de prioridade que saiu de lá.
 *
 * Cada bloco traz a FRASE que originou o desenho, porque é ela que julga o desenho: se a tela não
 * responde à frase, a tela está errada — e com a frase na página qualquer um pode apontar isso
 * sem precisar ter estado na reunião.
 *
 * Todos os componentes abaixo são os mesmos que estão ligados nas telas reais. Esta página não
 * tem uma segunda versão de nada; ela só os coloca lado a lado com dados de mentira.
 */

type Aba = "programar" | "sugestao" | "card" | "audiometria";

const ABAS: Array<{ chave: Aba; n: string; titulo: string; resumo: string }> = [
  { chave: "programar", n: "1", titulo: "Enviar agora ou programar", resumo: "Pedido nº 1 da Sarah" },
  { chave: "sugestao", n: "2", titulo: "O Jarvis sugere a tarefa", resumo: "Agente propõe, humano valida" },
  { chave: "card", n: "3", titulo: "Cor no card por prazo", resumo: "Decisão em 3 segundos" },
  { chave: "audiometria", n: "4", titulo: "Botão gigante de audiometria", resumo: "O gate da decisão" },
];

export function PrototipoWorkshop({ agora }: { agora: number }) {
  const [aba, setAba] = useState<Aba>("programar");

  return (
    <div className="min-h-screen bg-board">
      <header className="border-b border-linha bg-branco">
        <div className="mx-auto max-w-[1080px] px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-2xl font-semibold text-navy">Protótipo do workshop</h1>
            <span
              title={MOTIVO_PROTOTIPO}
              className="rounded-full border border-laranja bg-laranja-cl px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-wide text-laranja-esc"
            >
              {SELO_PROTOTIPO}
            </span>
          </div>
          <p className="mt-1.5 max-w-[68ch] text-[0.88rem] leading-relaxed text-suave">
            As quatro telas fechadas em 12/08, rodando no app de verdade. Pode clicar em tudo: toda
            ação nova fica no estado desta tela e nenhuma escreve no banco. Os mesmos componentes
            já estão ligados em <b className="font-semibold text-tinta">/conversas</b> e{" "}
            <b className="font-semibold text-tinta">/funil</b>.
          </p>
        </div>
        <nav className="mx-auto flex max-w-[1080px] gap-1 overflow-x-auto px-6">
          {ABAS.map((a) => (
            <button
              key={a.chave}
              onClick={() => setAba(a.chave)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-left transition-colors",
                aba === a.chave
                  ? "border-laranja text-navy"
                  : "border-transparent text-mute hover:text-suave",
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.66rem] font-bold",
                  aba === a.chave ? "bg-laranja text-branco" : "bg-board text-mute",
                )}
              >
                {a.n}
              </span>
              <span>
                <span className="block text-[0.84rem] font-semibold leading-tight">{a.titulo}</span>
                <span className="block text-[0.7rem] leading-tight text-mute">{a.resumo}</span>
              </span>
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1080px] px-6 py-7">
        {aba === "programar" && <BlocoProgramar />}
        {aba === "sugestao" && <BlocoSugestao agora={agora} />}
        {aba === "card" && <BlocoCard agora={agora} />}
        {aba === "audiometria" && <BlocoAudiometria />}
      </main>
    </div>
  );
}

/* ───────────────────────── moldura comum dos blocos ───────────────────────── */

function Bloco({
  fala,
  porque,
  onde,
  children,
}: {
  fala: string;
  porque: string;
  onde: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
      <aside className="space-y-4">
        <blockquote className="rounded-xl border-l-[3px] border-l-navy border-linha bg-branco p-4 shadow-[0_1px_6px_rgba(37,47,99,.05)]">
          <p className="text-[0.9rem] font-medium italic leading-relaxed text-navy">“{fala}”</p>
          <footer className="mt-2 text-[0.72rem] text-mute">Workshop, 12/08</footer>
        </blockquote>
        <div>
          <div className="text-[0.66rem] font-bold uppercase tracking-[0.07em] text-mute">Por que importa</div>
          <p className="mt-1 text-[0.84rem] leading-relaxed text-suave">{porque}</p>
        </div>
        <div>
          <div className="text-[0.66rem] font-bold uppercase tracking-[0.07em] text-mute">Onde já está ligado</div>
          <p className="mt-1 text-[0.84rem] leading-relaxed text-suave">{onde}</p>
        </div>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}

/**
 * `semCorte`: o menu de programar envio abre PARA CIMA (o composer mora no rodapé da conversa), e
 * o `overflow-hidden` que arredonda o palco cortava as duas primeiras opções. Quem abre menu para
 * fora do palco pede a versão sem corte — o arredondamento passa para o cabeçalho.
 */
function Palco({
  titulo,
  semCorte,
  children,
}: {
  titulo: string;
  semCorte?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-linha bg-branco", !semCorte && "overflow-hidden")}>
      <div
        className={cn(
          "border-b border-linha bg-board px-4 py-2 text-[0.74rem] font-semibold text-mute",
          semCorte && "rounded-t-[11px]",
        )}
      >
        {titulo}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ───────────────────────── 1 · enviar ou programar ───────────────────────── */

function BlocoProgramar() {
  const [rascunho, setRascunho] = useState("Bom dia, seu Antônio! Consegui a fono na sexta às 9h. Fica bom pro senhor?");
  const [programado, setProgramado] = useState<EnvioProgramado | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);

  return (
    <Bloco
      fala="Sabe quando você programa pra agendar um e-mail? Ela precisa disso. Enviar agora ou programar. Só isso. Copia o que tem no Google."
      porque="A Sarah escreve a mensagem às 22h e não pode mandar às 22h. Hoje ela guarda na cabeça e manda de manhã — ou esquece. Programar tira a mensagem da memória dela e põe no sistema."
      onde="Composer de /conversas — é o mesmo componente, no lugar do antigo botão de enviar. Cópia do Gmail: dois atalhos de amanhã, um da próxima segunda, e escolher data e hora."
    >
      <Palco titulo="Clique na seta ao lado do avião" semCorte>
        {/* altura de conversa: o composer fica no rodapé, que é onde ele vive — e é o que dá
            espaço para o menu abrir para cima sem cobrir a navegação da página */}
        <div className="flex min-h-[290px] flex-col justify-end">
        <div className="rounded-xl border border-linha-forte">
          {programado && <ChipProgramado envio={programado} onCancelar={() => setProgramado(null)} />}
          <div className="flex items-end gap-1.5 p-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-mute" aria-hidden>
              <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] stroke-current" fill="none">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </span>
            <textarea
              rows={2}
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              aria-label="Mensagem para o cliente"
              className="max-h-28 flex-1 resize-none bg-transparent py-1 pl-1.5 text-[0.9rem] leading-relaxed text-tinta outline-none placeholder:text-mute"
            />
            <BotaoEnvio
              onEnviar={() => {
                setEnviado(rascunho.trim().slice(0, 60));
                setRascunho("");
              }}
              onProgramar={(quando) => {
                setProgramado({ quando, texto: rascunho.trim().slice(0, 60) });
                setRascunho("");
              }}
              desabilitado={!rascunho.trim()}
            />
          </div>
        </div>
        {enviado && (
          <p className="mt-3 rounded-lg bg-board px-3 py-2 text-[0.78rem] text-suave">
            “{enviado}” seria enviada agora. <b className="font-semibold">Protótipo — nada saiu.</b>
          </p>
        )}
        </div>
      </Palco>
    </Bloco>
  );
}

/* ───────────────────────── 2 · o Jarvis sugere ───────────────────────── */

function BlocoSugestao({ agora }: { agora: number }) {
  const falas = conversaExemplo(agora);
  // MESMA regra da tela real — a vitrine não tem cartão próprio, só o fio de mentira
  const sugestao = sugerirTarefa(falas, agora, { nomeLead: "Antônio Ribeiro", responsavel: "Sarah" });
  const [decisao, setDecisao] = useState<string | null>(null);

  return (
    <Bloco
      fala="O Jarvis podia ficar monitorando a conversa e sugerir uma tarefa. Ele faz a sugestão e ela só clica pra aprovar ou não."
      porque="É o princípio da casa inteiro: o agente propõe, uma humana nomeada valida. O motivo é campo obrigatório — sem dizer de onde a sugestão saiu, ela vira ordem, e a Sarah não confia em ordem de robô."
      onde="Inbox de /conversas, no fim do fio, colado no composer. O cartão usa a linguagem visual da sugestão da Clara que já existia (card branco, borda esquerda laranja); o que ele acrescenta é o bloco POR QUE, com a frase do cliente citada."
    >
      <Palco titulo="A conversa, e a sugestão que ela dispara">
        <div className="space-y-2.5">
          {falas.map((f) => (
            <div key={f.id} className={cn("flex", f.direcao === "saida" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[78%] rounded-[11px] px-3.5 py-2",
                  f.direcao === "saida" ? "bg-navy text-branco" : "border border-linha bg-board text-tinta",
                )}
              >
                <p className="text-[0.86rem] leading-relaxed">{f.corpo}</p>
                <p className={cn("mt-1 text-[0.66rem]", f.direcao === "saida" ? "text-branco/60" : "text-mute")}>
                  {carimbo(Date.parse(f.criado_em), agora)}
                </p>
              </div>
            </div>
          ))}
          <div className="pt-2">
            {sugestao ? (
              <CartaoSugestaoTarefa sugestao={sugestao} onDecidir={(_, d) => setDecisao(d)} />
            ) : (
              <p className="rounded-lg bg-board px-3 py-2 text-[0.8rem] text-mute">
                A regra não vê nada a sugerir neste fio — e não sugerir é uma resposta legítima.
              </p>
            )}
          </div>
          {decisao && (
            <p className="pt-1 text-[0.76rem] text-mute">
              No sistema real esta decisão vira um evento no ledger com o nome de quem validou.
              Aqui ela ficou só nesta tela.
            </p>
          )}
        </div>
      </Palco>
    </Bloco>
  );
}

/* ───────────────────────── 3 · cor no card por prazo ───────────────────────── */

function BlocoCard({ agora }: { agora: number }) {
  const [ordem, setOrdem] = useState<ChaveOrdem>(ORDEM_PADRAO);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const cards = ordenarCards(cardsExemplo(agora), ordem, agora);

  return (
    <Bloco
      fala="Você sabe quantos segundos você demora pra decidir se pega o produto da prateleira? 3 segundos."
      porque="A coluna do funil hoje sai na ordem em que a leitura devolveu, que não é ordem nenhuma, e o card não diz há quanto tempo o cliente está esperando. As três perguntas dela — quem estourou, quem está parado, quem está sem resposta — não tinham resposta no board."
      onde="Card e board de /funil. A faixa de prazo reaproveita o nivelSla que já existia em lib/tempo.ts desde o croqui e que nenhum componente chamava: o prazo estava definido, faltava a cor."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-[0.74rem]">
            <Legenda cor="bg-vermelho" texto="Estourado (+4d)" />
            <Legenda cor="bg-timer-velho" texto="Perto (3–4d)" />
            <Legenda cor="bg-verde" texto="Dentro" />
          </div>
          <SeletorOrdem ordem={ordem} onChange={setOrdem} />
        </div>

        <div className="rounded-xl border border-linha bg-board p-3">
          <div className="mb-2.5 flex items-baseline gap-2 px-0.5">
            <span className="text-[0.82rem] font-semibold text-tinta">Qualificando</span>
            <span className="font-mono text-[0.72rem] tabular-nums text-mute">{cards.length}</span>
          </div>
          <DndContext>
            <div className="flex flex-col gap-2">
              {cards.map((c) => (
                <CartaoLead
                  key={c.lead_id}
                  card={c}
                  agora={agora}
                  selecionado={selecionado === c.lead_id}
                  onAbrir={(id) => setSelecionado((s) => (s === id ? null : id))}
                />
              ))}
            </div>
          </DndContext>
        </div>
        <p className="px-0.5 text-[0.76rem] leading-relaxed text-mute">
          O último card não tem última mensagem de propósito: a projeção real ainda não devolve
          esse campo, e o card some com a linha em vez de inventar um texto.
        </p>
      </div>
    </Bloco>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5 text-suave">
      <span className={cn("h-3 w-[3px] rounded-sm", cor)} aria-hidden />
      {texto}
    </span>
  );
}

/* ───────────────────────── 4 · botão gigante de audiometria ───────────────────────── */

function BlocoAudiometria() {
  return (
    <Bloco
      fala="A primeira coisa que deveria ter embaixo do nome é um botão gigante, audiometria, aquele V verdinho ou o X vermelho."
      porque="É o principal gate de tomada de decisão — a Sarah confirmou que agendar audiometria é a maior dificuldade dela com todo lead que chega. Sem saber isso ela não decide nada, e hoje precisa caçar a resposta em três lugares."
      onde="Drawer do lead em /funil, entre o nome e os fatos. Três estados, não dois: 'não sabemos' é o estado real da maioria dos leads e é o único que pede ação."
    >
      <Palco titulo="O topo do drawer do lead — clique no V ou no X">
        <div className="max-w-[440px] rounded-xl border border-borda bg-branco p-4">
          <div className="flex items-center gap-3.5 pb-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#3a4788] to-[#252F63] text-xl font-bold text-branco shadow-[0_4px_13px_rgba(37,47,99,0.25)]">
              AR
            </span>
            <div className="min-w-0">
              <div className="font-serif text-2xl font-semibold leading-tight text-navy">Antônio Ribeiro</div>
              <div className="mt-1 text-sm text-suave">78 anos</div>
            </div>
          </div>
          <BotaoAudiometria />
        </div>
        <div className="mt-4 max-w-[440px] space-y-2">
          <p className="text-[0.74rem] font-semibold text-mute">Os outros dois estados, já resolvidos:</p>
          <BotaoAudiometria inicial="nao_fez" quandoTexto="12/08 · marcado por Sarah" />
          <BotaoAudiometria inicial="fez" quandoTexto="09/08 · marcado por Fono Camila" />
        </div>
      </Palco>
    </Bloco>
  );
}
