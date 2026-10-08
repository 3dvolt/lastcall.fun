import { useId } from "react";

/** Last Call mark: a service bell ringing, with the price line holding above the threshold cut out of the dome. */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  const amber = `lc-amber-${id}`, glow = `lc-glow-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      <defs>
        <linearGradient id={amber} x1="10" y1="14" x2="54" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe28f" /><stop offset="0.5" stopColor="#ffb020" /><stop offset="1" stopColor="#f26b13" />
        </linearGradient>
        <radialGradient id={glow} cx="32" cy="36" r="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffb020" stopOpacity="0.2" /><stop offset="1" stopColor="#ffb020" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#15110a" />
      <rect width="64" height="64" rx="16" fill={`url(#${glow})`} />
      <path d="M19 13.5 15.5 10M45 13.5 48.5 10M32 9.5V5.5" stroke="#ffd36b" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="32" cy="17.5" r="3.4" fill={`url(#${amber})`} />
      <path d="M10.5 43.5C10.5 29.5 20 21 32 21s21.5 8.5 21.5 22.5Z" fill={`url(#${amber})`} />
      <path d="M16 40C16.6 32.5 21.5 27.2 28 25.4" fill="none" stroke="#fff6dc" strokeOpacity="0.55" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="6.5" y="46" width="51" height="7" rx="3.5" fill={`url(#${amber})`} />
      <path d="M20 40 26.5 34.5 31 37.5 43.5 28.5" fill="none" stroke="#15110a" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="43.5" cy="28.5" r="2.5" fill="#15110a" />
    </svg>
  );
}
