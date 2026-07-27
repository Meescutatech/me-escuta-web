"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ativarCanal,
  desativarCanal,
  registrarCanal,
} from "@/app/(app)/configuracoes/canais/actions";
import {
  AVISO_APLICACAO_RUNTIME,
  AVISO_RISCO_BAN,
  canalIdDoForm,
  colunasVisiveis,
  avisoDesativacao,
  estadoDoCanal,
  ordenarCanais,
  podeGerirCanais,
  rotuloEstadoCanal,
  semProblemas,
  validarRegistroCanal,
  type Canal,
  type FormCanal,
  type Papel,
  type Provedor,
} from "./regras/canais.ts";
import { PainelSessao } from "./painel-sessao";
import { BTN, BarraPublicacao, BlocoVazio, Cabecalho, Dialogo, ENTRADA, Faixa, Fantasma } from "./kit";

/**
 * F9 · Números de WhatsApp. Inventário do que a operação usa para falar.
 *
 * Três coisas do mockup r10 que não são estética:
 *
 *  1. COLUNA COM VALOR ÚNICO SOME (decisão do Orquestrador). Enquanto todo canal for `comercial`,
 *     ÁREA sai; enquanto todos forem oficiais, PROVEDOR sai. Elas voltam sozinhas quando passam a
 *     significar alguma coisa — e é isso que deixa a tela caber em 720px sem apertar o essencial.
 *  2. O ESTADO DEPENDE DO PROVEDOR e é o ponto delicado da tabela. Canal oficial tem Ativo/Inativo;
 *     canal não oficial tem SESSÃO, que se conecta lendo QR. Oferecer "Ativar" no não oficial
 *     saltaria para Conectado sem passar pelo pareamento — ficção de interface.
 *  3. O TOKEN NÃO APARECE. Nem mascarado, nem como campo, nem como palavra: ele vive no ambiente
 *     do runtime, e o rodapé da tela diz isso em vez de mostrar um cadeado decorativo.
 */

export interface CanalNaTela extends Canal {
  /** estado da sessão, quando o canal é não oficial e já houve pareamento. */
  sessao?: { status: string; viva?: boolean } | null;
}

const AREAS = ["comercial", "clinica", "financeiro", "pos_venda"];

