import type { ReactNode } from "react";
import type { TrefferRow } from "../types";
import { ring01ToDisplay } from "../format";
import {
  ISSF_10M_OUTER_RADIUS_MM,
  ISSF_RING10_OUTER_RADIUS_MM,
  ringOuterRadiiMm,
  toMm,
} from "../issfTarget";
import { getLastTreffer } from "../trefferUtils";

type Props = {
  treffer: TrefferRow[];
  variant?: "card" | "large";
  className?: string;
};

const PAD_MM = 4;

/** Außenring 1–3 weiß, 4–9 schwarz (Spiegel), Innenzehner weiß (Ø 0,5 mm) */
const FILL_WHITE = "#f8f8f6";
const FILL_BLACK = "#141414";
const STROKE_ON_WHITE = "#1a1a1a";
const STROKE_ON_BLACK = "rgba(255,255,255,0.88)";

function shotFill(ring01: number, alpha = 0.55): string {
  const r = ring01 / 10;
  let rgb = "220, 60, 40";
  if (r >= 10) rgb = "13, 148, 136";
  else if (r >= 9) rgb = "22, 163, 74";
  else if (r >= 8) rgb = "101, 163, 13";
  else if (r >= 7) rgb = "202, 138, 4";
  else if (r >= 6) rgb = "234, 88, 12";
  return `rgba(${rgb}, ${alpha})`;
}

/** Label-Farbe: Ring 1–3 auf Weiß, 4–9 auf Schwarz */
function labelFill(ringNum: number): string {
  return ringNum <= 3 ? "#1a1a1a" : "#f5f5f5";
}

