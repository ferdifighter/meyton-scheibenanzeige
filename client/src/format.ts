/** Ring01 in SSMDB2: Zehntel-Ringe (996 → 99,6) */
export function ring01ToDisplay(value: number | null | undefined): string {
  if (value == null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return (n / 10).toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
