import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "path";
import { fileURLToPath } from "url";
import { AgentRegistry } from "./registry/agentRegistry.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { setupProject } from "./tools/setupProject.js";
import { listAgents, listActiveTasks, registerAgent, startTask, completeTask } from "./handlers.js";

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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[adhd-developer] MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
