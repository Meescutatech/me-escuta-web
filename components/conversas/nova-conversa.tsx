"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PlusIcon } from "lucide-react";
import type { Value } from "react-phone-number-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput, isPhoneComplete } from "@/components/ui/phone-input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { chaveCanonicaBR, formatarNacionalBR } from "@/lib/conversas/telefone";
import { abrirConversaEnsaio, procurarPorTelefoneEnsaio } from "@/app/(app)/conversas/ensaio-actions";
import type { LeadAchado } from "@/lib/ensaio/conversas-extra";
import type { CanalEnvioComposer } from "@/components/conversas/composer";

/**
 * NOVA CONVERSA POR NÚMERO (W-D3, 10/09) — o "+" da lista.
 *
 * Roubado do LiderHub `start-conversation-dialog.tsx`, e o comentário de lá vale aqui:
 *  · **Diálogo, não sheet** — subtarefa de dez segundos; um painel deslizaria por cima do fio
 *    aberto, que não tem nada a ver com a conversa que está para nascer.
 *  · **"Para" e "De"** — os dois campos são telefones; o vocabulário do e-mail todo mundo tem.
 *  · **O destinatário é um NÚMERO, não uma busca** — `PhoneInput` com país e DDD, e o lookup
 *    responde sozinho: já é de alguém → a conversa vai para a ficha dele; não é de ninguém → o
 *    lead nasce junto. A pessoa não escolhe entre os dois caminhos porque ela não tem a
 *    informação para escolher — o servidor tem.
 *  · **Um lugar só diz o que vai acontecer** — a linha grudada no botão, e o botão muda de nome.
 *  · **O modal NÃO manda a primeira mensagem** — abre o fio; o que escrever é do composer.
 *
 * O que é NOSSO: a busca compara COM E SEM o nono dígito (`lib/conversas/telefone.ts`) e diz
 * quando achou pela variante — o lead antigo do Kommo, gravado sem o 9, é o caso que dobra
 * cadastro na base real. E os canais do "De" são os mesmos do composer (R2/R4): só o que esta
 * pessoa pode usar, produção primeiro.
 */

/** "Oficial" para o WABA de produção; o primeiro segmento do apelido para os outros (Diogo, 23:10). */
function nomeCurto(c: CanalEnvioComposer | undefined): string | null {
  if (!c) return null;
  return c.producao ? "Oficial" : c.apelido.split(" · ")[0].trim() || c.apelido;
}

