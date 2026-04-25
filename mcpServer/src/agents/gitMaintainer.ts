import { AgentDefinition, AgentContext, AgentResult } from "../types.js";
import { GitDiffTool } from "../tools/git/gitDiff.js";
import { MergeConflictResolverTool } from "../tools/git/mergeConflictResolver.js";
import { PullRequestAnalyzerTool } from "../tools/git/pullRequestAnalyzer.js";
import { MergeStrategyTool } from "../tools/git/mergeStrategy.js";
import { RepoIntegrityTool } from "../tools/git/repoIntegrity.js";

type OperationType = "diff" | "conflict" | "pr-review" | "merge-strategy" | "integrity" | "full";

function detectOperation(q: string): OperationType {
  const lq = q.toLowerCase();
  if (lq.includes("conflict")) return "conflict";
  if (lq.includes("pr") || lq.includes("pull request") || lq.includes("review")) return "pr-review";
  if (lq.includes("strategy") || lq.includes("rebase") || lq.includes("squash")) return "merge-strategy";
  if (lq.includes("integrity") || lq.includes("health") || lq.includes("validate") || lq.includes("check")) return "integrity";
  if (lq.includes("diff") || lq.includes("changes") || lq.includes("status")) return "diff";
  return "full";
}

function parseBranches(ctx: AgentContext): { base: string; target: string } {
  const meta = ctx.metadata ?? {};
  const q = ctx.query;
  const base = (meta.baseBranch as string | undefined) ?? q.match(/(?:base|from|main|origin)[:\s]+(\S+)/i)?.[1] ?? "main";
  const target = (meta.targetBranch as string | undefined) ?? q.match(/(?:target|into|branch)[:\s]+(\S+)/i)?.[1] ?? "HEAD";
  return { base, target };
}

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const root = (ctx.metadata?.projectRoot as string | undefined) ?? process.cwd();
  const op = (ctx.metadata?.operation as OperationType | undefined) ?? detectOperation(ctx.query);
  const { base, target } = parseBranches(ctx);

  const sections: string[] = [];
  const usedTools: string[] = [];
  let overallHealthy = true;

  // A. GitDiffTool
  if (op !== "integrity") {
    usedTools.push("GitDiffTool");
    const diff = GitDiffTool(root, base, target);
    sections.push(
      `## GitDiffTool\n${diff.summary}\n` +
      (diff.changedFiles.length > 0
        ? `Files:\n${diff.changedFiles.slice(0, 20).map(f => `  • ${f}`).join("\n")}${diff.changedFiles.length > 20 ? `\n  …and ${diff.changedFiles.length - 20} more` : ""}`
        : "No file changes detected.")
    );
    if (diff.conflictMarkers.length > 0) {
      sections.push(`⚠ Conflict markers found:\n${diff.conflictMarkers.map(m => `  ${m}`).join("\n")}`);
      overallHealthy = false;
    }
  }

  // B. MergeConflictResolverTool
  if (op === "conflict" || op === "full") {
    usedTools.push("MergeConflictResolverTool");
    const result = MergeConflictResolverTool(root);
    if (result.conflicts.length > 0) {
      overallHealthy = false;
      const conflictReport = result.conflicts.map(c =>
        `  • ${c.file} (${c.conflictCount} conflict${c.conflictCount > 1 ? "s" : ""}) — ${c.explanation}`
      ).join("\n");
      sections.push(`## MergeConflictResolverTool\n${result.conflicts.length} file(s) in conflict:\n${conflictReport}\n\nResolution commands:\n${result.commands.join("\n")}`);
    } else if (op === "conflict") {
      sections.push("## MergeConflictResolverTool\nNo active conflicts found.");
    }
  }

  // C. PullRequestAnalyzerTool
  if (op === "pr-review" || op === "full") {
    usedTools.push("PullRequestAnalyzerTool");
    const pr = PullRequestAnalyzerTool(root, base, target);
    const riskList = pr.risks.length > 0 ? `\nRisks:\n${pr.risks.map(r => `  ⚠ ${r}`).join("\n")}` : "";
    const smellList = pr.codeSmells.length > 0 ? `\nCode smells:\n${pr.codeSmells.map(s => `  • ${s}`).join("\n")}` : "";
    sections.push(`## PullRequestAnalyzerTool\n${pr.summary}${riskList}${smellList}`);
    if (pr.decision === "request_changes") overallHealthy = false;
  }

  // D. MergeStrategyTool
  if (op === "merge-strategy" || op === "full") {
    usedTools.push("MergeStrategyTool");
    const strat = MergeStrategyTool(root, target, base);
    sections.push(`## MergeStrategyTool\nStrategy: **${strat.strategy.toUpperCase()}**\nReason: ${strat.reasoning}\n\nCommands:\n${strat.gitCommands.map(c => `  $ ${c}`).join("\n")}`);
  }

  // E. RepoIntegrityTool
  if (op === "full" || op === "integrity" || op === "conflict") {
    usedTools.push("RepoIntegrityTool");
    const integrity = RepoIntegrityTool(root);
    if (!integrity.healthy) overallHealthy = false;
    const issueList = integrity.issues.length > 0 ? `\nIssues:\n${integrity.issues.map(i => `  ✗ ${i}`).join("\n")}` : "";
    const warnList = integrity.warnings.length > 0 ? `\nWarnings:\n${integrity.warnings.map(w => `  ⚠ ${w}`).join("\n")}` : "";
    sections.push(`## RepoIntegrityTool\nStatus: ${integrity.healthy ? "HEALTHY" : "ISSUES FOUND"}\nBranch: ${integrity.branchStatus}\nRemote: ${integrity.remoteSync}${issueList}${warnList}`);
  }

  const toolsUsed = `Tools: ${usedTools.join(" → ")}`;
  const status = overallHealthy ? "✓ Repository healthy" : "⚠ Action required";
  const header = `# Git Maintainer Report\n${status} | ${toolsUsed}\nBranches: ${base} ← ${target}\n\n---`;

  return {
    success: true,
    message: `${header}\n\n${sections.join("\n\n---\n\n")}`,
    data: { operation: op, baseBranch: base, targetBranch: target, toolsUsed, healthy: overallHealthy },
  };
}

const gitMaintainerAgent: AgentDefinition = {
  name: "gitMaintainer",
  description:
    "Autonomous Git repository maintainer. Detects operation type (conflict resolution, PR review, merge strategy, integrity check) and executes the full analysis pipeline without requiring user intervention. Uses GitDiffTool, MergeConflictResolverTool, PullRequestAnalyzerTool, MergeStrategyTool, and RepoIntegrityTool. Only escalates on data-loss risk or unresolvable ambiguity.",
  keywords: [
    "git", "merge", "conflict", "rebase", "squash", "pull request", "pr", "review",
    "branch", "commit", "diff", "repository", "integrity", "stash", "cherry-pick",
    "merge strategy", "git health", "git maintainer", "repo check", "git audit",
    "merge conflict", "pr review", "code review", "git history",
  ],
  handler,
};

export default gitMaintainerAgent;
