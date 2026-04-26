#!/usr/bin/env node
import * as path from "path";
import { fileURLToPath } from "url";
import { enableMcp, disableMcp } from "./tools/setupProject.js";
import { initSharedState } from "./shared.js";
import { startSseServer } from "./sseServer.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/registerAllTools.js";

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

  if (rawArgs.includes("--stdio")) {
    const shared = await initSharedState();
    const server = new McpServer({ name: "adhd-developer", version: "1.0.0" });
    registerAllTools(server, shared.orchestrator, shared.registry, shared);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    const port = parseInt(process.env["MCP_SSE_PORT"] ?? "2999", 10);
    const shared = await initSharedState();
    await startSseServer(shared, port);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
