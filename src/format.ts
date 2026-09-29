export const WEI = 10n ** 18n;

/** Whole tokens from wei. Keeps 6 decimals, plenty for display. */
export function fromWei(wei: bigint): number {
  return Number(wei / 10n ** 12n) / 1e6;
}

export function num(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** $30.24M, $195.1k, $178: four significant digits above a thousand. */
export function usd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toPrecision(4)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toPrecision(4)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toPrecision(4)}k`;
  return `${sign}$${Math.round(a)}`;
}

export function price(p: number): string {
  return `$${p.toPrecision(4)}`;
}

export function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}
