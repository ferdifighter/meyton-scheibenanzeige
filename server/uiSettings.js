/**
 * Oberflächen-Einstellungen (JSON), unabhängig von DB-Zugangsdaten.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UI_DEFAULTS = {
  /** Wechsel zur nächsten „Seite“ (je 8 Scheiben) in der Scheibenanzeige */
  boardRotationIntervalSec: 30,
};

export function getUiSettingsFilePath() {
  if (process.env.SCHEIBENANZEIGE_UI_SETTINGS_PATH) {
    return path.resolve(process.env.SCHEIBENANZEIGE_UI_SETTINGS_PATH);
  }
  return path.join(__dirname, "data", "ui-settings.json");
}

function readFile() {
  const p = getUiSettingsFilePath();
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

export function buildUiSettings() {
  const base = { ...UI_DEFAULTS };
  const file = readFile();
  if (!file) return base;
  const out = { ...base };
  const sec = Number(file.boardRotationIntervalSec);
  if (Number.isFinite(sec) && sec >= 5 && sec <= 3600) {
    out.boardRotationIntervalSec = Math.round(sec);
  }
  return out;
}

export function writeUiSettingsFile(partial) {
  const current = buildUiSettings();
  const next = { ...current, ...partial };
  const sec = Number(next.boardRotationIntervalSec);
  if (!Number.isFinite(sec) || sec < 5 || sec > 3600) {
    throw new Error("boardRotationIntervalSec muss zwischen 5 und 3600 liegen");
  }
  next.boardRotationIntervalSec = Math.round(sec);
  const p = getUiSettingsFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf8");
}
