const chains = new Map<string, Promise<unknown>>();

/**
 * 同一個 jobId 的多個「部分結果寫回」可能幾乎同時發生（例如兩家電信同時查完），
 * 用 per-key 的 promise chain 序列化寫入，避免 read-modify-write 互相覆蓋掉對方的結果。
 */
export function runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  chains.set(
    key,
    next.catch(() => {}),
  );
  return next;
}
