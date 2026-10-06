const DAY_MS = 86_400_000;

/** Days from `origin` to `date`, both `YYYY-MM-DD` (or longer ISO strings, only the date part is used). */
export function dayIndex(date: string, origin: string): number {
  return Math.round((Date.parse(`${date.slice(0, 10)}T00:00:00Z`) - Date.parse(`${origin}T00:00:00Z`)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function compactDate(date: string): string {
  return date.replaceAll("-", "");
}
