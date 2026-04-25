#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as path from "path";
import { fileURLToPath } from "url";
import { enableMcp, disableMcp } from "./tools/setupProject.js";
import { initSharedState } from "./shared.js";
import { registerAllTools } from "./tools/registerAllTools.js";
import { startSseServer } from "./sseServer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runCliCommand(argv: string[]): Promise<boolean> {
  const [command, ...rest] = argv;
  if (!command) return false;

  const projectPath = path.resolve(rest[0] ?? process.cwd());
  let result: unknown;

  if (command === "enable" || command === "setup_project") {
    result = await enableMcp(projectPath);
  } else if (command === "disable") {
    result = await disableMcp(projectPath);
  } else {
    return false;
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return true;
}

async function main() {
  const rawArgs = process.argv.slice(2);

  if (await runCliCommand(rawArgs)) return;

  const args = new Set(rawArgs);
  const sseOnly = args.has("--sse") || process.env["MCP_SSE"] === "true";
  const stdioOnly = args.has("--stdio");
  const port = parseInt(process.env["MCP_SSE_PORT"] ?? "2999", 10);

  const shared = await initSharedState();

  if (!stdioOnly) {
    try {
      await startSseServer(shared, port);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EADDRINUSE") {
        console.error(`[adhd-developer] SSE port ${port} already in use, continuing stdio-only`);
      } else {
        throw err;
      }
    }
  }

  if (!sseOnly) {
    const server = new McpServer({ name: "adhd-developer", version: "1.0.0" });
    registerAllTools(server, shared.orchestrator, shared.registry);
    shared.activeSessions.set("stdio", server);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[adhd-developer] MCP server running on stdio");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
