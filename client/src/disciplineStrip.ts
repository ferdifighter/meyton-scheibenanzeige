/**
 * Streifenfarbe im Kartenkopf: gleiche Disziplin (String aus der DB) → gleiche Farbe.
 */
const DISCIPLINE_STRIP_VARS = [
  "var(--disc-strip-0)",
  "var(--disc-strip-1)",
  "var(--disc-strip-2)",
  "var(--disc-strip-3)",
  "var(--disc-strip-4)",
  "var(--disc-strip-5)",
  "var(--disc-strip-6)",
  "var(--disc-strip-7)",
] as const;

export function disciplineStripBackground(discipline: string): string {
  const d = String(discipline).trim();
  if (!d) return DISCIPLINE_STRIP_VARS[0];
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) {
    h ^= d.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return DISCIPLINE_STRIP_VARS[
    Math.abs(h) % DISCIPLINE_STRIP_VARS.length
  ];
}