export function TabelaCanais({
  canais,
  meuPapel,
  indisponivel,
  f8Pronto,
}: {
  canais: CanalNaTela[];
  meuPapel: Papel | null;
  indisponivel: boolean;
  f8Pronto: boolean;
}) {
  const router = useRouter();
  const gestor = podeGerirCanais(meuPapel);
  const [busca, setBusca] = useState("");
  const [abrindo, setAbrindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<CanalNaTela | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const ordenados = useMemo(() => ordenarCanais(canais) as CanalNaTela[], [canais]);
  const cols = useMemo(() => colunasVisiveis(ordenados), [ordenados]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return ordenados;
    return ordenados.filter((c) =>
      `${c.nome} ${c.numero ?? ""} ${c.canal_id}`.toLowerCase().includes(q),
    );
  }, [ordenados, busca]);

  const grade = [
    "minmax(150px,1fr)",
    "152px",
    cols.provedor ? "96px" : null,
    cols.area ? "104px" : null,
    "182px",
    "28px",
  ]
    .filter(Boolean)
    .join(" ");

  function desativar(canal: CanalNaTela) {
    setErro(null);
    iniciar(async () => {
      const r = await desativarCanal(canal.canal_id, { confirmado: true });
      setConfirmar(null);
      if (!r.ok) setErro(r.motivo ?? "não deu para desligar");
      else {
        setAviso(AVISO_APLICACAO_RUNTIME);
        router.refresh(); // B1: sem isto a linha na tela continua a de antes da escrita
      }
    });
  }

  function ativar(canal: CanalNaTela, corte: string) {
    setErro(null);
    iniciar(async () => {
      const r = await ativarCanal(canal.canal_id, corte);
      if (!r.ok) setErro(r.motivo ?? "não deu para ligar");
      else {
        setAviso(AVISO_APLICACAO_RUNTIME);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Cabecalho
        titulo="Números de WhatsApp"
        contador={filtrados.length}
        descricao="Os números por onde a operação fala. Registrar não exige deploy."
        acoes={
          <div className="ml-0 flex w-full items-center gap-2.5">
            {/* busca à ESQUERDA (ressalva 2 do Croqui): ela filtra o que está abaixo, então mora
                do lado em que o olho começa a linha; a ação primária fica na ponta oposta. */}
            <input
              className={`${ENTRADA} max-w-[230px]`}
              type="search"
              autoComplete="off"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="buscar nome ou número…"
              aria-label="Buscar número"
            />
            {gestor ? (
              <button className={`${BTN.primario} ml-auto`} type="button" onClick={() => setAbrindo(true)}>
                + Adicionar número
              </button>
            ) : null}
          </div>
        }
      />

      {!gestor ? (
        <p className="mb-3.5 text-[13px] text-suave">
          Você está vendo esta tela em leitura. Só <b>admin</b> e <b>Proprietário</b> registram
          números e ligam ou desligam canais.
        </p>
      ) : null}

      {indisponivel ? (
        <Faixa tom="erro">
          Não foi possível ler <span className="font-mono">core.v_canal_whatsapp</span>. A conexão
          caiu ou a migration ainda não subiu neste ambiente.
        </Faixa>
      ) : null}
      {erro ? <Faixa tom="erro">{erro}</Faixa> : null}
      {aviso ? (
        <Faixa tom="info" acao={<button type="button" onClick={() => setAviso(null)}>Entendi</button>}>
          {aviso}
        </Faixa>
      ) : null}

      {abrindo ? (
        <BlocoAdicionar
          aoFechar={() => setAbrindo(false)}
          aoErro={setErro}
          aoAviso={setAviso}
        />
      ) : null}

      <div className="mt-1">
        <div
          style={{ gridTemplateColumns: grade }}
          className="sticky top-0 z-[5] grid items-center gap-3 border-b border-linha bg-branco px-2 pb-2 pt-2.5 text-[11.5px] font-medium uppercase tracking-[0.05em] text-suave"
        >
          <span>Nome</span>
          <span>Número</span>
          {cols.provedor ? <span>Provedor</span> : null}
          {cols.area ? <span>Área</span> : null}
          <span>Estado</span>
          <span />
        </div>

        {indisponivel ? (
          <>
            <Fantasma larguras={[150, 104, 62, 70]} segunda={[120]} />
            <Fantasma larguras={[150, 104, 62, 70]} segunda={[120]} />
          </>
        ) : filtrados.length === 0 && busca.trim() ? (
          <div className="flex items-center gap-2.5 px-2 py-6 text-[13px] text-suave">
            Nenhum número corresponde a “{busca.trim()}”.
            <button className={BTN.texto} type="button" onClick={() => setBusca("")}>
              Limpar busca
            </button>
          </div>
        ) : filtrados.length === 0 ? (
          <BlocoVazio
            titulo="Nenhum número registrado."
            apoio="Registre o primeiro para a operação começar a falar por aqui."
            acao={
              gestor ? (
                <button className={BTN.primario} type="button" onClick={() => setAbrindo(true)}>
                  + Adicionar número
                </button>
              ) : undefined
            }
          />
        ) : (
          filtrados.map((c) => (
            <LinhaCanal
              key={c.canal_id}
              canal={c}
              grade={grade}
              cols={cols}
              gestor={gestor}
              pendente={pendente}
              expandido={expandido === c.canal_id}
              aoExpandir={() => setExpandido(expandido === c.canal_id ? null : c.canal_id)}
              aoDesativar={() => setConfirmar(c)}
              aoAtivar={(corte) => ativar(c, corte)}
              meuPapel={meuPapel}
              f8Pronto={f8Pronto}
            />
          ))
        )}
      </div>

      <p className="mt-4 text-[12.5px] text-suave">
        O token de cada número vem do ambiente do servidor — esta tela nunca o pede.
      </p>

      {confirmar ? (
        <Dialogo
          titulo={`Desligar ${confirmar.nome}?`}
          aoFechar={() => setConfirmar(null)}
          acoes={
            <>
              <button className={BTN.secundario} type="button" onClick={() => setConfirmar(null)}>
                Cancelar
              </button>
              <button
                className={BTN.perigo}
                type="button"
                disabled={pendente}
                onClick={() => desativar(confirmar)}
              >
                Desligar mesmo assim
              </button>
            </>
          }
        >
          <p className="mb-4 text-[13px] text-suave">{avisoDesativacao(null)}</p>
        </Dialogo>
      ) : null}
    </>
  );
}

function LinhaCanal({
  canal,
  grade,
  cols,
  gestor,
  pendente,
  expandido,
  aoExpandir,
  aoDesativar,
  aoAtivar,
  meuPapel,
  f8Pronto,
}: {
  canal: CanalNaTela;
  grade: string;
  cols: { provedor: boolean; area: boolean };
  gestor: boolean;
  pendente: boolean;
  expandido: boolean;
  aoExpandir: () => void;
  aoDesativar: () => void;
  aoAtivar: (corte: string) => void;
  meuPapel: Papel | null;
  f8Pronto: boolean;
}) {
  const [corte, setCorte] = useState("");
  const estado = estadoDoCanal(canal);
  const lite = canal.provedor === "nao_oficial";

  const rotulo = lite
    ? canal.sessao?.status === "conectado"
      ? { txt: "Conectado", cls: "text-verde" }
      : canal.sessao?.status === "aguardando_qr"
        ? { txt: "Aguardando leitura do QR", cls: "text-amarelo" }
        : canal.sessao?.status === "banido"
          ? { txt: "Banido pelo WhatsApp", cls: "text-vermelho" }
          : { txt: "Desconectado", cls: "text-vermelho" }
    : canal.ativo
      ? { txt: "Ativo", cls: "text-tinta" }
      : { txt: rotuloEstadoCanal(estado), cls: "text-suave" };

  return (
    <div className="border-b border-linha">
      <div
        style={{ gridTemplateColumns: grade }}
        className="grid items-start gap-3 px-2 py-2 hover:bg-hover"
      >
        <div className="flex min-h-[30px] min-w-0 items-center self-center">
          <span className="truncate text-[14px] font-medium text-tinta">{canal.nome}</span>
        </div>
        <div className="flex min-h-[30px] items-center self-center">
          {canal.numero ? (
            <span className="font-mono text-[12.5px] text-tinta">{canal.numero}</span>
          ) : (
            <span className="font-mono text-[12.5px] text-mute" title="número ainda não aprovado na Meta">
              —
            </span>
          )}
        </div>
        {cols.provedor ? (
          <div className="flex min-h-[30px] items-center self-center">
            <span className={lite ? "text-[13px] text-amarelo" : "text-[13px] text-suave"}>
              {lite ? "Não oficial" : "Oficial"}
            </span>
          </div>
        ) : null}
        {cols.area ? (
          <div className="flex min-h-[30px] items-center self-center">
            <span className="text-[13px] text-suave">{canal.area_efetiva ?? "comercial"}</span>
          </div>
        ) : null}
        <div className="flex min-h-[30px] items-center gap-2 self-center">
          <span className={`text-[13px] ${rotulo.cls}`}>{rotulo.txt}</span>
          {lite && canal.sessao?.status !== "conectado" && gestor ? (
            <button className={BTN.mini} type="button" onClick={aoExpandir}>
              {expandido ? "Fechar" : "Conectar"}
            </button>
          ) : null}
        </div>
        <div className="flex min-h-[30px] items-center justify-end self-center">
          {!lite && gestor ? (
            canal.ativo ? (
              <button className={BTN.mini} type="button" disabled={pendente} onClick={aoDesativar}>
                Desligar
              </button>
            ) : (
              <button className={BTN.mini} type="button" onClick={aoExpandir}>
                Ligar
              </button>
            )
          ) : null}
        </div>

        <div style={{ gridColumn: "1 / -1" }} className="mt-0.5 flex items-center gap-2.5">
          <span className="font-mono text-[11.5px] text-mute">{canal.canal_id}</span>
          {lite ? <span className="text-[11.5px] text-suave">sujeito a bloqueio</span> : null}
          {estado === "bloqueado_sem_consentimento" ? (
            <span className="text-[11.5px] text-amarelo">⚠ falta o consentimento da titular</span>
          ) : null}
        </div>
      </div>

      {expandido && !lite ? (
        <div className="border-t border-linha bg-board px-4 py-3.5">
          <p className="mb-2 text-[13px] text-suave">
            Ligar sem data de corte despeja o histórico inteiro deste número no inbox de todo mundo.
            Informe a partir de quando as conversas entram.
          </p>
          <div className="flex items-center gap-2.5">
            <input
              className={`${ENTRADA} max-w-[220px]`}
              type="date"
              value={corte}
              onChange={(e) => setCorte(e.target.value)}
              aria-label="Data de corte do inbox"
            />
            <button
              className={BTN.primario}
              type="button"
              disabled={pendente || (!canal.inbox_desde && !corte)}
              onClick={() => aoAtivar(corte ? new Date(corte).toISOString() : "")}
            >
              Ligar canal
            </button>
          </div>
        </div>
      ) : null}

      {expandido && lite ? (
        <PainelSessao canal={canal} meuPapel={meuPapel} f8Pronto={f8Pronto} />
      ) : null}

      {lite ? (
        <p className="border-t border-linha bg-[#FBF3E2] px-4 py-2 text-[11.5px] text-amarelo">
          {AVISO_RISCO_BAN}
        </p>
      ) : null}
    </div>
  );
}

/**
 * O bloco de adição mora NA PÁGINA, não num modal: são cinco campos, e o padrão do convite de
 * Membros já é este. Modal para cinco campos rouba o contexto da lista que a pessoa acabou de ler.
 */
function BlocoAdicionar({
  aoFechar,
  aoErro,
  aoAviso,
}: {
  aoFechar: () => void;
  aoErro: (m: string | null) => void;
  aoAviso: (m: string) => void;
}) {
  const router = useRouter();
  const [provedor, setProvedor] = useState<Provedor>("waba");
  const [form, setForm] = useState<FormCanal>({
    canalId: "",
    nome: "",
    provedor: "waba",
    numeroE164: "",
    wabaId: "",
    area: "comercial",
  });
  const [pendente, iniciar] = useTransition();
  const atual: FormCanal = { ...form, provedor };
  const problemas = validarRegistroCanal(atual);
  const idPrevisto = canalIdDoForm(atual);

  function enviar() {
    aoErro(null);
    iniciar(async () => {
      const r = await registrarCanal(atual);
      if (!r.ok) aoErro(r.motivo ?? "não deu para registrar");
      else {
        aoAviso("Número registrado. Ele nasce DESLIGADO — ligar é um segundo passo, com data de corte.");
        aoFechar();
        router.refresh(); // B1: o primeiro número TEM de aparecer na lista e no contador
      }
    });
  }

  return (
    <div className="mb-5 rounded-[10px] border border-linha p-4">
      <h2 className="text-[14px] font-semibold text-tinta">Adicionar número</h2>
      <p className="mb-3.5 text-[13px] text-suave">
        Registrar é declarar um número que já existe do outro lado. Ele nasce desligado.
      </p>

      <div className="mb-2">
        {(
          [
            {
              v: "waba" as Provedor,
              t: "Oficial (WhatsApp Cloud API)",
              e: "Número da empresa aprovado na Meta. Sem risco de bloqueio.",
            },
            {
              v: "nao_oficial" as Provedor,
              t: "Não oficial (biblioteca)",
              e: "Número pessoal de alguém, conectado por QR. Pode ser banido pelo WhatsApp — e o ban atinge o WhatsApp pessoal dela.",
            },
          ] as const
        ).map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setProvedor(o.v)}
            className={`mb-2 flex w-full items-start gap-2.5 rounded-md border p-3 text-left hover:bg-hover ${
              provedor === o.v ? "border-navy bg-[#EAECF5]" : "border-linha"
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-1 h-3.5 w-3.5 flex-none rounded-full border ${
                provedor === o.v ? "border-navy bg-navy" : "border-mute"
              }`}
            />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium text-tinta">{o.t}</span>
              <span className="mt-0.5 block text-[12.5px] text-suave">{o.e}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(148px,1fr))] gap-3">
        <Campo rotulo={provedor === "nao_oficial" ? "Nome de quem cedeu o número" : "Nome do canal"} erro={problemas.nome}>
          <input
            className={ENTRADA}
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder={provedor === "nao_oficial" ? "Jade" : "Produção"}
          />
        </Campo>
        {provedor === "waba" ? (
          <Campo rotulo="phone_number_id (Meta)" erro={problemas.canalId}>
            <input
              className={`${ENTRADA} font-mono text-[12.5px]`}
              value={form.canalId}
              onChange={(e) => setForm({ ...form, canalId: e.target.value })}
              placeholder="627327023793464"
            />
          </Campo>
        ) : null}
        <Campo rotulo={provedor === "waba" ? "Número (E.164)" : "Número (opcional)"} erro={problemas.numeroE164}>
          <input
            className={`${ENTRADA} font-mono text-[12.5px]`}
            value={form.numeroE164}
            onChange={(e) => setForm({ ...form, numeroE164: e.target.value })}
            placeholder="+5511999998888"
          />
        </Campo>
        <Campo rotulo="Área">
          <select
            className={ENTRADA}
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
          >
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Campo>
      </div>

      {provedor === "nao_oficial" && idPrevisto ? (
        <p className="mt-3 border-t border-linha pt-3 text-[13px] text-suave">
          O id deste canal será <span className="font-mono text-tinta">{idPrevisto}</span> — legível,
          estável, e nunca o número dela.
        </p>
      ) : null}

      <div className="mt-3.5 flex items-center justify-end gap-2.5">
        <button className={BTN.texto} type="button" onClick={aoFechar}>
          Cancelar
        </button>
        <button
          className={BTN.primario}
          type="button"
          disabled={pendente || !semProblemas(problemas)}
          onClick={enviar}
        >
          Registrar número
        </button>
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  erro,
  children,
}: {
  rotulo: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] text-suave">{rotulo}</span>
      {children}
      {erro ? <span className="text-[11.5px] text-vermelho">{erro}</span> : null}
    </label>
  );
}

export { BarraPublicacao };
