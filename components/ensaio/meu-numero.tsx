"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CheckIcon, RefreshCwIcon, SmartphoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormItemLayout } from "@/components/ui/form-item-layout";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { PessoaEnsaio } from "@/lib/ensaio/modo";
import type { CanalEnsaio } from "@/lib/ensaio/fixtures/canais";
import { formatarE164 } from "@/lib/ensaio/fixtures/canais";
import { CascaConfig } from "./casca-config";

/**
 * /configuracoes/canais/meu-numero (ensaio) — a fono conecta o próprio celular, sem deploy (R6).
 *
 * Quatro passos, um por vez, na ordem em que a pessoa vive: (1) dá um nome ao número → (2) lê o QR
 * no celular, com o relógio de 60 s do WhatsApp e "gerar novo" quando vence → (3) "pareando…" →
 * (4) conectado, e o botão LIGAR é dela (R1 estendida: `canal_ativado` no próprio `lite:%`).
 * Depois de ligado, a tela vira o estado de repouso: "seu número está no ar".
 *
 * A máquina de fases é a do LiderHub (`use-waha-session.ts`: form → starting → scan → expired →
 * pairing → connected), sem o ramo de código por telefone — o WuzAPI não expõe pareamento por
 * código, então oferecer o botão seria prometer o que não existe.
 *
 * O que acontece por trás em cada passo (o contrato, para o Diogo conferir):
 *  1 → `canal_registrado` (departamento = o da fono, `responsavel_id` = ela) + consentimento
 *  2 → `POST /lite/instancia/<canal>` (cria o usuário no WuzAPI) + `POST /lite/sessao/<canal>` (QR)
 *  3 → o runtime vê o pareamento e grava `canal_pareado`
 *  4 → botão Ligar = `canal_ativado`. Nível nasce `estrito`.
 */

type Fase = "nome" | "iniciando" | "qr" | "expirado" | "pareando" | "conectado" | "no_ar";

const QR_TTL_S = 60;

