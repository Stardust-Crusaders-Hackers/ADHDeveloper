import * as fs from "fs";
import * as path from "path";

interface SetupResult {
  created: string[];
  merged: string[];
  skipped: string[];
  errors: string[];
}

const SERVER_KEY = "adhd-developer";
const NPX_COMMAND = "npx";
const NPX_ARGS = ["-y", "mcp-server@latest"];

function mergeJson(filePath: string, serverKey: string, entry: unknown, rootKey: string): "created" | "merged" {
  if (!fs.existsSync(filePath)) {
    const content = { [rootKey]: { [serverKey]: entry } };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + "\n");
    return "created";
  }

  const existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  existing[rootKey] ??= {};
  existing[rootKey][serverKey] = entry;
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n");
  return "merged";
}

function mergeToml(filePath: string, serverKey: string): "created" | "merged" {
  const entry = `\n[mcp_servers."${serverKey}"]\ncommand = "${NPX_COMMAND}"\nargs = [${NPX_ARGS.map((a) => `"${a}"`).join(", ")}]\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, entry.trimStart());
    return "created";
  }

  const existing = fs.readFileSync(filePath, "utf-8");
  if (existing.includes(`[mcp_servers."${serverKey}"]`)) {
    return "merged";
  }
  fs.appendFileSync(filePath, entry);
  return "merged";
}

export async function setupProject(projectPath: string): Promise<SetupResult> {
  const result: SetupResult = { created: [], merged: [], skipped: [], errors: [] };

  const track = (outcome: "created" | "merged", file: string) => {
    result[outcome].push(file);
  };

  const stdioEntry = { command: NPX_COMMAND, args: NPX_ARGS };
  const vscodeEntry = { type: "stdio", command: NPX_COMMAND, args: NPX_ARGS };

  const configs: Array<() => void> = [
    // Claude Code
    () => {
      const file = path.join(projectPath, ".mcp.json");
      track(mergeJson(file, SERVER_KEY, stdioEntry, "mcpServers"), file);
    },
    // VS Code Copilot
    () => {
      const file = path.join(projectPath, ".vscode", "mcp.json");
      track(mergeJson(file, SERVER_KEY, vscodeEntry, "servers"), file);
    },
    // OpenAI Codex
    () => {
      const file = path.join(projectPath, ".codex", "config.toml");
      track(mergeToml(file, SERVER_KEY), file);
    },
    // Gemini CLI
    () => {
      const file = path.join(projectPath, ".gemini", "settings.json");
      track(mergeJson(file, SERVER_KEY, stdioEntry, "mcpServers"), file);
    },
    // GitHub Copilot CLI
    () => {
      const file = path.join(projectPath, ".github", "copilot-mcp.json");
      track(mergeJson(file, SERVER_KEY, stdioEntry, "mcpServers"), file);
    },
    // Junie (JetBrains)
    () => {
      const file = path.join(projectPath, ".junie", "mcp.json");
      track(mergeJson(file, SERVER_KEY, stdioEntry, "mcpServers"), file);
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
