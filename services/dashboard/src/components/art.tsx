// Shared drawing primitives for the hand-drawn style.

/** SVG filter, hatch pattern and symbols used by every drawing. Rendered once, by App. */
export function ArtDefs() {
  return (
    <svg width="0" height="0" className="defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
        </filter>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#1B1A17" strokeWidth="0.9" opacity="0.6" />
        </pattern>
        <symbol id="tower" viewBox="0 0 120 320" overflow="visible">
          <path d="M24 64 L22 320 H98 L96 64 Z" fill="#FBF9F3" stroke="#1B1A17" strokeWidth="2" />
          <path d="M78 64 H96 L98 320 H78 Z" fill="url(#hatch)" />
          <path d="M23 112 H97 M23 176 H97 M23 244 H97" stroke="#1B1A17" strokeWidth="0.9" opacity="0.4" fill="none" />
          <path d="M10 42 H110 V64 H10 Z" fill="#FBF9F3" stroke="#1B1A17" strokeWidth="2" />
          <line x1="14" y1="34" x2="106" y2="34" stroke="#1B1A17" strokeWidth="16" strokeDasharray="14 11" />
          <line x1="14" y1="34" x2="106" y2="34" stroke="#FBF9F3" strokeWidth="12" strokeDasharray="10 15" strokeDashoffset="-2" />
          <path d="M54 100 v30 h12 v-30 a6 6 0 0 0 -12 0Z M54 180 v30 h12 v-30 a6 6 0 0 0 -12 0Z" fill="#1B1A17" />
          <path d="M44 320 v-46 a16 16 0 0 1 32 0 v46 Z" fill="#1B1A17" />
        </symbol>
        <g id="flame">
          <path d="M0 -50 C-15 -30 -21 -20 -21 -10 a21 21 0 0 0 42 0 C21 -22 15 -32 0 -50Z" fill="#B8380F" />
          <path d="M0 -26 C-6 -14 -9 -8 -9 -2 a9 9 0 0 0 18 0 C9 -9 6 -15 0 -26Z" fill="#FBF9F3" />
        </g>
      </defs>
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <svg aria-hidden="true" width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="13.5" stroke="#1B1A17" strokeWidth="1.6" />
        <circle cx="16" cy="16" r="8" stroke="#1B1A17" strokeWidth="1.4" strokeDasharray="3 3" />
        <circle cx="16" cy="16" r="2.8" fill="#B8380F" />
      </svg>
      Perimeter
    </span>
  );
}

/** Decorative row of towers with one lit beacon. */
export function Skyline() {
  const towers: Array<[number, number]> = [[6, 56], [92, 36], [178, 46], [264, 20], [350, 50], [436, 66]];
  return (
    <svg className="art skyline" viewBox="0 0 520 150" aria-hidden="true">
      <g filter="url(#rough)">
        {towers.map(([x, y]) => (
          <use key={x} href="#tower" width="120" height="320" transform={`translate(${x} ${y}) scale(0.33)`} />
        ))}
        <rect className="ground" x="0" y="140" width="520" height="14" />
        <path d="M0 141 C 150 138, 350 144, 520 140" stroke="#1B1A17" strokeWidth="2.2" fill="none" />
        <use href="#flame" transform="translate(112 44) scale(0.42)" />
      </g>
    </svg>
  );
}

export interface TowerSpec {
  name: string;
  /** Tower height as a fraction of the tallest. */
  size?: number;
  note?: string;
}

const SLOT = 230;

/**
 * One tower per service. `path` draws dashed trace arrows between consecutive named towers,
 * `flame` lights the beacon on one of them. Only draws what it is given.
 */
export function TowerRow({
  towers,
  path = [],
  flame,
  label,
}: Readonly<{ towers: TowerSpec[]; path?: string[]; flame?: string; label: string }>) {
  const width = Math.max(towers.length, 4) * SLOT;
  const offset = (width - towers.length * SLOT) / 2;
  const ground = 330;
  const geometry = new Map(
    towers.map((t, i) => {
      const scale = 0.7 * (t.size ?? 1);
      const centre = offset + i * SLOT + SLOT / 2;
      return [t.name, { centre, scale, top: ground - 300 * scale }];
    }),
  );
  const hops = path.slice(1).flatMap((to, i) => {
    const a = geometry.get(path[i]);
    const b = geometry.get(to);
    return a && b ? [{ key: `${path[i]}-${to}`, a, b }] : [];
  });

  return (
    <div className="scroll">
      <svg className="art tower-row" viewBox={`0 0 ${width} 390`} role="img" aria-label={label} style={{ minWidth: width * 0.62 }}>
        <g filter="url(#rough)">
          {towers.map((t) => {
            const g = geometry.get(t.name)!;
            return (
              <use key={t.name} href="#tower" width="120" height="320" transform={`translate(${g.centre - 60 * g.scale} ${ground - 320 * g.scale}) scale(${g.scale})`} />
            );
          })}
          <path d={`M0 ${ground + 1} C ${width / 4} ${ground - 2}, ${width * 0.6} ${ground + 4}, ${width} ${ground}`} stroke="#1B1A17" strokeWidth="2.2" fill="none" />
          {flame && geometry.has(flame) && (
            <use href="#flame" transform={`translate(${geometry.get(flame)!.centre} ${geometry.get(flame)!.top + 14}) scale(0.7)`} />
          )}
          {hops.map(({ key, a, b }) => (
            <g key={key} fill="none" stroke="#B8380F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d={`M${a.centre} ${a.top} Q ${(a.centre + b.centre) / 2} ${Math.min(a.top, b.top) - 70} ${b.centre} ${b.top - 8}`} strokeDasharray="8 6" />
              <path d={`M${b.centre - 14} ${b.top - 16} L ${b.centre} ${b.top - 8} L ${b.centre + (a.centre < b.centre ? -2 : 18)} ${b.top - 24}`} />
            </g>
          ))}
        </g>
        <g className="hand" textAnchor="middle">
          {towers.map((t) => {
            const g = geometry.get(t.name)!;
            return (
              <g key={t.name} className={t.name === flame ? 'hot' : undefined}>
                <text x={g.centre} y="360" fontSize="19">{t.name}</text>
                {t.note && <text x={g.centre} y="383" fontSize="16">{t.note}</text>}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
