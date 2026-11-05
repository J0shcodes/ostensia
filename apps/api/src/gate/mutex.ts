// A mutex per key, for a single process (TD-003). Tasks with the same key run
// one after another in the order they asked; tasks with different keys do not
// wait for each other. A task that throws does not block the ones behind it.
export type KeyedMutex = {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
};

export function createKeyedMutex(): KeyedMutex {
  const tails = new Map<string, Promise<void>>();

  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve();
      const result = previous.then(task);
      // What the next task waits for: this one finishing, however it ended.
      const tail = result.then(
        () => undefined,
        () => undefined,
      );
      tails.set(key, tail);
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return result;
    },
  };
}
