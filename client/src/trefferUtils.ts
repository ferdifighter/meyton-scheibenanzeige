import type { TrefferRow } from "./types";

/** Letzter Wertungsschuss (nach Zeitstempel, sonst Stellung/Treffer). */
export function getLastTreffer(treffer: TrefferRow[]): TrefferRow | null {
  if (treffer.length === 0) return null;
  return [...treffer].sort((a, b) => {
    const ta = new Date(a.Zeitstempel).getTime();
    const tb = new Date(b.Zeitstempel).getTime();
    if (tb !== ta) return tb - ta;
    if (b.Stellung !== a.Stellung) return b.Stellung - a.Stellung;
    return b.Treffer - a.Treffer;
  })[0];
}
