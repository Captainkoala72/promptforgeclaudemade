import type { Run } from "./types";

const STORAGE_KEY = "prompt-forge:history:v1";
export const HISTORY_LIMIT = 20;

/** Reads history, tolerating a corrupted or absent key. */
export function loadHistory(): Run[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRun).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/** Writes history, trimming to the newest HISTORY_LIMIT runs. */
export function saveHistory(runs: Run[]): Run[] {
  const trimmed = runs.slice(0, HISTORY_LIMIT);
  if (typeof window === "undefined") return trimmed;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota exceeded or storage disabled — history is a convenience, not state
    // the app depends on.
  }
  return trimmed;
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

function isRun(value: any): value is Run {
  return (
    value &&
    typeof value.id === "string" &&
    typeof value.input === "string" &&
    typeof value.output === "string" &&
    typeof value.createdAt === "number"
  );
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function relativeTime(ts: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
