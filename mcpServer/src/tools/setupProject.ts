import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface SetupResult {
  created: string[];
  merged: string[];
  skipped: string[];
  errors: string[];
  notes: string[];
}

const SERVER_KEY = "adhd-developer";
const PKG_NAME = "mcp-server@latest";

// Claude Code and Codex spawn without shell:true — on Windows, npx.cmd can't run directly.
// VS Code and Gemini handle shell resolution internally, so plain npx works everywhere.
const isWindows = process.platform === "win32";
const directEntry = { command: "npx", args: ["-y", PKG_NAME] };
const windowsSafeEntry = isWindows
  ? { command: "cmd", args: ["/c", "npx", "-y", PKG_NAME] }
  : { command: "npx", args: ["-y", PKG_NAME] };
const vscodeEntry = { type: "stdio", command: "npx", args: ["-y", PKG_NAME] };

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

function mergeToml(filePath: string, serverKey: string, entry: { command: string; args: string[] }): "created" | "merged" {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const block = `[mcp_servers."${serverKey}"]\ncommand = "${entry.command}"\nargs = [${entry.args.map((a) => `"${a}"`).join(", ")}]\n`;

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, block);
    return "created";
  }

  const existing = fs.readFileSync(filePath, "utf-8");
  if (existing.includes(`[mcp_servers."${serverKey}"]`)) {
    // Already present — overwrite the block
    const updated = existing.replace(
      new RegExp(`\\[mcp_servers\\.?"${serverKey}"\\][^\\[]*`, "s"),
      block
    );
    fs.writeFileSync(filePath, updated);
    return "merged";
  }

  fs.appendFileSync(filePath, "\n" + block);
  return "merged";
}

export async function setupProject(projectPath: string): Promise<SetupResult> {
  const result: SetupResult = { created: [], merged: [], skipped: [], errors: [], notes: [] };

  const track = (outcome: "created" | "merged", file: string) => result[outcome].push(file);

  const configs: Array<() => void> = [
    // Claude Code — no shell:true on Windows, needs cmd /c wrapper
    () => {
      const file = path.join(projectPath, ".mcp.json");
      track(mergeJson(file, SERVER_KEY, windowsSafeEntry, "mcpServers"), file);
      if (isWindows) {
        result.notes.push(
          `.mcp.json (Claude Code): generated with 'cmd /c npx' for Windows. Re-run setup_project on Linux/Mac to get the correct config for that platform.`
        );
      }
    },

    // VS Code Copilot — uses shell internally, npx works on all platforms
    () => {
      const file = path.join(projectPath, ".vscode", "mcp.json");
      track(mergeJson(file, SERVER_KEY, vscodeEntry, "servers"), file);
    },

    // OpenAI Codex — no shell:true on Windows, needs cmd /c wrapper
    () => {
      const file = path.join(projectPath, ".codex", "config.toml");
      track(mergeToml(file, SERVER_KEY, windowsSafeEntry as { command: string; args: string[] }), file);
      if (isWindows) {
        result.notes.push(
          `.codex/config.toml (Codex): generated with 'cmd /c npx' for Windows. Re-run on Linux/Mac for Unix config.`
        );
      }
    },

    // Gemini CLI — handles shell internally, npx works on all platforms
    () => {
      const file = path.join(projectPath, ".gemini", "settings.json");
      track(mergeJson(file, SERVER_KEY, directEntry, "mcpServers"), file);
    },

    // Junie (JetBrains) — correct path is .junie/mcp/mcp.json, needs cmd /c on Windows
    () => {
      const file = path.join(projectPath, ".junie", "mcp", "mcp.json");
      track(mergeJson(file, SERVER_KEY, windowsSafeEntry, "mcpServers"), file);
      if (isWindows) {
        result.notes.push(
          `.junie/mcp/mcp.json (Junie): generated with 'cmd /c npx' for Windows. Re-run on Linux/Mac for Unix config.`
        );
      }
    },

    // GitHub Copilot CLI — no project-level support, only global (~/.copilot/mcp-config.json)
    () => {
      const globalConfig = path.join(os.homedir(), ".copilot", "mcp-config.json");
      track(mergeJson(globalConfig, SERVER_KEY, directEntry, "mcpServers"), globalConfig);
      result.notes.push(
        "GitHub Copilot CLI does not support project-level MCP config. Entry was added to the global config at ~/.copilot/mcp-config.json instead."
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

  return result;
}
