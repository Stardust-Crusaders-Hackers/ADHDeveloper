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

export interface TextContentBlock {
  type: "text";
  text: string;
  cache_control?: CacheControl;
  cache_placement?: "start" | "end" | "adjacent";
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

const AVG_BYTES_PER_TOKEN = Number(process.env.AVG_BYTES_PER_TOKEN) || 4;

/**
 * Return threshold in bytes to mark an entry ephemeral.
 * Priority: EPHEMERAL_CACHE_MIN_TOKENS -> EPHEMERAL_CACHE_THRESHOLD_BYTES -> default 1024.
 */
function getEphemeralThresholdBytes(): number {
  const minTokens = Number(process.env.EPHEMERAL_CACHE_MIN_TOKENS);
  if (!Number.isNaN(minTokens) && minTokens > 0) {
    return Math.max(1024, Math.floor(minTokens * AVG_BYTES_PER_TOKEN));
  }
  const envBytes = Number(process.env.EPHEMERAL_CACHE_THRESHOLD_BYTES);
  if (!Number.isNaN(envBytes) && envBytes > 0) return Math.floor(envBytes);
  return 1024;
}

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
      cacheControl: existing.sizeBytes > getEphemeralThresholdBytes() ? EPHEMERAL_CACHE_CONTROL : undefined,
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
    cacheControl: entry.sizeBytes > getEphemeralThresholdBytes() ? EPHEMERAL_CACHE_CONTROL : undefined,
  };
}

export function toTextContentBlock(result: ReadResult, prefix: string, placement: "start" | "end" | "adjacent" = "adjacent"): TextContentBlock {
  const text = `${prefix}\n\n${result.content}`;
  const block: TextContentBlock = {
    type: "text",
    text,
    ...(result.cacheControl ? { cache_control: result.cacheControl } : {}),
    ...(result.cacheControl ? { cache_placement: placement } : {}),
  };
  return block;
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
