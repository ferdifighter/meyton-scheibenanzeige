import { Suspense, lazy, useEffect, useId, useMemo, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import type { DocxEditorRef } from "@eigenpal/docx-js-editor";
import "@eigenpal/docx-js-editor/styles.css";
import {
  deleteUrkundenTemplate,
  downloadUrkundenPdf,
  fetchAuswertungProfile,
  fetchAuswertungProfiles,
  type AuswertungProfileSummary,
  fetchUrkundenCandidates,
  fetchUrkundenPreviewPdfWithProgress,
  fetchUrkundenPreviewDocxWithProgress,
  fetchUrkundenPreviewProgress,
  fetchUrkundenSettings,
  fetchUrkundenTemplateDocx,
  fetchUrkundenTemplates,
  saveUrkundenSettings,
  selectUrkundenTemplate,
  type UrkundenCandidate,
  type UrkundenPreviewProgress,
  type UrkundenSettings,
  uploadUrkundenTemplate,
} from "../api";
import { mountDocxEditorGerman } from "../i18n/docxEditorDe";

const DocxEditor = lazy(async () => {
  const mod = await import("@eigenpal/docx-js-editor");
  return { default: mod.DocxEditor };
});

const DEFAULT_SETTINGS: UrkundenSettings = {
  rankFrom: 1,
  rankTo: 3,
  rankByDefault: "total",
  rankByPerDisciplin: {},
  printerName: "",
  filters: {
    wettkampf: "",
    disziplin: "",
    stand: null,
    year: null,
    dateFrom: "",
    dateTo: "",
    allDates: false,
  },
};

const AVAILABLE_PLACEHOLDERS: Array<{ key: string; label: string }> = [
  { key: "appName", label: "Name der Webanwendung" },
  { key: "createdAt", label: "Erstellzeitpunkt (deutsches Format)" },
  { key: "wettkampf", label: "Wettkampfname" },
  { key: "disziplin", label: "Disziplinname" },
  { key: "klasse", label: "Klassenname" },
  { key: "wettkampftage", label: "Wettkampftage (eine oder mehrere Zeilen)" },
  { key: "platz", label: "Platzierung" },
  { key: "vorname", label: "Vorname" },
  { key: "nachname", label: "Nachname" },
  { key: "name", label: "Voller Name" },
  { key: "stand", label: "Standnummer" },
  { key: "gesamt", label: "Gesamtergebnis (Ringe)" },
  { key: "besterTeiler", label: "Bester Teiler" },
  { key: "schuesse", label: "Anzahl Schüsse" },
];

function DocxTemplateThumb({ name }: { name: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      setMsg("");
      try {
        const ab = await fetchUrkundenTemplateDocx(name);
        if (cancelled) return;
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = "";
        await renderAsync(ab, host, undefined, {
          inWrapper: true,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          useBase64URL: true,
        });
        if (cancelled) return;
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setMsg(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [name]);

  return (
    <div className="urkunden-template-thumb">
      <div ref={hostRef} className="urkunden-docx-thumb-canvas" />
      {status === "loading" && <div className="urkunden-thumb-overlay muted">Lade Vorschau…</div>}
      {status === "error" && (
        <div className="urkunden-thumb-overlay error">
          Vorschau fehlgeschlagen
          {msg ? `: ${msg}` : ""}
        </div>
      )}
    </div>
  );
}

export function UrkundenPage() {
  const templateInputId = useId();
  const [activeTab, setActiveTab] = useState<"vorlage" | "wertung" | "preview">(
    "vorlage"
  );
  const [settings, setSettings] = useState<UrkundenSettings>(DEFAULT_SETTINGS);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [uploadTemplateName, setUploadTemplateName] = useState("");
  const [availableTemplateNames, setAvailableTemplateNames] = useState<string[]>([]);
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [showPlaceholderDialog, setShowPlaceholderDialog] = useState(false);
  const [deleteTemplateName, setDeleteTemplateName] = useState<string | null>(null);
  const [editTemplateName, setEditTemplateName] = useState<string | null>(null);
  const [editorBuffer, setEditorBuffer] = useState<ArrayBuffer | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [profiles, setProfiles] = useState<AuswertungProfileSummary[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [candidates, setCandidates] = useState<UrkundenCandidate[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>([]);
  const [restrictToSelectedCandidates, setRestrictToSelectedCandidates] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesErr, setCandidatesErr] = useState<string | null>(null);
  const [outputMode, setOutputMode] = useState<"single" | "perCertificate">("single");
  const [fileNameSchema, setFileNameSchema] = useState<
    "standard" | "platz-name" | "name-platz"
  >("standard");
  const [sortMode, setSortMode] = useState<"wettkampf" | "platz-name" | "name-platz">(
    "wettkampf"
  );
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewDocxBlob, setPreviewDocxBlob] = useState<Blob | null>(null);
  const [previewTotalDocs, setPreviewTotalDocs] = useState<number>(0);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewProgress, setPreviewProgress] = useState<UrkundenPreviewProgress | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [templatesRevision, setTemplatesRevision] = useState(0);
  const previewDocxRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<DocxEditorRef | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const foundPlaceholders = new Set(placeholders);
  const orderedTemplates = useMemo(
    () => [...availableTemplateNames].sort((a, b) => a.localeCompare(b, "de")),
    [availableTemplateNames]
  );
  const visibleCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLocaleLowerCase("de-DE");
    if (!q) return candidates;
    return candidates.filter((c) => {
      const text =
        `${c.nachname} ${c.vorname} ${c.disziplin} ${c.klasse} ${c.wettkampf} ${c.platz} ${c.stand}`.toLocaleLowerCase(
          "de-DE"
        );
      return text.includes(q);
    });
  }, [candidateSearch, candidates]);
  const visibleCandidateIds = useMemo(
    () => visibleCandidates.map((c) => c.scheibenId),
    [visibleCandidates]
  );
  const effectiveSelectedIds = useMemo(
    () => (restrictToSelectedCandidates ? selectedCandidateIds : []),
    [restrictToSelectedCandidates, selectedCandidateIds]
  );
  const hasGeneratedPreview = useMemo(
    () => Boolean(previewPdfUrl || previewDocxBlob),
    [previewPdfUrl, previewDocxBlob]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, ps] = await Promise.all([
          fetchUrkundenSettings(),
          fetchAuswertungProfiles(),
        ]);
        if (cancelled) return;
        setSettings(r.settings);
        setTemplateName(r.template.name);
        setAvailableTemplateNames(r.template.availableNames ?? []);
        setPlaceholders(r.template.placeholders ?? []);
        setProfiles(ps);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const host = previewDocxRef.current;
      if (!host) return;
      host.innerHTML = "";
      if (!previewDocxBlob) return;
      try {
        const ab = await previewDocxBlob.arrayBuffer();
        if (cancelled) return;
        await renderAsync(ab, host, undefined, {
          inWrapper: true,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          useBase64URL: true,
        });
      } catch (e) {
        if (!cancelled) {
          setPreviewErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (previewDocxRef.current) previewDocxRef.current.innerHTML = "";
    };
  }, [previewDocxBlob]);

  useEffect(
    () => () => {
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    },
    [previewPdfUrl]
  );

  useEffect(() => {
    if (!editTemplateName || !editorHostRef.current) return;
    return mountDocxEditorGerman(editorHostRef.current);
  }, [editTemplateName, editorBuffer]);

  async function loadCandidatesForSelection() {
    setCandidatesLoading(true);
    setCandidatesErr(null);
    try {
      const list = await fetchUrkundenCandidates(settings);
      setCandidates(list);
      setSelectedCandidateIds((prev) => {
        const existing = new Set(list.map((c) => c.scheibenId));
        const kept = prev.filter((id) => existing.has(id));
        if (kept.length > 0) return kept;
        return list.map((c) => c.scheibenId);
      });
    } catch (e) {
      setCandidatesErr(e instanceof Error ? e.message : String(e));
      setCandidates([]);
      setSelectedCandidateIds([]);
    } finally {
      setCandidatesLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "preview" || !restrictToSelectedCandidates) return;
    void loadCandidatesForSelection();
  }, [
    activeTab,
    restrictToSelectedCandidates,
    settings.filters.wettkampf,
    settings.filters.disziplin,
    settings.filters.stand,
    settings.filters.year,
    settings.filters.dateFrom,
    settings.filters.dateTo,
    settings.filters.allDates,
    settings.rankFrom,
    settings.rankTo,
    settings.rankByDefault,
    settings.rankByPerDisciplin,
  ]);

  useEffect(() => {
    setPreviewDocxBlob(null);
    setPreviewTotalDocs(0);
    setPreviewProgress(null);
    setPreviewErr(null);
    setPreviewPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [
    settings.rankFrom,
    settings.rankTo,
    settings.rankByDefault,
    settings.rankByPerDisciplin,
    settings.filters.wettkampf,
    settings.filters.disziplin,
    settings.filters.stand,
    settings.filters.year,
    settings.filters.dateFrom,
    settings.filters.dateTo,
    settings.filters.allDates,
    restrictToSelectedCandidates,
    selectedCandidateIds,
    outputMode,
    fileNameSchema,
    sortMode,
  ]);

  useEffect(() => {
    const cls = "docx-editor-open";
    if (editTemplateName) document.body.classList.add(cls);
    else document.body.classList.remove(cls);
    return () => {
      document.body.classList.remove(cls);
    };
  }, [editTemplateName]);

  async function onTemplateUpload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const r = await uploadUrkundenTemplate(file, uploadTemplateName || file.name);
      setTemplateName(r.template.name);
      setAvailableTemplateNames(r.template.availableNames ?? []);
      setPlaceholders(r.template.placeholders ?? []);
      setTemplatesRevision((v) => v + 1);
      setUploadTemplateName("");
      setInfo("Vorlage erfolgreich hochgeladen.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSelectTemplate(name: string) {
    if (!name) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const r = await selectUrkundenTemplate(name);
      setTemplateName(r.template.name);
      setAvailableTemplateNames(r.template.availableNames ?? []);
      setPlaceholders(r.template.placeholders ?? []);
      setTemplatesRevision((v) => v + 1);
      setInfo(`Vorlage aktiv: ${r.template.name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onReloadTemplates() {
    setBusy(true);
    setErr(null);
    try {
      const out = await fetchUrkundenTemplates();
      setAvailableTemplateNames(out.names ?? []);
      setTemplatesRevision((v) => v + 1);
      if (out.selectedName) await onSelectTemplate(out.selectedName);
      else {
        setTemplateName(null);
        setPlaceholders([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteTemplate(name: string) {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const out = await deleteUrkundenTemplate(name);
      setAvailableTemplateNames(out.templates?.names ?? []);
      setTemplatesRevision((v) => v + 1);
      const nextSelected = out.templates?.selectedName ?? null;
      setTemplateName(nextSelected);
      if (nextSelected) {
        await onSelectTemplate(nextSelected);
      } else {
        setPlaceholders([]);
      }
      setInfo(`Vorlage gelöscht: ${name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onOpenTemplateEditor(name: string) {
    setEditorLoading(true);
    setEditorBuffer(null);
    setEditTemplateName(name);
    setErr(null);
    try {
      const ab = await fetchUrkundenTemplateDocx(name);
      setEditorBuffer(ab);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setEditTemplateName(null);
    } finally {
      setEditorLoading(false);
    }
  }

  function onCloseTemplateEditor() {
    if (editorBusy) return;
    setEditTemplateName(null);
    setEditorBuffer(null);
  }

  async function onSaveTemplateEditor() {
    const name = String(editTemplateName ?? "").trim();
    if (!name) return;
    setEditorBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const out = await editorRef.current?.save();
      if (!out) throw new Error("Dokument konnte nicht gespeichert werden.");
      const file = new File([out], name, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const r = await uploadUrkundenTemplate(file, name);
      setTemplateName(r.template.name);
      setAvailableTemplateNames(r.template.availableNames ?? []);
      setPlaceholders(r.template.placeholders ?? []);
      setTemplatesRevision((v) => v + 1);
      setInfo(`Vorlage gespeichert: ${name}`);
      setEditTemplateName(null);
      setEditorBuffer(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setEditorBusy(false);
    }
  }

  async function onApplyAuswertungProfile(profileId?: string) {
    const id = String(profileId ?? selectedProfileId ?? "").trim();
    if (!id) {
      setErr("Bitte zuerst eine gespeicherte Auswertung auswählen.");
      return;
    }
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const profile = await fetchAuswertungProfile(Number(id));
      const src = profile.settings;
      setSettings((prev) => ({
        ...prev,
        rankByDefault: src.rankByDefault,
        rankByPerDisciplin: src.rankByPerDisciplin ?? {},
        filters: {
          ...prev.filters,
          wettkampf: src.filters?.wettkampf ?? "",
          disziplin: src.filters?.disziplin ?? "",
          stand: src.filters?.stand ?? null,
          year: src.filters?.year ?? null,
          dateFrom: src.filters?.dateFrom ?? "",
          dateTo: src.filters?.dateTo ?? "",
          allDates: Boolean(src.filters?.allDates),
        },
      }));
      setInfo(`Auswertung geladen: ${profile.name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onContinueToPreview() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      await saveUrkundenSettings(settings);
      setInfo("Einstellungen gespeichert.");
      setActiveTab("preview");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onBuildPreview() {
    if (restrictToSelectedCandidates && selectedCandidateIds.length === 0) {
      setPreviewErr("Bitte mindestens einen Schützen auswählen.");
      return;
    }
    const progressId = `urkunden-preview-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    let stopPolling = false;
    let pollInFlight = false;
    let pollTimer: number | null = null;
    const pollProgress = async (force = false) => {
      if ((!force && stopPolling) || pollInFlight) return;
      pollInFlight = true;
      try {
        const p = await fetchUrkundenPreviewProgress(progressId);
        if (!stopPolling || force) setPreviewProgress(p);
      } catch {
        // During startup/cleanup the progress endpoint may briefly return 404.
      } finally {
        pollInFlight = false;
      }
    };

    setPreviewBusy(true);
    setPreviewErr(null);
    setErr(null);
    setInfo(null);
    setPreviewDocxBlob(null);
    setPreviewTotalDocs(0);
    setPreviewProgress({
      id: progressId,
      phase: "prepare",
      message: "Daten werden geladen…",
      current: 0,
      total: 0,
      percent: 0,
      done: false,
      error: "",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }
    try {
      await pollProgress();
      pollTimer = window.setInterval(() => {
        void pollProgress();
      }, 300);
      try {
        const pdf = await fetchUrkundenPreviewPdfWithProgress(settings, progressId, {
          selectedScheibenIds: effectiveSelectedIds,
          fileNameSchema,
          sortMode,
        });
        setPreviewPdfUrl(URL.createObjectURL(pdf));
        setActiveTab("preview");
        setInfo("Die Vorschau ist fertig. Du kannst sie jetzt prüfen, herunterladen oder direkt drucken.");
      } catch {
        const out = await fetchUrkundenPreviewDocxWithProgress(settings, progressId, {
          selectedScheibenIds: effectiveSelectedIds,
          fileNameSchema,
          sortMode,
        });
        setPreviewDocxBlob(out.blob);
        setPreviewTotalDocs(out.total);
        setActiveTab("preview");
        setInfo(
          `Vorschau erstellt (${out.total} Urkunde${out.total === 1 ? "" : "n"} insgesamt). ` +
            "Hinweis: Exakte Schriftarten sind nur in der PDF-Vorschau garantiert."
        );
      }
    } catch (e) {
      setPreviewErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (pollTimer != null) window.clearInterval(pollTimer);
      await pollProgress(true);
      stopPolling = true;
      setPreviewBusy(false);
    }
  }

  async function onDownloadPdfOutput() {
    if (restrictToSelectedCandidates && selectedCandidateIds.length === 0) {
      setErr("Bitte mindestens einen Schützen auswählen.");
      return;
    }
    if (!hasGeneratedPreview) {
      setErr("Bitte zuerst eine Vorschau erstellen.");
      return;
    }
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const blob = await downloadUrkundenPdf(settings, outputMode, {
        selectedScheibenIds: effectiveSelectedIds,
        fileNameSchema,
        sortMode,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      const wk = (settings.filters.wettkampf || "wettkampf")
        .replace(/\s+/g, "-")
        .toLowerCase();
      a.href = url;
      a.download =
        outputMode === "single"
          ? `urkunden-${wk}-${stamp}.pdf`
          : `urkunden-${wk}-${stamp}-pdf.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setInfo("PDF-Ausgabe erzeugt.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onPrintPdfOutput() {
    if (restrictToSelectedCandidates && selectedCandidateIds.length === 0) {
      setErr("Bitte mindestens einen Schützen auswählen.");
      return;
    }
    if (!previewPdfUrl) {
      setErr("Bitte zuerst eine PDF-Vorschau erstellen.");
      return;
    }
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      // Für den Web-Workflow den Browser-Printdialog nutzen (Druckerwahl etc.).
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = previewPdfUrl;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        }, 180);
      };
      window.setTimeout(() => {
        iframe.remove();
      }, 45_000);

      setInfo("Druckdialog geöffnet.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="protokoll-page">
      <header className="protokoll-page-header">
        <h1>Urkunden</h1>
        <p className="protokoll-page-lead">
          Vorlage auswählen, Platzierungen festlegen und Urkunden als PDF vorschauen,
          herunterladen oder drucken.
        </p>
      </header>

      <div className="urkunden-tabs">
        <button
          type="button"
          className={`urkunden-tab-btn ${activeTab === "vorlage" ? "active" : ""}`}
          onClick={() => setActiveTab("vorlage")}
        >
          1. Vorlage
        </button>
        <button
          type="button"
          className={`urkunden-tab-btn ${activeTab === "wertung" ? "active" : ""}`}
          onClick={() => setActiveTab("wertung")}
        >
          2. Platzierung
        </button>
        <button
          type="button"
          className={`urkunden-tab-btn ${activeTab === "preview" ? "active" : ""}`}
          onClick={() => setActiveTab("preview")}
        >
          3. Vorschau & Drucken
        </button>
      </div>
      {(activeTab === "vorlage" || activeTab === "wertung") && (
        <div className="auswertung-compact-actions urkunden-flow-actions">
          {activeTab === "vorlage" && (
            <button
              type="button"
              className="auswertung-refresh"
              onClick={() => setActiveTab("wertung")}
              disabled={busy}
            >
              Weiter zu Platzierung
            </button>
          )}
          {activeTab === "wertung" && (
            <button
              type="button"
              className="auswertung-refresh"
              onClick={() => void onContinueToPreview()}
              disabled={busy}
            >
              Weiter zu Vorschau & Drucken
            </button>
          )}
        </div>
      )}

      {activeTab === "vorlage" && (
        <section className="auswertung-disc-section">
          <h2 className="auswertung-disc-section-title">Vorlagen</h2>
          <p className="muted">
            Wähle unten eine Vorlage aus oder lade eine neue Vorlage hoch.
          </p>
          <div className="auswertung-default-row">
            <input
              type="text"
              className="protokoll-filter-select"
              value={uploadTemplateName}
              onChange={(e) => setUploadTemplateName(e.target.value)}
              placeholder="Name für neue Vorlage (z. B. Urkunde KM 2026)"
            />
            <input
              id={templateInputId}
              type="file"
              className="urkunden-file-input"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => void onTemplateUpload(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
            <label
              className="auswertung-refresh urkunden-file-button"
              htmlFor={templateInputId}
            >
              Neue Vorlage hochladen
            </label>
            <button
              type="button"
              className="auswertung-refresh"
              onClick={() => void onReloadTemplates()}
              disabled={busy}
            >
              Neu laden
            </button>
            <button
              type="button"
              className="auswertung-refresh"
              onClick={() => setShowPlaceholderDialog(true)}
            >
              Platzhalter anzeigen
            </button>
          </div>
          {info && <p className="muted">{info}</p>}
          <div className="urkunden-template-grid">
            {orderedTemplates.map((name) => (
              <article
                key={`${name}-${templatesRevision}`}
                className={`urkunden-template-card ${templateName === name ? "active" : ""}`}
                onClick={() => void onSelectTemplate(name)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void onSelectTemplate(name);
                  }
                }}
              >
                <div className="urkunden-template-card-head">
                  <strong>{name}</strong>
                </div>
                <DocxTemplateThumb name={name} />
                <button
                  type="button"
                  className="urkunden-template-edit"
                  title={`Vorlage ${name} bearbeiten`}
                  aria-label={`Vorlage ${name} bearbeiten`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onOpenTemplateEditor(name);
                  }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="urkunden-template-delete"
                  title={`Vorlage ${name} löschen`}
                  aria-label={`Vorlage ${name} löschen`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTemplateName(name);
                  }}
                >
                  🗑
                </button>
                {templateName === name && (
                  <span className="urkunden-template-selected-corner" aria-hidden="true">
                    ✓
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {deleteTemplateName && (
        <div
          className="auswertung-modal-backdrop"
          onClick={() => setDeleteTemplateName(null)}
        >
          <div
            className="auswertung-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Vorlage löschen bestätigen"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auswertung-modal-head">
              <h2>Vorlage löschen</h2>
              <button
                type="button"
                className="auswertung-print-btn auswertung-close-icon"
                onClick={() => setDeleteTemplateName(null)}
                aria-label="Dialog schließen"
              >
                ✕
              </button>
            </div>
            <div className="auswertung-filter-form">
              <p>
                Möchtest du die Vorlage <strong>{deleteTemplateName}</strong> wirklich löschen?
              </p>
              <div className="auswertung-modal-actions">
                <button
                  type="button"
                  className="auswertung-refresh"
                  onClick={() => setDeleteTemplateName(null)}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="auswertung-print-btn"
                  onClick={async () => {
                    const name = deleteTemplateName;
                    setDeleteTemplateName(null);
                    if (name) await onDeleteTemplate(name);
                  }}
                >
                  Löschen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPlaceholderDialog && (
        <div
          className="auswertung-modal-backdrop"
          onClick={() => setShowPlaceholderDialog(false)}
        >
          <div
            className="auswertung-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Verfügbare Platzhalter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auswertung-modal-head">
              <h2>Verfügbare Platzhalter</h2>
              <button
                type="button"
                className="auswertung-print-btn auswertung-close-icon"
                onClick={() => setShowPlaceholderDialog(false)}
                aria-label="Dialog schließen"
              >
                ✕
              </button>
            </div>
            <div className="auswertung-filter-form">
              <p className="muted">
                Verwendbar in der Vorlage im Format <code>{"{platzhalter}"}</code>.
              </p>
              <div className="urkunden-placeholder-list">
                {AVAILABLE_PLACEHOLDERS.map((p) => (
                  <div key={p.key} className="urkunden-placeholder-row">
                    <code className="urkunden-placeholder-item">{`{${p.key}}`}</code>
                    <span className="muted urkunden-placeholder-label">{p.label}</span>
                    <span className="urkunden-placeholder-state">
                      {foundPlaceholders.has(p.key) ? "in Vorlage gefunden" : ""}
                    </span>
                  </div>
                ))}
              </div>
              <div className="auswertung-modal-actions">
                <button
                  type="button"
                  className="auswertung-refresh"
                  onClick={() => setShowPlaceholderDialog(false)}
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editTemplateName && (
        <div className="auswertung-modal-backdrop" onClick={onCloseTemplateEditor}>
          <div
            className="auswertung-modal urkunden-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Vorlage ${editTemplateName} bearbeiten`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auswertung-modal-head">
              <h2>Vorlage bearbeiten: {editTemplateName}</h2>
              <button
                type="button"
                className="auswertung-print-btn auswertung-close-icon"
                onClick={onCloseTemplateEditor}
                aria-label="Dialog schließen"
                disabled={editorBusy}
              >
                ✕
              </button>
            </div>
            <div className="urkunden-editor-body">
              {editorLoading && <p className="muted">Vorlage wird geladen…</p>}
              {!editorLoading && editorBuffer && (
                <div className="urkunden-editor-host" ref={editorHostRef}>
                  <Suspense fallback={<p className="muted">Editor wird geladen…</p>}>
                    <DocxEditor
                      ref={editorRef}
                      documentBuffer={editorBuffer}
                      mode="editing"
                      author="Meyton Wettkampfzentrale"
                      showToolbar
                      showRuler={false}
                      showPrintButton={false}
                      showOutline
                      onError={(e) => setErr(e instanceof Error ? e.message : String(e))}
                      onChange={() => undefined}
                    />
                  </Suspense>
                </div>
              )}
            </div>
            <div className="auswertung-modal-actions urkunden-editor-actions">
              <button
                type="button"
                className="auswertung-refresh"
                onClick={onCloseTemplateEditor}
                disabled={editorBusy}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="auswertung-print-btn"
                onClick={() => void onSaveTemplateEditor()}
                disabled={editorBusy || editorLoading || !editorBuffer}
              >
                {editorBusy ? "Speichern…" : "Vorlage speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "wertung" && (
        <section className="auswertung-disc-section">
          <h2 className="auswertung-disc-section-title">Platzierung</h2>
          <div className="urkunden-form-grid">
            <label className="urkunden-form-row">
              <span className="protokoll-filter-label">Gespeicherte Auswertung</span>
              <div className="urkunden-load-row">
                <select
                  className="protokoll-filter-select"
                  value={selectedProfileId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedProfileId(v);
                    if (v) void onApplyAuswertungProfile(v);
                  }}
                >
                  <option value="">Auswertung wählen…</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="urkunden-form-row">
              <span className="protokoll-filter-label">Platz von</span>
              <input
                type="number"
                min={1}
                className="protokoll-filter-select protokoll-filter-select-narrow"
                value={settings.rankFrom}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    rankFrom: Number(e.target.value) || 1,
                  }))
                }
              />
            </label>
            <label className="urkunden-form-row">
              <span className="protokoll-filter-label">Platz bis</span>
              <input
                type="number"
                min={1}
                className="protokoll-filter-select protokoll-filter-select-narrow"
                value={settings.rankTo}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    rankTo: Number(e.target.value) || 1,
                  }))
                }
              />
            </label>
          </div>
          {info && <p className="muted">{info}</p>}
        </section>
      )}

      {activeTab === "preview" && (
        <section className="auswertung-disc-section">
          <h2 className="auswertung-disc-section-title">Vorschau & Drucken</h2>
          {info && <p className="muted">{info}</p>}
          <div className="urkunden-preview-layout">
            <div className="urkunden-preview-left">
              <div className="urkunden-form-grid">
                <label className="urkunden-form-row">
                  <span className="protokoll-filter-label">Schützenauswahl</span>
                  <div className="urkunden-load-row">
                    <label className="auswertung-check">
                      <input
                        type="checkbox"
                        checked={restrictToSelectedCandidates}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setRestrictToSelectedCandidates(checked);
                          setCandidateSearch("");
                          if (checked) void loadCandidatesForSelection();
                        }}
                      />
                      Nur ausgewählte Schützen verwenden
                    </label>
                    {restrictToSelectedCandidates && (
                      <span className="muted">
                        {selectedCandidateIds.length} von {candidates.length} ausgewählt
                      </span>
                    )}
                  </div>
                </label>

                <label className="urkunden-form-row">
                  <span className="protokoll-filter-label">PDF-Ausgabe</span>
                  <select
                    className="protokoll-filter-select"
                    value={outputMode}
                    onChange={(e) =>
                      setOutputMode(
                        e.target.value === "perCertificate"
                          ? "perCertificate"
                          : "single"
                      )
                    }
                  >
                    <option value="single">Alle Urkunden in einem PDF</option>
                    <option value="perCertificate">
                      Jede Urkunde als eigene PDF
                    </option>
                  </select>
                </label>

                {outputMode === "perCertificate" && (
                  <label className="urkunden-form-row">
                    <span className="protokoll-filter-label">Dateinamen-Schema</span>
                    <select
                      className="protokoll-filter-select"
                      value={fileNameSchema}
                      onChange={(e) =>
                        setFileNameSchema(
                          e.target.value === "platz-name"
                            ? "platz-name"
                            : e.target.value === "name-platz"
                              ? "name-platz"
                              : "standard"
                        )
                      }
                    >
                      <option value="standard">
                        Standard (Wettkampf-Disziplin-Klasse-Platz-Name)
                      </option>
                      <option value="platz-name">Platz-Name-Wettkampf-Disziplin-Klasse</option>
                      <option value="name-platz">Name-Platz-Wettkampf-Disziplin-Klasse</option>
                    </select>
                  </label>
                )}

                <label className="urkunden-form-row">
                  <span className="protokoll-filter-label">Sortierung</span>
                  <select
                    className="protokoll-filter-select"
                    value={sortMode}
                    onChange={(e) =>
                      setSortMode(
                        e.target.value === "platz-name"
                          ? "platz-name"
                          : e.target.value === "name-platz"
                            ? "name-platz"
                            : "wettkampf"
                      )
                    }
                  >
                    <option value="wettkampf">Wettkampf → Disziplin → Klasse → Platz</option>
                    <option value="platz-name">Platz → Name</option>
                    <option value="name-platz">Name → Platz</option>
                  </select>
                </label>
              </div>
            </div>

            {restrictToSelectedCandidates && (
              <div className="urkunden-preview-right">
                <div className="urkunden-candidate-box">
                  <label className="protokoll-filter-label" htmlFor="urkunden-candidate-search">
                    Suche
                  </label>
                  <input
                    id="urkunden-candidate-search"
                    type="search"
                    className="protokoll-filter-select"
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    placeholder="Name, Disziplin, Klasse, Wettkampf…"
                  />
                  <div className="urkunden-candidate-actions">
                    <button
                      type="button"
                      className="auswertung-refresh"
                      onClick={() => void loadCandidatesForSelection()}
                      disabled={candidatesLoading}
                    >
                      Neu laden
                    </button>
                    <button
                      type="button"
                      className="auswertung-refresh"
                      onClick={() =>
                        setSelectedCandidateIds((prev) => {
                          const set = new Set(prev);
                          for (const id of visibleCandidateIds) set.add(id);
                          return [...set];
                        })
                      }
                      disabled={visibleCandidateIds.length === 0 || candidatesLoading}
                    >
                      Sichtbare auswählen
                    </button>
                    <button
                      type="button"
                      className="auswertung-refresh"
                      onClick={() =>
                        setSelectedCandidateIds((prev) =>
                          prev.filter((id) => !visibleCandidateIds.includes(id))
                        )
                      }
                      disabled={visibleCandidateIds.length === 0 || candidatesLoading}
                    >
                      Sichtbare abwählen
                    </button>
                  </div>
                  <div className="urkunden-candidate-list" role="listbox" aria-multiselectable>
                    {candidatesLoading && <p className="muted">Schützen werden geladen…</p>}
                    {!candidatesLoading && candidatesErr && <p className="error">{candidatesErr}</p>}
                    {!candidatesLoading && !candidatesErr && visibleCandidates.length === 0 && (
                      <p className="muted">
                        Keine passenden Schützen gefunden (ggf. Filter/Platzierung prüfen).
                      </p>
                    )}
                    {!candidatesLoading &&
                      !candidatesErr &&
                      visibleCandidates.map((c) => {
                        const checked = selectedCandidateIds.includes(c.scheibenId);
                        const name = `${c.nachname}, ${c.vorname}`;
                        return (
                          <label key={c.scheibenId} className="urkunden-candidate-item">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setSelectedCandidateIds((prev) =>
                                  e.target.checked
                                    ? [...new Set([...prev, c.scheibenId])]
                                    : prev.filter((id) => id !== c.scheibenId)
                                )
                              }
                            />
                            <span>
                              #{c.platz} · {name} · {c.disziplin} · {c.klasse} · Stand {c.stand}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="auswertung-compact-actions urkunden-preview-actions">
            <button
              type="button"
              className="auswertung-refresh"
              onClick={() => void onBuildPreview()}
              disabled={previewBusy || busy}
            >
              Vorschau erstellen
            </button>
            <button
              type="button"
              className="auswertung-print-btn"
              onClick={() => void onDownloadPdfOutput()}
              disabled={busy || previewBusy || !hasGeneratedPreview}
            >
              PDF herunterladen
            </button>
            <button
              type="button"
              className="auswertung-print-btn"
              onClick={() => void onPrintPdfOutput()}
              disabled={busy || previewBusy || !previewPdfUrl}
            >
              Drucken
            </button>
          </div>
          {!previewBusy && !hasGeneratedPreview && (
            <p className="muted">Bitte zuerst „Vorschau erstellen“ ausführen.</p>
          )}

          {previewBusy && (
            <div className="urkunden-progress-wrap" role="status" aria-live="polite">
              <p className="muted">
                {previewProgress?.message || "Vorschau wird erstellt…"}
                {previewProgress?.total
                  ? ` (${Math.min(previewProgress.current, previewProgress.total)} von ${
                      previewProgress.total
                    })`
                  : ""}
              </p>
              <div
                className="urkunden-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.max(0, Math.min(100, Number(previewProgress?.percent ?? 0)))}
                aria-valuetext={`Fortschritt ${Math.max(
                  0,
                  Math.min(100, Number(previewProgress?.percent ?? 0))
                )} Prozent`}
              >
                <div
                  className="urkunden-progress-bar"
                  style={{
                    width: `${Math.max(0, Math.min(100, Number(previewProgress?.percent ?? 0)))}%`,
                  }}
                />
              </div>
              <p className="muted">{Math.max(0, Math.min(100, Number(previewProgress?.percent ?? 0)))}%</p>
            </div>
          )}
          {previewErr && <p className="error">{previewErr}</p>}
          {!previewBusy && !previewErr && previewPdfUrl && (
            <iframe
              title="Urkunden PDF Vorschau"
              src={previewPdfUrl}
              className="auswertung-pdf-frame"
            />
          )}
          {!previewBusy && !previewErr && !previewPdfUrl && previewDocxBlob && (
            <>
              <p className="muted">
                Vorschau zeigt die erste Urkunde (gesamt: {previewTotalDocs}).
              </p>
              <div className="urkunden-preview-docx" ref={previewDocxRef} />
            </>
          )}
        </section>
      )}

      {err && <p className="error">{err}</p>}
    </div>
  );
}

