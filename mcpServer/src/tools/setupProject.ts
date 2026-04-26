import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { buildPatch } from "./patchUtils.js";
import { FilePatch } from "../types.js";

export interface SetupResult {
  created: string[];
  merged: string[];
  removed: string[];
  skipped: string[];
  errors: string[];
  notes: string[];
  patches?: FilePatch[];
}

const SERVER_KEY = "adhd-developer";
const PKG_NAME = "adhdeveloper@latest";
const LAUNCHER_RELATIVE_PATH = ".mcp/adhd-developer-launcher.cjs";
const DEFAULT_PORT = 2999;
const MCP_URL = `http://localhost:${DEFAULT_PORT}/mcp`;
const launchEntry = { command: "node", args: [LAUNCHER_RELATIVE_PATH] };
const httpEntry = { type: "http", url: MCP_URL };
const sseEntry = { type: "sse", url: MCP_URL };
const vscodeEntry = { type: "sse", url: MCP_URL };
const globalEntry = {
  command: "node",
  args: [
    "-e",
    `const { spawn } = require('node:child_process');
const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(cmd, ['-y', '--quiet', '${PKG_NAME}', '--stdio'], {
  stdio: ['inherit', 'inherit', 'inherit'], 
  shell: process.platform === 'win32',
  env: { ...process.env, NPM_CONFIG_YES: 'true' }
});
child.on('error', (err) => { console.error('[adhd-developer] failed to launch via npx:', err); process.exit(1); });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));`,
  ],
};

function writeLauncher(projectPath: string): { filePath: string; outcome: "created" | "merged"; patch?: FilePatch } {
  const launcherPath = path.join(projectPath, LAUNCHER_RELATIVE_PATH);
  const existed = fs.existsSync(launcherPath);
  fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
  const content = `#!/usr/bin/env node
const { spawn } = require("node:child_process");

const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(cmd, ["-y", "--quiet", "${PKG_NAME}", "--stdio"], {
  stdio: ["inherit", "inherit", "inherit"],
  shell: process.platform === "win32",
  env: { ...process.env, NPM_CONFIG_YES: "true" }
});

child.on("error", (err) => {
  console.error("[adhd-developer] MCP launcher failed:", err);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => child.kill(sig));
`;
  const existingRaw = existed ? fs.readFileSync(launcherPath, "utf-8") : "";
  fs.writeFileSync(launcherPath, content, "utf-8");
  const patch = buildPatch(launcherPath, existingRaw, content);
  return { filePath: launcherPath, outcome: existed ? "merged" : "created", patch };
}

function mergeJson(
  filePath: string,
  serverKey: string,
  entry: unknown,
  rootKey: string
): { outcome: "created" | "merged"; patch?: FilePatch } {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    const content = JSON.stringify({ [rootKey]: { [serverKey]: entry } }, null, 2) + "\n";
    fs.writeFileSync(filePath, content);
    const patch = buildPatch(filePath, "", content);
    return { outcome: "created", patch };
  }

  const existingRaw = fs.readFileSync(filePath, "utf-8");
  const existing = JSON.parse(existingRaw);
  existing[rootKey] ??= {};
  existing[rootKey][serverKey] = entry;
  const newContent = JSON.stringify(existing, null, 2) + "\n";
  fs.writeFileSync(filePath, newContent);
  const patch = buildPatch(filePath, existingRaw, newContent);
  return { outcome: "merged", patch };
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
  if (launcher.patch) { result.patches = result.patches ?? []; result.patches.push(launcher.patch); }

  const configs: Array<() => void> = [
    // Claude Code — StreamableHTTP
    () => {
      const file = path.join(projectPath, ".mcp.json");
      const res = mergeJson(file, SERVER_KEY, httpEntry, "mcpServers");
      track(res.outcome, file);
      if (res.patch) { result.patches = result.patches ?? []; result.patches.push(res.patch); }
    },

    // VS Code Copilot — SSE (StreamableHTTP GET endpoint)
    () => {
      const file = path.join(projectPath, ".vscode", "mcp.json");
      const res = mergeJson(file, SERVER_KEY, vscodeEntry, "servers");
      track(res.outcome, file);
      if (res.patch) { result.patches = result.patches ?? []; result.patches.push(res.patch); }
    },

    // OpenAI Codex
    () => {
      const file = path.join(projectPath, ".codex", "config.toml");
      track(mergeToml(file, SERVER_KEY, launchEntry), file);
    },

    // Gemini CLI
    () => {
      const file = path.join(projectPath, ".gemini", "settings.json");
      const res = mergeJson(file, SERVER_KEY, launchEntry, "mcpServers");
      track(res.outcome, file);
      if (res.patch) { result.patches = result.patches ?? []; result.patches.push(res.patch); }
    },

    // Junie (JetBrains)
    () => {
      const file = path.join(projectPath, ".junie", "mcp", "mcp.json");
      const res = mergeJson(file, SERVER_KEY, launchEntry, "mcpServers");
      track(res.outcome, file);
      if (res.patch) { result.patches = result.patches ?? []; result.patches.push(res.patch); }
    },

    // Cursor — SSE (StreamableHTTP GET endpoint)
    () => {
      const file = path.join(projectPath, ".cursor", "mcp.json");
      const res = mergeJson(file, SERVER_KEY, sseEntry, "mcpServers");
      track(res.outcome, file);
      if (res.patch) { result.patches = result.patches ?? []; result.patches.push(res.patch); }
    },

    // GitHub Copilot CLI — no project-level support, only global (~/.copilot/mcp-config.json)
    () => {
      const globalConfig = path.join(os.homedir(), ".copilot", "mcp-config.json");
      const res = mergeJson(globalConfig, SERVER_KEY, globalEntry, "mcpServers");
      track(res.outcome, globalConfig);
      if (res.patch) { result.patches = result.patches ?? []; result.patches.push(res.patch); }
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
    `The adhd-developer MCP server uses StreamableHTTP on port ${DEFAULT_PORT}. Claude Code uses type:http, VS Code and Cursor use type:sse (same /mcp endpoint). Gemini CLI, Junie, Codex, and Copilot CLI are configured with the stdio launcher but require a stdio transport mode in the server to work — currently not supported.`
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
