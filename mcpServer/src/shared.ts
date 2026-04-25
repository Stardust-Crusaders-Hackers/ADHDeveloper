import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as path from "path";
import { fileURLToPath } from "url";
import { AgentRegistry } from "./registry/agentRegistry.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { PresentationEmitter } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SharedState {
  registry: AgentRegistry;
  orchestrator: Orchestrator;
  activeSessions: Map<string, McpServer>;
}

let _shared: SharedState | null = null;

export async function initSharedState(): Promise<SharedState> {
  if (_shared) return _shared;

  const registry = new AgentRegistry();
  const agentsDir = path.join(__dirname, "agents");
  await registry.discoverAgents(agentsDir);

  const activeSessions = new Map<string, McpServer>();

  const emitter: PresentationEmitter = (payload) => {
    broadcastNotification(
      activeSessions,
      "notifications/presentation",
      payload as unknown as Record<string, unknown>,
    );
  };

  const orchestrator = new Orchestrator(registry, emitter);

  _shared = { registry, orchestrator, activeSessions };
  return _shared;
}

function broadcastNotification(
  activeSessions: Map<string, McpServer>,
  method: string,
  params: Record<string, unknown>,
): void {
  const dead: string[] = [];
  for (const [id, server] of activeSessions) {
    try {
      void server.server.notification({ method, params });
    } catch {
      dead.push(id);
    }
  }
  dead.forEach((id) => activeSessions.delete(id));
}
