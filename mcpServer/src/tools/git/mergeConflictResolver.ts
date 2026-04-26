import { git } from "./gitExec.js";

export interface ConflictResolution {
  file: string;
  conflictCount: number;
  canAutoResolve: boolean;
  resolution: "ours" | "theirs" | "manual-required";
  explanation: string;
}

export interface ConflictResolverResult {
  conflicts: ConflictResolution[];
  canProceed: boolean;
  commands: string[];
}

export function MergeConflictResolverTool(root: string): ConflictResolverResult {
  const conflictOutput = git("diff --name-only --diff-filter=U", root);
  const conflictFiles = conflictOutput ? conflictOutput.split("\n").filter(Boolean) : [];

  if (conflictFiles.length === 0) {
    return { conflicts: [], canProceed: true, commands: [] };
  }

  const conflicts: ConflictResolution[] = conflictFiles.map(file => {
    const conflictCount = (git(`diff --check -- ${file}`, root).match(/conflict marker/gi) ?? []).length;
    const isBinary = git(`diff --numstat HEAD -- ${file}`, root).startsWith("-");

    return {
      file,
      conflictCount: conflictCount || 1,
      canAutoResolve: false,
      resolution: "manual-required",
      explanation: isBinary
        ? "Binary file — manual merge required"
        : `Text conflict in ${file} — resolve by choosing ours/theirs/manual edit`,
    };
  });

  const commands = [
    "# View conflicts:",
    "git status",
    "git diff --diff-filter=U",
    "",
    "# For each file, resolve then:",
    "git add <resolved-file>",
    "git merge --continue",
    "",
    "# Or abort merge entirely:",
    "git merge --abort",
  ];

  const allManual = conflicts.every(c => c.resolution === "manual-required");
  return { conflicts, canProceed: !allManual, commands };
}
