"use client";

import { useMemo, useState } from "react";
import { MoreHorizontalIcon, PlusIcon, RefreshCwIcon, SearchIcon, UserIcon, UsersIcon, Building2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormItemLayout } from "@/components/ui/form-item-layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { AprovacaoMeta, MensagemPronta } from "@/lib/ensaio/fixtures/operacao";
import { haQuantoTempo } from "@/lib/ensaio/fixtures/membros";
import { CascaConfig } from "./casca-config";

/**
 * /configuracoes/templates (ensaio) — MENSAGENS PRONTAS: respostas rápidas (o `/atalho` do
 * composer) e, quando pedem aprovação na Meta, templates HSM que saem fora da janela de 24 h.
 * Um texto, um lugar (LiderHub `quick-answers-settings.tsx` + `message-card.tsx`).
 *
 * O card responde três coisas: como se chama e qual o atalho; QUEM vê no chat (só eu · o
 * departamento · todo mundo); e se vale FORA da janela (Aprovado na Meta) ou só dentro (Só na
 * janela de 24 h) — com o alerta "texto mudou desde a aprovação", que é o modo de falha silencioso
 * desta tela. Editor em sheet: formulário à esquerda… aqui, em coluna, com prévia da bolha.
 */

const APROVACAO: Record<AprovacaoMeta, { rotulo: string; variante: "success" | "warning" | "muted" | "info" | "destructive"; dica: string }> = {
  aprovada: { rotulo: "Aprovado na Meta", variante: "success", dica: "Sai também fora da janela de 24 h." },
  em_analise: { rotulo: "Em análise na Meta", variante: "info", dica: "Você é avisado quando o resultado sair. Até lá, só dentro da janela." },
  rejeitada: { rotulo: "Rejeitado pela Meta", variante: "destructive", dica: "Ajuste o texto e peça de novo." },
  texto_mudou: { rotulo: "Texto mudou desde a aprovação", variante: "warning", dica: "O que sai fora da janela é o texto ANTIGO. Peça aprovação de novo para alinhar." },
  nao_pedida: { rotulo: "Só na janela de 24 h", variante: "muted", dica: "Vale só dentro da janela. Abra e ligue a aprovação da Meta para poder enviar fora dela." },
};

const QUEM_VE: Record<MensagemPronta["quemVe"], { rotulo: string; Icone: typeof UserIcon }> = {
  eu: { rotulo: "Só eu", Icone: UserIcon },
  departamento: { rotulo: "Departamento", Icone: UsersIcon },
  todos: { rotulo: "Todo mundo", Icone: Building2Icon },
};

type Filtro = "todas" | "aprovadas" | "janela";

