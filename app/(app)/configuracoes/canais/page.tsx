import { lerPapelAtual, lerUidAtual } from "@/components/configuracoes/dados/porta";
import { lerCanais, lerMinhasLotacoes } from "@/components/configuracoes/dados/canais";
import { lerSessao } from "@/components/configuracoes/dados/lite-sessao";
import { lerDominioDepartamentos } from "@/lib/dados/departamentos";
import { lerDadosMembros } from "@/lib/dados/membros-reais";
import { TabelaCanais, type CanalNaTela } from "@/components/configuracoes/tabela-canais";
import { lerSessaoEnsaio, DEPARTAMENTOS_ENSAIO } from "@/lib/ensaio/sessao";
import { gerarCanaisEnsaio } from "@/lib/ensaio/fixtures/canais";
import { gerarMembrosEnsaio } from "@/lib/ensaio/fixtures/membros";
import { CanaisEnsaio } from "@/components/ensaio/canais";

export const dynamic = "force-dynamic";

/**
 * F9 · /configuracoes/canais — servidor sem lógica: papel + canais + estado de sessão dos não
 * oficiais, em paralelo, e o resto é do componente.
 *
 * O gate do F8 chega por ENV, não por heurística. Quem sabe se o F8 está em produção e verificado
 * por V8 é o Estaleiro; inventar aqui um "parece pronto" seria o jeito mais fácil de destravar o
 * pareamento de um número pessoal sem ninguém ter verificado nada. Sem a variável, o portão fica
 * FECHADO — o default é o lado seguro.
 */
export default async function CanaisPage() {
  // W-D2 · modo ensaio: tabela nova, com fixture. Membro só vê o próprio número (R4).
  const ensaio = lerSessaoEnsaio();
  if (ensaio) {
    const agora = new Date();
    const gestao = ensaio.papel === "owner" || ensaio.papel === "admin";
    const lotada = new Set(ensaio.departamentos.map((d) => d.departamento));
    const canais = gerarCanaisEnsaio(agora).filter(
      (c) => gestao || c.responsavel_id === ensaio.id || lotada.has(c.departamento),
    );
    return (
      <CanaisEnsaio
        eu={ensaio}
        canais={canais}
        membros={gerarMembrosEnsaio(agora)}
        departamentos={DEPARTAMENTOS_ENSAIO}
        agoraIso={agora.toISOString()}
      />
    );
  }
  // R22/A1 · o domínio de departamento vem do BANCO (`core.v_departamento`), no servidor, junto das
  // outras leituras. Era uma constante de quatro valores dentro do componente, e três dos quatro
  // não existiam no banco (D22-1 / ARB-R18-02).
  // 14/09 · as PESSOAS entram na leitura porque o número não oficial é de uma delas: a porta exige
  // `responsavel_id` e recusa o registro sem ele. Lista vazia é estado tratado na tela (o caminho é
  // convidar em Membros), nunca um seletor vazio sem explicação.
  // 16/09 · o uid entra porque o membro registra o PRÓPRIO número: é ele que fixa o dono no painel.
  // E as lotações dele, porque a porta só aceita o número num departamento em que ele está (PMEE6).
  const [papel, uid, lotacoes, lidos, dominio, membros] = await Promise.all([
    lerPapelAtual(),
    lerUidAtual(),
    lerMinhasLotacoes(),
    lerCanais(),
    lerDominioDepartamentos(),
    lerDadosMembros(),
  ]);
  const pessoas = (membros?.membros ?? [])
    .filter((m) => m.ativo)
    .map((m) => ({ id: m.id, nome: m.nome, email: m.email }));

  const canais: CanalNaTela[] = await Promise.all(
    lidos.canais.map(async (c) => {
      if (c.provedor !== "nao_oficial") return c;
      const { sessao } = await lerSessao(c.canal_id);
      return { ...c, sessao: sessao ? { status: sessao.status, viva: false } : null };
    }),
  );

  return (
    <TabelaCanais
      canais={canais}
      meuPapel={papel}
      meuId={uid}
      minhasLotacoes={lotacoes}
      indisponivel={lidos.indisponivel}
      f8Pronto={process.env.F8_EM_PRODUCAO === "sim"}
      departamentos={dominio.departamentos}
      pessoas={pessoas}
      dominioIndisponivel={dominio.indisponivel}
      r22Legivel={lidos.r22Legivel}
      nivelLegivel={lidos.nivelLegivel}
      declaracaoLegivel={lidos.declaracaoLegivel}
    />
  );
}
