# mcpServer HTTP API

This document describes the HTTP surface exposed by `mcpServer`.

Base URL examples:

- Local: `http://localhost:2999`
- Docker example: `http://localhost:3001`

## Overview

The server exposes four HTTP endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `ALL` | `/mcp` | MCP transport over Streamable HTTP |
| `GET` | `/agents` | Returns the list of registered agent templates |
| `GET` | `/events` | Opens a Server-Sent Events stream with server activity |
| `GET` | `/health` | Health check |

## `ALL /mcp`

This endpoint keeps the MCP protocol enabled over HTTP.

What it does:

1. Accepts MCP JSON-RPC requests over Streamable HTTP.
2. Creates and tracks MCP sessions using the `mcp-session-id` header.
3. Registers all current tools without changing their schemas or behavior.
4. Lets MCP clients initialize, discover tools, and call them over HTTP.

Behavior notes:

- A new MCP session starts with a `POST` initialize request.
- After initialization, the same session is reused through `mcp-session-id`.
- If the session is missing or invalid, the server returns a JSON-RPC error.
- Internal request failures also emit an SSE `error` event on `/events`.

This is not a REST endpoint. It is the protocol transport used by MCP-compatible clients.

## `GET /agents`

Returns a JSON array with all registered agent templates.

Response shape:

```json
[
  {
    "id": "debugger",
    "name": "debugger",
    "type": "agent",
    "description": "Especialista en depurar bugs, errores de compilacion, fallos de runtime y salidas de terminal. Analiza codigo, logs y stack traces; cuando hace falta, regenera el playbook de tests del proyecto.",
    "keywords": ["debug", "bug", "error", "stack", "trace"]
  }
]
```

Field meanings:

- `id`: current public identifier of the agent template.
- `name`: registered agent name.
- `type`: agent type, or `"agent"` when not explicitly declared.
- `description`: human-readable agent description.
- `keywords`: keywords used by orchestration and discovery.

Typical use cases:

- Build an agent catalog UI.
- Let clients browse available agent templates before calling tools through MCP.
- Cache lightweight agent metadata without invoking the MCP protocol.

## `GET /events`

Opens a Server-Sent Events stream (`text/event-stream`) with global server activity.

Current event types:

- `agent_started`
- `agent_completed`
- `error`
- `END`
- `presentation`

The minimum lifecycle events guaranteed by the server are:

1. `agent_started`
2. `agent_completed`
3. `error`
4. `END`

The stream is global:

- It is not filtered by `flowId`.
- Any agent execution handled by the server can appear in the stream.
- Heartbeats are sent periodically as SSE comments to keep the connection alive.

### SSE format

Each event is sent with standard SSE fields:

```text
id: agent_started:implicit-flow-123:debugger:1710000000000
event: agent_started
data: {"eventId":"agent_started:implicit-flow-123:debugger:1710000000000","type":"agent_started","timestamp":1710000000000,"payload":{"taskId":"implicit-flow-123:debugger:1710000000000","flowId":"implicit-flow-123","agentName":"debugger","startedAt":1710000000000,"query":"analyze failing test","metadata":{"projectRoot":"C:\\code\\project"}}}
```

### Event payloads

`agent_started` payload:

```json
{
  "taskId": "implicit-flow-123:debugger:1710000000000",
  "flowId": "implicit-flow-123",
  "agentName": "debugger",
  "startedAt": 1710000000000,
  "query": "analyze failing test",
  "metadata": {
    "projectRoot": "C:\\code\\project"
  }
}
```

`agent_completed` payload:

```json
{
  "taskId": "implicit-flow-123:debugger:1710000000000",
  "flowId": "implicit-flow-123",
  "agentName": "debugger",
  "startedAt": 1710000000000,
  "finishedAt": 1710000001200,
  "durationMs": 1200,
  "success": true,
  "messageExcerpt": "Debugger report generated..."
}
```

`error` payload:

```json
{
  "scope": "mcp_http",
  "message": "Error handling MCP request",
  "detail": "Internal server error"
}
```

`END` payload:

```json
{
  "reason": "SIGTERM"
}
```

`presentation` payload:

```json
{
  "presentationId": "pres-1710000002000",
  "agentId": "explainer",
  "agentName": "explainer",
  "agentType": "agent",
  "text": "Summary generated for the closed flow."
}
```

Connection notes:

- The server emits `END` before closing SSE clients during controlled shutdown.
- If the client disconnects first, no final event is guaranteed.
- The endpoint is read-only and does not accept request body parameters.

## `GET /health`

Returns a lightweight health payload.

Current response:

```json
{
  "ok": true,
  "sessions": 2
}
```

Field meanings:

- `ok`: server health flag.
- `sessions`: current number of active MCP HTTP sessions.

## Relationship between `/mcp` and the REST/SSE endpoints

The endpoints have different roles:

- `/mcp` is the MCP protocol transport used to initialize sessions and execute tools.
- `/agents` is a plain HTTP catalog endpoint.
- `/events` is a plain HTTP SSE monitoring endpoint.
- `/health` is a plain HTTP health endpoint.

Recommended client split:

- MCP-compatible clients should use `/mcp`.
- Browsers, dashboards, and custom UIs can use `/agents`, `/events`, and `/health`.
