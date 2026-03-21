import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./pages/layout/AppLayout";
import { HomePage } from "./pages/HomePage";
import { ScheibenanzeigePage } from "./pages/ScheibenanzeigePage";
import { TrefferProtokollPage } from "./pages/TrefferProtokollPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AuswertungPage } from "./pages/AuswertungPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/trefferprotokoll" element={<TrefferProtokollPage />} />
          <Route path="/auswertung" element={<AuswertungPage />} />
          <Route path="/einstellungen" element={<SettingsPage />} />
        </Route>
        <Route path="/scheibenanzeige" element={<ScheibenanzeigePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
