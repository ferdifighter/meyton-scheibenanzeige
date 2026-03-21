import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAuswertung, fetchDisziplinen, fetchStaende } from "../api";
import { ring01ToDisplay } from "../format";
import type { AuswertungRow } from "../types";

function groupRows(rows: AuswertungRow[]) {
  const map = new Map<string, AuswertungRow[]>();
  for (const r of rows) {
    const key = `${r.DisziplinNorm}\u0000${r.KlasseDisplay}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return [...map.entries()].sort((a, b) => {
    const [da, ka] = a[0].split("\u0000");
    const [db, kb] = b[0].split("\u0000");
    const c = da.localeCompare(db, "de");
    if (c !== 0) return c;
    return ka.localeCompare(kb, "de");
  });
}

function rankLabel(mode: "total" | "besterTeiler"): string {
  return mode === "besterTeiler"
    ? "Bester Teiler (kleinste Zahl)"
    : "Gesamt (höchste Ringzahl)";
}

export function AuswertungPage() {
  const [rankByDefault, setRankByDefault] = useState<"total" | "besterTeiler">(
    "total"
  );
  /** nur Abweichungen vom Standard */
  const [rankByPerDisciplin, setRankByPerDisciplin] = useState<
    Record<string, "total" | "besterTeiler">
  >({});

  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [standFilter, setStandFilter] = useState("");
  const [allDates, setAllDates] = useState(false);

  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [stands, setStands] = useState<number[]>([]);
  const [filterOptsErr, setFilterOptsErr] = useState<string | null>(null);

  const [rows, setRows] = useState<AuswertungRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const grouped = useMemo(() => groupRows(rows), [rows]);

  const [printStamp, setPrintStamp] = useState<string | null>(null);

  const printFilterSummary = useMemo(() => {
    const d = disciplineFilter.trim() || "alle Disziplinen";
    const st = standFilter.trim() || "alle Stände";
    const z = allDates ? "alle Tage" : "nur heute";
    return `Filter: ${d} · ${st} · ${z}`;
  }, [disciplineFilter, standFilter, allDates]);

  useEffect(() => {
    const onBeforePrint = () => {
      setPrintStamp(new Date().toLocaleString("de-DE"));
      document.documentElement.classList.add("print-auswertung-prepare");
    };
    const onAfterPrint = () => {
      document.documentElement.classList.remove("print-auswertung-prepare");
    };
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      document.documentElement.classList.remove("print-auswertung-prepare");
    };
  }, []);

  const handlePrint = () => {
    setPrintStamp(new Date().toLocaleString("de-DE"));
    document.documentElement.classList.add("print-auswertung-prepare");
    requestAnimationFrame(() => window.print());
  };

  useEffect(() => {
    setRankByPerDisciplin((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!disciplines.includes(k)) delete next[k];
      }
      return next;
    });
  }, [disciplines]);

  useEffect(() => {
    setFilterOptsErr(null);
    void (async () => {
      try {
        const standNum =
          standFilter !== "" && Number.isFinite(Number(standFilter))
            ? Number(standFilter)
            : undefined;
        const d = await fetchDisziplinen({ stand: standNum });
        setDisciplines(d);
        setDisciplineFilter((prev) =>
          prev && !d.includes(prev) ? "" : prev
        );
      } catch (e) {
        setFilterOptsErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [standFilter]);

  useEffect(() => {
    setFilterOptsErr(null);
    void (async () => {
      try {
        const d = disciplineFilter.trim() || undefined;
        const s = await fetchStaende({ disziplin: d });
        setStands(s);
        setStandFilter((prev) => {
          if (prev === "") return prev;
          const n = Number(prev);
          return Number.isFinite(n) && s.includes(n) ? prev : "";
        });
      } catch (e) {
        setFilterOptsErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [disciplineFilter]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const standNum =
        standFilter !== "" && Number.isFinite(Number(standFilter))
          ? Number(standFilter)
          : undefined;
      const mapPayload: Record<string, "total" | "besterTeiler"> = {};
      for (const d of disciplines) {
        mapPayload[d] = rankByPerDisciplin[d] ?? rankByDefault;
      }
      const res = await fetchAuswertung({
        rankBy: rankByDefault,
        rankByPerDisciplin:
          Object.keys(mapPayload).length > 0 ? mapPayload : undefined,
        disziplin: disciplineFilter || undefined,
        allDates,
        stand: standNum,
      });
      setRows(res.rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [
    rankByDefault,
    rankByPerDisciplin,
    disciplines,
    disciplineFilter,
    allDates,
    standFilter,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const effectiveMode = (disc: string) =>
    rankByPerDisciplin[disc] ?? rankByDefault;

  return (
    <div className="protokoll-page auswertung-page">
      <div className="auswertung-print-only">
        <p className="auswertung-print-meta">
          {printStamp ? `Druck: ${printStamp}` : "Druck"}
        </p>
        <p className="auswertung-print-meta">{printFilterSummary}</p>
      </div>

      <header className="protokoll-page-header">
        <h1>Auswertung</h1>
        <p className="protokoll-page-lead no-print">
          Platzierungen je <strong>Disziplin</strong> und{" "}
          <strong>Schützenklasse</strong>. Pro Disziplin wählbar:{" "}
          <strong>Gesamt</strong> (höchste Ringzahl) oder{" "}
          <strong>Bester Teiler</strong> (kleinste Zahl gewinnt). Ohne
          Klassenangabe erscheint die Gruppe „—“.
        </p>
      </header>

      <div className="protokoll-toolbar auswertung-toolbar no-print">
        <label className="protokoll-filter-label" htmlFor="ausw-disc">
          Disziplin
        </label>
        <select
          id="ausw-disc"
          className="protokoll-filter-select"
          value={disciplineFilter}
          onChange={(e) => setDisciplineFilter(e.target.value)}
        >
          <option value="">Alle Disziplinen</option>
          {disciplines.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <label className="protokoll-filter-label" htmlFor="ausw-stand">
          Stand
        </label>
        <select
          id="ausw-stand"
          className="protokoll-filter-select protokoll-filter-select-narrow"
          value={standFilter}
          onChange={(e) => setStandFilter(e.target.value)}
        >
          <option value="">Alle Stände</option>
          {stands.map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>

        <label className="auswertung-check">
          <input
            type="checkbox"
            checked={allDates}
            onChange={(e) => setAllDates(e.target.checked)}
          />
          Alle Tage
        </label>

        <button
          type="button"
          className="auswertung-refresh"
          onClick={() => void load()}
        >
          Aktualisieren
        </button>

        <button
          type="button"
          className="auswertung-print-btn"
          onClick={handlePrint}
        >
          Drucken
        </button>
      </div>

      <section
        className="auswertung-disc-section no-print"
        aria-labelledby="ausw-rank-heading"
      >
        <h2 id="ausw-rank-heading" className="auswertung-disc-section-title">
          Wertung
        </h2>
        <p className="auswertung-disc-section-lead muted">
          <strong>Standard</strong> gilt für alle Disziplinen; in der Tabelle
          kann pro Disziplin abweichend gewählt werden.
        </p>
        <div className="auswertung-default-row">
          <label className="protokoll-filter-label" htmlFor="ausw-default">
            Standard
          </label>
          <select
            id="ausw-default"
            className="protokoll-filter-select"
            value={rankByDefault}
            onChange={(e) =>
              setRankByDefault(
                e.target.value === "besterTeiler" ? "besterTeiler" : "total"
              )
            }
          >
            <option value="total">Gesamt (höchste Ringzahl zuerst)</option>
            <option value="besterTeiler">
              Bester Teiler (kleinster Wert zuerst)
            </option>
          </select>
        </div>

        {disciplines.length > 0 && (
          <div className="protokoll-table-wrap auswertung-disc-table-wrap">
            <table className="protokoll-table auswertung-disc-table">
              <thead>
                <tr>
                  <th scope="col">Disziplin</th>
                  <th scope="col">Wertung</th>
                </tr>
              </thead>
              <tbody>
                {disciplines.map((d) => (
                  <tr key={d}>
                    <td className="auswertung-disc-name">{d}</td>
                    <td>
                      <select
                        className="protokoll-filter-select auswertung-disc-select"
                        aria-label={`Wertung für ${d}`}
                        value={
                          d in rankByPerDisciplin
                            ? rankByPerDisciplin[d]
                            : "__default__"
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setRankByPerDisciplin((prev) => {
                            const n = { ...prev };
                            if (v === "__default__") delete n[d];
                            else
                              n[d] =
                                v === "besterTeiler" ? "besterTeiler" : "total";
                            return n;
                          });
                        }}
                      >
                        <option value="__default__">
                          Wie Standard ({rankLabel(rankByDefault)})
                        </option>
                        <option value="total">
                          Gesamt (höchste Ringzahl zuerst)
                        </option>
                        <option value="besterTeiler">
                          Bester Teiler (kleinster Wert zuerst)
                        </option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {filterOptsErr && (
        <p
          className="muted auswertung-filter-warn no-print"
          title={filterOptsErr}
        >
          Filterlisten eingeschränkt: {filterOptsErr}
        </p>
      )}

      {err && <p className="error no-print">{err}</p>}
      {loading && <p className="muted no-print">Lade …</p>}

      {!loading && !err && rows.length === 0 && (
        <p className="muted no-print">
          Keine Scheiben für die aktuelle Auswahl.
        </p>
      )}

      <div className="auswertung-groups auswertung-print-results">
        {grouped.map(([key, list]) => {
          const [disc, klasse] = key.split("\u0000");
          const mode = effectiveMode(disc);
          return (
            <section key={key} className="auswertung-group">
              <h2 className="auswertung-group-title">
                <span className="auswertung-group-disc">{disc}</span>
                <span className="auswertung-group-sep" aria-hidden>
                  ·
                </span>
                <span className="auswertung-group-klasse">{klasse}</span>
                <span
                  className="auswertung-group-mode"
                  title={rankLabel(mode)}
                >
                  {mode === "besterTeiler" ? "Bester Teiler" : "Gesamt"}
                </span>
                <span className="auswertung-group-count">
                  ({list.length} Starter)
                </span>
              </h2>
              <div className="protokoll-table-wrap auswertung-table-wrap">
                <table className="protokoll-table auswertung-table">
                  <thead>
                    <tr>
                      <th scope="col">Platz</th>
                      <th scope="col">Name</th>
                      <th scope="col">Stand</th>
                      <th scope="col">Gesamt</th>
                      <th scope="col">Bester Teiler</th>
                      <th scope="col">Schüsse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.ScheibenID}>
                        <td className="auswertung-platz">{r.Platz}</td>
                        <td>
                          {String(r.Nachname).trim()},{" "}
                          {String(r.Vorname).trim()}
                        </td>
                        <td>{r.StandNr}</td>
                        <td>{ring01ToDisplay(Number(r.TotalRing01))}</td>
                        <td>
                          {r.BesterTeiler01 != null &&
                          Number.isFinite(Number(r.BesterTeiler01))
                            ? ring01ToDisplay(Number(r.BesterTeiler01))
                            : "—"}
                        </td>
                        <td>{r.Trefferzahl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
