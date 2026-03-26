import dotenv from "dotenv";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Immer die Server-.env laden, auch wenn der Prozess aus einem anderen CWD gestartet wurde.
dotenv.config({ path: path.join(__dirname, ".env") });
if (process.env.SCHEIBENANZEIGE_ENV_PATH) {
  dotenv.config({
    path: process.env.SCHEIBENANZEIGE_ENV_PATH,
    override: true,
  });
}

import cors from "cors";
import express from "express";
import { createWorkerConverter } from "@matbee/libreoffice-converter";
import Docxtemplater from "docxtemplater";
import JSZip from "jszip";
import mysql from "mysql2/promise";
import { PDFDocument } from "pdf-lib";
import PizZip from "pizzip";
import { loadScheibeDetail } from "./loadScheibe.js";
import { whereActiveScheibe } from "./activeScheibeSql.js";
import {
  parseScheibenFilters,
  buildWhereExtras,
  windowOrderLatestPerStand,
} from "./scheibenFilter.js";
import {
  assignPlatzierungen,
  buildAuswertungBaseSql,
  normalizeRankBy,
  parseRankByMap,
} from "./auswertungQuery.js";
import { createAuswertungProfilesStore } from "./auswertungProfilesStore.js";
import {
  buildDbConfig,
  MEYTON_DEFAULTS,
  removeDbSettingsFile,
  writeDbSettingsFile,
} from "./dbConfig.js";
import { buildUiSettings, writeUiSettingsFile } from "./uiSettings.js";

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
const URKUNDEN_SETTINGS_PATH = process.env.SCHEIBENANZEIGE_URKUNDEN_SETTINGS_PATH
  ? path.resolve(process.env.SCHEIBENANZEIGE_URKUNDEN_SETTINGS_PATH)
  : path.join(__dirname, "data", "urkunden-settings.json");
const AUSWERTUNG_SETTINGS_PATH = process.env.SCHEIBENANZEIGE_AUSWERTUNG_SETTINGS_PATH
  ? path.resolve(process.env.SCHEIBENANZEIGE_AUSWERTUNG_SETTINGS_PATH)
  : path.join(__dirname, "data", "auswertung-settings.json");
const AUSWERTUNG_PROFILES_DB_PATH = process.env.SCHEIBENANZEIGE_AUSWERTUNG_PROFILES_DB_PATH
  ? path.resolve(process.env.SCHEIBENANZEIGE_AUSWERTUNG_PROFILES_DB_PATH)
  : path.join(__dirname, "data", "auswertung-profiles.sqlite");
const URKUNDEN_TEMPLATES_DIR = process.env.SCHEIBENANZEIGE_URKUNDEN_TEMPLATES_DIR
  ? path.resolve(process.env.SCHEIBENANZEIGE_URKUNDEN_TEMPLATES_DIR)
  : path.join(__dirname, "urkundenvorlagen");
const URKUNDEN_TEMPLATE_SELECTION_PATH = process.env.SCHEIBENANZEIGE_URKUNDEN_TEMPLATE_SELECTION_PATH
  ? path.resolve(process.env.SCHEIBENANZEIGE_URKUNDEN_TEMPLATE_SELECTION_PATH)
  : path.join(__dirname, "data", "urkunden-template-selection.json");
