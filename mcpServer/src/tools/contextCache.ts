import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CacheControl = { type: "ephemeral" };

export interface CacheEntry {
  content: string;
  sizeBytes: number;
  cachedAt: number;
  hits: number;
}

export interface ReadResult {
  filePath: string;
  content: string;
  source: "cache" | "disk";
  sizeBytes: number;
  hits: number;
  cacheControl?: CacheControl;
}

export interface CacheInfo {
  entries: Array<{
    filePath: string;
    sizeBytes: number;
    cachedAt: string;
    hits: number;
  }>;
  totalFiles: number;
  totalSizeBytes: number;
  totalHits: number;
}

// ─── Singleton cache ─────────────────────────────────────────────────────────
// ESM modules are singletons — this Map lives for the full MCP server process.

const cache = new Map<string, CacheEntry>();
let totalMisses = 0;
const EPHEMERAL_CACHE_CONTROL: CacheControl = { type: "ephemeral" };

// ─── Core operations ──────────────────────────────────────────────────────────

/**
 * Read a file. Returns cached content on hit; reads disk and caches on miss.
 * Path is resolved to absolute so relative/absolute variants hit the same key.
 */
export function readFile(filePath: string): ReadResult {
  const resolved = path.resolve(filePath);
  const existing = cache.get(resolved);

  if (existing) {
    existing.hits++;
    return {
      filePath: resolved,
      content: existing.content,
      source: "cache",
      sizeBytes: existing.sizeBytes,
      hits: existing.hits,
      cacheControl: existing.sizeBytes > 1024 ? EPHEMERAL_CACHE_CONTROL : undefined,
    };
  }

  totalMisses++;
  const content = fs.readFileSync(resolved, "utf-8");
  const entry: CacheEntry = {
    content,
    sizeBytes: Buffer.byteLength(content, "utf-8"),
    cachedAt: Date.now(),
    hits: 0,
  };
  cache.set(resolved, entry);

  return {
    filePath: resolved,
    content,
    source: "disk",
    sizeBytes: entry.sizeBytes,
    hits: 0,
    cacheControl: entry.sizeBytes > 1024 ? EPHEMERAL_CACHE_CONTROL : undefined,
  };
}

/** Return metadata about all cached files + aggregate stats. No file I/O. */
export function getCacheInfo(): CacheInfo & { totalMisses: number } {
  let totalSizeBytes = 0;
  let totalHits = 0;

  const entries = Array.from(cache.entries()).map(([filePath, entry]) => {
    totalSizeBytes += entry.sizeBytes;
    totalHits += entry.hits;
    return {
      filePath,
      sizeBytes: entry.sizeBytes,
      cachedAt: new Date(entry.cachedAt).toISOString(),
      hits: entry.hits,
    };
  });

  return {
    entries,
    totalFiles: cache.size,
    totalSizeBytes,
    totalHits,
    totalMisses,
  };
}

/**
 * Remove a specific file from cache (force re-read next time).
 * Returns true if the entry existed, false if it wasn't cached.
 */
export function invalidate(filePath: string): boolean {
  return cache.delete(path.resolve(filePath));
}

/** Clear all cached entries. Returns number of entries removed. */
export function clearCache(): number {
  const count = cache.size;
  cache.clear();
  totalMisses = 0;
  return count;
}
