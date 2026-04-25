#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "path";
import { fileURLToPath } from "url";
import { AgentRegistry } from "./registry/agentRegistry.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { setupProject } from "./tools/setupProject.js";
import { readFile, getCacheInfo, invalidate, clearCache } from "./tools/contextCache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const registry = new AgentRegistry();
  const agentsDir = path.join(__dirname, "agents");
  await registry.discoverAgents(agentsDir);

  const orchestrator = new Orchestrator(registry);

  const server = new McpServer({
    name: "adhd-developer",
    version: "1.0.0",
  });

  server.tool(
    "orchestrate",
    "Evaluate which agent(s) can handle a task. Returns ranked recommendations. " +
    "If confident (rule-based match), returns best match. If uncertain, returns all agents for the LLM to decide.",
    {
      query: z.string().describe("The task or query to route to an agent"),
      metadata: z.record(z.unknown()).optional().describe("Optional additional context"),
    },
    async ({ query }) => {
      const result = orchestrator.evaluate(query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "execute_agent",
    "Execute a specific agent by name with a given context.",
    {
      agentName: z.string().describe("The name of the agent to execute"),
      query: z.string().describe("The task or query for the agent"),
      metadata: z.record(z.unknown()).optional().describe("Optional additional context"),
    },
    async ({ agentName, query, metadata }) => {
      const result = await orchestrator.executeAgent(agentName, { query, metadata });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "list_agents",
    "List all registered agents with their descriptions and capabilities.",
    {},
    async () => {
      const summaries = registry.getAgentSummaries();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(summaries, null, 2) }],
      };
    }
  );

  server.tool(
    "setup_project",
    "Adds adhd-developer MCP server config to a project for Claude Code, VS Code Copilot, OpenAI Codex, Gemini CLI, GitHub Copilot CLI, and Junie. Merges into existing configs without overwriting other entries.",
    {
      projectPath: z.string().describe("Absolute path to the project root where configs will be written"),
    },
    async ({ projectPath }) => {
      const result = await setupProject(projectPath);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "read_file_cached",
    "Read a file from disk and cache its content in memory. Subsequent reads of the same path return from cache — no disk I/O, no redundant context. Use this instead of raw file reads whenever you may need a file more than once in a session.",
    {
      path: z.string().describe("Absolute or relative path to the file"),
    },
    async ({ path: filePath }) => {
      const result = readFile(filePath);
      const meta = result.source === "cache"
        ? `[CACHE HIT — hit #${result.hits}, ${result.sizeBytes} bytes, no disk read]`
        : `[DISK READ — cached for future calls, ${result.sizeBytes} bytes]`;
      return {
        content: [{ type: "text" as const, text: `${meta}\n\n${result.content}` }],
      };
    }
  );

  server.tool(
    "cache_info",
    "Show all files currently held in the context cache: paths, sizes, hit counts, and aggregate stats. Use before reading a file to check if it is already cached.",
    {},
    async () => {
      const info = getCacheInfo();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }],
      };
    }
  );

  server.tool(
    "cache_invalidate",
    "Remove a specific file from the context cache so the next read_file_cached call fetches a fresh copy from disk. Use when you know a file has changed.",
    {
      path: z.string().describe("Absolute or relative path to the file to evict"),
    },
    async ({ path: filePath }) => {
      const removed = invalidate(filePath);
      return {
        content: [{ type: "text" as const, text: removed ? `Evicted: ${filePath}` : `Not in cache: ${filePath}` }],
      };
    }
  );

  server.tool(
    "cache_clear",
    "Clear the entire context cache. All subsequent file reads will go to disk.",
    {},
    async () => {
      const count = clearCache();
      return {
        content: [{ type: "text" as const, text: `Cleared ${count} cached file(s).` }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[adhd-developer] MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
