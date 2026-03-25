# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

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

