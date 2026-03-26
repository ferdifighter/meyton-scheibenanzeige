# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

## [1.5.0] - 2026-03-25

### Added
- Integrierter DOCX-Editor für Urkundenvorlagen direkt in der Anwendung (Dialog aus der Vorlagenkarte).
- Deutsche Übersetzungen für den Editor inkl. Mapping-Datei für Toolbar-/Dialogtexte.
- Erweiterte Urkunden-Vorlagenverwaltung mit strukturiertem Ablauf und stabiler Vorschau-/Druckstrecke.

### Changed
- Urkunden-Toolbar visuell an das Original-Layout des eingesetzten Editors angenähert.
- CSS-Feinschliff für Toolbar-Interaktionen: konsistente Icon-Darstellung, Dropdown-Verhalten und Scroll-Container.
- Rahmen bei Toolbar-Icons und Dropdown-Triggern entfernt, damit die Bedienoberfläche ruhiger und klarer wirkt.

## [1.4.0] - 2026-03-25

### Added
- Neue Urkunden-Seite mit 3-Schritt-Workflow: Vorlage, Platzierung/Wertung, Vorschau & Drucken.
- DOCX-Vorlagenverwaltung inkl. Upload, Auswahl, Vorschau-Miniaturen, Platzhalterhilfe und Löschdialog.
- PDF-Vorschau/Druck für Urkunden (ein Dokument oder je Urkunde einzeln) mit Download.
- Echtzeit-Fortschrittsanzeige für die Vorschauerstellung mit Prozentwert und "Urkunde X von Y".
- Speicherung von Auswertungen als Profile in SQLite zur Wiederverwendung im Urkunden-Workflow.

### Changed
- Urkunden-UI verschlankt: redundante Felder/Buttons entfernt, kompaktere Abstände und klarere Dialogführung.
- Fortschrittstexte in der Vorschau nutzerfreundlich auf Phasen umgestellt (Laden, Erstellen, PDF, Finalisieren).
- Vorlagenliste filtert temporäre Word-Dateien (z. B. `~$...`) aus.

## [1.3.0] - 2026-03-25

### Added
- Auswertung deutlich erweitert: Filter für Wettkampf (`Rangliste`), Jahr sowie Zeitraum (`Von`/`Bis`, deutscher Datepicker).
- Kompaktere Auswertungs-UI mit Dialogen für Filter und Wertungseinstellungen.
- Kennzahlenkarten in der Auswertung: Wettkampftage, Gesamtanzahl Schützen und Starts.
- PDF-Export mit Vorschau-Dialog und Download.
- PDF-Layout mit Kopf-/Fußzeile, Seitenzahlen, Datum, Kennzahlen und verbessertem Tabellenlayout.

### Changed
- App-Name in Sidebar und Browser-Titel auf **Meyton Wettkampfzentrale** umbenannt.
- Wettkampfgruppierung und Filterung auf `Rangliste` (Fallback `Starterliste`) ausgerichtet.
- Drucklayout der Auswertung verbessert (vollständige Tabellen, bessere Umbrüche, mehr Abstände).
- Download-Dateiname der PDF enthält nun den Wettkampfnamen (normalisiert ohne Leerzeichen).

### Fixed
- DB-Konfiguration priorisiert nun zuverlässig `.env`/gespeicherte Settings vor Defaults.
- Datums-/Jahresfilter greifen konsistent in Filterlisten, Auswertung und Kennzahlen.

## [1.2.0] - 2026-03-22
- Auswertung (Klassen, pro Disziplin Wertung, Druck), Klasse in API/UI, Scheibenanzeige Vollbild.

## [1.1.0] - 2026-03-21
- Initiale Version der Meyton-Scheibenanzeige.

