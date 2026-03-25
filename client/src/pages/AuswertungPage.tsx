import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import flatpickr from "flatpickr";
import { German } from "flatpickr/dist/l10n/de.js";
import "flatpickr/dist/themes/dark.css";
import {
  fetchAuswertung,
  fetchAuswertungStats,
  fetchAuswertungYears,
  fetchAuswertungWettkaempfe,
  fetchDisziplinen,
  fetchStaende,
} from "../api";
import { ring01ToDisplay } from "../format";
import type { AuswertungRow } from "../types";

function groupRows(rows: AuswertungRow[]) {
  const map = new Map<string, Map<string, AuswertungRow[]>>();
  for (const r of rows) {
    const wettkampf = String(r.WettkampfDisplay || "Wettkampf —").trim();
    const klassenKey = `${r.DisziplinNorm}\u0000${r.KlasseDisplay}`;
    if (!map.has(wettkampf)) map.set(wettkampf, new Map());
    const classMap = map.get(wettkampf)!;
    if (!classMap.has(klassenKey)) classMap.set(klassenKey, []);
    classMap.get(klassenKey)!.push(r);
  }

  return [...map.entries()]
    .map(([wettkampf, classMap]) => {
      const classes = [...classMap.entries()].sort((a, b) => {
        const [da, ka] = a[0].split("\u0000");
        const [db, kb] = b[0].split("\u0000");
        const c = da.localeCompare(db, "de");
        if (c !== 0) return c;
        return ka.localeCompare(kb, "de");
      });
      return [wettkampf, classes] as const;
    })
    .sort((a, b) => {
      return a[0].localeCompare(b[0], "de");
  });
}

function rankLabel(mode: "total" | "besterTeiler"): string {
  return mode === "besterTeiler"
    ? "Bester Teiler (kleinste Zahl)"
    : "Gesamt (höchste Ringzahl)";
}

