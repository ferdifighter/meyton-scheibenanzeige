import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

const FALLBACK_VERSION = import.meta.env.VITE_APP_VERSION;

function AppLayout() {
  const [appVersion, setAppVersion] = useState(FALLBACK_VERSION);

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

  return (
    <div className="app-root app-layout-with-sidebar">
      <aside className="app-sidebar" aria-label="Hauptnavigation">
        <div className="app-sidebar-brand">
          <Link to="/" className="app-sidebar-title">
            Schießstand-Anzeigen
          </Link>
          <span className="app-sidebar-club">
            Schützenverein „Greif“ e. V. Blumenthal
          </span>
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
            to="/einstellungen"
            className={({ isActive }) =>
              `app-sidebar-link${isActive ? " app-sidebar-link-active" : ""}`
            }
          >
            Einstellungen
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
