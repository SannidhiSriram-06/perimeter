// Hand-drawn plates from the Perimeter design. They need <ArtDefs /> (see art.tsx) on the page.

export function EdgePlate() {
  return (
    <svg className="art" viewBox="0 0 1200 560" role="img" aria-label="Hand-drawn elevation of five fortress towers joined by a wall. A dashed trace path links the first four towers and ends at a burning beacon on the fourth, marked as the root cause.">
        <g filter="url(#rough)">
          <g fill="none" stroke="#BDB5A2" strokeWidth="1.4" strokeDasharray="2 7"><circle cx="600" cy="480" r="170"/><circle cx="600" cy="480" r="260"/><circle cx="600" cy="480" r="350"/><circle cx="600" cy="480" r="440"/><circle cx="600" cy="480" r="530"/></g>
          <path d="M50 372 H1150 V480 H50 Z" fill="#FBF9F3" stroke="#1B1A17" strokeWidth="2"/>
          <path d="M50 410 H1150 M50 444 H1150" stroke="#1B1A17" strokeWidth="0.9" opacity="0.35" fill="none"/>
          <rect x="50" y="446" width="1100" height="34" fill="url(#hatch)" opacity="0.45"/>
          <line x1="50" y1="364" x2="1150" y2="364" stroke="#1B1A17" strokeWidth="16" strokeDasharray="14 11"/>
          <line x1="50" y1="364" x2="1150" y2="364" stroke="#FBF9F3" strokeWidth="12" strokeDasharray="10 15" strokeDashoffset="-2"/>
          <use href="#tower" width="120" height="320" transform="translate(110 240)"/>
          <use href="#tower" width="120" height="320" transform="translate(325 200)"/>
          <use href="#tower" width="120" height="320" transform="translate(520 70) scale(1.333)"/>
          <use href="#tower" width="120" height="320" transform="translate(755 215)"/>
          <use href="#tower" width="120" height="320" transform="translate(970 250)"/>
          <rect x="0" y="480" width="1200" height="80" fill="#FBF9F3"/>
          <path d="M0 481 C 200 478, 400 484, 600 480 S 1000 477, 1200 481" stroke="#1B1A17" strokeWidth="2.4" fill="none"/>
          <path d="M20 492 l12 -8 M70 494 l14 -9 M150 493 l12 -8 M260 494 l14 -9 M880 493 l12 -8 M990 494 l14 -9 M1100 493 l12 -8" stroke="#1B1A17" strokeWidth="1" opacity="0.5" fill="none"/>
          <use href="#flame" transform="translate(815 238)"/>
          <path d="M815 168 v-18 M780 182 l-11 -11 M850 182 l11 -11 M772 214 h-18 M858 214 h18" stroke="#B8380F" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
          <g fill="none" stroke="#B8380F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="9 7">
            <path d="M170 254 Q 270 148 385 208"/>
            <path d="M395 202 Q 450 80 566 94"/>
            <path d="M636 94 Q 750 64 800 184"/>
          </g>
          <g fill="none" stroke="#B8380F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M372 196 L385 208 L369 211"/><path d="M552 83 L566 94 L551 103"/><path d="M790 172 L800 184 L810 171"/></g>
          <g stroke="#1B1A17" strokeWidth="1.6" fill="none" strokeLinecap="round"><path d="M110 46 H870 M110 32 V60 M870 32 V60"/><path d="M122 40 L110 46 L122 52 M858 40 L870 46 L858 52"/></g>
          <path d="M905 166 C 888 170, 868 184, 856 200 M866 187 L855 201 L871 199" stroke="#B8380F" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M935 270 C 965 262, 990 262, 1004 270 M994 262 L1005 270 L992 277" stroke="#1B1A17" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </g>
        <g className="hand" textAnchor="middle">
          <text x="490" y="28" fontSize="24" fill="#1B1A17">blast radius · three hops from the alert</text>
          <text x="975" y="160" fontSize="24" fill="#B8380F" textAnchor="start">root cause</text>
          <text x="975" y="190" fontSize="17" fill="#B8380F" textAnchor="start">504 after 4000 ms</text>
          <text x="940" y="235" fontSize="19" fill="#1B1A17" textAnchor="start" transform="translate(0 0)">healthy, untouched</text>
          <text x="170" y="522" fontSize="20" fill="#1B1A17">frontend-proxy</text>
          <text x="385" y="522" fontSize="20" fill="#1B1A17">checkout-service</text>
          <text x="600" y="522" fontSize="20" fill="#1B1A17">payment-gateway</text>
          <text x="815" y="522" fontSize="20" fill="#B8380F">bank-network</text>
          <text x="1030" y="522" fontSize="20" fill="#1B1A17">inventory-service</text>
        </g>
      </svg>
  );
}

