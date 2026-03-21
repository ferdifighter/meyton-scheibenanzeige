import { IssfTargetFace } from "./IssfTargetFace";
import { disciplineStripBackground } from "../disciplineStrip";
import { ring01ToDisplay } from "../format";
import { seriesSlotsForCard } from "../seriesUtils";
import { getLastTreffer } from "../trefferUtils";
import type { ScheibeDetail } from "../types";

type Props = {
  detail: ScheibeDetail;
  onSelect?: () => void;
  selected?: boolean;
};

export function TargetCard({ detail, onSelect, selected }: Props) {
  const s = detail.scheibe;
  const nachname = String(s.Nachname).trim();
  const vorname = String(s.Vorname).trim();
  const stand = Number(s.StandNr);
  const total01 = Number(s.TotalRing01);
  const besterTeiler01 = Number(s.BesterTeiler01);
  const statusText = String(s.Status ?? "").trim();
  const stripBg = disciplineStripBackground(String(s.Disziplin));
  const slots = seriesSlotsForCard(detail.serien);
  const last = getLastTreffer(detail.treffer);

  const inner = (
    <>
      <div className="target-card-strip" style={{ background: stripBg }}>
        <span className="target-card-strip-inner">
          <span className="lane">{stand}</span>
          <span className="sep">|</span>
          <span className="strip-identity">
            <span className="shooter-name">
              {nachname}, {vorname}
            </span>
            <span className="disc-under">{String(s.Disziplin)}</span>
          </span>
        </span>
      </div>

      <div className="target-card-face">
        <IssfTargetFace
          treffer={detail.treffer}
          variant="card"
          discipline={String(s.Disziplin)}
        />
        <div
          className="target-card-last-treffer-num"
          title="Nummer des zuletzt gewerteten Schusses (Treffer)"
        >
          {last ? (
            <>
              Schuss: <span className="last-treffer-val">{last.Treffer}</span>
            </>
          ) : (
            <span className="last-treffer-empty">—</span>
          )}
        </div>
      </div>

      {statusText ? (
        <div className="target-card-status">{statusText}</div>
      ) : null}

      <div className="target-card-scores">
        <span className="sc-dec" title="Gesamt (Zehntel-Ringe)">
          {ring01ToDisplay(total01)}
        </span>
        <span
          className="sc-int"
          title={last ? "Letzter Treffer (Zehntel-Ringe)" : "Kein Treffer"}
        >
          {last ? ring01ToDisplay(last.Ring01) : "—"}
        </span>
        <span className="sc-last" title="Bester Teiler (Zehntel)">
          {ring01ToDisplay(besterTeiler01)}
        </span>
      </div>

      <div className="target-card-series">
        {slots.map((ring01, i) => (
          <div key={`h-${i}`} className="ser-slot">
            <span className="ser-label">S{i + 1}</span>
            <span className="ser-val">
              {ring01 == null ? "—" : ring01ToDisplay(ring01)}
            </span>
          </div>
        ))}
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className={`target-card ${selected ? "selected" : ""}`}
        onClick={onSelect}
      >
        {inner}
      </button>
    );
  }

  return <article className="target-card">{inner}</article>;
}