function resolveSofficeBin() {
  const configured =
    process.env.SCHEIBENANZEIGE_LIBREOFFICE_BIN || process.env.SOFFICE_BIN || "";
  if (configured) return configured;
  if (process.platform === "win32") {
    const winCandidates = [
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    ];
    for (const c of winCandidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return "soffice";
}
const SOFFICE_BIN = resolveSofficeBin();
const LIBREOFFICE_WASM_PATH = path.join(
  __dirname,
  "node_modules",
  "@matbee",
  "libreoffice-converter",
  "wasm"
);
const URKUNDEN_PROGRESS_TTL_MS = 30 * 60 * 1000;
const urkundenProgressJobs = new Map();

function createUrkundenProgressId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanupUrkundenProgressJobs() {
  const now = Date.now();
  for (const [id, job] of urkundenProgressJobs.entries()) {
    if (now - Number(job?.updatedAt ?? 0) > URKUNDEN_PROGRESS_TTL_MS) {
      urkundenProgressJobs.delete(id);
    }
  }
}

function initUrkundenProgressJob(id) {
  const now = Date.now();
  const cleanId = String(id || "").trim() || createUrkundenProgressId();
  const job = {
    id: cleanId,
    phase: "prepare",
    message: "Daten werden geladen…",
    current: 0,
    total: 0,
    percent: 0,
    done: false,
    error: "",
    startedAt: now,
    updatedAt: now,
  };
  urkundenProgressJobs.set(cleanId, job);
  cleanupUrkundenProgressJobs();
  return cleanId;
}

function updateUrkundenProgressJob(id, patch = {}) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;
  const base = urkundenProgressJobs.get(cleanId) || initUrkundenProgressJob(cleanId);
  const total = Number(
    patch.total ?? base.total ?? 0
  );
  const current = Number(
    patch.current ?? base.current ?? 0
  );
  const rawPercent =
    total > 0
      ? Math.round((Math.max(0, Math.min(current, total)) / total) * 100)
      : Number(base.percent ?? 0);
  const next = {
    ...base,
    ...patch,
    total,
    current,
    percent: Math.max(0, Math.min(100, Number(patch.percent ?? rawPercent))),
    updatedAt: Date.now(),
  };
  urkundenProgressJobs.set(cleanId, next);
  return next;
}

function urkundenDefaults() {
  return {
    rankFrom: 1,
    rankTo: 3,
    rankByDefault: "total",
    rankByPerDisciplin: {},
    printerName: "",
    filters: {
      wettkampf: "",
      disziplin: "",
      stand: null,
      year: null,
      dateFrom: "",
      dateTo: "",
      allDates: false,
    },
  };
}

function auswertungDefaults() {
  return {
    rankByDefault: "total",
    rankByPerDisciplin: {},
    filters: {
      wettkampf: "",
      disziplin: "",
      stand: null,
      year: null,
      dateFrom: "",
      dateTo: "",
      allDates: false,
    },
  };
}

function normalizeUrkundenSettings(raw) {
  const d = urkundenDefaults();
  const inObj = raw && typeof raw === "object" ? raw : {};
  const f = inObj.filters && typeof inObj.filters === "object" ? inObj.filters : {};
  const rankFrom = Number(inObj.rankFrom);
  const rankTo = Number(inObj.rankTo);
  const from = Number.isFinite(rankFrom) && rankFrom > 0 ? Math.floor(rankFrom) : d.rankFrom;
  const to = Number.isFinite(rankTo) && rankTo > 0 ? Math.floor(rankTo) : d.rankTo;
  /** @type {Record<string, "total" | "besterTeiler">} */
  const rankMap = {};
  const srcMap =
    inObj.rankByPerDisciplin && typeof inObj.rankByPerDisciplin === "object"
      ? inObj.rankByPerDisciplin
      : {};
  for (const [k, v] of Object.entries(srcMap)) {
    const key = String(k).trim();
    if (!key) continue;
    rankMap[key] = normalizeRankBy(v);
  }
  return {
    rankFrom: Math.min(from, to),
    rankTo: Math.max(from, to),
    rankByDefault: normalizeRankBy(inObj.rankByDefault),
    rankByPerDisciplin: rankMap,
    printerName: String(inObj.printerName ?? "").trim(),
    filters: {
      wettkampf: String(f.wettkampf ?? "").trim(),
      disziplin: String(f.disziplin ?? "").trim(),
      stand:
        Number.isFinite(Number(f.stand)) && Number(f.stand) > 0
          ? Number(f.stand)
          : null,
      year:
        Number.isFinite(Number(f.year)) && Number(f.year) >= 2000 && Number(f.year) <= 2100
          ? Number(f.year)
          : null,
      dateFrom:
        /^\d{4}-\d{2}-\d{2}$/.test(String(f.dateFrom ?? "").trim())
          ? String(f.dateFrom).trim()
          : "",
      dateTo:
        /^\d{4}-\d{2}-\d{2}$/.test(String(f.dateTo ?? "").trim())
          ? String(f.dateTo).trim()
          : "",
      allDates: Boolean(f.allDates),
    },
  };
}

function normalizeAuswertungSettings(raw) {
  const d = auswertungDefaults();
  const inObj = raw && typeof raw === "object" ? raw : {};
  const f = inObj.filters && typeof inObj.filters === "object" ? inObj.filters : {};
  /** @type {Record<string, "total" | "besterTeiler">} */
  const rankMap = {};
  const srcMap =
    inObj.rankByPerDisciplin && typeof inObj.rankByPerDisciplin === "object"
      ? inObj.rankByPerDisciplin
      : {};
  for (const [k, v] of Object.entries(srcMap)) {
    const key = String(k).trim();
    if (!key) continue;
    rankMap[key] = normalizeRankBy(v);
  }
  return {
    rankByDefault: normalizeRankBy(inObj.rankByDefault),
    rankByPerDisciplin: rankMap,
    filters: {
      wettkampf: String(f.wettkampf ?? "").trim(),
      disziplin: String(f.disziplin ?? "").trim(),
      stand:
        Number.isFinite(Number(f.stand)) && Number(f.stand) > 0
          ? Number(f.stand)
          : null,
      year:
        Number.isFinite(Number(f.year)) && Number(f.year) >= 2000 && Number(f.year) <= 2100
          ? Number(f.year)
          : null,
      dateFrom:
        /^\d{4}-\d{2}-\d{2}$/.test(String(f.dateFrom ?? "").trim())
          ? String(f.dateFrom).trim()
          : "",
      dateTo:
        /^\d{4}-\d{2}-\d{2}$/.test(String(f.dateTo ?? "").trim())
          ? String(f.dateTo).trim()
          : "",
      allDates: Boolean(f.allDates),
    },
  };
}

function readUrkundenSettings() {
  try {
    if (!fs.existsSync(URKUNDEN_SETTINGS_PATH)) return urkundenDefaults();
    const raw = fs.readFileSync(URKUNDEN_SETTINGS_PATH, "utf8");
    return normalizeUrkundenSettings(JSON.parse(raw));
  } catch {
    return urkundenDefaults();
  }
}

function readAuswertungSettings() {
  try {
    if (!fs.existsSync(AUSWERTUNG_SETTINGS_PATH)) return auswertungDefaults();
    const raw = fs.readFileSync(AUSWERTUNG_SETTINGS_PATH, "utf8");
    return normalizeAuswertungSettings(JSON.parse(raw));
  } catch {
    return auswertungDefaults();
  }
}

function writeUrkundenSettingsFile(s) {
  const normalized = normalizeUrkundenSettings(s);
  fs.mkdirSync(path.dirname(URKUNDEN_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(URKUNDEN_SETTINGS_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function writeAuswertungSettingsFile(s) {
  const normalized = normalizeAuswertungSettings(s);
  fs.mkdirSync(path.dirname(AUSWERTUNG_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(
    AUSWERTUNG_SETTINGS_PATH,
    JSON.stringify(normalized, null, 2),
    "utf8"
  );
  return normalized;
}

function sanitizeFilePart(v) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function listUrkundenTemplates() {
  if (!fs.existsSync(URKUNDEN_TEMPLATES_DIR)) return [];
  return fs
    .readdirSync(URKUNDEN_TEMPLATES_DIR)
    .filter(
      (n) =>
        n.toLowerCase().endsWith(".docx") &&
        !String(n).startsWith("~$")
    )
    .sort((a, b) => a.localeCompare(b, "de"));
}

function readSelectedUrkundenTemplateName() {
  try {
    if (!fs.existsSync(URKUNDEN_TEMPLATE_SELECTION_PATH)) return "";
    const raw = fs.readFileSync(URKUNDEN_TEMPLATE_SELECTION_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return String(parsed?.name ?? "").trim();
  } catch {
    return "";
  }
}

function writeSelectedUrkundenTemplateName(name) {
  const clean = String(name ?? "").trim();
  fs.mkdirSync(path.dirname(URKUNDEN_TEMPLATE_SELECTION_PATH), { recursive: true });
  fs.writeFileSync(
    URKUNDEN_TEMPLATE_SELECTION_PATH,
    JSON.stringify({ name: clean }, null, 2),
    "utf8"
  );
  return clean;
}

function resolveUrkundenTemplatePath(preferredName = "") {
  const all = listUrkundenTemplates();
  if (all.length === 0) return { path: "", name: "", available: all };
  const preferred = String(preferredName ?? "").trim();
  const selected = preferred || readSelectedUrkundenTemplateName();
  const chosen = all.includes(selected) ? selected : all[0];
  if (chosen && chosen !== selected) writeSelectedUrkundenTemplateName(chosen);
  return {
    path: path.join(URKUNDEN_TEMPLATES_DIR, chosen),
    name: chosen,
    available: all,
  };
}

function sendTemplatePreviewErrorHtml(res, title, detail = "") {
  const esc = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><title>Vorschau nicht verfügbar</title>
<style>
body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;height:100vh}
.box{max-width:760px;padding:18px 20px;border:1px solid #334155;border-radius:10px;background:#111827}
h2{margin:0 0 10px;font-size:18px}
p{margin:0 0 8px;line-height:1.45;color:#cbd5e1}
code{background:#1f2937;padding:2px 6px;border-radius:6px}
</style></head>
<body><div class="box">
<h2>${esc(title)}</h2>
<p>${esc(detail)}</p>
<p>Für die Vorschau wird LibreOffice benötigt. Konfiguriere ggf. <code>SCHEIBENANZEIGE_LIBREOFFICE_BIN</code>.</p>
</div></body></html>`);
}

async function extractDocxPlaceholders(buf) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter(
    (n) => n.startsWith("word/") && n.endsWith(".xml")
  );
  const out = new Set();
  // Support both {{name}} and {name} placeholder styles.
  const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\{([a-zA-Z0-9_.-]+)\}/g;
  for (const n of names) {
    const xml = await zip.files[n].async("string");
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(xml)) != null) {
      const token = String(m[1] || m[2] || "").trim();
      if (token) out.add(token);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b, "de"));
}

function computeDateLines(rows) {
  const key = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  const fmtShort = (d) =>
    d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  const fmtFull = (d) =>
    d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  const unique = new Map();
  for (const r of rows) {
    const d = new Date(String(r.Zeitstempel ?? ""));
    if (!Number.isFinite(d.getTime())) continue;
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const k = key(day);
    if (!unique.has(k)) unique.set(k, day);
  }
  const days = [...unique.values()].sort((a, b) => a.getTime() - b.getTime());
  if (days.length === 0) return ["—"];
  const ranges = [];
  for (const d of days) {
    if (ranges.length === 0) {
      ranges.push({ from: d, to: d });
      continue;
    }
    const last = ranges[ranges.length - 1];
    const delta = Math.round((d.getTime() - last.to.getTime()) / 86400000);
    if (delta === 1) last.to = d;
    else ranges.push({ from: d, to: d });
  }
  return ranges.map((r) =>
    r.from.getTime() === r.to.getTime()
      ? fmtFull(r.from)
      : `${fmtShort(r.from)} - ${fmtFull(r.to)}`
  );
}

async function loadRankedAuswertungRows(settings) {
  const f = settings.filters;
  const query = {};
  if (f.wettkampf) query.starterliste = f.wettkampf;
  if (f.disziplin) query.disziplin = f.disziplin;
  if (f.stand != null) query.stand = String(f.stand);
  if (f.year != null) query.year = String(f.year);
  if (f.dateFrom) query.dateFrom = f.dateFrom;
  if (f.dateTo) query.dateTo = f.dateTo;
  if (f.allDates) query.allDates = "1";
  const { sql, params } = buildAuswertungBaseSql(query);
  const [rows] = await pool.query(sql, params);
  return assignPlatzierungen(
    rows,
    settings.rankByDefault,
    settings.rankByPerDisciplin
  );
}

async function generateUrkundenBuffers(settings, templateBuffer, onProgress) {
  const ranked = await loadRankedAuswertungRows(settings);
  const groups = new Map();
  for (const r of ranked) {
    const key = `${r.WettkampfDisplay}\0${r.DisziplinNorm}\0${r.KlasseDisplay}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  const createdAt = new Date().toLocaleString("de-DE");
  const rankFrom = settings.rankFrom;
  const rankTo = settings.rankTo;
  let totalDocs = 0;
  for (const list of groups.values()) {
    for (const row of list) {
      if (row.Platz >= rankFrom && row.Platz <= rankTo) totalDocs += 1;
    }
  }
  if (onProgress) {
    onProgress({
      phase: "generate",
      message:
        totalDocs > 0
          ? `Urkunden werden erstellt: 0 von ${totalDocs}`
          : "Urkunden werden erstellt…",
      current: 0,
      total: totalDocs,
    });
  }
  let generatedCount = 0;
  for (const [key, list] of groups.entries()) {
    const [wettkampf, disziplin, klasse] = key.split("\0");
    const days = computeDateLines(list);
    for (const row of list) {
      if (row.Platz < rankFrom || row.Platz > rankTo) continue;
      const zip = new PizZip(templateBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      const context = {
        appName: "Meyton Wettkampfzentrale",
        createdAt,
        wettkampf,
        disziplin,
        klasse,
        wettkampftage: days.join("\n"),
        platz: row.Platz,
        vorname: String(row.Vorname ?? "").trim(),
        nachname: String(row.Nachname ?? "").trim(),
        name: `${String(row.Vorname ?? "").trim()} ${String(row.Nachname ?? "").trim()}`.trim(),
        stand: row.StandNr,
        gesamt: Number(row.TotalRing01) / 10,
        besterTeiler:
          row.BesterTeiler01 != null && Number.isFinite(Number(row.BesterTeiler01))
            ? Number(row.BesterTeiler01) / 10
            : "",
        schuesse: row.Trefferzahl,
      };
      doc.render(context);
      const fileBuffer = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });
      const fileName = [
        sanitizeFilePart(wettkampf || "wettkampf"),
        sanitizeFilePart(disziplin || "disziplin"),
        sanitizeFilePart(klasse || "klasse"),
        `platz-${row.Platz}`,
      ]
        .filter(Boolean)
        .join("-") + ".docx";
      out.push({ fileName, buffer: fileBuffer });
      generatedCount += 1;
      if (onProgress) {
        onProgress({
          phase: "generate",
          message: `Urkunden werden erstellt: ${generatedCount} von ${totalDocs}`,
          current: generatedCount,
          total: totalDocs,
        });
      }
    }
  }
  return { files: out, rankedRows: ranked };
}

async function convertDocxFilesToPdfs(docxFiles, onProgress) {
  const total = Array.isArray(docxFiles) ? docxFiles.length : 0;
  if (onProgress) {
    onProgress({
      phase: "convert",
      message:
        total > 0
          ? `PDF wird vorbereitet: 0 von ${total}`
          : "PDF wird vorbereitet…",
      current: 0,
      total,
    });
  }
  // Prefer the bundled WASM converter (works without local soffice installation).
  try {
    const converter = await createWorkerConverter({
      wasmPath: LIBREOFFICE_WASM_PATH,
    });
    try {
      const out = [];
      let done = 0;
      for (const f of docxFiles) {
        const result = await converter.convert(
          f.buffer,
          { outputFormat: "pdf" },
          f.fileName
        );
        const pdfName = `${path.basename(f.fileName, path.extname(f.fileName))}.pdf`;
        out.push({ fileName: pdfName, buffer: Buffer.from(result.data) });
        done += 1;
        if (onProgress) {
          onProgress({
            phase: "convert",
            message: `PDF wird vorbereitet: ${done} von ${total}`,
            current: done,
            total,
          });
        }
      }
      return out;
    } finally {
      await converter.destroy();
    }
  } catch {
    // Fallback to local soffice if WASM conversion is unavailable.
  }

  let tmpDir = "";
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "urkunden-pdf-"));
    for (const f of docxFiles) {
      fs.writeFileSync(path.join(tmpDir, f.fileName), f.buffer);
    }
    const out = [];
    let done = 0;
    for (const f of docxFiles) {
      const r = spawnSync(
        SOFFICE_BIN,
        [
          "--headless",
          "--nologo",
          "--nolockcheck",
          "--nodefault",
          "--norestore",
          "--convert-to",
          "pdf",
          "--outdir",
          tmpDir,
          path.join(tmpDir, f.fileName),
        ],
        { encoding: "utf8" }
      );
      if (r.error || r.status !== 0) {
        const errMsg = r.error?.message || r.stderr || r.stdout || "unbekannter Fehler";
        throw new Error(
          `PDF-Konvertierung fehlgeschlagen (${SOFFICE_BIN}): ${errMsg}`
        );
      }
      const pdfName = `${path.basename(f.fileName, path.extname(f.fileName))}.pdf`;
      const pdfPath = path.join(tmpDir, pdfName);
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF-Datei fehlt: ${pdfName}`);
      }
      out.push({ fileName: pdfName, buffer: fs.readFileSync(pdfPath) });
      done += 1;
      if (onProgress) {
        onProgress({
          phase: "convert",
          message: `PDF wird vorbereitet: ${done} von ${total}`,
          current: done,
          total,
        });
      }
    }
    return out;
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function mergePdfFiles(pdfFiles, onProgress) {
  const merged = await PDFDocument.create();
  const total = Array.isArray(pdfFiles) ? pdfFiles.length : 0;
  if (onProgress) {
    onProgress({
      phase: "merge",
      message:
        total > 0
          ? `Dokument wird finalisiert: 0 von ${total}`
          : "Dokument wird finalisiert…",
      current: 0,
      total,
    });
  }
  let done = 0;
  for (const f of pdfFiles) {
    const src = await PDFDocument.load(f.buffer);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const p of pages) merged.addPage(p);
    done += 1;
    if (onProgress) {
      onProgress({
        phase: "merge",
        message: `Dokument wird finalisiert: ${done} von ${total}`,
        current: done,
        total,
      });
    }
  }
  const bytes = await merged.save();
  return Buffer.from(bytes);
}

function runSofficePrint(filePath, printerName = "") {
  const args = printerName
    ? [
        "--headless",
        "--nologo",
        "--nolockcheck",
        "--nodefault",
        "--norestore",
        "--pt",
        printerName,
        filePath,
      ]
    : [
        "--headless",
        "--nologo",
        "--nolockcheck",
        "--nodefault",
        "--norestore",
        "-p",
        filePath,
      ];
  return spawnSync(SOFFICE_BIN, args, { encoding: "utf8" });
}

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
const auswertungProfilesStore = await createAuswertungProfilesStore(
  AUSWERTUNG_PROFILES_DB_PATH
);

async function reloadMysqlPool() {
  const old = pool;
  pool = createMysqlPool(buildDbConfig());
  await old.end().catch(() => {});
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "30mb" }));

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
    clubDisplayName: s.clubDisplayName,
    userDataDirectory: process.env.SCHEIBENANZEIGE_USER_DATA_DIR || null,
  });
});

app.put("/api/settings/ui", (req, res) => {
  try {
    const b = req.body ?? {};
    writeUiSettingsFile({
      boardRotationIntervalSec: Number(b.boardRotationIntervalSec),
      clubDisplayName:
        b.clubDisplayName != null ? String(b.clubDisplayName) : undefined,
    });
    const s = buildUiSettings();
    res.json({
      ok: true,
      boardRotationIntervalSec: s.boardRotationIntervalSec,
      boardPageSize: 8,
      clubDisplayName: s.clubDisplayName,
    });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

app.get("/api/urkunden/settings", async (_req, res) => {
  try {
    const settings = readUrkundenSettings();
    const selected = resolveUrkundenTemplatePath();
    const templateExists = Boolean(selected.path && fs.existsSync(selected.path));
    let placeholders = [];
    let templateName = selected.name || null;
    if (templateExists) {
      const buf = fs.readFileSync(selected.path);
      placeholders = await extractDocxPlaceholders(buf);
    }
    res.json({
      settings,
      template: {
        exists: templateExists,
        name: templateName,
        placeholders,
        availableNames: selected.available,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put("/api/urkunden/settings", (req, res) => {
  try {
    const settings = writeUrkundenSettingsFile(req.body ?? {});
    res.json({ ok: true, settings });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

app.put("/api/urkunden/template", async (req, res) => {
  try {
    const b = req.body ?? {};
    const filename = String(b.filename ?? "").trim();
    const templateNameInput = String(b.templateName ?? "").trim();
    const contentBase64 = String(b.contentBase64 ?? "").trim();
    if (!filename.toLowerCase().endsWith(".docx")) {
      return res.status(400).json({ error: "Nur .docx Vorlagen sind erlaubt." });
    }
    if (!contentBase64) {
      return res.status(400).json({ error: "contentBase64 fehlt." });
    }
    const buf = Buffer.from(contentBase64, "base64");
    if (!buf || buf.length === 0) {
      return res.status(400).json({ error: "Ungültiger DOCX-Inhalt." });
    }
    const rawName = templateNameInput || filename;
    const withExt = rawName.toLowerCase().endsWith(".docx")
      ? rawName
      : `${rawName}.docx`;
    const safeName = path.basename(withExt).replace(/[\\/]/g, "_");
    fs.mkdirSync(URKUNDEN_TEMPLATES_DIR, { recursive: true });
    const target = path.join(URKUNDEN_TEMPLATES_DIR, safeName);
    fs.writeFileSync(target, buf);
    writeSelectedUrkundenTemplateName(safeName);
    const placeholders = await extractDocxPlaceholders(buf);
    const availableNames = listUrkundenTemplates();
    res.json({
      ok: true,
      template: {
        exists: true,
        name: safeName,
        placeholders,
        availableNames,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/urkunden/template", (req, res) => {
  const byName = String(req.query.name ?? "").trim();
  const selected = resolveUrkundenTemplatePath(byName);
  if (!selected.path || !fs.existsSync(selected.path)) {
    return res.status(404).json({ error: "Keine DOCX-Vorlage hinterlegt." });
  }
  res.download(selected.path, selected.name);
});

app.get("/api/urkunden/templates", (_req, res) => {
  try {
    const selected = resolveUrkundenTemplatePath();
    res.json({ names: selected.available, selectedName: selected.name || null });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put("/api/urkunden/template/select", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const all = listUrkundenTemplates();
    if (!name || !all.includes(name)) {
      return res.status(400).json({ error: "Vorlage nicht gefunden." });
    }
    writeSelectedUrkundenTemplateName(name);
    const p = path.join(URKUNDEN_TEMPLATES_DIR, name);
    const placeholders = await extractDocxPlaceholders(fs.readFileSync(p));
    res.json({
      ok: true,
      template: { name, exists: true, placeholders, availableNames: all },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete("/api/urkunden/template", (req, res) => {
  try {
    const name = String(req.query.name ?? "").trim();
    const all = listUrkundenTemplates();
    if (!name || !all.includes(name)) {
      return res.status(400).json({ error: "Vorlage nicht gefunden." });
    }
    const p = path.join(URKUNDEN_TEMPLATES_DIR, name);
    if (!fs.existsSync(p)) {
      return res.status(404).json({ error: "Vorlage existiert nicht mehr." });
    }
    fs.rmSync(p, { force: true });
    const remaining = listUrkundenTemplates();
    const selectedNow = readSelectedUrkundenTemplateName();
    if (selectedNow === name) {
      writeSelectedUrkundenTemplateName(remaining[0] ?? "");
    }
    const resolved = resolveUrkundenTemplatePath();
    res.json({
      ok: true,
      removed: name,
      templates: {
        names: remaining,
        selectedName: resolved.name || null,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/urkunden/template/preview", (req, res) => {
  let tmpDir = "";
  try {
    const byName = String(req.query.name ?? "").trim();
    const selected = resolveUrkundenTemplatePath(byName);
    if (!selected.path || !fs.existsSync(selected.path)) {
      return sendTemplatePreviewErrorHtml(res, "Keine DOCX-Vorlage verfügbar.");
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "urkunden-preview-"));
    const outArgs = [
      "--headless",
      "--nologo",
      "--nolockcheck",
      "--nodefault",
      "--norestore",
      "--convert-to",
      "pdf",
      "--outdir",
      tmpDir,
      selected.path,
    ];
    const r = spawnSync(SOFFICE_BIN, outArgs, { encoding: "utf8" });
    if (r.status !== 0) {
      return sendTemplatePreviewErrorHtml(
        res,
        "PDF-Vorschau konnte nicht erzeugt werden.",
        `Binary: ${SOFFICE_BIN}`
      );
    }
    const pdfPath = path.join(
      tmpDir,
      `${path.basename(selected.name, path.extname(selected.name))}.pdf`
    );
    if (!fs.existsSync(pdfPath)) {
      return sendTemplatePreviewErrorHtml(res, "PDF-Ausgabe fehlt.");
    }
    const pdf = fs.readFileSync(pdfPath);
    res.setHeader("Content-Type", "application/pdf");
    const pdfName = `${path.basename(selected.name, path.extname(selected.name))}.pdf`;
    res.setHeader("Content-Disposition", `inline; filename="${pdfName}"`);
    res.send(pdf);
  } catch (e) {
    sendTemplatePreviewErrorHtml(res, "Vorschau fehlgeschlagen.", String(e.message));
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

app.get("/api/urkunden/progress/:id", (req, res) => {
  cleanupUrkundenProgressJobs();
  const id = String(req.params?.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "Fortschritts-ID fehlt." });
  const job = urkundenProgressJobs.get(id);
  if (!job) return res.status(404).json({ error: "Fortschritt nicht gefunden." });
  res.json(job);
});

app.post("/api/urkunden/preview-pdf", async (req, res) => {
  const progressId = initUrkundenProgressJob(req.body?.progressId);
  const report = (patch) => updateUrkundenProgressJob(progressId, patch);
  try {
    report({
      phase: "prepare",
      message: "Daten werden geladen…",
      current: 0,
      total: 0,
      done: false,
      error: "",
    });
    const selected = resolveUrkundenTemplatePath();
    if (!selected.path || !fs.existsSync(selected.path)) {
      report({
        done: true,
        error: "Keine DOCX-Vorlage hinterlegt.",
        message: "Vorschau konnte nicht erstellt werden.",
      });
      return res.status(400).json({ error: "Keine DOCX-Vorlage hinterlegt." });
    }
    const base = readUrkundenSettings();
    const merged = normalizeUrkundenSettings({
      ...base,
      ...(req.body?.settings ?? {}),
      filters: {
        ...base.filters,
        ...(req.body?.settings?.filters ?? {}),
      },
      rankByPerDisciplin: {
        ...base.rankByPerDisciplin,
        ...(req.body?.settings?.rankByPerDisciplin ?? {}),
      },
    });
    const templateBuffer = fs.readFileSync(selected.path);
    const generated = await generateUrkundenBuffers(merged, templateBuffer, report);
    if (generated.files.length === 0) {
      report({
        done: true,
        error: "Keine Urkunden für die aktuelle Auswahl/Platzierung.",
        message: "Keine passenden Urkunden gefunden.",
      });
      return res
        .status(400)
        .json({ error: "Keine Urkunden für die aktuelle Auswahl/Platzierung." });
    }
    const pdfFiles = await convertDocxFilesToPdfs(generated.files, report);
    const mergedPdf = await mergePdfFiles(pdfFiles, report);
    report({
      phase: "done",
      message: `Fertig! ${generated.files.length} Urkunde${generated.files.length === 1 ? "" : "n"} sind bereit.`,
      current: generated.files.length,
      total: generated.files.length,
      percent: 100,
      done: true,
      error: "",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="urkunden-vorschau.pdf"');
    res.send(mergedPdf);
  } catch (e) {
    report({
      done: true,
      error: String(e.message),
      message: "Vorschau konnte nicht erstellt werden.",
    });
    res.status(500).json({ error: String(e.message), sofficeBin: SOFFICE_BIN });
  }
});

app.post("/api/urkunden/preview-docx", async (req, res) => {
  const progressId = initUrkundenProgressJob(req.body?.progressId);
  const report = (patch) => updateUrkundenProgressJob(progressId, patch);
  try {
    report({
      phase: "prepare",
      message: "Daten werden geladen…",
      current: 0,
      total: 0,
      done: false,
      error: "",
    });
    const selected = resolveUrkundenTemplatePath();
    if (!selected.path || !fs.existsSync(selected.path)) {
      report({
        done: true,
        error: "Keine DOCX-Vorlage hinterlegt.",
        message: "Vorschau konnte nicht erstellt werden.",
      });
      return res.status(400).json({ error: "Keine DOCX-Vorlage hinterlegt." });
    }
    const base = readUrkundenSettings();
    const merged = normalizeUrkundenSettings({
      ...base,
      ...(req.body?.settings ?? {}),
      filters: {
        ...base.filters,
        ...(req.body?.settings?.filters ?? {}),
      },
      rankByPerDisciplin: {
        ...base.rankByPerDisciplin,
        ...(req.body?.settings?.rankByPerDisciplin ?? {}),
      },
    });
    const templateBuffer = fs.readFileSync(selected.path);
    const generated = await generateUrkundenBuffers(merged, templateBuffer, report);
    if (generated.files.length === 0) {
      report({
        done: true,
        error: "Keine Urkunden für die aktuelle Auswahl/Platzierung.",
        message: "Keine passenden Urkunden gefunden.",
      });
      return res
        .status(400)
        .json({ error: "Keine Urkunden für die aktuelle Auswahl/Platzierung." });
    }
    const first = generated.files[0];
    report({
      phase: "done",
      message: `Fertig! ${generated.files.length} Urkunde${generated.files.length === 1 ? "" : "n"} sind bereit.`,
      current: generated.files.length,
      total: generated.files.length,
      percent: 100,
      done: true,
      error: "",
    });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("X-Urkunden-Total", String(generated.files.length));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${path.basename(first.fileName)}"`
    );
    res.send(first.buffer);
  } catch (e) {
    report({
      done: true,
      error: String(e.message),
      message: "Vorschau konnte nicht erstellt werden.",
    });
    res.status(500).json({ error: String(e.message) });
  }
});

app.post("/api/urkunden/download-pdf", async (req, res) => {
  try {
    const outputMode =
      String(req.body?.outputMode ?? "single") === "perCertificate"
        ? "perCertificate"
        : "single";
    const selected = resolveUrkundenTemplatePath();
    if (!selected.path || !fs.existsSync(selected.path)) {
      return res.status(400).json({ error: "Keine DOCX-Vorlage hinterlegt." });
    }
    const base = readUrkundenSettings();
    const merged = normalizeUrkundenSettings({
      ...base,
      ...(req.body?.settings ?? {}),
      filters: {
        ...base.filters,
        ...(req.body?.settings?.filters ?? {}),
      },
      rankByPerDisciplin: {
        ...base.rankByPerDisciplin,
        ...(req.body?.settings?.rankByPerDisciplin ?? {}),
      },
    });
    const templateBuffer = fs.readFileSync(selected.path);
    const generated = await generateUrkundenBuffers(merged, templateBuffer);
    if (generated.files.length === 0) {
      return res
        .status(400)
        .json({ error: "Keine Urkunden für die aktuelle Auswahl/Platzierung." });
    }
    const pdfFiles = await convertDocxFilesToPdfs(generated.files);
    const stamp = new Date().toISOString().slice(0, 10);
    const name = sanitizeFilePart(merged.filters.wettkampf || "wettkampf") || "wettkampf";
    if (outputMode === "single") {
      const mergedPdf = await mergePdfFiles(pdfFiles);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="urkunden-${name}-${stamp}.pdf"`
      );
      return res.send(mergedPdf);
    }
    const zip = new JSZip();
    for (const f of pdfFiles) zip.file(f.fileName, f.buffer);
    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="urkunden-${name}-${stamp}-pdf.zip"`
    );
    res.send(zipBuffer);
  } catch (e) {
    res.status(500).json({ error: String(e.message), sofficeBin: SOFFICE_BIN });
  }
});

app.post("/api/urkunden/print-pdf", async (req, res) => {
  let tmpDir = "";
  try {
    const outputMode =
      String(req.body?.outputMode ?? "single") === "perCertificate"
        ? "perCertificate"
        : "single";
    const selected = resolveUrkundenTemplatePath();
    if (!selected.path || !fs.existsSync(selected.path)) {
      return res.status(400).json({ error: "Keine DOCX-Vorlage hinterlegt." });
    }
    const base = readUrkundenSettings();
    const merged = normalizeUrkundenSettings({
      ...base,
      ...(req.body?.settings ?? {}),
      filters: {
        ...base.filters,
        ...(req.body?.settings?.filters ?? {}),
      },
      rankByPerDisciplin: {
        ...base.rankByPerDisciplin,
        ...(req.body?.settings?.rankByPerDisciplin ?? {}),
      },
    });
    const templateBuffer = fs.readFileSync(selected.path);
    const generated = await generateUrkundenBuffers(merged, templateBuffer);
    if (generated.files.length === 0) {
      return res
        .status(400)
        .json({ error: "Keine Urkunden für die aktuelle Auswahl/Platzierung." });
    }
    const pdfFiles = await convertDocxFilesToPdfs(generated.files);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "urkunden-print-pdf-"));
    const failures = [];
    if (outputMode === "single") {
      const mergedPdf = await mergePdfFiles(pdfFiles);
      const mergedName = "urkunden-gesamt.pdf";
      const mergedPath = path.join(tmpDir, mergedName);
      fs.writeFileSync(mergedPath, mergedPdf);
      const r = runSofficePrint(mergedPath, merged.printerName);
      if (r.status !== 0) {
        failures.push({
          file: mergedName,
          status: r.status,
          stderr: r.stderr,
          stdout: r.stdout,
        });
      }
    } else {
      for (const f of pdfFiles) {
        const filePath = path.join(tmpDir, f.fileName);
        fs.writeFileSync(filePath, f.buffer);
        const r = runSofficePrint(filePath, merged.printerName);
        if (r.status !== 0) {
          failures.push({
            file: f.fileName,
            status: r.status,
            stderr: r.stderr,
            stdout: r.stdout,
          });
        }
      }
    }
    if (failures.length > 0) {
      return res.status(500).json({
        error: "Druck fehlgeschlagen.",
        sofficeBin: SOFFICE_BIN,
        failures,
      });
    }
    res.json({
      ok: true,
      printed: outputMode === "single" ? 1 : pdfFiles.length,
      printer: merged.printerName || null,
      mode: outputMode,
      sofficeBin: SOFFICE_BIN,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message), sofficeBin: SOFFICE_BIN });
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

app.post("/api/urkunden/generate-zip", async (req, res) => {
  try {
    const selected = resolveUrkundenTemplatePath();
    if (!selected.path || !fs.existsSync(selected.path)) {
      return res.status(400).json({ error: "Keine DOCX-Vorlage hinterlegt." });
    }
    const base = readUrkundenSettings();
    const merged = normalizeUrkundenSettings({
      ...base,
      ...(req.body?.settings ?? {}),
      filters: {
        ...base.filters,
        ...(req.body?.settings?.filters ?? {}),
      },
      rankByPerDisciplin: {
        ...base.rankByPerDisciplin,
        ...(req.body?.settings?.rankByPerDisciplin ?? {}),
      },
    });
    const templateBuffer = fs.readFileSync(selected.path);
    const generated = await generateUrkundenBuffers(merged, templateBuffer);
    if (generated.files.length === 0) {
      return res
        .status(400)
        .json({ error: "Keine Urkunden für die aktuelle Auswahl/Platzierung." });
    }
    const zip = new JSZip();
    for (const f of generated.files) {
      zip.file(f.fileName, f.buffer);
    }
    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const name =
      sanitizeFilePart(merged.filters.wettkampf || "wettkampf") || "wettkampf";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"urkunden-${name}-${stamp}.zip\"`
    );
    res.send(zipBuffer);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post("/api/urkunden/print", async (req, res) => {
  let tmpDir = "";
  try {
    const selected = resolveUrkundenTemplatePath();
    if (!selected.path || !fs.existsSync(selected.path)) {
      return res.status(400).json({ error: "Keine DOCX-Vorlage hinterlegt." });
    }
    const base = readUrkundenSettings();
    const merged = normalizeUrkundenSettings({
      ...base,
      ...(req.body?.settings ?? {}),
      filters: {
        ...base.filters,
        ...(req.body?.settings?.filters ?? {}),
      },
      rankByPerDisciplin: {
        ...base.rankByPerDisciplin,
        ...(req.body?.settings?.rankByPerDisciplin ?? {}),
      },
    });
    const templateBuffer = fs.readFileSync(selected.path);
    const generated = await generateUrkundenBuffers(merged, templateBuffer);
    if (generated.files.length === 0) {
      return res
        .status(400)
        .json({ error: "Keine Urkunden für die aktuelle Auswahl/Platzierung." });
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "urkunden-"));
    const failures = [];
    for (const f of generated.files) {
      const filePath = path.join(tmpDir, f.fileName);
      fs.writeFileSync(filePath, f.buffer);
      const args = merged.printerName
        ? [
            "--headless",
            "--nologo",
            "--nolockcheck",
            "--nodefault",
            "--norestore",
            "--pt",
            merged.printerName,
            filePath,
          ]
        : [
            "--headless",
            "--nologo",
            "--nolockcheck",
            "--nodefault",
            "--norestore",
            "-p",
            filePath,
          ];
      const r = spawnSync(SOFFICE_BIN, args, { encoding: "utf8" });
      if (r.status !== 0) {
        failures.push({
          file: f.fileName,
          status: r.status,
          stderr: r.stderr,
          stdout: r.stdout,
        });
      }
    }
    if (failures.length > 0) {
      return res.status(500).json({
        error: "Druck fehlgeschlagen.",
        sofficeBin: SOFFICE_BIN,
        failures,
      });
    }
    res.json({
      ok: true,
      printed: generated.files.length,
      printer: merged.printerName || null,
      sofficeBin: SOFFICE_BIN,
    });
  } catch (e) {
    res.status(500).json({
      error: String(e.message),
      sofficeBin: SOFFICE_BIN,
    });
  } finally {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
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

/**
 * Platzierungen je Disziplin & Klasse.
 * `rankBy` = Standard; optional `rankByMap` = JSON `{"LP 20":"besterTeiler","LG …":"total"}` je Disziplin (TRIM).
 * Gleiche Filter wie Liste (`disziplin`, `stand`, `allDates`, …).
 */
app.get("/api/auswertung", async (req, res) => {
  const rankBy = normalizeRankBy(req.query.rankBy);
  const rankByPerDisciplin = parseRankByMap(req.query.rankByMap);
  try {
    const { sql, params } = buildAuswertungBaseSql(req.query);
    const [rows] = await pool.query(sql, params);
    const ranked = assignPlatzierungen(rows, rankBy, rankByPerDisciplin);
    res.json({ rankBy, rankByPerDisciplin, rows: ranked });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/auswertung/settings", (_req, res) => {
  try {
    res.json(readAuswertungSettings());
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put("/api/auswertung/settings", (req, res) => {
  try {
    const settings = writeAuswertungSettingsFile(req.body ?? {});
    res.json({ ok: true, settings });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

app.get("/api/auswertung/profiles", (_req, res) => {
  try {
    res.json({ profiles: auswertungProfilesStore.listProfiles() });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/auswertung/profiles/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Ungültige Profil-ID." });
    }
    const profile = auswertungProfilesStore.getProfile(id);
    if (!profile) return res.status(404).json({ error: "Profil nicht gefunden." });
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post("/api/auswertung/profiles", (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const settings = req.body?.settings ?? {};
    const created = auswertungProfilesStore.saveProfile(name, settings);
    res.json({ ok: true, profile: created });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

app.put("/api/auswertung/profiles/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Ungültige Profil-ID." });
    }
    const name = String(req.body?.name ?? "").trim();
    const updated = auswertungProfilesStore.renameProfile(id, name);
    res.json({ ok: true, profile: updated });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

app.delete("/api/auswertung/profiles/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Ungültige Profil-ID." });
    }
    auswertungProfilesStore.deleteProfile(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

/** Distinct Jahre für Auswertung (mit aktiver-Scheibe-Filterlogik). */
app.get("/api/auswertung/jahre", async (req, res) => {
  const q = { ...req.query };
  delete q.year;
  q.allDates = "1";
  const f = parseScheibenFilters(q, process.env);
  const { sql: extraWhere, params } = buildWhereExtras("Scheiben", f);
  const baseWhere = `WHERE ${whereActiveScheibe("Scheiben")} ${extraWhere}`;
  const sql = `
    SELECT DISTINCT YEAR(Scheiben.Zeitstempel) AS Jahr
    FROM Scheiben
    ${baseWhere}
    AND YEAR(Scheiben.Zeitstempel) IS NOT NULL
    ORDER BY Jahr DESC
  `;
  try {
    const [rows] = await pool.query(sql, params);
    res.json(
      rows
        .map((r) => Number(r.Jahr))
        .filter((y) => Number.isFinite(y) && y >= 2000 && y <= 2100)
    );
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/** Distinct Wettkämpfe (primär Rangliste, Fallback Starterliste). */
app.get("/api/auswertung/wettkaempfe", async (req, res) => {
  const q = { ...req.query };
  delete q.starterliste;
  q.allDates = "1";
  const f = parseScheibenFilters(q, process.env);
  const { sql: extraWhere, params } = buildWhereExtras("Scheiben", f);
  const baseWhere = `WHERE ${whereActiveScheibe("Scheiben")} ${extraWhere}`;
  const sql = `
    SELECT DISTINCT
      COALESCE(
        NULLIF(TRIM(COALESCE(Scheiben.Rangliste, '')), ''),
        NULLIF(TRIM(COALESCE(Scheiben.Starterliste, '')), '')
      ) AS WettkampfDisplay
    FROM Scheiben
    ${baseWhere}
    AND COALESCE(
      NULLIF(TRIM(COALESCE(Scheiben.Rangliste, '')), ''),
      NULLIF(TRIM(COALESCE(Scheiben.Starterliste, '')), '')
    ) IS NOT NULL
    ORDER BY WettkampfDisplay ASC
  `;
  try {
    const [rows] = await pool.query(sql, params);
    res.json(
      rows
        .map((r) => String(r.WettkampfDisplay ?? "").trim())
        .filter(Boolean)
    );
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/** Kennzahlen für einen Wettkampf (z. B. Starts und eindeutige Schützen). */
app.get("/api/auswertung/stats", async (req, res) => {
  const q = { ...req.query };
  delete q.disziplin;
  delete q.stand;
  delete q.standNr;
  q.latestPerStand = "0";
  q.allDates = "1";
  const f = parseScheibenFilters(q, process.env);
  const { sql: extraWhere, params } = buildWhereExtras("Scheiben", f);
  const baseWhere = `WHERE ${whereActiveScheibe("Scheiben")} ${extraWhere}`;
  const sql = `
    SELECT
      COUNT(*) AS starts,
      COUNT(
        DISTINCT COALESCE(
          NULLIF(CAST(Scheiben.SportpassID AS CHAR), ''),
          CONCAT(
            'name:',
            TRIM(COALESCE(Scheiben.Nachname, '')),
            '|',
            TRIM(COALESCE(Scheiben.Vorname, '')),
            '|',
            COALESCE(CAST(Scheiben.VereinsID AS CHAR), '')
          )
        )
      ) AS shooters
    FROM Scheiben
    ${baseWhere}
  `;
  try {
    const [[row]] = await pool.query(sql, params);
    res.json({
      starts: Number(row?.starts ?? 0),
      shooters: Number(row?.shooters ?? 0),
    });
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
    searchSql = ` AND (Nachname LIKE ? OR Vorname LIKE ? OR Disziplin LIKE ? OR Klasse LIKE ?) `;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const baseWhere = `WHERE ${whereActiveScheibe("Scheiben")} ${extraWhere} ${searchSql}`;
  const winOrder = windowOrderLatestPerStand(filters.rankBy);

  let sql;
  if (filters.latestPerStand) {
    sql = `
      SELECT ScheibenID, Nachname, Vorname, Disziplin, StandNr, Trefferzahl,
             TotalRing, TotalRing01, Zeitstempel, Starterliste, Klasse, KlassenID
      FROM (
        SELECT ScheibenID, Nachname, Vorname, Disziplin, StandNr, Trefferzahl,
               TotalRing, TotalRing01, Zeitstempel, Starterliste, Klasse, KlassenID,
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
             TotalRing, TotalRing01, Zeitstempel, Starterliste, Klasse, KlassenID
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
    searchSql = ` AND (Nachname LIKE ? OR Vorname LIKE ? OR Disziplin LIKE ? OR Klasse LIKE ?) `;
    const like = `%${q}%`;
    params.push(like, like, like, like);
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
