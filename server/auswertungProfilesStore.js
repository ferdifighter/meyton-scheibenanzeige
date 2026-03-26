import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);

function nowIso() {
  return new Date().toISOString();
}

function sanitizeSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const filters = src.filters && typeof src.filters === "object" ? src.filters : {};
  /** @type {Record<string, "total" | "besterTeiler">} */
  const rankByPerDisciplin = {};
  const srcMap =
    src.rankByPerDisciplin && typeof src.rankByPerDisciplin === "object"
      ? src.rankByPerDisciplin
      : {};
  for (const [k, v] of Object.entries(srcMap)) {
    const key = String(k ?? "").trim();
    if (!key) continue;
    rankByPerDisciplin[key] = v === "besterTeiler" ? "besterTeiler" : "total";
  }
  return {
    rankByDefault: src.rankByDefault === "besterTeiler" ? "besterTeiler" : "total",
    rankByPerDisciplin,
    filters: {
      wettkampf: String(filters.wettkampf ?? "").trim(),
      disziplin: String(filters.disziplin ?? "").trim(),
      stand:
        Number.isFinite(Number(filters.stand)) && Number(filters.stand) > 0
          ? Number(filters.stand)
          : null,
      year:
        Number.isFinite(Number(filters.year)) &&
        Number(filters.year) >= 2000 &&
        Number(filters.year) <= 2100
          ? Number(filters.year)
          : null,
      dateFrom:
        /^\d{4}-\d{2}-\d{2}$/.test(String(filters.dateFrom ?? "").trim())
          ? String(filters.dateFrom).trim()
          : "",
      dateTo:
        /^\d{4}-\d{2}-\d{2}$/.test(String(filters.dateTo ?? "").trim())
          ? String(filters.dateTo).trim()
          : "",
      allDates: Boolean(filters.allDates),
    },
  };
}

export async function createAuswertungProfilesStore(dbPath) {
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  const wasmDir = path.dirname(wasmPath);
  const SQL = await initSqlJs({
    locateFile: (file) =>
      file === "sql-wasm.wasm" ? wasmPath : path.join(wasmDir, file),
  });

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  /** @type {import("sql.js").Database} */
  let db;
  if (fs.existsSync(dbPath)) {
    const raw = fs.readFileSync(dbPath);
    db = new SQL.Database(raw);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS auswertung_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const persist = () => {
    const bytes = db.export();
    fs.writeFileSync(dbPath, Buffer.from(bytes));
  };
  persist();

  return {
    listProfiles() {
      const rows = db.exec(
        "SELECT id, name, created_at, updated_at FROM auswertung_profiles ORDER BY name COLLATE NOCASE ASC"
      );
      if (!rows[0]) return [];
      const cols = rows[0].columns;
      return rows[0].values.map((vals) => {
        const rec = Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
        return {
          id: Number(rec.id),
          name: String(rec.name ?? ""),
          createdAt: String(rec.created_at ?? ""),
          updatedAt: String(rec.updated_at ?? ""),
        };
      });
    },

    getProfile(id) {
      const stmt = db.prepare(
        "SELECT id, name, settings_json, created_at, updated_at FROM auswertung_profiles WHERE id = ?"
      );
      try {
        stmt.bind([id]);
        if (!stmt.step()) return null;
        const row = stmt.getAsObject();
        let parsed = {};
        try {
          parsed = JSON.parse(String(row.settings_json ?? "{}"));
        } catch {
          parsed = {};
        }
        return {
          id: Number(row.id),
          name: String(row.name ?? ""),
          settings: sanitizeSettings(parsed),
          createdAt: String(row.created_at ?? ""),
          updatedAt: String(row.updated_at ?? ""),
        };
      } finally {
        stmt.free();
      }
    },

    saveProfile(name, settings, profileId = null) {
      const cleanName = String(name ?? "").trim();
      if (!cleanName) {
        throw new Error("Profilname fehlt.");
      }
      const normalized = sanitizeSettings(settings);
      const now = nowIso();
      const payload = JSON.stringify(normalized);
      try {
        if (profileId != null) {
          const stmt = db.prepare(
            "UPDATE auswertung_profiles SET name = ?, settings_json = ?, updated_at = ? WHERE id = ?"
          );
          try {
            stmt.run([cleanName, payload, now, profileId]);
          } finally {
            stmt.free();
          }
          if (db.getRowsModified() < 1) {
            throw new Error("Profil wurde nicht gefunden.");
          }
          persist();
          const updated = this.getProfile(profileId);
          if (!updated) throw new Error("Profil wurde nicht gefunden.");
          return updated;
        }
        const ins = db.prepare(
          "INSERT INTO auswertung_profiles (name, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?)"
        );
        try {
          ins.run([cleanName, payload, now, now]);
        } finally {
          ins.free();
        }
        const idRow = db.exec("SELECT last_insert_rowid() AS id");
        const id = Number(idRow?.[0]?.values?.[0]?.[0] ?? 0);
        persist();
        const created = this.getProfile(id);
        if (!created) throw new Error("Profil konnte nicht geladen werden.");
        return created;
      } catch (e) {
        const msg = String(e?.message ?? e);
        if (msg.includes("UNIQUE constraint failed")) {
          throw new Error("Ein Profil mit diesem Namen existiert bereits.");
        }
        throw e;
      }
    },

    renameProfile(profileId, name) {
      const cleanName = String(name ?? "").trim();
      if (!cleanName) throw new Error("Profilname fehlt.");
      const now = nowIso();
      try {
        const stmt = db.prepare(
          "UPDATE auswertung_profiles SET name = ?, updated_at = ? WHERE id = ?"
        );
        try {
          stmt.run([cleanName, now, profileId]);
        } finally {
          stmt.free();
        }
        if (db.getRowsModified() < 1) {
          throw new Error("Profil wurde nicht gefunden.");
        }
        persist();
        const updated = this.getProfile(profileId);
        if (!updated) throw new Error("Profil wurde nicht gefunden.");
        return updated;
      } catch (e) {
        const msg = String(e?.message ?? e);
        if (msg.includes("UNIQUE constraint failed")) {
          throw new Error("Ein Profil mit diesem Namen existiert bereits.");
        }
        throw e;
      }
    },

    deleteProfile(profileId) {
      const stmt = db.prepare("DELETE FROM auswertung_profiles WHERE id = ?");
      try {
        stmt.run([profileId]);
      } finally {
        stmt.free();
      }
      if (db.getRowsModified() < 1) {
        throw new Error("Profil wurde nicht gefunden.");
      }
      persist();
      return { ok: true };
    },
  };
}
