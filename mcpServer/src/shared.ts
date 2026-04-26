import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as path from "path";
import { fileURLToPath } from "url";
import { AgentRegistry } from "./registry/agentRegistry.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { PresentationPayload, ServerEvent, ServerEventEmitter } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SseClient {
  send: (event: ServerEvent) => void;
  close: () => void;
}

export interface SharedState {
  registry: AgentRegistry;
  orchestrator: Orchestrator;
  activeSessions: Map<string, McpServer>;
  sseClients: Map<string, SseClient>;
}

let _shared: SharedState | null = null;

export async function initSharedState(): Promise<SharedState> {
  if (_shared) return _shared;

  const registry = new AgentRegistry();
  const agentsDir = path.join(__dirname, "agents");
  await registry.discoverAgents(agentsDir);

  const activeSessions = new Map<string, McpServer>();
  const sseClients = new Map<string, SseClient>();

  const emitter: ServerEventEmitter = (event) => {
    if (event.type === "presentation") {
      broadcastNotification(
        activeSessions,
        "notifications/presentation",
        event.payload as unknown as Record<string, unknown>,
      );
    }
    broadcastNotification(activeSessions, "notifications/server_event", event as unknown as Record<string, unknown>);
    broadcastSseEvent(sseClients, event);
  };

  const orchestrator = new Orchestrator(registry, emitter);

  _shared = { registry, orchestrator, activeSessions, sseClients };
  return _shared;
}

export function emitPresentation(shared: SharedState, payload: PresentationPayload): void {
  const now = Date.now();
  emitServerEvent(shared, {
    eventId: payload.presentationId || `presentation:${now}`,
    type: "presentation",
    timestamp: now,
    payload,
  });
}

export function emitServerEvent(shared: SharedState, event: ServerEvent): void {
  if (event.type === "presentation") {
    broadcastNotification(
      shared.activeSessions,
      "notifications/presentation",
      event.payload as unknown as Record<string, unknown>,
    );
  }
  broadcastNotification(
    shared.activeSessions,
    "notifications/server_event",
    event as unknown as Record<string, unknown>,
  );
  broadcastSseEvent(shared.sseClients, event);
}

export function closeAllSseClients(shared: SharedState, reason: string): void {
  const endEvent: ServerEvent = {
    eventId: `end:${Date.now()}`,
    type: "END",
    timestamp: Date.now(),
    payload: { reason },
  };
  broadcastSseEvent(shared.sseClients, endEvent);
  for (const [id, client] of shared.sseClients) {
    try {
      client.close();
    } catch {
      // Ignore close failures and keep shutdown best-effort.
    }
    shared.sseClients.delete(id);
  }
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

function broadcastSseEvent(
  sseClients: Map<string, SseClient>,
  event: ServerEvent,
): void {
  const dead: string[] = [];
  for (const [id, client] of sseClients) {
    try {
      client.send(event);
    } catch {
      dead.push(id);
    }
  }
  dead.forEach((id) => sseClients.delete(id));
}
