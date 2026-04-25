import { AgentDefinition, AgentContext, AgentResult } from "../types.js";

const claudeAgent: AgentDefinition = {
  name: "claude",
  type: "claude",
  description: "Claude AI assistant — answers questions, explains code, reviews diffs, and helps debug.",
  keywords: ["explain", "review", "debug", "help", "question", "what", "why", "how", "claude", "assistant", "analyze"],

  async handler(ctx: AgentContext): Promise<AgentResult> {
    const query = ctx.query.trim();

    ctx.emit?.({
      presentationId: `pres-claude-${Date.now()}`,
      agentId: "claude",
      agentName: "Claude",
      agentType: "claude",
      text: `On it! Working on: "${query.length > 80 ? query.slice(0, 80) + "…" : query}"`,
    });

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
