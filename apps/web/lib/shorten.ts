// A long identifier shortened in the middle for reading (guidelines section 4:
// "3f9a…c21"). The full value stays in the page for assistive technology.
export function shorten(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;
}
