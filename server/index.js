import dotenv from "dotenv";

dotenv.config();
if (process.env.SCHEIBENANZEIGE_ENV_PATH) {
  dotenv.config({
    path: process.env.SCHEIBENANZEIGE_ENV_PATH,
    override: true,
  });
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import mysql from "mysql2/promise";
import { loadScheibeDetail } from "./loadScheibe.js";
import { whereActiveScheibe } from "./activeScheibeSql.js";
import {
  parseScheibenFilters,
  buildWhereExtras,
  windowOrderLatestPerStand,
} from "./scheibenFilter.js";
import {
  buildDbConfig,
  MEYTON_DEFAULTS,
  removeDbSettingsFile,
  writeDbSettingsFile,
} from "./dbConfig.js";
import { buildUiSettings, writeUiSettingsFile } from "./uiSettings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "../client/dist");

const APP_VERSION = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "package.json"), "utf8");
    const p = JSON.parse(raw);
    return typeof p.version === "string" ? p.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const { PORT = "3001" } = process.env;

function createMysqlPool(cfg) {
  return mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 10,
  });
}

let pool = createMysqlPool(buildDbConfig());

async function reloadMysqlPool() {
  const old = pool;
  pool = createMysqlPool(buildDbConfig());
  await old.end().catch(() => {});
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

/** DB-Einstellungen (ohne Passwort im Klartext) */
app.get("/api/settings/db", (_req, res) => {
  const c = buildDbConfig();
  res.json({
    host: c.host,
    port: c.port,
    user: c.user,
    database: c.database,
    hasPassword: Boolean(c.password),
    userDataDirectory: process.env.SCHEIBENANZEIGE_USER_DATA_DIR || null,
    meytonDefaults: {
      host: MEYTON_DEFAULTS.host,
      port: MEYTON_DEFAULTS.port,
      user: MEYTON_DEFAULTS.user,
      database: MEYTON_DEFAULTS.database,
    },
  });
});

/** DB-Einstellungen speichern (überschreibt JSON-Datei), Pool neu starten */
app.put("/api/settings/db", async (req, res) => {
  try {
    const b = req.body ?? {};
    const host = String(b.host ?? "").trim();
    const user = String(b.user ?? "").trim();
    const database = String(b.database ?? "").trim();
    const port = Number(b.port);
    if (!host || !user || !database || !Number.isFinite(port) || port < 1) {
      return res.status(400).json({
        error: "host, port, user, database sind Pflicht (port > 0)",
      });
    }
    const current = buildDbConfig();
    let password = current.password;
    const newPw = b.password != null ? String(b.password) : "";
    if (newPw.trim() !== "") {
      password = newPw;
    }
    writeDbSettingsFile({
      host,
      port,
      user,
      password,
      database,
    });
    await reloadMysqlPool();
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/** Gespeicherte DB-Datei löschen, Meyton-Defaults wieder aktiv */
app.delete("/api/settings/db", async (_req, res) => {
  try {
    removeDbSettingsFile();
    await reloadMysqlPool();
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/** Oberfläche (Scheibenanzeige: Seitenwechsel-Intervall) */
app.get("/api/settings/ui", (_req, res) => {
  const s = buildUiSettings();
  res.json({
    boardRotationIntervalSec: s.boardRotationIntervalSec,
    boardPageSize: 8,
    userDataDirectory: process.env.SCHEIBENANZEIGE_USER_DATA_DIR || null,
  });
});

app.put("/api/settings/ui", (req, res) => {
  try {
    const b = req.body ?? {};
    writeUiSettingsFile({
      boardRotationIntervalSec: Number(b.boardRotationIntervalSec),
    });
    const s = buildUiSettings();
    res.json({
      ok: true,
      boardRotationIntervalSec: s.boardRotationIntervalSec,
      boardPageSize: 8,
    });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, version: APP_VERSION });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message), version: APP_VERSION });
  }
});

/** GET /api/meta — kurz Info zu Filtern (kein DB-„Stand an“-Flag in SSMDB2) */
app.get("/api/meta", (_req, res) => {
  const f = parseScheibenFilters({}, process.env);
  res.json({
    version: APP_VERSION,
    hint: "SSMDB2 enthält kein Feld „Stand eingeschaltet“. Stände per ACTIVE_STAND_NUMBERS einschränken; aktuelle Zuordnung per latestPerStand + Datum.",
    defaults: {
      zeitstempel: f.allDates ? "alle Tage" : "nur heute (DATE(Zeitstempel)=CURDATE())",
      latestPerStand: f.latestPerStand,
      latestRankBy: f.rankBy,
      latestRankHint:
        "scheibenid = neueste DB-Zeile (aktuelle Zuordnung); zeitstempel = letzter Schuss (oft fertige Session)",
      activeStands: f.stands.length ? f.stands : "alle",
      starterliste: f.starterliste || "—",
    },
  });
});

app.get("/api/stande", async (req, res) => {
  const q = { ...req.query };
  delete q.stand;
  delete q.standNr;
  const filters = parseScheibenFilters(q, process.env);
  const { sql: extraWhere, params: extraParams } = buildWhereExtras(
    "Scheiben",
    filters
  );
  const baseWhere = `WHERE ${whereActiveScheibe("Scheiben")} ${extraWhere}`;
  const sql = `
    SELECT DISTINCT StandNr AS StandNr
    FROM Scheiben
    ${baseWhere}
    ORDER BY StandNr ASC`;
  try {
    const [rows] = await pool.query(sql, extraParams);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/disziplinen", async (req, res) => {
  const q = { ...req.query };
  delete q.disziplin;
  const filters = parseScheibenFilters(q, process.env);
  const { sql: extraWhere, params: extraParams } = buildWhereExtras(
    "Scheiben",
    filters
  );
  const baseWhere = `WHERE ${whereActiveScheibe("Scheiben")} ${extraWhere}`;
  const sql = `
    SELECT DISTINCT TRIM(Disziplin) AS Disziplin
    FROM Scheiben
    ${baseWhere}
    AND TRIM(COALESCE(Disziplin, '')) <> ''
    ORDER BY Disziplin ASC`;
  try {
    const [rows] = await pool.query(sql, extraParams);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/scheiben", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 5000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const q = (req.query.q || "").trim();
  const filters = parseScheibenFilters(req.query, process.env);
  const { sql: extraWhere, params: extraParams } = buildWhereExtras(
    "Scheiben",
    filters
  );

  const params = [...extraParams];
  let searchSql = "";
  if (q) {
    searchSql = ` AND (Nachname LIKE ? OR Vorname LIKE ? OR Disziplin LIKE ?) `;
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const baseWhere = `WHERE ${whereActiveScheibe("Scheiben")} ${extraWhere} ${searchSql}`;
  const winOrder = windowOrderLatestPerStand(filters.rankBy);

  let sql;
  if (filters.latestPerStand) {
    sql = `
      SELECT ScheibenID, Nachname, Vorname, Disziplin, StandNr, Trefferzahl,
             TotalRing, TotalRing01, Zeitstempel, Starterliste
      FROM (
        SELECT ScheibenID, Nachname, Vorname, Disziplin, StandNr, Trefferzahl,
               TotalRing, TotalRing01, Zeitstempel, Starterliste,
               ROW_NUMBER() OVER (
                 PARTITION BY StandNr
                 ORDER BY ${winOrder}
               ) AS rn
        FROM Scheiben
        ${baseWhere}
      ) ranked
      WHERE rn = 1
      ORDER BY StandNr ASC
      LIMIT ? OFFSET ?`;
  } else {
    sql = `
      SELECT ScheibenID, Nachname, Vorname, Disziplin, StandNr, Trefferzahl,
             TotalRing, TotalRing01, Zeitstempel, Starterliste
      FROM Scheiben
      ${baseWhere}
      ORDER BY Zeitstempel DESC
      LIMIT ? OFFSET ?`;
  }
  params.push(limit, offset);

  try {
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/board", async (req, res) => {
  const DEFAULT_CAP = 5000;
  const ABS_MAX = 50000;
  const rawCap = Number(process.env.BOARD_MAX_LIMIT);
  const cap =
    Number.isFinite(rawCap) && rawCap > 0
      ? Math.min(Math.max(Math.floor(rawCap), 1), ABS_MAX)
      : DEFAULT_CAP;
  const limit = Math.min(Math.max(Number(req.query.limit) || cap, 1), cap);
  const q = (req.query.q || "").trim();
  const filters = parseScheibenFilters(req.query, process.env);
  const { sql: extraWhere, params: extraParams } = buildWhereExtras(
    "Scheiben",
    filters
  );

  const params = [...extraParams];
  let searchSql = "";
  if (q) {
    searchSql = ` AND (Nachname LIKE ? OR Vorname LIKE ? OR Disziplin LIKE ?) `;
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const baseWhere = `WHERE ${whereActiveScheibe("Scheiben")} ${extraWhere} ${searchSql}`;
  const winOrder = windowOrderLatestPerStand(filters.rankBy);

  let sql;
  if (filters.latestPerStand) {
    sql = `
      SELECT ScheibenID FROM (
        SELECT ScheibenID, StandNr,
               ROW_NUMBER() OVER (
                 PARTITION BY StandNr
                 ORDER BY ${winOrder}
               ) AS rn
        FROM Scheiben
        ${baseWhere}
      ) ranked
      WHERE rn = 1
      ORDER BY StandNr ASC
      LIMIT ?`;
  } else {
    sql = `
      SELECT ScheibenID FROM Scheiben
      ${baseWhere}
      ORDER BY Zeitstempel DESC
      LIMIT ?`;
  }
  params.push(limit);

  try {
    const [rows] = await pool.query(sql, params);
    const items = [];
    for (const row of rows) {
      const detail = await loadScheibeDetail(pool, row.ScheibenID);
      if (detail) items.push(detail);
    }
    res.json({
      items,
      _meta: {
        filters: {
          allDates: filters.allDates,
          latestPerStand: filters.latestPerStand,
          rankBy: filters.rankBy,
          stands: filters.stands.length ? filters.stands : null,
          starterliste: filters.starterliste || null,
        },
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/scheiben/:id", async (req, res) => {
  const id = req.params.id;
  if (id === "" || id == null) {
    return res.status(400).json({ error: "Ungültige ScheibenID" });
  }
  try {
    const detail = await loadScheibeDetail(pool, id);
    if (!detail) {
      return res.status(404).json({ error: "Scheibe nicht gefunden" });
    }
    res.json({
      ...detail,
      _meta: { ring01Display: "Zehntel-Ringe (DB-Wert / 10)" },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

app.listen(Number(PORT), () => {
  console.error(`API http://localhost:${PORT}`);
  if (fs.existsSync(CLIENT_DIST)) {
    console.error(`SPA aus ${CLIENT_DIST} (u. a. /scheibenanzeige)`);
  }
});
