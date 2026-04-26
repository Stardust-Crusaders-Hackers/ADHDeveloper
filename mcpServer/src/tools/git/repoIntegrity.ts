import fs from "fs";
import path from "path";
import { git } from "./gitExec.js";

export interface IntegrityReport {
  healthy: boolean;
  issues: string[];
  warnings: string[];
  branchStatus: string;
  remoteSync: string;
}

export function RepoIntegrityTool(root: string): IntegrityReport {
  const issues: string[] = [];
  const warnings: string[] = [];

  const conflictFiles = git("diff --name-only --diff-filter=U", root);
  if (conflictFiles) issues.push(`Unresolved conflicts in: ${conflictFiles.split("\n").filter(Boolean).join(", ")}`);

  const headRef = git("symbolic-ref --short HEAD", root);
  const isDetached = headRef.includes("HEAD detached") || headRef === "";
  if (isDetached) issues.push("Detached HEAD state — not on any branch");
  const branchStatus = isDetached ? "DETACHED HEAD" : `on branch: ${headRef}`;

  const stash = git("stash list", root);
  if (stash) warnings.push(`${stash.split("\n").filter(Boolean).length} stash(es) pending`);

  git("fetch --dry-run", root);
  const behind = git("rev-list --count HEAD..@{u}", root);
  const ahead = git("rev-list --count @{u}..HEAD", root);
  let remoteSync = "in sync";
  if (behind && parseInt(behind, 10) > 0) {
    warnings.push(`${behind} commit(s) behind remote`);
    remoteSync = `behind by ${behind}`;
  }
  if (ahead && parseInt(ahead, 10) > 0) {
    remoteSync += remoteSync === "in sync" ? `ahead by ${ahead}` : `, ahead by ${ahead}`;
  }

  const untrackedLarge = git("ls-files --others --exclude-standard", root)
    .split("\n")
    .filter(Boolean)
    .filter(f => {
      try { return fs.statSync(path.join(root, f)).size > 5_000_000; } catch { return false; }
    });
  if (untrackedLarge.length > 0) warnings.push(`Large untracked files: ${untrackedLarge.join(", ")}`);

  const hasGitignore = git("ls-files .gitignore", root);
  if (!hasGitignore) warnings.push("No .gitignore tracked — repo may commit unwanted files");

  const conflictMarkersRaw = git("grep -l '<<<<<<< '", root);
  if (conflictMarkersRaw) issues.push(`Conflict markers in: ${conflictMarkersRaw.split("\n").filter(Boolean).join(", ")}`);

  return {
    healthy: issues.length === 0,
    issues,
    warnings,
    branchStatus,
    remoteSync,
  };
}
