import fs from "fs";
import path from "path";

const PLAYBOOK_FILENAME = "TESTS.md";
const GUIDE_FILENAMES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md"] as const;
const MARKER_START = "<!-- debugger-test-playbook:start -->";
const MARKER_END = "<!-- debugger-test-playbook:end -->";
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".git", ".idea", ".cache"]);

type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "unknown";

export interface TestScriptInfo {
  name: string;
  command: string;
}

export interface TestPlaybookAnalysis {
  workspaceRoot: string;
  packageRoot: string;
  packageManager: PackageManager;
  packageJsonPath?: string;
  testScripts: TestScriptInfo[];
  buildScripts: TestScriptInfo[];
  testDirs: string[];
  testFiles: string[];
  ciFiles: string[];
  harnesses: string[];
  notes: string[];
}

export interface TestPlaybookResult {
  created: boolean;
  updated: boolean;
  playbookPath: string;
  guideFiles: string[];
  analysis: TestPlaybookAnalysis;
  content: string;
}

export function ensureTestPlaybook(projectPath?: string): TestPlaybookResult {
  const startRoot = path.resolve(projectPath ?? process.cwd());
  const repositoryRoot = resolveRepositoryRoot(startRoot);
  const packageRoot = resolvePackageRoot(startRoot);
  const analysis = analyzeTestStructure(repositoryRoot, packageRoot);
  const content = renderTestPlaybook(analysis);
  const playbookPath = path.join(packageRoot, PLAYBOOK_FILENAME);

  const existing = fs.existsSync(playbookPath) ? fs.readFileSync(playbookPath, "utf-8") : "";
  const created = !fs.existsSync(playbookPath);
  const updated = existing !== content;

  if (updated) {
    fs.mkdirSync(path.dirname(playbookPath), { recursive: true });
    fs.writeFileSync(playbookPath, content, "utf-8");
  }

  const guideFiles = syncGuideFiles(repositoryRoot, path.relative(repositoryRoot, playbookPath));

  return {
    created,
    updated,
    playbookPath,
    guideFiles,
    analysis,
    content,
  };
}

export function analyzeTestStructure(workspaceRoot: string, packageRoot = resolvePackageRoot(workspaceRoot)): TestPlaybookAnalysis {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = readJson(packageJsonPath);
  const packageManager = detectPackageManager(workspaceRoot, packageRoot);
  const scripts = packageJson?.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts as Record<string, unknown> : {};

  const testScripts = sortScripts(
    Object.entries(scripts)
      .filter(([name, command]) => isTestScriptName(name) && typeof command === "string")
      .map(([name, command]) => ({ name, command: String(command) }))
  );

  const buildScripts = sortScripts(
    Object.entries(scripts)
      .filter(([name, command]) => isBuildOrTypecheckScriptName(name) && typeof command === "string")
      .map(([name, command]) => ({ name, command: String(command) }))
  );

  const testDirs = collectTestDirectories(packageRoot);
  const testFiles = collectTestFiles(packageRoot);
  const ciFiles = collectCIFiles(workspaceRoot, packageRoot);
  const harnesses = collectHarnesses(packageRoot);
  const notes = buildNotes({
    packageRoot,
    packageManager,
    testScripts,
    buildScripts,
    testDirs,
    testFiles,
    ciFiles,
    harnesses,
  });

  return {
    workspaceRoot,
    packageRoot,
    packageManager,
    packageJsonPath: fs.existsSync(packageJsonPath) ? packageJsonPath : undefined,
    testScripts,
    buildScripts,
    testDirs,
    testFiles,
    ciFiles,
    harnesses,
    notes,
  };
}

