/**
 * Nur Scheiben, an denen wirklich geschossen wird:
 * - mindestens ein Wertungsschuss (Trefferzahl)
 * - mindestens eine Zeile in Treffer (Einzelkoordinaten / bestätigte Schüsse)
 * - keine Platzhalter-Stände (Meyton: „--frei--“, leere Namen)
 *
 * @param {string} tableAlias z. B. "Scheiben" oder "s"
 */
export function whereActiveScheibe(tableAlias = "Scheiben") {
  const t = tableAlias;
  return `(
    ${t}.Trefferzahl > 0
    AND TRIM(COALESCE(${t}.Vorname,'')) <> ''
    AND TRIM(COALESCE(${t}.Nachname,'')) <> ''
    AND TRIM(${t}.Vorname) <> '--frei--'
    AND TRIM(${t}.Nachname) <> '--frei--'
    AND EXISTS (
      SELECT 1 FROM Treffer tr
      WHERE tr.ScheibenID = ${t}.ScheibenID
    )
  )`;
}
