/** Opaque metal pushpin for polaroids (SVG — no translucent CSS) */
export function Pushpin() {
  return (
    <span className="instant__thumbtack" aria-hidden>
      <svg viewBox="0 0 20 26" xmlns="http://www.w3.org/2000/svg">
        {/* Needle — fully opaque metal */}
        <rect x="8.5" y="12" width="3" height="12" rx="1" fill="#4a453e" />
        <rect x="8.75" y="12" width="1.2" height="10" rx="0.4" fill="#6a635c" />
        {/* Head base disc (shadow edge) */}
        <circle cx="10" cy="9" r="7.5" fill="#3d3934" />
        {/* Head body — solid gray metal */}
        <circle cx="10" cy="8.5" r="7" fill="#8a847c" />
        {/* Specular band (opaque lighter gray, not white glass) */}
        <ellipse cx="8.2" cy="6.2" rx="3.2" ry="2.4" fill="#b8b2a8" />
        {/* Small solid highlight */}
        <ellipse cx="7.4" cy="5.4" rx="1.6" ry="1.1" fill="#d4cfc6" />
      </svg>
    </span>
  );
}
