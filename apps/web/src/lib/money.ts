/** All money is integer piasters (1 EGP = 100). */

export function formatEgp(cents: number, options: { compact?: boolean } = {}): string {
  const pounds = cents / 100;
  const digits = Number.isInteger(pounds) ? 0 : 2;
  const value = pounds.toLocaleString("en-EG", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return options.compact ? value : `EGP ${value}`;
}

/** Egyptian shelf prices are whole pounds. */
export function roundToPound(cents: number): number {
  return Math.round(cents / 100) * 100;
}

export function percentOff(cents: number, percent: number): number {
  return roundToPound(cents * (1 - percent / 100));
}
