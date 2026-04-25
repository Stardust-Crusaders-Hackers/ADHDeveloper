import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { randomUUID } from "crypto";
import { SharedState } from "./shared.js";
import { registerAllTools } from "./tools/registerAllTools.js";

export function startSseServer(shared: SharedState, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());

    const transports = new Map<string, SSEServerTransport>();

    app.get("/sse", (_req, res) => {
      const sessionId = randomUUID();
      const transport = new SSEServerTransport(`/messages?sessionId=${sessionId}`, res);
      transports.set(sessionId, transport);

      const server = new McpServer({ name: "adhd-developer", version: "1.0.0" });
      registerAllTools(server, shared.orchestrator, shared.registry);
      shared.activeSessions.set(sessionId, server);

      res.on("close", () => {
        transports.delete(sessionId);
        shared.activeSessions.delete(sessionId);
      });

      server.connect(transport).catch(console.error);
    });

    app.post("/messages", async (req, res) => {
      const sessionId = req.query["sessionId"] as string;
      const transport = transports.get(sessionId);
      if (!transport) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      await transport.handlePostMessage(req, res);
    });

    app.get("/health", (_req, res) => {
      res.json({ ok: true, sessions: shared.activeSessions.size });
    });

    const httpServer = app.listen(port, () => {
      console.error(`[adhd-developer] SSE server on port ${port}`);
      resolve();
    });

    httpServer.on("error", reject);
  });
}
