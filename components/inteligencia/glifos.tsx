import { cn } from "@/lib/utils";
import { MarcaJarvis } from "@/components/jarvis/marca";
import type { ChaveAgente } from "@/lib/ensaio/inteligencia";

/**
 * OS GLIFOS DOS AGENTES — um alfabeto, não quatro desenhos.
 *
 * Todos são feitos das mesmas duas peças do arco do Jarvis (escolhido pelo Diogo em 10/09): um
 * PONTO cheio e um ARCO aberto, traço 1,5, ponta redonda, `currentColor`. O que muda entre eles é
 * a geometria, e a geometria diz o que o agente faz:
 *
 *  · Jarvis   — o arco por cima do ponto: ele nota e avisa. (a marca, importada, não recriada)
 *  · Clara    — o ponto à esquerda e duas ondas abrindo à direita: a conversa que sai.
 *  · Levindo  — o arco virado ponteiro sobre um ponto: a faixa, de A a E.
 *  · Priscila — o arco quase fechado em ciclo, terminando num ponto: a régua que volta.
 *
 * A COR nunca diz quem é o agente — diz o estado dele. Identidade é forma. Por isso o glifo herda
 * `currentColor` e a capa é a única coisa que carrega um tom próprio.
 */

export function GlifoAgente({
  chave,
  tamanho = 20,
  vivo = false,
  rotulo,
  className,
}: {
  chave: ChaveAgente;
  tamanho?: number;
  vivo?: boolean;
  rotulo?: string;
  className?: string;
}) {
  if (chave === "jarvis") {
    const t = tamanho <= 16 ? 16 : tamanho <= 20 ? 20 : 32;
    return <MarcaJarvis tamanho={t} vivo={vivo} rotulo={rotulo} className={className} />;
  }
  const a11y = rotulo ? { role: "img" as const, "aria-label": rotulo } : { "aria-hidden": true as const };
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth={tamanho <= 16 ? 1.75 : 1.5}
      strokeLinecap="round"
      className={cn("shrink-0", className)}
      {...a11y}
    >
      <TracosDoGlifo chave={chave} vivo={vivo} />
    </svg>
  );
}

function TracosDoGlifo({ chave, vivo }: { chave: ChaveAgente; vivo?: boolean }) {
  const ponto = (cx: number, cy: number, r = 2.1) => (
    <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" className={cn(vivo && "fill-primary pulso-ao-vivo")} />
  );
  if (chave === "clara") {
    return (
      <>
        <path d="M12.4 7.4a6 6 0 0 1 0 9.2" />
        <path d="M16.2 4.6a10 10 0 0 1 0 14.8" />
        {ponto(7.4, 12)}
      </>
    );
  }
  if (chave === "levindo") {
    return (
      <>
        <path d="M4 16.5a8 8 0 0 1 16 0" />
        <path d="M12 16.5 16.4 11" />
        {ponto(12, 16.5, 1.9)}
      </>
    );
  }
  // priscila — o ciclo que volta
  return (
    <>
      <path d="M15.9 5.6a7.6 7.6 0 1 0 0 12.8" />
      {ponto(16.2, 18.3, 1.9)}
    </>
  );
}

/**
 * A CAPA do card — a assinatura do agente repetida em eco, como onda.
 *
 * Não é um banco de imagens nem um gradiente de enfeite: é o glifo dele desenhado quatro vezes em
 * escalas crescentes, saindo da borda. Cada agente tem uma onda diferente porque tem um glifo
 * diferente. Ligado, a onda pega o tom do agente; desligado, ela vira hairline cinza — a capa
 * também diz o estado, de longe, antes de qualquer texto.
 */
export function CapaAgente({
  chave,
  tom,
  ligado,
  altura = 92,
  className,
}: {
  chave: ChaveAgente;
  tom: 1 | 2 | 3 | 4 | 5;
  ligado: boolean;
  altura?: number;
  className?: string;
}) {
  const cor = ligado ? `var(--chart-${tom})` : "var(--muted-foreground)";
  const fundo = ligado
    ? `linear-gradient(160deg, color-mix(in oklab, var(--chart-${tom}) 13%, var(--card)) 0%, var(--card) 72%)`
    : `linear-gradient(160deg, var(--muted) 0%, var(--card) 72%)`;
  return (
    <div
      className={cn("relative overflow-hidden border-b border-border/60", className)}
      style={{ height: altura, background: fundo }}
      aria-hidden
    >
      <svg
        viewBox="0 0 200 92"
        preserveAspectRatio="xMinYMid slice"
        className="absolute inset-0 h-full w-full"
        fill="none"
        stroke={cor}
        strokeLinecap="round"
        style={{ opacity: ligado ? 0.42 : 0.3 }}
      >
        <Onda chave={chave} />
      </svg>
      <div
        className="absolute right-4 top-1/2 -translate-y-1/2"
        style={{ color: cor, opacity: ligado ? 0.9 : 0.55 }}
      >
        <GlifoAgente chave={chave} tamanho={32} />
      </div>
    </div>
  );
}

/** o eco: o mesmo traço, quatro raios. Origem na esquerda, para o card ler da esquerda. */
function Onda({ chave }: { chave: ChaveAgente }) {
  const raios = [22, 40, 58, 76];
  if (chave === "clara") {
    return (
      <>
        {raios.map((r, i) => (
          <path key={r} d={`M ${18 + r * 0.52} ${46 - r} a ${r} ${r} 0 0 1 0 ${r * 2}`} strokeWidth={1.4 - i * 0.15} />
        ))}
        <circle cx="18" cy="46" r="3.4" fill="currentColor" stroke="none" />
      </>
    );
  }
  if (chave === "levindo") {
    return (
      <>
        {raios.map((r, i) => (
          <path key={r} d={`M ${20 - r * 0.1} 74 a ${r} ${r} 0 0 1 ${r * 2} 0`} strokeWidth={1.4 - i * 0.15} />
        ))}
        <circle cx="20" cy="74" r="3.4" fill="currentColor" stroke="none" />
      </>
    );
  }
  if (chave === "priscila") {
    return (
      <>
        {raios.map((r, i) => (
          <path
            key={r}
            d={`M ${24 + r * 0.62} ${46 - r * 0.78} a ${r} ${r} 0 1 0 0 ${r * 1.56}`}
            strokeWidth={1.4 - i * 0.15}
          />
        ))}
        <circle cx="24" cy="46" r="3.4" fill="currentColor" stroke="none" />
      </>
    );
  }
  // jarvis — o mesmo arco da marca, quatro raios, todos abrindo por cima do ponto
  return (
    <>
      {raios.map((r, i) => (
        <path
          key={r}
          d={`M ${34 - r * 0.72} ${70 - r * 0.72} A ${r} ${r} 0 0 1 ${34 + r * 0.86} 70`}
          strokeWidth={1.4 - i * 0.15}
        />
      ))}
      <circle cx="34" cy="70" r="3.4" fill="currentColor" stroke="none" />
    </>
  );
}
