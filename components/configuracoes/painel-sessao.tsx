"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarSessao,
  desconectarSessao,
  lerEstadoSessao,
  lerPainelDescartes,
  registrarConsentimento,
  type EstadoSessaoNaTela,
  type PainelDescartes,
} from "@/app/(app)/configuracoes/canais/lite/actions";
import {
  MEIOS_CONSENTIMENTO,
  ROTULO_MOTIVO_DESCARTE,
  TERMO_CANAL_PESSOAL,
  TERMO_VERSAO,
  descricaoEstadoSessao,
  intervaloRelituraMs,
  podeCriarSessao,
  rotuloEstadoSessao,
  validarConsentimento,
  type FormConsentimento,
  type MeioConsentimento,
} from "./regras/lite-sessao.ts";
import type { Canal, Papel } from "./regras/canais.ts";
import { BTN, ENTRADA, Faixa, dataHora } from "./kit";

/**
 * F11 · Painel de sessão do canal NÃO OFICIAL — dentro da linha do canal, não em página nova.
 *
 * A ordem da tela é a ordem do portão, e isso é deliberado: enquanto não houver consentimento
 * registrado, o que aparece é o TERMO, não o QR. Mostrar o QR e só depois avisar do risco seria
 * pedir o aceite depois de ter aberto a sessão de uma pessoa.
 */
