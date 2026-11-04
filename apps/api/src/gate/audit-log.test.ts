import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileAuditLog, createMemoryAuditLog } from "./audit-log.ts";
import { AuditCorruptError } from "./events.ts";
import type { AuditEvent } from "./events.ts";

const AT = "2026-11-02T12:00:00.000Z";
const started = (attemptId: string): AuditEvent => ({
  v: 1,
  at: AT,
  type: "attempt_started",
  attemptId,
  mandateId: "m-1",
  proposal: {
    mandateId: "m-1",
    currency: "USD",
    declaredTotalMinor: 100,
    lines: [{ productId: "p", quantity: 1, unitPriceMinor: 100 }],
  },
});
const requested = (attemptId: string): AuditEvent => ({ v: 1, at: AT, type: "order_requested", attemptId });

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ostensia-audit-"));
  path = join(directory, "nested", "audit.jsonl");
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("createFileAuditLog", () => {
  it("reads an empty log when the file does not exist", async () => {
    expect(await createFileAuditLog(path).readAll()).toEqual({ events: [], warnings: [] });
  });

  it("creates the directory, writes one JSON event per line and reads them back in order", async () => {
    const log = createFileAuditLog(path);
    await log.append(started("a-1"));
    await log.append(requested("a-1"));
    const text = await readFile(path, "utf8");
    expect(text.split("\n")).toHaveLength(3);
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text.split("\n")[0] ?? "")).toMatchObject({ type: "attempt_started" });
    expect(await createFileAuditLog(path).readAll()).toEqual({
      events: [started("a-1"), requested("a-1")],
      warnings: [],
    });
  });

  it("only ever adds to the file", async () => {
    const log = createFileAuditLog(path);
    await log.append(started("a-1"));
    const before = await readFile(path, "utf8");
    await log.append(requested("a-1"));
    expect((await readFile(path, "utf8")).startsWith(before)).toBe(true);
  });

  it("ignores blank lines", async () => {
    const log = createFileAuditLog(path);
    await log.append(started("a-1"));
    await appendFile(path, "\n\n", "utf8");
    await log.append(requested("a-1"));
    expect((await createFileAuditLog(path).readAll()).events).toHaveLength(2);
  });
});

describe("a damaged last line (D-008)", () => {
  async function withTornTail(tail: string) {
    const log = createFileAuditLog(path);
    await log.append(started("a-1"));
    await appendFile(path, tail, "utf8");
    return log;
  }

  it.each([
    ["half a JSON object", '{"v":1,"at":"2026-11-02T12:00:00.000Z","type":"order_req'],
    ["valid JSON that is not an event", '{"v":1,"type":"nonsense"}\n'],
    ["an event with an extra field", `${JSON.stringify({ ...requested("a-1"), extra: true })}\n`],
    ["plain text", "garbage\n"],
  ])("skips %s with a warning", async (_label, tail) => {
    await withTornTail(tail);
    const result = await createFileAuditLog(path).readAll();
    expect(result.events).toEqual([started("a-1")]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("unreadable");
  });

  it("moves the bad tail to a side file instead of destroying it", async () => {
    await withTornTail("half a line");
    await createFileAuditLog(path).readAll();
    expect(await readFile(`${path}.discarded`, "utf8")).toContain("half a line");
  });

  it("repairs the file, so the next append starts a clean line and the next replay is clean", async () => {
    await withTornTail("half a line");
    const log = createFileAuditLog(path);
    await log.readAll();
    await log.append(requested("a-1"));
    const again = await createFileAuditLog(path).readAll();
    expect(again.events).toEqual([started("a-1"), requested("a-1")]);
    expect(again.warnings).toEqual([]);
  });

  it("handles a log whose only line is damaged", async () => {
    await mkdirFor(path);
    await writeFile(path, "half a line", "utf8");
    const result = await createFileAuditLog(path).readAll();
    expect(result.events).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(await readFile(path, "utf8")).toBe("");
  });
});

describe("a valid last event with no trailing newline", () => {
  it("adds the newline, so the next append does not join two events", async () => {
    await mkdirFor(path);
    await writeFile(path, JSON.stringify(started("a-1")), "utf8");
    const log = createFileAuditLog(path);
    const result = await log.readAll();
    expect(result.events).toEqual([started("a-1")]);
    expect(result.warnings).toHaveLength(1);
    await log.append(requested("a-1"));
    expect((await createFileAuditLog(path).readAll()).events).toEqual([started("a-1"), requested("a-1")]);
  });
});

describe("a damaged line anywhere else", () => {
  it.each([
    ["garbage in the middle", `${JSON.stringify(started("a-1"))}\ngarbage\n${JSON.stringify(requested("a-1"))}\n`],
    ["an unknown event type in the middle", `${JSON.stringify(started("a-1"))}\n{"v":1,"type":"x"}\n${JSON.stringify(requested("a-1"))}\n`],
    ["a damaged first line", `garbage\n${JSON.stringify(requested("a-1"))}\n`],
  ])("refuses to start with %s", async (_label, text) => {
    await mkdirFor(path);
    await writeFile(path, text, "utf8");
    await expect(createFileAuditLog(path).readAll()).rejects.toBeInstanceOf(AuditCorruptError);
    // The file was left alone.
    expect(await readFile(path, "utf8")).toBe(text);
  });

  it("names the line, never its contents", async () => {
    await mkdirFor(path);
    await writeFile(path, `SECRET-CONTENT\n${JSON.stringify(requested("a-1"))}\n`, "utf8");
    const error = await createFileAuditLog(path).readAll().catch((e: unknown) => e as Error);
    expect((error as Error).message).toContain("line 1");
    expect((error as Error).message).not.toContain("SECRET-CONTENT");
  });
});

describe("createMemoryAuditLog", () => {
  it("behaves like the file log", async () => {
    const log = createMemoryAuditLog();
    await log.append(started("a-1"));
    expect(await log.readAll()).toEqual({ events: [started("a-1")], warnings: [] });
  });

  it("starts from the events it is given", async () => {
    expect((await createMemoryAuditLog([started("a-1")]).readAll()).events).toEqual([started("a-1")]);
  });

  it("refuses an event that is not valid, as the file log would on replay", async () => {
    await expect(createMemoryAuditLog().append({ v: 1, at: "nope", type: "order_requested", attemptId: "a" } as AuditEvent)).rejects.toThrow();
  });
});

async function mkdirFor(file: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(file), { recursive: true });
}
