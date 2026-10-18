/** The paper sword held at the bottom right, Daggerfall-style. */
export function Weapon({ swing, blocking, moving, running }: { swing: number; blocking: boolean; moving: boolean; running: boolean }) {
  return (
    <div className={`weapon pointer-events-none fixed bottom-0 right-[8%] ${moving ? (running ? 'bob-fast' : 'bob') : ''}`}>
      <div key={swing} className={`${swing > 0 ? 'swing' : ''} ${blocking ? 'block' : ''}`}>
        <svg viewBox="0 0 220 360" className="h-[46vh] max-h-[420px] min-h-[220px] drop-shadow-[5px_6px_0_rgba(20,12,8,0.45)]">
          <defs>
            <filter id="wcut" x="-10%" y="-10%" width="120%" height="120%">
              <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="g" />
              <feFlood floodColor="#f4ecd6" />
              <feComposite in2="g" operator="in" result="edge" />
              <feMerge>
                <feMergeNode in="edge" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#wcut)" stroke="#2b2118" strokeWidth="3" strokeLinejoin="round">
            {/* blade */}
            <path d="M92 18 L110 4 L120 22 L124 214 L100 214 Z" fill="#d8dce0" />
            <path d="M110 4 L120 22 L124 214 L112 214 Z" fill="#aeb4ba" strokeWidth="0" />
            <path d="M108 30 L110 200" stroke="#8a9096" strokeWidth="2" />
            {/* guard and grip */}
            <path d="M62 214 L162 214 Q170 222 162 230 L62 230 Q54 222 62 214 Z" fill="#c9a24a" />
            <rect x="100" y="230" width="24" height="56" fill="#5a3d26" />
            <path d="M100 242 L124 248 M100 256 L124 262 M100 270 L124 276" stroke="#2b2118" strokeWidth="2" />
            <circle cx="112" cy="294" r="12" fill="#c9a24a" />
            {/* hand and sleeve */}
            <path d="M88 236 Q84 224 100 222 L130 226 Q144 232 140 252 L136 280 Q130 292 112 290 L92 286 Q82 270 88 236 Z" fill="#e8b890" />
            <path d="M96 240 L130 244 M94 256 L132 260 M94 272 L130 276" stroke="#2b2118" strokeWidth="2" fill="none" />
            <path d="M80 280 L150 270 L190 360 L60 360 Z" fill="#3f6a7a" />
            <path d="M80 280 L150 270 L154 290 L84 300 Z" fill="#c9a24a" />
          </g>
        </svg>
      </div>
    </div>
  )
}
