/**
 * Startup timing and file-API call counts, readable via
 * `MarkEditFileExplorer.perf()`. Times are ms since the page started loading.
 */
const marks: Record<string, number> = {};
const counts: Record<string, number> = {};

export function mark(name: string): void {
  marks[name] ??= Math.round(performance.now());
}

export function count(name: string): void {
  counts[name] = (counts[name] ?? 0) + 1;
}

export function perfReport(): { marks: Record<string, number>; counts: Record<string, number> } {
  return { marks: { ...marks }, counts: { ...counts } };
}
