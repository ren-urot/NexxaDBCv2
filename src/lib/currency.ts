// PHP stays the authoritative, actually-charged amount everywhere in the app.
// USD is a display-only conversion, computed from this rate, never the other
// way around. Update this constant as the real rate moves; a later version
// can swap it for a stored/fetched rate without touching call sites.
export const PHP_PER_USD = 57.0;

export function phpToUsd(php: number): number {
  return Math.round((php / PHP_PER_USD) * 100) / 100;
}

export function formatUsd(php: number): string {
  return phpToUsd(php).toFixed(2);
}
