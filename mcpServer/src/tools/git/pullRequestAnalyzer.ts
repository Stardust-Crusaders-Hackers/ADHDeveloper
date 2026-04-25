import { git } from "./gitExec.js";

export interface PRAnalysis {
  totalFiles: number;
  linesAdded: number;
  linesRemoved: number;
  decision: "approve" | "request_changes";
  risks: string[];
  codeSmells: string[];
  summary: string;
}

export function PullRequestAnalyzerTool(root: string, baseBranch: string, targetBranch: string): PRAnalysis {
  const diffStat = git(`diff --stat ${baseBranch}...${targetBranch}`, root);
  const diff = git(`diff ${baseBranch}...${targetBranch}`, root);
  const nameOnly = git(`diff --name-only ${baseBranch}...${targetBranch}`, root);
  const files = nameOnly ? nameOnly.split("\n").filter(Boolean) : [];

  const statMatch = diffStat.match(/(\d+) insertions?.*?(\d+) deletions?/);
  const linesAdded = statMatch ? parseInt(statMatch[1], 10) : 0;
  const linesRemoved = statMatch ? parseInt(statMatch[2], 10) : 0;

  const risks: string[] = [];
  const codeSmells: string[] = [];

  if (files.some(f => f.includes(".env"))) risks.push("Env file modified — check for leaked secrets");
  if (files.some(f => f.includes("migration"))) risks.push("DB migration included — verify rollback plan");
  if (files.some(f => f.includes("package-lock") || f.includes("yarn.lock") || f.includes("pnpm-lock")))
    risks.push("Lockfile changed — dependency update, verify compatibility");
  if (linesAdded + linesRemoved > 500) risks.push("Large PR (>500 lines) — consider splitting");
  if (
    files.filter(f => f.endsWith(".test.ts") || f.endsWith(".spec.ts") || f.endsWith(".test.js")).length === 0 &&
    linesAdded > 100
  ) risks.push("No test files added/modified for significant change");

  if (diff.includes("console.log")) codeSmells.push("console.log statements present — remove before merge");
  if (diff.includes("TODO") || diff.includes("FIXME")) codeSmells.push("TODO/FIXME comments — intentional?");
  if (diff.includes("debugger")) codeSmells.push("debugger statement found");
  if (diff.match(/password\s*=\s*['"][^'"]+['"]/i)) risks.push("Potential hardcoded password detected");
  if (diff.match(/api[_-]?key\s*=\s*['"][^'"]+['"]/i)) risks.push("Potential hardcoded API key detected");

  const decision: PRAnalysis["decision"] =
    risks.some(r => r.includes("secret") || r.includes("password") || r.includes("API key")) ? "request_changes"
    : risks.length >= 3 ? "request_changes"
    : "approve";

  return {
    totalFiles: files.length,
    linesAdded,
    linesRemoved,
    decision,
    risks,
    codeSmells,
    summary: `${files.length} files | +${linesAdded}/-${linesRemoved} | decision: ${decision}`,
  };
}
