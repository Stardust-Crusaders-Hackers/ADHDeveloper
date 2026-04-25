import { performance } from "perf_hooks";
import { AgentContext, AgentResult } from "../types.js";

export type AgentExecutor = (agentName: string, ctx: AgentContext) => Promise<AgentResult>;

export interface BenchmarkVersion {
  id: string;
  agentName: string;
  query: string;
  metadata?: Record<string, unknown>;
}

export interface BenchmarkParams {
  name: string;
  versions: BenchmarkVersion[];
  runs: number;
  warmupRuns: number;
  qualityKeywords?: string[];
  expectedOutput?: string;
}

interface RunMetrics {
  durationMs: number;
  memoryDeltaKb: number;
  outputLength: number;
  success: boolean;
  output: string;
}

export interface VersionStats {
  id: string;
  agentName: string;
  query: string;
  runs: number;
  successRate: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  avgMemoryDeltaKb: number;
  avgOutputLength: number;
  estimatedTokensPerRun: number;
  consistencyScore: number;
  keywordHitRate?: number;
  similarityToExpected?: number;
}

export interface VersionDiff {
  baseline: string;
  target: string;
  speedDeltaPct: number;
  memoryDeltaPct: number;
  outputLengthDeltaPct: number;
  successRateDelta: number;
  qualityDeltaPct?: number;
  verdict: string;
}

export interface BenchmarkReport {
  name: string;
  timestamp: string;
  runsPerVersion: number;
  warmupRuns: number;
  versions: VersionStats[];
  diffs: VersionDiff[];
  summary: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter(Boolean));
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function computeConsistency(outputs: string[]): number {
  if (outputs.length < 2) return 1;
  let total = 0;
  let count = 0;
  for (let i = 0; i < outputs.length; i++) {
    for (let j = i + 1; j < outputs.length; j++) {
      total += jaccardSimilarity(outputs[i], outputs[j]);
      count++;
    }
  }
  return count === 0 ? 1 : total / count;
}

