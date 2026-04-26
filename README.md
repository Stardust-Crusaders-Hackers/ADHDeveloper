# ADHDeveloper

ADHDeveloper is an MCP (Model Connector Protocol) server and toolkit focused on ADHD-friendly developer workflows: concise planning, short focused sessions, mood-aware guidance, and quality/safety checks. The repository contains the MCP server implementation, integration examples for popular AI-enabled editors, and a scaffold for an IntelliJ plugin.

Repository layout

- mcpServer/ — The core Node.js MCP server: agents, tools, flows, and a published Docker image (`imaandrw/mcp-app`). See `mcpServer/README.md` for full runtime and developer documentation.
- intelliJPlugin/ — IntelliJ Platform plugin scaffold (work in progress) to integrate MCP features into JetBrains IDEs.

Quickstart (Docker — recommended)

No local Node.js install is required to run the server. Pull and run the official Docker image:

```bash
docker pull imaandrw/mcp-app:latest
docker run -i --rm imaandrw/mcp-app:latest
```

Notes:
- The server communicates over stdio (stdin/stdout). Your MCP-capable client should start the container so it can connect to the server.
- `-i` keeps stdin open (required for stdio transport); `--rm` removes the container when it exits.

Client configuration examples

Claude Code (project or global `.claude/mcp.json`):

```json
{
  "servers": {
    "adhd-developer": {
      "type": "stdio",
      "command": "docker",
      "args": ["run", "-i", "--rm", "imaandrw/mcp-app:latest"]
    }
  }
}
```

VS Code (store in `.vscode/mcp.json`):

```json
{
  "servers": {
    "adhd-developer": {
      "type": "stdio",
      "command": "docker",
      "args": ["run", "-i", "--rm", "imaandrw/mcp-app:latest"]
    }
  }
}
```

Cursor (add to `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "adhd-developer": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "imaandrw/mcp-app:latest"]
    }
  }
}
```

Project-level automated setup (npx)

From a project root you can run the helper that configures common clients for you. This places minimal MCP config files in the project so supported clients can launch the server automatically:

```bash
npx -y adhdeveloper enable
# To remove the integration
npx -y adhdeveloper disable
```

This helper may configure the following (where supported): Claude Code, Cursor, VS Code (Copilot/MCP extension), Gemini CLI, OpenAI Codex, Junie, GitHub Copilot CLI.

Local development (server)

Requirements: Node.js >= 22

```bash
cd mcpServer
npm install
npm run build
node dist/index.js
```

If you want to contribute or run the server locally, see `mcpServer/README.md` for full developer instructions and the detailed tools/agents reference.

Contributing

Contributions are welcome. Please open an issue to discuss large changes before sending a pull request. Include tests and clear descriptions when adding or changing agent behavior.

License

MIT
