import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deveRefazer,
  reiniciarDebounceCompartilhado,
  tentarRefazer,
} from "../lib/tempo-real.ts";
import { INTERVALOS, PISO_SEM_TEMPO_REAL, intervaloEfetivo } from "../lib/intervalos-vivos.ts";

/*
 * F4 (Rodada 16) — o debounce das releituras é COMPARTILHADO entre as instâncias do hook na mesma
 * rota. `tentarRefazer` é o ponto por onde TODA instância de `useProjecaoViva` passa: dois hooks
 * montados na mesma página são duas chamadas com a mesma chave de rota. Testar aqui é testar o
 * mesmo caminho que o hook executa, sem precisar de DOM.
 */

const FOLGA = 1200;
// relógio sintético com valor realista: `deveRefazer` compara instantes absolutos
const T0 = 1_753_500_000_000;

test("duas instâncias na MESMA rota, dicas a ~200 ms: UMA releitura", () => {
  reiniciarDebounceCompartilhado();
  // instância A (a conversa) pede em t=0 · instância B (o sino) pede em t=200
  assert.equal(tentarRefazer("/conversas", T0, FOLGA), true, "a primeira releitura acontece");
  assert.equal(tentarRefazer("/conversas", T0 + 200, FOLGA), false, "a segunda é engolida pela folga");
});

test("o defeito que isto conserta: relógios por instância produziriam DUAS", () => {
  // Era assim antes: cada hook tinha o seu `useRef(0)` e nenhum via o do outro.
  const relogioA = 0;
  const relogioB = 0;
  assert.equal(deveRefazer(relogioA, T0, FOLGA), true);
  assert.equal(deveRefazer(relogioB, T0 + 200, FOLGA), true); // ← a releitura em par, ~200 ms depois
});

test("passada a folga, a próxima releitura acontece", () => {
  reiniciarDebounceCompartilhado();
  assert.equal(tentarRefazer("/conversas", T0, FOLGA), true);
  assert.equal(tentarRefazer("/conversas", T0 + FOLGA - 1, FOLGA), false);
  assert.equal(tentarRefazer("/conversas", T0 + FOLGA, FOLGA), true);
});

test("a chave é por ROTA: releitura de outra rota não é engolida", () => {
  reiniciarDebounceCompartilhado();
  assert.equal(tentarRefazer("/conversas", T0, FOLGA), true);
  assert.equal(tentarRefazer("/funil", T0 + 10, FOLGA), true, "rota diferente tem relógio próprio");
  assert.equal(tentarRefazer("/funil", T0 + 20, FOLGA), false);
});

test("N instâncias na mesma rota, mesma janela: exatamente 1 releitura", () => {
  reiniciarDebounceCompartilhado();
  const pediram = [0, 50, 120, 300, 900, 1199].map((t) => tentarRefazer("/tarefas", T0 + t, FOLGA));
  assert.equal(pediram.filter(Boolean).length, 1);
});

test("os intervalos vivem num lugar só, e são os valores acordados no F4", () => {
  assert.deepEqual(
    { ...INTERVALOS },
    { conversas: 30_000, funil: 30_000, tarefas: 15_000, sino: 30_000, carimbo: 45_000 },
  );
  assert.equal(PISO_SEM_TEMPO_REAL, 10_000);
});

test("piso condicional: sem assinatura confirmada, /conversas e /funil NUNCA ficam em 30 s", () => {
  assert.equal(intervaloEfetivo(INTERVALOS.conversas, false), 10_000);
  assert.equal(intervaloEfetivo(INTERVALOS.funil, false), 10_000);
  assert.equal(intervaloEfetivo(INTERVALOS.conversas, true), 30_000);
  assert.equal(intervaloEfetivo(INTERVALOS.funil, true), 30_000);
});

test("o piso nunca ALONGA um intervalo já curto", () => {
  assert.equal(intervaloEfetivo(5_000, false), 5_000);
  assert.equal(intervaloEfetivo(INTERVALOS.tarefas, false), 10_000);
});