export function AuswertungPage() {
  const APP_NAME = "Meyton Wettkampfzentrale";
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
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [wettkampfFilter, setWettkampfFilter] = useState("");
  const [availableWettkaempfe, setAvailableWettkaempfe] = useState<string[]>([]);

  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [stands, setStands] = useState<number[]>([]);
  const [filterOptsErr, setFilterOptsErr] = useState<string | null>(null);

  const [rows, setRows] = useState<AuswertungRow[]>([]);
  const [wettkampfShooterCount, setWettkampfShooterCount] = useState<number | null>(
    null
  );
  const [wettkampfStarts, setWettkampfStarts] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const dateFromInputRef = useRef<HTMLInputElement | null>(null);
  const dateToInputRef = useRef<HTMLInputElement | null>(null);
  const dateFromPickerRef = useRef<flatpickr.Instance | null>(null);
  const dateToPickerRef = useRef<flatpickr.Instance | null>(null);

  const grouped = useMemo(() => groupRows(rows), [rows]);
  const wettkampfTageLines = useMemo(() => {
    const formatDateDe = (d: Date) =>
      d.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    const formatShort = (d: Date) =>
      d.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
      });
    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    const datePoints = rows
      .map((r) => new Date(String(r.Zeitstempel ?? "")))
      .filter((d) => Number.isFinite(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (datePoints.length === 0) return ["—"];
    const uniqueDays = new Map<string, Date>();
    for (const d of datePoints) {
      const key = dayKey(d);
      if (!uniqueDays.has(key)) uniqueDays.set(key, d);
    }
    const days = [...uniqueDays.values()]
      .sort((a, b) => a.getTime() - b.getTime())
      .map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()));

    /** @type {Array<{from: Date; to: Date}>} */
    const ranges: Array<{ from: Date; to: Date }> = [];
    for (const d of days) {
      if (ranges.length === 0) {
        ranges.push({ from: d, to: d });
        continue;
      }
      const last = ranges[ranges.length - 1];
      const diffDays = Math.round(
        (d.getTime() - last.to.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (diffDays === 1) {
        last.to = d;
      } else {
        ranges.push({ from: d, to: d });
      }
    }

    return ranges.map((r) => {
      if (r.from.getTime() === r.to.getTime()) return formatDateDe(r.from);
      return `${formatShort(r.from)} - ${formatDateDe(r.to)}`;
    });
  }, [rows]);
  const wettkampfDatumLabel = wettkampfTageLines.join("\n");

  const [printStamp, setPrintStamp] = useState<string | null>(null);

  const printFilterSummary = useMemo(() => {
    const w = wettkampfFilter.trim() || "alle Wettkämpfe";
    const d = disciplineFilter.trim() || "alle Disziplinen";
    const st = standFilter.trim() || "alle Stände";
    const z = dateFromFilter || dateToFilter
      ? `Zeitraum ${dateFromFilter || "…"} bis ${dateToFilter || "…"}`
      : yearFilter !== ""
      ? `Jahr ${yearFilter}`
      : allDates
        ? "alle Tage"
        : "nur heute";
    return `Filter: ${w} · ${d} · ${st} · ${z}`;
  }, [
    wettkampfFilter,
    disciplineFilter,
    standFilter,
    allDates,
    yearFilter,
    dateFromFilter,
    dateToFilter,
  ]);

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

  const closePdfDialog = useCallback(() => {
    setShowPdfDialog(false);
    setPdfError(null);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  }, [pdfPreviewUrl]);

  const buildPdfPreview = useCallback(async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 12;
      const createdAt = new Date().toLocaleString("de-DE");
      const footerLeft = `Erstellt mit Wrase-Media.de - ${APP_NAME}`;
      const wettkampfLabel = wettkampfFilter.trim() || "Alle Wettkämpfe";
      const disziplinLabel = disciplineFilter.trim() || "Alle Disziplinen";
      const standLabel = standFilter.trim() || "Alle Stände";

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Auswertung", marginX, 13.5);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Erstellt am: ${createdAt}`, pageWidth - marginX, 13.5, {
        align: "right",
      });
      doc.setDrawColor(190);
      doc.line(marginX, 16.8, pageWidth - marginX, 16.8);
      doc.setFontSize(10.5);
      doc.text(`Wettkampf: ${wettkampfLabel}`, marginX, 22.4);
      doc.text(`Disziplin: ${disziplinLabel}`, marginX, 27.4);
      doc.text(`Stand: ${standLabel}`, marginX, 32.4);
      const cardsY = 36;
      const cardGap = 4;
      const cardsCount = 3;
      const cardW = (pageWidth - marginX * 2 - cardGap * (cardsCount - 1)) / cardsCount;
      const cardH = 19;
      const cards = [
        { label: "Wettkampftage", value: wettkampfDatumLabel },
        { label: "Gesamtanzahl Schuetzen", value: String(wettkampfShooterCount ?? "-") },
        { label: "Starts", value: String(wettkampfStarts ?? "-") },
      ];
      cards.forEach((c, i) => {
        const x = marginX + i * (cardW + cardGap);
        doc.setDrawColor(210);
        doc.setFillColor(248, 248, 248);
        doc.roundedRect(x, cardsY, cardW, cardH, 1.6, 1.6, "FD");
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.text(c.label, x + 2.2, cardsY + 4.2);
        const isNumberCard = c.label !== "Wettkampftage";
        doc.setFontSize(isNumberCard ? 16 : 9.4);
        doc.setFont("helvetica", "bold");
        const lines = doc.splitTextToSize(c.value, cardW - 4.4).slice(0, 4);
        doc.text(lines, x + 2.2, cardsY + (isNumberCard ? 10.8 : 9.5));
      });

      let cursorY = 67;
      const minFree = 18;
      for (const [wettkampf, classes] of grouped) {
        if (cursorY > pageHeight - minFree) {
          doc.addPage();
          cursorY = 16;
        }
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(wettkampf, marginX, cursorY);
        cursorY += 5;

        for (const [key, list] of classes) {
          const [disc, klasse] = key.split("\u0000");
          if (cursorY > pageHeight - 32) {
            doc.addPage();
            cursorY = 16;
          }
          doc.setFontSize(10.5);
          doc.setFont("helvetica", "bold");
          doc.text(`${disc} · ${klasse} (${list.length} Starter)`, marginX, cursorY);

          autoTable(doc, {
            startY: cursorY + 1.8,
            margin: { left: marginX, right: marginX, top: 16, bottom: 14 },
            head: [["Platz", "Name", "Stand", "Gesamt", "Bester Teiler", "Schuesse"]],
            body: list.map((r) => [
              String(r.Platz),
              `${String(r.Nachname).trim()}, ${String(r.Vorname).trim()}`,
              String(r.StandNr),
              ring01ToDisplay(Number(r.TotalRing01)),
              r.BesterTeiler01 != null && Number.isFinite(Number(r.BesterTeiler01))
                ? ring01ToDisplay(Number(r.BesterTeiler01))
                : "—",
              String(r.Trefferzahl),
            ]),
            styles: { fontSize: 8, cellPadding: 1.4, textColor: 20 },
            headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
            theme: "grid",
          });

          const finalY = (doc as { lastAutoTable?: { finalY?: number } })
            .lastAutoTable?.finalY;
          cursorY = (finalY ?? cursorY + 20) + 8;
        }
      }

      if (grouped.length === 0) {
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.text("Keine Daten fuer die aktuelle Auswahl.", marginX, cursorY + 6);
      }

      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p += 1) {
        doc.setPage(p);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(`Seite ${p}/${totalPages}`, pageWidth - marginX, 8, {
          align: "right",
        });
        doc.text(footerLeft, marginX, pageHeight - 6);
        doc.text(createdAt, pageWidth - marginX, pageHeight - 6, {
          align: "right",
        });
      }

      const blob = doc.output("blob");
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      const previewUrl = URL.createObjectURL(blob);
      setPdfPreviewUrl(previewUrl);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(false);
    }
  }, [
    APP_NAME,
    grouped,
    rows,
    disciplineFilter,
    standFilter,
    wettkampfFilter,
    wettkampfDatumLabel,
    wettkampfShooterCount,
    wettkampfStarts,
    pdfPreviewUrl,
  ]);

  const openPdfDialog = useCallback(() => {
    setShowPdfDialog(true);
    void buildPdfPreview();
  }, [buildPdfPreview]);

  const downloadPdf = useCallback(() => {
    if (!pdfPreviewUrl) return;
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    const rawName = wettkampfFilter.trim() || "alle-wettkaempfe";
    const safeName = rawName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    a.href = pdfPreviewUrl;
    a.download = `auswertung-${safeName || "wettkampf"}-${stamp}.pdf`;
    a.click();
  }, [pdfPreviewUrl, wettkampfFilter]);

  useEffect(() => {
    if (!showFilterDialog && !showRatingDialog && !showPdfDialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowFilterDialog(false);
        setShowRatingDialog(false);
        setShowPdfDialog(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showFilterDialog, showRatingDialog, showPdfDialog]);

  useEffect(
    () => () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    },
    [pdfPreviewUrl]
  );

  useEffect(() => {
    if (
      !showFilterDialog ||
      !dateFromInputRef.current ||
      !dateToInputRef.current
    ) {
      return;
    }
    dateFromPickerRef.current = flatpickr(dateFromInputRef.current, {
      locale: German,
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d.m.Y",
      allowInput: false,
      defaultDate: dateFromFilter || undefined,
      onChange: (_selectedDates, dateStr) => {
        const next = dateStr || "";
        setDateFromFilter(next);
        if (next) setAllDates(false);
      },
    });
    dateToPickerRef.current = flatpickr(dateToInputRef.current, {
      locale: German,
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d.m.Y",
      allowInput: false,
      defaultDate: dateToFilter || undefined,
      onChange: (_selectedDates, dateStr) => {
        const next = dateStr || "";
        setDateToFilter(next);
        if (next) setAllDates(false);
      },
    });
    return () => {
      dateFromPickerRef.current?.destroy();
      dateToPickerRef.current?.destroy();
      dateFromPickerRef.current = null;
      dateToPickerRef.current = null;
    };
  }, [showFilterDialog]);

  useEffect(() => {
    if (!dateFromPickerRef.current) return;
    if (dateFromFilter) {
      dateFromPickerRef.current.setDate(dateFromFilter, false, "Y-m-d");
    } else {
      dateFromPickerRef.current.clear(false);
    }
  }, [dateFromFilter]);

  useEffect(() => {
    if (!dateToPickerRef.current) return;
    if (dateToFilter) {
      dateToPickerRef.current.setDate(dateToFilter, false, "Y-m-d");
    } else {
      dateToPickerRef.current.clear(false);
    }
  }, [dateToFilter]);

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
    void (async () => {
      try {
        const years = await fetchAuswertungYears();
        setAvailableYears(years);
        setYearFilter((prev) => {
          if (!prev) return prev;
          const n = Number(prev);
          return Number.isFinite(n) && years.includes(n) ? prev : "";
        });
      } catch {
        /* optional */
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const yearNum =
          yearFilter !== "" && Number.isFinite(Number(yearFilter))
            ? Number(yearFilter)
            : undefined;
        const rows = await fetchAuswertungWettkaempfe({
          year: yearNum,
          dateFrom: dateFromFilter || undefined,
          dateTo: dateToFilter || undefined,
        });
        setAvailableWettkaempfe(rows);
        setWettkampfFilter((prev) =>
          prev && !rows.includes(prev) ? "" : prev
        );
      } catch {
        setAvailableWettkaempfe([]);
      }
    })();
  }, [yearFilter, dateFromFilter, dateToFilter]);

  useEffect(() => {
    setFilterOptsErr(null);
    void (async () => {
      try {
        const standNum =
          standFilter !== "" && Number.isFinite(Number(standFilter))
            ? Number(standFilter)
            : undefined;
        const yearNum =
          yearFilter !== "" && Number.isFinite(Number(yearFilter))
            ? Number(yearFilter)
            : undefined;
        const d = await fetchDisziplinen({
          stand: standNum,
          year: yearNum,
          wettkampf: wettkampfFilter || undefined,
          dateFrom: dateFromFilter || undefined,
          dateTo: dateToFilter || undefined,
        });
        setDisciplines(d);
        setDisciplineFilter((prev) =>
          prev && !d.includes(prev) ? "" : prev
        );
      } catch (e) {
        setFilterOptsErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [standFilter, yearFilter, wettkampfFilter, dateFromFilter, dateToFilter]);

  useEffect(() => {
    setFilterOptsErr(null);
    void (async () => {
      try {
        const d = disciplineFilter.trim() || undefined;
        const yearNum =
          yearFilter !== "" && Number.isFinite(Number(yearFilter))
            ? Number(yearFilter)
            : undefined;
        const s = await fetchStaende({
          disziplin: d,
          year: yearNum,
          wettkampf: wettkampfFilter || undefined,
          dateFrom: dateFromFilter || undefined,
          dateTo: dateToFilter || undefined,
        });
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
  }, [disciplineFilter, yearFilter, wettkampfFilter, dateFromFilter, dateToFilter]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const standNum =
        standFilter !== "" && Number.isFinite(Number(standFilter))
          ? Number(standFilter)
          : undefined;
      const yearNum =
        yearFilter !== "" && Number.isFinite(Number(yearFilter))
          ? Number(yearFilter)
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
        year: yearNum,
        wettkampf: wettkampfFilter || undefined,
        dateFrom: dateFromFilter || undefined,
        dateTo: dateToFilter || undefined,
      });
      setRows(res.rows);
      if (wettkampfFilter.trim()) {
        const stats = await fetchAuswertungStats({
          year: yearNum,
          wettkampf: wettkampfFilter,
          dateFrom: dateFromFilter || undefined,
          dateTo: dateToFilter || undefined,
        });
        setWettkampfStarts(stats.starts);
        setWettkampfShooterCount(stats.shooters);
      } else {
        setWettkampfShooterCount(null);
        setWettkampfStarts(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
      setWettkampfShooterCount(null);
      setWettkampfStarts(null);
    } finally {
      setLoading(false);
    }
  }, [
    rankByDefault,
    rankByPerDisciplin,
    disciplines,
    wettkampfFilter,
    disciplineFilter,
    allDates,
    dateFromFilter,
    dateToFilter,
    yearFilter,
    standFilter,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

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

      <div className="auswertung-compact-actions no-print">
        <label className="protokoll-filter-label" htmlFor="ausw-wettkampf-quick">
          Wettkampf
        </label>
        <select
          id="ausw-wettkampf-quick"
          className="protokoll-filter-select auswertung-quick-wettkampf"
          value={wettkampfFilter}
          onChange={(e) => setWettkampfFilter(e.target.value)}
        >
          <option value="">Alle Wettkämpfe</option>
          {availableWettkaempfe.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="auswertung-refresh"
          onClick={() => setShowFilterDialog(true)}
        >
          Filter
        </button>
        <button
          type="button"
          className="auswertung-refresh"
          onClick={() => setShowRatingDialog(true)}
        >
          Wertung
        </button>
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
        <button
          type="button"
          className="auswertung-print-btn"
          onClick={openPdfDialog}
        >
          PDF
        </button>
      </div>

      {showFilterDialog && (
        <div
          className="auswertung-modal-backdrop no-print"
          onClick={() => setShowFilterDialog(false)}
        >
          <div
            className="auswertung-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Filter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auswertung-modal-head">
              <h2>Filter</h2>
              <button
                type="button"
                className="auswertung-print-btn"
                onClick={() => setShowFilterDialog(false)}
              >
                Schließen
              </button>
            </div>
            <div className="auswertung-filter-form">
              <div className="auswertung-form-row">
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
              </div>

              <div className="auswertung-form-row">
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
              </div>

              <div className="auswertung-form-row">
                <label className="protokoll-filter-label" htmlFor="ausw-year">
                  Jahr
                </label>
                <select
                  id="ausw-year"
                  className="protokoll-filter-select protokoll-filter-select-narrow"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                >
                  <option value="">Alle Jahre</option>
                  {availableYears.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="auswertung-form-row">
                <span className="protokoll-filter-label">Zeitraum</span>
                <div className="auswertung-period-controls">
                  <label className="auswertung-check">
                    <input
                      type="checkbox"
                      checked={allDates}
                      onChange={(e) => setAllDates(e.target.checked)}
                      disabled={
                        yearFilter !== "" ||
                        dateFromFilter !== "" ||
                        dateToFilter !== ""
                      }
                    />
                    Alle Tage
                  </label>
                  <input
                    ref={dateFromInputRef}
                    type="text"
                    className="protokoll-filter-select protokoll-filter-select-narrow"
                    placeholder="Von (dd.mm.jjjj)"
                    aria-label="Datum von"
                  />
                  <input
                    ref={dateToInputRef}
                    type="text"
                    className="protokoll-filter-select protokoll-filter-select-narrow"
                    placeholder="Bis (dd.mm.jjjj)"
                    aria-label="Datum bis"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {wettkampfFilter.trim() && (
        <div className="auswertung-stats-cards no-print">
          <article className="auswertung-stat-card">
            <p className="auswertung-stat-label">Wettkampftage</p>
            <p className="auswertung-stat-value auswertung-stat-value-small">
              {wettkampfTageLines.map((line, idx) => (
                <span key={`${line}-${idx}`} className="auswertung-stat-date-line">
                  {line}
                </span>
              ))}
            </p>
            <p className="auswertung-stat-sub">{wettkampfFilter}</p>
          </article>
          <article className="auswertung-stat-card">
            <p className="auswertung-stat-label">Gesamtanzahl Schützen</p>
            <p className="auswertung-stat-value">{wettkampfShooterCount ?? "…"}</p>
            <p className="auswertung-stat-sub">{wettkampfFilter}</p>
          </article>
          <article className="auswertung-stat-card">
            <p className="auswertung-stat-label">Starts</p>
            <p className="auswertung-stat-value">{wettkampfStarts ?? "…"}</p>
            <p className="auswertung-stat-sub">{wettkampfFilter}</p>
          </article>
        </div>
      )}

      {showRatingDialog && (
        <div
          className="auswertung-modal-backdrop no-print"
          onClick={() => setShowRatingDialog(false)}
        >
          <div
            className="auswertung-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Wertungseinstellungen"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auswertung-modal-head">
              <h2>Wertungseinstellungen</h2>
              <button
                type="button"
                className="auswertung-print-btn"
                onClick={() => setShowRatingDialog(false)}
              >
                Schließen
              </button>
            </div>
            <section className="auswertung-disc-section" aria-labelledby="ausw-rank-heading">
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
                                      v === "besterTeiler"
                                        ? "besterTeiler"
                                        : "total";
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
          </div>
        </div>
      )}

      {showPdfDialog && (
        <div
          className="auswertung-modal-backdrop no-print"
          onClick={closePdfDialog}
        >
          <div
            className="auswertung-modal auswertung-pdf-modal"
            role="dialog"
            aria-modal="true"
            aria-label="PDF Vorschau"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auswertung-modal-head">
              <h2>PDF Vorschau</h2>
              <div className="auswertung-pdf-actions">
                <button
                  type="button"
                  className="auswertung-refresh"
                  onClick={downloadPdf}
                  disabled={!pdfPreviewUrl}
                >
                  Herunterladen
                </button>
                <button
                  type="button"
                  className="auswertung-print-btn"
                  onClick={closePdfDialog}
                >
                  Schließen
                </button>
              </div>
            </div>
            <div className="auswertung-pdf-body">
              {pdfBusy && <p className="muted">PDF wird erstellt…</p>}
              {!pdfBusy && pdfError && <p className="error">{pdfError}</p>}
              {!pdfBusy && !pdfError && pdfPreviewUrl && (
                <iframe
                  title="PDF Vorschau"
                  src={pdfPreviewUrl}
                  className="auswertung-pdf-frame"
                />
              )}
            </div>
          </div>
        </div>
      )}

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
        {grouped.map(([wettkampf, classes]) => {
          return (
            <section key={wettkampf} className="auswertung-group">
              <h2 className="auswertung-group-title">{wettkampf}</h2>
              {classes.map(([key, list]) => {
                const [disc, klasse] = key.split("\u0000");
                return (
                  <div key={`${wettkampf}-${key}`} className="auswertung-subgroup">
                    <h3 className="auswertung-group-title">
                      <span className="auswertung-group-disc">{disc}</span>
                      <span className="auswertung-group-sep" aria-hidden>
                        ·
                      </span>
                      <span className="auswertung-group-klasse">{klasse}</span>
                      <span className="auswertung-group-count">
                        ({list.length} Starter)
                      </span>
                    </h3>
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
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
