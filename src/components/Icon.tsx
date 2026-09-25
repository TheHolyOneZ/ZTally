
const paths: Record<string, string> = {
  today: "M12 3a9 9 0 1 0 9 9M12 3a9 9 0 0 1 9 9M12 3v3M21 12h-3M12 12l4-5",
  week: "M3 6h18M3 10h12M3 14h16M3 18h9",
  report: "M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21zM9 8h6M9 12h6M9 16h3",
  goals: "M12 21a9 9 0 1 1 9-9M12 17a5 5 0 1 1 5-5M12 12h.01M16 8l4-4M17 4h3v3",
  rules: "M4 4h7l9 9-7 7-9-9zM8 8h.01",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  pause: "M9 5v14M15 5v14",
  play: "M7 4l13 8-13 8z",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  puzzle:
    "M9 4a2 2 0 1 1 4 0v2h4v4h2a2 2 0 1 1 0 4h-2v5h-4v-2a2 2 0 1 0-4 0v2H5v-5h2a2 2 0 1 0 0-4H5V6h4z",
  folder: "M3 6h6l2 2h10v11H3z",
  check: "M5 12l5 5L20 7",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01",
  moon: "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.7M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4.4-1",
  printer: "M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z",
  drag: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z",
  cursor: "M5 3l6 16 2.2-6.8L20 10z",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h2M14 14h2M8 17h2",
  winMin: "M6 12h12",
  winMax: "M6 6h12v12H6z",
  winRestore: "M8 8h10v10H8zM6 16V6h10",
  chevDown: "M6 9l6 6 6-6",
};

export function Icon({ name, size = 18, className }: { name: keyof typeof paths | string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? ""} />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-label="ZTally">
      <defs>

        <linearGradient id="zt-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--brand)" }} />
          <stop offset="1" style={{ stopColor: "var(--brand-2)" }} />
        </linearGradient>
      </defs>
      <rect x="48" y="48" width="928" height="928" rx="232" fill="url(#zt-g)" />
      <g stroke="#1b1712" strokeLinecap="round" fill="none">
        <g strokeWidth="60" opacity="0.42">
          <line x1="392" y1="404" x2="392" y2="620" />
          <line x1="512" y1="404" x2="512" y2="620" />
          <line x1="632" y1="404" x2="632" y2="620" />
        </g>
        <polyline points="272,288 752,288 272,736 752,736" strokeWidth="96" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