export function IssfTargetFace({
  treffer,
  variant = "card",
  className = "",
}: Props) {
  const radii = ringOuterRadiiMm();
  const outer = ISSF_10M_OUTER_RADIUS_MM + PAD_MM;
  const vb = `${-outer} ${-outer} ${2 * outer} ${2 * outer}`;

  const strokeW = variant === "card" ? 0.1 : 0.08;
  const labelSize = variant === "card" ? 0.95 : 1.05;
  const shotR = variant === "card" ? 1.05 : 0.9;
  /** Schussnummer (Treffer) im Kreis, mm-SVG */
  const shotNumBase = variant === "card" ? 0.92 : 0.82;

  const lastTreffer = getLastTreffer(treffer);
  const isLastShot = (t: TrefferRow) =>
    lastTreffer != null &&
    t.Stellung === lastTreffer.Stellung &&
    t.Treffer === lastTreffer.Treffer;

  /** Letzter Schuss zuletzt zeichnen (liegt oben), Rest Reihenfolge beibehalten */
  const trefferDrawOrder = [...treffer].sort((a, b) => {
    const aL = isLastShot(a);
    const bL = isLastShot(b);
    if (aL && !bL) return 1;
    if (!aL && bL) return -1;
    return 0;
  });

  if (treffer.length === 0) {
    return (
      <div className={`issf-empty ${className}`}>
        Keine Trefferkoordinaten
      </div>
    );
  }

  /** Scheibenfläche von außen nach innen übereinanderlegen */
  const fillCircles: ReactNode[] = [];
  fillCircles.push(
    <circle key="w0" cx={0} cy={0} r={radii[0]} fill={FILL_WHITE} />
  );
  for (let i = 1; i <= 2; i++) {
    fillCircles.push(
      <circle key={`w${i}`} cx={0} cy={0} r={radii[i]} fill={FILL_WHITE} />
    );
  }
  for (let i = 3; i <= 8; i++) {
    fillCircles.push(
      <circle key={`b${i}`} cx={0} cy={0} r={radii[i]} fill={FILL_BLACK} />
    );
  }
  fillCircles.push(
    <circle
      key="inner10"
      cx={0}
      cy={0}
      r={ISSF_RING10_OUTER_RADIUS_MM}
      fill="#ffffff"
      stroke="none"
    />
  );

  /** Ringgrenzen: innen auf Schwarz helle Linien, außen dunkel */
  const ringStrokes: ReactNode[] = [];
  for (let i = 0; i <= 8; i++) {
    const onBlack = i >= 3;
    ringStrokes.push(
      <circle
        key={`st-${i}`}
        cx={0}
        cy={0}
        r={radii[i]}
        fill="none"
        stroke={onBlack ? STROKE_ON_BLACK : STROKE_ON_WHITE}
        strokeWidth={strokeW}
      />
    );
  }

  /** Ringnummern 1–8 an vier Achsen (DSB/ISSF-Layout) */
  const labelAngles = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
  const ringLabels: ReactNode[] = [];
  for (let num = 1; num <= 8; num++) {
    const rMid = (radii[num - 1] + radii[num]) / 2;
    for (let li = 0; li < 4; li++) {
      const a = labelAngles[li];
      const lx = rMid * Math.cos(a);
      const ly = -rMid * Math.sin(a);
      ringLabels.push(
        <text
          key={`lbl-${num}-${li}`}
          x={lx}
          y={ly}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={labelFill(num)}
          fontSize={labelSize}
          fontWeight={700}
          style={{ fontFamily: "DM Sans, system-ui, sans-serif" }}
        >
          {num}
        </text>
      );
    }
  }

  return (
    <svg
      className={`issf-svg ${className}`}
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      aria-label="ISSF 10 m Luftgewehrscheibe mit Treffern"
    >
      <rect
        x={-outer}
        y={-outer}
        width={outer * 2}
        height={outer * 2}
        fill="#d0d0cc"
      />
      {fillCircles}
      {ringStrokes}
      {ringLabels}
      {trefferDrawOrder.map((t) => {
        const { xm, ym } = toMm(t.x, t.y);
        const last = isLastShot(t);
        const r = last ? shotR * 1.42 : shotR;
        const glow = last ? shotR * 2.55 : shotR * 1.8;
        const fillAlpha = last ? 0.88 : 0.75;
        const glowAlpha = last ? 0.5 : 0.35;
        const title = last
          ? `Letzter Schuss ${t.Treffer}: ${ring01ToDisplay(t.Ring01)} (${t.x}, ${t.y})`
          : `Schuss ${t.Treffer}: ${ring01ToDisplay(t.Ring01)} (${t.x}, ${t.y})`;
        return (
          <g key={`${t.Stellung}-${t.Treffer}`}>
            <title>{title}</title>
            <circle
              cx={xm}
              cy={-ym}
              r={glow}
              fill={shotFill(t.Ring01, glowAlpha)}
              style={{ filter: last ? "blur(0.5px)" : "blur(0.35px)" }}
            />
            {last && (
              <circle
                cx={xm}
                cy={-ym}
                r={r + 0.38}
                fill="none"
                stroke="rgba(0,0,0,0.55)"
                strokeWidth={0.2}
              />
            )}
            <circle
              cx={xm}
              cy={-ym}
              r={r}
              fill={shotFill(t.Ring01, fillAlpha)}
              stroke={last ? "#ffffff" : "rgba(255,255,255,0.9)"}
              strokeWidth={last ? 0.28 : 0.12}
            />
            {last && (
              <circle
                cx={xm}
                cy={-ym}
                r={r + 0.14}
                fill="none"
                stroke="rgba(255,255,255,0.95)"
                strokeWidth={0.1}
              />
            )}
            <text
              x={xm}
              y={-ym}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#ffffff"
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={last ? 0.14 : 0.1}
              paintOrder="stroke fill"
              fontSize={
                (t.Treffer >= 10 ? shotNumBase * 0.82 : shotNumBase) *
                (last ? 1.12 : 1)
              }
              fontWeight={800}
              style={{ fontFamily: "DM Sans, system-ui, sans-serif" }}
            >
              {t.Treffer}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
