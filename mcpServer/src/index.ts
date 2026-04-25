#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "path";
import { fileURLToPath } from "url";
import { AgentRegistry } from "./registry/agentRegistry.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { PresentationEmitter } from "./types.js";
import { enableMcp, disableMcp, setupProject } from "./tools/setupProject.js";
import { repoBootstrap, type RepoBootstrapConfig } from "./tools/repoBootstrap.js";
import { explainSubdirectories } from "./tools/explainSubdirectories.js";
import { ensureTestPlaybook } from "./tools/testPlaybook.js";
import { listAgents, listActiveTasks, registerAgent, startTask, completeTask } from "./handlers.js";
import { readFile, getCacheInfo, invalidate, clearCache, toTextContentBlock } from "./tools/contextCache.js";
import { runBenchmark } from "./tools/benchmark.js";
import { executeSandbox } from "./tools/sandbox.js";
import { planExecution } from "./tools/loadBalancer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runCliCommand(argv: string[]): Promise<boolean> {
  const [command, ...rest] = argv;
  if (!command) {
    return false;
  }

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
  if (await runCliCommand(process.argv.slice(2))) {
    return;
  }

  const registry = new AgentRegistry();
  const agentsDir = path.join(__dirname, "agents");
  await registry.discoverAgents(agentsDir);

  const emitter: PresentationEmitter = (payload) => {
    void server.server.notification({
      method: "notifications/presentation",
      params: payload as unknown as Record<string, unknown>,
    });
  };
  const orchestrator = new Orchestrator(registry, emitter);

  const server = new McpServer({
    name: "adhd-developer",
    version: "1.0.0",
  });

  server.registerTool(
    "orchestrate",
    {
      description: "Evaluate which agent(s) can handle a task. Returns ranked recommendations. " +
        "If confident (rule-based match), returns best match. If uncertain, returns all agents for the LLM to decide.",
      inputSchema: z.object({
        query: z.string().describe("The task or query to route to an agent"),
        metadata: z.record(z.unknown()).optional().describe("Optional additional context"),
      }),
    },
    async ({ query }) => {
      const result = orchestrator.evaluate(query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "execute_agent",
    {
      description: "Execute a specific agent by name with a given context.",
      inputSchema: z.object({
        agentName: z.string().describe("The name of the agent to execute"),
        query: z.string().describe("The task or query for the agent"),
        metadata: z
          .object({
            flowId: z.string().optional().describe("Optional flow identifier to group multi-agent executions"),
            flowCompleted: z.boolean().optional().describe("Marks the current flow as completed and triggers the final explainer"),
          })
          .catchall(z.unknown())
          .optional()
          .describe("Optional additional context"),
      }),
    },
    async ({ agentName, query, metadata }) => {
      const result = await orchestrator.executeAgent(agentName, { query, metadata });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "list_agents",
    {
      description: "List all registered agents with their descriptions and capabilities.",
      inputSchema: z.object({}),
    },
    async () => {
      const fileSummaries = registry.getAgentSummaries();
      const handlerAgents = listAgents().map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        description: a.description,
        keywords: [] as string[],
      }));
      const seen = new Set(fileSummaries.map((s) => s.id));
      const merged = [...fileSummaries, ...handlerAgents.filter((a) => !seen.has(a.id))];
      return {
        content: [{ type: "text" as const, text: JSON.stringify(merged, null, 2) }],
      };
    }
  );

  server.registerTool(
    "mcp_enable",
    {
      description: "Enable adhd-developer MCP integration for this project and supported clients.",
      inputSchema: z.object({
        projectPath: z.string().describe("Absolute path to the project root where configs will be written"),
      }),
    },
    async ({ projectPath }) => {
      const result = await enableMcp(projectPath);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "mcp_disable",
    {
      description: "Disable adhd-developer MCP integration for this project and supported clients.",
      inputSchema: z.object({
        projectPath: z.string().describe("Absolute path to the project root where configs will be removed"),
      }),
    },
    async ({ projectPath }) => {
      const result = await disableMcp(projectPath);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "setup_project",
    {
      description: "Alias of mcp_enable. Adds adhd-developer MCP server config to a project for Claude Code, VS Code Copilot, Cursor, OpenAI Codex, Gemini CLI, GitHub Copilot CLI, and Junie. Merges into existing configs without overwriting other entries.",
      inputSchema: z.object({
        projectPath: z.string().describe("Absolute path to the project root where configs will be written"),
      }),
    },
    async ({ projectPath }) => {
      const result = await setupProject(projectPath);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Plugin bridge tools — used by IntelliJ MCPBridgeService
  server.registerTool(
    "agents_list",
    {
      description: "List agents registered via plugin bridge",
      inputSchema: z.object({}),
    },
    async () => {
      const fileSummaries = registry.getAgentSummaries();
      const handlerAgents = listAgents().map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        description: a.description,
        keywords: [] as string[],
      }));
      const seen = new Set(fileSummaries.map((s) => s.id));
      const merged = [...fileSummaries, ...handlerAgents.filter((a) => !seen.has(a.id))];
      return {
        content: [{ type: "text" as const, text: JSON.stringify(merged, null, 2) }],
      };
    }
  );

  server.registerTool(
    "tasks_active",
    {
      description: "List active tasks from plugin bridge",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{ type: "text" as const, text: JSON.stringify({ tasks: listActiveTasks() }) }]
    })
  );

  server.registerTool(
    "agent_register",
    {
      description: "Register an agent in the plugin bridge",
      inputSchema: z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        description: z.string().optional(),
      }),
    },
    async (params) => {
      const agent = registerAgent({ ...params, description: params.description ?? "" });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, agent }) }] };
    }
  );

  server.registerTool(
    "task_start",
    {
      description: "Start a task in the plugin bridge",
      inputSchema: z.object({
        taskId: z.string(),
        agentId: z.string(),
        description: z.string(),
      }),
    },
    async (params) => {
      const task = startTask(params);
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, task }) }] };
    }
  );

  server.registerTool(
    "task_complete",
    {
      description: "Complete a task in the plugin bridge",
      inputSchema: z.object({
        taskId: z.string(),
        agentId: z.string(),
        result: z.string().optional(),
      }),
    },
    async ({ taskId, agentId, result }) => {
      const task = completeTask(taskId, agentId, result ?? "");
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, task }) }] };
    }
  );

  server.registerTool(
    "repo_bootstrap",
    {
      description: "Initialize repository/project scaffold from structured requirements. Supports multi-stack templates, architecture skeletons, Docker and optional Nginx setup, with safe conflict policy.",
      inputSchema: z.object({
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

  server.registerTool(
    "explain_subdirectories",
    {
      description: "Create/merge per-subdirectory conceptual and architectural docs, list contents, and add recommended workflow notes with stack-aware file format handling.",
      inputSchema: z.object({
        projectPath: z.string().describe("Absolute path to the project root"),
        language: z.string().optional().describe("Output language (e.g. 'es', 'en'). If omitted, inferred from runtime locale."),
        stack: z.string().optional().describe("Optional stack override (python, java, node, etc.)"),
        includeHidden: z.boolean().optional().describe("Whether to include hidden directories/files. Default: false"),
        maxDepth: z.number().int().min(1).max(32).optional().describe("Maximum recursion depth for subdirectories. Default: 8"),
        overwritePolicy: z.enum(["merge", "overwrite", "no-overwrite"]).optional().describe("Conflict policy when target file exists. Default: merge"),
        fallbackFilename: z.string().optional().describe("Fallback filename when format cannot be inferred. Default: index.md"),
      }),
    },
    async (params) => {
      const result = await explainSubdirectories(params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "test_playbook",
    {
      description: "Analyze the workspace test structure and generate or refresh TESTS.md. Also keeps AGENTS.md, CLAUDE.md, and GEMINI.md pointed at the playbook when it changes.",
      inputSchema: z.object({
        projectPath: z.string().optional().describe("Project root or workspace root. Defaults to the current working directory."),
      }),
    },
    async ({ projectPath }) => {
      const result = ensureTestPlaybook(projectPath);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "read_file_cached",
    {
      description: "Read a file from disk and cache its content in memory. Subsequent reads of the same path return from cache — no disk I/O, no redundant context. Use this instead of raw file reads whenever you may need a file more than once in a session.",
      inputSchema: z.object({
        path: z.string().describe("Absolute or relative path to the file"),
      }),
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

  server.registerTool(
    "cache_info",
    {
      description: "Show all files currently held in the context cache: paths, sizes, hit counts, and aggregate stats. Use before reading a file to check if it is already cached.",
      inputSchema: z.object({}),
    },
    async () => {
      const info = getCacheInfo();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }],
      };
    }
  );

  server.registerTool(
    "cache_invalidate",
    {
      description: "Remove a specific file from the context cache so the next read_file_cached call fetches a fresh copy from disk. Use when you know a file has changed.",
      inputSchema: z.object({
        path: z.string().describe("Absolute or relative path to the file to evict"),
      }),
    },
    async ({ path: filePath }) => {
      const removed = invalidate(filePath);
      return {
        content: [{ type: "text" as const, text: removed ? `Evicted: ${filePath}` : `Not in cache: ${filePath}` }],
      };
    }
  );

  server.registerTool(
    "cache_clear",
    {
      description: "Clear the entire context cache. All subsequent file reads will go to disk.",
      inputSchema: z.object({}),
    },
    async () => {
      const count = clearCache();
      return {
        content: [{ type: "text" as const, text: `Cleared ${count} cached file(s).` }],
      };
    }
  );

  // Monitoring tools — for plugin flow inspection
  server.registerTool(
    "flow_state",
    {
      description: "Get current state of all active flows, agents running, and their execution history. Used by IDE plugins to monitor multi-agent execution.",
      inputSchema: z.object({}),
    },
    async () => {
      const state = orchestrator.getFlowState();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(state, null, 2) }],
      };
    }
  );

  server.registerTool(
    "flow_get",
    {
      description: "Get details of a specific flow by ID, including participants, execution steps, and timestamps.",
      inputSchema: z.object({
        flowId: z.string().describe("The flow ID to inspect"),
      }),
    },
    async ({ flowId }) => {
      const flow = orchestrator.getFlowById(flowId);
      if (!flow) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Flow "${flowId}" not found or expired` }, null, 2) }],
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(flow, null, 2) }],
      };
    }
  );



  server.registerTool(
    "sandbox_execute",
    {
      description: "Execute code in an isolated sandbox before using it in production. " +
        "Supports JavaScript, TypeScript, Python, Bash, and sh. " +
        "Uses Docker (preferred) for full isolation: memory cap, CPU throttle, read-only filesystem, no network, dropped capabilities. " +
        "Falls back to Node vm module (JS only, timeout-only) or bare process when Docker is unavailable — engine and any isolation gaps are reported in the result. " +
        "Use for: running agent-generated code safely, validating scripts before deployment, executing dynamic tests.",
      inputSchema: z.object({
        code: z.string().describe("Source code to execute"),
        language: z
          .enum(["javascript", "typescript", "python", "bash", "sh"])
          .describe("Language of the code"),
        stdin: z.string().optional().describe("Optional stdin to pipe into the process"),
        args: z
          .array(z.string())
          .optional()
          .describe("Optional command-line arguments passed to the script"),
        limits: z
          .object({
            timeoutMs: z
              .number()
              .int()
              .min(100)
              .max(120_000)
              .optional()
              .describe("Max execution time in ms (default 10000)"),
            memoryMb: z
              .number()
              .int()
              .min(16)
              .max(2048)
              .optional()
              .describe("Memory limit in MB (default 128, Docker only)"),
            cpus: z
              .number()
              .min(0.1)
              .max(4)
              .optional()
              .describe("CPU share limit (default 0.5, Docker only)"),
            networkAccess: z
              .boolean()
              .optional()
              .describe("Allow outbound network from sandbox (default false, Docker only)"),
          })
          .optional()
          .describe("Resource limits — memory/CPU/network only enforced in Docker engine"),
      }),
    },
    async (params) => {
      const result = await executeSandbox(params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "load_balance",
    {
      description: "Plan optimal execution order and parallelism for a set of agent tasks. " +
        "Analyzes dependencies, estimated cost (tokens), estimated time, failure risk, and result impact to produce a structured execution plan. " +
        "Returns ordered phases with parallelism decisions, critical path, time savings, and warnings. " +
        "Rules: never parallelize dependent tasks; parallelize independent tasks when time savings are significant; " +
        "run critical+high-risk tasks sequentially; minimize cost when time impact is low; " +
        "minimize time when tasks are independent and expensive; avoid pointless parallelism. " +
        "Use before orchestrating multi-agent workflows to minimize time and cost.",
      inputSchema: z.object({
        tasks: z
          .array(
            z.object({
              id: z.string().describe("Unique task identifier"),
              agentName: z.string().describe("Agent to execute this task"),
              query: z.string().describe("Query or instruction for the agent"),
              dependencies: z
                .array(z.string())
                .optional()
                .describe("IDs of tasks that must complete before this one starts"),
              estimatedCostTokens: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("Estimated token cost (default 500)"),
              estimatedTimeMs: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("Estimated execution time in ms (default 2000)"),
              failureRisk: z
                .number()
                .min(0)
                .max(1)
                .optional()
                .describe("Probability of failure 0–1 (default 0.1)"),
              resultImpact: z
                .number()
                .min(0)
                .max(1)
                .optional()
                .describe("How much this task affects the final result 0–1 (default 0.5)"),
              critical: z
                .boolean()
                .optional()
                .describe("If true, this task is on the critical path — sequential treatment when risk is high (default false)"),
              metadata: z
                .record(z.unknown())
                .optional()
                .describe("Optional metadata passed through to the agent"),
            })
          )
          .min(1)
          .describe("Tasks to schedule"),
      }),
    },
    async ({ tasks }) => {
      const plan = planExecution(tasks);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(plan, null, 2) }],
      };
    }
  );

  server.registerTool(
    "benchmark_versions",
    {
      description: "Benchmark and compare agent versions across multiple runs. Measures execution time (avg/p50/p95), memory delta, output length, token estimate, consistency across runs, keyword hit rate, and similarity to expected output. First version is the baseline; all others are diffed against it. Returns percentage deltas and human-readable verdicts like 'v2 is 23% slower but 10% more accurate'.",
      inputSchema: z.object({
        name: z.string().describe("Benchmark name"),
        versions: z
          .array(
            z.object({
              id: z.string().describe("Version identifier (e.g. 'v1', 'baseline', 'fast')"),
              agentName: z.string().describe("Agent name to execute"),
              query: z.string().describe("Query to send to the agent"),
              metadata: z.record(z.unknown()).optional().describe("Optional agent metadata"),
            })
          )
          .min(1)
          .describe("Versions to benchmark. First entry is the baseline for diffs."),
        runs: z.number().int().min(1).max(50).default(5).describe("Measured runs per version"),
        warmupRuns: z
          .number()
          .int()
          .min(0)
          .max(10)
          .default(1)
          .describe("Warmup runs discarded before measuring"),
        qualityKeywords: z
          .array(z.string())
          .optional()
          .describe("Keywords to look for in outputs — used for quality/accuracy scoring"),
        expectedOutput: z
          .string()
          .optional()
          .describe("Expected output text — Jaccard similarity used as quality score"),
      }),
    },
    async ({ name, versions, runs, warmupRuns, qualityKeywords, expectedOutput }) => {
      const report = await runBenchmark(
        (agentName, ctx) => orchestrator.executeAgent(agentName, ctx),
        { name, versions, runs, warmupRuns, qualityKeywords, expectedOutput }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
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
