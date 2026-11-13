// Display helpers for admin screens.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Drizzle returns timestamps as Postgres text, e.g. "2026-11-11 10:13:30.123456+00". */
export function parseTimestamp(value: string): Date {
  return new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
}

/** "22 min", "3 h 10 min", "2 d 4 h". */
export function formatDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/** "1 min 05 s" for build times. */
export function formatSeconds(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

/** "11 Nov 2026 at 14:02" */
export function formatDateTime(date: Date): string {
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} at ${time}`;
}

/** numeric(10,4) text → "$0.08"; `digits` 4 for small amounts such as transcription. */
export function formatCost(value: string | number | null, digits = 2): string {
  return `$${Number(value ?? 0).toFixed(digits)}`;
}