function computeKeywordHitRate(output: string, keywords: string[]): number {
  if (keywords.length === 0) return 1;
  const lower = output.toLowerCase();
  const hits = keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
  return hits / keywords.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function pctDelta(baseline: number, target: number): number {
  if (baseline === 0) return 0;
  return Math.round(((target - baseline) / Math.abs(baseline)) * 1000) / 10;
}

async function measureRun(
  execute: AgentExecutor,
  agentName: string,
  ctx: AgentContext
): Promise<RunMetrics> {
  const memBefore = process.memoryUsage().heapUsed;
  const start = performance.now();

  let result: AgentResult;
  try {
    result = await execute(agentName, ctx);
  } catch (err) {
    result = {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    durationMs: performance.now() - start,
    memoryDeltaKb: (process.memoryUsage().heapUsed - memBefore) / 1024,
    outputLength: result.message.length,
    success: result.success,
    output: result.message,
  };
}

function buildVerdict(
  targetId: string,
  speedDeltaPct: number,
  memoryDeltaPct: number,
  outputLengthDeltaPct: number,
  successRateDelta: number,
  qualityDeltaPct?: number
): string {
  const parts: string[] = [];

  if (Math.abs(speedDeltaPct) >= 1) {
    parts.push(`${Math.abs(speedDeltaPct)}% ${speedDeltaPct > 0 ? "slower" : "faster"}`);
  }
  if (Math.abs(memoryDeltaPct) >= 5) {
    parts.push(`${Math.abs(memoryDeltaPct)}% ${memoryDeltaPct > 0 ? "more memory" : "less memory"}`);
  }
  if (qualityDeltaPct !== undefined && Math.abs(qualityDeltaPct) >= 1) {
    parts.push(`${Math.abs(qualityDeltaPct)}% ${qualityDeltaPct > 0 ? "more accurate" : "less accurate"}`);
  } else if (Math.abs(outputLengthDeltaPct) >= 5) {
    parts.push(`${Math.abs(outputLengthDeltaPct)}% ${outputLengthDeltaPct > 0 ? "longer output" : "shorter output"}`);
  }
  if (Math.abs(successRateDelta) >= 1) {
    parts.push(`${Math.abs(successRateDelta)}pp ${successRateDelta > 0 ? "higher" : "lower"} success rate`);
  }

  return parts.length === 0
    ? `${targetId} is comparable to baseline`
    : `${targetId} is ${parts.join(", ")}`;
}

function buildSummary(versions: VersionStats[], diffs: VersionDiff[]): string {
  const lines = versions.map((v) => {
    const quality =
      v.keywordHitRate !== undefined
        ? ` | quality: ${(v.keywordHitRate * 100).toFixed(0)}%`
        : v.similarityToExpected !== undefined
          ? ` | similarity: ${(v.similarityToExpected * 100).toFixed(0)}%`
          : "";
    return (
      `${v.id} (${v.agentName}): avg ${v.avgDurationMs}ms, ` +
      `p95 ${v.p95DurationMs}ms, ${(v.successRate * 100).toFixed(0)}% success, ` +
      `~${v.estimatedTokensPerRun} tokens/run${quality}`
    );
  });

  for (const d of diffs) {
    lines.push(`Verdict: ${d.verdict}`);
  }

  return lines.join("\n");
}

export async function runBenchmark(
  execute: AgentExecutor,
  params: BenchmarkParams
): Promise<BenchmarkReport> {
  const { name, versions, runs, warmupRuns, qualityKeywords, expectedOutput } = params;

  const allStats: VersionStats[] = [];

  for (const version of versions) {
    const ctx: AgentContext = { query: version.query, metadata: version.metadata };

    for (let i = 0; i < warmupRuns; i++) {
      await measureRun(execute, version.agentName, ctx);
    }

    const metrics: RunMetrics[] = [];
    for (let i = 0; i < runs; i++) {
      metrics.push(await measureRun(execute, version.agentName, ctx));
    }

    const durations = metrics.map((m) => m.durationMs).sort((a, b) => a - b);
    const successfulOutputs = metrics.filter((m) => m.success).map((m) => m.output);
    const avgDuration = durations.reduce((s, v) => s + v, 0) / durations.length;
    const avgMemory = metrics.reduce((s, m) => s + m.memoryDeltaKb, 0) / metrics.length;
    const avgOutput = metrics.reduce((s, m) => s + m.outputLength, 0) / metrics.length;

    const stats: VersionStats = {
      id: version.id,
      agentName: version.agentName,
      query: version.query,
      runs: metrics.length,
      successRate: metrics.filter((m) => m.success).length / metrics.length,
      avgDurationMs: round2(avgDuration),
      p50DurationMs: round2(percentile(durations, 50)),
      p95DurationMs: round2(percentile(durations, 95)),
      avgMemoryDeltaKb: round2(avgMemory),
      avgOutputLength: Math.round(avgOutput),
      estimatedTokensPerRun: Math.round(avgOutput / 4),
      consistencyScore: successfulOutputs.length === 0 ? 0 : round3(computeConsistency(successfulOutputs)),
    };

    if (qualityKeywords && qualityKeywords.length > 0) {
      const rates = successfulOutputs.map((o) => computeKeywordHitRate(o, qualityKeywords));
      stats.keywordHitRate = rates.length > 0
        ? round3(rates.reduce((s, v) => s + v, 0) / rates.length)
        : 0;
    }

    if (expectedOutput) {
      const sims = successfulOutputs.map((o) => jaccardSimilarity(o, expectedOutput));
      stats.similarityToExpected = sims.length > 0
        ? round3(sims.reduce((s, v) => s + v, 0) / sims.length)
        : 0;
    }

    allStats.push(stats);
  }

  const diffs: VersionDiff[] = [];
  if (allStats.length >= 2) {
    const baseline = allStats[0];
    for (let i = 1; i < allStats.length; i++) {
      const target = allStats[i];
      const speedDeltaPct = pctDelta(baseline.avgDurationMs, target.avgDurationMs);
      const memoryDeltaPct = pctDelta(baseline.avgMemoryDeltaKb, target.avgMemoryDeltaKb);
      const outputLengthDeltaPct = pctDelta(baseline.avgOutputLength, target.avgOutputLength);
      const successRateDelta = round2((target.successRate - baseline.successRate) * 100);

      let qualityDeltaPct: number | undefined;
      if (baseline.keywordHitRate !== undefined && target.keywordHitRate !== undefined && baseline.keywordHitRate > 0) {
        qualityDeltaPct = pctDelta(baseline.keywordHitRate, target.keywordHitRate);
      } else if (baseline.similarityToExpected !== undefined && target.similarityToExpected !== undefined && baseline.similarityToExpected > 0) {
        qualityDeltaPct = pctDelta(baseline.similarityToExpected, target.similarityToExpected);
      }

      diffs.push({
        baseline: baseline.id,
        target: target.id,
        speedDeltaPct,
        memoryDeltaPct,
        outputLengthDeltaPct,
        successRateDelta,
        qualityDeltaPct,
        verdict: buildVerdict(target.id, speedDeltaPct, memoryDeltaPct, outputLengthDeltaPct, successRateDelta, qualityDeltaPct),
      });
    }
  }

  return {
    name,
    timestamp: new Date().toISOString(),
    runsPerVersion: runs,
    warmupRuns,
    versions: allStats,
    diffs,
    summary: buildSummary(allStats, diffs),
  };
}
