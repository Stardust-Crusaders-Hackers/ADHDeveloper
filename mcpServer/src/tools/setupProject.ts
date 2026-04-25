import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface SetupResult {
  created: string[];
  merged: string[];
  removed: string[];
  skipped: string[];
  errors: string[];
  notes: string[];
}

const SERVER_KEY = "adhd-developer";
const PKG_NAME = "adhdeveloper@latest";
const LAUNCHER_RELATIVE_PATH = ".mcp/adhd-developer-launcher.cjs";
const launchEntry = { command: "node", args: [LAUNCHER_RELATIVE_PATH] };
const vscodeEntry = { type: "stdio", command: "node", args: [LAUNCHER_RELATIVE_PATH] };
const globalEntry = {
  command: "node",
  args: [
    "-e",
    `const { spawn } = require('node:child_process');
const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(cmd, ['-y', '${PKG_NAME}'], { stdio: 'inherit', shell: false });
child.on('error', (err) => { console.error('[adhd-developer] failed to launch via npx:', err); process.exit(1); });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));`,
  ],
};

function writeLauncher(projectPath: string): { filePath: string; outcome: "created" | "merged" } {
  const launcherPath = path.join(projectPath, LAUNCHER_RELATIVE_PATH);
  const existed = fs.existsSync(launcherPath);
  fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
  fs.writeFileSync(
    launcherPath,
    `#!/usr/bin/env node
const { spawn } = require("node:child_process");

const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(cmd, ["-y", "${PKG_NAME}"], { stdio: "inherit", shell: false });

child.on("error", (err) => {
  console.error("[adhd-developer] MCP launcher failed:", err);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => child.kill(sig));
`,
    "utf-8"
  );
  return { filePath: launcherPath, outcome: existed ? "merged" : "created" };
}

function mergeJson(
  filePath: string,
  serverKey: string,
  entry: unknown,
  rootKey: string
): "created" | "merged" {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ [rootKey]: { [serverKey]: entry } }, null, 2) + "\n");
    return "created";
  }

  const existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  existing[rootKey] ??= {};
  existing[rootKey][serverKey] = entry;
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n");
  return "merged";
}

function removeJsonServer(filePath: string, serverKey: string, rootKey: string): "removed" | "skipped" {
  if (!fs.existsSync(filePath)) {
    return "skipped";
  }

  const existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!existing[rootKey] || typeof existing[rootKey] !== "object" || !(serverKey in existing[rootKey])) {
    return "skipped";
  }

  delete existing[rootKey][serverKey];
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n");
  return "removed";
}

function mergeToml(filePath: string, serverKey: string, entry: { command: string; args: string[] }): "created" | "merged" {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const block = `[mcp_servers."${serverKey}"]\ncommand = "${entry.command}"\nargs = [${entry.args.map((a) => JSON.stringify(a)).join(", ")}]\n`;
  const header = `[mcp_servers."${serverKey}"]`;

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, block);
    return "created";
  }

  const existing = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const lines = existing.split("\n");
  const start = lines.findIndex((line) => line.trim() === header);

  if (start >= 0) {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim().startsWith("[") && lines[i].trim() !== "") {
        end = i;
        break;
      }
    }
    const updatedLines = [...lines.slice(0, start), ...block.trimEnd().split("\n"), ...lines.slice(end)];
    fs.writeFileSync(filePath, updatedLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
    return "merged";
  }

  fs.writeFileSync(filePath, existing.trimEnd() + "\n\n" + block);
  return "merged";
}

function removeTomlServer(filePath: string, serverKey: string): "removed" | "skipped" {
  if (!fs.existsSync(filePath)) {
    return "skipped";
  }

  const header = `[mcp_servers."${serverKey}"]`;
  const existing = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const lines = existing.split("\n");
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) {
    return "skipped";
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith("[") && lines[i].trim() !== "") {
      end = i;
      break;
    }
  }

  const updated = [...lines.slice(0, start), ...lines.slice(end)].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  fs.writeFileSync(filePath, updated);
  return "removed";
}

