/**
 * Filter für Meyton SSMDB2: keine „aktive Anlage“ in der DB – nur Heuristik.
 * @param {import('express').Request['query']} query
 * @param {NodeJS.ProcessEnv} env
 */
export function parseScheibenFilters(query = {}, env = process.env) {
  const allDates =
    query.allDates === "1" ||
    query.allDates === "true" ||
    env.SCHEIBEN_ALL_DATES === "1";

  const standsStr = String(query.stands || env.ACTIVE_STAND_NUMBERS || "").trim();
  const stands = standsStr
    ? standsStr
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const starterliste = String(query.starterliste || env.STARTERLISTE_FILTER || "").trim();

  const latestPerStand =
    query.latestPerStand === "0" || env.LATEST_PER_STAND === "false"
      ? false
      : true;

  /** „aktuell“: neueste Zeile pro Stand. Zeitstempel allein ist falsch (fertige Serien haben den letzten Schuss-Zeitpunkt). */
  const rankBy = String(
    query.rankBy || env.LATEST_RANK_BY || "scheibenid"
  ).toLowerCase();

  const disziplin = String(query.disziplin || "").trim();

  const standStr = String(query.stand ?? query.standNr ?? "").trim();
  const standParsed = parseInt(standStr, 10);
  const stand =
    standStr !== "" && Number.isFinite(standParsed) && standParsed > 0
      ? standParsed
      : null;

  return {
    allDates,
    stands,
    starterliste,
    latestPerStand,
    rankBy,
    disziplin,
    stand,
  };
}

/**
 * ORDER BY für ROW_NUMBER() — pro Stand eine Zeile
 * @returns {string} z. B. "ScheibenID DESC, Zeitstempel DESC"
 */
export function windowOrderLatestPerStand(rankBy) {
  if (rankBy === "zeitstempel" || rankBy === "time") {
    return "Zeitstempel DESC, ScheibenID DESC";
  }
  return "ScheibenID DESC, Zeitstempel DESC";
}

/**
 * @param {string} alias
 * @param {{ allDates: boolean, stands: number[], starterliste: string, disziplin?: string, stand?: number | null }} f
 */
export function buildWhereExtras(alias, f) {
  const t = alias;
  const parts = [];
  const params = [];

  if (!f.allDates) {
    parts.push(`DATE(${t}.Zeitstempel) = CURDATE()`);
  }

  if (f.stands.length > 0) {
    const ph = f.stands.map(() => "?").join(",");
    parts.push(`${t}.StandNr IN (${ph})`);
    params.push(...f.stands);
  }

  if (f.starterliste) {
    parts.push(`${t}.Starterliste LIKE ?`);
    params.push(`%${f.starterliste}%`);
  }

  if (f.disziplin) {
    parts.push(`TRIM(${t}.Disziplin) = ?`);
    params.push(f.disziplin);
  }

  if (f.stand != null) {
    parts.push(`${t}.StandNr = ?`);
    params.push(f.stand);
  }

  return { sql: parts.length ? ` AND ${parts.join(" AND ")} ` : "", params };
}
