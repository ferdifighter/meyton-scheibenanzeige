/**
 * Meyton-SSMDB2-Standard (Vorgabe) + optionale Überschreibung per JSON-Datei
 * und Umgebungsvariablen (Entwicklung).
 * Priorität: Defaults → Umgebung → Datei (höchste Priorität).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Meyton-typische Standard-Zugangsdaten (lokal im Vereinsnetz). */
export const MEYTON_DEFAULTS = {
  host: "192.168.10.200",
  port: 3306,
  user: "meyton",
  password: "mc4hct",
  database: "SSMDB2",
};

export function getSettingsFilePath() {
  if (process.env.SCHEIBENANZEIGE_SETTINGS_PATH) {
    return path.resolve(process.env.SCHEIBENANZEIGE_SETTINGS_PATH);
  }
  return path.join(__dirname, "data", "db-settings.json");
}

function readSettingsFile() {
  const p = getSettingsFilePath();
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

function envOverrides() {
  const o = {};
  if (process.env.DB_HOST) o.host = process.env.DB_HOST;
  if (process.env.DB_PORT != null && String(process.env.DB_PORT).trim() !== "") {
    const p = Number(process.env.DB_PORT);
    if (Number.isFinite(p) && p > 0) o.port = p;
  }
  if (process.env.DB_USER) o.user = process.env.DB_USER;
  // Wichtig: auch ein bewusst leeres Passwort aus .env muss den Default überschreiben.
  if (process.env.DB_PASSWORD !== undefined) o.password = process.env.DB_PASSWORD;
  if (process.env.DB_NAME) o.database = process.env.DB_NAME;
  return o;
}

/**
 * Effektive DB-Konfiguration (für Pool).
 */
export function buildDbConfig() {
  const base = { ...MEYTON_DEFAULTS, ...envOverrides() };
  const file = readSettingsFile();
  if (!file) return base;
  const out = { ...base };
  if (file.host != null && String(file.host).trim() !== "") {
    out.host = String(file.host).trim();
  }
  if (file.port != null && String(file.port).trim() !== "") {
    out.port = Number(file.port);
  }
  if (file.user != null && String(file.user).trim() !== "") {
    out.user = String(file.user).trim();
  }
  // Auch leerer String ist ein valider, expliziter Wert.
  if (Object.prototype.hasOwnProperty.call(file, "password")) {
    out.password = file.password == null ? "" : String(file.password);
  }
  if (file.database != null && String(file.database).trim() !== "") {
    out.database = String(file.database).trim();
  }
  return out;
}

/**
 * Speichert die Konfiguration (Passwort immer vollständig schreiben).
 */
export function writeDbSettingsFile(cfg) {
  const p = getSettingsFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload = {
    host: cfg.host,
    port: Number(cfg.port),
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  };
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), "utf8");
}

/** Entfernt die JSON-Datei – es gelten wieder nur Meyton-Defaults und ggf. Umgebung. */
export function removeDbSettingsFile() {
  const p = getSettingsFilePath();
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}
