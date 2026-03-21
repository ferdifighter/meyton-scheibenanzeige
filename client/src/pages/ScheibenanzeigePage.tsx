import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBoard, fetchUiSettings } from "../api";
import { BOARD_PAGE_SIZE } from "../constants/board";
import { DEFAULT_CLUB_DISPLAY_NAME } from "../constants/defaults";
import { TargetCard } from "../components/TargetCard";
import type { ScheibeDetail } from "../types";

/** Abstand zwischen Datenaktualisierungen (ms). Über VITE_POLL_INTERVAL_MS überschreibbar. */
const BOARD_POLL_MS = Math.max(
  1000,
  Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 2500
);

function HeaderClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const dateStr = now.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="header-clock" aria-live="polite">
      <time dateTime={now.toISOString()}>
        <span className="header-clock-date">{dateStr}</span>
        <span className="header-clock-time">{timeStr}</span>
      </time>
    </div>
  );
}

export function ScheibenanzeigePage() {
  const [allItems, setAllItems] = useState<ScheibeDetail[]>([]);
  const [boardErr, setBoardErr] = useState<string | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [rotationSec, setRotationSec] = useState(30);
  const [clubDisplayName, setClubDisplayName] = useState(
    DEFAULT_CLUB_DISPLAY_NAME
  );

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(allItems.length / BOARD_PAGE_SIZE)),
    [allItems.length]
  );

  const displayedItems = useMemo(
    () =>
      allItems.slice(
        pageIndex * BOARD_PAGE_SIZE,
        pageIndex * BOARD_PAGE_SIZE + BOARD_PAGE_SIZE
      ),
    [allItems, pageIndex]
  );

  const loadRotationSettings = useCallback(async () => {
    try {
      const s = await fetchUiSettings();
      setRotationSec(s.boardRotationIntervalSec);
      if (s.clubDisplayName?.trim()) {
        setClubDisplayName(s.clubDisplayName.trim());
      }
    } catch {
      /* Standard 30 s */
    }
  }, []);

  useEffect(() => {
    void loadRotationSettings();
    const onVis = () => {
      if (document.visibilityState === "visible") void loadRotationSettings();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadRotationSettings]);

  useEffect(() => {
    setPageIndex((i) => (i >= pageCount ? 0 : i));
  }, [allItems.length, pageCount]);

  useEffect(() => {
    if (pageCount <= 1) return;
    const ms = Math.max(1000, rotationSec * 1000);
    const id = window.setInterval(() => {
      setPageIndex((i) => (i + 1) % pageCount);
    }, ms);
    return () => window.clearInterval(id);
  }, [pageCount, rotationSec]);

  useEffect(() => {
    const ids = new Set(
      displayedItems.map((x) => String(x.scheibe.ScheibenID))
    );
    if (selectedId && !ids.has(selectedId)) setSelectedId(null);
  }, [displayedItems, selectedId]);

  const loadBoard = useCallback(async (opts?: { showLoading?: boolean }) => {
    const showLoading = opts?.showLoading ?? false;
    if (showLoading) setBoardLoading(true);
    setBoardErr(null);
    try {
      const { items } = await fetchBoard("");
      setAllItems(items);
    } catch (e) {
      setBoardErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (showLoading) setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard({ showLoading: true });
  }, [loadBoard]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadBoard({ showLoading: false });
    }, BOARD_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadBoard]);

  return (
    <div className="app-root">
      <header className="header header-bar">
        <div className="header-brand">
          <Link to="/" className="header-back-link">
            ← Übersicht
          </Link>
          <h1>Scheibenanzeige</h1>
          <p className="subtitle">{clubDisplayName}</p>
        </div>
        <HeaderClock />
      </header>

      <section className="board-section">
        {pageCount > 1 && (
          <p className="board-page-hint muted" aria-live="polite">
            {BOARD_PAGE_SIZE} Scheiben pro Ansicht · Ansicht{" "}
            <strong>
              {pageIndex + 1} / {pageCount}
            </strong>{" "}
            · Wechsel alle {rotationSec}s
          </p>
        )}
        {boardErr && <p className="error">{boardErr}</p>}
        {boardLoading && allItems.length === 0 && (
          <p className="muted">Lade …</p>
        )}
        <div className="webscore-grid">
          {displayedItems.map((item) => {
            const id = String(item.scheibe.ScheibenID);
            return (
              <TargetCard
                key={id}
                detail={item}
                selected={selectedId === id}
                onSelect={() => setSelectedId(id)}
              />
            );
          })}
        </div>
        {allItems.length === 0 && !boardLoading && !boardErr && (
          <p className="muted">Keine Scheiben gefunden.</p>
        )}
      </section>
    </div>
  );
}
