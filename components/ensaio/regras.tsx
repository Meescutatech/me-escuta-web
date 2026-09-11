"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { CascaConfig } from "./casca-config";

/**
 * /configuracoes/regras (ensaio) — as REGRAS DE TEMPO da operação, todas em um lugar: prazo por
 * etapa (SLA do funil), a janela de 24 h do WhatsApp, o horário em que a Clara responde sozinha
 * e a régua de cobrança. Cada bloco diz de onde a regra vem (config publicada × padrão do
 * sistema) — padrão silencioso faria o rótulo do card mentir (lição do funil).
 */

interface Regra {
  chave: string;
  titulo: string;
  frase: string;
  origem: "config" | "padrao";
  linhas: Array<{ rotulo: string; valor: string }>;
}

const REGRAS: Regra[] = [
  {
    chave: "sla_etapas",
    titulo: "Prazo por etapa",
    frase: "Quanto tempo um lead pode ficar parado em cada etapa antes de o card ficar âmbar e depois vermelho.",
    origem: "padrao",
    linhas: [
      { rotulo: "Novo lead", valor: "2 h · sem primeira resposta vira vermelho" },
      { rotulo: "Qualificando", valor: "3 dias" },
      { rotulo: "Avaliação auditiva", valor: "7 dias" },
      { rotulo: "Proposta enviada", valor: "5 dias" },
      { rotulo: "Negociação", valor: "5 dias" },
    ],
  },
  {
    chave: "janela_24h",
    titulo: "Janela de 24 h do WhatsApp",
    frase: "Depois de 24 h sem mensagem do cliente, o número oficial só envia template aprovado. O composer avisa antes.",
    origem: "padrao",
    linhas: [
      { rotulo: "Vale para", valor: "números oficiais (Cloud API)" },
      { rotulo: "Lite", valor: "sem janela — é celular" },
      { rotulo: "Template de reabertura", valor: "\"lembrete_avaliacao\" · aprovado" },
    ],
  },
  {
    chave: "horario_clara",
    titulo: "Quando a Clara responde sozinha",
    frase: "Fora deste horário ela acolhe, diz quando a equipe volta e não qualifica.",
    origem: "config",
    linhas: [
      { rotulo: "Segunda a sexta", valor: "08:00 – 19:00" },
      { rotulo: "Sábado", valor: "08:00 – 12:00" },
      { rotulo: "Fora do horário", valor: "mensagem de acolhimento + retomada às 08:00" },
    ],
  },
  {
    chave: "regua_cobranca",
    titulo: "Régua de cobrança",
    frase: "O que a Priscila propõe, e quando. Cada contato é uma mensagem só.",
    origem: "config",
    linhas: [
      { rotulo: "Antes do vencimento", valor: "3 dias · lembrete" },
      { rotulo: "No dia", valor: "aviso com link de pagamento" },
      { rotulo: "Atraso", valor: "5, 15 e 30 dias" },
      { rotulo: "Pausa", valor: "doença, luto ou sem renda → gestora de Cobrança" },
    ],
  },
];

export function RegrasEnsaio({ gestao }: { gestao: boolean }) {
  return (
    <CascaConfig
      largo
      titulo="Regras e SLAs"
      descricao="As regras de tempo da operação: prazo por etapa, janela de 24 h, horário em que a Clara responde sozinha e a régua de cobrança. Tudo é configuração — mudar aqui vale na próxima decisão, sem deploy."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {REGRAS.map((r) => (
          <article key={r.chave} className="flex flex-col rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15.5px] font-semibold text-foreground">{r.titulo}</h2>
                <p className="mt-1 text-ui-13 leading-relaxed text-muted-foreground">{r.frase}</p>
              </div>
              <Badge variant={r.origem === "config" ? "success" : "outline"} size="sm" className="shrink-0">
                {r.origem === "config" ? "publicada" : "padrão do sistema"}
              </Badge>
            </div>
            <dl className="mt-4 flex flex-col divide-y divide-border border-t border-border">
              {r.linhas.map((l) => (
                <div key={l.rotulo} className="grid grid-cols-[150px_1fr] gap-3 py-2 text-[14px]">
                  <dt className="text-muted-foreground">{l.rotulo}</dt>
                  <dd className={cn("text-foreground")}>{l.valor}</dd>
                </div>
              ))}
            </dl>
            {gestao && (
              <div className="mt-4 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => toast(`Em breve: editar ${r.titulo.toLowerCase()}.`, { description: "Hoje se edita em Auditoria e histórico." })}>
                  Editar
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
    </CascaConfig>
  );
}
