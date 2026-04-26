import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { closeAllSseClients, emitServerEvent, SharedState } from "./shared.js";
import { registerAllTools } from "./tools/registerAllTools.js";
import { ServerEvent } from "./types.js";

export function startSseServer(shared: SharedState, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());

    const transports = new Map<string, StreamableHTTPServerTransport>();

    const getSessionId = (value: string | string[] | undefined): string | undefined => {
      if (Array.isArray(value)) return value[0];
      return value;
    };

    const writeSseEvent = (res: express.Response, event: ServerEvent) => {
      res.write(`id: ${event.eventId}\n`);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    app.all("/mcp", async (req, res) => {
      try {
        const sessionId = getSessionId(req.headers["mcp-session-id"]);
        let transport = sessionId ? transports.get(sessionId) : undefined;

        if (!transport) {
          if (req.method !== "POST" || !isInitializeRequest(req.body)) {
            res.status(400).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Bad Request: No valid session ID provided",
              },
              id: null,
            });
            return;
          }

          const server = new McpServer({ name: "adhd-developer", version: "1.0.0" });
          registerAllTools(server, shared.orchestrator, shared.registry);

          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              transports.set(newSessionId, transport!);
              shared.activeSessions.set(newSessionId, server);
            },
          });

          transport.onclose = () => {
            const closedSessionId = transport?.sessionId;
            if (!closedSessionId) return;
            transports.delete(closedSessionId);
            shared.activeSessions.delete(closedSessionId);
          };

          await server.connect(transport);
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        const detail = error instanceof Error ? error.message : String(error);
        emitServerEvent(shared, {
          eventId: `error:mcp:${Date.now()}`,
          type: "error",
          timestamp: Date.now(),
          payload: {
            scope: "mcp_http",
            message: "Error handling MCP request",
            detail,
          },
        });
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });

    app.get("/agents", (_req, res) => {
      res.json(shared.registry.getAgentSummaries());
    });

    app.get("/events", (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const clientId = randomUUID();
      const heartbeat = setInterval(() => {
        res.write(": keep-alive\n\n");
      }, 15000);

      shared.sseClients.set(clientId, {
        send: (event) => writeSseEvent(res, event),
        close: () => {
          clearInterval(heartbeat);
          if (!res.writableEnded) {
            res.end();
          }
        },
      });

      req.on("close", () => {
        clearInterval(heartbeat);
        shared.sseClients.delete(clientId);
      });
    });

    app.get("/health", (_req, res) => {
      res.json({ ok: true, sessions: shared.activeSessions.size });
    });

    const httpServer = app.listen(port, () => {
      console.error(`[adhd-developer] MCP HTTP server on port ${port}`);
      resolve();
    });

    const shutdown = (signal: string) => {
      closeAllSseClients(shared, signal);
      httpServer.close(() => {
        process.exit(0);
      });
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    httpServer.on("error", reject);
  });
}
