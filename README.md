# Scheibenanzeige

**GitHub:** [ferdifighter/meyton-scheibenanzeige](https://github.com/ferdifighter/meyton-scheibenanzeige)

React-Webanwendung für die **Meyton SSMDB2**: Scheiben pro Schütze, **Disziplin**, **Serien** (pro Stellung) und **Gesamtergebnis** in Zehntel-Ringen, plus eine **Trefferlage** aus den Koordinaten der Tabelle `Treffer`.

## Repository auf GitHub anlegen & pushen

Falls das Repository noch nicht existiert: [Neues Repository](https://github.com/new?name=meyton-scheibenanzeige) mit Namen **`meyton-scheibenanzeige`** unter [@ferdifighter](https://github.com/ferdifighter) anlegen (**öffentlich**). **Kein** README, keine `.gitignore` und keine Lizenz hinzufügen (dieses Projekt bringt den ersten Commit mit).

Anschließend lokal (mit [Personal Access Token](https://github.com/settings/tokens) für HTTPS oder SSH-Key):

```bash
cd /pfad/zu/Scheibenanzeige
git remote -v   # origin → https://github.com/ferdifighter/meyton-scheibenanzeige.git
git push -u origin main
```

## Voraussetzungen

- Node.js 18+
- Erreichbare MySQL-Datenbank SSMDB2 (siehe [Meyton-Dokumentation](https://support.meyton.info/files/de-DE/55218443355627915.html))

## Einrichtung

```bash
cd server && cp .env.example .env
# .env bearbeiten: DB_PASSWORD und ggf. DB_HOST
cd ..
npm run install:all
```

## Versionierung

Die Versionsnummer folgt **Semantic Versioning** (`MAJOR.MINOR.PATCH`). Sie ist in **`package.json`** (Projektroot), **`client/package.json`** (Build über Vite) und **`server/package.json`** **gleich** zu halten. Die **Sidebar** zeigt die Version aus **`GET /api/health`** (also `server/package.json` zur Laufzeit); bis die Antwort da ist, erscheint die zuletzt gebaute Vite-Version als Fallback. Bei Releases alle drei Dateien gemeinsam anpassen: **PATCH** für kleine Korrekturen, **MINOR** für neue Funktionen (abwärtskompatibel), **MAJOR** bei inkompatiblen Änderungen.

## Desktop: AppImage (Linux, z. B. openSUSE)

Die Anwendung kann als **Electron**-Desktopprogramm gebaut werden; unter Linux entsteht ein **AppImage** (eine ausführbare Datei, keine systemweite Installation nötig).

### Bauen

```bash
npm run install:all
npm run electron:pack
```

Ergebnis: `dist-electron/` enthält u. a. `Scheibenanzeige-*.AppImage`.

### Konfiguration (auch für andere Vereine / nur AppImage)

Das AppImage ist **nur die ausführbare Datei** – **keine** schreibbaren Geheimnisse liegen im Paket. Jeder Verein konfiguriert **lokal** auf dem Schießstand-PC:

1. **Empfohlen:** In der App **Einstellungen** öffnen (Datenbank + Scheibenanzeige) und **Speichern**. Dabei entstehen im **Benutzerverzeichnis** u. a.:
   - **`db-settings.json`** – Verbindung zur SSMDB2 (ersetzt manuelles Editieren)
   - **`ui-settings.json`** – z. B. Seitenwechsel-Intervall der Scheibenanzeige

   Unter Linux liegt das typischerweise unter **`~/.config/scheibenanzeige-desktop/`** (Electron nutzt den App-Namen aus `package.json`). Der genaue Pfad wird in den **Einstellungen** angezeigt, wenn die Desktop-App läuft.

2. **Optional:** Eine Datei **`.env`** im gleichen Ordner (Vorlage **`.env.example`** legt die App beim ersten Start an). Nur nötig, wenn Sie Umgebungsvariablen statt oder zusätzlich zur Oberfläche nutzen wollen. Die App lädt sie über `SCHEIBENANZEIGE_ENV_PATH`.

Der eingebettete Server erhält automatisch **`SCHEIBENANZEIGE_SETTINGS_PATH`**, **`SCHEIBENANZEIGE_UI_SETTINGS_PATH`** und **`SCHEIBENANZEIGE_USER_DATA_DIR`** – Speichern über die Weboberfläche funktioniert damit **genauso** wie in der Entwicklung.


**Netzwerk:** Der Rechner muss die Meyton-MySQL-Instanz erreichen können (Firewall/VPN).

### AppImage ausführen (openSUSE)

```bash
chmod +x Scheibenanzeige-*.AppImage
./Scheibenanzeige-*.AppImage
```

Falls das Ausführen scheitert: **FUSE** bzw. **libfuse2** installieren (je nach Distribution; bei einigen openSUSE-Varianten Paket `fuse` oder `libfuse2`). Alternativ AppImage mit `--appimage-extract-and-run` starten.

### Nur testen (Entwicklung)

Frontend muss gebaut sein, damit der Server die SPA ausliefert:

```bash
npm run build:client
npm run electron:dev
```

## Start (zwei Terminals)

1. API:

   ```bash
   cd server && npm run dev
   ```

2. Frontend (nutzt Vite-Proxy auf Port 3001):

   ```bash
   cd client && npm run dev
   ```

Anschließend die im Terminal angezeigte URL öffnen (typisch `http://localhost:5173`).

### Routen (Frontend)

| Pfad | Inhalt |
|------|--------|
| `/` | Start (mit **Sidebar**: Navigation) |
| `/scheibenanzeige` | Scheiben-Karten (Live-Board), **ohne** Sidebar – in der Sidebar per Link **im neuen Tab** öffnen |
| `/trefferprotokoll` | Trefferprotokoll: Schützenliste links, Detail mit Treffern/Serien rechts |
| `/einstellungen` | **SSMDB2**-Zugang (JSON) und **Scheibenanzeige** (Seitenwechsel z. B. alle 30 s) |

Die Sidebar enthält u. a. den Link **Scheibenanzeige** (`target="_blank"`), damit die Großansicht auf einem zweiten Monitor separat laufen kann.

### Ein Port (optional)

Nach `npm run build:client` legt der Server bei Start die gebaute Oberfläche aus `client/dist` mit aus (falls vorhanden). Dann reicht z. B. nur `cd server && npm run dev` und Aufruf von `http://localhost:3001/` – Deep-Links wie `/scheibenanzeige` liefern die SPA.

## API

- `GET /api/health` – Datenbank erreichbar? Antwort enthält **`version`** (aus `server/package.json`)
- `GET /api/settings/db` – aktuelle DB-Verbindung (ohne Klartext-Passwort) inkl. Meyton-Standardwerte; optional **`userDataDirectory`** (Desktop/AppImage)
- `PUT /api/settings/db` – Verbindung speichern (JSON-Datei); Body: `host`, `port`, `user`, `database`, optional `password` (leer = Passwort unverändert)
- `DELETE /api/settings/db` – gespeicherte Datei entfernen → wieder Meyton-Defaults (und ggf. `.env`)
- `GET /api/settings/ui` – `boardRotationIntervalSec` (Standard **30**), `boardPageSize` (**8**), **`clubDisplayName`** (Vereinsname für Sidebar & Scheibenanzeige); optional **`userDataDirectory`** (Desktop/AppImage)
- `PUT /api/settings/ui` – Body: `boardRotationIntervalSec` (5–3600), **`clubDisplayName`** (max. 200 Zeichen; leer → Standardname)
- `GET /api/disziplinen` – Distinct **Disziplin** (optional **`stand`** = eine Standnummer → nur Disziplinen auf diesem Stand)
- `GET /api/stande` – Distinct **StandNr** (optional **`disziplin`** → nur Stände mit dieser Disziplin)
- `GET /api/scheiben?…&stand=…&disziplin=…` – Liste; **`stand`** = eine Standnummer (`StandNr = ?`); **`latestPerStand=0`** = alle passenden Zeilen; Limit max. **5000**
- `GET /api/board?q=…&limit=…` – mehrere Scheiben **mit** Serien/Treffer (Dashboard-Karten); Standard-**limit** = 5000, höchstens **`BOARD_MAX_LIMIT`** (bis 50000, siehe `.env.example`)
- `GET /api/scheiben/:id` – Detail inkl. `Serien` und `Treffer`

Die Oberfläche zeigt ein **Kartenraster** (ISSF-Scheibe, Serien, Werte) ohne Eingabefelder – für **reine Anzeige** (z. B. separater Monitor). Im Kopfbereich erscheinen **Datum und Uhrzeit** (lokal, Sekunden). Es werden **maximal 8 Scheiben** gleichzeitig angezeigt; bei mehr Ständen **wechselt** die Ansicht im unter **Einstellungen** konfigurierbaren Abstand (Standard **30 s**) zur nächsten Gruppe. Die Daten werden **automatisch alle paar Sekunden** neu geladen (Polling; Standard **2,5 s**), damit neue Schüsse und Treffer ohne manuelles Neuladen erscheinen. Polling-Abstand: in `client/.env` z. B. `VITE_POLL_INTERVAL_MS=1500` (Vite neu starten).

Ringwerte **Ring01** werden wie in SSMDB2 als Zehntel-Ringe gespeichert (z. B. `996` → **99,6**).

**Liste / Board:** Es werden nur Scheiben gelistet, an denen geschossen wird: `Trefferzahl > 0`, mindestens ein Datensatz in `Treffer`, sowie gültige Namen (keine Meyton-Platzhalter wie `--frei--` für freie Stände).

### Stände, „wer ist live“, gestern vs. heute

Die **SSMDB2** speichert **nicht**, welche physischen Stände eingeschaltet sind (das steuert die Meyton-Anlage). Die Tabelle **`Version`** ist nur die **Schema-Versionsnummer**, keine Stände-Anzahl.

Standardfilter der API:

| Einstellung | Bedeutung |
|-------------|-----------|
| **Datum** | Nur **`Zeitstempel` von heute** (`CURDATE()`), damit keine Scheiben von gestern erscheinen. Override: Umgebungsvariable `SCHEIBEN_ALL_DATES=1` oder Query `?allDates=1`. |
| **Pro Stand** | **`LATEST_PER_STAND`** (Standard: an): pro `StandNr` nur **eine** Scheibe. Sortierung: **`LATEST_RANK_BY=scheibenid`** (Standard) = **neueste Datenzeile** pro Stand. Nur **`Zeitstempel`** würde oft die **fertig geschossene** Session zeigen (letzter Schuss ist am neuesten). Alternative: `zeitstempel` oder Query `?rankBy=zeitstempel`. |
| **Stände einschränken** | `ACTIVE_STAND_NUMBERS=1,2,3,4,5,6,8` in `.env`, wenn z. B. Stand **7** abgeschaltet ist (manuell, da die DB das nicht weiß). |
| **Veranstaltung** | Optional `STARTERLISTE_FILTER=Kreismeisterschaft` oder Query `?starterliste=…`. |

Hilfe-Endpoint: `GET /api/meta` (Kurzinfo zu den Defaults, Feld **`version`**).

**Hinweis:** `Startzeit` ist in vielen Exporten `0000-00-00` – für Filter wird **`Zeitstempel`** genutzt.

## Hinweis Scheibenbild

- **Luftgewehr** (Standard): Ringmaße wie **ISSF 10 m Luftgewehr** (u. a. Außen 45,5 mm; Ringe 2–9 je 5 mm; Innenzehner 0,5 mm; weiße Ringe 1–3, schwarzer Spiegel ab Ring 4).
- **Luftpistole**: Wenn die Disziplin mit **LP** beginnt (Meyton-Kürzel) oder „Luftpistole“ / „air pistol“ enthält, wird die **ISSF 10 m Luftpistolenscheibe** gezeichnet; beginnt sie mit **LG**, gilt **Luftgewehr** (Außenring 1 Ø 155,5 mm; Ringe 2–6 je 15 mm; Ring 7–9; Ring 10 Ø 11,5 mm; Innenzehner Ø 5 mm; **schwarze Trefffläche** für die Wertungsringe 7–10, vgl. [ISSF 10 meter air pistol](https://en.wikipedia.org/wiki/ISSF_10_meter_air_pistol)).
