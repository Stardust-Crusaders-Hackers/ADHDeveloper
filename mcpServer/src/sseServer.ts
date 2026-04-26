import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { SharedState } from "./shared.js";
import { registerAllTools } from "./tools/registerAllTools.js";

export function startSseServer(shared: SharedState, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());

    const transports = new Map<string, StreamableHTTPServerTransport>();

    const getSessionId = (value: string | string[] | undefined): string | undefined => {
      if (Array.isArray(value)) return value[0];
      return value;
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

    app.get("/health", (_req, res) => {
      res.json({ ok: true, sessions: shared.activeSessions.size });
    });

    const httpServer = app.listen(port, () => {
      console.error(`[adhd-developer] MCP HTTP server on port ${port}`);
      resolve();
    });

    httpServer.on("error", reject);
  });
}