export async function enableMcp(projectPath: string): Promise<SetupResult> {
  const result: SetupResult = { created: [], merged: [], removed: [], skipped: [], errors: [], notes: [] };

  const track = (outcome: "created" | "merged", file: string) => result[outcome].push(file);

  const launcher = writeLauncher(projectPath);
  track(launcher.outcome, launcher.filePath);

  const configs: Array<() => void> = [
    // Claude Code
    () => {
      const file = path.join(projectPath, ".mcp.json");
      track(mergeJson(file, SERVER_KEY, launchEntry, "mcpServers"), file);
    },

    // VS Code Copilot
    () => {
      const file = path.join(projectPath, ".vscode", "mcp.json");
      track(mergeJson(file, SERVER_KEY, vscodeEntry, "servers"), file);
    },

    // OpenAI Codex
    () => {
      const file = path.join(projectPath, ".codex", "config.toml");
      track(mergeToml(file, SERVER_KEY, launchEntry), file);
    },

    // Gemini CLI
    () => {
      const file = path.join(projectPath, ".gemini", "settings.json");
      track(mergeJson(file, SERVER_KEY, launchEntry, "mcpServers"), file);
    },

    // Junie (JetBrains)
    () => {
      const file = path.join(projectPath, ".junie", "mcp", "mcp.json");
      track(mergeJson(file, SERVER_KEY, launchEntry, "mcpServers"), file);
    },

    // Cursor
    () => {
      const file = path.join(projectPath, ".cursor", "mcp.json");
      track(mergeJson(file, SERVER_KEY, launchEntry, "mcpServers"), file);
    },

    // GitHub Copilot CLI — no project-level support, only global (~/.copilot/mcp-config.json)
    () => {
      const globalConfig = path.join(os.homedir(), ".copilot", "mcp-config.json");
      track(mergeJson(globalConfig, SERVER_KEY, globalEntry, "mcpServers"), globalConfig);
      result.notes.push(
        "GitHub Copilot CLI uses global MCP config (~/.copilot/mcp-config.json). Added cross-platform Node launcher entry there."
      );
    },
  ];

  for (const configure of configs) {
    try {
      configure();
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  result.notes.push(
    "All generated project configs use a Node launcher (.mcp/adhd-developer-launcher.cjs) that resolves npx vs npx.cmd automatically across Windows, Linux, and macOS."
  );

  return result;
}

export async function disableMcp(projectPath: string): Promise<SetupResult> {
  const result: SetupResult = { created: [], merged: [], removed: [], skipped: [], errors: [], notes: [] };
  const globalConfig = path.join(os.homedir(), ".copilot", "mcp-config.json");

  const removals: Array<() => void> = [
    () => {
      const file = path.join(projectPath, ".mcp.json");
      result[removeJsonServer(file, SERVER_KEY, "mcpServers")].push(file);
    },
    () => {
      const file = path.join(projectPath, ".vscode", "mcp.json");
      result[removeJsonServer(file, SERVER_KEY, "servers")].push(file);
    },
    () => {
      const file = path.join(projectPath, ".codex", "config.toml");
      result[removeTomlServer(file, SERVER_KEY)].push(file);
    },
    () => {
      const file = path.join(projectPath, ".gemini", "settings.json");
      result[removeJsonServer(file, SERVER_KEY, "mcpServers")].push(file);
    },
    () => {
      const file = path.join(projectPath, ".junie", "mcp", "mcp.json");
      result[removeJsonServer(file, SERVER_KEY, "mcpServers")].push(file);
    },
    () => {
      const file = path.join(projectPath, ".cursor", "mcp.json");
      result[removeJsonServer(file, SERVER_KEY, "mcpServers")].push(file);
    },
    () => {
      result[removeJsonServer(globalConfig, SERVER_KEY, "mcpServers")].push(globalConfig);
      result.notes.push(
        "GitHub Copilot CLI uses global MCP config (~/.copilot/mcp-config.json). Removed adhd-developer entry there when present."
      );
    },
  ];

  for (const remove of removals) {
    try {
      remove();
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  result.notes.push("Launcher file is intentionally kept: .mcp/adhd-developer-launcher.cjs");
  return result;
}

export async function setupProject(projectPath: string): Promise<SetupResult> {
  return enableMcp(projectPath);
}
