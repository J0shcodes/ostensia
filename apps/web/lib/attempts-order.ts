import type { Attempt } from "./api-types.ts";

// The list of attempts is read newest first, by the time each attempt started (guidelines
// section 13.5). This is for reading only: it returns a new list and never changes or drops
// an attempt. An attempt whose time cannot be read goes last rather than disappearing.
export function newestFirst(attempts: readonly Attempt[]): Attempt[] {
  const time = (attempt: Attempt): number => {
    const parsed = Date.parse(attempt.startedAt);
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  };
  return [...attempts].sort((a, b) => {
    const left = time(a);
    const right = time(b);
    return left === right ? 0 : left < right ? 1 : -1;
  });
}
