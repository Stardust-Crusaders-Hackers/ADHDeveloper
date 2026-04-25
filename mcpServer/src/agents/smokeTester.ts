import fs from "fs";
import path from "path";
import os from "os";
import { AgentDefinition, AgentContext, AgentResult } from "../types.js";
import { readFile, getCacheInfo, invalidate, clearCache } from "../tools/contextCache.js";
import { loadRules, addRule, removeRule } from "../tools/rules.js";

// ─── Test runner ──────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

type TestFn = () => void | Promise<void>;

async function run(name: string, fn: TestFn): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (err) {
    return {
      name,
      passed: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

// ─── Test suites ──────────────────────────────────────────────────────────────

async function suiteContextCache(): Promise<TestResult[]> {
  const tmpFile = path.join(os.tmpdir(), `smoke-cache-${Date.now()}.txt`);
  const content = "smoke test content";

  try {
    fs.writeFileSync(tmpFile, content, "utf-8");

    return await Promise.all([
      run("cache:disk-read", () => {
        const r = readFile(tmpFile);
        assert(r.source === "disk", `expected disk, got ${r.source}`);
        assert(r.content === content, "content mismatch");
      }),

      run("cache:hit", () => {
        const r = readFile(tmpFile);
        assert(r.source === "cache", `expected cache, got ${r.source}`);
        assert(r.hits >= 1, "hit count should be >= 1");
      }),

      run("cache:info", () => {
        const info = getCacheInfo();
        assert(info.totalFiles >= 1, "cache should have at least 1 entry");
        const entry = info.entries.find((e) => e.filePath === path.resolve(tmpFile));
        assert(!!entry, "temp file not found in cache entries");
      }),

      run("cache:invalidate", () => {
        const removed = invalidate(tmpFile);
        assert(removed, "invalidate should return true for known file");
        const r = readFile(tmpFile);
        assert(r.source === "disk", "after invalidate should re-read from disk");
      }),

      run("cache:clear", () => {
        const before = getCacheInfo().totalFiles;
        const count = clearCache();
        assert(count === before, `clear returned ${count}, expected ${before}`);
        assert(getCacheInfo().totalFiles === 0, "cache should be empty after clear");
      }),
    ]);
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

async function suiteRules(workspaceRoot: string): Promise<TestResult[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-rules-"));

  try {
    return [
      await run("rules:load-empty", () => {
        const rules = loadRules(tmpDir);
        assert(Array.isArray(rules), "loadRules should return array");
        assert(rules.length === 0, "fresh dir should have no rules");
      }),

      await run("rules:add", () => {
        const rules = addRule(tmpDir, "Ship fast, fix later");
        assert(rules.length === 1, "should have 1 rule after add");
        assert(rules[0] === "Ship fast, fix later", "rule content mismatch");
      }),

      await run("rules:load-cached", () => {
        const rules = loadRules(tmpDir);
        assert(rules.length === 1, "should load 1 rule from cache");
      }),

      await run("rules:add-second", () => {
        addRule(tmpDir, "No abstractions");
        const rules = loadRules(tmpDir);
        assert(rules.length === 2, "should have 2 rules");
      }),

      await run("rules:remove", () => {
        const { rules, removed } = removeRule(tmpDir, 1);
        assert(removed === "Ship fast, fix later", `removed wrong rule: ${removed}`);
        assert(rules.length === 1, "should have 1 rule after remove");
      }),

      await run("rules:remove-oob", () => {
        const { removed } = removeRule(tmpDir, 99);
        assert(removed === null, "out-of-bounds remove should return null");
      }),

      await run("rules:persisted", () => {
        const rulesFilePath = path.join(tmpDir, ".hackathon-rules.md");
        assert(fs.existsSync(rulesFilePath), ".hackathon-rules.md should exist on disk");
        const raw = fs.readFileSync(rulesFilePath, "utf-8");
        assert(raw.startsWith("- "), "rules file should use markdown list format");
      }),
    ];
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function suiteFileSystem(projectRoot: string): Promise<TestResult[]> {
  const requiredPaths = [
    ["fs:agents-dir", path.join(projectRoot, "src", "agents")],
    ["fs:tools-dir", path.join(projectRoot, "src", "tools")],
    ["fs:registry-dir", path.join(projectRoot, "src", "registry")],
    ["fs:orchestrator-dir", path.join(projectRoot, "src", "orchestrator")],
    ["fs:types", path.join(projectRoot, "src", "types.ts")],
    ["fs:index", path.join(projectRoot, "src", "index.ts")],
    ["fs:package-json", path.join(projectRoot, "package.json")],
    ["fs:tsconfig", path.join(projectRoot, "tsconfig.json")],
    ["fs:context-cache-tool", path.join(projectRoot, "src", "tools", "contextCache.ts")],
    ["fs:rules-tool", path.join(projectRoot, "src", "tools", "rules.ts")],
    ["fs:documenter-agent", path.join(projectRoot, "src", "agents", "documenter.ts")],
  ] as const;

  return Promise.all(
    requiredPaths.map(([name, p]) =>
      run(name, () => assert(fs.existsSync(p), `Missing: ${p}`))
    )
  );
}

// ─── Report formatter ─────────────────────────────────────────────────────────

function formatReport(results: TestResult[], durationMs: number): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  const lines: string[] = [
    "SMOKE TEST REPORT",
    "─".repeat(40),
  ];

  for (const r of results) {
    const icon = r.passed ? "✓" : "✗";
    const time = `${r.durationMs}ms`;
    lines.push(`${icon} ${r.name.padEnd(32)} ${time}`);
    if (!r.passed && r.error) {
      lines.push(`    └ ${r.error}`);
    }
  }

  lines.push("─".repeat(40));
  lines.push(`${passed}/${results.length} passed  |  ${durationMs}ms total`);
  if (failed > 0) lines.push(`FAILED: ${failed} test(s)`);

  return lines.join("\n");
}

// ─── Agent handler ────────────────────────────────────────────────────────────

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const projectRoot = (ctx.metadata?.projectRoot as string | undefined) ?? process.cwd();
  const suites = (ctx.metadata?.suites as string[] | undefined) ?? ["cache", "rules", "fs"];

  const start = Date.now();
  const allResults: TestResult[] = [];

  if (suites.includes("cache")) {
    allResults.push(...(await suiteContextCache()));
  }
  if (suites.includes("rules")) {
    allResults.push(...(await suiteRules(projectRoot)));
  }
  if (suites.includes("fs")) {
    allResults.push(...(await suiteFileSystem(projectRoot)));
  }

  const totalMs = Date.now() - start;
  const report = formatReport(allResults, totalMs);
  const failed = allResults.filter((r) => !r.passed);

  return {
    success: failed.length === 0,
    message: report,
    data: {
      passed: allResults.filter((r) => r.passed).length,
      failed: failed.length,
      total: allResults.length,
      failures: failed.map((r) => ({ name: r.name, error: r.error })),
    },
  };
}

const smokeTesterAgent: AgentDefinition = {
  name: "smoke-tester",
  description:
    "Smoke tests core system functionality: context cache (read/hit/invalidate/clear), rules (add/load/remove/persist), and file system structure. Fast, isolated, no side effects on production state.",
  keywords: [
    "smoke", "test", "verify", "check", "health", "sanity",
    "cache", "rules", "working", "broken", "debug", "diagnose",
  ],
  handler,
};

export default smokeTesterAgent;
