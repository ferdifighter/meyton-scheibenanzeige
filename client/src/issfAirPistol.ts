/**
 * ISSF 10 m Luftpistole (Papierscheibe): Außen-Durchmesser Ring 1 … 10 (mm),
 * Innenzehner (für Zählung / Stichwert). Ringe 1–6 weiß, 7–9 schwarz,
 * Ring 10 weiß, Innenzehner schwarz (vgl. ISSF / Scheibenbeschreibung).
 *
 * Quellen u. a.: ISSF-Regelwerk / Wikipedia „ISSF 10 meter air pistol“
 * (schwarze Zielmarkierung = Wertungsringe 7–10, Ø 10-Ring 11,5 mm).
 */
export const ISSF_10M_AIR_PISTOL_DIAMETERS_MM = [
  155.5, 140.5, 125.5, 110.5, 95.5, 80.5, 65.5, 50.5, 35.5, 11.5,
] as const;

/** Innenzehner (Stichwert), Außen-Durchmesser */
export const ISSF_AIR_PISTOL_INNER10_DIAMETER_MM = 5;

export const ISSF_AIR_PISTOL_OUTER_RADIUS_MM =
  ISSF_10M_AIR_PISTOL_DIAMETERS_MM[0] / 2;

/** Außenradien Ring 1 … 10 (mm) */
export function ringOuterRadiiMmAirPistol(): number[] {
  return ISSF_10M_AIR_PISTOL_DIAMETERS_MM.map((d) => d / 2);
}

/** Innenzehner Außenradius */
export function innerTenOuterRadiusMmAirPistol(): number {
  return ISSF_AIR_PISTOL_INNER10_DIAMETER_MM / 2;
}

/** Meyton-Disziplin → Luftpistolenscheibe (Koordinaten weiter 1/100 mm) */
export function isIssfAirPistolDiscipline(disziplin: string): boolean {
  const t = disziplin.trim().toLowerCase();
  /** Meyton-Kürzel: Disziplin beginnt oft mit LG (Luftgewehr) bzw. LP (Luftpistole) */
  if (t.startsWith("lg")) return false;
  if (t.startsWith("lp")) return true;
  return (
    t.includes("luftpistole") ||
    t.includes("air pistol") ||
    t.includes("airpistol")
  );
}
