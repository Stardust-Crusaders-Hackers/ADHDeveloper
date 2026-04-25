import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AgentDefinition, AgentContext, AgentResult } from "../types.js";

const STATE_FILE = path.join(os.tmpdir(), "adhd-bridge-state.json");

function announceOnStage(message: string): void {
  try {
    let state: Record<string, unknown> = { agents: [], tasks: [], presentations: [] };
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
    if (!Array.isArray(state.agents)) state.agents = [];
    if (!Array.isArray(state.presentations)) state.presentations = [];

    const agentsList = state.agents as Array<Record<string, string>>;
    if (!agentsList.some((a) => a.id === "claude")) {
      agentsList.push({
        id: "claude",
        name: "Claude",
        type: "claude",
        description: "Anthropic AI — code assistant",
      });
    }

    (state.presentations as unknown[]).push({
      presentationId: `pres-claude-${Date.now()}`,
      agentId: "claude",
      text: message,
      status: "PENDING",
      createdAt: Date.now(),
    });

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (_) {}
}

const claudeAgent: AgentDefinition = {
  name: "claude",
  type: "claude",
  description: "Claude AI assistant — answers questions, explains code, reviews diffs, and helps debug.",
  keywords: ["explain", "review", "debug", "help", "question", "what", "why", "how", "claude", "assistant", "analyze"],

  async handler(ctx: AgentContext): Promise<AgentResult> {
    const query = ctx.query.trim();

    announceOnStage(`On it! Working on: "${query.length > 80 ? query.slice(0, 80) + "…" : query}"`);

    // Do actual work — simple echo + analysis for now
    const wordCount = query.split(/\s+/).length;
    const result = [
      `Query received: "${query}"`,
      `Word count: ${wordCount}`,
      `I'm Claude, your AI assistant. I've processed your request and I'm ready to help.`,
      `Use execute_agent with agentName "claude" to route tasks directly to me.`,
    ].join("\n");

    return {
      success: true,
      message: result,
      data: { query, wordCount },
    };
  },
};

export default claudeAgent;
