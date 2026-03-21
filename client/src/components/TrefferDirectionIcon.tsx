import { trefferRichtung8Index, trefferRichtungLabel } from "../trefferDirection";

type Props = {
  x: number;
  y: number;
  className?: string;
};

/** Kleiner Pfeil in eine von 8 Richtungen (Trefferlage zur Mitte). */
export function TrefferDirectionIcon({ x, y, className = "" }: Props) {
  const idx = trefferRichtung8Index(x, y);
  const label = trefferRichtungLabel(x, y);
  if (idx == null) {
    return (
      <span
        className={`treffer-dir-none ${className}`}
        title={label}
        role="img"
        aria-label={label}
      >
        ·
      </span>
    );
  }
  const deg = idx * 45;
  return (
    <span
      className={`treffer-dir-wrap ${className}`}
      title={label}
      role="img"
      aria-label={label}
    >
      <svg
        className="treffer-dir-svg"
        viewBox="0 0 16 16"
        width={18}
        height={18}
        style={{ transform: `rotate(${deg}deg)` }}
      >
        <path
          d="M 2 8 L 12 8 M 9.5 5 L 14 8 L 9.5 11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
