import { describe, expect, it } from "vitest";
import { createKeyedMutex } from "./mutex.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe("createKeyedMutex", () => {
  it("runs tasks with the same key one at a time, in the order they asked", async () => {
    const mutex = createKeyedMutex();
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`start ${name}`);
      await tick();
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([mutex.run("k", task("a")), mutex.run("k", task("b")), mutex.run("k", task("c"))]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("lets tasks with different keys overlap", async () => {
    const mutex = createKeyedMutex();
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`start ${name}`);
      await tick();
      log.push(`end ${name}`);
    };
    await Promise.all([mutex.run("one", task("a")), mutex.run("two", task("b"))]);
    expect(log.slice(0, 2).sort()).toEqual(["start a", "start b"]);
  });

  it("does not block the tasks behind one that throws", async () => {
    const mutex = createKeyedMutex();
    const failing = mutex.run("k", async () => {
      throw new Error("boom");
    });
    const next = mutex.run("k", async () => "ran");
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ran");
  });

  it("returns each task's own value", async () => {
    const mutex = createKeyedMutex();
    expect(await mutex.run("k", async () => 1)).toBe(1);
    expect(await mutex.run("k", async () => "two")).toBe("two");
  });

  it("keeps working after a key has gone idle", async () => {
    const mutex = createKeyedMutex();
    await mutex.run("k", async () => undefined);
    await tick();
    expect(await mutex.run("k", async () => "again")).toBe("again");
  });
});
