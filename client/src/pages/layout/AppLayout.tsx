import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { fetchUiSettings } from "../../api";
import { DEFAULT_CLUB_DISPLAY_NAME } from "../../constants/defaults";

const FALLBACK_VERSION = import.meta.env.VITE_APP_VERSION;

function AppLayout() {
  const [appVersion, setAppVersion] = useState(FALLBACK_VERSION);
  const [clubDisplayName, setClubDisplayName] = useState(
    DEFAULT_CLUB_DISPLAY_NAME
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/health");
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as { version?: string };
        if (
          typeof j.version === "string" &&
          j.version.trim() !== "" &&
          !cancelled
        ) {
          setAppVersion(j.version.trim());
        }
      } catch {
        /* Fallback: VITE_APP_VERSION aus Build */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadClub() {
      try {
        const u = await fetchUiSettings();
        if (!cancelled && u.clubDisplayName?.trim()) {
          setClubDisplayName(u.clubDisplayName.trim());
        }
      } catch {
        /* DEFAULT_CLUB_DISPLAY_NAME */
      }
    }
    void loadClub();
    const onVis = () => {
      if (document.visibilityState === "visible") void loadClub();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="app-root app-layout-with-sidebar">
      <aside className="app-sidebar" aria-label="Hauptnavigation">
        <div className="app-sidebar-brand">
          <Link to="/" className="app-sidebar-title">
            Meyton Wettkampfzentrale
          </Link>
          <span className="app-sidebar-club">{clubDisplayName}</span>
        </div>
        <nav className="app-sidebar-nav" aria-label="Seiten">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `app-sidebar-link${isActive ? " app-sidebar-link-active" : ""}`
            }
          >
            Start
          </NavLink>
          <NavLink
            to="/trefferprotokoll"
            className={({ isActive }) =>
              `app-sidebar-link${isActive ? " app-sidebar-link-active" : ""}`
            }
          >
            Trefferprotokoll
          </NavLink>
          <NavLink
            to="/auswertung"
            className={({ isActive }) =>
              `app-sidebar-link${isActive ? " app-sidebar-link-active" : ""}`
            }
          >
            Auswertung
          </NavLink>
          <NavLink
            to="/einstellungen"
            className={({ isActive }) =>
              `app-sidebar-link${isActive ? " app-sidebar-link-active" : ""}`
            }
          >
            Einstellungen
          </NavLink>
          <NavLink
            to="/urkunden"
            className={({ isActive }) =>
              `app-sidebar-link${isActive ? " app-sidebar-link-active" : ""}`
            }
          >
            Urkunden
          </NavLink>
          <a
            className="app-sidebar-link app-sidebar-link-external"
            href="/scheibenanzeige"
            target="_blank"
            rel="noopener noreferrer"
          >
            Scheibenanzeige
            <span className="app-sidebar-newtab" aria-hidden>
              ↗
            </span>
          </a>
        </nav>
        <footer className="app-sidebar-footer">
          <a
            className="app-sidebar-footer-link"
            href="https://wrase-media.de"
            target="_blank"
            rel="noopener noreferrer"
          >
            Wrase-Media.de
          </a>
          <span className="app-sidebar-version">Version {appVersion}</span>
        </footer>
      </aside>
      <div className="app-sidebar-main">
        <Outlet />
      </div>
    </div>
  );
}

export default AppLayout;
