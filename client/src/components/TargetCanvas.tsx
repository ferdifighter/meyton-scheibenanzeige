import type { TrefferRow } from "../types";
import { ring01ToDisplay } from "../format";

type Props = {
  treffer: TrefferRow[];
};

/** Farbe nach Ringwert (Zehntel-Ringe, z. B. 97 = 9,7) */
function shotColor(ring01: number): string {
  const rings = ring01 / 10;
  if (rings >= 10) return "#0d9488";
  if (rings >= 9) return "#16a34a";
  if (rings >= 8) return "#65a30d";
  if (rings >= 7) return "#ca8a04";
  if (rings >= 6) return "#ea580c";
  return "#dc2626";
}

export function TargetCanvas({ treffer }: Props) {
  if (treffer.length === 0) {
    return (
      <div className="target-empty">
        Keine Einzeltreffer (Koordinaten) für diese Scheibe vorhanden.
      </div>
    );
  }

  let maxR = 0;
  for (const t of treffer) {
    const d = Math.hypot(t.x, t.y);
    if (d > maxR) maxR = d;
  }
  const pad = maxR * 0.12 + 500;
  const extent = maxR + pad;
  const vb = `${-extent} ${-extent} ${2 * extent} ${2 * extent}`;

  const rings = 10;
  const circles = [];
  for (let i = 1; i <= rings; i++) {
    const rad = (maxR * i) / rings;
    circles.push(
      <circle
        key={i}
        cx={0}
        cy={0}
        r={rad}
        fill="none"
        stroke="var(--ring-line)"
        strokeWidth={extent * 0.0015}
        opacity={0.35 + i * 0.04}
      />
    );
  }

  return (
    <div className="target-wrap">
      <svg className="target-svg" viewBox={vb} aria-label="Trefferlage">
        <rect
          x={-extent}
          y={-extent}
          width={2 * extent}
          height={2 * extent}
          fill="var(--target-bg)"
        />
        {circles}
        <line
          x1={-extent}
          y1={0}
          x2={extent}
          y2={0}
          stroke="var(--ring-line)"
          strokeWidth={extent * 0.001}
          opacity={0.25}
        />
        <line
          x1={0}
          y1={-extent}
          x2={0}
          y2={extent}
          stroke="var(--ring-line)"
          strokeWidth={extent * 0.001}
          opacity={0.25}
        />
        {treffer.map((t) => (
          <g key={`${t.Stellung}-${t.Treffer}`}>
            <title>
              {`Schuss ${t.Treffer}: ${ring01ToDisplay(t.Ring01)} Ringe (${t.x}, ${t.y})`}
            </title>
            <circle
              cx={t.x}
              cy={-t.y}
              r={extent * 0.012}
              fill={shotColor(t.Ring01)}
              stroke="#fff"
              strokeWidth={extent * 0.0018}
            />
            <text
              x={t.x + extent * 0.02}
              y={-t.y - extent * 0.01}
              fill="var(--text-muted)"
              fontSize={extent * 0.04}
              style={{ pointerEvents: "none" }}
            >
              {t.Treffer}
            </text>
          </g>
        ))}
      </svg>
      <p className="target-hint">
        Ansicht: Trefferpositionen in 1/100 mm vom Scheibenzentrum (y nach oben). Die
        Kreise sind nur Hilfslinien, keine offiziellen Ringgrenzen.
      </p>
    </div>
  );
}
