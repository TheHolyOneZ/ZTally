
export interface StyleInfo {
  id: string;
  preview: { page: string; surface: string; accent: string };
}

export const STYLES: StyleInfo[] = [
  { id: "chronograph", preview: { page: "#0e0d0a", surface: "#26231c", accent: "#f0a948" } },
  { id: "nocturne", preview: { page: "#0b0d14", surface: "#1d2230", accent: "#7c9cff" } },
  { id: "verdant", preview: { page: "#0b100d", surface: "#1c261f", accent: "#57d39a" } },
  { id: "rose", preview: { page: "#120c10", surface: "#251a20", accent: "#ff7eb0" } },
  { id: "graphite", preview: { page: "#0c0c0d", surface: "#202023", accent: "#4fd1c5" } },
];
