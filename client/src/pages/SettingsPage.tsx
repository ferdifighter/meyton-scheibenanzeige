import { useCallback, useEffect, useState } from "react";
import {
  fetchDbSettings,
  fetchUiSettings,
  resetDbSettingsFile,
  saveDbSettings,
  saveUiSettings,
} from "../api";
import { DEFAULT_CLUB_DISPLAY_NAME } from "../constants/defaults";
import type { DbSettingsResponse } from "../types";

type SettingsTab = "database" | "board";

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("database");
  const [loaded, setLoaded] = useState<DbSettingsResponse | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [user, setUser] = useState("");
  const [database, setDatabase] = useState("");
  const [password, setPassword] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const [uiRotationSec, setUiRotationSec] = useState("30");
  const [uiClubName, setUiClubName] = useState(DEFAULT_CLUB_DISPLAY_NAME);
  const [uiSaveError, setUiSaveError] = useState<string | null>(null);
  const [uiSaveOk, setUiSaveOk] = useState(false);
  const [uiBusy, setUiBusy] = useState(false);

  const applyFromResponse = useCallback((d: DbSettingsResponse) => {
    setHost(d.host);
    setPort(String(d.port));
    setUser(d.user);
    setDatabase(d.database);
    setPassword("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchDbSettings();
        if (!cancelled) {
          setLoaded(d);
          applyFromResponse(d);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyFromResponse]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await fetchUiSettings();
        if (!cancelled) {
          setUiRotationSec(String(u.boardRotationIntervalSec));
          if (u.clubDisplayName?.trim()) {
            setUiClubName(u.clubDisplayName.trim());
          }
        }
      } catch {
        /* Standard */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    setBusy(true);
    try {
      const p = Number(port);
      await saveDbSettings({
        host: host.trim(),
        port: p,
        user: user.trim(),
        database: database.trim(),
        password: password.trim() === "" ? undefined : password,
      });
      const d = await fetchDbSettings();
      setLoaded(d);
      applyFromResponse(d);
      setSaveOk(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitUi(e: React.FormEvent) {
    e.preventDefault();
    setUiSaveError(null);
    setUiSaveOk(false);
    setUiBusy(true);
    try {
      const sec = Number(uiRotationSec);
      await saveUiSettings({
        boardRotationIntervalSec: sec,
        clubDisplayName: uiClubName.trim(),
      });
      const u = await fetchUiSettings();
      setUiRotationSec(String(u.boardRotationIntervalSec));
      if (u.clubDisplayName?.trim()) {
        setUiClubName(u.clubDisplayName.trim());
      }
      setUiSaveOk(true);
    } catch (err) {
      setUiSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setUiBusy(false);
    }
  }

  function fillMeytonDefaults() {
    if (!loaded) return;
    const m = loaded.meytonDefaults;
    setHost(m.host);
    setPort(String(m.port));
    setUser(m.user);
    setDatabase(m.database);
    setPassword("");
    setSaveOk(false);
    setSaveError(null);
  }

  async function onResetFile() {
    if (
      !window.confirm(
        "Gespeicherte Verbindungsdaten löschen und Meyton-Standard verwenden? (Umgebungsvariablen bleiben wirksam.)"
      )
    ) {
      return;
    }
    setSaveError(null);
    setSaveOk(false);
    setBusy(true);
    try {
      await resetDbSettingsFile();
      const d = await fetchDbSettings();
      setLoaded(d);
      applyFromResponse(d);
      setSaveOk(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hub-main-inner settings-page">
      <h1 className="hub-main-title">Einstellungen</h1>
      {loaded?.userDataDirectory && (
        <p className="settings-desktop-hint muted" role="note">
          <strong>Desktop (AppImage):</strong> Ihre Einträge werden in diesem
          Ordner gespeichert:{" "}
          <code className="settings-path-code">{loaded.userDataDirectory}</code>{" "}
          (<span className="settings-filenames">db-settings.json</span>,{" "}
          <span className="settings-filenames">ui-settings.json</span>
          ). So bleiben die Daten pro Rechner erhalten – auch wenn Sie nur die
          App-Datei weitergeben.
        </p>
      )}

      <div className="settings-tabs">
        <div
          className="settings-tabs-bar"
          role="tablist"
          aria-label="Einstellungsbereiche"
        >
          <button
            type="button"
            role="tab"
            id="settings-tab-database"
            className={`settings-tab${
              activeTab === "database" ? " settings-tab-active" : ""
            }`}
            aria-selected={activeTab === "database"}
            tabIndex={activeTab === "database" ? 0 : -1}
            onClick={() => setActiveTab("database")}
          >
            Datenbank
          </button>
          <button
            type="button"
            role="tab"
            id="settings-tab-board"
            className={`settings-tab${
              activeTab === "board" ? " settings-tab-active" : ""
            }`}
            aria-selected={activeTab === "board"}
            tabIndex={activeTab === "board" ? 0 : -1}
            onClick={() => setActiveTab("board")}
          >
            Scheibenanzeige
          </button>
        </div>

        <div
          className="settings-tab-panel"
          role="tabpanel"
          id="settings-panel-database"
          aria-labelledby="settings-tab-database"
          hidden={activeTab !== "database"}
        >
          <p className="hub-main-text settings-tab-lead">
            Verbindung zur Meyton-Datenbank <strong>SSMDB2</strong>. Standard sind
            die üblichen Meyton-Zugangsdaten im Vereinsnetz; hier können Sie
            abweichende Werte speichern (Datei auf dem Server bzw. im
            Desktop-Programm unter Benutzerdaten).
          </p>
          {loadError && (
            <p className="error settings-page-msg" role="alert">
              {loadError}
            </p>
          )}
          {loaded && (
            <p className="settings-page-hint muted">
              Passwort:{" "}
              {loaded.hasPassword
                ? "gespeichert – leer lassen, um es beizubehalten"
                : "noch keins in der Konfigurationsdatei – bitte eintragen oder Meyton-Standard zurücksetzen"}
            </p>
          )}
          <form className="settings-form" onSubmit={onSubmit}>
            <div className="settings-form-grid">
              <label className="search-label">
                Host
                <input
                  className="search-input"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="search-label">
                Port
                <input
                  className="search-input"
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  required
                />
              </label>
              <label className="search-label">
                Benutzer
                <input
                  className="search-input"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="search-label">
                Datenbank
                <input
                  className="search-input"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="search-label">
                Passwort (optional)
                <input
                  className="search-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={
                    loaded?.hasPassword ? "•••••••• (unverändert)" : ""
                  }
                />
              </label>
            </div>
            <div className="settings-actions">
              <button
                type="submit"
                className="settings-btn-primary"
                disabled={busy || !loaded}
              >
                Speichern &amp; testen
              </button>
              <button
                type="button"
                className="settings-btn-secondary"
                onClick={fillMeytonDefaults}
                disabled={busy || !loaded}
              >
                Meyton-Standard ins Formular
              </button>
              <button
                type="button"
                className="settings-btn-secondary"
                onClick={onResetFile}
                disabled={busy || !loaded}
              >
                Datei löschen (Meyton-Default)
              </button>
            </div>
          </form>
          {saveError && (
            <p className="error settings-page-msg" role="alert">
              {saveError}
            </p>
          )}
          {saveOk && !saveError && (
            <p className="settings-page-ok muted" role="status">
              Gespeichert; Verbindungstest (SELECT 1) war erfolgreich.
            </p>
          )}
        </div>

        <div
          className="settings-tab-panel"
          role="tabpanel"
          id="settings-panel-board"
          aria-labelledby="settings-tab-board"
          hidden={activeTab !== "board"}
        >
          <p className="hub-main-text settings-tab-lead">
            In der Großansicht werden <strong>8 Scheiben</strong> gleichzeitig
            gezeigt. Gibt es mehr aktive Stände, wechselt die Anzeige
            automatisch zur nächsten Gruppe.
          </p>
          <form className="settings-form" onSubmit={onSubmitUi}>
            <div className="settings-form-grid">
              <label className="search-label">
                Vereinsname (Sidebar &amp; Scheibenanzeige)
                <input
                  className="search-input"
                  type="text"
                  value={uiClubName}
                  onChange={(e) => setUiClubName(e.target.value)}
                  maxLength={200}
                  autoComplete="organization"
                  placeholder={DEFAULT_CLUB_DISPLAY_NAME}
                />
              </label>
              <label className="search-label">
                Seitenwechsel (Sekunden)
                <input
                  className="search-input"
                  type="number"
                  min={5}
                  max={3600}
                  step={1}
                  value={uiRotationSec}
                  onChange={(e) => setUiRotationSec(e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="settings-actions">
              <button
                type="submit"
                className="settings-btn-primary"
                disabled={uiBusy}
              >
                Anzeige-Einstellungen speichern
              </button>
            </div>
          </form>
          {uiSaveError && (
            <p className="error settings-page-msg" role="alert">
              {uiSaveError}
            </p>
          )}
          {uiSaveOk && !uiSaveError && (
            <p className="settings-page-ok muted" role="status">
              Anzeige-Einstellungen gespeichert.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
