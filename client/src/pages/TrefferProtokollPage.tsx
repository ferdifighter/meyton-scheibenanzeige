import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAuswertungWettkaempfe,
  fetchDisziplinen,
  fetchScheibe,
  fetchScheiben,
  fetchStaende,
} from "../api";
import { TrefferDirectionIcon } from "../components/TrefferDirectionIcon";
import { IssfTargetFace } from "../components/IssfTargetFace";
import { ring01ToDisplay } from "../format";
import { getLastTreffer } from "../trefferUtils";
import type { ScheibeDetail, ScheibeRow, TrefferRow } from "../types";

function sortTrefferChronological(rows: TrefferRow[]): TrefferRow[] {
  return [...rows].sort((a, b) => {
    if (a.Stellung !== b.Stellung) return a.Stellung - b.Stellung;
    return a.Treffer - b.Treffer;
  });
}

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function TrefferProtokollPage() {
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [stands, setStands] = useState<number[]>([]);
  const [wettkaempfe, setWettkaempfe] = useState<string[]>([]);
  const [filterOptsErr, setFilterOptsErr] = useState<string | null>(null);
  /** leer = alle Disziplinen */
  const [disciplineFilter, setDisciplineFilter] = useState("");
  /** leer = alle Stände */
  const [standFilter, setStandFilter] = useState("");
  /** leer = alle Wettkämpfe */
  const [wettkampfFilter, setWettkampfFilter] = useState("");
  /** freie Suche in der linken Schützenliste */
  const [shooterQuery, setShooterQuery] = useState("");

  const [list, setList] = useState<ScheibeRow[]>([]);
  const [listErr, setListErr] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ScheibeDetail | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    setListErr(null);
    setListLoading(true);
    try {
      const rows = await fetchScheiben("", {
        limit: 5000,
        latestPerStand: false,
        disziplin: disciplineFilter || undefined,
        stand:
          standFilter !== "" && Number.isFinite(Number(standFilter))
            ? Number(standFilter)
            : undefined,
        wettkampf: wettkampfFilter || undefined,
      });
      setList(rows);
      setSelectedId((prev) => {
        if (prev != null && rows.some((r) => r.ScheibenID === prev)) {
          return prev;
        }
        return rows[0]?.ScheibenID ?? null;
      });
    } catch (e) {
      setListErr(e instanceof Error ? e.message : String(e));
      setList([]);
    } finally {
      setListLoading(false);
    }
  }, [disciplineFilter, standFilter, wettkampfFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setFilterOptsErr(null);
    void (async () => {
      try {
        const w = await fetchAuswertungWettkaempfe();
        setWettkaempfe(w);
        setWettkampfFilter((prev) => (prev && !w.includes(prev) ? "" : prev));
      } catch (e) {
        setFilterOptsErr(e instanceof Error ? e.message : String(e));
        setWettkaempfe([]);
      }
    })();
  }, []);

  useEffect(() => {
    setFilterOptsErr(null);
    void (async () => {
      try {
        const d = await fetchDisziplinen({
          wettkampf: wettkampfFilter || undefined,
          stand:
            standFilter !== "" && Number.isFinite(Number(standFilter))
              ? Number(standFilter)
              : undefined,
        });
        setDisciplines(d);
        setDisciplineFilter((prev) =>
          prev && !d.includes(prev) ? "" : prev
        );
      } catch (e) {
        setFilterOptsErr(e instanceof Error ? e.message : String(e));
        setDisciplines([]);
      }
    })();
  }, [standFilter, wettkampfFilter]);

  useEffect(() => {
    setFilterOptsErr(null);
    void (async () => {
      try {
        const s = await fetchStaende({
          disziplin: disciplineFilter || undefined,
          wettkampf: wettkampfFilter || undefined,
        });
        setStands(s);
        setStandFilter((prev) => {
          if (!prev) return prev;
          const n = Number(prev);
          return Number.isFinite(n) && s.includes(n) ? prev : "";
        });
      } catch (e) {
        setFilterOptsErr(e instanceof Error ? e.message : String(e));
        setStands([]);
      }
    })();
  }, [disciplineFilter, wettkampfFilter]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailErr(null);
    void (async () => {
      try {
        const d = await fetchScheibe(selectedId);
        if (!cancelled) {
          setDetail(d);
        }
      } catch (e) {
        if (!cancelled) {
          setDetailErr(e instanceof Error ? e.message : String(e));
          setDetail(null);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const trefferSorted = useMemo(
    () => (detail ? sortTrefferChronological(detail.treffer) : []),
    [detail]
  );

  const filteredList = useMemo(() => {
    const needle = shooterQuery.trim().toLocaleLowerCase("de-DE");
    if (!needle) return list;
    return list.filter((row) => {
      const nach = String(row.Nachname ?? "").trim();
      const vor = String(row.Vorname ?? "").trim();
      const klasse = String(row.Klasse ?? "").trim();
      const disziplin = String(row.Disziplin ?? "").trim();
      const searchable = `${nach} ${vor} ${klasse} ${disziplin} ${row.StandNr}`.toLocaleLowerCase(
        "de-DE"
      );
      return searchable.includes(needle);
    });
  }, [list, shooterQuery]);

  useEffect(() => {
    setSelectedId((prev) => {
      if (filteredList.length === 0) return null;
      if (prev != null && filteredList.some((r) => r.ScheibenID === prev)) return prev;
      return filteredList[0].ScheibenID;
    });
  }, [filteredList]);

  const last = detail ? getLastTreffer(detail.treffer) : null;
  const s = detail?.scheibe;

  return (
    <div className="protokoll-page">
      <header className="protokoll-page-header">
        <h1>Trefferprotokoll</h1>
        <p className="protokoll-page-lead">
          Alle aktiven Scheiben; nach Wettkampf, Stand und Disziplin filtern.
          Schütze links wählen – Treffer und Serien rechts.
        </p>
      </header>

      <div className="protokoll-toolbar">
        <label className="protokoll-filter-label" htmlFor="protokoll-wettkampf">
          Wettkampf
        </label>
        <select
          id="protokoll-wettkampf"
          className="protokoll-filter-select"
          value={wettkampfFilter}
          onChange={(e) => setWettkampfFilter(e.target.value)}
        >
          <option value="">Alle Wettkämpfe</option>
          {wettkaempfe.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <label className="protokoll-filter-label" htmlFor="protokoll-stand">
          Stand
        </label>
        <select
          id="protokoll-stand"
          className="protokoll-filter-select"
          value={standFilter}
          onChange={(e) => setStandFilter(e.target.value)}
        >
          <option value="">Alle Stände</option>
          {stands.map((n) => (
            <option key={n} value={String(n)}>
              Stand {n}
            </option>
          ))}
        </select>
        <label className="protokoll-filter-label" htmlFor="protokoll-discipline">
          Disziplin
        </label>
        <select
          id="protokoll-discipline"
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
        {filterOptsErr && (
          <span className="protokoll-filter-hint error" title={filterOptsErr}>
            (Filterlisten fehlen)
          </span>
        )}
        {!listLoading && !listErr && (
          <span className="protokoll-filter-count">
            {filteredList.length}
            {filteredList.length !== list.length ? ` / ${list.length}` : ""} Einträge
          </span>
        )}
      </div>

      <div className="protokoll-split">
        <aside className="protokoll-list-panel" aria-label="Schützenliste">
          <div className="protokoll-list-search">
            <label className="protokoll-filter-label" htmlFor="protokoll-shooter-search">
              Schütze suchen
            </label>
            <input
              id="protokoll-shooter-search"
              className="protokoll-filter-select"
              type="search"
              value={shooterQuery}
              onChange={(e) => setShooterQuery(e.target.value)}
              placeholder="Name, Disziplin, Klasse oder Stand"
            />
          </div>
          {listErr && <p className="error protokoll-panel-msg">{listErr}</p>}
          {listLoading && (
            <p className="muted protokoll-panel-msg">Lade Liste …</p>
          )}
          {!listLoading && !listErr && filteredList.length === 0 && (
            <p className="muted protokoll-panel-msg">Keine Scheiben gefunden.</p>
          )}
          <ul className="protokoll-shooter-list">
            {filteredList.map((row) => {
              const id = row.ScheibenID;
              const active = selectedId === id;
              const label = `${String(row.Nachname).trim()}, ${String(row.Vorname).trim()}`;
              const klasse = String(row.Klasse ?? "").trim();
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`protokoll-shooter-btn${active ? " protokoll-shooter-btn-active" : ""}`}
                    onClick={() => setSelectedId(id)}
                  >
                    <span className="protokoll-shooter-name">{label}</span>
                    <span className="protokoll-shooter-meta">
                      St. {row.StandNr} · {String(row.Disziplin)}
                      {klasse ? ` · ${klasse}` : ""}
                    </span>
                    <span className="protokoll-shooter-total">
                      {ring01ToDisplay(row.TotalRing01)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="protokoll-detail-panel" aria-live="polite">
          {selectedId == null && !listLoading && (
            <p className="muted protokoll-panel-msg">
              Kein Eintrag ausgewählt.
            </p>
          )}
          {detailLoading && (
            <p className="muted protokoll-panel-msg">Lade Daten …</p>
          )}
          {detailErr && (
            <p className="error protokoll-panel-msg">{detailErr}</p>
          )}
          {!detailLoading && !detailErr && detail && s && (
            <>
              <div className="protokoll-detail-head">
                <h2 className="protokoll-detail-title">
                  {String(s.Nachname).trim()}, {String(s.Vorname).trim()}
                </h2>
                <p className="protokoll-detail-sub">
                  Stand {Number(s.StandNr)} · {String(s.Disziplin)}
                  {String(s.Klasse ?? "").trim()
                    ? ` · ${String(s.Klasse).trim()}`
                    : ""}
                  {String(s.Starterliste ?? "").trim()
                    ? ` · ${String(s.Starterliste)}`
                    : ""}
                </p>
                <dl className="protokoll-detail-stats">
                  {String(s.Klasse ?? "").trim() ? (
                    <div>
                      <dt>Klasse</dt>
                      <dd
                        title={
                          s.KlassenID != null &&
                          Number.isFinite(Number(s.KlassenID))
                            ? `KlassenID: ${s.KlassenID}`
                            : undefined
                        }
                      >
                        {String(s.Klasse).trim()}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Gesamt</dt>
                    <dd>{ring01ToDisplay(Number(s.TotalRing01))}</dd>
                  </div>
                  <div>
                    <dt>Letzter Treffer</dt>
                    <dd>
                      {last ? ring01ToDisplay(last.Ring01) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Bester Teiler</dt>
                    <dd>
                      {ring01ToDisplay(
                        s.BesterTeiler01 != null &&
                          s.BesterTeiler01 !== ""
                          ? Number(s.BesterTeiler01)
                          : null
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Schüsse</dt>
                    <dd>{Number(s.Trefferzahl)}</dd>
                  </div>
                </dl>
              </div>

              <div className="protokoll-detail-face">
                <IssfTargetFace
                  treffer={detail.treffer}
                  variant="card"
                  discipline={String(detail.scheibe.Disziplin)}
                />
              </div>

              {detail.serien.length > 0 && (
                <section className="protokoll-section">
                  <h3 className="protokoll-section-title">Serien</h3>
                  <div className="protokoll-table-wrap">
                    <table className="protokoll-table">
                      <thead>
                        <tr>
                          <th>Stellung</th>
                          <th>Serie</th>
                          <th>Ring (Zehntel)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.serien.map((ser, i) => (
                          <tr key={`${ser.Stellung}-${ser.Serie}-${i}`}>
                            <td>{ser.Stellung}</td>
                            <td>{ser.Serie}</td>
                            <td>{ring01ToDisplay(ser.Ring01)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section className="protokoll-section">
                <h3 className="protokoll-section-title">Treffer</h3>
                {trefferSorted.length === 0 ? (
                  <p className="muted">Keine Trefferzeilen.</p>
                ) : (
                  <div className="protokoll-table-wrap protokoll-table-wrap-treffer">
                    <table className="protokoll-table">
                      <thead>
                        <tr>
                          <th>Nr.</th>
                          <th>Stell.</th>
                          <th className="protokoll-col-pos">Pos.</th>
                          <th>Zeit</th>
                          <th>Ring</th>
                          <th>Teiler</th>
                          <th>Innenz.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trefferSorted.map((t) => (
                          <tr key={`${t.Stellung}-${t.Treffer}`}>
                            <td>{t.Treffer}</td>
                            <td>{t.Stellung}</td>
                            <td className="protokoll-col-pos">
                              <TrefferDirectionIcon x={t.x} y={t.y} />
                            </td>
                            <td className="protokoll-col-time">
                              {formatTs(t.Zeitstempel)}
                            </td>
                            <td>{ring01ToDisplay(t.Ring01)}</td>
                            <td>{ring01ToDisplay(t.Teiler01)}</td>
                            <td>{t.Innenzehner ? "Ja" : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