export function MapPlate() {
  return (
    <svg className="art" viewBox="0 0 560 360" role="img" aria-label="Three towers joined by a dashed trace path, the last with a beacon, and a fourth faded tower outside the radius.">
        <g filter="url(#rough)">
          <g fill="none" stroke="#BDB5A2" strokeWidth="1.3" strokeDasharray="2 7"><circle cx="236" cy="300" r="120"/><circle cx="236" cy="300" r="210"/></g>
          <use href="#tower" width="120" height="320" transform="translate(60 108) scale(0.6)"/>
          <use href="#tower" width="120" height="320" transform="translate(200 108) scale(0.6)"/>
          <use href="#tower" width="120" height="320" transform="translate(340 108) scale(0.6)"/>
          <g opacity="0.35"><use href="#tower" width="120" height="320" transform="translate(470 138) scale(0.6)"/></g>
          <rect x="0" y="300" width="560" height="60" fill="#FBF9F3"/>
          <path d="M0 301 C 120 298, 300 304, 560 300" stroke="#1B1A17" strokeWidth="2.2" fill="none"/>
          <use href="#flame" transform="translate(376 118) scale(0.55)"/>
          <g fill="none" stroke="#B8380F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 6"><path d="M96 124 Q 166 50 228 120"/><path d="M246 120 Q 306 50 366 110"/></g>
          <g fill="none" stroke="#B8380F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M215 112 L228 120 L212 124"/><path d="M355 100 L366 110 L352 114"/></g>
          <ellipse cx="506" cy="236" rx="52" ry="86" fill="none" stroke="#1B1A17" strokeWidth="1.4" strokeDasharray="4 6"/>
        </g>
        <g className="hand" textAnchor="middle" fontSize="17" fill="#1B1A17">
          <text x="96" y="330">frontend</text><text x="236" y="330">checkout</text><text x="376" y="330" fill="#B8380F">bank-network</text>
          <text x="506" y="330" opacity="0.6">recommendation</text>
          <text x="506" y="82" fontSize="17" fill="#4F4B44">not connected,</text><text x="506" y="102" fontSize="17" fill="#4F4B44">not affected</text>
          <text x="166" y="38" fontSize="20" fill="#B8380F">follow the calls</text>
        </g>
      </svg>
  );
}

export function SheetPlate() {
  return (
    <svg className="art" viewBox="0 0 560 360" role="img" aria-label="A hand-ruled sheet listing four claims with green ticks on three and one circled in rust, with a reviewed stamp.">
        <g filter="url(#rough)">
          <g transform="rotate(-2 280 180)">
            <rect x="70" y="26" width="420" height="308" fill="#FBF9F3" stroke="#1B1A17" strokeWidth="2"/>
            <path d="M92 86 H468 M92 146 H468 M92 206 H468 M92 266 H468" stroke="#1B1A17" strokeWidth="1" opacity="0.4" fill="none"/>
            <g fill="none" stroke="#25694A" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M96 66 l9 10 l18 -22"/><path d="M96 126 l9 10 l18 -22"/><path d="M96 246 l9 10 l18 -22"/></g>
            <ellipse cx="290" cy="188" rx="190" ry="26" fill="none" stroke="#B8380F" strokeWidth="2.6"/>
            <path d="M104 182 l12 12 M116 182 l-12 12" stroke="#B8380F" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
          </g>
          <g transform="rotate(-9 420 300)"><rect x="352" y="280" width="140" height="42" fill="none" stroke="#B8380F" strokeWidth="3"/><rect x="358" y="286" width="128" height="30" fill="none" stroke="#B8380F" strokeWidth="1"/></g>
        </g>
        <g className="hand" fontSize="20" fill="#1B1A17" transform="rotate(-2 280 180)">
          <text x="136" y="76">c1  payment-gateway calls bank-network</text>
          <text x="136" y="136">c2  bank-network returned 504</text>
          <text x="136" y="196">c3  degradation began at 15:42</text>
          <text x="136" y="256">c4  gateway took 4200 ms</text>
        </g>
        <g className="hand" fill="#B8380F"><text x="300" y="232" fontSize="18" transform="rotate(-2 280 180)">outside the incident window</text></g>
        <text x="422" y="307" textAnchor="middle" className="sans" fontWeight="700" fontSize="17" letterSpacing="3" fill="#B8380F" transform="rotate(-9 420 300)">REVIEWED</text>
      </svg>
  );
}

