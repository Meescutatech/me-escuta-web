// Formatação de dinheiro em CENTAVOS (BRL) — cross-cutting: consumida por
// `features/crm` (deal.value, line items, comissão), `features/products`
// (unitPrice) e pela aba Negócios do sheet de contato em `features/contacts`,
// que não pode importar de `features/crm` (fronteira FSD). Mesma razão de
// `@/lib/activities` e `@/lib/closing-reasons`.
//
// A unidade é sempre o CENTAVO inteiro, igual a `dealSchema.value` /
// `productSchema.unitPrice` em `@crm/shared` e ao `<MoneyInput />`. Nunca passe
// reais aqui.

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** `value` em CENTAVOS (BRL) → "R$ 1.234,56". */
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value / 100);
}

/**
 * `value` em CENTAVOS (BRL) → forma compacta "R$ 66,75M" / "R$ 475,00K" — cabe em
 * cards/charts. Abaixo de mil reais cai no formato completo.
 */
export function formatCurrencyCompact(value: number): string {
  const reais = value / 100;
  const abs = Math.abs(reais);
  const dec = (n: number) =>
    n.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (abs >= 1_000_000) return `R$ ${dec(reais / 1_000_000)}M`;
  if (abs >= 1_000) return `R$ ${dec(reais / 1_000)}K`;
  return formatCurrency(value);
}

/** Teto do `integer` do Postgres (centavos) — R$ 21.474.836,47. Evita overflow. */
export const MAX_CENTS = 2_147_483_647;

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** CENTAVOS → "1.234,56" (sem símbolo — o "R$" é do chamador). */
export function formatCentsDecimal(cents: number): string {
  return decimalFormatter.format(cents / 100);
}

/**
 * Regra de DIGITAÇÃO de dinheiro: o campo funciona como calculadora — só os
 * dígitos contam e eles entram pela direita ("45000" → 450,00). É a mesma regra
 * do `<MoneyInput />`; ter duas faria o mesmo número virar valores diferentes
 * dependendo da tela em que foi digitado.
 */
export function digitsToCents(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  return Math.min(Number.parseInt(digits, 10), MAX_CENTS);
}

/** Máscara ao vivo: o que a pessoa digitou → "1.234,56". */
export function maskCentsInput(raw: string): string {
  return raw.trim() ? formatCentsDecimal(digitsToCents(raw)) : "";
}
