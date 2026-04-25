import { git } from "./gitExec.js";

type MergeStrategy = "merge" | "rebase" | "squash";

export interface StrategyDecision {
  strategy: MergeStrategy;
  reasoning: string;
  gitCommands: string[];
}

export function MergeStrategyTool(root: string, sourceBranch: string, targetBranch: string): StrategyDecision {
  const commits = git(`log --oneline ${targetBranch}..${sourceBranch}`, root);
  const commitLines = commits ? commits.split("\n").filter(Boolean) : [];
  const commitCount = commitLines.length;

  const nameOnly = git(`diff --name-only ${targetBranch}...${sourceBranch}`, root);
  const changedFiles = nameOnly ? nameOnly.split("\n").filter(Boolean) : [];

  const isFeatureBranch = sourceBranch.startsWith("feat/") || sourceBranch.startsWith("feature/");
  const isHotfix = sourceBranch.startsWith("hotfix/") || sourceBranch.startsWith("fix/");

  let strategy: MergeStrategy;
  let reasoning: string;

  if (commitCount === 1) {
    strategy = "merge";
    reasoning = "Single commit — standard merge preserves context";
  } else if (isHotfix && commitCount <= 3) {
    strategy = "rebase";
    reasoning = "Hotfix with few commits — rebase for linear history";
  } else if (commitCount > 10 || changedFiles.length > 30) {
    strategy = "squash";
    reasoning = `${commitCount} commits, ${changedFiles.length} files — squash for clean history`;
  } else if (isFeatureBranch) {
    strategy = "squash";
    reasoning = `Feature branch (${commitCount} commits) — squash keeps main history clean`;
  } else {
    strategy = "merge";
    reasoning = `${commitCount} commits with logical separation — merge preserves individual history`;
  }

  const commands: Record<MergeStrategy, string[]> = {
    merge: [
      `git checkout ${targetBranch}`,
      `git merge --no-ff ${sourceBranch}`,
      `git push origin ${targetBranch}`,
    ],
    rebase: [
      `git checkout ${sourceBranch}`,
      `git rebase ${targetBranch}`,
      `git checkout ${targetBranch}`,
      `git merge --ff-only ${sourceBranch}`,
      `git push origin ${targetBranch}`,
    ],
    squash: [
      `git checkout ${targetBranch}`,
      `git merge --squash ${sourceBranch}`,
      `git commit -m "feat: merge ${sourceBranch}"`,
      `git push origin ${targetBranch}`,
    ],
  };

  return { strategy, reasoning, gitCommands: commands[strategy] };
}