export function renderTestPlaybook(analysis: TestPlaybookAnalysis): string {
  const lines: string[] = [];
  lines.push("# Test Playbook");
  lines.push("");
  lines.push("## Scope");
  lines.push(`- Workspace root: \`${toPosix(analysis.workspaceRoot)}\``);
  lines.push(`- Package root: \`${toPosix(analysis.packageRoot)}\``);
  lines.push(`- Package manager: \`${analysis.packageManager}\``);
  lines.push("");

  lines.push("## Detected Structure");
  lines.push(...formatListItem("Test scripts", analysis.testScripts.map((s) => `\`${s.name}\`: \`${s.command}\``)));
  lines.push(...formatListItem("Build/typecheck scripts", analysis.buildScripts.map((s) => `\`${s.name}\`: \`${s.command}\``)));
  lines.push(...formatListItem("Test directories", analysis.testDirs.map((dir) => `\`${dir}\``)));
  lines.push(...formatListItem("Test/spec files", analysis.testFiles.map((file) => `\`${file}\``)));
  lines.push(...formatListItem("CI files", analysis.ciFiles.map((file) => `\`${file}\``)));
  lines.push(...formatListItem("Harnesses", analysis.harnesses.map((item) => `\`${item}\``)));
  lines.push("");

  lines.push("## Standard Way To Run Checks");
  if (analysis.testScripts.length > 0) {
    for (const script of analysis.testScripts) {
      lines.push(`- \`${script.command}\``);
    }
  } else {
    lines.push("- No dedicated test script detected in package.json.");
  }

  if (analysis.buildScripts.length > 0) {
    for (const script of analysis.buildScripts) {
      lines.push(`- \`${script.command}\``);
    }
  }

  if (analysis.harnesses.length > 0) {
    lines.push("- For repo health checks, use the `smoke-tester` agent via `execute_agent` and keep the suites list focused on the failing area.");
  }

  lines.push("");
  lines.push("## Debugger Workflow");
  lines.push("1. Reproduce the exact terminal command or agent call that failed.");
  lines.push("2. Read the first stack frame or error line before changing code.");
  lines.push("3. Prefer the smallest failing test or smoke suite before broad reruns.");
  lines.push("4. Regenerate this playbook after adding a new test runner, framework, or convention.");
  lines.push("5. Keep `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` pointed at this file.");
  lines.push("");

  lines.push("## Notes");
  for (const note of analysis.notes) {
    lines.push(`- ${note}`);
  }

  lines.push("");
  lines.push(`${MARKER_START}`);
  lines.push("This file is generated by the debugger test-playbook tool.");
  lines.push(`${MARKER_END}`);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function resolveRepositoryRoot(startRoot: string): string {
  let current = startRoot;
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startRoot;
    }
    current = parent;
  }
}

function resolvePackageRoot(startRoot: string): string {
  if (fs.existsSync(path.join(startRoot, "package.json"))) {
    return startRoot;
  }

  const mcpServerRoot = path.join(startRoot, "mcpServer");
  if (fs.existsSync(path.join(mcpServerRoot, "package.json"))) {
    return mcpServerRoot;
  }

  return startRoot;
}

