import { git } from "./gitExec.js";

export interface DiffResult {
  changedFiles: string[];
  insertions: number;
  deletions: number;
  conflictMarkers: string[];
  riskLevel: "low" | "medium" | "high";
  summary: string;
}

export function GitDiffTool(root: string, baseBranch: string, targetBranch: string): DiffResult {
  const stat = git(`diff --stat ${baseBranch}...${targetBranch}`, root);
  const nameOnly = git(`diff --name-only ${baseBranch}...${targetBranch}`, root);
  const changedFiles = nameOnly ? nameOnly.split("\n").filter(Boolean) : [];

  const statMatch = stat.match(/(\d+) insertions?.*?(\d+) deletions?/);
  const insertions = statMatch ? parseInt(statMatch[1], 10) : 0;
  const deletions = statMatch ? parseInt(statMatch[2], 10) : 0;

  const conflictFiles = git("diff --check", root);
  const conflictMarkers = conflictFiles
    ? conflictFiles.split("\n").filter(l => l.includes("leftover conflict marker"))
    : [];

  const coreFiles = changedFiles.filter(f =>
    f.includes("package.json") || f.includes("tsconfig") || f.includes("docker") ||
    f.includes(".env") || f.includes("schema") || f.includes("migration")
  );
  const riskLevel: DiffResult["riskLevel"] =
    coreFiles.length > 0 || changedFiles.length > 20 ? "high"
    : changedFiles.length > 10 ? "medium"
    : "low";

  return {
    changedFiles,
    insertions,
    deletions,
    conflictMarkers,
    riskLevel,
    summary: `${changedFiles.length} files changed (+${insertions}/-${deletions}) | risk: ${riskLevel}${coreFiles.length > 0 ? ` | core files: ${coreFiles.join(", ")}` : ""}`,
  };
}
