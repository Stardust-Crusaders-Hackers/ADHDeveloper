import fs from "fs";
import path from "path";
import { AgentContext, AgentDefinition, AgentResult } from "../types.js";
import { ensureTestPlaybook } from "../tools/testPlaybook.js";

type FailureKind =
  | "test-failure"
  | "type-error"
  | "module-resolution"
  | "missing-file"
  | "runtime-exception"
  | "build-error"
  | "terminal-error"
  | "unknown";

interface Evidence {
  headline: string;
  files: string[];
  commands: string[];
  hints: string[];
}

interface DebuggerReport {
  kind: FailureKind;
  confidence: "low" | "medium" | "high";
  evidence: Evidence;
  playbookPath?: string;
  playbookUpdated?: boolean;
  nextStep: string;
}

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const projectRoot = resolveProjectRoot(ctx.metadata?.projectRoot as string | undefined);
  const query = ctx.query ?? "";
  const evidence = collectEvidence(query, ctx.metadata);
  const kind = classifyFailure(query, evidence);
  const playbookNeeded = shouldRefreshPlaybook(query, ctx.metadata);

  const playbook = playbookNeeded ? ensureTestPlaybook(projectRoot) : undefined;
  const report = buildReport(kind, evidence, playbook?.playbookPath, playbook?.updated);

  return {
    success: true,
    message: report,
    data: {
      kind: kind.kind,
      confidence: kind.confidence,
      evidence,
      playbookPath: playbook?.playbookPath,
      playbookUpdated: playbook?.updated,
      nextStep: kind.nextStep,
    },
  };
}

function resolveProjectRoot(explicit?: string): string {
  if (explicit && fs.existsSync(explicit)) {
    return path.resolve(explicit);
  }
  return process.cwd();
}

function shouldRefreshPlaybook(query: string, metadata: Record<string, unknown> | undefined): boolean {
  if (metadata?.refreshTestPlaybook === false) return false;
  return /test|tests|spec|jest|vitest|mocha|playwright|cypress|failure|fail|error|bug|stack|trace/i.test(query);
}

function collectEvidence(query: string, metadata: Record<string, unknown> | undefined): Evidence {
  const fileHints = new Set<string>();
  const commandHints = new Set<string>();
  const hints = new Set<string>();

  const metadataFiles = metadata?.files as string[] | undefined;
  for (const file of metadataFiles ?? []) {
    fileHints.add(file);
  }

  for (const match of query.matchAll(/(?:^|[\s("'`])([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)(?::\d+)?(?::\d+)?/g)) {
    fileHints.add(match[1]);
  }

  for (const match of query.matchAll(/(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?([A-Za-z0-9:_-]+)/gi)) {
    commandHints.add(match[0].trim());
  }

  const headline = extractHeadline(query);
  const lower = query.toLowerCase();

  if (lower.includes("cannot find module")) hints.add("module resolution failure");
  if (lower.includes("enoent")) hints.add("missing file or path");
  if (lower.includes("typeerror")) hints.add("runtime type mismatch");
  if (lower.includes("assertionerror")) hints.add("assertion failure");
  if (lower.includes("failed")) hints.add("general failure marker");
  if (lower.includes("stack trace") || lower.includes("at ")) hints.add("stack trace present");

  return {
    headline,
    files: Array.from(fileHints),
    commands: Array.from(commandHints),
    hints: Array.from(hints),
  };
}

function extractHeadline(query: string): string {
  const lines = query
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headline = lines.find((line) =>
    /error|failed|exception|cannot|enoent|assertion|trace|stack/i.test(line)
  );

  return headline ?? lines[0] ?? "No explicit error headline detected.";
}

function classifyFailure(query: string, evidence: Evidence): DebuggerReport {
  const text = `${query}\n${evidence.headline}`.toLowerCase();
  const files = evidence.files;

  if (/cannot find module|module not found|import .* not found|resolve.*failed/.test(text)) {
    return {
      kind: "module-resolution",
      confidence: "high",
      evidence,
      nextStep: "Check import paths, package.json exports, and whether the referenced file actually exists.",
    };
  }

  if (/enoent|no such file or directory|missing file/.test(text)) {
    return {
      kind: "missing-file",
      confidence: "high",
      evidence,
      nextStep: "Verify the path in the failing command, then inspect the file or directory referenced in the error.",
    };
  }

  if (/typeerror|cannot read properties|undefined is not a function|is not iterable/.test(text)) {
    return {
      kind: "runtime-exception",
      confidence: "high",
      evidence,
      nextStep: "Inspect the first stack frame and the data shape entering the failing function.",
    };
  }

  if (/tsc|typescript|type '.*' is not assignable|property .* does not exist/.test(text)) {
    return {
      kind: "type-error",
      confidence: "high",
      evidence,
      nextStep: "Open the referenced TypeScript file and fix the narrowest type mismatch first.",
    };
  }

  if (/npm err!|pnpm|yarn error|bun error|failed to compile|build failed/.test(text)) {
    return {
      kind: "build-error",
      confidence: "medium",
      evidence,
      nextStep: "Re-run the exact build command, then inspect the first failing file or step before changing code.",
    };
  }

  if (evidence.commands.length > 0 || /test|spec|jest|vitest|mocha|playwright|cypress/.test(text)) {
    return {
      kind: "test-failure",
      confidence: "medium",
      evidence,
      nextStep: "Re-run the smallest failing test command, then isolate the first assertion or stack frame.",
    };
  }

  if (files.length > 0) {
    return {
      kind: "terminal-error",
      confidence: "low",
      evidence,
      nextStep: "Inspect the first referenced file and line before broadening the search.",
    };
  }

  return {
    kind: "unknown",
    confidence: "low",
    evidence,
    nextStep: "Start from the first error line, reproduce the command, and collect the smallest failing context.",
  };
}

function buildReport(kind: DebuggerReport, evidence: Evidence, playbookPath?: string, playbookUpdated?: boolean): string {
  const lines = [
    "# Debugger Report",
    "",
    `- Failure kind: \`${kind.kind}\` (${kind.confidence} confidence)`,
    `- Headline: ${evidence.headline}`,
    evidence.files.length > 0 ? `- File hints: ${evidence.files.map((file) => `\`${file}\``).join(", ")}` : "- File hints: none detected",
    evidence.commands.length > 0 ? `- Command hints: ${evidence.commands.map((cmd) => `\`${cmd}\``).join(", ")}` : "- Command hints: none detected",
    evidence.hints.length > 0 ? `- Signals: ${evidence.hints.join(", ")}` : "- Signals: none detected",
    "",
    "## Next Step",
    `- ${kind.nextStep}`,
  ];

  if (playbookPath) {
    lines.push("");
    lines.push("## Test Playbook");
    lines.push(`- ${playbookUpdated ? "Refreshed" : "Kept"} playbook at \`${path.normalize(playbookPath)}\`.`);
  }

  return lines.join("\n");
}

const debuggerAgent: AgentDefinition = {
  name: "debugger",
  description:
    "Especialista en depurar bugs, errores de compilacion, fallos de runtime y salidas de terminal. Analiza codigo, logs y stack traces; cuando hace falta, regenera el playbook de tests del proyecto.",
  keywords: [
    "debug",
    "debugger",
    "bug",
    "bugfix",
    "error",
    "exception",
    "stack",
    "trace",
    "terminal",
    "failure",
    "fail",
    "crash",
    "diagnose",
    "test",
    "tests",
    "spec",
    "compile",
    "build",
  ],
  handler,
};

export default debuggerAgent;
