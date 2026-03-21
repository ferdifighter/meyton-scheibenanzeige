import type { SerieRow } from "./types";

/** Erste Stellung (kleinste), Serien aufsteigend – bis zu 6 Werte für S1…S6 */
export function seriesSlotsForCard(serien: SerieRow[]): (number | null)[] {
  if (serien.length === 0) return Array(6).fill(null);
  const st = Math.min(...serien.map((s) => s.Stellung));
  const rows = serien
    .filter((s) => s.Stellung === st)
    .sort((a, b) => a.Serie - b.Serie);
  const slots: (number | null)[] = Array(6).fill(null);
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const r01 = rows[i].Ring01;
    slots[i] = r01 === 0 ? null : r01;
  }
  return slots;
}
