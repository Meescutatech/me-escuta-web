"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormItemLayout } from "@/components/ui/form-item-layout";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Marca } from "@/components/ui/marca";
import { CascaConfig } from "./casca-config";

/**
 * /configuracoes/geral (ensaio) — três coisas que raramente mudam e por isso ficam juntas: como a
 * empresa se chama (nome curto aparece no header e nas mensagens), a marca (logo) e o fuso, que é
 * o que decide "hoje" em toda a casa (prazos do Jarvis, janela de 24 h, relatórios por dia).
 */
export function GeralEnsaio({ gestao }: { gestao: boolean }) {
  const [nome, setNome] = useState("Me Escuta");
  const [razao, setRazao] = useState("Me Escuta Aparelhos Auditivos Ltda.");
  const [fuso, setFuso] = useState("America/Sao_Paulo");
  const [cidade, setCidade] = useState("Contagem, MG");
  const [sujo, setSujo] = useState(false);
  const mudar = (fn: () => void) => {
    fn();
    setSujo(true);
  };

  return (
    <CascaConfig
      titulo="Geral"
      descricao="O nome, a marca e o fuso horário. O fuso é o que define 'hoje' em toda a casa — prazos do Jarvis, janela de 24 h do WhatsApp e os relatórios por dia."
    >
      <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6">
        <h2 className="text-ui-14 font-semibold text-foreground">Identidade</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormItemLayout label="Nome curto" htmlFor="geral-nome" description="Aparece no topo, nos convites e nas mensagens dos agentes.">
            <Input id="geral-nome" value={nome} onChange={(e) => mudar(() => setNome(e.target.value))} disabled={!gestao} />
          </FormItemLayout>
          <FormItemLayout label="Razão social" htmlFor="geral-razao">
            <Input id="geral-razao" value={razao} onChange={(e) => mudar(() => setRazao(e.target.value))} disabled={!gestao} />
          </FormItemLayout>
        </div>
        <FormItemLayout label="Marca" description="SVG ou PNG com fundo transparente. Usada no login, no convite e nos PDFs.">
          <div className="flex items-center gap-4 rounded-lg border border-dashed border-border bg-muted/40 p-4">
            <div className="rounded-lg bg-card p-3">
              <Marca />
            </div>
            <div className="text-ui-12 text-muted-foreground">
              <div className="text-foreground">marca-me-escuta.svg</div>
              <div>orelha laranja + wordmark navy · 2,1 KB</div>
            </div>
            {gestao && (
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => toast("Em breve: trocar a marca.")}>
                Trocar
              </Button>
            )}
          </div>
        </FormItemLayout>
      </section>

      <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6">
        <h2 className="text-ui-14 font-semibold text-foreground">Onde e quando</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormItemLayout label="Fuso horário" htmlFor="geral-fuso" required>
            <Select value={fuso} onValueChange={(v) => mudar(() => setFuso(String(v)))} disabled={!gestao}>
              <SelectTrigger id="geral-fuso" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">Brasília (America/Sao_Paulo)</SelectItem>
                <SelectItem value="America/Manaus">Manaus (America/Manaus)</SelectItem>
                <SelectItem value="America/Belem">Belém (America/Belem)</SelectItem>
              </SelectContent>
            </Select>
          </FormItemLayout>
          <FormItemLayout label="Cidade da clínica" htmlFor="geral-cidade" description="Vai no endereço que a Sara manda e no 'atendemos a sua cidade?' da Clara.">
            <Input id="geral-cidade" value={cidade} onChange={(e) => mudar(() => setCidade(e.target.value))} disabled={!gestao} />
          </FormItemLayout>
        </div>
      </section>

      {gestao && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
          <span className="text-ui-12 text-muted-foreground">{sujo ? "Alterações não salvas" : "Nada alterado ainda"}</span>
          <Button
            disabled={!sujo}
            onClick={() => {
              setSujo(false);
              toast.success("Configuração publicada.", { description: "Vale a partir da próxima mensagem." });
            }}
          >
            Publicar
          </Button>
        </div>
      )}
    </CascaConfig>
  );
}
