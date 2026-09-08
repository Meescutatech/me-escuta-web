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
import { definirNivelCanal, lerTrocasDeNivel } from "@/app/(app)/configuracoes/canais/actions";
import {
  MEIOS_CONSENTIMENTO,
  ROTULO_MOTIVO_DESCARTE,
  TERMO_CANAL_PESSOAL,
  TERMO_VERSAO,
  descricaoEstadoSessao,
  exigeAceiteDoTermo,
  intervaloRelituraMs,
  podeCriarSessao,
  rotuloEstadoSessao,
  validarConsentimento,
  type FormConsentimento,
  type MeioConsentimento,
} from "./regras/lite-sessao.ts";
import {
  NIVEIS,
  consequenciaNivel,
  nivelDoCanal,
  podeGerirCanais,
  rotuloNivel,
  type Canal,
  type HistoricoNivel,
  type NivelCanal,
  type Papel,
} from "./regras/canais.ts";
import { AVISO_QR_SEM_PRAZO, decidirQuadro, type QuadroPareamento } from "./regras/qr-pareamento.ts";
import { BTN, ENTRADA, Faixa, dataHora } from "./kit";
import { Dialogo } from "./dialogo";

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
  nivelLegivel,
  declaracaoLegivel,
}: {
  canal: Canal;
  meuPapel: Papel | null;
  f8Pronto: boolean;
  /**
   * D70. `false` = a view não expõe `nivel` nesta base. O bloco de nível DIZ que não leu, em vez
   * de desenhar "Estrito" como se soubesse — o comportamento em vigor é mesmo o estrito, mas
   * afirmar ter lido o que não se leu foi o engano do M7, e ele custou uma rodada.
   */
  nivelLegivel: boolean;
  /**
   * D70. `false` = esta base não sabe dizer se ALGUÉM declarou o nível. Duas causas, e a tela
   * separa as duas: ou `nivel` também não existe (`nivelLegivel` false), ou a view expõe `nivel`
   * sem `nivel_declarado` — a forma B do contrato em `dados/canais.ts`, que é a que o banco pode
   * muito bem escolher, já que o valor sai de `config_jsonb` e não de uma coluna. Nesse caso o
   * nível vigente FOI lido; o que não dá para saber é se ele foi escolhido ou se é o padrão.
   */
  declaracaoLegivel: boolean;
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

      <BlocoNivel
        canal={canal}
        nivelLegivel={nivelLegivel}
        declaracaoLegivel={declaracaoLegivel}
        podePapel={podeGerirCanais(meuPapel)}
      />

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
      <BlocoTermo />

      {!podePapel ? (
        <p className="mt-3 text-[13px] text-suave">
          Só admin e Proprietário registram o consentimento.
        </p>
      ) : (
        <>
          {erro ? <div className="mt-3"><Faixa tom="erro">{erro}</Faixa></div> : null}
          <CamposAceite form={form} aoMudar={setForm} />

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

// ══════════════════ D70.b · as duas peças do termo, compartilhadas por DESENHO ══════════════════

/**
 * O TEXTO do termo, e ele é UM só.
 *
 * A extração não é arrumação: o termo aparece em DOIS portões — o inicial (antes de parear) e o da
 * troca de nível — e dois blocos copiados divergem na primeira manutenção. Divergir aqui significa
 * a titular aceitar um texto na tela e o banco carimbar outra versão, que é exatamente o defeito
 * que a trava de versão (`exigeAceiteDoTermo`) existe para impedir. Um lugar, um texto, uma versão.
 */
function BlocoTermo() {
  return (
    <div className="mt-2.5 whitespace-pre-line rounded-md border border-linha bg-branco p-3.5 text-[13px] leading-relaxed text-tinta">
      {TERMO_CANAL_PESSOAL}
    </div>
  );
}

/** Os três campos do aceite + a confirmação. Mesmos campos nos dois portões, pela mesma razão. */
function CamposAceite({
  form,
  aoMudar,
}: {
  form: FormConsentimento;
  aoMudar: (f: FormConsentimento) => void;
}) {
  return (
    <>
      <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-suave">Quem é a titular</span>
          <input
            className={ENTRADA}
            value={form.titularNome}
            onChange={(e) => aoMudar({ ...form, titularNome: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-suave">Como ela consentiu</span>
          <select
            className={ENTRADA}
            value={form.meio}
            onChange={(e) => aoMudar({ ...form, meio: e.target.value as MeioConsentimento })}
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
            onChange={(e) => aoMudar({ ...form, aceitoEm: e.target.value })}
          />
        </label>
      </div>

      <label className="mt-3.5 flex items-start gap-2.5 text-[13px] text-tinta">
        <input
          type="checkbox"
          className="mt-1 accent-[#252F63]"
          checked={form.aceiteMarcado}
          onChange={(e) => aoMudar({ ...form, aceiteMarcado: e.target.checked })}
        />
        <span>
          Confirmo que ela leu este texto e concordou. O consentimento fica registrado com a versão
          do termo — se o texto mudar, este aceite não cobre o novo.
        </span>
      </label>
    </>
  );
}

// ═══════════════════════════ D70 · o bloco “Nível do canal” ═══════════════════════════

/**
 * De quem este canal aceita mensagem, e para quem ele deixa enviar. **Cartões, nunca `<select>`.**
 *
 * A escolha do desenho é a mesma do seletor de provedor lá em `tabela-canais.tsx`, e pela mesma
 * razão: um `<select>` mostra três NOMES e esconde as três CONSEQUÊNCIAS, e aqui a consequência é
 * a decisão inteira — “aberto” não quer dizer nada para quem lê, enquanto “o sistema pode escrever
 * primeiro para quem nunca falou com você, e é isso que costuma fazer o WhatsApp banir” quer.
 *
 * QUATRO estados de leitura, não dois (e é o mesmo degrade honesto do M7 e do R22):
 *   · sem `nivel`            → a tela diz que NÃO LEU. O que vale é estrito, e ela diz por quê.
 *   · `nivel` sem declaração → o nível vigente foi LIDO; esta base é que não sabe dizer se alguém
 *                              o escolheu. A tela mostra o vigente e nomeia o que não sabe — e
 *                              salvar continua liberado, senão a forma B da view desabilitaria o
 *                              botão para sempre num ambiente sem defeito nenhum.
 *   · lido, nunca declarado  → vale estrito, mas ninguém escolheu. É a linha que pede decisão.
 *   · lido e declarado       → alguém escolheu, e a tela marca qual.
 */
function BlocoNivel({
  canal,
  nivelLegivel,
  declaracaoLegivel,
  podePapel,
}: {
  canal: Canal;
  nivelLegivel: boolean;
  declaracaoLegivel: boolean;
  podePapel: boolean;
}) {
  const router = useRouter();
  const vigente = nivelDoCanal(canal);
  const [escolha, setEscolha] = useState<NivelCanal>(vigente);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pedindoAceite, setPedindoAceite] = useState<NivelCanal | null>(null);
  const [historico, setHistorico] = useState<HistoricoNivel | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    void lerTrocasDeNivel(canal.canal_id).then(setHistorico);
  }, [canal.canal_id]);

  // O aceite vigente da titular. `exigeAceiteDoTermo` é a regra pura, e é ela que decide — aqui
  // só se pergunta, para o botão dizer de antemão o que vai acontecer no clique.
  const precisaAceite = exigeAceiteDoTermo(escolha, canal.consentimento_texto_versao);

  /*
   * DUAS coisas contra-intuitivas, e as duas são deliberadas:
   *
   *  1. sem `nivelLegivel` NÃO SE SALVA. A coluna não existe nesta base, então a conferência de
   *     projeção falharia — e oferecer um botão que se sabe que vai falhar é a mesma "recusa como
   *     primeira notícia" que esta tela recusa desde o F9. A faixa acima diz o porquê.
   *  2. dá para salvar mesmo com a escolha IGUAL à vigente, num caso só: quando ninguém declarou
   *     nada. Declarar o estrito de propósito não é no-op — muda o canal de "ninguém decidiu" para
   *     "alguém decidiu que é assim", que são os dois estados que a flag `nivel_declarado` separa.
   */
  //  3. quando a view traz `nivel` mas NÃO `nivel_declarado` (forma B), salvar continua liberado
  //     mesmo com a escolha igual à vigente. Aqui não se sabe se alguém já declarou, e travar o
  //     botão por uma ignorância NOSSA seria transformar o degrade transitório em estado final:
  //     a gestora ficaria sem poder declarar nada num ambiente onde o banco está inteiro.
  const declararODefault = nivelLegivel && declaracaoLegivel && !canal.nivel_declarado && escolha === vigente;
  const podeSalvar =
    nivelLegivel && (escolha !== vigente || declararODefault || !declaracaoLegivel);

  function salvar(nivel: NivelCanal) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await definirNivelCanal(canal.canal_id, nivel);
      if (!r.ok) {
        setErro(r.motivo ?? "não deu para trocar o nível");
        return;
      }
      setPedindoAceite(null);
      setAviso(
        `Nível deste canal agora é “${rotuloNivel(nivel)}”. O runtime relê os canais a cada 60 segundos — até lá, a borda continua aplicando o nível anterior.`,
      );
      setHistorico(await lerTrocasDeNivel(canal.canal_id));
      router.refresh();
    });
  }

  return (
    <div className="mt-5 border-t border-linha pt-4">
      <h3 className="text-[14px] font-semibold text-tinta">Nível do canal</h3>
      <p className="mt-1 text-[13px] text-suave">
        De quem este número aceita mensagem e para quem o sistema pode enviar. É configuração — não
        depende de deploy —, e todo canal nasce no mais fechado.
      </p>

      {!nivelLegivel ? (
        <div className="mt-3">
          <Faixa tom="ambar">
            Esta tela <b>não conseguiu ler</b> o nível deste canal: a coluna{" "}
            <span className="font-mono">nivel</span> ainda não existe nesta base (a migration do
            nível não subiu aqui). O que está valendo é o <b>Estrito</b>, porque é o que o código
            faz quando não há nível declarado — mas isso é dedução, não leitura. O botão fica
            desligado: enquanto a migration não entrar, a troca nem chega a ser gravada (o banco
            não conhece o evento <span className="font-mono">canal_nivel_definido</span> e recusa
            a transação inteira), então oferecer o botão seria prometer uma escrita que não
            acontece.
          </Faixa>
        </div>
      ) : !declaracaoLegivel ? (
        <p className="mt-2.5 text-[13px] text-tinta">
          Vigente: <b>{rotuloNivel(vigente)}</b> —{" "}
          <span className="text-suave">
            e esta base não diz se alguém escolheu isso ou se é o padrão de quem nunca declarou. A
            view expõe <span className="font-mono">nivel</span>, mas não{" "}
            <span className="font-mono">nivel_declarado</span>. O nível acima FOI lido; a
            procedência dele é que não.
          </span>
        </p>
      ) : canal.nivel_declarado ? (
        <p className="mt-2.5 text-[13px] text-tinta">
          Vigente: <b>{rotuloNivel(vigente)}</b> — declarado.
        </p>
      ) : (
        <p className="mt-2.5 text-[13px] text-tinta">
          Vigente: <b>Estrito</b> — <span className="text-suave">e ninguém escolheu isso</span>. É o
          padrão de quem nunca declarou nível. Vale o mesmo que o Estrito escolhido; o que muda é
          que esta linha ainda espera uma decisão.
        </p>
      )}

      {erro ? <div className="mt-3"><Faixa tom="erro">{erro}</Faixa></div> : null}
      {aviso ? <div className="mt-3"><Faixa tom="info">{aviso}</Faixa></div> : null}

      {!podePapel ? (
        <p className="mt-3 text-[13px] text-suave">
          Só admin e Proprietário trocam o nível — a porta recusa evento de canal de quem não é.
        </p>
      ) : (
        <>
          <div className="mt-3">
            {NIVEIS.map((n) => {
              const marcado = escolha === n;
              const eOVigente = vigente === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setEscolha(n)}
                  aria-pressed={marcado}
                  className={`mb-2 flex w-full items-start gap-2.5 rounded-md border p-3 text-left hover:bg-hover ${
                    marcado ? "border-navy bg-[#EAECF5]" : "border-linha"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1 h-3.5 w-3.5 flex-none rounded-full border ${
                      marcado ? "border-navy bg-navy" : "border-mute"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-tinta">
                      {rotuloNivel(n)}
                      {eOVigente ? (
                        <span className="ml-2 text-[11.5px] font-normal text-suave">· em vigor</span>
                      ) : null}
                      {n === "estrito" ? (
                        <span className="ml-2 text-[11.5px] font-normal text-suave">· padrão</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-suave">
                      {consequenciaNivel(n)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {precisaAceite ? (
            <Faixa tom="ambar">
              Sair do Estrito muda o que a titular aceitou. Ela consentiu sobre a versão{" "}
              <b>{canal.consentimento_texto_versao ?? "não registrada"}</b> do termo, e a vigente é
              a <b>{TERMO_VERSAO}</b> — salvar abre o texto novo para o aceite antes de trocar.
            </Faixa>
          ) : null}

          <div className="flex items-center justify-end gap-2.5">
            <button
              className={BTN.primario}
              type="button"
              disabled={pendente || !podeSalvar}
              onClick={() => {
                if (precisaAceite) {
                  setErro(null);
                  setPedindoAceite(escolha);
                  return;
                }
                salvar(escolha);
              }}
            >
              {!nivelLegivel
                ? "Sem a coluna, não dá para salvar"
                : precisaAceite
                  ? "Ler o termo e salvar nível"
                  : declararODefault || (!declaracaoLegivel && escolha === vigente)
                    ? "Declarar este nível"
                    : escolha === vigente
                      ? "Nível salvo"
                      : "Salvar nível"}
            </button>
          </div>
        </>
      )}

      <HistoricoNivelNaTela historico={historico} />

      {pedindoAceite ? (
        <DialogoAceiteENivel
          canal={canal}
          nivel={pedindoAceite}
          pendente={pendente}
          aoFechar={() => setPedindoAceite(null)}
          aoErro={setErro}
          aoConcluirAceite={() => salvar(pedindoAceite)}
        />
      ) : null}
    </div>
  );
}

/**
 * D71.c · A AUDITORIA, e ela é uma série de INTENÇÕES — não o estado.
 *
 * O que está escrito no rodapé não é ressalva de rodapé: o nível vigente vive em
 * `core.canal_whatsapp.config_jsonb`, e `porta.reconstruir_projecao` NÃO reconstrói essa tabela
 * (`no_replay: false`, medido). Um UPDATE direto no banco muda o nível sem passar por evento
 * nenhum, e não aparece aqui. Dizer “o nível fica no ledger com autor e data” seria vender esta
 * lista como o que ela não é.
 */
function HistoricoNivelNaTela({ historico }: { historico: HistoricoNivel | null }) {
  if (!historico || historico.indisponivel) return null;
  return (
    <div className="mt-4">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-suave">
        Quem pediu qual nível
      </span>
      {historico.trocas.length === 0 ? (
        <p className="mt-1.5 text-[12.5px] text-suave">
          Nenhuma troca de nível registrada para este canal.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {historico.trocas.map((t) => (
            <li key={t.evento_id} className="text-[12.5px] text-suave">
              <span className="text-tinta">{t.autor_nome ?? t.ator}</span> pediu{" "}
              <span className="text-tinta">{t.nivel}</span> em {dataHora(t.quando)}
              {t.motivo ? ` — ${t.motivo}` : ""}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[11.5px] text-mute">
        Esta lista são os pedidos registrados no ledger. O valor que está valendo agora vem da
        configuração do canal — alteração feita direto no banco não passa por evento e não aparece
        aqui.
      </p>
    </div>
  );
}

/**
 * D70.b · O portão que não existia: sair do estrito exige aceite na versão VIGENTE do termo.
 *
 * A ORDEM É A METADE DO ITEM. Grava-se PRIMEIRO o `canal_consentimento_registrado` na versão nova
 * e só então o evento de nível — e se o primeiro falhar, o segundo não sai. Na ordem inversa, uma
 * falha no meio deixaria o canal afrouxado com a titular tendo aceitado outro texto, que é o
 * estado exato que este portão existe para impedir; e o ledger é append-only, então não há
 * desfazer barato.
 */
function DialogoAceiteENivel({
  canal,
  nivel,
  pendente,
  aoFechar,
  aoErro,
  aoConcluirAceite,
}: {
  canal: Canal;
  nivel: NivelCanal;
  pendente: boolean;
  aoFechar: () => void;
  aoErro: (m: string) => void;
  aoConcluirAceite: () => void;
}) {
  const [form, setForm] = useState<FormConsentimento>({
    canalId: canal.canal_id,
    titularNome: canal.consentimento_titular ?? canal.nome,
    meio: "whatsapp",
    aceitoEm: new Date().toISOString().slice(0, 10),
    textoVersao: TERMO_VERSAO,
    aceiteMarcado: false,
  });
  const [gravando, iniciar] = useTransition();
  const problemas = validarConsentimento(form, Date.now());

  return (
    <Dialogo
      titulo={`Aceite do termo ${TERMO_VERSAO} para ir a “${rotuloNivel(nivel)}”`}
      largura={620}
      aoFechar={aoFechar}
      acoes={
        <>
          <button className={BTN.secundario} type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            className={BTN.primario}
            type="button"
            disabled={pendente || gravando || Object.keys(problemas).length > 0}
            onClick={() =>
              iniciar(async () => {
                // 1º o aceite. Se ele não gravar, o nível NÃO é trocado.
                const r = await registrarConsentimento({
                  ...form,
                  textoVersao: TERMO_VERSAO,
                  aceitoEm: new Date(form.aceitoEm).toISOString(),
                });
                if (!r.ok) {
                  aoErro(r.motivo ?? "não deu para registrar o aceite — o nível não foi trocado");
                  return;
                }
                // 2º o nível. A action reconfere a versão do aceite pelo BANCO, então este
                // caminho não “passa por cima” do portão: ele o satisfaz.
                aoConcluirAceite();
              })
            }
          >
            Aceitar e trocar o nível
          </button>
        </>
      }
    >
      <p className="text-[13px] text-suave">
        O texto abaixo é a versão <b>{TERMO_VERSAO}</b>. A titular aceitou a versão{" "}
        <b>{canal.consentimento_texto_versao ?? "não registrada"}</b>, que descrevia um canal onde
        mensagem de desconhecido era sempre descartada — e é justamente isso que muda.
      </p>
      <BlocoTermo />
      <CamposAceite form={form} aoMudar={setForm} />
      {Object.values(problemas)[0] ? (
        <p className="mt-2 text-[11.5px] text-suave">{Object.values(problemas)[0]}</p>
      ) : null}
    </Dialogo>
  );
}
