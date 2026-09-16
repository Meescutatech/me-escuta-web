"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormItemLayout } from "@/components/ui/form-item-layout";
import { Input } from "@/components/ui/input";
import { registrarCanal } from "@/app/(app)/configuracoes/canais/actions";
import {
  opcoesDepartamento,
  semProblemas,
  validarRegistroCanal,
  type FormCanal,
} from "./regras/canais.ts";
import type { Departamento } from "@/lib/departamentos/escopo";

/** `<select>` nativo com a pele do `Input` do preset — mesma razão da tabela: a árvore de departamentos. */
const SELETOR =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

/** Campo → como chamá-lo na linha "ainda falta", em voz de gente. */
const NOME_DO_CAMPO: Record<string, string> = {
  nome: "o nome",
  canalId: "o phone_number_id",
  wabaId: "o WABA id",
  numeroE164: "o número",
  finalidade: "a finalidade",
  departamento: "o departamento",
};

/**
 * O NÚMERO OFICIAL (WABA), dentro do painel de "Adicionar número" (16/09). Era o bloco inline da
 * tabela; o painel passou a ser a porta única e a escolha de tipo mora nele.
 *
 * O que continua igual ao bloco antigo, e por quê:
 *  · a validação só aparece nos campos em que a pessoa já mexeu (`tocados`) — seis parágrafos
 *    vermelhos num formulário em branco não são erro de ninguém;
 *  · finalidade e departamento nascem SEM escolha (M7 / R22-A1): default conveniente foi o que pôs
 *    `comercial` em dois canais e produziu números vivos que ninguém ligou;
 *  · o departamento é `<select>` nativo com os nós de agrupamento desabilitados — a porta recusa nó;
 *  · o botão fica desabilitado até passar, com uma linha dizendo o que falta.
 */
export function FormNumeroOficial({
  departamentos,
  dominioIndisponivel,
  aoCancelar,
  aoRegistrar,
}: {
  departamentos: Departamento[];
  dominioIndisponivel: boolean;
  aoCancelar: () => void;
  /** o aviso de sucesso vai para a página, que continua aberta atrás do painel. */
  aoRegistrar: (aviso: string) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormCanal>({
    canalId: "",
    nome: "",
    provedor: "waba",
    numeroE164: "",
    wabaId: "",
    // o número é da empresa, não de uma pessoa
    responsavelId: "",
    departamento: "",
    finalidade: "",
  });
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const problemas = validarRegistroCanal(form);

  const tocar = (campo: string) => setTocados((t) => ({ ...t, [campo]: true }));
  const erroDe = (campo: keyof FormCanal) =>
    tocados[campo] ? (problemas[campo] as string | undefined) : undefined;
  const faltando = Object.keys(problemas).map((k) => NOME_DO_CAMPO[k] ?? k);

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const r = await registrarCanal(form);
      if (!r.ok) return setErro(r.motivo ?? "não deu para registrar");
      aoRegistrar("Número registrado. Ele nasce desligado — ligar é um segundo passo, com data de corte.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormItemLayout
        label="Nome do canal"
        description="Como a operação chama este número. Só aparece aqui dentro."
        error={erroDe("nome")}
      >
        <Input
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          onBlur={() => tocar("nome")}
          placeholder="Produção"
          aria-invalid={erroDe("nome") ? true : undefined}
        />
      </FormItemLayout>

      <FormItemLayout
        label="Finalidade"
        description="Teste só entrega a destinatários em lista. Produção fala com paciente."
        error={erroDe("finalidade")}
      >
        <select
          className={SELETOR}
          value={form.finalidade}
          onChange={(e) => {
            tocar("finalidade");
            setForm({ ...form, finalidade: e.target.value as FormCanal["finalidade"] });
          }}
          aria-invalid={erroDe("finalidade") ? true : undefined}
        >
          <option value="">— escolha —</option>
          <option value="teste">Teste</option>
          <option value="producao">Produção</option>
        </select>
      </FormItemLayout>

      <FormItemLayout label="Departamento" description="Quem responde por este número. Pode ficar em branco e ser declarado depois.">
        {dominioIndisponivel ? (
          <p className="text-ui-12 leading-relaxed text-warning-ink">
            Não deu para ler os departamentos agora. O número pode ser registrado sem departamento.
          </p>
        ) : (
          <select
            className={SELETOR}
            value={form.departamento}
            onChange={(e) => setForm({ ...form, departamento: e.target.value })}
          >
            <option value="">— não declarado —</option>
            {opcoesDepartamento(departamentos).map((o) => (
              <option key={o.chave} value={o.chave} disabled={!o.selecionavel}>
                {o.nivel > 1 ? `    ${o.rotulo}` : o.rotulo}
                {o.selecionavel ? "" : " (agrupamento)"}
              </option>
            ))}
          </select>
        )}
      </FormItemLayout>

      {/* Os três dados técnicos saem da mesma tela do painel da Meta — o título diz onde buscar. */}
      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <div>
          <p className="text-ui-13 font-medium text-foreground">Dados da Meta</p>
          <p className="mt-0.5 text-ui-12 text-muted-foreground">
            Os três saem do painel da Meta, em WhatsApp › Configuração da API.
          </p>
        </div>
        <FormItemLayout
          label="phone_number_id"
          description="A chave da conversa do lado da Meta. Não dá para preencher depois."
          error={erroDe("canalId")}
        >
          <Input
            className="font-mono text-ui-12"
            value={form.canalId}
            onChange={(e) => setForm({ ...form, canalId: e.target.value })}
            onBlur={() => tocar("canalId")}
            placeholder="627327023793464"
            aria-invalid={erroDe("canalId") ? true : undefined}
          />
        </FormItemLayout>
        <FormItemLayout
          label="WABA id"
          description="A conta do WhatsApp Business de onde este número saiu."
          error={erroDe("wabaId")}
        >
          <Input
            className="font-mono text-ui-12"
            value={form.wabaId}
            onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
            onBlur={() => tocar("wabaId")}
            placeholder="966114259004051"
            aria-invalid={erroDe("wabaId") ? true : undefined}
          />
        </FormItemLayout>
        <FormItemLayout
          label="Número (E.164)"
          description="Com + e DDI, sem espaços nem traços."
          error={erroDe("numeroE164")}
        >
          <Input
            className="font-mono text-ui-12"
            value={form.numeroE164}
            onChange={(e) => setForm({ ...form, numeroE164: e.target.value })}
            onBlur={() => tocar("numeroE164")}
            placeholder="+5511999998888"
            aria-invalid={erroDe("numeroE164") ? true : undefined}
          />
        </FormItemLayout>
      </div>

      {erro && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
          {erro}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {faltando.length > 0 ? (
          <p className="text-ui-12 text-muted-foreground">Ainda falta {faltando.join(", ")}.</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={aoCancelar}>
            Voltar
          </Button>
          <Button disabled={pendente || !semProblemas(problemas)} loading={pendente} onClick={enviar}>
            Registrar número
          </Button>
        </div>
      </div>
    </div>
  );
}
