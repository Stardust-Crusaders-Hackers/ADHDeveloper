# IntelliJ Plugin — MCP Assistant

Overview

This directory contains a scaffold for an IntelliJ Platform plugin that integrates ADHDeveloper MCP features into JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, Rider, etc.). The plugin is intended to provide a compact IDE-native UI for interacting with MCP agents, viewing active flows, and running common workflows without leaving the editor.

Goals

- Provide a tool window to run agents and view suggestions.
- Detect available MCP servers in the workspace (local stdio, Docker-based, or external) and show connection status.
- Visualize active flows and step history with quick actions (re-run, open affected files, summarize results).

Current status

This is an initial scaffold. The repository currently contains design notes and a placeholder README. The plugin sources, build script, and metadata still need to be added.

Developer notes (how to start)

Prerequisites:
- Java JDK 17 or later
- Gradle (the Gradle wrapper is recommended)
- IntelliJ IDEA Ultimate or Community for development

Typical Gradle tasks (from the plugin directory):

Windows:

```
.\gradlew.bat runIde
```

macOS / Linux:

```
./gradlew runIde
```

Useful tasks:
- `runIde` — launch a sandboxed IDE instance with the plugin installed for development.
- `buildPlugin` — produce a distributable plugin ZIP.

Recommended implementation steps

1. Add `build.gradle.kts` and plugin metadata (`resources/META-INF/plugin.xml`).
2. Add Kotlin sources under `src/main/kotlin` and implement an `MCPBridgeService` to call core MCP actions (`execute_agent`, `flow_state`, `flow_get`).
3. Implement a simple Tool Window using the JetBrains UI DSL to show active flows, agent actions, and short-cuts.
4. Add tests and basic UI automation where appropriate.

Integration ideas

- Provide a small action to start/stop the Docker-based server when a project is opened.
- Offer quick templates for common flows (e.g., "Create plan.md and apply fixes").
- Attach flow results to editor diagnostics or quick-fix actions where relevant.

License

MIT
