#!/usr/bin/env node
const { spawn } = require("node:child_process");

const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(cmd, ["-y", "adhdeveloper@latest"], { stdio: "inherit", shell: false });

child.on("error", (err) => {
  console.error("[adhd-developer] MCP launcher failed:", err);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => child.kill(sig));
