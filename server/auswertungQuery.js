import { whereActiveScheibe } from "./activeScheibeSql.js";
import { parseScheibenFilters, buildWhereExtras } from "./scheibenFilter.js";

/**
 * @param {string | undefined} q
 * @returns {"total" | "besterTeiler"}
 */
export function normalizeRankBy(q) {
  const r = String(q ?? "")
    .toLowerCase()
    .trim();
  if (
    r === "besterteiler" ||
    r === "bester_teiler" ||
    r === "teiler" ||
    r === "bester"
  ) {
    return "besterTeiler";
  }
  return "total";
}

/**
 * JSON-Objekt: Disziplin (TRIM) → "total" | "besterTeiler"
 * @param {string | string[] | undefined} raw
 * @returns {Record<string, "total" | "besterTeiler">}
 */
export function parseRankByMap(raw) {
  if (raw == null || raw === "") return {};
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string") return {};
  try {
    const o = JSON.parse(s);
    if (o == null || typeof o !== "object") return {};
    /** @type {Record<string, "total" | "besterTeiler">} */
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      const key = String(k).trim();
      if (!key) continue;
      out[key] = normalizeRankBy(v);
    }
    return out;
  } catch {
    return {};
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function isNullTeiler(v) {
  if (v == null) return true;
  const n = num(v);
  return !Number.isFinite(n);
}

/**
 * Platz je (DisziplinNorm, KlasseDisplay); pro Disziplin eigene Sortierung.
 * @param {object[]} rows – Zeilen aus DB (ohne Platz)
 * @param {"total" | "besterTeiler"} defaultRank
 * @param {Record<string, "total" | "besterTeiler">} perDisciplin
 */
export function assignPlatzierungen(rows, defaultRank, perDisciplin = {}) {
  const def = normalizeRankBy(defaultRank) === "besterTeiler" ? "besterTeiler" : "total";

  /** @type {Map<string, object[]>} */
  const groups = new Map();
  for (const r of rows) {
    const w = String(r.WettkampfDisplay ?? "").trim() || "Wettkampf —";
    const d = String(r.DisziplinNorm ?? r.Disziplin ?? "").trim();
    const k = String(r.KlasseDisplay ?? "").trim() || "—";
    const key = `${w}\0${d}\0${k}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  /** @type {object[]} */
  const out = [];

  for (const [, list] of groups) {
    const disc = String(list[0]?.DisziplinNorm ?? list[0]?.Disziplin ?? "").trim();
    const rankMode = perDisciplin[disc] != null ? perDisciplin[disc] : def;

    const sorted = [...list].sort((a, b) => {
      if (rankMode === "besterTeiler") {
        const aNull = isNullTeiler(a.BesterTeiler01);
        const bNull = isNullTeiler(b.BesterTeiler01);
        if (aNull && bNull) {
          return num(a.ScheibenID) - num(b.ScheibenID);
        }
        if (aNull) return 1;
        if (bNull) return -1;
        const te = num(a.BesterTeiler01) - num(b.BesterTeiler01);
        if (te !== 0) return te;
        const tr = num(b.TotalRing01) - num(a.TotalRing01);
        if (tr !== 0) return tr;
        return num(a.ScheibenID) - num(b.ScheibenID);
      }
      const tr = num(b.TotalRing01) - num(a.TotalRing01);
      if (tr !== 0) return tr;
      const aNull = isNullTeiler(a.BesterTeiler01);
      const bNull = isNullTeiler(b.BesterTeiler01);
      if (aNull && bNull) return num(a.ScheibenID) - num(b.ScheibenID);
      if (aNull) return 1;
      if (bNull) return -1;
      const te = num(a.BesterTeiler01) - num(b.BesterTeiler01);
      if (te !== 0) return te;
      return num(a.ScheibenID) - num(b.ScheibenID);
    });

    sorted.forEach((row, i) => {
      out.push({ ...row, Platz: i + 1 });
    });
  }

  out.sort((a, b) => {
    const w = String(a.WettkampfDisplay ?? "").localeCompare(
      String(b.WettkampfDisplay ?? ""),
      "de"
    );
    if (w !== 0) return w;
    const c = String(a.DisziplinNorm ?? "").localeCompare(
      String(b.DisziplinNorm ?? ""),
      "de"
    );
    if (c !== 0) return c;
    const c2 = String(a.KlasseDisplay ?? "").localeCompare(
      String(b.KlasseDisplay ?? ""),
      "de"
    );
    if (c2 !== 0) return c2;
    return num(a.Platz) - num(b.Platz);
  });

  return out;
}

/**
 * Rohdaten ohne Platzierung (gleiche Filter wie Liste).
 * @param {import('express').Request['query']} query
 */
export function buildAuswertungBaseSql(query) {
  const f = parseScheibenFilters(query, process.env);
  const { sql: extraWhere, params: extraParams } = buildWhereExtras(
    "Scheiben",
    f
  );
  const baseWhere = `WHERE ${whereActiveScheibe("Scheiben")} ${extraWhere}`;

  const sql = `
    SELECT
      Scheiben.ScheibenID AS ScheibenID,
      Scheiben.Nachname AS Nachname,
      Scheiben.Vorname AS Vorname,
      Scheiben.StandNr AS StandNr,
      Scheiben.Disziplin AS Disziplin,
      Scheiben.Klasse AS Klasse,
      Scheiben.KlassenID AS KlassenID,
      Scheiben.TotalRing01 AS TotalRing01,
      Scheiben.BesterTeiler01 AS BesterTeiler01,
      Scheiben.Trefferzahl AS Trefferzahl,
      Scheiben.Zeitstempel AS Zeitstempel,
      COALESCE(
        NULLIF(TRIM(COALESCE(Scheiben.Rangliste, '')), ''),
        NULLIF(TRIM(COALESCE(Scheiben.Starterliste, '')), ''),
        'Wettkampf —'
      ) AS WettkampfDisplay,
      YEAR(Scheiben.Zeitstempel) AS Jahr,
      TRIM(COALESCE(Scheiben.Disziplin,'')) AS DisziplinNorm,
      COALESCE(NULLIF(TRIM(COALESCE(Scheiben.Klasse,'')),''), '—') AS KlasseDisplay
    FROM Scheiben
    ${baseWhere}
    ORDER BY Scheiben.ScheibenID ASC
  `;

  return { sql: sql.trim(), params: extraParams };
}
