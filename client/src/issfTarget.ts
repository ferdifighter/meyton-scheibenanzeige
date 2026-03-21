/**
 * ISSF / DSB 10 m Luftgewehr (Regelscheibe):
 * Außenring 1: Ø 45,5 mm; Ringe 2–9 je 5 mm kleiner; Ring 10 (Innenzehner): Ø 0,5 mm.
 * Quelle u. a. ISSF Paper Target / DSB-Sportordnung (Ringdurchmesser in mm).
 *
 * `ringOuterRadiiMm()[k-1]` = Außenradius des k-ten Ringes (mm vom Mittelpunkt).
 */
export const ISSF_10M_DIAMETERS_MM = [
  45.5, 40.5, 35.5, 30.5, 25.5, 20.5, 15.5, 10.5, 5.5, 0.5,
] as const;

export const ISSF_10M_OUTER_RADIUS_MM = ISSF_10M_DIAMETERS_MM[0] / 2;

/** Außenradius Ring 10 (Innenzehner) = 0,25 mm */
export const ISSF_RING10_OUTER_RADIUS_MM = ISSF_10M_DIAMETERS_MM[9] / 2;

/** Außenradien Ring 1 … 10 (mm) */
export function ringOuterRadiiMm(): number[] {
  return ISSF_10M_DIAMETERS_MM.map((d) => d / 2);
}

/** Koordinaten SSMDB2: 1/100 mm → mm, Bildschirm: y nach oben */
export function toMm(x: number, y: number): { xm: number; ym: number } {
  return { xm: x / 100, ym: y / 100 };
}
