import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AuditCorruptError, AuditEventSchema } from "./events.ts";
import type { AuditEvent } from "./events.ts";

// The append-only audit log (D-008): one JSON event per line. The gate rebuilds
// all of its state by reading it once at startup.
export type AuditLog = {
  append(event: AuditEvent): Promise<void>;
  readAll(): Promise<{ events: AuditEvent[]; warnings: string[] }>;
};

// Parses text into events. A line that is not a valid event is a torn write if
// it is the LAST line (the process died part-way), and that line is reported so
// the caller can repair the file. A bad line anywhere else means the file was
// damaged or edited, and nothing can be trusted, so it throws.
function parseLines(text: string): { events: AuditEvent[]; tornFrom: number | null } {
  const lines = text.split("\n");
  let lastContent = -1;
  lines.forEach((line, index) => {
    if (line.trim() !== "") lastContent = index;
  });

  const events: AuditEvent[] = [];
  for (let index = 0; index <= lastContent; index++) {
    const line = lines[index] ?? "";
    if (line.trim() === "") continue;

    let parsed: unknown;
    let valid = false;
    try {
      parsed = JSON.parse(line) as unknown;
      valid = true;
    } catch {
      valid = false;
    }
    const event = valid ? AuditEventSchema.safeParse(parsed) : null;
    if (event !== null && event.success) {
      events.push(event.data);
      continue;
    }
    if (index === lastContent) return { events, tornFrom: index };
    throw new AuditCorruptError(`Audit log line ${index + 1} is not a valid event.`);
  }
  return { events, tornFrom: null };
}

export function createFileAuditLog(path: string): AuditLog {
  let ready: Promise<void> | null = null;
  const ensureDirectory = () => (ready ??= mkdir(dirname(path), { recursive: true }).then(() => undefined));

  return {
    async append(event) {
      await ensureDirectory();
      const line = `${JSON.stringify(event)}\n`;
      const handle = await open(path, "a");
      try {
        await handle.write(line);
        // The record must reach the disk before the PayPal call it announces.
        await handle.datasync();
      } finally {
        await handle.close();
      }
    },

    async readAll() {
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { events: [], warnings: [] };
        throw error;
      }

      const { events, tornFrom } = parseLines(text);
      const warnings: string[] = [];
      const lines = text.split("\n");

      if (tornFrom !== null) {
        // Keep the unreadable tail out of the log, so the next append cannot
        // glue a new event onto half of an old one, and keep it for a person.
        const kept = lines.slice(0, tornFrom);
        const discarded = lines.slice(tornFrom).join("\n");
        await writeFile(path, kept.length === 0 ? "" : `${kept.join("\n")}\n`, "utf8");
        const side = await open(`${path}.discarded`, "a");
        try {
          await side.write(`${discarded}\n`);
        } finally {
          await side.close();
        }
        warnings.push(
          `The last line of the audit log was unreadable and was moved to ${path}.discarded (line ${tornFrom + 1}).`,
        );
      } else if (text !== "" && !text.endsWith("\n")) {
        // A valid last event with no newline: finish the line so the next append
        // starts on a new one.
        await writeFile(path, `${text}\n`, "utf8");
        warnings.push("The audit log did not end with a newline; one was added.");
      }
      return { events, warnings };
    },
  };
}

// For tests and for running without persistence. It behaves like the file log
// but keeps events in memory.
export function createMemoryAuditLog(initial: readonly AuditEvent[] = []): AuditLog & { readonly events: AuditEvent[] } {
  const events: AuditEvent[] = [...initial];
  return {
    events,
    async append(event) {
      events.push(AuditEventSchema.parse(event));
    },
    async readAll() {
      return { events: [...events], warnings: [] };
    },
  };
}
