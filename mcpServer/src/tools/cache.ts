interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class KeyedCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  // Return snapshot of entries and their expiry times. Removes expired entries while enumerating.
  entries(): Array<{ key: string; value: T; expiresAt: number }> {
    const now = Date.now();
    const out: Array<{ key: string; value: T; expiresAt: number }> = [];
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        continue;
      }
      out.push({ key, value: entry.value, expiresAt: entry.expiresAt });
    }
    return out;
  }
}
