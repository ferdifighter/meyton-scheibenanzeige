import type {
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
  return r.json();
}

/** Distinct Disziplin-Werte; optional nach Stand eingeschränkt. */
export async function fetchDisziplinen(opts?: {
  stand?: number;
}): Promise<string[]> {
  const params = new URLSearchParams();
  if (opts?.stand != null && opts.stand > 0) {
    params.set("stand", String(opts.stand));
  }
  const q = params.toString();
  const r = await fetch(q ? `/api/disziplinen?${q}` : "/api/disziplinen");
  if (!r.ok) throw new Error(await r.text());
  const rows: { Disziplin: string }[] = await r.json();
  return rows
    .map((x) => String(x.Disziplin ?? "").trim())
    .filter(Boolean);
}

/** Distinct StandNr; optional nach Disziplin eingeschränkt. */
export async function fetchStaende(opts?: {
  disziplin?: string;
}): Promise<number[]> {
  const params = new URLSearchParams();
  const d = opts?.disziplin?.trim();
  if (d) params.set("disziplin", d);
  const q = params.toString();
  const r = await fetch(q ? `/api/stande?${q}` : "/api/stande");
  if (!r.ok) throw new Error(await r.text());
  const rows: { StandNr: number }[] = await r.json();
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
  return r.json();
}

export async function fetchScheibe(id: string | number): Promise<ScheibeDetail> {
  const r = await fetch(`/api/scheiben/${encodeURIComponent(String(id))}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