export function MensagensProntasEnsaio({ mensagens: iniciais, gestao, agoraIso, eu }: { mensagens: MensagemPronta[]; gestao: boolean; agoraIso: string; eu: string }) {
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [mensagens, setMensagens] = useState(iniciais);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [editando, setEditando] = useState<MensagemPronta | "nova" | null>(null);

  const termo = busca.trim().toLowerCase();
  const visiveis = mensagens.filter((m) => {
    if (filtro === "aprovadas" && m.aprovacao !== "aprovada") return false;
    if (filtro === "janela" && m.aprovacao === "aprovada") return false;
    if (!termo) return true;
    return m.titulo.toLowerCase().includes(termo) || m.atalho.toLowerCase().includes(termo) || m.corpo.toLowerCase().includes(termo);
  });

  const remover = (m: MensagemPronta) => {
    setMensagens((xs) => xs.filter((x) => x.id !== m.id));
    toast("Mensagem removida.", { description: "Quem já usou continua com o texto nas conversas." });
  };

  return (
    <CascaConfig
      largo
      titulo="Templates e respostas rápidas"
      descricao="Um texto, um lugar. Ele fica no chat por atalho (/oi, /lembrete) e, quando registrado na Meta, também sai fora da janela de 24 h."
      acao={
        <>
          {gestao && (
            <Button variant="outline" onClick={() => toast.success("Sincronizado com a Meta.", { description: "6 templates conferidos; nenhum mudou de estado." })}>
              <RefreshCwIcon data-icon="inline-start" />
              Sincronizar com a Meta
            </Button>
          )}
          <Button onClick={() => setEditando("nova")}>
            <PlusIcon data-icon="inline-start" />
            Nova mensagem
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título, atalho ou texto" className="pl-8" aria-label="Buscar mensagem pronta" />
        </label>
        <div role="radiogroup" aria-label="Filtrar" className="inline-flex rounded-md border border-border p-0.5 text-[12.5px]">
          {(
            [
              ["todas", "Todas"],
              ["aprovadas", "Aprovadas na Meta"],
              ["janela", "Só na janela"],
            ] as Array<[Filtro, string]>
          ).map(([v, r]) => (
            <button key={v} type="button" role="radio" aria-checked={filtro === v} onClick={() => setFiltro(v)} className={cn("rounded-[5px] px-2.5 py-1", filtro === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {r}
            </button>
          ))}
        </div>
        <span className="ml-auto text-ui-12 tabular-nums text-muted-foreground">
          {visiveis.length} de {mensagens.length}
        </span>
      </div>

      {mensagens.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-foreground">Escreva a primeira mensagem pronta</p>
          <p className="mx-auto mt-1.5 max-w-[460px] text-ui-13 leading-relaxed text-muted-foreground">
            Digite uma vez e reuse no atendimento: no chat, /atalho insere o texto inteiro, já com o nome do cliente no lugar. Depois, se precisar falar fora da janela de 24 h, é só pedir aprovação da Meta.
          </p>
          <Button className="mt-5" onClick={() => setEditando("nova")}>
            Escrever a primeira
          </Button>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
          <p className="text-[14px] font-medium text-foreground">Nenhuma mensagem combina com a busca e o filtro</p>
          <p className="mt-1 text-ui-13 text-muted-foreground">Tente outro termo ou volte para "Todas".</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visiveis.map((m) => {
            const ap = APROVACAO[m.aprovacao];
            const qv = QUEM_VE[m.quemVe];
            return (
              <article key={m.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-[15px] font-semibold text-foreground">{m.titulo}</h2>
                      <code className="rounded bg-muted px-1.5 py-px font-mono text-[12px] text-foreground">/{m.atalho}</code>
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-[13.5px] leading-relaxed text-muted-foreground">{m.corpo}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${m.titulo}`} />}>
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditando(m)}>Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast("Em breve: duplicar.")}>Duplicar</DropdownMenuItem>
                      {m.aprovacao !== "aprovada" && m.aprovacao !== "em_analise" && (
                        <DropdownMenuItem onClick={() => { setMensagens((xs) => xs.map((x) => (x.id === m.id ? { ...x, aprovacao: "em_analise" } : x))); toast.success("Enviada para aprovação na Meta.", { description: "Você é avisado quando o resultado sair." }); }}>
                          Pedir aprovação na Meta
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => remover(m)}>Remover</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                  <Badge variant={ap.variante} size="sm" title={ap.dica}>
                    {ap.rotulo}
                  </Badge>
                  <Badge variant="outline" size="sm" className="bg-card">
                    <qv.Icone className="size-3" /> {qv.rotulo}
                  </Badge>
                  <span className="ml-auto text-ui-12 tabular-nums text-muted-foreground">
                    {m.usos_30d} usos · 30 d · {m.autor.split(" ")[0]} · {haQuantoTempo(m.atualizado_em, agora)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <EditorMensagem
        alvo={editando}
        eu={eu}
        onFechar={() => setEditando(null)}
        onSalvar={(m, pedirAprovacao) => {
          setMensagens((xs) => (xs.some((x) => x.id === m.id) ? xs.map((x) => (x.id === m.id ? m : x)) : [m, ...xs]));
          setEditando(null);
          toast.success(pedirAprovacao ? "Mensagem salva e enviada para aprovação." : editando === "nova" ? "Mensagem criada." : "Mensagem atualizada.", {
            description: pedirAprovacao ? "Você é avisado quando o resultado sair." : "Já está no chat por /" + m.atalho + ".",
          });
        }}
      />
    </CascaConfig>
  );
}

function EditorMensagem({ alvo, eu, onFechar, onSalvar }: { alvo: MensagemPronta | "nova" | null; eu: string; onFechar: () => void; onSalvar: (m: MensagemPronta, pedirAprovacao: boolean) => void }) {
  const base: MensagemPronta = alvo && alvo !== "nova" ? alvo : { id: `tpl-${Date.now()}`, titulo: "", atalho: "", corpo: "", quemVe: "departamento", departamento: "pre_venda", aprovacao: "nao_pedida", usos_30d: 0, atualizado_em: new Date().toISOString(), autor: eu };
  const [m, setM] = useState<MensagemPronta>(base);
  const [pedir, setPedir] = useState(base.aprovacao === "aprovada" || base.aprovacao === "em_analise");
  const [chaveAlvo, setChaveAlvo] = useState<string | null>(alvo === "nova" ? "nova" : alvo?.id ?? null);
  // reabrir com outro alvo reseta o formulário
  const alvoId = alvo === "nova" ? "nova" : alvo?.id ?? null;
  if (alvoId !== chaveAlvo) {
    setChaveAlvo(alvoId);
    setM(base);
    setPedir(base.aprovacao === "aprovada" || base.aprovacao === "em_analise");
  }

  const variaveis = Array.from(m.corpo.matchAll(/\{\{(\w+)\}\}/g)).map((x) => x[1]);
  const pronto = m.titulo.trim() && m.atalho.trim() && m.corpo.trim();
  const previa = m.corpo.replace(/\{\{nome\}\}/g, "Maria").replace(/\{\{atendente\}\}/g, "a Sara").replace(/\{\{hora\}\}/g, "14h").replace(/\{\{fono\}\}/g, "Ana Paula").replace(/\{\{data\}\}/g, "13/09").replace(/\{\{link\}\}/g, "pag.me/x1").replace(/\{\{(\w+)\}\}/g, "[$1]");

  return (
    <Sheet open={!!alvo} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>{alvo === "nova" ? "Nova mensagem pronta" : "Editar mensagem"}</SheetTitle>
          <SheetDescription>Escreva uma vez. Ela já fica no chat por atalho; pedir aprovação na Meta é o que permite enviá-la fora da janela de 24 h.</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <FormItemLayout label="Título" htmlFor="mp-titulo" required>
              <Input id="mp-titulo" value={m.titulo} onChange={(e) => setM({ ...m, titulo: e.target.value })} placeholder="Ex.: Lembrete de avaliação" />
            </FormItemLayout>
            <FormItemLayout label="Atalho" htmlFor="mp-atalho" required>
              <div className="flex items-center rounded-lg border border-input bg-background pl-2.5">
                <span className="text-muted-foreground">/</span>
                <Input id="mp-atalho" value={m.atalho} onChange={(e) => setM({ ...m, atalho: e.target.value.replace(/\s+/g, "").toLowerCase() })} className="border-0 pl-0.5 shadow-none focus-visible:ring-0" placeholder="lembrete" />
              </div>
            </FormItemLayout>
          </div>
          <FormItemLayout label="Texto" htmlFor="mp-corpo" required description="Use {{nome}}, {{atendente}}, {{hora}}… o chat troca pelo valor na hora.">
            <Textarea id="mp-corpo" value={m.corpo} onChange={(e) => setM({ ...m, corpo: e.target.value })} rows={5} placeholder="Olá, {{nome}}! …" />
            {variaveis.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {Array.from(new Set(variaveis)).map((v) => (
                  <code key={v} className="rounded bg-muted px-1.5 py-px font-mono text-[11.5px] text-foreground">{`{{${v}}}`}</code>
                ))}
              </div>
            )}
          </FormItemLayout>
          <FormItemLayout label="Quem vê no chat" htmlFor="mp-quem">
            <Select value={m.quemVe} onValueChange={(v) => setM({ ...m, quemVe: v as MensagemPronta["quemVe"] })}>
              <SelectTrigger id="mp-quem" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eu">Só eu</SelectItem>
                <SelectItem value="departamento">Meu departamento</SelectItem>
                <SelectItem value="todos">Todo mundo</SelectItem>
              </SelectContent>
            </Select>
          </FormItemLayout>

          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[14px] font-medium text-foreground">Pedir aprovação na Meta</div>
                <div className="text-ui-12 text-muted-foreground">Registra como template (HSM). Aprovado, sai também fora da janela de 24 h. Leva de minutos a 1 dia.</div>
              </div>
              <Switch checked={pedir} onCheckedChange={(v) => setPedir(!!v)} aria-label="Pedir aprovação na Meta" />
            </div>
            {pedir && (
              <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                <FormItemLayout label="Categoria" htmlFor="mp-cat">
                  <Select value={m.categoria_meta ?? "UTILITY"} onValueChange={(v) => setM({ ...m, categoria_meta: v as MensagemPronta["categoria_meta"] })}>
                    <SelectTrigger id="mp-cat" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTILITY">Utilidade (lembrete, confirmação)</SelectItem>
                      <SelectItem value="MARKETING">Marketing (retomada, oferta)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItemLayout>
                <div className="text-ui-12 leading-relaxed text-muted-foreground sm:pt-6">Marketing custa mais por envio e a Meta é mais rígida. Lembrete e confirmação são Utilidade.</div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 text-ui-11 font-semibold uppercase tracking-[0.08em] text-muted-foreground">Prévia no WhatsApp</div>
            <div className="rounded-xl bg-[#efe7dd] p-4">
              <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-[13px] rounded-br-[5px] bg-[#d9fdd3] px-3.5 py-2.5 text-[0.88rem] leading-relaxed text-tinta shadow-sm">
                {previa || <span className="italic text-mute">o texto aparece aqui</span>}
                <div className="mt-1 text-right text-[0.66rem] text-mute">14:32 ✓✓</div>
              </div>
            </div>
          </div>
        </SheetBody>
        <SheetFooter className="border-t border-border sm:justify-between">
          <span className="text-ui-12 text-muted-foreground">{pronto ? "Tudo certo · 3 de 3" : `Falta: ${[!m.titulo.trim() && "título", !m.atalho.trim() && "atalho", !m.corpo.trim() && "texto"].filter(Boolean).join(", ")}`}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button disabled={!pronto} onClick={() => onSalvar({ ...m, aprovacao: pedir ? (m.aprovacao === "aprovada" ? "aprovada" : "em_analise") : "nao_pedida", atualizado_em: new Date().toISOString() }, pedir && m.aprovacao !== "aprovada")}>
              {pedir && m.aprovacao !== "aprovada" ? "Salvar e pedir aprovação" : "Salvar"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