export function PairPlate() {
  return (
    <svg className="art" viewBox="0 0 560 360" role="img" aria-label="Two overlapping circles labelled senior and investigator, with the overlap marked paired.">
        <g filter="url(#rough)">
          <circle cx="214" cy="170" r="116" fill="url(#hatch)" fillOpacity="0.5" stroke="#1B1A17" strokeWidth="2"/>
          <circle cx="346" cy="170" r="116" fill="none" stroke="#1B1A17" strokeWidth="2"/>
          <path d="M280 68 A116 116 0 0 1 280 272 A116 116 0 0 1 280 68 Z" fill="#B8380F" fillOpacity="0.22" stroke="#B8380F" strokeWidth="2.4"/>
          <path d="M70 322 H490" stroke="#1B1A17" strokeWidth="1.4" strokeDasharray="3 6" fill="none"/>
        </g>
        <g className="hand" textAnchor="middle" fill="#1B1A17">
          <text x="170" y="166" fontSize="24">senior</text><text x="170" y="192" fontSize="17" fill="#4F4B44">leads the call</text>
          <text x="392" y="166" fontSize="24">investigator</text><text x="392" y="192" fontSize="17" fill="#4F4B44">digs into logs</text>
          <text x="280" y="176" fontSize="26" fill="#B8380F">paired</text>
          <text x="280" y="346" fontSize="19" fill="#4F4B44">on call · experience · know-how</text>
        </g>
      </svg>
  );
}

export function GatePlate() {
  return (
    <svg className="art" viewBox="0 0 640 760" role="img" aria-label="Hand-drawn elevation of a tall stone tower with a lit beacon, set in a crenellated wall.">
      <g filter="url(#rough)">
        <g fill="none" stroke="#BDB5A2" strokeWidth="1.4" strokeDasharray="2 7"><circle cx="320" cy="640" r="150"/><circle cx="320" cy="640" r="240"/><circle cx="320" cy="640" r="330"/><circle cx="320" cy="640" r="420"/></g>
        <path d="M0 600 H640 V664 H0 Z" fill="#FBF9F3" stroke="#1B1A17" strokeWidth="2"/>
        <path d="M0 632 H640" stroke="#1B1A17" strokeWidth="0.9" opacity="0.35"/>
        <line x1="0" y1="592" x2="640" y2="592" stroke="#1B1A17" strokeWidth="16" strokeDasharray="14 11"/>
        <line x1="0" y1="592" x2="640" y2="592" stroke="#FBF9F3" strokeWidth="12" strokeDasharray="10 15" strokeDashoffset="-2"/>
        <use href="#tower" width="120" height="320" transform="translate(212 96) scale(1.8)"/>
        <rect x="0" y="664" width="640" height="96" fill="#FBF9F3"/>
        <path d="M0 665 C 160 662, 400 668, 640 664" stroke="#1B1A17" strokeWidth="2.4" fill="none"/>
        <path d="M30 680 l14 -9 M120 682 l14 -9 M500 681 l14 -9 M580 682 l14 -9" stroke="#1B1A17" strokeWidth="1" opacity="0.5" fill="none"/>
        <use href="#flame" transform="translate(320 150) scale(1.2)"/>
        <path d="M320 70 v-22 M276 92 l-14 -14 M364 92 l14 -14 M262 132 h-22 M378 132 h22" stroke="#B8380F" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      </g>
      <g className="hand" fill="#1B1A17">
        <text x="420" y="60" fontSize="24" fill="#B8380F">always lit</text>
        <text x="40" y="712" fontSize="19" fill="#4F4B44">the gate is for people who own the call</text>
      </g>
    </svg>
  );
}
