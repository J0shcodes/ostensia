import type { ReactElement } from "react";

// A small hand-drawn set (guidelines section 6): 16px, 1.5px stroke, drawn in the
// current text colour. No icon library, no emoji. They carry no meaning on their own:
// every use sits next to words.
export type IconName = "check" | "cross" | "clock" | "alert" | "info" | "copy";

const SHAPES: Record<IconName, ReactElement> = {
  check: <path d="M3.5 8.5l3 3 6-7" />,
  cross: <path d="M4 4l8 8M12 4l-8 8" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.2l6.3 11H1.7L8 2.2z" />
      <path d="M8 6.5v3M8 11.6v.2" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.2v3.6M8 5v.2" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </>
  ),
};

export function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {SHAPES[name]}
    </svg>
  );
}
