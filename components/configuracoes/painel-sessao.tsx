"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
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
import { AVISO_QR_SEM_PRAZO, decidirQuadro, type QuadroPareamento } from "./regras/qr-pareamento.ts";
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
    const ms = estado ? intervaloRelituraMs(estado.estado, estado.provedorIndisponivel) : null;
    if (ms === null) return;
    const t = setInterval(() => void reler(), ms);
    return () => clearInterval(t);
  }, [estado, reler]);

  // A decisão do quadro é regra pura e testada (`decidirQuadro`) — inclusive a de NÃO desenhar QR
  // vencido. As dependências são primitivos de propósito: o relê monta um objeto de estado novo a
  // cada 5 s, e depender do objeto recodificaria um QR idêntico a cada volta.
  const qr = estado?.qr ?? null;
  const qrImagem = estado?.qrImagem ?? null;
  const qrFormato = estado?.qrFormato ?? null;
  const qrValido = estado?.qrValido ?? false;
  const qrSemPrazo = estado?.qrSemPrazo ?? false;
  const conectado = estado?.estado === "conectado";
  const quadro = useMemo(
    () => decidirQuadro({ qr, qrImagem, formato: qrFormato, qrValido, semPrazo: qrSemPrazo, conectado }),
    [qr, qrImagem, qrFormato, qrValido, qrSemPrazo, conectado],
  );

  if (!canal.consentimento_em) {
    return <TermoConsentimento canal={canal} podePapel={meuPapel === "admin" || meuPapel === "owner"} />;
  }

  return (
    <div className="border-t border-linha bg-board px-4 py-4">
      <div className="grid grid-cols-[288px_1fr] gap-6 max-md:grid-cols-1">
        <QuadroDePareamento quadro={quadro} />

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
              "Aponte a câmera para o código. Ele vale por segundos — se passar do tempo, use Gerar outro código.",
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
 * O quadro branco onde o QR mora — 288px de lado, e o número não é solto.
 *
 * O que ele precisa aguentar é uma câmera de celular na mão, a meio metro da tela. São 268px úteis
 * (288 menos o respiro de 10px de cada lado), e eles servem aos DOIS caminhos por razões
 * diferentes:
 *
 *  · IMAGEM (o dialeto de produção): o PNG do provedor sai do `qrcode.Encode(evt.Code, …, 256)` do
 *    `wmiau.go` — 256px. Em 268px úteis ele cabe INTEIRO, no tamanho natural, sem reamostragem
 *    nenhuma. Isso é o ponto do número: reamostrar um QR raster estraga a beira do módulo tanto
 *    para cima (nearest-neighbor duplica linhas em escala não inteira) quanto para baixo (o
 *    navegador borra). O quadro antigo de 264px deixava 244 úteis e obrigava a encolher 256 → 244.
 *
 *  · DESENHO (quando só chega o código): o código real de 199 caracteres dá versão 9 em `L`, 53
 *    módulos, 61 com a zona de silêncio — **4,39px por módulo** em 268px, contra 4,00px no quadro
 *    de 264 e um piso de ~3px em que a câmera começa a errar. Os dois caminhos ganham.
 *
 * `aspect-square` em vez de altura fixa: no celular o quadro acompanha a largura da tela e continua
 * quadrado. Com altura fixa ele virava retângulo no telefone, e QR esticado não é QR.
 */
function Quadro({ children }: { children: ReactNode }) {
  return (
    <div className="flex aspect-square w-[288px] items-center justify-center rounded-md border border-linha bg-branco p-2.5 max-md:w-full">
      {children}
    </div>
  );
}

/** A coluna do quadro. Existe para os quatro modos terem a MESMA largura e o mesmo respiro. */
function ColunaQuadro({ children }: { children: ReactNode }) {
  return <div className="w-[288px] max-md:w-full">{children}</div>;
}

/**
 * A linha do prazo. Fica embaixo do quadro, no peso do texto secundário, e NÃO é uma faixa âmbar:
 * este provedor nunca declara expiração (medido no Go — não há campo de TTL em lugar nenhum do que
 * ele devolve), então o aviso apareceria em 100% dos pareamentos. Faixa que aparece sempre deixa de
 * ser lida, e queima o âmbar para quando algo estiver de fato errado.
 */
function LinhaSemPrazo() {
  return <p className="mt-2.5 text-[12.5px] leading-snug text-suave">{AVISO_QR_SEM_PRAZO}</p>;
}

/**
 * A saída de emergência em texto. Ninguém digita um `ref` do WhatsApp à mão, então no caminho feliz
 * ela é ruído em cima do único objeto que a pessoa precisa enxergar — mas é o que resta quando o
 * desenho não sai. Fica dobrada num `<details>` nativo: zero JS, teclado de graça.
 *
 * No dialeto de produção o código NÃO chega junto com a imagem (o WuzAPI manda um campo só), e por
 * isso ela some por completo em vez de abrir um bloco vazio.
 */
function CodigoEmTexto({ codigo }: { codigo: string | null }) {
  if (!codigo) return null;
  return (
    <details className="mt-2.5">
      <summary className="cursor-pointer list-none text-[12.5px] text-suave hover:text-tinta">
        Ver o código em texto
      </summary>
      <code className="mt-1.5 block max-h-[120px] overflow-auto break-all rounded-md border border-linha bg-branco px-2 py-1.5 font-mono text-[10.5px] leading-tight text-tinta">
        {codigo}
      </code>
    </details>
  );
}

/**
 * O quadro, nos seus quatro modos. Quem decide o modo é `decidirQuadro`; aqui só existe desenho.
 *
 * A ordem dos modos é a ordem de fidelidade: a imagem do provedor passou por um codificador só (o
 * dele), o nosso desenho passa por dois (o dele e o nosso). Quando as duas formas chegam, ganha a
 * que tem menos passos entre o WhatsApp e a câmera.
 *
 * Falha aqui é DIREÇÃO, não humor: cada modo que não é o feliz diz o que aconteceu e o que fazer.
 */
function QuadroDePareamento({ quadro }: { quadro: QuadroPareamento }) {
  if (quadro.modo === "vazio") {
    return (
      <Quadro>
        <span className="px-4 text-center text-[12.5px] leading-snug text-mute">{quadro.texto}</span>
      </Quadro>
    );
  }

  if (quadro.modo === "imagem") {
    return (
      <ColunaQuadro>
        <Quadro>
          {/* `max-*` e não `h-full w-full`: a imagem NUNCA é ampliada. Um QR raster esticado perde
              a beira do módulo, e um QR borrado é exatamente o defeito que esta tela existe para
              não ter. Menor e nítido lê; maior e borrado não. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- `data:` URI; o Image do Next
              otimizaria uma imagem que já vem pronta e some em segundos. */}
          <img
            src={quadro.imagem}
            alt="Código QR para conectar o WhatsApp deste número."
            className="max-h-full max-w-full"
            decoding="sync"
            draggable={false}
          />
        </Quadro>
        {quadro.semPrazo ? <LinhaSemPrazo /> : null}
        <CodigoEmTexto codigo={quadro.codigo} />
      </ColunaQuadro>
    );
  }

  if (quadro.modo === "codigo_cru") {
    return (
      <ColunaQuadro>
        <Quadro>
          <code className="max-h-full w-full overflow-auto break-all px-1 text-center font-mono text-[10px] leading-tight text-tinta">
            {quadro.codigo}
          </code>
        </Quadro>
        <div className="mt-2.5">
          <Faixa tom="ambar">
            Não deu para desenhar o QR deste código. Leia o código acima pelo painel do provedor —
            é o mesmo que iria para o desenho.
          </Faixa>
        </div>
        {quadro.semPrazo ? <LinhaSemPrazo /> : null}
      </ColunaQuadro>
    );
  }

  const { desenho } = quadro;
  return (
    <ColunaQuadro>
      <Quadro>
        <svg
          viewBox={`0 0 ${desenho.lado} ${desenho.lado}`}
          className="h-full w-full"
          // sem isto o navegador antisserrilha a beira de cada módulo e sobra uma costura cinza
          // entre módulos vizinhos — borrão é o que faz a câmera errar.
          shapeRendering="crispEdges"
          role="img"
          aria-label="Código QR para conectar o WhatsApp. Se não conseguir lê-lo, abra “Ver o código em texto” logo abaixo."
        >
          {/* a zona de silêncio já vem na matriz, mas em módulos brancos — que só são brancos se
              houver branco embaixo. O fundo do SVG garante isso mesmo se o quadro mudar de cor. */}
          <rect width={desenho.lado} height={desenho.lado} fill="#FFFFFF" />
          {/* `tinta`, a tinta do app (#1F2328 no tailwind.config), e não preto puro: 15,8:1 contra
              o branco, muito acima do que qualquer decodificador precisa, e o QR deixa de ser um
              quadrado estrangeiro na tela. */}
          <path d={desenho.caminho} fill="#1F2328" />
        </svg>
      </Quadro>
      {quadro.semPrazo ? <LinhaSemPrazo /> : null}
      <CodigoEmTexto codigo={quadro.codigo} />
    </ColunaQuadro>
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
