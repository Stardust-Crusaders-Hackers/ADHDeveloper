# ADHDeveloper

MCP server to improve developers experience in a fun way.

---

## Docker (Recommended)

The server is published on Docker Hub as [`imaandrw/mcp-app`](https://hub.docker.com/r/imaandrw/mcp-app).

No Node.js or local install needed — pull and run.

### Pull the image

```bash
docker pull imaandrw/mcp-app:latest
```

### How it works

ADHDeveloper runs as a **stdio MCP server** inside the container. Your MCP client starts the container, communicates over stdin/stdout, and the container exits when the client disconnects.

The minimal run command is:

```bash
docker run -i --rm imaandrw/mcp-app:latest
```

- `-i` keeps stdin open (required for stdio transport)
- `--rm` removes the container on exit

---

## Client Configuration

### Claude Code

Add to `.claude/mcp.json` in your project root (or `~/.claude/mcp.json` for global):

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

### VS Code (Copilot / MCP extension)

Add to `.vscode/mcp.json`:

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

### Cursor

Add to `.cursor/mcp.json`:

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

### Windsurf / Codeium

Add to `.windsurf/mcp.json`:

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

---

## Available Tools

| Tool | Description |
|------|-------------|
| `orchestrate` | Route a task to the best-fit agent |
| `execute_agent` | Run a specific agent by name |
| `list_agents` | List all registered agents and capabilities |
| `sandbox_execute` | Run code in an isolated sandbox (JS, TS, Python, Bash) |
| `load_balance` | Plan parallel/sequential execution for multi-agent workflows |
| `benchmark_versions` | Compare agent versions across multiple runs |
| `repo_bootstrap` | Scaffold a new repo from structured requirements |
| `explain_subdirectories` | Generate per-directory architecture docs |
| `test_playbook` | Analyze and document the project test structure |
| `read_file_cached` | Read files with in-session cache to avoid redundant I/O |
| `cache_info` / `cache_invalidate` / `cache_clear` | Manage the context cache |
| `mcp_enable` / `mcp_disable` | Add or remove MCP config from a project |
| `flow_state` / `flow_get` | Inspect active multi-agent flow state |

## Agents

| Agent | Role |
|-------|------|
| `debugger` | Root-cause analysis and fix suggestions |
| `smoke-tester` | Quick sanity checks on code or endpoints |
| `security-auditor` | Static analysis, secrets scanning, dependency audit |
| `git-maintainer` | PR analysis, merge strategy, conflict resolution |
| `code-reviewer` | Code quality and best-practice review |
| `planner` | Break tasks into structured execution plans |
| `focus-timer` | ADHD-friendly time-boxing and focus sessions |
| `mood` | Developer mood tracking and encouragement |
| `documenter` | Generate and update project documentation |
| `explainer` | Plain-language code and concept explanations |
| `database-expert` | Query optimization and schema advice |
| `repo-initializer` | Bootstrap new projects |
| `cicd` | CI/CD pipeline guidance |
| `docker` | Dockerfile and Compose advice |
| `kubernetes` | K8s manifest and deployment help |
| `claude` | General-purpose Claude agent |

---

## Local Development

```bash
cd mcpServer
npm install
npm run build
node dist/index.js
```

Requires Node.js >= 22.

---

## License

MIT