export function PainelSessao({
  canal,
  meuPapel,
  f8Pronto,
}: {
  canal: Canal;
  meuPapel: Papel | null;
  f8Pronto: boolean;
}) {
  const veredito = podeCriarSessao({ papel: meuPapel, canal, f8Pronto });
  const [estado, setEstado] = useState<EstadoSessaoNaTela | null>(null);
  const [descartes, setDescartes] = useState<PainelDescartes | null>(null);
  const [pendente, iniciar] = useTransition();

  const reler = useCallback(async () => {
    setEstado(await lerEstadoSessao(canal.canal_id));
  }, [canal.canal_id]);

  useEffect(() => {
    void reler();
    void lerPainelDescartes(canal.canal_id).then(setDescartes);
  }, [reler, canal.canal_id]);

  // ENQUANTO aguarda pareamento, relê a cada 5 s e redesenha o QR; ao conectar, PARA.
  // O intervalo vem da regra pura: `null` significa "não relê", e é isso que impede o polling
  // eterno contra o runtime quando a sessão já está de pé.
  useEffect(() => {
    const ms = estado ? intervaloRelituraMs(estado.estado) : null;
    if (ms === null) return;
    const t = setInterval(() => void reler(), ms);
    return () => clearInterval(t);
  }, [estado, reler]);

  if (!canal.consentimento_em) {
    return <TermoConsentimento canal={canal} podePapel={meuPapel === "admin" || meuPapel === "owner"} />;
  }

  return (
    <div className="border-t border-linha bg-board px-4 py-4">
      <div className="grid grid-cols-[236px_1fr] gap-6 max-md:grid-cols-1">
        <div className="flex h-[236px] w-[236px] items-center justify-center rounded-[10px] border border-linha bg-branco p-3.5 max-md:w-full">
          {estado?.qr && estado.qrValido ? (
            <CodigoPareamento codigo={estado.qr} />
          ) : (
            <span className="px-3 text-center text-[12.5px] text-mute">
              {estado?.estado === "conectado"
                ? "Sessão conectada. Nada a ler."
                : "Nenhum código ativo. Peça uma sessão para gerar."}
            </span>
          )}
        </div>

        <div>
          <p className="text-[14px] font-medium text-tinta">
            {estado ? rotuloEstadoSessao(estado.estado) : "Lendo o estado…"}
          </p>
          <p className="mt-1 text-[13px] text-suave">
            {estado ? descricaoEstadoSessao(estado.estado) : ""}
          </p>

          {estado?.motivo ? <div className="mt-3"><Faixa tom="erro">{estado.motivo}</Faixa></div> : null}
          {estado?.statusIndisponivel ? (
            <div className="mt-3">
              <Faixa tom="ambar">
                O estado guardado no banco não está legível neste ambiente — o que aparece veio do
                runtime, e some se ele reiniciar.
              </Faixa>
            </div>
          ) : null}

          {!veredito.pode ? (
            <div className="mt-3">
              <Faixa tom="info">{veredito.motivo}</Faixa>
            </div>
          ) : (
            <>
              {veredito.avisos.map((a) => (
                <div key={a} className="mt-3">
                  <Faixa tom="ambar">{a}</Faixa>
                </div>
              ))}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className={BTN.secundario}
                  type="button"
                  disabled={pendente}
                  onClick={() =>
                    iniciar(async () => setEstado(await criarSessao(canal.canal_id, { f8Pronto })))
                  }
                >
                  {estado?.estado === "aguardando_qr" ? "Gerar outro código" : "Pedir sessão"}
                </button>
                {estado?.estado === "conectado" ? (
                  <button
                    className={BTN.perigo}
                    type="button"
                    disabled={pendente}
                    onClick={() => iniciar(async () => setEstado(await desconectarSessao(canal.canal_id)))}
                  >
                    Encerrar sessão
                  </button>
                ) : null}
                {estado?.desde ? (
                  <span className="text-[12.5px] text-suave">desde {dataHora(estado.desde)}</span>
                ) : null}
              </div>
            </>
          )}

          <ol className="mt-4 flex flex-col gap-2.5">
            {[
              "No celular dela, abra o WhatsApp.",
              "Toque em Aparelhos conectados e depois em Conectar um aparelho.",
              "Aponte a câmera para o código ao lado. Ele expira em segundos e é redesenhado sozinho.",
            ].map((t, i) => (
              <li key={t} className="flex items-baseline gap-3">
                <span className="flex-none font-mono text-[12px] tabular-nums text-mute">{i + 1}</span>
                <span className="text-[13.5px] text-tinta">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <ContadorCego painel={descartes} />
    </div>
  );
}

/**
 * O QR do provedor chega como CÓDIGO CRU (padrão WuzAPI: quem desenha é o cliente). Este app não
 * tem gerador de QR e NÃO vou adicionar dependência no meio da rodada — decisão declarada no
 * relatório, com o pedido correspondente ao runtime: devolver também `qr_imagem` como data URI.
 *
 * Enquanto isso a tela mostra o código legível e diz o que ele é. É pior que um QR desenhado e é
 * melhor que um quadrado vazio com cara de "carregando" — o que a tela não consegue fazer, ela diz.
 */
function CodigoPareamento({ codigo }: { codigo: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden">
      <span className="text-[11.5px] uppercase tracking-[0.06em] text-suave">código de pareamento</span>
      <code className="max-h-[150px] w-full overflow-auto break-all px-1 text-center font-mono text-[10px] leading-tight text-tinta">
        {codigo}
      </code>
      <span className="px-2 text-center text-[11px] text-suave">
        Esta tela ainda não desenha o QR — use o código no aparelho ou no painel do provedor.
      </span>
    </div>
  );
}

/** O contador CEGO: responde "o filtro está funcionando?" sem responder "quem foi barrado?". */
function ContadorCego({ painel }: { painel: PainelDescartes | null }) {
  if (!painel || painel.indisponivel) return null;
  const { resumo, sinal } = painel;
  return (
    <div className="mt-5 border-t border-linha pt-3.5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-suave">
          Descartado na borda
        </span>
        <span className="font-mono text-[13px] tabular-nums text-tinta">{resumo.total}</span>
        <span className="text-[12.5px] text-suave">
          mensagem(ns) de quem não é lead nem paciente — nada disso foi guardado.
        </span>
      </div>
      {resumo.porMotivo.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {resumo.porMotivo.map((m) => (
            <li key={m.motivo} className="text-[12.5px] text-suave">
              <span className="font-mono tabular-nums text-tinta">{m.quantidade}</span>{" "}
              {ROTULO_MOTIVO_DESCARTE[m.motivo] ?? m.motivo}
            </li>
          ))}
        </ul>
      ) : null}
      {sinal.suspeito ? (
        <div className="mt-3">
          <Faixa tom="ambar">{sinal.motivo}</Faixa>
        </div>
      ) : null}
    </div>
  );
}

/**
 * O TERMO é o portão, não o rodapé. Sem `consentimento_em` registrado, a constraint do banco
 * recusa a ativação e `podeCriarSessao` recusa o pareamento — a tela apenas conta isso antes.
 */
function TermoConsentimento({ canal, podePapel }: { canal: Canal; podePapel: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<FormConsentimento>({
    canalId: canal.canal_id,
    titularNome: canal.nome,
    meio: "whatsapp",
    aceitoEm: new Date().toISOString().slice(0, 10),
    textoVersao: TERMO_VERSAO,
    aceiteMarcado: false,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const problemas = validarConsentimento(form, Date.now());

  return (
    <div className="border-t border-linha bg-board px-4 py-4">
      <h3 className="text-[14px] font-semibold text-tinta">
        Antes de conectar: o consentimento de quem cedeu o número
      </h3>
      <div className="mt-2.5 whitespace-pre-line rounded-md border border-linha bg-branco p-3.5 text-[13px] leading-relaxed text-tinta">
        {TERMO_CANAL_PESSOAL}
      </div>

      {!podePapel ? (
        <p className="mt-3 text-[13px] text-suave">
          Só admin e Proprietário registram o consentimento.
        </p>
      ) : (
        <>
          {erro ? <div className="mt-3"><Faixa tom="erro">{erro}</Faixa></div> : null}
          <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-suave">Quem é a titular</span>
              <input
                className={ENTRADA}
                value={form.titularNome}
                onChange={(e) => setForm({ ...form, titularNome: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-suave">Como ela consentiu</span>
              <select
                className={ENTRADA}
                value={form.meio}
                onChange={(e) => setForm({ ...form, meio: e.target.value as MeioConsentimento })}
              >
                {MEIOS_CONSENTIMENTO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-suave">Quando</span>
              <input
                className={ENTRADA}
                type="date"
                value={form.aceitoEm.slice(0, 10)}
                onChange={(e) => setForm({ ...form, aceitoEm: e.target.value })}
              />
            </label>
          </div>

          <label className="mt-3.5 flex items-start gap-2.5 text-[13px] text-tinta">
            <input
              type="checkbox"
              className="mt-1 accent-[#252F63]"
              checked={form.aceiteMarcado}
              onChange={(e) => setForm({ ...form, aceiteMarcado: e.target.checked })}
            />
            <span>
              Confirmo que ela leu este texto e concordou. O consentimento fica registrado com a
              versão do termo — se o texto mudar, este aceite não cobre o novo.
            </span>
          </label>

          <div className="mt-3.5 flex items-center justify-end gap-2.5">
            <button
              className={BTN.primario}
              type="button"
              disabled={pendente || Object.keys(problemas).length > 0}
              onClick={() =>
                iniciar(async () => {
                  const r = await registrarConsentimento({
                    ...form,
                    aceitoEm: new Date(form.aceitoEm).toISOString(),
                  });
                  if (!r.ok) setErro(r.motivo ?? "não deu para registrar o consentimento");
                  else router.refresh(); // o portão da sessão só abre quando o DADO muda
                })
              }
            >
              Registrar consentimento
            </button>
          </div>
          {Object.values(problemas)[0] ? (
            <p className="mt-2 text-right text-[11.5px] text-suave">{Object.values(problemas)[0]}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