function detectPackageManager(repositoryRoot: string, packageRoot: string): PackageManager {
  if (fs.existsSync(path.join(packageRoot, "pnpm-lock.yaml")) || fs.existsSync(path.join(repositoryRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(packageRoot, "yarn.lock")) || fs.existsSync(path.join(repositoryRoot, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(packageRoot, "bun.lockb")) || fs.existsSync(path.join(repositoryRoot, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(packageRoot, "package-lock.json")) || fs.existsSync(path.join(repositoryRoot, "package-lock.json"))) return "npm";
  return "unknown";
}

function readJson(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function isTestScriptName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === "test" ||
    normalized.startsWith("test:") ||
    normalized.includes("vitest") ||
    normalized.includes("jest") ||
    normalized.includes("mocha") ||
    normalized.includes("ava") ||
    normalized.includes("tap") ||
    normalized.includes("playwright") ||
    normalized.includes("cypress") ||
    normalized.includes("spec")
  );
}

function isBuildOrTypecheckScriptName(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.includes("build") || normalized.includes("typecheck") || normalized.includes("type-check") || normalized.includes("check");
}

function sortScripts(scripts: TestScriptInfo[]): TestScriptInfo[] {
  return [...scripts].sort((a, b) => a.name.localeCompare(b.name));
}

function collectTestDirectories(root: string): string[] {
  const matches = new Set<string>();
  walk(root, 0, (currentPath, dirents) => {
    const relDir = path.relative(root, currentPath);
    const normalizedDir = toPosix(relDir || ".");
    if (dirents.some((entry) => entry.isDirectory() && isTestDirectoryName(entry.name))) {
      for (const entry of dirents) {
        if (entry.isDirectory() && isTestDirectoryName(entry.name)) {
          matches.add(path.posix.join(normalizedDir, entry.name).replace(/^\.\//, ""));
        }
      }
    }
  });
  return Array.from(matches).filter(Boolean).sort();
}

function collectTestFiles(root: string): string[] {
  const matches = new Set<string>();
  walk(root, 0, (currentPath, dirents) => {
    for (const entry of dirents) {
      if (!entry.isFile()) continue;
      if (!isTestFileName(entry.name)) continue;
      matches.add(toPosix(path.relative(root, path.join(currentPath, entry.name))));
    }
  });
  return Array.from(matches).sort();
}

function collectCIFiles(workspaceRoot: string, packageRoot: string): string[] {
  const matches = new Set<string>();
  const githubWorkflows = path.join(workspaceRoot, ".github", "workflows");
  if (fs.existsSync(githubWorkflows)) {
    for (const entry of fs.readdirSync(githubWorkflows, { withFileTypes: true })) {
      if (entry.isFile() && /\.(ya?ml)$/i.test(entry.name)) {
        matches.add(toPosix(path.relative(workspaceRoot, path.join(githubWorkflows, entry.name))));
      }
    }
  }

  for (const candidate of [".gitlab-ci.yml", "azure-pipelines.yml", "Jenkinsfile", "circle.yml"]) {
    if (fs.existsSync(path.join(workspaceRoot, candidate))) {
      matches.add(candidate);
    }
    if (fs.existsSync(path.join(packageRoot, candidate))) {
      matches.add(toPosix(path.relative(workspaceRoot, path.join(packageRoot, candidate))));
    }
  }

  return Array.from(matches).sort();
}

function collectHarnesses(packageRoot: string): string[] {
  const harnesses: string[] = [];
  const smokeTesterPath = path.join(packageRoot, "src", "agents", "smokeTester.ts");
  if (fs.existsSync(smokeTesterPath)) {
    harnesses.push("smoke-tester agent via execute_agent");
  }
  return harnesses;
}

function buildNotes(input: {
  packageRoot: string;
  packageManager: PackageManager;
  testScripts: TestScriptInfo[];
  buildScripts: TestScriptInfo[];
  testDirs: string[];
  testFiles: string[];
  ciFiles: string[];
  harnesses: string[];
}): string[] {
  const notes: string[] = [];
  if (input.packageManager === "unknown") {
    notes.push("No lockfile detected; default package manager is unknown.");
  } else {
    notes.push(`Detected package manager from lockfile: ${input.packageManager}.`);
  }

  if (input.testScripts.length === 0) {
    notes.push("No package.json test script detected.");
  }

  if (input.testDirs.length === 0 && input.testFiles.length === 0) {
    notes.push("No conventional test directories or spec files were detected.");
  }

  if (input.harnesses.length > 0) {
    notes.push("This repo also exposes an agent-based smoke test path for fast structural validation.");
  }

  if (input.ciFiles.length === 0) {
    notes.push("No CI workflow file was detected under .github/workflows or the common single-file CI locations.");
  }

  if (input.buildScripts.length > 0) {
    notes.push("Typecheck/build commands are the closest fast-fail checks when a dedicated test runner is missing.");
  }

  return notes;
}

function isTestDirectoryName(name: string): boolean {
  const normalized = name.toLowerCase();
  return ["test", "tests", "__tests__", "spec", "specs", "__specs__", "integration", "e2e"].includes(normalized);
}

function isTestFileName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".spec.ts") ||
    normalized.endsWith(".test.js") ||
    normalized.endsWith(".spec.js")
  );
}

function walk(
  root: string,
  depth: number,
  visitor: (currentPath: string, dirents: fs.Dirent[]) => void
): void {
  if (depth > 5 || !fs.existsSync(root)) return;
  const dirents = fs.readdirSync(root, { withFileTypes: true });
  visitor(root, dirents);

  for (const entry of dirents) {
    if (!entry.isDirectory()) continue;
    if (IGNORED_DIRS.has(entry.name)) continue;
    walk(path.join(root, entry.name), depth + 1, visitor);
  }
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

function formatListItem(label: string, values: string[]): string[] {
  if (values.length === 0) {
    return [`- ${label}: none detected`];
  }
  const [first, ...rest] = values;
  const lines = [`- ${label}: ${first}`];
  for (const value of rest) {
    lines.push(`  - ${value}`);
  }
  return lines;
}

function syncGuideFiles(workspaceRoot: string, playbookRelativePath: string): string[] {
  const updatedFiles: string[] = [];
  const body = renderGuideBody(playbookRelativePath);

  for (const filename of GUIDE_FILENAMES) {
    const filePath = path.join(workspaceRoot, filename);
    const next = upsertMarkerBlock(fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "", body);
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, "utf-8") !== next) {
      fs.writeFileSync(filePath, next, "utf-8");
      updatedFiles.push(filename);
    }
  }

  return updatedFiles;
}

function renderGuideBody(playbookRelativePath: string): string {
  return [
    "## Test Playbook",
    `- Detailed test structure and standard execution flow live in [${playbookRelativePath}](./${toPosix(playbookRelativePath)}).`,
    "- Use that file as the source of truth before rerunning tests or interpreting failures.",
    "- Regenerate the playbook whenever a new runner, framework, or test convention appears.",
  ].join("\n");
}

function upsertMarkerBlock(existing: string, body: string): string {
  const normalizedExisting = existing.replace(/\r\n/g, "\n").trimEnd();
  const markerBlock = [MARKER_START, body, MARKER_END].join("\n");

  if (!normalizedExisting) {
    return `# Workspace Instructions\n\n${markerBlock}\n`;
  }

  const startIndex = normalizedExisting.indexOf(MARKER_START);
  const endIndex = normalizedExisting.indexOf(MARKER_END);
  if (startIndex >= 0 && endIndex > startIndex) {
    const before = normalizedExisting.slice(0, startIndex).trimEnd();
    const after = normalizedExisting.slice(endIndex + MARKER_END.length).trimStart();
    return [before, markerBlock, after].filter(Boolean).join("\n\n").trimEnd() + "\n";
  }

  return `${normalizedExisting}\n\n${markerBlock}\n`;
}
