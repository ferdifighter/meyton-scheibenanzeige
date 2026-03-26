import type {
  AuswertungResponse,
  DbSettingsResponse,
  UiSettingsResponse,
  ScheibeRow,
  ScheibeDetail,
} from "./types";

export async function fetchDbSettings(): Promise<DbSettingsResponse> {
  const r = await fetch("/api/settings/db");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveDbSettings(body: {
  host: string;
  port: number;
  user: string;
  database: string;
  /** leer = Passwort unverändert lassen */
  password?: string;
}): Promise<void> {
  const r = await fetch("/api/settings/db", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let msg = await r.text();
    try {
      const j = JSON.parse(msg) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* Klartext */
    }
    throw new Error(msg);
  }
}

/** Entfernt gespeicherte DB-Datei; Meyton-Defaults gelten wieder */
export async function fetchUiSettings(): Promise<UiSettingsResponse> {
  const r = await fetch("/api/settings/ui");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveUiSettings(body: {
  boardRotationIntervalSec: number;
  clubDisplayName: string;
}): Promise<void> {
  const r = await fetch("/api/settings/ui", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let msg = await r.text();
    try {
      const j = JSON.parse(msg) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* */
    }
    throw new Error(msg);
  }
}

export async function resetDbSettingsFile(): Promise<void> {
  const r = await fetch("/api/settings/db", { method: "DELETE" });
  if (!r.ok) {
    let msg = await r.text();
    try {
      const j = JSON.parse(msg) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* */
    }
    throw new Error(msg);
  }
}

export async function fetchScheiben(
  q: string,
  opts?: {
    limit?: number;
    /** `false` = alle Scheiben-Zeilen (alle Schützen/Sessions), nicht nur eine pro Stand */
    latestPerStand?: boolean;
    /** exakte Disziplin (nach TRIM), leer = alle */
    disziplin?: string;
    /** eine Standnummer, leer = alle */
    stand?: number;
  }
): Promise<ScheibeRow[]> {
  const params = new URLSearchParams({
    limit: String(Math.min(opts?.limit ?? 3000, 5000)),
  });
  if (q.trim()) params.set("q", q.trim());
  if (opts?.latestPerStand === false) params.set("latestPerStand", "0");
  const d = opts?.disziplin?.trim();
  if (d) params.set("disziplin", d);
  if (opts?.stand != null && opts.stand > 0) {
    params.set("stand", String(opts.stand));
  }
  const r = await fetch(`/api/scheiben?${params}`);
  if (!r.ok) throw new Error(await r.text());
  const rows: ScheibeRow[] = await r.json();
  // Fallback: wenn „nur heute“ leer ist, automatisch auf alle Tage erweitern.
  if (rows.length === 0 && !params.has("allDates")) {
    const p2 = new URLSearchParams(params);
    p2.set("allDates", "1");
    const r2 = await fetch(`/api/scheiben?${p2}`);
    if (!r2.ok) throw new Error(await r2.text());
    return r2.json();
  }
  return rows;
}

/** Distinct Disziplin-Werte; optional nach Stand eingeschränkt. */
export async function fetchDisziplinen(opts?: {
  stand?: number;
  year?: number;
  wettkampf?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<string[]> {
  const params = new URLSearchParams();
  if (opts?.stand != null && opts.stand > 0) {
    params.set("stand", String(opts.stand));
  }
  if (opts?.year != null && Number.isFinite(opts.year)) {
    params.set("year", String(opts.year));
  }
  if (opts?.wettkampf?.trim()) {
    params.set("starterliste", opts.wettkampf.trim());
  }
  if (opts?.dateFrom?.trim()) {
    params.set("dateFrom", opts.dateFrom.trim());
  }
  if (opts?.dateTo?.trim()) {
    params.set("dateTo", opts.dateTo.trim());
  }
  const q = params.toString();
  const r = await fetch(q ? `/api/disziplinen?${q}` : "/api/disziplinen");
  if (!r.ok) throw new Error(await r.text());
  let rows: { Disziplin: string }[] = await r.json();
  if (rows.length === 0 && !params.has("allDates")) {
    const p2 = new URLSearchParams(params);
    p2.set("allDates", "1");
    const q2 = p2.toString();
    const r2 = await fetch(q2 ? `/api/disziplinen?${q2}` : "/api/disziplinen");
    if (!r2.ok) throw new Error(await r2.text());
    rows = await r2.json();
  }
  return rows
    .map((x) => String(x.Disziplin ?? "").trim())
    .filter(Boolean);
}

/** Distinct StandNr; optional nach Disziplin eingeschränkt. */
export async function fetchStaende(opts?: {
  disziplin?: string;
  year?: number;
  wettkampf?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<number[]> {
  const params = new URLSearchParams();
  const d = opts?.disziplin?.trim();
  if (d) params.set("disziplin", d);
  if (opts?.year != null && Number.isFinite(opts.year)) {
    params.set("year", String(opts.year));
  }
  if (opts?.wettkampf?.trim()) {
    params.set("starterliste", opts.wettkampf.trim());
  }
  if (opts?.dateFrom?.trim()) {
    params.set("dateFrom", opts.dateFrom.trim());
  }
  if (opts?.dateTo?.trim()) {
    params.set("dateTo", opts.dateTo.trim());
  }
  const q = params.toString();
  const r = await fetch(q ? `/api/stande?${q}` : "/api/stande");
  if (!r.ok) throw new Error(await r.text());
  let rows: { StandNr: number }[] = await r.json();
  if (rows.length === 0 && !params.has("allDates")) {
    const p2 = new URLSearchParams(params);
    p2.set("allDates", "1");
    const q2 = p2.toString();
    const r2 = await fetch(q2 ? `/api/stande?${q2}` : "/api/stande");
    if (!r2.ok) throw new Error(await r2.text());
    rows = await r2.json();
  }
  return rows
    .map((x) => Number(x.StandNr))
    .filter((n) => Number.isFinite(n));
}

export async function fetchBoard(
  q: string,
  limit = 5000
): Promise<{ items: ScheibeDetail[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q.trim()) params.set("q", q.trim());
  const r = await fetch(`/api/board?${params}`);
  if (!r.ok) throw new Error(await r.text());
  const out: { items: ScheibeDetail[] } = await r.json();
  if (out.items.length === 0 && !params.has("allDates")) {
    const p2 = new URLSearchParams(params);
    p2.set("allDates", "1");
    const r2 = await fetch(`/api/board?${p2}`);
    if (!r2.ok) throw new Error(await r2.text());
    return r2.json();
  }
  return out;
}

export async function fetchScheibe(id: string | number): Promise<ScheibeDetail> {
  const r = await fetch(`/api/scheiben/${encodeURIComponent(String(id))}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Platzierungen je Disziplin & Klasse (Server sortiert pro Disziplin). */
export async function fetchAuswertung(opts: {
  /** Standard, wenn `rankByPerDisciplin` eine Disziplin nicht enthält */
  rankBy: "total" | "besterTeiler";
  /** optional: je Disziplin (exakter Name/TRIM wie in der DB) */
  rankByPerDisciplin?: Record<string, "total" | "besterTeiler">;
  disziplin?: string;
  /** alle Tage statt nur heute */
  allDates?: boolean;
  stand?: number;
  year?: number;
  wettkampf?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AuswertungResponse> {
  const params = new URLSearchParams();
  params.set("rankBy", opts.rankBy);
  const map = opts.rankByPerDisciplin;
  if (map != null && Object.keys(map).length > 0) {
    params.set("rankByMap", JSON.stringify(map));
  }
  if (opts.disziplin?.trim()) params.set("disziplin", opts.disziplin.trim());
  if (opts.allDates) params.set("allDates", "1");
  if (opts.stand != null && opts.stand > 0) {
    params.set("stand", String(opts.stand));
  }
  if (opts.year != null && Number.isFinite(opts.year)) {
    params.set("year", String(opts.year));
  }
  if (opts.wettkampf?.trim()) {
    params.set("starterliste", opts.wettkampf.trim());
  }
  if (opts.dateFrom?.trim()) {
    params.set("dateFrom", opts.dateFrom.trim());
  }
  if (opts.dateTo?.trim()) {
    params.set("dateTo", opts.dateTo.trim());
  }
  const r = await fetch(`/api/auswertung?${params}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type AuswertungSettings = {
  rankByDefault: "total" | "besterTeiler";
  rankByPerDisciplin: Record<string, "total" | "besterTeiler">;
  filters: {
    wettkampf: string;
    disziplin: string;
    stand: number | null;
    year: number | null;
    dateFrom: string;
    dateTo: string;
    allDates: boolean;
  };
};

export async function fetchAuswertungSettings(): Promise<AuswertungSettings> {
  const r = await fetch("/api/auswertung/settings");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveAuswertungSettings(settings: AuswertungSettings): Promise<void> {
  const r = await fetch("/api/auswertung/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!r.ok) throw new Error(await r.text());
}

export type AuswertungProfileSummary = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type AuswertungProfile = {
  id: number;
  name: string;
  settings: AuswertungSettings;
  createdAt: string;
  updatedAt: string;
};

export async function fetchAuswertungProfiles(): Promise<AuswertungProfileSummary[]> {
  const r = await fetch("/api/auswertung/profiles");
  if (!r.ok) throw new Error(await r.text());
  const out = (await r.json()) as { profiles?: AuswertungProfileSummary[] };
  return Array.isArray(out.profiles) ? out.profiles : [];
}

export async function fetchAuswertungProfile(id: number): Promise<AuswertungProfile> {
  const r = await fetch(`/api/auswertung/profiles/${encodeURIComponent(String(id))}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createAuswertungProfile(
  name: string,
  settings: AuswertungSettings
): Promise<AuswertungProfile> {
  const r = await fetch("/api/auswertung/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, settings }),
  });
  if (!r.ok) throw new Error(await r.text());
  const out = (await r.json()) as { profile: AuswertungProfile };
  return out.profile;
}

export async function renameAuswertungProfile(
  id: number,
  name: string
): Promise<AuswertungProfile> {
  const r = await fetch(`/api/auswertung/profiles/${encodeURIComponent(String(id))}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error(await r.text());
  const out = (await r.json()) as { profile: AuswertungProfile };
  return out.profile;
}

export async function deleteAuswertungProfile(id: number): Promise<void> {
  const r = await fetch(`/api/auswertung/profiles/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function fetchAuswertungYears(): Promise<number[]> {
  const r = await fetch("/api/auswertung/jahre");
  if (!r.ok) throw new Error(await r.text());
  const rows: number[] = await r.json();
  return rows.filter((y) => Number.isFinite(Number(y))).map((y) => Number(y));
}

export async function fetchAuswertungWettkaempfe(opts?: {
  year?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<string[]> {
  const params = new URLSearchParams();
  if (opts?.year != null && Number.isFinite(opts.year)) {
    params.set("year", String(opts.year));
  }
  if (opts?.dateFrom?.trim()) {
    params.set("dateFrom", opts.dateFrom.trim());
  }
  if (opts?.dateTo?.trim()) {
    params.set("dateTo", opts.dateTo.trim());
  }
  const q = params.toString();
  const r = await fetch(
    q ? `/api/auswertung/wettkaempfe?${q}` : "/api/auswertung/wettkaempfe"
  );
  if (!r.ok) throw new Error(await r.text());
  const rows: string[] = await r.json();
  return rows.map((x) => String(x).trim()).filter(Boolean);
}

export async function fetchAuswertungStats(opts?: {
  year?: number;
  wettkampf?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ starts: number; shooters: number }> {
  const params = new URLSearchParams();
  if (opts?.year != null && Number.isFinite(opts.year)) {
    params.set("year", String(opts.year));
  }
  if (opts?.wettkampf?.trim()) {
    params.set("starterliste", opts.wettkampf.trim());
  }
  if (opts?.dateFrom?.trim()) {
    params.set("dateFrom", opts.dateFrom.trim());
  }
  if (opts?.dateTo?.trim()) {
    params.set("dateTo", opts.dateTo.trim());
  }
  const q = params.toString();
  const r = await fetch(q ? `/api/auswertung/stats?${q}` : "/api/auswertung/stats");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type UrkundenSettings = {
  rankFrom: number;
  rankTo: number;
  rankByDefault: "total" | "besterTeiler";
  rankByPerDisciplin: Record<string, "total" | "besterTeiler">;
  printerName: string;
  filters: {
    wettkampf: string;
    disziplin: string;
    stand: number | null;
    year: number | null;
    dateFrom: string;
    dateTo: string;
    allDates: boolean;
  };
};

export async function fetchUrkundenSettings(): Promise<{
  settings: UrkundenSettings;
  template: {
    exists: boolean;
    name: string | null;
    placeholders: string[];
    availableNames?: string[];
  };
}> {
  const r = await fetch("/api/urkunden/settings");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveUrkundenSettings(settings: UrkundenSettings): Promise<void> {
  const r = await fetch("/api/urkunden/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function uploadUrkundenTemplate(
  file: File,
  templateName?: string
): Promise<{
  template: {
    exists: boolean;
    name: string | null;
    placeholders: string[];
    availableNames?: string[];
  };
}> {
  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  const contentBase64 = btoa(bin);
  const r = await fetch("/api/urkunden/template", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentBase64, templateName }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchUrkundenTemplates(): Promise<{
  names: string[];
  selectedName: string | null;
}> {
  const r = await fetch("/api/urkunden/templates");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function selectUrkundenTemplate(name: string): Promise<{
  template: {
    exists: boolean;
    name: string | null;
    placeholders: string[];
    availableNames?: string[];
  };
}> {
  const r = await fetch("/api/urkunden/template/select", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteUrkundenTemplate(name: string): Promise<{
  templates: { names: string[]; selectedName: string | null };
}> {
  const q = new URLSearchParams({ name });
  const r = await fetch(`/api/urkunden/template?${q.toString()}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchUrkundenTemplateDocx(name: string): Promise<ArrayBuffer> {
  const q = new URLSearchParams();
  if (name.trim()) q.set("name", name.trim());
  const r = await fetch(`/api/urkunden/template?${q.toString()}`);
  if (!r.ok) throw new Error(await r.text());
  return r.arrayBuffer();
}

export async function downloadUrkundenZip(settings: UrkundenSettings): Promise<Blob> {
  const r = await fetch("/api/urkunden/generate-zip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.blob();
}

export async function printUrkunden(settings: UrkundenSettings): Promise<{
  ok: boolean;
  printed: number;
  printer: string | null;
  sofficeBin: string;
}> {
  const r = await fetch("/api/urkunden/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchUrkundenPreviewPdf(settings: UrkundenSettings): Promise<Blob> {
  const r = await fetch("/api/urkunden/preview-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.blob();
}

export type UrkundenPreviewProgress = {
  id: string;
  phase: string;
  message: string;
  current: number;
  total: number;
  percent: number;
  done: boolean;
  error: string;
  startedAt: number;
  updatedAt: number;
};

export async function fetchUrkundenPreviewProgress(
  progressId: string
): Promise<UrkundenPreviewProgress> {
  const r = await fetch(`/api/urkunden/progress/${encodeURIComponent(progressId)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchUrkundenPreviewPdfWithProgress(
  settings: UrkundenSettings,
  progressId: string
): Promise<Blob> {
  const r = await fetch("/api/urkunden/preview-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings, progressId }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.blob();
}

export async function fetchUrkundenPreviewDocx(settings: UrkundenSettings): Promise<{
  blob: Blob;
  total: number;
}> {
  const r = await fetch("/api/urkunden/preview-docx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings }),
  });
  if (!r.ok) throw new Error(await r.text());
  const total = Number(r.headers.get("X-Urkunden-Total") || "0");
  return { blob: await r.blob(), total: Number.isFinite(total) ? total : 0 };
}

export async function fetchUrkundenPreviewDocxWithProgress(
  settings: UrkundenSettings,
  progressId: string
): Promise<{
  blob: Blob;
  total: number;
}> {
  const r = await fetch("/api/urkunden/preview-docx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings, progressId }),
  });
  if (!r.ok) throw new Error(await r.text());
  const total = Number(r.headers.get("X-Urkunden-Total") || "0");
  return { blob: await r.blob(), total: Number.isFinite(total) ? total : 0 };
}

export async function downloadUrkundenPdf(
  settings: UrkundenSettings,
  outputMode: "single" | "perCertificate"
): Promise<Blob> {
  const r = await fetch("/api/urkunden/download-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings, outputMode }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.blob();
}

export async function printUrkundenPdf(
  settings: UrkundenSettings,
  outputMode: "single" | "perCertificate"
): Promise<{
  ok: boolean;
  printed: number;
  printer: string | null;
  mode: "single" | "perCertificate";
  sofficeBin: string;
}> {
  const r = await fetch("/api/urkunden/print-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings, outputMode }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