export function MeuNumeroEnsaio({
  eu,
  meuCanal,
  departamentoRotulo,
  reconectar,
}: {
  eu: PessoaEnsaio;
  meuCanal: CanalEnsaio | null;
  departamentoRotulo: string;
  reconectar: boolean;
}) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>(meuCanal && !reconectar ? "no_ar" : "nome");
  const [nome, setNome] = useState(meuCanal?.apelido ?? `${eu.nome.split(" ")[0]} · ${departamentoRotulo.toLowerCase()}`);
  const [segundos, setSegundos] = useState(QR_TTL_S);
  const [qrVersao, setQrVersao] = useState(1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararRelogio = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const gerarQr = useCallback(() => {
    pararRelogio();
    setFase("iniciando");
    setTimeout(() => {
      setQrVersao((v) => v + 1);
      setSegundos(QR_TTL_S);
      setFase("qr");
    }, 900);
  }, []);

  useEffect(() => {
    if (fase !== "qr") return;
    timer.current = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) {
          pararRelogio();
          setFase("expirado");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return pararRelogio;
  }, [fase, qrVersao]);

  // ensaio: simula a leitura do QR no celular depois de ~12 s
  useEffect(() => {
    if (fase !== "qr") return;
    const t = setTimeout(() => {
      pararRelogio();
      setFase("pareando");
      setTimeout(() => setFase("conectado"), 2200);
    }, 12_000);
    return () => clearTimeout(t);
  }, [fase, qrVersao]);

  const ligar = () => {
    setFase("no_ar");
    toast.success("Seu número está no ar.", { description: "As mensagens que chegarem nele aparecem na sua caixa de entrada." });
  };

  const numeroExibido = meuCanal ? formatarE164(meuCanal.numero_e164) : "+55 31 9 •••• ••••";
  const passo = fase === "nome" ? 1 : fase === "iniciando" || fase === "qr" || fase === "expirado" ? 2 : fase === "pareando" ? 3 : 4;

  return (
    <CascaConfig
      titulo={fase === "no_ar" ? "Seu número" : "Conectar meu número"}
      descricao={
        fase === "no_ar"
          ? "Este é o celular pelo qual você atende. Ele fica pareado até você desparear aqui ou no WhatsApp."
          : "Leva um minuto: você dá um nome, lê um QR no celular e liga. Só você responde por este número."
      }
      acao={
        <Button variant="ghost" size="sm" render={<Link href="/configuracoes/canais" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Números
        </Button>
      }
    >
      {fase !== "no_ar" && <Passos atual={passo} />}

      <div className="rounded-xl border border-border bg-card p-6">
        {fase === "nome" && (
          <div className="flex flex-col gap-5">
            <FormItemLayout
              label="Nome do número"
              htmlFor="meu-numero-nome"
              required
              description="Como ele aparece na lista de números e no composer. Curto: seu nome e o departamento bastam."
            >
              <Input id="meu-numero-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
            </FormItemLayout>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-ui-13">
              <dt className="text-muted-foreground">Departamento</dt>
              <dd className="text-foreground">{departamentoRotulo}</dd>
              <dt className="text-muted-foreground">Dona</dt>
              <dd className="text-foreground">{eu.nome} (você)</dd>
              <dt className="text-muted-foreground">Quem responde</dt>
              <dd className="text-foreground">Só você — a gestão pode abrir depois.</dd>
            </dl>
            <p className="text-ui-12 leading-relaxed text-muted-foreground">
              Ao continuar você autoriza a Me Escuta a receber e guardar as mensagens deste número enquanto ele estiver ligado.
            </p>
            <div className="flex justify-end">
              <Button onClick={gerarQr} disabled={!nome.trim()}>
                Continuar
              </Button>
            </div>
          </div>
        )}

        {(fase === "iniciando" || fase === "qr" || fase === "expirado") && (
          <div className="grid gap-8 md:grid-cols-[256px_1fr]">
            <div className="relative mx-auto">
              <div
                className={cn(
                  "relative size-64 overflow-hidden rounded-xl border border-border bg-white p-3",
                  fase !== "qr" && "opacity-40",
                )}
              >
                {fase === "iniciando" ? (
                  <div className="grid h-full place-items-center">
                    <Spinner />
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={qrVersao} src={`/ensaio/qr.svg?v=${qrVersao}`} alt="QR Code para parear o WhatsApp" className="size-full" />
                )}
              </div>
              {fase === "expirado" && (
                <div className="absolute inset-0 grid place-items-center">
                  <Button onClick={gerarQr}>
                    <RefreshCwIcon data-icon="inline-start" />
                    Gerar novo código
                  </Button>
                </div>
              )}
              <div className="mt-2 text-center text-ui-12 tabular-nums text-muted-foreground" aria-live="polite">
                {fase === "iniciando" && "preparando o código…"}
                {fase === "qr" && `o código vence em ${String(Math.floor(segundos / 60)).padStart(1, "0")}:${String(segundos % 60).padStart(2, "0")}`}
                {fase === "expirado" && "o código venceu — o WhatsApp troca a cada minuto"}
              </div>
            </div>
            <div>
              <h2 className="text-ui-14 font-semibold text-foreground">Leia o código no seu celular</h2>
              <ol className="mt-3 flex flex-col gap-3">
                {[
                  "Abra o WhatsApp no seu celular",
                  "Toque em Configurações › Dispositivos conectados",
                  "Toque em Conectar dispositivo e aponte para esta tela",
                ].map((t, i) => (
                  <li key={t} className="flex items-start gap-3 text-ui-13 text-foreground">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-ui-11 font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    {t}
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-ui-12 leading-relaxed text-muted-foreground">
                Nome: <span className="text-foreground">{nome}</span> · Departamento: <span className="text-foreground">{departamentoRotulo}</span>.
                O celular pode continuar sendo usado normalmente — o pareamento não tira o WhatsApp dele.
              </p>
              <div className="mt-5 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setFase("nome")}>
                  Voltar
                </Button>
                {fase === "qr" && (
                  <Button variant="ghost" size="sm" onClick={gerarQr}>
                    <RefreshCwIcon data-icon="inline-start" />
                    Gerar outro
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {fase === "pareando" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Spinner className="size-6" />
            <p className="text-ui-14 font-medium text-foreground">Pareando com o seu celular…</p>
            <p className="max-w-[320px] text-ui-12 text-muted-foreground">
              O WhatsApp está confirmando o dispositivo. Costuma levar alguns segundos; não feche esta tela.
            </p>
          </div>
        )}

        {fase === "conectado" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-success-tint text-success-ink">
              <CheckIcon className="size-6" />
            </span>
            <div>
              <p className="text-h3 font-semibold text-foreground">Celular pareado</p>
              <p className="mt-1.5 max-w-[360px] text-ui-13 text-muted-foreground">
                <span className="font-medium text-foreground">{nome}</span> · {numeroExibido}. Falta ligar: só depois disso as mensagens
                começam a entrar na sua caixa.
              </p>
            </div>
            <Button size="lg" onClick={ligar}>
              Ligar o número
            </Button>
            <button className="text-ui-12 text-muted-foreground underline-offset-4 hover:underline" onClick={() => router.push("/configuracoes/canais")}>
              Deixar desligado por enquanto
            </button>
          </div>
        )}

        {fase === "no_ar" && (
          <div className="flex items-center gap-5">
            <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-success-tint text-success-ink">
              <SmartphoneIcon className="size-5" />
              <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-card bg-success-ink" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-ui-14 font-semibold text-foreground">Seu número está no ar</p>
              <p className="mt-0.5 text-ui-13 text-muted-foreground">
                <span className="text-foreground">{nome}</span> · <span className="font-mono tabular-nums">{numeroExibido}</span> · {departamentoRotulo} · só você responde
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" render={<Link href="/conversas" />}>
                Abrir conversas
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setFase("nome"); toast("Vamos gerar um QR novo. O anterior deixa de valer."); }}>
                Reconectar
              </Button>
            </div>
          </div>
        )}
      </div>
    </CascaConfig>
  );
}

function Passos({ atual }: { atual: 1 | 2 | 3 | 4 }) {
  const passos = ["Nome", "QR no celular", "Pareando", "Ligar"];
  return (
    <ol className="flex items-center gap-2 text-ui-12" aria-label="Passos">
      {passos.map((p, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const feito = n < atual;
        const agora = n === atual;
        return (
          <li key={p} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full text-ui-11 font-semibold",
                feito ? "bg-success-ink text-success-foreground" : agora ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              )}
              aria-current={agora ? "step" : undefined}
            >
              {feito ? <CheckIcon className="size-3" /> : n}
            </span>
            <span className={cn(agora ? "font-medium text-foreground" : "text-muted-foreground")}>{p}</span>
            {i < passos.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