export function BotaoNovaConversa({ canais }: { canais: CanalEnvioComposer[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Nova conversa por número"
        aria-label="Nova conversa por número"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-mute transition-colors hover:bg-hover hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja/40"
      >
        <PlusIcon className="size-4" strokeWidth={2.2} />
      </button>
      <DialogoNovaConversa aberto={aberto} onFechar={() => setAberto(false)} canais={canais} />
    </>
  );
}

type Lookup =
  | { estado: "parado" }
  | { estado: "procurando" }
  | { estado: "erro" }
  | { estado: "pronto"; lead: LeadAchado | null };

export function DialogoNovaConversa({
  aberto,
  onFechar,
  canais,
}: {
  aberto: boolean;
  onFechar: () => void;
  canais: CanalEnvioComposer[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [telefone, setTelefone] = useState<Value | undefined>(undefined);
  const [nome, setNome] = useState("");
  const [canalId, setCanalId] = useState<string>(canais.find((c) => c.producao)?.id ?? canais[0]?.id ?? "");
  const [lookup, setLookup] = useState<Lookup>({ estado: "parado" });
  const [erroAbrir, setErroAbrir] = useState<string | null>(null);

  // o lookup dispara com o número COMPLETO para o país (não com `Boolean(value)` — o onChange
  // emite E.164 parcial a cada tecla); 250 ms de folga para não procurar a cada dígito.
  const completo = isPhoneComplete(telefone) || !!(telefone && chaveCanonicaBR(String(telefone)));
  const consulta = completo && telefone ? String(telefone) : "";
  useEffect(() => {
    if (!consulta) {
      setLookup({ estado: "parado" });
      return;
    }
    let vivo = true;
    setLookup({ estado: "procurando" });
    const t = setTimeout(() => {
      procurarPorTelefoneEnsaio(consulta)
        .then((r) => {
          if (!vivo) return;
          if (r.ok) setLookup({ estado: "pronto", lead: r.lead });
          else setLookup({ estado: "erro" });
        })
        .catch(() => vivo && setLookup({ estado: "erro" }));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [consulta]);

  function fechar() {
    setTelefone(undefined);
    setNome("");
    setLookup({ estado: "parado" });
    setErroAbrir(null);
    setCanalId(canais.find((c) => c.producao)?.id ?? canais[0]?.id ?? "");
    onFechar();
  }

  const lead = lookup.estado === "pronto" ? lookup.lead : null;
  const temDestinatario = lookup.estado === "pronto";
  const precisaNome = temDestinatario && !lead;
  const existente = lead?.conversas.find((c) => c.canal_id === canalId) ?? null;
  const podeAbrir = temDestinatario && !!canalId && (!precisaNome || nome.trim().length > 0) && !pending;

  // A linha acima do botão: o que FALTA, ou o que o clique faz. Mesma ordem do `podeAbrir`.
  const desfecho = pending
    ? null
    : !completo
      ? "Escolha o país e digite o número com DDD."
      : lookup.estado === "procurando"
        ? "Verificando se este número já está cadastrado…"
        : lookup.estado === "erro"
          ? "Não foi possível verificar o número. Tente de novo."
          : !canalId
            ? "Escolha por qual número da empresa a conversa sai."
            : precisaNome && !nome.trim()
              ? "Digite o nome de quem vai ser cadastrado."
              : existente
                ? `Já existe conversa com ${lead!.nome.split(" ")[0]} por este número — é ela que abre.`
                : lead
                  ? `Abre um fio novo com ${lead.nome.split(" ")[0]} por ${nomeCurto(canais.find((c) => c.id === canalId)) ?? "este número"}.`
                  : "O lead entra no funil como Novo lead, e a conversa abre sem mensagem — quem escreve é você.";

  function abrir() {
    if (!podeAbrir || !telefone) return;
    setErroAbrir(null);
    startTransition(async () => {
      const r = await abrirConversaEnsaio({ telefone: String(telefone), nome: nome.trim() || null, canalId, leadId: lead?.lead_id ?? null });
      if (!r.ok) {
        setErroAbrir(r.motivo);
        return;
      }
      fechar();
      router.push(`/conversas?c=${r.conversaId}`);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>Digite o número do cliente e escolha por onde falar com ele.</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="nova-conversa-telefone" className="text-ui-12 text-muted-foreground">
              Para
            </Label>
            <PhoneInput id="nova-conversa-telefone" value={telefone} onChange={setTelefone} disabled={pending} autoFocus placeholder="(31) 99999-9999" />
            <Destinatario lookup={lookup} digitado={telefone ? String(telefone) : ""} />
          </section>

          <div aria-live="polite" className="contents">
            {precisaNome && (
              <section className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="nova-conversa-nome" className="text-ui-12 text-muted-foreground">
                  Nome
                </Label>
                <Input
                  id="nova-conversa-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Como o cliente se apresentou"
                  autoComplete="off"
                  disabled={pending}
                />
              </section>
            )}
          </div>

          <section className={cn("flex min-w-0 flex-col gap-1.5 transition-opacity", !temDestinatario && "pointer-events-none [&>*:not(label)]:opacity-50")}>
            <Label className="text-ui-12 text-muted-foreground">De</Label>
            <div role="radiogroup" aria-label="Número da empresa por onde a conversa sai" className="overflow-hidden rounded-lg border border-border">
              {canais.map((c, i) => {
                const marcado = c.id === canalId;
                const jaFalamos = !!lead?.conversas.some((x) => x.canal_id === c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={marcado}
                    onClick={() => setCanalId(c.id)}
                    disabled={pending}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60",
                      i > 0 && "border-t border-border",
                      marcado && "bg-primary/[0.04]",
                    )}
                  >
                    <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", marcado ? "border-navy bg-navy text-branco" : "border-linha-forte bg-branco")} aria-hidden>
                      {marcado && <CheckIcon className="size-2.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-ui-13 font-medium text-foreground">{nomeCurto(c)}</span>
                        {c.producao && <span className="rounded-full bg-verde-bg px-1.5 py-px text-[10px] font-semibold text-verde">produção</span>}
                        {c.proprio && <span className="rounded-full bg-azul-bg px-1.5 py-px text-[10px] font-semibold text-azul">seu</span>}
                      </span>
                      <span className="block truncate font-mono text-[11px] tabular-nums text-muted-foreground">{c.numero}</span>
                    </span>
                    {jaFalamos && <span className="shrink-0 text-[11px] text-suave">já falamos por aqui</span>}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {(desfecho || erroAbrir) && (
          <p aria-live="polite" className={cn("text-ui-12", erroAbrir ? "text-vermelho" : "text-muted-foreground")}>
            {erroAbrir ?? desfecho}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={fechar} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={abrir} disabled={!podeAbrir} loading={pending}>
            {existente ? "Abrir a conversa existente" : "Abrir conversa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Quem é o dono do número — ou que ninguém é. A frase muda quando achou pelo 9 que faltava. */
function Destinatario({ lookup, digitado }: { lookup: Lookup; digitado: string }) {
  if (lookup.estado === "parado") return null;
  if (lookup.estado === "procurando") {
    return (
      <span className="inline-flex items-center gap-1.5 text-ui-12 text-muted-foreground">
        <Spinner className="size-3" /> Conferindo o histórico…
      </span>
    );
  }
  if (lookup.estado === "erro") return null;
  const lead = lookup.lead;
  if (!lead) {
    return <span className="text-ui-12 text-muted-foreground">Ninguém tem este número — vai cadastrar um lead novo.</span>;
  }
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy text-[0.66rem] font-semibold text-branco">
        {lead.nome
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0])
          .join("")
          .toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui-13 font-medium text-foreground">{lead.nome}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {lead.etapa_nome}
          {lead.kommo_lead_id ? ` · #${lead.kommo_lead_id}` : ""}
          {lead.pela_variante ? ` · gravado como ${formatarNacionalBR(lead.telefone)}, sem o 9` : ""}
        </span>
      </span>
      <span className="sr-only">Número digitado {formatarNacionalBR(digitado)}</span>
    </div>
  );
}
