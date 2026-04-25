#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "path";
import { fileURLToPath } from "url";
import { AgentRegistry } from "./registry/agentRegistry.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { setupProject } from "./tools/setupProject.js";
import { repoBootstrap, type RepoBootstrapConfig } from "./tools/repoBootstrap.js";
import { explainSubdirectories } from "./tools/explainSubdirectories.js";
import { listAgents, listActiveTasks, registerAgent, startTask, completeTask } from "./handlers.js";
import { readFile, getCacheInfo, invalidate, clearCache, toTextContentBlock } from "./tools/contextCache.js";

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
    "Adds adhd-developer MCP server config to a project for Claude Code, VS Code Copilot, Cursor, OpenAI Codex, Gemini CLI, GitHub Copilot CLI, and Junie. Merges into existing configs without overwriting other entries.",
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

  // Plugin bridge tools — used by IntelliJ MCPBridgeService
  server.tool("agents/list", "List agents registered via plugin bridge", {}, async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({ agents: listAgents() }) }]
  }));

  server.tool("tasks/active", "List active tasks from plugin bridge", {}, async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({ tasks: listActiveTasks() }) }]
  }));

  server.tool("agent/register", "Register an agent in the plugin bridge", {
    id: z.string(),
    name: z.string(),
    type: z.string(),
    description: z.string().optional(),
  }, async (params) => {
    const agent = registerAgent({ ...params, description: params.description ?? "" });
    return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, agent }) }] };
  });

  server.tool("task/start", "Start a task in the plugin bridge", {
    taskId: z.string(),
    agentId: z.string(),
    description: z.string(),
  }, async (params) => {
    const task = startTask(params);
    return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, task }) }] };
  });

  server.tool("task/complete", "Complete a task in the plugin bridge", {
    taskId: z.string(),
    agentId: z.string(),
    result: z.string().optional(),
  }, async ({ taskId, agentId, result }) => {
    const task = completeTask(taskId, agentId, result ?? "");
    return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, task }) }] };
  });

  server.tool(
    "repo_bootstrap",
    "Initialize repository/project scaffold from structured requirements. Supports multi-stack templates, architecture skeletons, Docker and optional Nginx setup, with safe conflict policy.",
    {
      projectPath: z.string().describe("Absolute path to target project root"),
      config: z.object({
        projectName: z.string().describe("Project/repository name"),
        vision: z.string().optional().describe("Short project vision"),
        stacks: z.array(z.string()).min(1).describe("Stacks/languages to bootstrap"),
        architecture: z.enum(["monolith", "modular", "hexagonal", "microservices"]).describe("Desired architecture"),
        dockerize: z.boolean().describe("Whether to include Docker artifacts"),
        includeNginx: z.boolean().describe("Whether to include Nginx base config"),
        overwritePolicy: z.enum(["no-overwrite", "overwrite", "prompt"]).optional().describe("Conflict policy for existing files"),
      }),
    },
    async ({ projectPath, config }) => {
      const bootstrapConfig: RepoBootstrapConfig = {
        projectName: config.projectName,
        vision: config.vision,
        stacks: config.stacks,
        architecture: config.architecture,
        dockerize: config.dockerize,
        includeNginx: config.includeNginx,
        overwritePolicy: config.overwritePolicy,
      };
      const result = await repoBootstrap(projectPath, bootstrapConfig);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "explain_subdirectories",
    "Create/merge per-subdirectory conceptual and architectural docs, list contents, and add recommended workflow notes with stack-aware file format handling.",
    {
      projectPath: z.string().describe("Absolute path to the project root"),
      language: z.string().optional().describe("Output language (e.g. 'es', 'en'). If omitted, inferred from runtime locale."),
      stack: z.string().optional().describe("Optional stack override (python, java, node, etc.)"),
      includeHidden: z.boolean().optional().describe("Whether to include hidden directories/files. Default: false"),
      maxDepth: z.number().int().min(1).max(32).optional().describe("Maximum recursion depth for subdirectories. Default: 8"),
      overwritePolicy: z.enum(["merge", "overwrite", "no-overwrite"]).optional().describe("Conflict policy when target file exists. Default: merge"),
      fallbackFilename: z.string().optional().describe("Fallback filename when format cannot be inferred. Default: index.md"),
    },
    async (params) => {
      const result = await explainSubdirectories(params);
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
        content: [toTextContentBlock(result, meta)],
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
