/**
 * Camada única de relatório do dashboard — o `components/report` do LiderHub portado em 10/09/2026
 * para o domínio da Me Escuta (PT-BR, Tailwind v3, tokens do preset).
 *
 * Duas peças de cabeçalho de bloco convivem de propósito: **tem cor a decodificar ou controle no
 * cabeçalho → `CartaoGrafico`/`SecaoTabela`; senão → `CabecalhoSecao`.**
 */
export { CartaoGrafico, ALTURA_GRAFICO } from "./cartao-grafico";
export { SeloVariacao } from "./selo-variacao";
export { DicaInfo, ItemLegenda } from "./dica-info";
export { CelulaMetrica, TrilhoMetrica, ALTURA_LINHA_METRICA, LARGURA_TRILHO, type BarraMetrica, type TomMetrica } from "./celula-metrica";
export { CabecalhoSecao } from "./cabecalho-secao";
export { SecaoTabela } from "./secao-tabela";
export { CartaoIndicador, CartaoIndicadorEsqueleto, type TamanhoIndicador } from "./cartao-indicador";
export { BlocoVazio } from "./estados";
export { Rosca, LegendaRosca, BarraNaCelula, BarraParticipacao, MiniBarras, CORES_SERIE, COR_NEUTRA, type Fatia } from "./viz";
export { barraDeTempo, detalheVariacao, fracaoDoMaximo, fracaoPct, rotuloVariacao, tomVariacao, variacaoRelativa, LIMIAR_ESTAVEL } from "./formato";
