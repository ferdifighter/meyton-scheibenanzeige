/**
 * Richtung des Treffers relativ zur Scheibenmitte (x/y in 1/100 mm wie SSMDB2).
 * Gleiche Orientierung wie die Scheibengrafik: xm nach rechts, ym nach oben.
 */
export type TrefferRichtung8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const RICHTUNG_LABEL: Record<TrefferRichtung8, string> = {
  0: "Ost",
  1: "Nordost",
  2: "Nord",
  3: "Nordwest",
  4: "West",
  5: "Südwest",
  6: "Süd",
  7: "Südost",
};

/** 8 Hauptrichtungen (45°-Sektoren), null = Mitte (0,0). */
export function trefferRichtung8Index(
  x: number,
  y: number
): TrefferRichtung8 | null {
  const xm = x / 100;
  const ym = y / 100;
  /* praktisch Mitte (Koordinaten in mm) */
  if (Math.hypot(xm, ym) < 0.02) return null;
  let deg = (Math.atan2(ym, xm) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  const sector = Math.floor((deg + 22.5) / 45) % 8;
  return sector as TrefferRichtung8;
}

export function trefferRichtungLabel(x: number, y: number): string {
  const i = trefferRichtung8Index(x, y);
  if (i == null) return "Mitte (0/0)";
  return `Richtung ${RICHTUNG_LABEL[i]}`;
}
