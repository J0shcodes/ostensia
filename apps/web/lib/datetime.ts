// The person picks an expiry in their own time zone (an <input type="datetime-local">
// gives wall-clock text with no zone). The API wants UTC. The conversion is done in one
// place, and the exact UTC value is always shown to the person before they confirm.

export type LocalToUtc =
  | { readonly ok: true; readonly iso: string }
  | { readonly ok: false; readonly reason: "empty" | "format" | "not_a_time" };

const LOCAL_INPUT = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?$/;

export function localInputToUtcIso(value: string): LocalToUtc {
  const text = value.trim();
  if (text === "") return { ok: false, reason: "empty" };
  const match = LOCAL_INPUT.exec(text);
  if (match === null) return { ok: false, reason: "format" };
  const [year, month, day, hour, minute, second] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? "0"),
  ] as const;

  const date = new Date(year, month - 1, day, hour, minute, second);
  // The Date constructor rolls impossible values over (30 February becomes 2 March, a
  // time skipped by a daylight-saving change moves an hour, years 0 to 99 become 19xx).
  // Reading the parts back and comparing is how a date that does not exist is caught.
  const sameParts =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second;
  if (!sameParts) return { ok: false, reason: "not_a_time" };
  return { ok: true, iso: date.toISOString() };
}

const UTC_ISO = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]{1,9})?Z$/;

export type UtcToLocal = {
  // The value for an <input type="datetime-local">, to the minute.
  readonly value: string;
  // False when the instant had seconds or fractions that the minute-level input drops.
  // The input is always rounded down, so the expiry only ever moves earlier, which is
  // the stricter direction.
  readonly exact: boolean;
};

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function utcIsoToLocalInput(iso: string): UtcToLocal | null {
  const match = UTC_ISO.exec(iso);
  if (match === null) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // JavaScript rolls an impossible date over (30 February becomes 2 March) instead of
  // refusing it, so the parts are read back and compared, as in localInputToUtcIso.
  const sameParts =
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6]);
  if (!sameParts) return null;
  const value = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return { value, exact: date.getSeconds() === 0 && date.getMilliseconds() === 0 };
}

// For reading, never for sending: the person's own time zone and locale. `locale` is a
// parameter so tests do not depend on the machine.
export function formatLocalInstant(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function isInPast(iso: string, now: number): boolean {
  const time = new Date(iso).getTime();
  return !Number.isNaN(time) && time <= now;
}
