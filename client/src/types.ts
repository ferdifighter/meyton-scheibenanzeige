/** GET /api/settings/ui */
export type UiSettingsResponse = {
  boardRotationIntervalSec: number;
  /** fest: Anzeige pro „Seite“ in der Scheibenanzeige */
  boardPageSize: 8;
  /** Sidebar + Untertitel Scheibenanzeige */
  clubDisplayName: string;
  /** gesetzt u. a. bei Electron/AppImage: Ordner für db-settings.json / ui-settings.json */
  userDataDirectory?: string | null;
};

/** Antwort von GET /api/settings/db (kein Klartext-Passwort) */
export type DbSettingsResponse = {
  host: string;
  port: number;
  user: string;
  database: string;
  hasPassword: boolean;
  /** gesetzt u. a. bei Electron/AppImage */
  userDataDirectory?: string | null;
  meytonDefaults: {
    host: string;
    port: number;
    user: string;
    database: string;
  };
};

export type ScheibeRow = {
  ScheibenID: number;
  Nachname: string;
  Vorname: string;
  Disziplin: string;
  StandNr: number;
  Trefferzahl: number;
  TotalRing: number;
  TotalRing01: number;
  BesterTeiler01?: number;
  Status?: string;
  Zeitstempel: string;
  Starterliste: string;
  /** Name der Schützenklasse (Meyton `Scheiben.Klasse`) */
  Klasse?: string;
  /** ID der Schützenklasse (Meyton `Scheiben.KlassenID`) */
  KlassenID?: number;
};

export type SerieRow = {
  ScheibenID: number;
  Stellung: number;
  Serie: number;
  Ring: number;
  Ring01: number;
};

export type TrefferRow = {
  ScheibenID: number;
  Stellung: number;
  Treffer: number;
  x: number;
  y: number;
  Innenzehner: number;
  Ring: number;
  Ring01: number;
  Teiler01: number;
  Zeitstempel: string;
};

export type ScheibeDetail = {
  scheibe: Record<string, unknown> & ScheibeRow;
  serien: SerieRow[];
  treffer: TrefferRow[];
};

/** GET /api/auswertung — eine Zeile pro Scheibe mit Platz in (Disziplin, Klasse) */
export type AuswertungRow = {
  ScheibenID: number;
  Platz: number;
  Nachname: string;
  Vorname: string;
  StandNr: number;
  Disziplin: string;
  Klasse: string | null;
  KlassenID: number | null;
  TotalRing01: number;
  BesterTeiler01: number | null;
  Trefferzahl: number;
  DisziplinNorm: string;
  KlasseDisplay: string;
};

export type AuswertungResponse = {
  /** Fallback, wenn eine Disziplin nicht in `rankByPerDisciplin` vorkommt */
  rankBy: "total" | "besterTeiler";
  /** vom Server geparstes `rankByMap` (kann leer sein) */
  rankByPerDisciplin: Record<string, "total" | "besterTeiler">;
  rows: AuswertungRow[];
};
