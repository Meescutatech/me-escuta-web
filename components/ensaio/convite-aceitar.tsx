"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormItemLayout } from "@/components/ui/form-item-layout";
import { Marca } from "@/components/ui/marca";
import { cn } from "@/lib/utils";
import { rotuloPapel } from "@/lib/membros";
import type { Departamento } from "@/lib/departamentos/escopo";
import { expiraEm, type ConviteEnsaio } from "@/lib/ensaio/fixtures/membros";

/**
 * /convite/aceitar (ensaio) — a PRIMEIRA tela que toda pessoa da equipe vê.
 *
 * Uma frase diz para quem é e o que ela vira ("gestora de Pré-venda"); dois campos (nome, senha);
 * um botão. Nada de e-mail para confirmar: o link é a credencial (Twenty, `workspace-invitation
 * .service.ts`) e a V1 do contrato manda o link pelo WhatsApp, não por e-mail.
 *
 * O que muda em relação à página real: o convite chega com `departamentos` (R5), então a tela
 * consegue dizer "você entra em Pré-venda" — e diz o que isso significa, em uma linha, para a
 * pessoa não entrar sem saber o que vai ver.
 */

type Resultado = { estado: "valido"; convite: ConviteEnsaio } | { estado: "expirado" };

export function AceitarConviteEnsaio({
  resultado,
  convidadoPor,
  departamentos,
  agoraIso,
}: {
  resultado: Resultado;
  convidadoPor: string | null;
  departamentos: Departamento[];
  agoraIso: string;
}) {
  const router = useRouter();
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [nome, setNome] = useState(resultado.estado === "valido" ? resultado.convite.nome ?? "" : "");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const [entrou, setEntrou] = useState(false);

  const rotuloDep = (chave: string) => departamentos.find((d) => d.chave === chave)?.rotulo ?? chave;

  const papelFrase = (c: ConviteEnsaio): { forte: string; fraco: string } => {
    if (c.papel === "marketing") return { forte: "Marketing", fraco: "Você vê a captação e os relatórios de mídia." };
    if (c.papel === "admin") return { forte: "Admin", fraco: "Você vê e configura tudo: funil, números, agentes e a equipe." };
    if (c.departamentos.length === 0) return { forte: "Membro", fraco: "Você atende os leads e conversas da operação." };
    const partes = c.departamentos.map((d) =>
      d.papel_no_departamento === "gestor" ? `gestora de ${rotuloDep(d.departamento)}` : `membro de ${rotuloDep(d.departamento)}`,
    );
    const gestora = c.departamentos.some((d) => d.papel_no_departamento === "gestor");
    return {
      forte: partes.join(" e "),
      fraco: gestora
        ? `Você vê os leads e conversas de ${c.departamentos.map((d) => rotuloDep(d.departamento)).join(", ")} e recebe as tarefas do Jarvis que ainda não têm dono.`
        : `Você vê os leads e conversas de ${c.departamentos.map((d) => rotuloDep(d.departamento)).join(", ")}.`,
    };
  };

  const entrar = () => {
    if (!nome.trim()) return setErro("Diga seu nome — é como a equipe vai te ver.");
    if (senha.length < 8) return setErro("A senha precisa de pelo menos 8 caracteres.");
    setErro(null);
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 700));
      setEntrou(true);
      await new Promise((r) => setTimeout(r, 900));
      const como = resultado.estado === "valido" && resultado.convite.nome?.startsWith("Sara") ? "sara" : "sara";
      router.push(`/conversas?como=${como}`);
    });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-[480px]">
        <div className="mb-8 flex justify-center">
          <Marca />
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-[0_1px_0_rgba(31,35,40,.03)]">
          {resultado.estado === "expirado" ? (
            <div>
              <h1 className="text-h3 font-semibold text-foreground">Este convite venceu</h1>
              <p className="mt-2 text-ui-13 leading-relaxed text-muted-foreground">
                O link durava 7 dias e passou. Peça um novo para quem te convidou — leva dez segundos e chega pelo WhatsApp.
              </p>
            </div>
          ) : (
            (() => {
              const c = resultado.convite;
              const f = papelFrase(c);
              const ex = expiraEm(c.expira_em, agora);
              return (
                <div className={cn(entrou && "pointer-events-none")}>
                  <p className="text-ui-13 text-muted-foreground">
                    {convidadoPor ? `${convidadoPor.split(" ")[0]} te convidou para a` : "Você foi convidada para a"}{" "}
                    <span className="font-medium text-foreground">Me Escuta</span>
                  </p>
                  <h1 className="mt-1.5 text-h2 font-semibold leading-tight text-foreground">
                    {c.nome ? `${c.nome.split(" ")[0]}, você entra como ` : "Você entra como "}
                    <span className="text-foreground">{f.forte}</span>
                  </h1>
                  <p className="mt-3 text-ui-13 leading-relaxed text-muted-foreground">{f.fraco}</p>

                  <form
                    className="mt-7 flex flex-col gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      entrar();
                    }}
                  >
                    <FormItemLayout label="Seu nome" htmlFor="aceite-nome" required>
                      <Input
                        id="aceite-nome"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="Como a equipe te chama"
                        autoComplete="name"
                        autoFocus={!c.nome}
                      />
                    </FormItemLayout>
                    <FormItemLayout label="Crie uma senha" htmlFor="aceite-senha" required description="Pelo menos 8 caracteres.">
                      <div className="relative">
                        <Input
                          id="aceite-senha"
                          type={verSenha ? "text" : "password"}
                          value={senha}
                          onChange={(e) => setSenha(e.target.value)}
                          autoComplete="new-password"
                          className="pr-9"
                          autoFocus={!!c.nome}
                        />
                        <button
                          type="button"
                          onClick={() => setVerSenha((v) => !v)}
                          aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                          {verSenha ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                        </button>
                      </div>
                    </FormItemLayout>
                    {erro && (
                      <p role="alert" className="rounded-md bg-danger-tint px-3 py-2 text-ui-12 text-danger-ink">
                        {erro}
                      </p>
                    )}
                    <Button type="submit" size="lg" disabled={pendente} className="mt-1 w-full">
                      {entrou ? "Pronto — abrindo suas conversas" : pendente ? "Criando seu acesso…" : "Entrar na Me Escuta"}
                    </Button>
                  </form>

                  <p className="mt-5 text-center text-ui-11 text-muted-foreground">
                    Este link {ex.texto}. Depois de entrar, ele não abre mais.
                  </p>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </main>
  );
}
